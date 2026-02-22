import { useMemo, useState, useEffect } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { StatusBar } from "expo-status-bar";
import { Redirect, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useAuth } from "../../context/AuthContext";
import { useProgress, calculateFreshness } from "../../context/ProgressContext";
import { useTheme } from "../../context/ThemeContext";

const MAX_LIVES = 5;
const QUESTION_COUNT = 8;

type Question = {
    materialId: string;
    term: string;
    definition: string;
};

export default function FertilizerFrenzyScreen() {
    const { user } = useAuth();
    const router = useRouter();
    const { state, addWaterDrops, consumeFertilizer, revivePlot } = useProgress();
    const { isDark, colors } = useTheme();

    if (!user) return <Redirect href="/login" />;

    const wiltingQuestions = useMemo(() => {
        const questions: Question[] = [];
        Object.entries(state.materials).forEach(([materialId, material]) => {
            const stages = material.stageResults ?? {};
            const freshnessValues = [
                calculateFreshness(stages.remember?.lastPlayedTimestamp),
                calculateFreshness(stages.understand?.lastPlayedTimestamp),
                calculateFreshness(stages.apply?.lastPlayedTimestamp),
            ];
            const minFreshness = Math.min(...freshnessValues);
            if (minFreshness > 50) return;

            material.matrix?.facts?.forEach((fact) => {
                questions.push({ materialId, term: fact.term, definition: fact.definition });
            });
        });

        const shuffled = questions.sort(() => Math.random() - 0.5);
        return shuffled.slice(0, Math.min(QUESTION_COUNT, shuffled.length));
    }, [state.materials]);

    const [phase, setPhase] = useState<"intro" | "play" | "complete" | "gameover">("intro");
    const [currentQ, setCurrentQ] = useState(0);
    const [lives, setLives] = useState(MAX_LIVES);
    const [correct, setCorrect] = useState(0);

    // Award XP when session completes (must be before any early returns)
    useEffect(() => {
        if (phase !== "complete") return;
        const xpReward = correct * 10;
        if (xpReward > 0) addWaterDrops(xpReward);
    }, [phase]);

    const current = wiltingQuestions[currentQ];

    const options = useMemo(() => {
        if (!current) return [];
        const terms = wiltingQuestions
            .filter((q) => q.term !== current.term)
            .map((q) => q.term);
        while (terms.length < 3) {
            terms.push(`Dummy Term ${Math.random().toString(36).slice(2, 6)}`);
        }
        const wrong = terms.sort(() => Math.random() - 0.5).slice(0, 3);
        return [current.term, ...wrong].sort(() => Math.random() - 0.5);
    }, [current, wiltingQuestions]);

    const startGame = () => {
        const consumed = consumeFertilizer();
        if (!consumed) return;
        setPhase("play");
    };

    const advance = () => {
        if (currentQ + 1 >= wiltingQuestions.length) {
            setPhase("complete");
        } else {
            setCurrentQ((prev) => prev + 1);
        }
    };

    const handleAnswer = (answer: string) => {
        if (!current) return;
        const isCorrect = answer === current.term;
        if (isCorrect) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            setCorrect((prev) => prev + 1);
            revivePlot(current.materialId, "remember");
            advance();
            return;
        }

        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        const newLives = lives - 1;
        setLives(newLives);
        if (newLives <= 0) {
            setPhase("gameover");
        } else {
            advance();
        }
    };

    if (state.superFertilizerCount <= 0) {
        return (
            <View style={[s.container, { backgroundColor: colors.background }]}>
                <StatusBar style={isDark ? "light" : "dark"} />
                <View style={s.center}>
                    <Text style={s.title}>Fertilizer Frenzy</Text>
                    <Text style={s.sub}>Harvest fertilizer in Compost to unlock this game.</Text>
                    <TouchableOpacity style={s.btn} onPress={() => router.back()}>
                        <Text style={s.btnText}>Return</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    }

    if (wiltingQuestions.length === 0) {
        return (
            <View style={[s.container, { backgroundColor: colors.background }]}>
                <StatusBar style={isDark ? "light" : "dark"} />
                <View style={s.center}>
                    <Text style={s.title}>Fertilizer Frenzy</Text>
                    <Text style={s.sub}>No wilting plots right now.</Text>
                    <TouchableOpacity style={s.btn} onPress={() => router.back()}>
                        <Text style={s.btnText}>Return</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    }

    if (phase === "intro") {
        return (
            <View style={[s.container, { backgroundColor: colors.background }]}>
                <StatusBar style={isDark ? "light" : "dark"} />
                <View style={s.center}>
                    <Text style={s.bigEmoji}>🌿</Text>
                    <Text style={s.title}>Fertilizer Frenzy</Text>
                    <Text style={s.sub}>Revive wilting plots with rapid recall.</Text>
                    <TouchableOpacity style={s.btn} onPress={startGame}>
                        <Text style={s.btnText}>Start (uses 1 fertilizer)</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    }

    if (phase === "complete") {
        const xpReward = correct * 10;
        return (
            <View style={[s.container, { backgroundColor: colors.background }]}>
                <StatusBar style={isDark ? "light" : "dark"} />
                <View style={s.center}>
                    <Text style={s.bigEmoji}>🌸</Text>
                    <Text style={s.title}>Plots Revived!</Text>
                    <Text style={s.sub}>Correct {correct}. +{xpReward} Water Drops.</Text>
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
                    <Text style={s.title}>Frenzy Over</Text>
                    <Text style={s.sub}>You revived {correct} plots.</Text>
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
                <Text style={s.tag}>Fertilizer Frenzy</Text>
                <Text style={s.lives}>{"❤️".repeat(lives)}{"🖤".repeat(MAX_LIVES - lives)}</Text>
            </View>

            <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
                <Text style={s.prompt}>Which term matches this definition?</Text>
                <Text style={s.definition}>{current?.definition}</Text>
            </View>

            <View style={s.options}>
                {options.map((opt) => (
                    <TouchableOpacity key={opt} style={s.option} onPress={() => handleAnswer(opt)}>
                        <Text style={s.optionText}>{opt}</Text>
                    </TouchableOpacity>
                ))}
            </View>

            <Text style={s.progress}>Question {currentQ + 1}/{wiltingQuestions.length}</Text>
        </View>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, paddingHorizontal: 20, paddingTop: 56, paddingBottom: 24 },
    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
    back: { fontSize: 14, color: "#7DB58D", fontWeight: "600" },
    tag: { fontSize: 13, fontWeight: "800", color: "#5D4037" },
    lives: { fontSize: 14 },

    card: { borderRadius: 16, padding: 18, borderWidth: 1 },
    prompt: { fontSize: 12, fontWeight: "700", color: "#9E9E9E", marginBottom: 8, textTransform: "uppercase" },
    definition: { fontSize: 18, fontWeight: "700", color: "#4A4A4A", lineHeight: 26 },

    options: { marginTop: 16, gap: 10 },
    option: { backgroundColor: "#F1F8F5", borderRadius: 12, borderWidth: 1.5, borderColor: "#7DB58D", paddingVertical: 12, paddingHorizontal: 14 },
    optionText: { fontSize: 14, fontWeight: "600", color: "#4A4A4A" },

    progress: { marginTop: 16, textAlign: "center", color: "#9E9E9E", fontWeight: "600" },

    center: { flex: 1, justifyContent: "center", alignItems: "center" },
    bigEmoji: { fontSize: 56, marginBottom: 10 },
    title: { fontSize: 22, fontWeight: "700", color: "#4A4A4A", marginBottom: 8 },
    sub: { fontSize: 14, color: "#9E9E9E", textAlign: "center", marginBottom: 16 },
    btn: { backgroundColor: "#7DB58D", borderRadius: 14, paddingVertical: 12, paddingHorizontal: 24 },
    btnText: { color: "#FFFFFF", fontWeight: "700" },
});
