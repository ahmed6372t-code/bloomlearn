import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from "react-native";
import { StatusBar } from "expo-status-bar";
import { Redirect, useRouter } from "expo-router";
import { useMemo } from "react";
import { useAuth } from "../../context/AuthContext";
import { useProgress, type OrganicWasteItem } from "../../context/ProgressContext";
import WasteCountdownTimer from "../../components/WasteCountdownTimer";
import { useTheme } from "../../context/ThemeContext";

export default function CompostScreen() {
    const { user } = useAuth();
    const router = useRouter();
    const { state } = useProgress();
    const { isDark, colors } = useTheme();

    if (!user) return <Redirect href="/login" />;

    const compostItems = state.compost ?? [];
    const wasteCount = state.organicWaste?.length ?? 0;
    const fertilizerCount = state.superFertilizerCount ?? 0;

    const compostByMaterial = useMemo(() => {
        const grouped: Record<string, typeof compostItems> = {};
        compostItems.forEach((item) => {
            const key = item.materialId ?? "unknown";
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push(item);
        });
        return grouped;
    }, [compostItems]);

    const compostMaterialIds = Object.keys(compostByMaterial);

    return (
        <View style={[s.container, { backgroundColor: colors.background }]}>
            <StatusBar style={isDark ? "light" : "dark"} />
            <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

                {/* Header */}
                <View style={s.header}>
                    <Text style={[s.title, { color: colors.text }]}>♻️ The Compost Bin</Text>
                    <Text style={[s.subtitle, { color: colors.muted }]}>Redeem failed concepts into XP</Text>
                </View>

                {/* Compost per material */}
                {compostMaterialIds.length === 0 ? (
                    <View style={[s.compostCard, s.compostCardEmpty]}>
                        <Text style={s.cardEmoji}>🗑️</Text>
                        <Text style={s.cardTitle}>Compost Bin Empty</Text>
                        <Text style={s.cardSubtitle}>Keep playing to fill the compost bin. Mistakes become XP! 💪</Text>
                    </View>
                ) : (
                    <View style={s.compostList}>
                        {compostMaterialIds.map((materialId) => {
                            const items = compostByMaterial[materialId];
                            const materialTitle =
                                materialId === "unknown"
                                    ? "Unknown Material"
                                    : state.materials[materialId]?.title ?? "Untitled Material";
                            const count = items.length;
                            return (
                                <TouchableOpacity
                                    key={materialId}
                                    style={s.compostCard}
                                    onPress={() => router.push({ pathname: "/compost-session", params: { materialId } })}
                                    activeOpacity={0.8}
                                >
                                    <View style={s.cardHeaderRow}>
                                        <Text style={s.cardEmoji}>🗑️</Text>
                                        <View style={s.badge}>
                                            <Text style={s.badgeText}>{count}</Text>
                                        </View>
                                    </View>
                                    <Text style={s.cardTitle}>{materialTitle}</Text>
                                    <Text style={s.cardSubtitle}>
                                        {count} failed concept{count > 1 ? "s" : ""} ready — earn {count * 15} XP
                                    </Text>
                                    <View style={s.cta}>
                                        <Text style={s.ctaText}>Begin Session →</Text>
                                    </View>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                )}

                {/* Fertilizer Frenzy */}
                {fertilizerCount > 0 && (
                    <TouchableOpacity
                        style={s.fertilizerCard}
                        onPress={() => router.push("/games/fertilizer-frenzy")}
                        activeOpacity={0.8}
                    >
                        <Text style={s.fertilizerTitle}>🌿 Fertilizer Frenzy</Text>
                        <Text style={s.fertilizerSub}>
                            {fertilizerCount} fertilizer charge{fertilizerCount > 1 ? "s" : ""} ready to revive wilting plots.
                        </Text>
                        <View style={s.cta}>
                            <Text style={s.ctaText}>Start →</Text>
                        </View>
                    </TouchableOpacity>
                )}

                {/* Organic Waste / Fertilizer section */}
                {wasteCount > 0 && (
                    <>
                        <Text style={[s.sectionTitle, { color: colors.text }]}>
                            🌿 Dead Plants — Fermenting
                        </Text>
                        <Text style={[s.sectionSub, { color: colors.muted }]}
                        >
                            Plants decay into fertilizer. Harvest once ready to boost XP.
                        </Text>
                        {state.organicWaste.map((item: OrganicWasteItem) => (
                            <WasteCountdownTimer key={item.id} wasteItem={item} />
                        ))}
                    </>
                )}

                {wasteCount === 0 && compostMaterialIds.length === 0 && fertilizerCount === 0 && (
                    <View style={s.allClean}>
                        <Text style={s.allCleanEmoji}>🌻</Text>
                        <Text style={[s.allCleanTitle, { color: colors.text }]}>Garden is pristine!</Text>
                        <Text style={[s.allCleanSub, { color: colors.muted }]}
                        >
                            No compost or dead plants right now.
                        </Text>
                    </View>
                )}
            </ScrollView>
        </View>
    );
}

const s = StyleSheet.create({
    container: { flex: 1 },
    content: { paddingHorizontal: 20, paddingTop: 60, paddingBottom: 40 },
    header: { marginBottom: 24 },
    title: { fontSize: 26, fontWeight: "700" },
    subtitle: { fontSize: 14, marginTop: 4 },
    sectionTitle: { fontSize: 17, fontWeight: "800", marginBottom: 6, marginTop: 8 },
    sectionSub: { fontSize: 13, marginBottom: 16 },

    compostList: { gap: 14, marginBottom: 24 },
    compostCard: { backgroundColor: "#5D4037", borderRadius: 16, padding: 20 },
    compostCardEmpty: { backgroundColor: "#A1887F", marginBottom: 24 },

    fertilizerCard: { backgroundColor: "#7DB58D", borderRadius: 16, padding: 20, marginBottom: 20 },
    fertilizerTitle: { fontSize: 17, fontWeight: "700", color: "#FFFFFF", marginBottom: 4 },
    fertilizerSub: { fontSize: 13, color: "rgba(255,255,255,0.85)", lineHeight: 18 },
    cardHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 },
    cardEmoji: { fontSize: 32 },
    badge: { backgroundColor: "#FF6B6B", borderRadius: 12, minWidth: 24, height: 24, justifyContent: "center", alignItems: "center", paddingHorizontal: 6 },
    badgeText: { color: "#FFF", fontSize: 12, fontWeight: "800" },
    cardTitle: { fontSize: 17, fontWeight: "700", color: "#FFFFFF", marginBottom: 4 },
    cardSubtitle: { fontSize: 13, color: "rgba(255,255,255,0.85)", lineHeight: 18 },
    cta: { marginTop: 16, backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 10, paddingVertical: 10, alignItems: "center" },
    ctaText: { color: "#FFF", fontWeight: "700", fontSize: 15 },

    allClean: { alignItems: "center", paddingVertical: 60 },
    allCleanEmoji: { fontSize: 56, marginBottom: 12 },
    allCleanTitle: { fontSize: 20, fontWeight: "700", marginBottom: 6 },
    allCleanSub: { fontSize: 14 },
});
