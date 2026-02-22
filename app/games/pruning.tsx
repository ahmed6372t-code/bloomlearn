import { useMemo, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from "react-native";
import { StatusBar } from "expo-status-bar";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useAuth } from "../../context/AuthContext";
import { useProgress } from "../../context/ProgressContext";
import MaterialPicker from "../../components/MaterialPicker";
import { useTheme } from "../../context/ThemeContext";

const MAX_LIVES = 5;

const WEED_STEPS = [
    "Check social media for hints",
    "Skip the safety checklist",
    "Water the soil with soda",
    "Ignore the required tools",
];

type StepRow = {
    id: string;
    text: string;
    isWeed: boolean;
    marked: boolean;
};

export default function PruningShearsScreen() {
    const { user } = useAuth();
    const router = useRouter();
    const { materialId } = useLocalSearchParams<{ materialId?: string }>();
    const { state, addWaterDrops, addToCompost } = useProgress();
    const { isDark, colors } = useTheme();
    const materialKeys = Object.keys(state.materials);
    const [selectedId, setSelectedId] = useState(materialId ?? materialKeys[0] ?? "");
    const activeId = materialId ?? selectedId;

    if (!user) return <Redirect href="/login" />;

    const material = activeId ? state.materials[activeId] : undefined;
    const procedure = material?.matrix?.procedures?.[0];

    const targetSteps = procedure?.steps ?? [];

    const initialSteps = useMemo(() => {
        if (!procedure) return [] as StepRow[];
        const shuffled = [...targetSteps].sort(() => Math.random() - 0.5);
        const weed = WEED_STEPS[Math.floor(Math.random() * WEED_STEPS.length)];
        const insertAt = Math.floor(Math.random() * (shuffled.length + 1));
        const withWeed = [...shuffled.slice(0, insertAt), weed, ...shuffled.slice(insertAt)];
        return withWeed.map((text, idx) => ({
            id: `${procedure.id}_${idx}`,
            text,
            isWeed: text === weed,
            marked: false,
        }));
    }, [procedure, targetSteps]);

    const [steps, setSteps] = useState<StepRow[]>(initialSteps);
    const [lives, setLives] = useState(MAX_LIVES);
    const [phase, setPhase] = useState<"play" | "complete" | "gameover">("play");

    if (!activeId) {
        return (
            <View style={[s.container, { backgroundColor: colors.background }]}>
                <StatusBar style={isDark ? "light" : "dark"} />
                <View style={s.center}>
                    <Text style={s.title}>Pruning Shears</Text>
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

    if (!procedure || steps.length === 0) {
        return (
            <View style={[s.container, { backgroundColor: colors.background }]}>
                <StatusBar style={isDark ? "light" : "dark"} />
                <View style={s.center}>
                    <Text style={s.title}>Pruning Shears</Text>
                    <Text style={s.sub}>No procedures found for this material.</Text>
                    <TouchableOpacity style={s.btn} onPress={() => router.back()}>
                        <Text style={s.btnText}>Return</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    }

    const moveStep = (index: number, direction: "up" | "down") => {
        setSteps((prev) => {
            const next = [...prev];
            const targetIndex = direction === "up" ? index - 1 : index + 1;
            if (targetIndex < 0 || targetIndex >= next.length) return prev;
            const temp = next[index];
            next[index] = next[targetIndex];
            next[targetIndex] = temp;
            return next;
        });
    };

    const toggleMark = (index: number) => {
        setSteps((prev) =>
            prev.map((step, idx) => {
                if (idx !== index) return { ...step, marked: false };
                return { ...step, marked: !step.marked };
            })
        );
    };

    const evaluate = () => {
        const marked = steps.find((s) => s.marked);
        const remaining = steps.filter((s) => !s.marked).map((s) => s.text);
        const weedRemoved = marked ? marked.isWeed : false;
        const orderCorrect = remaining.join("|") === targetSteps.join("|");

        if (weedRemoved && orderCorrect) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            addWaterDrops(25);
            setPhase("complete");
            return;
        }

        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        const newLives = lives - 1;
        setLives(newLives);
        if (marked && !marked.isWeed && activeId) {
            addToCompost({
                id: `${procedure.id}_${marked.text}`,
                materialId: activeId,
                question: "Which step should be removed?",
                answer: marked.text,
                type: "procedure",
            });
        }

        if (newLives <= 0) {
            setPhase("gameover");
        }
    };

    if (phase === "complete") {
        return (
            <View style={[s.container, { backgroundColor: colors.background }]}>
                <StatusBar style={isDark ? "light" : "dark"} />
                <View style={s.center}>
                    <Text style={s.bigEmoji}>✂️</Text>
                    <Text style={s.title}>Plant Pruned!</Text>
                    <Text style={s.sub}>Order restored. +25 Water Drops.</Text>
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
                    <Text style={s.bigEmoji}>🪴</Text>
                    <Text style={s.title}>Overgrown!</Text>
                    <Text style={s.sub}>Try again later to fix the steps.</Text>
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
                <Text style={s.tag}>Pruning Shears</Text>
                <Text style={s.lives}>{"❤️".repeat(lives)}{"🖤".repeat(MAX_LIVES - lives)}</Text>
            </View>

            <Text style={s.prompt}>Reorder the steps and mark the weed.</Text>

            <ScrollView style={s.list} showsVerticalScrollIndicator={false}>
                {steps.map((step, index) => (
                    <View
                        key={step.id}
                        style={[
                            s.row,
                            { backgroundColor: colors.card, borderColor: colors.border },
                            step.marked && [s.rowMarked, { backgroundColor: colors.accentSoft, borderColor: colors.accent }],
                        ]}
                    >
                        <Text style={s.stepText}>{step.text}</Text>
                        <View style={s.rowActions}>
                            <TouchableOpacity style={s.stepBtn} onPress={() => moveStep(index, "up")}>
                                <Text style={s.stepBtnText}>↑</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={s.stepBtn} onPress={() => moveStep(index, "down")}>
                                <Text style={s.stepBtnText}>↓</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={s.markBtn} onPress={() => toggleMark(index)}>
                                <Text style={s.markText}>{step.marked ? "Unmark" : "Weed"}</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                ))}
            </ScrollView>

            <TouchableOpacity style={s.submit} onPress={evaluate}>
                <Text style={s.submitText}>Check Plant</Text>
            </TouchableOpacity>
        </View>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, paddingHorizontal: 20, paddingTop: 56, paddingBottom: 24 },
    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
    back: { fontSize: 14, color: "#7DB58D", fontWeight: "600" },
    tag: { fontSize: 13, fontWeight: "800", color: "#5D4037" },
    lives: { fontSize: 14 },

    prompt: { fontSize: 14, color: "#9E9E9E", marginBottom: 12 },
    list: { flex: 1 },
    row: { borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1 },
    rowMarked: { },
    stepText: { fontSize: 14, fontWeight: "600", color: "#4A4A4A", marginBottom: 8 },
    rowActions: { flexDirection: "row", gap: 8 },
    stepBtn: { backgroundColor: "#EFEBE9", borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10 },
    stepBtnText: { fontSize: 12, fontWeight: "700", color: "#5D4037" },
    markBtn: { backgroundColor: "#F1F8F5", borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10, borderWidth: 1, borderColor: "#7DB58D" },
    markText: { fontSize: 12, fontWeight: "700", color: "#5D4037" },

    submit: { backgroundColor: "#7DB58D", borderRadius: 14, paddingVertical: 14, alignItems: "center", marginTop: 10 },
    submitText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },

    center: { flex: 1, justifyContent: "center", alignItems: "center" },
    bigEmoji: { fontSize: 56, marginBottom: 10 },
    title: { fontSize: 22, fontWeight: "700", color: "#4A4A4A", marginBottom: 8 },
    sub: { fontSize: 14, color: "#9E9E9E", textAlign: "center", marginBottom: 16 },
    btn: { backgroundColor: "#7DB58D", borderRadius: 14, paddingVertical: 12, paddingHorizontal: 24 },
    btnText: { color: "#FFFFFF", fontWeight: "700" },
});
