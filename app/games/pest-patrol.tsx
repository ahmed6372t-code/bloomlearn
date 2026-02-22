import { useMemo, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { StatusBar } from "expo-status-bar";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useAuth } from "../../context/AuthContext";
import { useProgress } from "../../context/ProgressContext";
import MaterialPicker from "../../components/MaterialPicker";
import type { FalseFact } from "../../lib/gemini";
import { useTheme } from "../../context/ThemeContext";

const MAX_LIVES = 5;
const ROUND_COUNT = 12;

type PatrolItem = {
    id: string;
    text: string;
    isFalse: boolean;
    factId?: string;
    answer?: string;
};

export default function PestPatrolScreen() {
    const { user } = useAuth();
    const router = useRouter();
    const { materialId } = useLocalSearchParams<{ materialId?: string }>();
    const { state, addToCompost, addWaterDrops, incrementPestsSwatted } = useProgress();
    const { isDark, colors } = useTheme();
    const materialKeys = Object.keys(state.materials);
    const [selectedId, setSelectedId] = useState(materialId ?? materialKeys[0] ?? "");
    const activeId = materialId ?? selectedId;

    if (!user) return <Redirect href="/login" />;

    const material = activeId ? state.materials[activeId] : undefined;
    const facts = material?.matrix?.facts ?? [];
    const falseFacts = (material?.matrix?.false_facts ?? []) as FalseFact[];

    const patrolItems = useMemo(() => {
        const items: PatrolItem[] = [];

        const trueFacts = facts.map((f) => ({
            id: `true_${f.id}`,
            text: `${f.term}: ${f.definition}`,
            isFalse: false,
            factId: f.id,
            answer: f.term,
        }));

        const falseItems = falseFacts.map((f) => ({
            id: `false_${f.id}`,
            text: f.text,
            isFalse: true,
        }));

        if (falseItems.length === 0) {
            // Fallback: generate simple distractors by swapping term/definition
            facts.slice(0, Math.min(6, facts.length)).forEach((f) => {
                items.push({
                    id: `false_fallback_${f.id}`,
                    text: `${f.definition} is the name of ${f.term}`,
                    isFalse: true,
                });
            });
        }

        const combined = [...trueFacts, ...falseItems, ...items];
        const shuffled = combined.sort(() => Math.random() - 0.5);
        return shuffled.slice(0, Math.min(ROUND_COUNT, shuffled.length));
    }, [facts, falseFacts]);

    const [idx, setIdx] = useState(0);
    const [lives, setLives] = useState(MAX_LIVES);
    const [score, setScore] = useState(0);
    const [phase, setPhase] = useState<"play" | "complete" | "gameover">("play");

    const current = patrolItems[idx];

    const endGame = (didWin: boolean) => {
        const xpReward = score * 5;
        if (xpReward > 0) addWaterDrops(xpReward);
        setPhase(didWin ? "complete" : "gameover");
    };

    const advance = () => {
        if (idx + 1 >= patrolItems.length) {
            endGame(true);
        } else {
            setIdx((prev) => prev + 1);
        }
    };

    const handleChoice = async (choice: "squash" | "let") => {
        if (!current) return;
        const correct = (choice === "squash" && current.isFalse) || (choice === "let" && !current.isFalse);

        if (correct) {
            setScore((prev) => prev + 1);
            if (choice === "squash") incrementPestsSwatted();
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            advance();
            return;
        }

        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        const newLives = lives - 1;
        setLives(newLives);

        if (!current.isFalse && current.factId && activeId) {
            addToCompost({
                id: current.factId,
                materialId: activeId,
                question: current.text,
                answer: current.answer ?? current.text,
                type: "fact",
            });
        }

        if (newLives <= 0) {
            endGame(false);
        } else {
            advance();
        }
    };

    if (!activeId) {
        return (
            <View style={[s.container, { backgroundColor: colors.background }]}>
                <StatusBar style={isDark ? "light" : "dark"} />
                <View style={s.center}>
                    <Text style={s.title}>Pest Patrol</Text>
                    <MaterialPicker
                        materials={state.materials}
                        selectedId={selectedId}
                        onSelect={setSelectedId}
                        title="Choose Material"
                    />
                    <Text style={s.sub}>Select a material to start.</Text>
                    <TouchableOpacity style={s.btn} onPress={() => router.back()}>
                        <Text style={s.btnTextLight}>Return</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    }

    if (!material || patrolItems.length === 0) {
        return (
            <View style={[s.container, { backgroundColor: colors.background }]}>
                <StatusBar style={isDark ? "light" : "dark"} />
                <View style={s.center}>
                    <Text style={s.title}>Pest Patrol</Text>
                    <Text style={s.sub}>Not enough facts to patrol yet.</Text>
                    <TouchableOpacity style={s.btn} onPress={() => router.back()}>
                        <Text style={s.btnTextLight}>Return</Text>
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
                    <Text style={s.bigEmoji}>🐛</Text>
                    <Text style={s.title}>Patrol Complete!</Text>
                    <Text style={s.sub}>You cleared {score} pests. +{score * 5} Water Drops.</Text>
                    <TouchableOpacity style={s.btn} onPress={() => router.back()}>
                        <Text style={s.btnTextLight}>Return</Text>
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
                    <Text style={s.bigEmoji}>🪲</Text>
                    <Text style={s.title}>Patrol Over</Text>
                    <Text style={s.sub}>You cleared {score} pests.</Text>
                    <TouchableOpacity style={s.btn} onPress={() => router.back()}>
                        <Text style={s.btnTextLight}>Return</Text>
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
                <Text style={s.tag}>Pest Patrol</Text>
                <Text style={s.lives}>{"❤️".repeat(lives)}{"🖤".repeat(MAX_LIVES - lives)}</Text>
            </View>

            <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
                <Text style={s.prompt}>Squash the false facts. Let true facts pass.</Text>
                <Text style={s.statement}>{current?.text}</Text>
            </View>

            <View style={s.actions}>
                <TouchableOpacity style={s.btnDanger} onPress={() => handleChoice("squash")}>
                    <Text style={s.btnTextLight}>Squash (False)</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.btnSafe} onPress={() => handleChoice("let")}>
                    <Text style={s.btnTextDark}>Let Pass (True)</Text>
                </TouchableOpacity>
            </View>

            <Text style={s.progress}>Wave {idx + 1}/{patrolItems.length}</Text>
        </View>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, paddingHorizontal: 20, paddingTop: 56, paddingBottom: 30 },
    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
    back: { fontSize: 14, color: "#7DB58D", fontWeight: "600" },
    tag: { fontSize: 13, fontWeight: "800", color: "#5D4037" },
    lives: { fontSize: 14 },

    card: { borderRadius: 16, padding: 18, borderWidth: 1 },
    prompt: { fontSize: 12, fontWeight: "700", color: "#9E9E9E", marginBottom: 8, textTransform: "uppercase" },
    statement: { fontSize: 18, fontWeight: "700", color: "#4A4A4A", lineHeight: 26 },

    actions: { marginTop: 20, gap: 12 },
    btnDanger: { backgroundColor: "#D32F2F", borderRadius: 14, paddingVertical: 14, alignItems: "center" },
    btnSafe: { backgroundColor: "#F1F8F5", borderWidth: 1.5, borderColor: "#7DB58D", borderRadius: 14, paddingVertical: 14, alignItems: "center" },
    btnTextDark: { fontSize: 14, fontWeight: "700", color: "#5D4037" },
    btnTextLight: { fontSize: 14, fontWeight: "700", color: "#FFFFFF" },

    progress: { marginTop: 16, textAlign: "center", color: "#9E9E9E", fontWeight: "600" },

    center: { flex: 1, justifyContent: "center", alignItems: "center" },
    bigEmoji: { fontSize: 56, marginBottom: 10 },
    title: { fontSize: 22, fontWeight: "700", color: "#4A4A4A", marginBottom: 8 },
    sub: { fontSize: 14, color: "#9E9E9E", textAlign: "center", marginBottom: 16 },
    btn: { backgroundColor: "#7DB58D", borderRadius: 14, paddingVertical: 12, paddingHorizontal: 24 },
});
