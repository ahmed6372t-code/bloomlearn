import { useMemo, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { StatusBar } from "expo-status-bar";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useAuth } from "../../context/AuthContext";
import { useProgress } from "../../context/ProgressContext";
import MaterialPicker from "../../components/MaterialPicker";
import type { PlausibleFlaw } from "../../lib/gemini";
import { useTheme } from "../../context/ThemeContext";

const MAX_LIVES = 5;

type Round = {
    id: string;
    conceptId: string;
    left: string;
    right: string;
    flawedStatement: string;
    flawedSpan: string;
    isInvasive: boolean;
    flawedSide: "left" | "right";
};

function normalize(text: string) {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, "").trim();
}

export default function EvaluateScreen() {
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
    const concepts = material?.matrix?.concepts ?? [];
    const facts = material?.matrix?.facts ?? [];
    const flaws = (material?.matrix?.plausible_flaws ?? []) as PlausibleFlaw[];

    const rounds = useMemo(() => {
        if (!material) return [] as Round[];

        const list: Round[] = [];
        concepts.forEach((concept) => {
            const relatedFact = facts.find((f) => concept.fact_ids.includes(f.id));
            const trueStatement = concept.explanation || concept.name;
            const supporting = relatedFact?.definition ?? relatedFact?.term ?? concept.name;

            const flaw = flaws.find((f) => f.concept_id === concept.id);
            const flawedStatement = flaw?.flawed_statement ?? `${trueStatement} always leads to ${concept.name}.`;
            const flawedSpan = flaw?.flawed_span ?? "always";

            const invasiveLeft = Math.random() > 0.5;
            list.push({
                id: `${concept.id}_invasive`,
                conceptId: concept.id,
                left: invasiveLeft ? flawedStatement : trueStatement,
                right: invasiveLeft ? trueStatement : flawedStatement,
                flawedStatement,
                flawedSpan,
                isInvasive: true,
                flawedSide: invasiveLeft ? "left" : "right",
            });

            const companionLeft = Math.random() > 0.5;
            list.push({
                id: `${concept.id}_companion`,
                conceptId: concept.id,
                left: companionLeft ? trueStatement : supporting,
                right: companionLeft ? supporting : trueStatement,
                flawedStatement: "",
                flawedSpan: "",
                isInvasive: false,
                flawedSide: "left",
            });
        });

        return list.sort(() => Math.random() - 0.5).slice(0, 6);
    }, [concepts, facts, flaws, material]);

    const [phase, setPhase] = useState<"decide" | "prune" | "complete" | "gameover">("decide");
    const gameStartTime = useState(() => Date.now())[0];
    const [index, setIndex] = useState(0);
    const [lives, setLives] = useState(MAX_LIVES);
    const [correct, setCorrect] = useState(0);
    const [attempts, setAttempts] = useState(0);
    const [combo, setCombo] = useState(0);
    const [maxCombo, setMaxCombo] = useState(0);

    const current = rounds[index];

    const advance = (nextCorrect: number, nextAttempts: number) => {
        if (index + 1 >= rounds.length) {
            const accuracy = nextAttempts === 0 ? 0 : nextCorrect / nextAttempts;
            completeStage(activeId, "evaluate", accuracy, maxCombo, gameStartTime);
            setPhase("complete");
        } else {
            setIndex((prev) => prev + 1);
            setPhase("decide");
        }
    };

    const handleDecision = (choice: "companion" | "invasive") => {
        if (!current) return;
        const nextAttempts = attempts + 1;
        setAttempts(nextAttempts);

        if (current.isInvasive) {
            if (choice === "invasive") {
                setPhase("prune");
                return;
            }
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            setCombo(0);
            const nextLives = lives - 1;
            setLives(nextLives);
            if (activeId) {
                addToCompost({
                    id: `${current.id}_missed`,
                    materialId: activeId,
                    question: current.flawedStatement,
                    answer: current.flawedSpan || current.flawedStatement,
                    type: "fact",
                });
            }
            if (nextLives <= 0) {
                setPhase("gameover");
            } else {
                advance(correct, nextAttempts);
            }
            return;
        }

        if (choice === "companion") {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            const nextCombo = combo + 1;
            setCombo(nextCombo);
            setMaxCombo(Math.max(maxCombo, nextCombo));
            const nextCorrect = correct + 1;
            setCorrect(nextCorrect);
            advance(nextCorrect, nextAttempts);
            return;
        }

        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setCombo(0);
        const nextLives = lives - 1;
        setLives(nextLives);
        if (nextLives <= 0) {
            setPhase("gameover");
        } else {
            advance(correct, nextAttempts);
        }
    };

    const tokens = useMemo(() => {
        if (!current?.flawedStatement) return [] as string[];
        return current.flawedStatement.split(/\s+/);
    }, [current]);

    const handlePrune = (token: string) => {
        if (!current) return;
        const nextAttempts = attempts + 1;
        setAttempts(nextAttempts);
        const tokenMatch = normalize(token);
        const spanMatch = normalize(current.flawedSpan);
        const isCorrect = spanMatch.length > 0 && spanMatch.includes(tokenMatch);

        if (isCorrect) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            const nextCombo = combo + 1;
            setCombo(nextCombo);
            setMaxCombo(Math.max(maxCombo, nextCombo));
            const nextCorrect = correct + 1;
            setCorrect(nextCorrect);
            advance(nextCorrect, nextAttempts);
            return;
        }

        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setCombo(0);
        const nextLives = lives - 1;
        setLives(nextLives);
        if (activeId) {
            addToCompost({
                id: `${current.id}_prune`,
                materialId: activeId,
                question: current.flawedStatement,
                answer: current.flawedSpan || current.flawedStatement,
                type: "fact",
            });
        }
        if (nextLives <= 0) {
            setPhase("gameover");
        } else {
            advance(correct, nextAttempts);
        }
    };

    if (!activeId) {
        return (
            <View style={[s.container, { backgroundColor: colors.background }]}>
                <StatusBar style={isDark ? "light" : "dark"} />
                <View style={s.center}>
                    <Text style={s.title}>Companion Planting</Text>
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

    if (!material || rounds.length === 0) {
        return (
            <View style={[s.container, { backgroundColor: colors.background }]}>
                <StatusBar style={isDark ? "light" : "dark"} />
                <View style={s.center}>
                    <Text style={s.title}>Companion Planting</Text>
                    <Text style={s.sub}>Not enough concepts to evaluate.</Text>
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
                    <Text style={s.bigEmoji}>🌼</Text>
                    <Text style={s.title}>Garden Balanced</Text>
                    <Text style={s.sub}>You evaluated {correct} pairings.</Text>
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
                    <Text style={s.title}>Garden Overgrown</Text>
                    <Text style={s.sub}>Come back for another evaluation.</Text>
                    <TouchableOpacity style={s.btn} onPress={() => router.back()}>
                        <Text style={s.btnText}>Return</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    }

    return (
        <View style={[s.container, { backgroundColor: colors.background }]}>
            <StatusBar style={isDark ? "light" : "dark"} />
            <View style={s.header}>
                <TouchableOpacity onPress={() => router.back()}>
                    <Text style={s.back}>← Exit</Text>
                </TouchableOpacity>
                <Text style={s.tag}>Companion Planting</Text>
                <Text style={s.lives}>{"❤️".repeat(lives)}{"🖤".repeat(MAX_LIVES - lives)}</Text>
            </View>

            <Text style={s.prompt}>Are these statements companions or invasive?</Text>

            <View style={s.pairBox}>
                <View style={[s.statementCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                >
                    <Text style={s.statementLabel}>A</Text>
                    <Text style={s.statementText}>{current.left}</Text>
                </View>
                <View style={[s.statementCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                >
                    <Text style={s.statementLabel}>B</Text>
                    <Text style={s.statementText}>{current.right}</Text>
                </View>
            </View>

            {phase === "decide" && (
                <View style={s.actions}>
                    <TouchableOpacity style={s.btnSafe} onPress={() => handleDecision("companion")}>
                        <Text style={s.btnSafeText}>Companions</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.btnDanger} onPress={() => handleDecision("invasive")}>
                        <Text style={s.btnDangerText}>Invasive</Text>
                    </TouchableOpacity>
                </View>
            )}

            {phase === "prune" && (
                <View style={s.pruneBox}>
                    <Text style={s.prunePrompt}>Tap the incorrect word or phrase.</Text>
                    <View style={s.tokens}>
                        {tokens.map((token, idx) => (
                            <TouchableOpacity key={`${token}_${idx}`} style={s.token} onPress={() => handlePrune(token)}>
                                <Text style={s.tokenText}>{token}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>
            )}

            <Text style={s.progress}>Pair {index + 1}/{rounds.length}</Text>
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
    pairBox: { gap: 12 },
    statementCard: { borderRadius: 14, padding: 14, borderWidth: 1 },
    statementLabel: { fontSize: 11, fontWeight: "800", color: "#7DB58D", marginBottom: 6 },
    statementText: { fontSize: 14, fontWeight: "600", color: "#4A4A4A" },

    actions: { marginTop: 16, gap: 10 },
    btnSafe: { backgroundColor: "#7DB58D", borderRadius: 12, paddingVertical: 12, alignItems: "center" },
    btnSafeText: { color: "#FFFFFF", fontWeight: "700" },
    btnDanger: { backgroundColor: "#FFEBEE", borderRadius: 12, paddingVertical: 12, alignItems: "center", borderWidth: 1, borderColor: "#EF5350" },
    btnDangerText: { color: "#D32F2F", fontWeight: "700" },

    pruneBox: { marginTop: 16 },
    prunePrompt: { fontSize: 12, color: "#9E9E9E", marginBottom: 8 },
    tokens: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
    token: { backgroundColor: "#F1F8F5", borderRadius: 10, paddingVertical: 6, paddingHorizontal: 8, borderWidth: 1, borderColor: "#7DB58D" },
    tokenText: { fontSize: 12, fontWeight: "700", color: "#5D4037" },

    progress: { marginTop: 16, textAlign: "center", color: "#9E9E9E", fontWeight: "600" },

    center: { flex: 1, justifyContent: "center", alignItems: "center" },
    bigEmoji: { fontSize: 56, marginBottom: 10 },
    title: { fontSize: 22, fontWeight: "700", color: "#4A4A4A", marginBottom: 8 },
    sub: { fontSize: 14, color: "#9E9E9E", textAlign: "center", marginBottom: 16 },
    btn: { backgroundColor: "#7DB58D", borderRadius: 14, paddingVertical: 12, paddingHorizontal: 24 },
    btnText: { color: "#FFFFFF", fontWeight: "700" },
});
