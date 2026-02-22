import { useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, PanResponder } from "react-native";
import { StatusBar } from "expo-status-bar";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import Svg, { Line } from "react-native-svg";
import * as Haptics from "expo-haptics";
import { useAuth } from "../../context/AuthContext";
import { useProgress } from "../../context/ProgressContext";
import MaterialPicker from "../../components/MaterialPicker";
import { useTheme } from "../../context/ThemeContext";

type NodeType = "stem" | "fact" | "subfact" | "procedure" | "distractor";

type RouterNode = {
    id: string;
    text: string;
    type: NodeType;
    materialId?: string;
    answer?: string;
    sourceType?: "fact" | "procedure";
};

type Connection = { fromId: string; toId: string };

type NodePosition = { x: number; y: number; width: number; height: number };

const MAX_LIVES = 5;
const TARGET_RADIUS = 38;

export default function AnalyzeScreen() {
    const { user } = useAuth();
    const router = useRouter();
    const { materialId } = useLocalSearchParams<{ materialId?: string }>();
    const { state, addToCompost, completeStage } = useProgress();
    const { isDark, colors } = useTheme();
    const materialKeys = Object.keys(state.materials);
    const [selectedId, setSelectedId] = useState(materialId ?? materialKeys[0] ?? "");
    const activeId = materialId ?? selectedId;

    if (!user) return <Redirect href="/login" />;

    const material = activeId ? state.materials[activeId] : undefined;
    const concept = material?.matrix?.concepts?.[0];
    const facts = material?.matrix?.facts ?? [];
    const procedures = material?.matrix?.procedures ?? [];

    const containerRef = useRef<View>(null);
    const containerOffset = useRef({ x: 0, y: 0 });
    const nodePositions = useRef<Record<string, NodePosition>>({});
    const nodeRefs = useRef<Record<string, View | null>>({});

    const { nodes, requiredConnections } = useMemo(() => {
        if (!concept) return { nodes: [] as RouterNode[], requiredConnections: [] as Connection[] };

        const relevantFactIds = new Set(concept.fact_ids);
        const relevantFacts = facts.filter((f) => relevantFactIds.has(f.id));
        const relatedProcedures = procedures.filter((p) => p.concept_ids.includes(concept.id));

        const stemNode: RouterNode = { id: "stem", text: concept.name, type: "stem", materialId };
        const nodeList: RouterNode[] = [stemNode];
        const connections: Connection[] = [];

        relevantFacts.forEach((fact) => {
            const factNodeId = `fact_${fact.id}`;
            const subNodeId = `sub_${fact.id}`;
            nodeList.push({ id: factNodeId, text: fact.term, type: "fact", materialId, answer: fact.definition, sourceType: "fact" });
            nodeList.push({ id: subNodeId, text: fact.definition, type: "subfact", materialId, answer: fact.term, sourceType: "fact" });
            connections.push({ fromId: "stem", toId: factNodeId });
            connections.push({ fromId: factNodeId, toId: subNodeId });
        });

        relatedProcedures.forEach((proc) => {
            proc.steps.slice(0, 2).forEach((step, idx) => {
                const procNodeId = `proc_${proc.id}_${idx}`;
                nodeList.push({ id: procNodeId, text: step, type: "procedure", materialId, answer: proc.name, sourceType: "procedure" });
                connections.push({ fromId: "stem", toId: procNodeId });
            });
        });

        const otherFacts: RouterNode[] = [];
        const otherProcedures: RouterNode[] = [];
        Object.entries(state.materials).forEach(([otherId, otherMaterial]) => {
            if (otherId === materialId) return;
            otherMaterial.matrix?.facts?.slice(0, 2).forEach((f) => {
                otherFacts.push({ id: `distractor_fact_${otherId}_${f.id}`, text: f.term, type: "distractor", materialId: otherId, answer: f.definition, sourceType: "fact" });
            });
            otherMaterial.matrix?.procedures?.slice(0, 1).forEach((p) => {
                const step = p.steps[0];
                if (step) {
                    otherProcedures.push({ id: `distractor_proc_${otherId}_${p.id}`, text: step, type: "distractor", materialId: otherId, answer: p.name, sourceType: "procedure" });
                }
            });
        });

        nodeList.push(...otherFacts.slice(0, 3), ...otherProcedures.slice(0, 2));

        return { nodes: nodeList, requiredConnections: connections };
    }, [concept, facts, procedures, state.materials, materialId]);

    const [connections, setConnections] = useState<Connection[]>([]);
    const [correctSet, setCorrectSet] = useState<Set<string>>(new Set());
    const [lives, setLives] = useState(MAX_LIVES);
    const [attempts, setAttempts] = useState(0);
    const [correct, setCorrect] = useState(0);
    const [combo, setCombo] = useState(0);
    const [maxCombo, setMaxCombo] = useState(0);
    const [phase, setPhase] = useState<"play" | "complete" | "gameover">("play");
    const [drag, setDrag] = useState<{ fromId: string; x: number; y: number } | null>(null);
    const gameStartTime = useRef(Date.now());

    const requiredSet = useMemo(() => new Set(requiredConnections.map((c) => `${c.fromId}->${c.toId}`)), [requiredConnections]);

    const onContainerLayout = () => {
        containerRef.current?.measureInWindow((x, y) => {
            containerOffset.current = { x, y };
        });
    };

    const registerNode = (id: string) => (ref: View | null) => {
        nodeRefs.current[id] = ref;
    };

    const onNodeLayout = (id: string) => () => {
        const ref = nodeRefs.current[id];
        if (!ref) return;
        ref.measureInWindow((x, y, width, height) => {
            nodePositions.current[id] = { x: x + width / 2, y: y + height / 2, width, height };
        });
    };

    const toLocal = (point: { x: number; y: number }) => {
        return { x: point.x - containerOffset.current.x, y: point.y - containerOffset.current.y };
    };

    const getNodePoint = (id: string) => {
        const pos = nodePositions.current[id];
        if (!pos) return null;
        return toLocal({ x: pos.x, y: pos.y });
    };

    const findTarget = (x: number, y: number, fromId: string) => {
        const entries = Object.entries(nodePositions.current);
        for (const [id, pos] of entries) {
            if (id === fromId) continue;
            const dx = pos.x - x;
            const dy = pos.y - y;
            if (Math.sqrt(dx * dx + dy * dy) <= TARGET_RADIUS) {
                return id;
            }
        }
        return null;
    };

    const handleConnection = (fromId: string, toId: string) => {
        const key = `${fromId}->${toId}`;
        setAttempts((prev) => prev + 1);

        if (requiredSet.has(key) && !correctSet.has(key)) {
            const nextCorrect = correct + 1;
            const nextCombo = combo + 1;
            setCorrect(nextCorrect);
            setCombo(nextCombo);
            setMaxCombo(Math.max(maxCombo, nextCombo));
            setCorrectSet((prev) => new Set([...Array.from(prev), key]));
            setConnections((prev) => [...prev, { fromId, toId }]);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

            if (nextCorrect >= requiredConnections.length) {
                const accuracy = nextCorrect / (attempts + 1);
                completeStage(activeId, "analyze", accuracy, Math.max(maxCombo, nextCombo), gameStartTime.current);
                setPhase("complete");
            }
            return;
        }

        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setCombo(0);
        const nextLives = lives - 1;
        setLives(nextLives);

        const targetNode = nodes.find((n) => n.id === toId);
        if (targetNode && targetNode.type === "distractor" && targetNode.materialId) {
            addToCompost({
                id: targetNode.id,
                materialId: targetNode.materialId,
                question: targetNode.text,
                answer: targetNode.answer ?? targetNode.text,
                type: targetNode.sourceType ?? "fact",
            });
        }

        if (nextLives <= 0) {
            setPhase("gameover");
        }
    };

    if (!activeId) {
        return (
            <View style={[s.container, { backgroundColor: colors.background }]}>
                <StatusBar style={isDark ? "light" : "dark"} />
                <View style={s.center}>
                    <Text style={s.title}>Root Router</Text>
                    <MaterialPicker
                        materials={state.materials}
                        selectedId={selectedId}
                        onSelect={setSelectedId}
                        title="Choose Material"
                    />
                    <Text style={s.sub}>Select a material to start.</Text>
                    <TouchableOpacity style={s.btn} onPress={() => router.back()}>
                        <Text style={s.btnText}>Return</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    }

    if (!material || !concept || nodes.length === 0 || requiredConnections.length === 0) {
        return (
            <View style={[s.container, { backgroundColor: colors.background }]}>
                <StatusBar style={isDark ? "light" : "dark"} />
                <View style={s.center}>
                    <Text style={s.title}>Root Router</Text>
                    <Text style={s.sub}>Not enough material to analyze.</Text>
                    <TouchableOpacity style={s.btn} onPress={() => router.back()}>
                        <Text style={s.btnText}>Return</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    }

    if (phase === "complete") {
        return (
            <View style={[s.container, { backgroundColor: colors.background }]}>
                <StatusBar style={isDark ? "light" : "dark"} />
                <View style={s.center}>
                    <Text style={s.bigEmoji}>🌿</Text>
                    <Text style={s.title}>Roots Connected!</Text>
                    <Text style={s.sub}>System complete with {correct} connections.</Text>
                    <TouchableOpacity style={s.btn} onPress={() => router.back()}>
                        <Text style={s.btnText}>Return</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    }

    if (phase === "gameover") {
        return (
            <View style={[s.container, { backgroundColor: colors.background }]}>
                <StatusBar style={isDark ? "light" : "dark"} />
                <View style={s.center}>
                    <Text style={s.bigEmoji}>🥀</Text>
                    <Text style={s.title}>Roots Severed</Text>
                    <Text style={s.sub}>Try again when you are ready.</Text>
                    <TouchableOpacity style={s.btn} onPress={() => router.back()}>
                        <Text style={s.btnText}>Return</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    }

    return (
        <View style={s.container} ref={containerRef} onLayout={onContainerLayout}>
            <StatusBar style="dark" />
            <View style={s.header}>
                <TouchableOpacity onPress={() => router.back()}>
                    <Text style={s.back}>← Exit</Text>
                </TouchableOpacity>
                <Text style={s.tag}>Root Router</Text>
                <Text style={s.lives}>{"❤️".repeat(lives)}{"🖤".repeat(MAX_LIVES - lives)}</Text>
            </View>

            <Text style={s.prompt}>Connect the stem to its nutrients and link sub-facts.</Text>

            <View style={[s.canvas, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Svg style={StyleSheet.absoluteFill}>
                    {connections.map((conn) => {
                        const from = getNodePoint(conn.fromId);
                        const to = getNodePoint(conn.toId);
                        if (!from || !to) return null;
                        return (
                            <Line
                                key={`${conn.fromId}_${conn.toId}`}
                                x1={from.x}
                                y1={from.y}
                                x2={to.x}
                                y2={to.y}
                                stroke="#7DB58D"
                                strokeWidth={3}
                            />
                        );
                    })}
                    {drag && (() => {
                        const from = getNodePoint(drag.fromId);
                        if (!from) return null;
                        const local = toLocal({ x: drag.x, y: drag.y });
                        return (
                            <Line
                                x1={from.x}
                                y1={from.y}
                                x2={local.x}
                                y2={local.y}
                                stroke="#B0B0B0"
                                strokeWidth={2}
                            />
                        );
                    })()}
                </Svg>

                <View style={s.nodeGrid}>
                    {nodes.map((node) => {
                        const responder = PanResponder.create({
                            onStartShouldSetPanResponder: () => true,
                            onPanResponderGrant: (_, gesture) => {
                                setDrag({ fromId: node.id, x: gesture.x0, y: gesture.y0 });
                            },
                            onPanResponderMove: (_, gesture) => {
                                setDrag((prev) => (prev ? { ...prev, x: gesture.moveX, y: gesture.moveY } : null));
                            },
                            onPanResponderRelease: (_, gesture) => {
                                const targetId = findTarget(gesture.moveX, gesture.moveY, node.id);
                                if (targetId) {
                                    handleConnection(node.id, targetId);
                                }
                                setDrag(null);
                            },
                        });

                        return (
                            <View
                                key={node.id}
                                ref={registerNode(node.id)}
                                onLayout={onNodeLayout(node.id)}
                                {...responder.panHandlers}
                                style={[
                                    s.node,
                                    isDark && { backgroundColor: colors.card, borderColor: colors.border },
                                    node.type === "stem" && s.nodeStem,
                                    node.type === "stem" && isDark && { backgroundColor: colors.accent, borderColor: colors.accent },
                                    node.type === "subfact" && s.nodeSub,
                                    node.type === "subfact" && isDark && { backgroundColor: colors.accentSoft, borderColor: colors.accent },
                                    node.type === "distractor" && s.nodeWeed,
                                    node.type === "distractor" && isDark && { backgroundColor: colors.dangerSoft, borderColor: colors.danger },
                                ]}
                            >
                                <Text style={s.nodeText}>{node.text}</Text>
                            </View>
                        );
                    })}
                </View>
            </View>
        </View>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, paddingHorizontal: 20, paddingTop: 56, paddingBottom: 24 },
    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
    back: { fontSize: 14, color: "#7DB58D", fontWeight: "600" },
    tag: { fontSize: 13, fontWeight: "800", color: "#5D4037" },
    lives: { fontSize: 14 },
    prompt: { fontSize: 13, color: "#9E9E9E", marginBottom: 12 },

    canvas: { flex: 1, borderRadius: 16, padding: 12, borderWidth: 1 },
    nodeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "center" },
    node: { backgroundColor: "#F1F8F5", borderRadius: 14, paddingVertical: 8, paddingHorizontal: 12, borderWidth: 1.5, borderColor: "#7DB58D" },
    nodeStem: { backgroundColor: "#7DB58D", borderColor: "#5B8F6C" },
    nodeSub: { backgroundColor: "#FFF8E1", borderColor: "#FFD54F" },
    nodeWeed: { backgroundColor: "#FFEBEE", borderColor: "#EF5350" },
    nodeText: { fontSize: 12, fontWeight: "700", color: "#4A4A4A", textAlign: "center", maxWidth: 140 },

    center: { flex: 1, justifyContent: "center", alignItems: "center" },
    bigEmoji: { fontSize: 56, marginBottom: 10 },
    title: { fontSize: 22, fontWeight: "700", color: "#4A4A4A", marginBottom: 8 },
    sub: { fontSize: 14, color: "#9E9E9E", textAlign: "center", marginBottom: 16 },
    btn: { backgroundColor: "#7DB58D", borderRadius: 14, paddingVertical: 12, paddingHorizontal: 24 },
    btnText: { color: "#FFFFFF", fontWeight: "700" },
});
