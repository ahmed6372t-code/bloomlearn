import { StyleSheet, Text, View, TouchableOpacity, ScrollView, Alert } from "react-native";
import { calculateFreshness, useProgress } from "../context/ProgressContext";
import type { MaterialRecord, LinkedFile } from "../context/ProgressContext";
import { useTheme } from "../context/ThemeContext";

// ─────────────────────────────────────────────────────────────────────────────
// StageCard (lifted from home.tsx)
// ─────────────────────────────────────────────────────────────────────────────

interface StageCardProps {
    stageName: "remember" | "understand" | "apply" | "analyze" | "evaluate" | "create";
    stageLabel: string;
    stageEmoji: string;
    isCompleted: boolean;
    isLocked: boolean;
    hasFailedAttempt: boolean;
    isShiny?: boolean;
    accuracy?: number;
    maxCombo?: number;
    freshness?: number;
    onPress: () => void;
}

function StageCard({
    stageName,
    stageLabel,
    stageEmoji,
    isCompleted,
    isLocked,
    hasFailedAttempt,
    isShiny = false,
    accuracy,
    maxCombo,
    freshness = 100,
    onPress,
}: StageCardProps) {
    const { isDark, colors } = useTheme();
    const darkCardStyle = isDark ? { backgroundColor: colors.card, borderColor: colors.border } : null;
    const isFullyWilted = isCompleted && freshness === 0;
    const isWilting = isCompleted && freshness <= 50 && freshness > 0;
    const isDrooping = isCompleted && freshness === 75;

    return (
        <TouchableOpacity
            style={[
                s.stageCard,
                isShiny && s.shinyCard,
                isLocked && s.stageCardLocked,
                isCompleted && !isFullyWilted && s.stageCardCompleted,
                isFullyWilted && s.stageCardWilted,
                isWilting && s.stageCardWilting,
                isDrooping && s.stageCardDrooping,
                hasFailedAttempt && !isCompleted && s.stageCardRetry,
                darkCardStyle,
            ]}
            onPress={onPress}
            disabled={isLocked}
            activeOpacity={isLocked ? 1 : 0.7}
        >
            {isShiny && (
                <View style={s.shinyBadge}>
                    <Text style={s.shinyBadgeText}>✨</Text>
                </View>
            )}
            <View style={s.stageCardHeader}>
                <Text style={[s.stageEmoji, isFullyWilted && { opacity: 0.4 }, isShiny && s.stageEmojiShiny]}>
                    {isFullyWilted ? "🥀" : stageEmoji}
                </Text>
                <Text
                    style={[
                        s.stageLabel,
                        { color: colors.text },
                        isLocked && { color: colors.muted },
                        isFullyWilted && { opacity: 0.6 },
                    ]}
                >
                    {stageLabel}
                </Text>
                {isCompleted && !isFullyWilted && <Text style={[s.checkmark, { color: colors.accent }]}>✓</Text>}
                {isFullyWilted && <Text style={[s.wiltedWarning, { color: colors.danger }]}>!</Text>}
                {isLocked && <Text style={s.lockEmoji}>🔒</Text>}
            </View>

            {isLocked && (
                <Text style={[s.lockedMessage, { color: colors.muted }]}
                >
                    Master previous stage{"\n"}(80% accuracy + x3 combo)
                </Text>
            )}

            {hasFailedAttempt && !isCompleted && (
                <View style={[s.failedBadge, { backgroundColor: colors.dangerSoft }]}
                >
                    <Text style={[s.failedBadgeText, { color: colors.danger }]}>⚠️ -5 XP Penalty</Text>
                </View>
            )}

            {isCompleted && !isFullyWilted && (
                <Text style={[s.completedStats, { color: colors.accent }, isWilting && { opacity: 0.7 }]}
                >
                    {accuracy && maxCombo
                        ? `${Math.round(accuracy * 100)}% Accuracy · x${maxCombo} Combo`
                        : "Mastered"}
                </Text>
            )}

            {isFullyWilted && (
                <View style={[s.wiltedBadge, { backgroundColor: colors.dangerSoft }]}
                >
                    <Text style={[s.wiltedBadgeText, { color: colors.danger }]}>Needs Watering!</Text>
                    <Text style={[s.wiltedBadgeSubtext, { color: colors.danger }]}>Replay to restore</Text>
                </View>
            )}

            {isWilting && !isFullyWilted && (
                <Text style={[s.wiltingWarning, { color: colors.muted }]}>⚠️ Knowledge wilting</Text>
            )}

            {isDrooping && (
                <Text style={[s.droopingWarning, { color: colors.muted }]}>📉 Fading (review soon)</Text>
            )}

            {!isLocked && !isCompleted && !hasFailedAttempt && (
                <Text style={[s.playNowText, { color: colors.accent }]}>Tap to Play →</Text>
            )}

            {!isLocked && hasFailedAttempt && !isCompleted && (
                <Text style={[s.retryText, { color: colors.accent }]}>Retry Stage</Text>
            )}

            {isFullyWilted && (
                <Text style={[s.replayText, { color: colors.danger }]}>Tap to Replay →</Text>
            )}
        </TouchableOpacity>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// MaterialCard — the full material section with 3 stage cards
// ─────────────────────────────────────────────────────────────────────────────

interface MaterialCardProps {
    materialId: string;
    material: MaterialRecord;
    canUnlockStage: (materialId: string, stage: string) => boolean;
    onNavigate: (route: string) => void;
}

export default function MaterialCard({
    materialId,
    material,
    canUnlockStage,
    onNavigate,
}: MaterialCardProps) {
    const { removeFileFromMaterial } = useProgress();
    const { colors } = useTheme();

    const getStageRoute = (stageName: string, freshness?: number) => {
        const route = `/games/${stageName}?materialId=${materialId}`;
        if (freshness !== undefined && freshness < 100) {
            return `${route}&watering=true`;
        }
        return route;
    };

    return (
        <View style={s.materialSection}>
            <View style={s.materialHeader}>
                <Text style={[s.materialTitle, { color: colors.text }]}>{material.title}</Text>
                <Text style={[s.materialCategory, { color: colors.accent }]}>{material.category}</Text>
            </View>

            <View style={s.stagesGrid}>
                <StageCard
                    stageName="remember"
                    stageLabel="The Seed Library"
                    stageEmoji="🌾"
                    isCompleted={material.stagesCompleted?.includes("remember") ?? false}
                    isLocked={false}
                    hasFailedAttempt={
                        !!(material.stageResults?.remember &&
                            !(material.stagesCompleted?.includes("remember") ?? false))
                    }
                    accuracy={material.stageResults?.remember?.accuracy}
                    maxCombo={material.stageResults?.remember?.maxCombo}
                    freshness={calculateFreshness(material.stageResults?.remember?.lastPlayedTimestamp)}
                    isShiny={material.stageResults?.remember?.variant === "shiny"}
                    onPress={() =>
                        onNavigate(getStageRoute("remember", calculateFreshness(material.stageResults?.remember?.lastPlayedTimestamp)))
                    }
                />

                <StageCard
                    stageName="understand"
                    stageLabel="The Greenhouse"
                    stageEmoji="🌿"
                    isCompleted={material.stagesCompleted?.includes("understand") ?? false}
                    isLocked={!canUnlockStage(materialId, "understand")}
                    hasFailedAttempt={
                        !!(material.stageResults?.understand &&
                            !(material.stagesCompleted?.includes("understand") ?? false))
                    }
                    accuracy={material.stageResults?.understand?.accuracy}
                    maxCombo={material.stageResults?.understand?.maxCombo}
                    freshness={calculateFreshness(material.stageResults?.understand?.lastPlayedTimestamp)}
                    isShiny={material.stageResults?.understand?.variant === "shiny"}
                    onPress={() => {
                        if (!canUnlockStage(materialId, "understand")) return;
                        onNavigate(getStageRoute("understand", calculateFreshness(material.stageResults?.understand?.lastPlayedTimestamp)));
                    }}
                />

                <StageCard
                    stageName="apply"
                    stageLabel="The Potting Bench"
                    stageEmoji="🪴"
                    isCompleted={material.stagesCompleted?.includes("apply") ?? false}
                    isLocked={!canUnlockStage(materialId, "apply")}
                    hasFailedAttempt={
                        !!(material.stageResults?.apply &&
                            !(material.stagesCompleted?.includes("apply") ?? false))
                    }
                    accuracy={material.stageResults?.apply?.accuracy}
                    maxCombo={material.stageResults?.apply?.maxCombo}
                    freshness={calculateFreshness(material.stageResults?.apply?.lastPlayedTimestamp)}
                    isShiny={material.stageResults?.apply?.variant === "shiny"}
                    onPress={() => {
                        if (!canUnlockStage(materialId, "apply")) return;
                        onNavigate(getStageRoute("apply", calculateFreshness(material.stageResults?.apply?.lastPlayedTimestamp)));
                    }}
                />

                <StageCard
                    stageName="analyze"
                    stageLabel="Root Router"
                    stageEmoji="🌿"
                    isCompleted={material.stagesCompleted?.includes("analyze") ?? false}
                    isLocked={!canUnlockStage(materialId, "analyze")}
                    hasFailedAttempt={
                        !!(material.stageResults?.analyze &&
                            !(material.stagesCompleted?.includes("analyze") ?? false))
                    }
                    accuracy={material.stageResults?.analyze?.accuracy}
                    maxCombo={material.stageResults?.analyze?.maxCombo}
                    freshness={calculateFreshness(material.stageResults?.analyze?.lastPlayedTimestamp)}
                    isShiny={material.stageResults?.analyze?.variant === "shiny"}
                    onPress={() => {
                        if (!canUnlockStage(materialId, "analyze")) return;
                        onNavigate(getStageRoute("analyze", calculateFreshness(material.stageResults?.analyze?.lastPlayedTimestamp)));
                    }}
                />

                <StageCard
                    stageName="evaluate"
                    stageLabel="Companion Planting"
                    stageEmoji="🌼"
                    isCompleted={material.stagesCompleted?.includes("evaluate") ?? false}
                    isLocked={!canUnlockStage(materialId, "evaluate")}
                    hasFailedAttempt={
                        !!(material.stageResults?.evaluate &&
                            !(material.stagesCompleted?.includes("evaluate") ?? false))
                    }
                    accuracy={material.stageResults?.evaluate?.accuracy}
                    maxCombo={material.stageResults?.evaluate?.maxCombo}
                    freshness={calculateFreshness(material.stageResults?.evaluate?.lastPlayedTimestamp)}
                    isShiny={material.stageResults?.evaluate?.variant === "shiny"}
                    onPress={() => {
                        if (!canUnlockStage(materialId, "evaluate")) return;
                        onNavigate(getStageRoute("evaluate", calculateFreshness(material.stageResults?.evaluate?.lastPlayedTimestamp)));
                    }}
                />

                <StageCard
                    stageName="create"
                    stageLabel="Seed Splicer"
                    stageEmoji="🧬"
                    isCompleted={material.stagesCompleted?.includes("create") ?? false}
                    isLocked={!canUnlockStage(materialId, "create")}
                    hasFailedAttempt={
                        !!(material.stageResults?.create &&
                            !(material.stagesCompleted?.includes("create") ?? false))
                    }
                    accuracy={material.stageResults?.create?.accuracy}
                    maxCombo={material.stageResults?.create?.maxCombo}
                    freshness={calculateFreshness(material.stageResults?.create?.lastPlayedTimestamp)}
                    isShiny={material.stageResults?.create?.variant === "shiny"}
                    onPress={() => {
                        if (!canUnlockStage(materialId, "create")) return;
                        onNavigate(getStageRoute("create", calculateFreshness(material.stageResults?.create?.lastPlayedTimestamp)));
                    }}
                />
            </View>

            {/* ── Attached Files ─────────────────────────────────────── */}
            {material.linkedFiles && material.linkedFiles.length > 0 && (
                <View style={[s.filesSection, { borderTopColor: colors.border }]}
                >
                    <Text style={[s.filesLabel, { color: colors.muted }]}>📎 Attached Files</Text>
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={s.filesRow}
                    >
                        {material.linkedFiles.map((file: LinkedFile) => (
                            <View
                                key={file.storageUri}
                                style={[s.filePill, { backgroundColor: colors.accentSoft, borderColor: colors.accent }]}
                            >
                                <Text style={s.filePillIcon}>
                                    {file.mimeType?.startsWith("image/")
                                        ? "🖼️"
                                        : file.mimeType === "application/pdf"
                                            ? "📄"
                                            : "📎"}
                                </Text>
                                <Text style={[s.filePillName, { color: colors.text }]} numberOfLines={1}>
                                    {file.name}
                                </Text>
                                <TouchableOpacity
                                    style={s.fileDelete}
                                    onPress={() => {
                                        Alert.alert(
                                            "Delete upload?",
                                            `Remove ${file.name}? This deletes the file and unlinks it from this material.`,
                                            [
                                                { text: "Cancel", style: "cancel" },
                                                {
                                                    text: "Delete",
                                                    style: "destructive",
                                                    onPress: async () => {
                                                        try {
                                                            await removeFileFromMaterial(materialId, file.storageUri);
                                                        } catch (err: any) {
                                                            const msg = err?.message || "Failed to delete upload.";
                                                            Alert.alert("Delete failed", msg);
                                                        }
                                                    },
                                                },
                                            ]
                                        );
                                    }}
                                    activeOpacity={0.7}
                                >
                                    <Text style={[s.fileDeleteText, { color: colors.danger }]}>✕</Text>
                                </TouchableOpacity>
                            </View>
                        ))}
                    </ScrollView>
                </View>
            )}
        </View>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles (mirrored from home.tsx)
// ─────────────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
    materialSection: { marginBottom: 24 },
    materialHeader: { marginBottom: 12 },
    materialTitle: { fontSize: 18, fontWeight: "700", color: "#4A4A4A", marginBottom: 2 },
    materialCategory: { fontSize: 12, color: "#7DB58D", fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 },
    stagesGrid: { gap: 10 },

    stageCard: { backgroundColor: "#FFF", borderRadius: 14, padding: 16, borderWidth: 2, borderColor: "#E8F5E9" },
    shinyCard: { backgroundColor: "#FFF8E1", borderColor: "#FFD700", shadowColor: "#FFD700", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 6 },
    shinyBadge: { position: "absolute", top: 10, right: 10, backgroundColor: "#FFF6D6", borderColor: "#FFD700", borderWidth: 1, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2, zIndex: 1 },
    shinyBadgeText: { fontSize: 12 },
    stageCardLocked: { backgroundColor: "#F5F5F5", borderColor: "#E0E0E0", opacity: 0.7 },
    stageCardCompleted: { backgroundColor: "#F1F8F5", borderColor: "#7DB58D", borderWidth: 2 },
    stageCardDrooping: { backgroundColor: "#FFF9E6", borderColor: "#FFD54F", borderWidth: 2 },
    stageCardWilting: { backgroundColor: "#FFF3E0", borderColor: "#FFB74D", borderWidth: 2, opacity: 0.85 },
    stageCardWilted: { backgroundColor: "#FFEBEE", borderColor: "#EF5350", borderWidth: 2, opacity: 0.75 },
    stageCardRetry: { backgroundColor: "#FFF8E1", borderColor: "#FFB74D" },
    stageCardHeader: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
    stageEmoji: { fontSize: 24, marginRight: 10 },
    stageEmojiShiny: { shadowColor: "#FFD700", shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.7, shadowRadius: 6 },
    stageLabel: { fontSize: 15, fontWeight: "700", color: "#4A4A4A", flex: 1 },
    stageLabelLocked: { color: "#9E9E9E" },
    checkmark: { fontSize: 20, color: "#7DB58D", fontWeight: "700" },
    lockEmoji: { fontSize: 16 },
    lockedMessage: { fontSize: 12, color: "#9E9E9E", lineHeight: 16, fontWeight: "500" },
    failedBadge: { backgroundColor: "#FFF3CD", borderRadius: 6, paddingVertical: 6, paddingHorizontal: 10, marginTop: 8 },
    failedBadgeText: { fontSize: 12, color: "#856404", fontWeight: "700" },
    completedStats: { fontSize: 13, color: "#7DB58D", fontWeight: "600", marginTop: 8 },
    playNowText: { fontSize: 13, color: "#7DB58D", fontWeight: "700", marginTop: 8 },
    retryText: { fontSize: 13, color: "#FFB74D", fontWeight: "700", marginTop: 8 },
    wiltedBadge: { backgroundColor: "#FFCDD2", borderRadius: 6, paddingVertical: 8, paddingHorizontal: 10, marginTop: 8 },
    wiltedBadgeText: { fontSize: 13, color: "#C62828", fontWeight: "700" },
    wiltedBadgeSubtext: { fontSize: 11, color: "#D32F2F", fontWeight: "600", marginTop: 2 },
    wiltingWarning: { fontSize: 12, color: "#E65100", fontWeight: "600", marginTop: 8 },
    droopingWarning: { fontSize: 12, color: "#F57F17", fontWeight: "600", marginTop: 8 },
    wiltedWarning: { fontSize: 18, color: "#C62828", fontWeight: "700" },
    replayText: { fontSize: 13, color: "#D32F2F", fontWeight: "700", marginTop: 8 },

    // ── Attached Files section ──────────────────────────────────────────────
    filesSection: { marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: "#F0F0F0" },
    filesLabel: { fontSize: 11, fontWeight: "700", color: "#9E9E9E", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 },
    filesRow: { gap: 8, paddingBottom: 2 },
    filePill: {
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        backgroundColor: "#F1F8F5",
        borderWidth: 1,
        borderColor: "#7DB58D",
        borderRadius: 20,
        paddingVertical: 5,
        paddingHorizontal: 10,
        maxWidth: 220,
    },
    filePillIcon: { fontSize: 12 },
    filePillName: { fontSize: 12, fontWeight: "600", color: "#4A4A4A", flexShrink: 1 },
    fileDelete: { marginLeft: 4, paddingLeft: 4, paddingVertical: 2 },
    fileDeleteText: { fontSize: 12, fontWeight: "800", color: "#D32F2F" },
});
