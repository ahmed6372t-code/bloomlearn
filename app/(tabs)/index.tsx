import { useRef, useEffect, useCallback, useState } from "react";
import {
    View, Text, TouchableOpacity,
    StyleSheet, Animated, ActivityIndicator, Alert, Switch,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { Redirect, useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { doc, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../../firebaseConfig";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import {
    useProgress,
    getStreakMultiplier,
    getStreakLabel,
} from "../../context/ProgressContext";
import { useFilePicker } from "../../lib/useFilePicker";
import { uploadStudyFile } from "../../lib/uploadStudyFile";
import type { RecipeMatrix } from "../../lib/gemini";

// ── PlantGrowth widget ────────────────────────────────────────────────────────

type Encouragement = { start: string; middle: string; end: string; author: string; year: string };

const ENCOURAGEMENTS: Encouragement[] = [
    { start: "Education is the most powerful weapon", middle: "which we can use", end: ".", author: "Nelson Mandela", year: "1990" },
    { start: "The more that you read,", middle: "the more things you will know", end: ". The more that you learn, the more places you'll go.", author: "Dr. Seuss", year: "1978" },
    { start: "You have brains in your head.", middle: "You can steer yourself", end: "any direction you choose.", author: "Dr. Seuss", year: "1990" },
    { start: "The beautiful thing about learning is", middle: "nobody can take it away", end: "from you.", author: "B.B. King", year: "1997" },
    { start: "Liberty without learning is", middle: "always in peril", end: "; learning without liberty is always in vain.", author: "John F. Kennedy", year: "1963" },
    { start: "If you think education is expensive -", middle: "try ignorance", end: ".", author: "Ann Landers", year: "1975" },
    { start: "Education, therefore, is", middle: "a process of living", end: "and not a preparation for future living.", author: "John Dewey", year: "1897" },
    { start: "The central task of education is to implant a will and facility for learning; it should produce not learned but", middle: "learning people", end: ".", author: "Eric Hoffer", year: "2006" },
];

function getRandomEncouragement(): Encouragement {
    return ENCOURAGEMENTS[Math.floor(Math.random() * ENCOURAGEMENTS.length)];
}

function getPlantEmoji(lvl: number): string {
    if (lvl < 1) return "🏜️";
    if (lvl < 5) return "🌱";
    if (lvl < 10) return "🌿";
    if (lvl < 15) return "🪴";
    if (lvl < 20) return "🌸";
    return "🌳";
}

function PlantGrowth({ level, totalXP, colors }: { level: number; totalXP: number; colors: { card: string; border: string; accent: string; accentSoft: string; muted: string } }) {
    const xpInLevel = totalXP - level * 200;
    const progressPercent = (xpInLevel / 200) * 100;
    const scaleAnim = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        Animated.loop(
            Animated.sequence([
                Animated.timing(scaleAnim, { toValue: 1.05, duration: 2000, useNativeDriver: true }),
                Animated.timing(scaleAnim, { toValue: 1, duration: 2000, useNativeDriver: true }),
            ])
        ).start();
    }, []);

    return (
        <View style={[s.plantContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Animated.Text style={[s.plantEmoji, { transform: [{ scale: scaleAnim }] }]}>
                {getPlantEmoji(level)}
            </Animated.Text>
            <Text style={[s.levelText, { color: colors.accent }]}>Level {level}</Text>
            <View style={s.progressBarContainer}>
                <View style={[s.progressBarBg, { backgroundColor: colors.accentSoft }]}
                >
                    <View style={[s.progressBarFill, { width: `${progressPercent}%`, backgroundColor: colors.accent }]} />
                </View>
                <Text style={[s.xpText, { color: colors.muted }]}>{xpInLevel}/200 Water Drops</Text>
            </View>
        </View>
    );
}

// ── Garden Screen ─────────────────────────────────────────────────────────────

export default function GardenScreen() {
    const { user } = useAuth();
    const router = useRouter();
    const { state, registerMaterial, linkFileToMaterial, setGoldenHourActive } = useProgress();
    const theme = useTheme();
    const { isDark, colors } = theme;
    const toggleTheme = theme?.toggleTheme ?? (() => {});
    const { pickFile, isPicking } = useFilePicker();
    const [isBaking, setIsBaking] = useState(false);
    const quoteQueue = useRef<Encouragement[]>([]);
    const leaveCount = useRef(0);
    const shouldAdvanceQuote = useRef(false);
    const [encouragement, setEncouragement] = useState<Encouragement>(getRandomEncouragement());

    const nextEncouragement = useCallback(() => {
        if (quoteQueue.current.length === 0) {
            const shuffled = [...ENCOURAGEMENTS].sort(() => Math.random() - 0.5);
            quoteQueue.current = shuffled;
        }
        const next = quoteQueue.current.shift();
        if (next) setEncouragement(next);
    }, []);

    useFocusEffect(
        useCallback(() => {
            if (shouldAdvanceQuote.current) {
                nextEncouragement();
                shouldAdvanceQuote.current = false;
                leaveCount.current = 0;
            }

            return () => {
                leaveCount.current += 1;
                if (leaveCount.current >= 3) {
                    shouldAdvanceQuote.current = true;
                }
            };
        }, [nextEncouragement])
    );

    // Golden Hour listener — top-level, no early return above
    useEffect(() => {
        if (!user) return undefined;
        const ref = doc(db, "config", "global_events");
        const unsub = onSnapshot(
            ref,
            (snap) => {
                setGoldenHourActive(!!snap.data()?.eventActive);
            },
            (error) => {
                if (error?.code !== "permission-denied") {
                    console.warn("Golden hour listener failed", error);
                }
            }
        );
        return unsub;
    }, [setGoldenHourActive, user]);

    const handleGenerateFromFile = useCallback(async () => {
        if (!user) return;
        try {
            const file = await pickFile();
            if (!file) return;

            setIsBaking(true);

            const materialId = Date.now().toString(36);
            const { storageUri, downloadUrl } = await uploadStudyFile({
                localUri: file.uri,
                uid: user.uid,
                materialId,
                fileName: file.name,
                mimeType: file.mimeType,
            });

            const bakeMaterial = httpsCallable<
                { storageUri?: string; downloadUrl?: string; mimeType?: string },
                RecipeMatrix
            >(functions, "bakeMaterial");

            const payload = {
                storageUri,
                downloadUrl,
                mimeType: file.mimeType ?? undefined,
            };

            const result = await bakeMaterial(payload);

            const matrix = result.data;
            const sourceLabel = `[file] ${storageUri}`;

            registerMaterial(materialId, matrix.topic_title, "Imported", sourceLabel, matrix);
            linkFileToMaterial(materialId, {
                name: file.name,
                storageUri,
                downloadUrl,
                mimeType: file.mimeType ?? null,
                size: file.size ?? null,
                addedAt: Date.now(),
            });
            router.push({ pathname: "/games/remember", params: { materialId } });
        } catch (err: any) {
            const msg = err?.message || err?.details || "Failed to bake study material.";
            Alert.alert("Planting Failed", msg);
        } finally {
            setIsBaking(false);
        }
    }, [pickFile, registerMaterial, router, user]);

    if (!user) return <Redirect href="/login" />;

    const level = Math.floor(state.totalXP / 200);
    const multiplier = getStreakMultiplier(state.streakData.currentStreak);

    return (
        <View style={[s.container, { backgroundColor: colors.background }]}>
            <StatusBar style={isDark ? "light" : "dark"} />
            <View style={s.content}>

                {/* Golden Hour Banner */}
                {state.goldenHourActive && (
                    <View style={s.goldenBanner}>
                        <Text style={s.goldenBannerTitle}>✨ GOLDEN HOUR ✨</Text>
                        <Text style={s.goldenBannerSub}>Mutation rate doubled for all plants</Text>
                    </View>
                )}

                {/* Header */}
                <View style={s.header}>
                    <View style={s.headerRow}>
                        <View>
                            <Text style={[s.greeting, { color: colors.text }]}>Your Garden</Text>
                            <Text style={[s.email, { color: colors.muted }]}>{user.email}</Text>
                        </View>
                        <View style={s.headerActions}>
                            <Switch
                                value={isDark}
                                onValueChange={toggleTheme}
                                trackColor={{ false: "#D8D0C6", true: "#4B6B55" }}
                                thumbColor={isDark ? "#8BC49B" : "#F5F1EB"}
                            />
                            <TouchableOpacity
                                style={[s.settingsButton, { backgroundColor: colors.surface }]}
                                onPress={() => router.push("/settings")}
                                activeOpacity={0.7}
                            >
                                <Ionicons name="settings-outline" size={18} color={colors.accent} />
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>

                {isBaking && (
                    <View style={s.bakingBanner}>
                        <ActivityIndicator color="#7DB58D" size="small" />
                        <Text style={s.bakingText}>🧠 The Sieve is analyzing your material...</Text>
                    </View>
                )}

                {/* Import */}
                <View style={[s.actionCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                >
                    <TouchableOpacity
                        style={[s.primaryButton, (isBaking || isPicking) && s.buttonDisabled]}
                        onPress={() => router.push("/importer")}
                        activeOpacity={0.85}
                        disabled={isBaking || isPicking}
                    >
                        <View style={s.buttonTextBlock}>
                            <Text style={s.primaryButtonTitle}>Plant New Seeds</Text>
                            <Text style={s.primaryButtonSub}>Paste notes or study material</Text>
                        </View>
                        <Text style={s.primaryButtonEmoji}>🌱</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[
                            s.secondaryButton,
                            { backgroundColor: colors.surface, borderColor: colors.border },
                            (isBaking || isPicking) && s.buttonDisabled,
                        ]}
                        onPress={handleGenerateFromFile}
                        disabled={isBaking || isPicking}
                        activeOpacity={0.8}
                    >
                        <Text style={[s.secondaryButtonTitle, { color: colors.text }]}>
                            {isBaking ? "Generating..." : "Generate from File"}
                        </Text>
                        <Text style={[s.secondaryButtonSub, { color: colors.muted }]}>PDF, TXT, or Markdown</Text>
                    </TouchableOpacity>
                </View>

                {/* Level / XP */}
                <PlantGrowth level={level} totalXP={state.totalXP} colors={colors} />

                {/* Stats */}
                <View style={s.statsCard}>
                    <View style={[s.statBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                        <Text style={[s.statNumber, { color: colors.accent }]}>{state.totalXP}</Text>
                        <Text style={[s.statName, { color: colors.muted }]}>Water Drops</Text>
                    </View>
                    <View style={[s.statBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                        <Text style={[s.statNumber, { color: colors.accent }]}>{state.totalStars}</Text>
                        <Text style={[s.statName, { color: colors.muted }]}>Plots Mastered</Text>
                    </View>
                    <View
                        style={[
                            s.statBox,
                            { backgroundColor: colors.card, borderColor: colors.border },
                            state.streakData.currentStreak > 0 && s.statBoxStreak,
                        ]}
                    >
                        <Text style={s.streakEmoji}>🌞</Text>
                        <Text style={[s.streakNumber, { color: colors.accent }]}>
                            {state.streakData.currentStreak}
                        </Text>
                        <Text style={[s.statName, { color: colors.muted }]}>
                            {getStreakLabel(state.streakData.currentStreak)}
                        </Text>
                        {multiplier > 1 && (
                            <Text style={[s.multiplierBadge, { backgroundColor: colors.accent }]}>
                                {multiplier.toFixed(1)}x XP
                            </Text>
                        )}
                    </View>
                    <View style={[s.statBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                        <Text style={[s.statNumber, { color: colors.accent }]}>{state.totalPestsSwatted || 0}</Text>
                        <Text style={[s.statName, { color: colors.muted }]}>Pests Swatted</Text>
                    </View>
                    <View style={[s.statBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                        <Text style={[s.statNumber, { color: colors.accent }]}>x{state.highestFrenzyCombo || 0}</Text>
                        <Text style={[s.statName, { color: colors.muted }]}>Max Combo</Text>
                    </View>
                </View>


                {/* Hybrid Blooms */}
                {state.hybrids.length > 0 && (
                    <View style={s.hybridSection}>
                        <Text style={[s.sectionTitle, { color: colors.text }]}>🌺 Hybrid Blooms</Text>
                        <View style={s.hybridList}>
                            {state.hybrids.slice(0, 6).map((hybrid) => (
                                <View
                                    key={hybrid.id}
                                    style={[s.hybridCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                                >
                                    <Text style={[s.hybridTitle, { color: colors.text }]}>
                                        {hybrid.rootConcept} + {hybrid.scionText}
                                    </Text>
                                    <Text style={[s.hybridSub, { color: colors.muted }]}>
                                        Confidence {Math.round(hybrid.confidence * 100)}%
                                    </Text>
                                </View>
                            ))}
                        </View>
                    </View>
                )}

                {state.mutations.length > 0 && (
                    <View style={s.mutationSection}>
                        <Text style={[s.sectionTitle, { color: colors.text }]}>✨ Shiny Mutations</Text>
                        <View style={s.mutationList}>
                            {state.mutations.slice(0, 6).map((mutation) => (
                                <View
                                    key={mutation.id}
                                    style={[s.mutationCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                                >
                                    <View style={[s.mutationDot, { backgroundColor: mutation.color }]} />
                                    <View style={s.mutationTextBlock}>
                                        <Text style={[s.mutationTitle, { color: colors.text }]}>
                                            {mutation.conceptA} × {mutation.procedureB}
                                        </Text>
                                        <Text style={[s.mutationSub, { color: colors.muted }]}>
                                            {mutation.rarity.toUpperCase()} rarity
                                        </Text>
                                    </View>
                                </View>
                            ))}
                        </View>
                    </View>
                )}

                {/* Footer buttons */}
                <TouchableOpacity
                    style={[s.historyButton, { borderColor: colors.accent, backgroundColor: colors.accentSoft }]}
                    onPress={() => router.push("/history")}
                    activeOpacity={0.8}
                >
                    <Text style={[s.historyButtonText, { color: colors.accent }]}>📋 My Garden Plots</Text>
                </TouchableOpacity>

                <View style={s.encouragementWrap}>
                    <Text style={[s.encouragementText, { color: colors.text }]}>
                        {encouragement.start}{" "}
                        <Text style={[s.encouragementBold, { color: colors.text }]}>{encouragement.middle}</Text>{" "}
                        {encouragement.end}
                    </Text>
                    <Text style={[s.encouragementMeta, { color: colors.muted }]}>
                        — {encouragement.author}, {encouragement.year}
                    </Text>
                </View>
            </View>
        </View>
    );
}

const s = StyleSheet.create({
    container: { flex: 1 },
    content: { flex: 1, paddingHorizontal: 16, paddingTop: 44, paddingBottom: 16, gap: 12 },
    headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    headerActions: { flexDirection: "row", alignItems: "center", gap: 8 },
    settingsButton: { padding: 6, borderRadius: 10, backgroundColor: "#EFEBE9", alignSelf: "flex-start" },
    header: { marginBottom: 8 },
    greeting: { fontSize: 28, fontWeight: "700", letterSpacing: 0.3 },
    email: { fontSize: 14, marginTop: 4 },
    sectionTitle: { fontSize: 16, fontWeight: "800", marginBottom: 10 },
    bakingBanner: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#F1F8F5", borderRadius: 12, paddingVertical: 8, paddingHorizontal: 10, borderWidth: 1, borderColor: "#D8EDE0" },
    bakingText: { fontSize: 13, fontWeight: "600", color: "#5D4037" },

    actionCard: {
        borderRadius: 14,
        padding: 12,
        borderWidth: 1,
        gap: 10,
    },
    primaryButton: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        backgroundColor: "#7DB58D",
        borderRadius: 12,
        paddingVertical: 12,
        paddingHorizontal: 12,
    },
    primaryButtonTitle: { fontSize: 14, fontWeight: "700", color: "#FFFFFF" },
    primaryButtonSub: { fontSize: 11, color: "rgba(255,255,255,0.85)", marginTop: 2 },
    primaryButtonEmoji: { fontSize: 22 },
    buttonTextBlock: { flex: 1, paddingRight: 12 },

    secondaryButton: {
        borderRadius: 12,
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderWidth: 1,
    },
    secondaryButtonTitle: { fontSize: 13, fontWeight: "700" },
    secondaryButtonSub: { fontSize: 11, marginTop: 2 },
    buttonDisabled: { opacity: 0.6 },

    goldenBanner: { backgroundColor: "#FFECB3", borderColor: "#FFD700", borderWidth: 1, borderRadius: 14, paddingVertical: 6, paddingHorizontal: 10, alignItems: "center" },
    goldenBannerTitle: { fontSize: 14, fontWeight: "800", color: "#B88700", letterSpacing: 1 },
    goldenBannerSub: { fontSize: 12, color: "#7A5A00", marginTop: 4, fontWeight: "600" },

    plantContainer: { borderRadius: 16, padding: 14, borderWidth: 1, alignItems: "center" },
    plantEmoji: { fontSize: 48, marginBottom: 6 },
    levelText: { fontSize: 16, fontWeight: "700", marginBottom: 2 },
    progressBarContainer: { width: "100%", marginTop: 12 },
    progressBarBg: { height: 8, borderRadius: 4, overflow: "hidden", marginBottom: 6 },
    progressBarFill: { height: "100%", borderRadius: 4 },
    xpText: { fontSize: 12, textAlign: "center", fontWeight: "600" },

    statsCard: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 8 },

    hybridSection: { },
    hybridList: { gap: 6 },
    hybridCard: { borderRadius: 12, padding: 8, borderWidth: 1 },
    hybridTitle: { fontSize: 12, fontWeight: "700" },
    hybridSub: { fontSize: 10, marginTop: 2, fontWeight: "600" },

    mutationSection: { },
    mutationList: { gap: 6 },
    mutationCard: { borderRadius: 12, padding: 8, borderWidth: 1, flexDirection: "row", alignItems: "center", gap: 8 },
    mutationDot: { width: 12, height: 12, borderRadius: 6 },
    mutationTextBlock: { flex: 1 },
    mutationTitle: { fontSize: 13, fontWeight: "700" },
    mutationSub: { fontSize: 11, marginTop: 2, fontWeight: "600" },
    statBox: { padding: 10, borderRadius: 14, flex: 1, minWidth: "30%", alignItems: "center", borderColor: "#E8E8E8" },
    statNumber: { fontSize: 18, fontWeight: "700" },
    statName: { fontSize: 11, marginTop: 4, fontWeight: "600" },
    statBoxStreak: { backgroundColor: "#FFFAED", borderColor: "#FFD700" },
    streakEmoji: { fontSize: 20, marginBottom: 2 },
    streakNumber: { fontSize: 20, fontWeight: "700", color: "#FFB800", lineHeight: 24 },
    multiplierBadge: { fontSize: 10, color: "#FFF", backgroundColor: "#FF9800", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginTop: 4, fontWeight: "700", overflow: "hidden" },

    historyButton: { borderWidth: 1.5, borderRadius: 12, paddingVertical: 10, alignItems: "center" },
    historyButtonText: { fontSize: 13, fontWeight: "700" },
    encouragementWrap: { flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 10 },
    encouragementText: { fontSize: 14, textAlign: "center", fontWeight: "500", lineHeight: 20 },
    encouragementBold: { fontWeight: "800" },
    encouragementMeta: { marginTop: 6, fontSize: 11, fontWeight: "600" },
});
