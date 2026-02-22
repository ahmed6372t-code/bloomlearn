import { useState, useEffect, useMemo, useRef } from "react";
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Animated,
  Modal,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { Redirect, useRouter, useLocalSearchParams } from "expo-router";
import { useAuth } from "../../context/AuthContext";
import { useProgress } from "../../context/ProgressContext";
import { useTheme } from "../../context/ThemeContext";
import {
  updateCombo,
  getComboMultiplier,
  getHypeText,
  rollForGoldenSeed,
  shouldShowCuriosityHook,
  getRandomHook,
  getRetentionTrick,
  triggerHaptic,
  calculateFinalAccuracy,
} from "../../lib/engagement";
import LevelUpSplash from "./LevelUpSplash";

const MAX_LIVES = 5;

type Phase = "play" | "complete" | "gameover";
type ProcedureState = "playing" | "complete" | "potted";

export default function ApplyScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const { materialId, watering } = useLocalSearchParams<{ materialId: string; watering?: string }>();
  const { state, completeStage, addToCompost } = useProgress();
  const { isDark, colors } = useTheme();

  const material = materialId ? state.materials[materialId] : undefined;
  const alreadyDone = material?.stagesCompleted?.includes("apply") ?? false;
  const procedures = useMemo(() => {
    const all = material?.matrix?.procedures ?? [];
    return watering === "true" && all.length > 0 ? [all[0]] : all;
  }, [material, watering]);

  const [phase, setPhase] = useState<Phase>("play");
  const [currentProcIdx, setCurrentProcIdx] = useState(0);
  const [lives, setLives] = useState(MAX_LIVES);
  const [correct, setCorrect] = useState(0);
  const [earnedXP, setEarnedXP] = useState(0);
  const [combo, setCombo] = useState(0);
  const [maxCombo, setMaxCombo] = useState(0);
  const [comboSum, setComboSum] = useState(0);
  const [comboCount, setComboCount] = useState(0);
  const [goldenSeeds, setGoldenSeeds] = useState(0);
  const [hypeText, setHypeText] = useState<{ text: string; color: string } | null>(null);
  const [hookText, setHookText] = useState<string | null>(null);
  const [goldenFlash, setGoldenFlash] = useState(false);
  const [consecutiveCorrect, setConsecutiveCorrect] = useState(0);
  const [procState, setProcState] = useState<ProcedureState>("playing");
  const [showLevelUp, setShowLevelUp] = useState(false);
  const [newLevel, setNewLevel] = useState(0);
  const [retentionTrick, setRetentionTrick] = useState<string | null>(null);

  // Per-procedure state
  const [currentSequence, setCurrentSequence] = useState<number[]>([]);
  const [attemptTime, setAttemptTime] = useState(0);
  const [gameStartTime] = useState(Date.now());

  // Combo penalty state
  const [penaltyLifeActive, setPenaltyLifeActive] = useState(false);
  const penaltyDuration = 1000;

  const hypeAnim = useRef(new Animated.Value(0)).current;
  const goldenAnim = useRef(new Animated.Value(0)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const frenzyAnim = useRef(new Animated.Value(0)).current;

  if (!user) return <Redirect href="/login" />;
  if (!procedures || procedures.length === 0) {
    return (
      <View style={[s.container, { backgroundColor: colors.background }]}>
        <StatusBar style={isDark ? "light" : "dark"} />
        <View style={s.center}>
          <Text style={s.bigEmoji}>🚨</Text>
          <Text style={s.errorText}>No procedures found for this plot.</Text>
          <TouchableOpacity style={s.btn} onPress={() => router.back()}>
            <Text style={s.btnText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const currentProc = procedures[currentProcIdx];
  const totalSteps = currentProc.steps.length;
  const nextStepIdx = currentSequence.length;
  const isLastProc = currentProcIdx === procedures.length - 1;

  // Shuffle steps for display
  const shuffledSteps = useMemo(() => {
    const indexed = currentProc.steps.map((step, idx) => ({ step, idx }));
    for (let i = indexed.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indexed[i], indexed[j]] = [indexed[j], indexed[i]];
    }
    return indexed;
  }, [currentProcIdx]);

  // Auto-hide hype text
  useEffect(() => {
    if (!hypeText) return;
    hypeAnim.setValue(1);
    Animated.timing(hypeAnim, { toValue: 0, duration: 1200, useNativeDriver: true }).start(() =>
      setHypeText(null)
    );
  }, [hypeText]);

  // Frenzy overlay animation
  useEffect(() => {
    const isFrenzy = combo >= 5;
    if (isFrenzy) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(frenzyAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
          Animated.timing(frenzyAnim, { toValue: 0.5, duration: 400, useNativeDriver: true }),
        ])
      ).start();
    } else {
      frenzyAnim.setValue(0);
    }
  }, [combo]);

  const doShake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  };

  const flashGolden = () => {
    setGoldenFlash(true);
    goldenAnim.setValue(1);
    Animated.timing(goldenAnim, { toValue: 0, duration: 1500, useNativeDriver: true }).start(
      () => setGoldenFlash(false)
    );
  };

  const handleStepTap = (displayIdx: number, responseTime: number) => {
    if (procState !== "playing") return;

    const shuffled = shuffledSteps[displayIdx];
    const isCorrect = shuffled.idx === nextStepIdx;

    if (isCorrect) {
      // CORRECT
      triggerHaptic("success");
      setCurrentSequence((prev) => [...prev, shuffled.idx]);
      setCorrect((prev) => prev + 1);
      const newCombo = updateCombo(combo, true, responseTime);
      setCombo(newCombo);
      setMaxCombo((prev) => Math.max(prev, newCombo));
      setComboSum((prev) => prev + getComboMultiplier(newCombo));
      setComboCount((prev) => prev + 1);
      const newConsec = consecutiveCorrect + 1;
      setConsecutiveCorrect(newConsec);
      setHypeText(getHypeText(newCombo, true));

      // Golden seed roll
      const roll = rollForGoldenSeed();
      if (roll.isGolden) {
        setGoldenSeeds((prev) => prev + 1);
        triggerHaptic("golden");
        flashGolden();
      }

      // Curiosity hook
      if (shouldShowCuriosityHook(newConsec)) {
        setTimeout(() => setHookText(getRandomHook()), 600);
      }

      // Check if procedure complete
      if (nextStepIdx + 1 >= totalSteps) {
        setProcState("potted");
        setRetentionTrick(getRetentionTrick());
      }
    } else {
      // WRONG
      triggerHaptic("error");
      doShake();

      // Add to Compost Bin
      if (materialId) {
        const expectedStep = currentProc.steps[nextStepIdx];
        addToCompost({
          id: `${currentProc.name}-${nextStepIdx}`,
          materialId,
          question: `What is step ${nextStepIdx + 1} of ${currentProc.name}?`,
          answer: expectedStep,
          type: "procedure",
        });
      }

      setCombo(0);
      setConsecutiveCorrect(0);
      setHypeText(getHypeText(0, false));
      const newLives = lives - 1;
      setLives(newLives);

      if (newLives <= 0) {
        setPhase("gameover");
      }
    }
    setAttemptTime(responseTime);
  };

  const handleNextProcedure = () => {
    if (isLastProc) {
      // All procedures complete
      const baseAccuracy = correct / (procedures.length * totalSteps);
      const avgCombo = comboCount > 0 ? comboSum / comboCount : 1;
      const finalAccuracy = calculateFinalAccuracy(baseAccuracy, avgCombo, 0);

      if (materialId) {
        const prevLevel = Math.floor(state.totalXP / 200);
        const xp = completeStage(materialId, "apply", finalAccuracy, maxCombo, gameStartTime);
        setEarnedXP(xp);
        const nextLevel = Math.floor((state.totalXP + xp) / 200);
        if (nextLevel > prevLevel) {
          setNewLevel(nextLevel);
          setShowLevelUp(true);
        }
      }
      setPhase("complete");
    } else {
      // Next procedure
      setCurrentProcIdx((prev) => prev + 1);
      setCurrentSequence([]);
      setProcState("playing");
      setRetentionTrick(null);
    }
  };

  const handleRetry = () => {
    setPhase("play");
    setCurrentProcIdx(0);
    setLives(MAX_LIVES);
    setCorrect(0);
    setCombo(0);
    setComboSum(0);
    setComboCount(0);
    setGoldenSeeds(0);
    setConsecutiveCorrect(0);
    setCurrentSequence([]);
    setProcState("playing");
  };

  // ─── GAME OVER ───
  if (phase === "gameover") {
    return (
      <View style={[s.container, { backgroundColor: colors.background }]}>
        <StatusBar style={isDark ? "light" : "dark"} />
        <View style={s.center}>
          <Text style={s.bigEmoji}>💀</Text>
          <Text style={s.title}>Garden Withered</Text>
          <Text style={s.sub}>
            You completed {currentProcIdx} of {procedures.length} procedures {"\n"}You ran out of lives
          </Text>
          <TouchableOpacity style={s.btn} onPress={handleRetry}>
            <Text style={s.btnText}>Try Again</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.btn2}
            onPress={() => router.replace({ pathname: "/games", params: { materialId } })}
          >
            <Text style={s.btn2Text}>Back to Stages</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ─── COMPLETE ───
  if (phase === "complete") {
    return (
      <View style={[s.container, { backgroundColor: colors.background }]}>
        <StatusBar style={isDark ? "light" : "dark"} />
        <LevelUpSplash
          visible={showLevelUp}
          newLevel={newLevel}
          statName="+1 Execution"
          onDismiss={() => setShowLevelUp(false)}
        />
        <View style={s.center}>
          <Text style={s.bigEmoji}>🌳</Text>
          <Text style={s.title}>Master Gardener!</Text>
          {alreadyDone ? (
            <View style={s.doneBadge}>
              <Text style={s.doneText}>Already completed</Text>
            </View>
          ) : earnedXP > 0 ? (
            <View style={s.xpBadge}>
              <Text style={s.xpText}>+{earnedXP} Water Drops</Text>
            </View>
          ) : earnedXP < 0 ? (
            <View style={s.penaltyBadge}>
              <Text style={s.penaltyBadgeText}>{earnedXP} Water Drops (penalty)</Text>
            </View>
          ) : null}
          {goldenSeeds > 0 && (
            <View style={s.goldenBadge}>
              <Text style={s.goldenBadgeText}>Golden Seeds: {goldenSeeds} (5x bonus!)</Text>
            </View>
          )}
          <Text style={s.sub}>
            All procedures mastered! {"\n"}Best combo: x{getComboMultiplier(maxCombo).toFixed(1)}
          </Text>
          <TouchableOpacity
            style={s.btn}
            onPress={() => router.replace({ pathname: "/games", params: { materialId } })}
          >
            <Text style={s.btnText}>Back to Stages</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ─── POTTED CELEBRATION & RETENTION TRICK ───
  if (procState === "potted") {
    return (
      <View style={[s.container, { backgroundColor: colors.background }]}>
        <StatusBar style={isDark ? "light" : "dark"} />

        {/* Retention trick modal */}
        <Modal transparent visible={!!retentionTrick} animationType="fade">
          <TouchableOpacity
            style={s.hookOverlay}
            activeOpacity={1}
            onPress={handleNextProcedure}
          >
            <View style={[s.hookCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <Text style={s.hookEmoji}>💡</Text>
              <Text style={s.hookTitle}>Retention Trick</Text>
              <Text style={s.hookBody}>{retentionTrick}</Text>
              <Text style={s.hookDismiss}>
                {isLastProc ? "Finish" : "Next Procedure"}
              </Text>
            </View>
          </TouchableOpacity>
        </Modal>

        <View style={s.center}>
          <Text style={s.bigEmoji}>🌱</Text>
          <Text style={s.title}>Potted!</Text>
          <Text style={s.sub}>
            {currentProc.name} completed perfectly! {"\n"}
            {currentSequence.length} steps in correct sequence
          </Text>
          <TouchableOpacity style={s.btn} onPress={handleNextProcedure}>
            <Text style={s.btnText}>
              {isLastProc ? "See Results" : "Next Procedure"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ─── PLAY ───
  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <StatusBar style={isDark ? "light" : "dark"} />

      {/* Frenzy overlay */}
      {combo >= 5 && (
        <Animated.View
          style={[s.frenzyOverlay, { opacity: frenzyAnim }]}
          pointerEvents="none"
        >
          <Text style={s.frenzyText}>FRENZY!</Text>
        </Animated.View>
      )}

      {/* Curiosity hook modal */}
      <Modal transparent visible={!!hookText} animationType="fade">
        <TouchableOpacity style={s.hookOverlay} activeOpacity={1} onPress={() => setHookText(null)}>
          <View style={[s.hookCard, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <Text style={s.hookEmoji}>🧠</Text>
            <Text style={s.hookTitle}>Learning Insight</Text>
            <Text style={s.hookBody}>{hookText}</Text>
            <Text style={s.hookDismiss}>Tap to continue</Text>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.6}>
          <Text style={s.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={s.tag}>Stage 3 · The Potting Bench</Text>
      </View>

      {/* Procedure banner */}
      <View style={s.banner}>
        <Text style={s.bannerTitle}>{currentProc.name}</Text>
        <Text style={s.bannerDesc}>
          Tap the steps in the correct order {"\n"}({nextStepIdx + 1}/{totalSteps})
        </Text>
      </View>

      {/* Stats bar */}
      <View style={s.stats}>
        <Text style={s.procLabel}>
          Procedure {currentProcIdx + 1}/{procedures.length}
        </Text>
        <View style={s.timingBadge}>
          <Text style={s.timingBadgeText}>🕐 Take Your Time</Text>
        </View>
        {combo >= 2 && <Text style={s.comboText}>x{getComboMultiplier(combo).toFixed(1)}</Text>}
        <Text style={s.lives}>
          {"❤️".repeat(lives)}
          {"🖤".repeat(MAX_LIVES - lives)}
        </Text>
      </View>

      {/* Hype text overlay */}
      {hypeText && (
        <Animated.Text style={[s.hype, { color: hypeText.color, opacity: hypeAnim }]}>
          {hypeText.text}
        </Animated.Text>
      )}

      {/* Golden flash */}
      {goldenFlash && (
        <Animated.View style={[s.goldenOverlay, { opacity: goldenAnim }]}>
          <Text style={s.goldenText}>GOLDEN SEED!</Text>
        </Animated.View>
      )}

      {/* Current sequence (what they've done) */}
      {currentSequence.length > 0 && (
        <View style={s.sequenceBox}>
          <Text style={s.sequenceLabel}>Sequence:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {currentSequence.map((idx, pos) => (
              <View key={pos} style={[s.sequenceStep, { backgroundColor: colors.card, borderColor: colors.border }]}
              >
                <Text style={s.sequenceStepText}>{pos + 1}. </Text>
                <Text style={s.sequenceStepText} numberOfLines={2}>
                  {currentProc.steps[idx]}
                </Text>
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Steps to choose from (scrambled) */}
      <ScrollView style={s.scroll} showsVerticalScrollIndicator={false}>
        <Animated.View style={[s.stepsGrid, { transform: [{ translateX: shakeAnim }] }]}>
          {shuffledSteps.map((item, displayIdx) => {
            const isUsed = currentSequence.includes(item.idx);
            return (
              <TouchableOpacity
                key={`step-${item.idx}`}
                style={[
                  s.stepCard,
                  { backgroundColor: colors.card, borderColor: colors.border },
                  isUsed && [s.stepCardUsed, { backgroundColor: colors.accentSoft, borderColor: colors.accent }],
                ]}
                onPress={() => handleStepTap(displayIdx, Date.now())}
                disabled={isUsed}
                activeOpacity={0.7}
              >
                <Text style={[s.stepCardText, isUsed && s.stepCardTextUsed]} numberOfLines={3}>
                  {item.step}
                </Text>
              </TouchableOpacity>
            );
          })}
        </Animated.View>
        <View style={{ height: 20 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 20, paddingTop: 56, paddingBottom: 20 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  bigEmoji: { fontSize: 64, marginBottom: 12 },
  title: { fontSize: 26, fontWeight: "700", color: "#4A4A4A", marginBottom: 8 },
  sub: { fontSize: 15, color: "#9E9E9E", textAlign: "center", lineHeight: 22, marginBottom: 20 },
  errorText: { fontSize: 17, color: "#9E9E9E", marginBottom: 24 },
  xpBadge: { backgroundColor: "#7DB58D", borderRadius: 20, paddingHorizontal: 16, paddingVertical: 6, marginBottom: 10 },
  xpText: { color: "#FFF", fontSize: 16, fontWeight: "700" },
  doneBadge: { backgroundColor: "#E8E8E8", borderRadius: 20, paddingHorizontal: 16, paddingVertical: 6, marginBottom: 10 },
  doneText: { color: "#9E9E9E", fontSize: 14, fontWeight: "600" },
  goldenBadge: { backgroundColor: "#FFF3E0", borderRadius: 16, paddingHorizontal: 14, paddingVertical: 6, marginBottom: 10, borderWidth: 1.5, borderColor: "#FFD700" },
  goldenBadgeText: { color: "#FF9800", fontSize: 14, fontWeight: "700" },
  timingBadge: { backgroundColor: "#E8F5E9", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 4, marginHorizontal: 6, borderWidth: 1, borderColor: "#7DB58D" },
  timingBadgeText: { color: "#7DB58D", fontSize: 12, fontWeight: "700" },
  btn: { backgroundColor: "#7DB58D", borderRadius: 14, paddingVertical: 16, paddingHorizontal: 32, alignItems: "center", marginBottom: 12, width: "100%" },
  btnText: { color: "#FFF", fontSize: 17, fontWeight: "600" },
  btn2: { borderWidth: 1.5, borderColor: "#7DB58D", borderRadius: 14, paddingVertical: 14, paddingHorizontal: 32, alignItems: "center", width: "100%" },
  btn2Text: { color: "#7DB58D", fontSize: 16, fontWeight: "600" },
  header: { marginBottom: 10 },
  back: { fontSize: 16, color: "#7DB58D", fontWeight: "600", marginBottom: 10 },
  tag: { fontSize: 13, fontWeight: "700", color: "#7DB58D", textTransform: "uppercase", letterSpacing: 1 },
  banner: { borderRadius: 16, padding: 14, marginBottom: 10, backgroundColor: "#E8F5E9" },
  bannerTitle: { fontSize: 15, fontWeight: "700", color: "#4A4A4A", marginBottom: 4 },
  bannerDesc: { fontSize: 12, color: "#7DB58D", lineHeight: 16 },
  stats: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  procLabel: { fontSize: 14, fontWeight: "600", color: "#4A4A4A" },
  comboText: { fontSize: 16, fontWeight: "800", color: "#FF9800" },
  lives: { fontSize: 16 },
  hype: { textAlign: "center", fontWeight: "800", fontSize: 18, marginBottom: 4 },
  goldenOverlay: { position: "absolute", top: "45%", left: 0, right: 0, alignItems: "center", zIndex: 99 },
  goldenText: { fontSize: 28, fontWeight: "900", color: "#FFD700", textShadowColor: "rgba(0,0,0,0.3)", textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 4 },
  sequenceBox: { backgroundColor: "#E8F5E9", borderRadius: 12, padding: 10, marginBottom: 10 },
  sequenceLabel: { fontSize: 11, fontWeight: "700", color: "#7DB58D", marginBottom: 6 },
  sequenceStep: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, marginRight: 8, borderWidth: 1, minWidth: 120 },
  sequenceStepText: { fontSize: 11, fontWeight: "600", color: "#2E7D32", lineHeight: 14 },
  scroll: { flex: 1 },
  stepsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  stepCard: { width: "47%", borderRadius: 14, padding: 12, minHeight: 80, justifyContent: "center", alignItems: "center", borderWidth: 1.5 },
  stepCardUsed: { opacity: 0.5 },
  stepCardText: { fontSize: 13, fontWeight: "600", color: "#4A4A4A", textAlign: "center" },
  stepCardTextUsed: { color: "#9E9E9E" },
  hookOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center" },
  hookCard: { borderRadius: 20, padding: 28, width: "85%", alignItems: "center", borderWidth: 2 },
  hookEmoji: { fontSize: 48, marginBottom: 8 },
  hookTitle: { fontSize: 18, fontWeight: "700", color: "#7DB58D", marginBottom: 8 },
  hookBody: { fontSize: 15, color: "#4A4A4A", textAlign: "center", lineHeight: 22, marginBottom: 12 },
  hookDismiss: { fontSize: 12, color: "#9E9E9E" },
  penaltyBadge: { backgroundColor: "#FFEBEE", borderRadius: 20, paddingHorizontal: 16, paddingVertical: 6, marginBottom: 10 },
  penaltyBadgeText: { color: "#E57373", fontSize: 16, fontWeight: "700" },
  frenzyOverlay: { position: "absolute", top: "45%", left: 0, right: 0, alignItems: "center", zIndex: 99 },
  frenzyText: { fontSize: 28, fontWeight: "900", color: "#FF6B6B", textShadowColor: "rgba(0,0,0,0.3)", textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 4 },
});
