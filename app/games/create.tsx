import { useMemo, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator } from "react-native";
import MaterialPicker from "../../components/MaterialPicker";
import { StatusBar } from "expo-status-bar";
import { Redirect, useRouter, useLocalSearchParams } from "expo-router";
import { httpsCallable } from "firebase/functions";
import { useAuth } from "../../context/AuthContext";
import { useProgress } from "../../context/ProgressContext";
import { functions } from "../../firebaseConfig";
import { useTheme } from "../../context/ThemeContext";

const COLOR_POOLS = {
    common: ["#7DB58D", "#C5E1A5", "#F0E4D7"],
    rare: ["#FFD700", "#FFB74D", "#81D4FA"],
    ultra: ["#8E24AA", "#F06292", "#26C6DA"],
};

type SpliceResult = { ok: boolean; confidence: number; feedback: string };

type PromptPair = {
    concept: string;
    conceptMaterialId: string;
    procedure: string;
    procedureMaterialId: string;
    prompt: string;
};

export default function CreateScreen() {
    const { user } = useAuth();
    const router = useRouter();
    const { state, addMutation, completeStage } = useProgress();
    const { isDark, colors } = useTheme();
    const { materialId } = useLocalSearchParams<{ materialId?: string }>();
    const materialKeys = Object.keys(state.materials);
    const [selectedId, setSelectedId] = useState(materialId ?? materialKeys[0] ?? "");
    const activeId = materialId ?? selectedId;

    if (!user) return <Redirect href="/login" />;

    const concepts = useMemo(() => {
        const list: { name: string; materialId: string }[] = [];
        Object.entries(state.materials).forEach(([id, material]) => {
            if (activeId && id !== activeId) return;
            material.matrix?.concepts?.forEach((c) => list.push({ name: c.name, materialId: id }));
        });
        return list;
    }, [state.materials, activeId]);

    const procedures = useMemo(() => {
        const list: { name: string; materialId: string }[] = [];
        Object.entries(state.materials).forEach(([id, material]) => {
            if (activeId && id !== activeId) return;
            material.matrix?.procedures?.forEach((p) => list.push({ name: p.name, materialId: id }));
        });
        return list;
    }, [state.materials, activeId]);

    const buildPrompt = (): PromptPair | null => {
        if (concepts.length === 0 || procedures.length === 0) return null;
        const concept = concepts[Math.floor(Math.random() * concepts.length)];
        const procedure = procedures[Math.floor(Math.random() * procedures.length)];
        return {
            concept: concept.name,
            conceptMaterialId: concept.materialId,
            procedure: procedure.name,
            procedureMaterialId: procedure.materialId,
            prompt: `How would the principles of ${concept.name} change the way you execute ${procedure.name}?`,
        };
    };

    const [pair, setPair] = useState<PromptPair | null>(buildPrompt());
    const gameStartTime = useState(() => Date.now())[0];
    const [response, setResponse] = useState("");
    const [loading, setLoading] = useState(false);
    const [feedback, setFeedback] = useState<string | null>(null);

    if (!activeId) {
        return (
            <View style={[s.container, { backgroundColor: colors.background }]}>
                <StatusBar style={isDark ? "light" : "dark"} />
                <View style={s.center}>
                    <Text style={s.title}>Seed Splicer</Text>
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

    if (!pair) {
        return (
            <View style={[s.container, { backgroundColor: colors.background }]}>
                <StatusBar style={isDark ? "light" : "dark"} />
                <View style={s.center}>
                    <Text style={s.title}>Seed Splicer</Text>
                    <Text style={s.sub}>Add more materials with procedures to splice.</Text>
                    <TouchableOpacity style={s.btn} onPress={() => router.back()}>
                        <Text style={s.btnText}>Return</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    }

    const reroll = () => {
        setPair(buildPrompt());
        setResponse("");
        setFeedback(null);
    };

    const selectRarity = () => {
        const goldenBoost = state.goldenHourActive ? 0.1 : 0.05;
        const ultraChance = goldenBoost;
        const rareChance = 0.25;
        const roll = Math.random();
        if (roll < ultraChance) return "ultra" as const;
        if (roll < ultraChance + rareChance) return "rare" as const;
        return "common" as const;
    };

    const handleSubmit = async () => {
        if (!pair || response.trim().length < 20) {
            setFeedback("Write at least a couple sentences before splicing.");
            return;
        }

        setLoading(true);
        setFeedback(null);
        try {
            const evaluateSplice = httpsCallable<{ conceptA: string; procedureB: string; response: string }, SpliceResult>(
                functions,
                "evaluateSplice"
            );
            const result = await evaluateSplice({
                conceptA: pair.concept,
                procedureB: pair.procedure,
                response,
            });

            if (result.data.ok) {
                const rarity = selectRarity();
                const colors = COLOR_POOLS[rarity];
                const color = colors[Math.floor(Math.random() * colors.length)];

                addMutation({
                    id: `${Date.now().toString(36)}_${rarity}`,
                    conceptA: pair.concept,
                    procedureB: pair.procedure,
                    color,
                    rarity,
                    createdAt: Date.now(),
                });

                const targetMaterialId = activeId || pair.conceptMaterialId || pair.procedureMaterialId;
                if (targetMaterialId) {
                    completeStage(targetMaterialId, "create", Math.max(0.6, result.data.confidence), 1, gameStartTime);
                }
                setFeedback(`Success! ${result.data.feedback}`);
                return;
            }

            setFeedback(`Not quite: ${result.data.feedback}`);
        } catch {
            setFeedback("Splice validation failed. Try again in a moment.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <View style={[s.container, { backgroundColor: colors.background }]}>
            <StatusBar style={isDark ? "light" : "dark"} />
            <View style={s.header}>
                <TouchableOpacity onPress={() => router.back()}>
                    <Text style={s.back}>← Exit</Text>
                </TouchableOpacity>
                <Text style={s.tag}>Seed Splicer</Text>
            </View>

            <View style={[s.promptCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
                <Text style={s.promptLabel}>Splicing Prompt</Text>
                <Text style={s.promptText}>{pair.prompt}</Text>
                <TouchableOpacity style={s.reroll} onPress={reroll}>
                    <Text style={s.rerollText}>Shuffle Prompt</Text>
                </TouchableOpacity>
            </View>

            <TextInput
                style={[s.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]}
                placeholder="Write a short synthesis paragraph..."
                placeholderTextColor={colors.muted}
                value={response}
                onChangeText={setResponse}
                multiline
            />

            <TouchableOpacity style={s.submit} onPress={handleSubmit} disabled={loading}>
                {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={s.submitText}>Splice Seed</Text>}
            </TouchableOpacity>

            {feedback && <Text style={s.feedback}>{feedback}</Text>}
        </View>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, paddingHorizontal: 20, paddingTop: 56, paddingBottom: 24 },
    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
    back: { fontSize: 14, color: "#7DB58D", fontWeight: "600" },
    tag: { fontSize: 13, fontWeight: "800", color: "#5D4037" },

    promptCard: { borderRadius: 16, padding: 16, borderWidth: 1 },
    promptLabel: { fontSize: 11, fontWeight: "800", color: "#7DB58D", marginBottom: 6 },
    promptText: { fontSize: 15, fontWeight: "700", color: "#4A4A4A", lineHeight: 22 },
    reroll: { marginTop: 10, alignSelf: "flex-start" },
    rerollText: { color: "#7DB58D", fontWeight: "700" },

    input: { marginTop: 16, minHeight: 140, borderRadius: 14, padding: 14, borderWidth: 1, textAlignVertical: "top", fontSize: 14 },

    submit: { marginTop: 16, backgroundColor: "#7DB58D", borderRadius: 14, paddingVertical: 14, alignItems: "center" },
    submitText: { color: "#FFFFFF", fontWeight: "700", fontSize: 15 },

    feedback: { marginTop: 12, color: "#5D4037", fontWeight: "600" },

    center: { flex: 1, justifyContent: "center", alignItems: "center" },
    title: { fontSize: 22, fontWeight: "700", color: "#4A4A4A", marginBottom: 8 },
    sub: { fontSize: 14, color: "#9E9E9E", textAlign: "center", marginBottom: 16 },
    btn: { backgroundColor: "#7DB58D", borderRadius: 14, paddingVertical: 12, paddingHorizontal: 24 },
    btnText: { color: "#FFFFFF", fontWeight: "700" },
});
