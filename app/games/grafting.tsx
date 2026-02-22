import { useMemo, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from "react-native";
import { StatusBar } from "expo-status-bar";
import { Redirect, useRouter } from "expo-router";
import { httpsCallable } from "firebase/functions";
import { useAuth } from "../../context/AuthContext";
import { useProgress } from "../../context/ProgressContext";
import { functions } from "../../firebaseConfig";
import { useTheme } from "../../context/ThemeContext";

type Scion = {
    materialId: string;
    text: string;
    label: string;
};

export default function GraftingScreen() {
    const { user } = useAuth();
    const router = useRouter();
    const { state, addHybrid } = useProgress();
    const { isDark, colors } = useTheme();

    if (!user) return <Redirect href="/login" />;

    const materials = Object.entries(state.materials).map(([id, material]) => ({
        id,
        title: material.title,
        concepts: material.matrix?.concepts ?? [],
        facts: material.matrix?.facts ?? [],
    }));

    const [rootMaterialId, setRootMaterialId] = useState(materials[0]?.id ?? "");
    const [rootConceptId, setRootConceptId] = useState("" + (materials[0]?.concepts?.[0]?.id ?? ""));
    const [selectedScion, setSelectedScion] = useState<Scion | null>(null);
    const [loading, setLoading] = useState(false);
    const [resultText, setResultText] = useState<string | null>(null);

    const rootMaterial = materials.find((m) => m.id === rootMaterialId);
    const rootConcept = rootMaterial?.concepts.find((c) => c.id === rootConceptId);

    const scions = useMemo(() => {
        const list: Scion[] = [];
        materials.forEach((m) => {
            if (m.id === rootMaterialId) return;
            m.concepts.forEach((c) => list.push({ materialId: m.id, text: c.name, label: `${m.title} · Concept` }));
            m.facts.forEach((f) => list.push({ materialId: m.id, text: f.term, label: `${m.title} · Fact` }));
        });
        return list;
    }, [materials, rootMaterialId]);

    const scoreLocal = (root: string, scion: string) => {
        const rootWords = new Set(root.toLowerCase().split(/\W+/).filter((w) => w.length > 3));
        const scionWords = new Set(scion.toLowerCase().split(/\W+/).filter((w) => w.length > 3));
        const overlap = [...rootWords].filter((w) => scionWords.has(w));
        return overlap.length > 0;
    };

    const handleGraft = async () => {
        if (!rootConcept || !selectedScion) return;
        setLoading(true);
        setResultText(null);

        try {
            const scoreGraft = httpsCallable<{ root: string; scion: string }, { ok: boolean; confidence: number; reason: string }>(
                functions,
                "scoreGraft"
            );
            const result = await scoreGraft({ root: rootConcept.name, scion: selectedScion.text });
            const ok = result.data.ok;
            const confidence = result.data.confidence;
            const reason = result.data.reason;

            if (ok) {
                const hybrid = {
                    id: `${Date.now().toString(36)}_${rootMaterialId}`,
                    rootMaterialId,
                    rootConcept: rootConcept.name,
                    scionMaterialId: selectedScion.materialId,
                    scionText: selectedScion.text,
                    confidence,
                    createdAt: Date.now(),
                };
                addHybrid(hybrid);
                setResultText(`Success! ${reason}`);
            } else {
                setResultText(`Not compatible: ${reason}`);
            }
        } catch {
            const ok = scoreLocal(rootConcept.name, selectedScion.text);
            if (ok) {
                const hybrid = {
                    id: `${Date.now().toString(36)}_${rootMaterialId}`,
                    rootMaterialId,
                    rootConcept: rootConcept.name,
                    scionMaterialId: selectedScion.materialId,
                    scionText: selectedScion.text,
                    confidence: 0.5,
                    createdAt: Date.now(),
                };
                addHybrid(hybrid);
                setResultText("Success (local check). Concepts seem related.");
            } else {
                setResultText("Not compatible (local check). Try a different scion.");
            }
        } finally {
            setLoading(false);
        }
    };

    if (materials.length < 2) {
        return (
            <View style={[s.container, { backgroundColor: colors.background }]}>
                <StatusBar style={isDark ? "light" : "dark"} />
                <View style={s.center}>
                    <Text style={s.title}>Grafting</Text>
                    <Text style={s.sub}>Add at least two materials to graft across plots.</Text>
                    <TouchableOpacity style={s.btn} onPress={() => router.back()}>
                        <Text style={s.btnText}>Return</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    }

    if (!rootMaterial || rootMaterial.concepts.length === 0) {
        return (
            <View style={[s.container, { backgroundColor: colors.background }]}>
                <StatusBar style={isDark ? "light" : "dark"} />
                <View style={s.center}>
                    <Text style={s.title}>Grafting</Text>
                    <Text style={s.sub}>This material has no concepts to graft.</Text>
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
            <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
                <View style={s.header}>
                    <TouchableOpacity onPress={() => router.back()}>
                        <Text style={s.back}>← Exit</Text>
                    </TouchableOpacity>
                    <Text style={s.tag}>Grafting</Text>
                </View>

                <Text style={s.section}>Rootstock (Material)</Text>
                <View style={s.pillRow}>
                    {materials.map((m) => (
                        <TouchableOpacity
                            key={m.id}
                            style={[s.pill, rootMaterialId === m.id && s.pillActive]}
                            onPress={() => {
                                setRootMaterialId(m.id);
                                setRootConceptId(m.concepts?.[0]?.id ?? "");
                            }}
                        >
                            <Text style={[s.pillText, rootMaterialId === m.id && s.pillTextActive]}>{m.title}</Text>
                        </TouchableOpacity>
                    ))}
                </View>

                <Text style={s.section}>Rootstock (Concept)</Text>
                <View style={s.pillRow}>
                    {(rootMaterial?.concepts ?? []).map((c) => (
                        <TouchableOpacity
                            key={c.id}
                            style={[s.pill, rootConceptId === c.id && s.pillActive]}
                            onPress={() => setRootConceptId(c.id)}
                        >
                            <Text style={[s.pillText, rootConceptId === c.id && s.pillTextActive]}>{c.name}</Text>
                        </TouchableOpacity>
                    ))}
                </View>

                <Text style={s.section}>Scions</Text>
                <View style={s.scionList}>
                    {scions.map((sci) => (
                        <TouchableOpacity
                            key={`${sci.materialId}_${sci.text}`}
                            style={[
                                s.scionCard,
                                { backgroundColor: colors.card, borderColor: colors.border },
                                selectedScion?.text === sci.text && s.scionActive,
                            ]}
                            onPress={() => setSelectedScion(sci)}
                        >
                            <Text style={s.scionTitle}>{sci.text}</Text>
                            <Text style={s.scionLabel}>{sci.label}</Text>
                        </TouchableOpacity>
                    ))}
                </View>

                <TouchableOpacity style={s.submit} onPress={handleGraft} disabled={!selectedScion || !rootConcept || loading}>
                    {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={s.submitText}>Graft</Text>}
                </TouchableOpacity>

                {resultText && <Text style={s.result}>{resultText}</Text>}
            </ScrollView>
        </View>
    );
}

const s = StyleSheet.create({
    container: { flex: 1 },
    content: { paddingHorizontal: 20, paddingTop: 56, paddingBottom: 40 },
    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
    back: { fontSize: 14, color: "#7DB58D", fontWeight: "600" },
    tag: { fontSize: 13, fontWeight: "800", color: "#5D4037" },

    section: { fontSize: 14, fontWeight: "800", color: "#5D4037", marginBottom: 8, marginTop: 12 },
    pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    pill: { backgroundColor: "#EFEBE9", borderRadius: 14, paddingVertical: 6, paddingHorizontal: 10 },
    pillActive: { backgroundColor: "#7DB58D" },
    pillText: { fontSize: 12, color: "#5D4037", fontWeight: "700" },
    pillTextActive: { color: "#FFFFFF" },

    scionList: { gap: 10, marginTop: 6 },
    scionCard: { borderRadius: 14, padding: 14, borderWidth: 1 },
    scionActive: { borderColor: "#7DB58D", backgroundColor: "#F1F8F5" },
    scionTitle: { fontSize: 14, fontWeight: "700", color: "#4A4A4A" },
    scionLabel: { fontSize: 11, color: "#9E9E9E", marginTop: 4 },

    submit: { backgroundColor: "#7DB58D", borderRadius: 14, paddingVertical: 14, alignItems: "center", marginTop: 14 },
    submitText: { color: "#FFFFFF", fontWeight: "700", fontSize: 14 },
    result: { marginTop: 12, fontSize: 12, color: "#5D4037", fontWeight: "600" },

    center: { flex: 1, justifyContent: "center", alignItems: "center" },
    title: { fontSize: 22, fontWeight: "700", color: "#4A4A4A", marginBottom: 8 },
    sub: { fontSize: 14, color: "#9E9E9E", textAlign: "center", marginBottom: 16 },
    btn: { backgroundColor: "#7DB58D", borderRadius: 14, paddingVertical: 12, paddingHorizontal: 24 },
    btnText: { color: "#FFFFFF", fontWeight: "700" },
});
