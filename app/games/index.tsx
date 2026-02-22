import {
    StyleSheet,
    Text,
    View,
    TouchableOpacity,
    ScrollView,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { Redirect, useRouter, useLocalSearchParams } from "expo-router";
import { useAuth } from "../../context/AuthContext";
import { useProgress, calculateFreshness } from "../../context/ProgressContext";
import { useTheme } from "../../context/ThemeContext";

const STAGES = [
    { key: "remember", num: 1, label: "Seed Library", emoji: "🌾", desc: "Rapid recall on facts" },
    { key: "understand", num: 2, label: "Greenhouse", emoji: "🌿", desc: "Match facts to concepts" },
    { key: "apply", num: 3, label: "Potting Bench", emoji: "🪴", desc: "Complete procedures step-by-step" },
    { key: "analyze", num: 4, label: "Root Router", emoji: "🌳", desc: "Connect stems to facts" },
    { key: "evaluate", num: 5, label: "Companion Planting", emoji: "🌼", desc: "Judge statement pairs" },
    { key: "create", num: 6, label: "Seed Splicer", emoji: "🧬", desc: "Synthesize knowledge" },
];

export default function GameSelectionScreen() {
    const { user } = useAuth();
    const router = useRouter();
    const { state, canUnlockStage } = useProgress();
    const { isDark, colors } = useTheme();
    const { materialId } = useLocalSearchParams<{ materialId: string }>();

    if (!user) return <Redirect href="/login" />;

    const mat = materialId ? state.materials[materialId] : undefined;
    const completedStages = mat?.stagesCompleted ?? [];
    const growthStages = ["🌰", "🌱", "🌿", "🌸", "🌻", "🌳"];
    const growthEmoji = growthStages[Math.min(completedStages.length, growthStages.length - 1)];

    return (
        <View style={[s.container, { backgroundColor: colors.background }]}>
            <StatusBar style={isDark ? "light" : "dark"} />
            <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
                <TouchableOpacity onPress={() => router.back()} activeOpacity={0.6}>
                    <Text style={[s.backButton, { color: colors.accent }]}>← Back</Text>
                </TouchableOpacity>

                <Text style={[s.title, { color: colors.text }]}>{growthEmoji} Growth Stages</Text>
                <Text style={[s.subtitle, { color: colors.muted }]}>
                    {mat?.title ?? "Select a material"}
                </Text>

                <View style={s.stageList}>
                    {STAGES.map((stage) => {
                        const done = completedStages.includes(stage.key);
                        const locked = !canUnlockStage(materialId, stage.key);
                        const stageResult = mat?.stageResults?.[stage.key as keyof NonNullable<typeof mat.stageResults>];
                        const isShiny = stageResult?.variant === "shiny";
                        const freshness = calculateFreshness(stageResult?.lastPlayedTimestamp);
                        const isWilted = done && freshness === 0;

                        const route = `/games/${stage.key}?materialId=${materialId}${freshness < 100 ? "&watering=true" : ""}`;

                        return (
                            <TouchableOpacity
                                key={stage.key}
                                style={[
                                    s.stageCard,
                                    { backgroundColor: colors.card, borderColor: colors.border },
                                    locked && s.stageCardLocked,
                                    done && !isWilted && { borderColor: colors.accent },
                                    isWilted && { borderColor: colors.danger },
                                    isShiny && { borderColor: "#FFD700" },
                                ]}
                                activeOpacity={locked ? 1 : 0.7}
                                disabled={locked}
                                onPress={() => router.push(route as any)}
                            >
                                <Text style={[s.stageEmoji, locked && { opacity: 0.4 }]}>
                                    {isWilted ? "🥀" : stage.emoji}
                                </Text>
                                <View style={s.stageInfo}>
                                    <Text style={[s.stageNum, { color: colors.accent }]}>
                                        Stage {stage.num}
                                    </Text>
                                    <Text style={[s.stageLabel, { color: colors.text }, locked && { color: colors.muted }]}>
                                        {stage.label}
                                    </Text>
                                    <Text style={[s.stageDesc, { color: colors.muted }]}>{stage.desc}</Text>
                                    {done && stageResult && (
                                        <Text style={[s.stageStats, { color: colors.accent }]}>
                                            {Math.round(stageResult.accuracy * 100)}% · x{stageResult.maxCombo}
                                        </Text>
                                    )}
                                </View>
                                {isShiny && <Text style={s.shinyBadge}>✨</Text>}
                                {done && !isWilted && <Text style={[s.checkmark, { color: colors.accent }]}>✓</Text>}
                                {isWilted && <Text style={[s.checkmark, { color: colors.danger }]}>!</Text>}
                                {locked && <Text style={s.lockEmoji}>🔒</Text>}
                            </TouchableOpacity>
                        );
                    })}
                </View>
            </ScrollView>
        </View>
    );
}

const s = StyleSheet.create({
    container: { flex: 1 },
    content: { paddingHorizontal: 24, paddingTop: 64, paddingBottom: 40 },
    backButton: { fontSize: 16, fontWeight: "600", marginBottom: 20 },
    title: { fontSize: 26, fontWeight: "700", letterSpacing: 0.3 },
    subtitle: { fontSize: 15, marginTop: 8, lineHeight: 22, marginBottom: 28 },
    stageList: { gap: 12 },
    stageCard: {
        flexDirection: "row",
        alignItems: "center",
        borderRadius: 16,
        padding: 18,
        borderWidth: 1,
    },
    stageCardLocked: { opacity: 0.5 },
    stageEmoji: { fontSize: 32, marginRight: 16 },
    stageInfo: { flex: 1 },
    stageNum: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1, marginBottom: 2 },
    stageLabel: { fontSize: 17, fontWeight: "600" },
    stageDesc: { fontSize: 13, marginTop: 2 },
    stageStats: { fontSize: 11, fontWeight: "700", marginTop: 4 },
    checkmark: { fontSize: 20, fontWeight: "700", marginLeft: 8 },
    lockEmoji: { fontSize: 18, marginLeft: 8 },
    shinyBadge: { fontSize: 16, marginLeft: 4 },
});
