import { useRef, useState, useEffect, useMemo } from "react";
import {
    StyleSheet,
    Text,
    View,
    TouchableOpacity,
    ScrollView,
    Animated as RNAnimated,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { Redirect, useRouter, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import { useAuth } from "../context/AuthContext";
import { useProgress, type CompostItem } from "../context/ProgressContext";
import { useTheme } from "../context/ThemeContext";
import {
    updateCombo,
    getComboMultiplier,
    getHypeText,
    triggerHaptic,
} from "../lib/engagement";
import { ParticleSystem, generateExplosionParticles, type Particle } from "../lib/ParticleSystem";

// Very fast timer for compost to force rapid recall
const QUESTION_SECONDS = 5;
const MAX_LIVES = 3;

type Phase = "intro" | "challenge" | "complete" | "gameover";

export default function CompostScreen() {
    const { user } = useAuth();
    const router = useRouter();
    const { state, removeFromCompost, addWaterDrops } = useProgress();
    const { isDark, colors } = useTheme();
    const params = useLocalSearchParams<{ materialId?: string | string[] }>();
    const selectedMaterialId = Array.isArray(params.materialId)
        ? params.materialId[0]
        : params.materialId;

    const compostItems = selectedMaterialId
        ? (state.compost || []).filter((item) =>
            selectedMaterialId === "unknown"
                ? !item.materialId
                : item.materialId === selectedMaterialId
        )
        : (state.compost || []);

    const challengeItems = useMemo(() => {
        // Take up to 10 random compost items
        const shuffled = [...compostItems].sort(() => Math.random() - 0.5);
        return shuffled.slice(0, Math.min(10, shuffled.length));
    }, [compostItems]);

    const [phase, setPhase] = useState<Phase>("intro");
    const [questionTimer, setQuestionTimer] = useState(QUESTION_SECONDS);
    const [currentQ, setCurrentQ] = useState(0);
    const [lives, setLives] = useState(MAX_LIVES);
    const [clearedCount, setClearedCount] = useState(0);
    const [wrongCard, setWrongCard] = useState<number | null>(null);
    const [correctCard, setCorrectCard] = useState<number | null>(null);
    const [combo, setCombo] = useState(0);

    const [hypeText, setHypeText] = useState<{ text: string; color: string } | null>(null);
    const [particles, setParticles] = useState<Particle[]>([]);

    // Penalty timer state
    const [penaltyTimerActive, setPenaltyTimerActive] = useState(false);

    const shakeAnim = useRef(new RNAnimated.Value(0)).current;
    const wrongShakeAnim = useRef(new RNAnimated.Value(0)).current;
    const frenzyZoomAnim = useRef(new RNAnimated.Value(1)).current;
    const hypeAnim = useRef(new RNAnimated.Value(0)).current;
    const frenzyAnim = useRef(new RNAnimated.Value(0)).current;
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Define 4 options for the current question
    const currentOptions = useMemo(() => {
        if (phase !== "challenge" || currentQ >= challengeItems.length) return [];

        const currentFact = challengeItems[currentQ];

        // Pick 3 wrong answers from the rest of the compost, or generate some if not enough
        const others = compostItems.filter(c => c.id !== currentFact.id).map(c => c.answer);
        while (others.length < 3) {
            others.push("Dummy Wrong Answer " + Math.random().toString(36).substring(7));
        }

        // Get 3 random unique wrong answers
        const wrongAnswers = others.sort(() => Math.random() - 0.5).slice(0, 3);

        const combined = [currentFact.answer, ...wrongAnswers];
        return combined.sort(() => Math.random() - 0.5).map((answer, index) => ({
            answer,
            isCorrect: answer === currentFact.answer
        }));
    }, [phase, currentQ, challengeItems, compostItems]);

    if (!user) return <Redirect href="/login" />;

    // Challenge timer
    useEffect(() => {
        if (phase !== "challenge") return;
        setQuestionTimer(QUESTION_SECONDS);
        timerRef.current = setInterval(() => {
            setQuestionTimer((prev) => {
                if (prev <= 1) {
                    if (timerRef.current) clearInterval(timerRef.current);
                    handleTimeout();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }, [phase, currentQ]);

    // animations same as remember.tsx ...
    useEffect(() => {
        if (!hypeText) return;
        hypeAnim.setValue(1);
        RNAnimated.timing(hypeAnim, { toValue: 0, duration: 1200, useNativeDriver: true }).start(() => setHypeText(null));
    }, [hypeText]);

    useEffect(() => {
        const isFrenzy = combo >= 3; // compost frenzy is easier to hit
        if (isFrenzy) {
            RNAnimated.loop(
                RNAnimated.sequence([
                    RNAnimated.timing(frenzyAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
                    RNAnimated.timing(frenzyAnim, { toValue: 0.5, duration: 200, useNativeDriver: true }),
                ])
            ).start();

            RNAnimated.spring(frenzyZoomAnim, {
                toValue: 1.05,
                useNativeDriver: true,
                speed: 50,
                bounciness: 8,
            }).start();
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } else {
            frenzyAnim.setValue(0);
            RNAnimated.spring(frenzyZoomAnim, {
                toValue: 1,
                useNativeDriver: true,
                speed: 50,
                bounciness: 0,
            }).start();
        }
    }, [combo]);

    useEffect(() => {
        if (!penaltyTimerActive) return;
        const timeout = setTimeout(() => {
            setPenaltyTimerActive(false);
        }, 1000);
        return () => clearTimeout(timeout);
    }, [penaltyTimerActive]);

    // Bug #3 fix: Award Compost XP when the session completes.
    // IMPORTANT: this must live at the top level of the component (Rules of Hooks),
    // NOT inside the phase === 'complete' early-return branch.
    useEffect(() => {
        if (phase !== "complete") return;
        const xpReward = clearedCount * 15;
        if (xpReward > 0) addWaterDrops(xpReward);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [phase]); // Only fire once when phase transitions to 'complete'

    if (compostItems.length === 0 && phase === "intro") {
        return (
            <View style={[s.container, { backgroundColor: colors.background }]}>
                <StatusBar style={isDark ? "light" : "dark"} />
                <View style={s.center}>
                    <Text style={s.bigEmoji}>✨</Text>
                    <Text style={s.title}>Compost Empty!</Text>
                    <Text style={s.sub}>Your garden is clean. Keep studying to find tricky concepts!</Text>
                    <TouchableOpacity style={[s.btn, { backgroundColor: colors.accent }]} onPress={() => router.back()}>
                        <Text style={s.btnText}>Return to Compost</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    }

    const doShake = (intensity: "light" | "heavy") => {
        const target = intensity === "heavy" ? wrongShakeAnim : shakeAnim;
        const distance = intensity === "heavy" ? 15 : 10;
        const duration = intensity === "heavy" ? 80 : 50;

        RNAnimated.sequence([
            RNAnimated.timing(target, { toValue: distance, duration, useNativeDriver: true }),
            RNAnimated.timing(target, { toValue: -distance, duration, useNativeDriver: true }),
            RNAnimated.timing(target, { toValue: distance, duration, useNativeDriver: true }),
            RNAnimated.timing(target, { toValue: -distance, duration, useNativeDriver: true }),
            RNAnimated.timing(target, { toValue: 0, duration, useNativeDriver: true }),
        ]).start();
    };

    const handleTimeout = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        doShake("heavy");
        setCombo(0);
        setHypeText(getHypeText(0, false));
        const newLives = lives - 1;
        setLives(newLives);
        if (newLives <= 0) {
            setPhase("gameover");
        } else {
            advanceQuestion();
        }
    };

    const advanceQuestion = () => {
        setWrongCard(null);
        setCorrectCard(null);
        if (currentQ + 1 >= challengeItems.length) {
            if (timerRef.current) clearInterval(timerRef.current);
            setPhase("complete");
        } else {
            setCurrentQ((prev) => prev + 1);
        }
    };

    const handleChallengeTap = (idx: number) => {
        if (phase !== "challenge" || wrongCard !== null || correctCard !== null) return;
        const isCorrect = currentOptions[idx].isCorrect;

        if (isCorrect) {
            // CORRECT - Remove from compost
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            setCorrectCard(idx);
            setClearedCount((prev) => prev + 1);

            const newCombo = combo + 1;
            setCombo(newCombo);
            setHypeText(getHypeText(newCombo, true));

            const itemId = challengeItems[currentQ].id;
            removeFromCompost(itemId); // Purge from bin

            // ✨ PARTICLE EXPLOSION
            const explosionParticles = generateExplosionParticles(150, 200, 60, 60, 14);
            setParticles((prev) => [...prev, ...explosionParticles]);
            setTimeout(() => setParticles((prev) => prev.filter((p) => !explosionParticles.find((ep) => ep.id === p.id))), 1300);

            if (timerRef.current) clearInterval(timerRef.current);
            setTimeout(() => advanceQuestion(), 500);
        } else {
            // WRONG
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            doShake("heavy");
            setWrongCard(idx);
            setCorrectCard(currentOptions.findIndex(o => o.isCorrect));

            if (combo >= 3) {
                setQuestionTimer((prev) => Math.max(0, prev - 3));
                setPenaltyTimerActive(true);
            }

            setCombo(0);
            setHypeText(getHypeText(0, false));
            if (timerRef.current) clearInterval(timerRef.current);

            setTimeout(() => {
                const newLives = lives - 1;
                setLives(newLives);
                if (newLives <= 0) {
                    setPhase("gameover");
                } else {
                    setWrongCard(null);
                    setCorrectCard(null);
                    if (currentQ + 1 >= challengeItems.length) setPhase("complete");
                    else setCurrentQ((prev) => prev + 1);
                }
            }, 1000);
        }
    };

    if (phase === "intro") {
        return (
            <View style={[s.container, { backgroundColor: colors.background }]}>
                <StatusBar style={isDark ? "light" : "dark"} />
                <View style={s.center}>
                    <Text style={s.bigEmoji}>🗑️</Text>
                    <Text style={s.title}>The Compost Bin</Text>
                    <Text style={s.sub}>You have {compostItems.length} stubborn concepts to review. Clear them to earn massive XP!</Text>
                    <TouchableOpacity style={[s.btnXtreme, { backgroundColor: colors.accent }]} onPress={() => setPhase("challenge")}>
                        <Text style={s.btnText}>Start Purge</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[s.btn2, { borderColor: colors.accent }]} onPress={() => router.back()}>
                        <Text style={[s.btn2Text, { color: colors.accent }]}>Go Back</Text>
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
                    <Text style={s.title}>Overwhelmed!</Text>
                    <Text style={s.sub}>Cleared {clearedCount} concepts before running out of lives.</Text>
                    <TouchableOpacity style={[s.btnXtreme, { backgroundColor: colors.accent }]} onPress={() => router.replace("/compost-session")}>
                        <Text style={s.btnText}>Try Again</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[s.btn2, { borderColor: colors.accent }]} onPress={() => router.back()}>
                        <Text style={[s.btn2Text, { color: colors.accent }]}>Return to Garden</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    }

    if (phase === "complete") {
        const xpReward = clearedCount * 15; // massive xp
        return (
            <View style={[s.container, { backgroundColor: colors.background }]}>
                <StatusBar style={isDark ? "light" : "dark"} />
                <View style={s.center}>
                    <Text style={s.bigEmoji}>🌸</Text>
                    <Text style={s.title}>Compost Cleared!</Text>
                    <View style={[s.xpBadge, { backgroundColor: colors.accent }]}>
                        <Text style={s.xpText}>+{xpReward} Water Drops</Text>
                    </View>
                    <Text style={s.sub}>You removed {clearedCount} weeds from your garden.</Text>
                    <TouchableOpacity style={[s.btn, { backgroundColor: colors.accent }]} onPress={() => router.back()}>
                        <Text style={s.btnText}>Return to Garden</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    }

    const timerColor = penaltyTimerActive ? "#FF6B6B" : questionTimer <= 2 ? "#E57373" : "#7DB58D";

    return (
        <View style={[s.containerXtreme, { backgroundColor: colors.background }]}>
            <StatusBar style={isDark ? "light" : "dark"} />
            {combo >= 3 && (
                <RNAnimated.View
                    style={[s.frenzyOverlay, { opacity: frenzyAnim }]}
                    pointerEvents="none"
                >
                    <Text style={s.frenzyText}>FERMENTING!</Text>
                </RNAnimated.View>
            )}

            <View style={s.header}>
                <TouchableOpacity onPress={() => router.back()} activeOpacity={0.6}>
                    <Text style={[s.back, { color: colors.accent }]}>← Retreat</Text>
                </TouchableOpacity>
                <Text style={[s.tag, { color: colors.muted }]}>Compost Purge mode</Text>
            </View>

            <View style={[s.bannerXtreme, { backgroundColor: colors.card }]}>
                <Text style={[s.bannerTitle, { color: colors.text }]}>Find the match:</Text>
                <View style={[s.defBox, { backgroundColor: colors.surface, borderColor: colors.border }]}
                >
                    <Text style={[s.defText, { color: colors.text }]}>{challengeItems[currentQ]?.question}</Text>
                </View>
            </View>

            <View style={s.stats}>
                <RNAnimated.Text style={[s.timer, { color: timerColor }]}>
                    {questionTimer}s
                    {penaltyTimerActive && <Text style={{ fontSize: 10 }}> -3s</Text>}
                </RNAnimated.Text>
                <Text style={[s.seedCount, { color: colors.muted }]}>🗑️ {clearedCount}/{challengeItems.length}</Text>
                {combo >= 2 && <Text style={[s.comboText, { color: colors.accent }]}>x{getComboMultiplier(combo).toFixed(1)}</Text>}
                <Text style={s.lives}>{"❤️".repeat(lives)}{"🖤".repeat(MAX_LIVES - lives)}</Text>
            </View>

            {hypeText && (
                <RNAnimated.Text style={[s.hype, { color: hypeText.color, opacity: hypeAnim }]}>
                    {hypeText.text}
                </RNAnimated.Text>
            )}

            <ScrollView showsVerticalScrollIndicator={false} style={s.scroll}>
                <RNAnimated.View style={[s.grid, { transform: [{ scale: frenzyZoomAnim }, { translateX: wrongShakeAnim }] }]}>
                    {currentOptions.map((opt, idx) => {
                        const isWrong = wrongCard === idx;
                        const isCorrect = correctCard === idx;

                        return (
                            <TouchableOpacity
                                key={idx}
                                style={[
                                    s.seed,
                                    { backgroundColor: colors.card, borderColor: colors.border },
                                    isWrong && [s.seedWrong, { backgroundColor: colors.dangerSoft, borderColor: colors.danger }],
                                    isCorrect && [s.seedCorrect, { backgroundColor: colors.accentSoft, borderColor: colors.accent }],
                                ]}
                                onPress={() => handleChallengeTap(idx)}
                                activeOpacity={0.7}
                            >
                                <Text
                                    style={[s.seedText, { color: colors.text }, isCorrect && s.seedTextCorrect]}
                                    numberOfLines={4}
                                >
                                    {opt.answer}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </RNAnimated.View>
            </ScrollView>

            <ParticleSystem particles={particles} />
        </View>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, paddingHorizontal: 20, paddingTop: 56, paddingBottom: 20 },
    containerXtreme: { flex: 1, paddingHorizontal: 20, paddingTop: 56, paddingBottom: 20 },
    center: { flex: 1, justifyContent: "center", alignItems: "center" },
    bigEmoji: { fontSize: 64, marginBottom: 12 },
    title: { fontSize: 26, fontWeight: "700", marginBottom: 8 },
    sub: { fontSize: 15, textAlign: "center", lineHeight: 22, marginBottom: 20 },
    errorText: { fontSize: 17, marginBottom: 24 },
    xpBadge: { borderRadius: 20, paddingHorizontal: 16, paddingVertical: 6, marginBottom: 10 },
    xpText: { color: "#FFF", fontSize: 16, fontWeight: "700" },
    btn: { borderRadius: 14, paddingVertical: 16, paddingHorizontal: 32, alignItems: "center", marginBottom: 12, width: "100%" },
    btnXtreme: { borderRadius: 14, paddingVertical: 16, paddingHorizontal: 32, alignItems: "center", marginBottom: 12, width: "100%" },
    btnText: { color: "#FFF", fontSize: 17, fontWeight: "600" },
    btn2: { borderWidth: 1.5, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 32, alignItems: "center", width: "100%" },
    btn2Text: { fontSize: 16, fontWeight: "600" },
    header: { marginBottom: 10 },
    back: { fontSize: 16, fontWeight: "600", marginBottom: 10 },
    tag: { fontSize: 13, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1 },
    bannerXtreme: { borderRadius: 16, padding: 14, marginBottom: 10 },
    bannerTitle: { fontSize: 15, fontWeight: "700", marginBottom: 4 },
    defBox: { borderRadius: 12, padding: 12, marginTop: 6, borderWidth: 1 },
    defText: { fontSize: 14, lineHeight: 20 },
    stats: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
    timer: { fontSize: 22, fontWeight: "800" },
    seedCount: { fontSize: 14, fontWeight: "600" },
    comboText: { fontSize: 16, fontWeight: "800" },
    lives: { fontSize: 16 },
    hype: { textAlign: "center", fontWeight: "800", fontSize: 18, marginBottom: 4 },
    scroll: { flex: 1 },
    grid: { flexDirection: "column", gap: 12, paddingBottom: 16 },
    seed: { width: "100%", borderWidth: 2, borderRadius: 14, padding: 16, minHeight: 64, justifyContent: "center", alignItems: "center" },
    seedWrong: { },
    seedCorrect: { },
    seedText: { fontSize: 15, fontWeight: "600", textAlign: "center" },
    seedTextCorrect: { },
    frenzyOverlay: { position: "absolute", top: "45%", left: 0, right: 0, alignItems: "center", zIndex: 99 },
    frenzyText: { fontSize: 28, fontWeight: "900", color: "#81C784", textShadowColor: "rgba(0,0,0,0.5)", textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 4 },
});
