import { useRef, useState, useEffect, useMemo } from "react";
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Modal,
  Animated as RNAnimated,
} from "react-native";

import { StatusBar } from "expo-status-bar";
import { Redirect, useRouter, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import { useAuth } from "../../context/AuthContext";
import { useProgress } from "../../context/ProgressContext";
import {
  updateCombo,
  getComboMultiplier,
  getHypeText,
  rollForGoldenSeed,
  shouldShowCuriosityHook,
  getRandomHook,
  triggerHaptic,
  calculateFastFinishBonus,
  calculateFinalAccuracy,
} from "../../lib/engagement";
import LevelUpSplash from "./LevelUpSplash";
import { ParticleSystem, generateExplosionParticles, type Particle } from "../../lib/ParticleSystem";

const STUDY_SECONDS = 20;
const QUESTION_SECONDS = 10;
const MAX_LIVES = 3;
const NUM_QUESTIONS = 10;
const FAST_FINISH_TARGET = 60;

type Phase = "study" | "challenge" | "complete" | "gameover";

export default function RememberScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const { materialId } = useLocalSearchParams<{ materialId: string }>();
  const { state, completeStage } = useProgress();

  const material = materialId ? state.materials[materialId] : undefined;
  const alreadyDone = material?.stagesCompleted?.includes("remember") ?? false;
  const facts = material?.matrix?.facts ?? [];

  const challengeFacts = useMemo(() => {
    const shuffled = [...facts].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, Math.min(NUM_QUESTIONS, shuffled.length));
  }, [facts]);

  const [phase, setPhase] = useState<Phase>("study");
  const [studyTimer, setStudyTimer] = useState(STUDY_SECONDS);
  const [questionTimer, setQuestionTimer] = useState(QUESTION_SECONDS);
  const [currentQ, setCurrentQ] = useState(0);
  const [lives, setLives] = useState(MAX_LIVES);
  const [collected, setCollected] = useState(0);
  const [revealedCard, setRevealedCard] = useState<number | null>(null);
  const [earnedXP, setEarnedXP] = useState(0);
  const [wrongCard, setWrongCard] = useState<number | null>(null);
  const [correctCard, setCorrectCard] = useState<number | null>(null);
  const [combo, setCombo] = useState(0);
  const [maxCombo, setMaxCombo] = useState(0);
  const [comboSum, setComboSum] = useState(0);
  const [comboCount, setComboCount] = useState(0);
  const [goldenSeeds, setGoldenSeeds] = useState(0);
  const [hypeText, setHypeText] = useState<{ text: string; color: string } | null>(null);
  const [hookText, setHookText] = useState<string | null>(null);
  const [goldenFlash, setGoldenFlash] = useState(false);
  const [consecutiveCorrect, setConsecutiveCorrect] = useState(0);
  const [challengeStartTime, setChallengeStartTime] = useState(0);
  const [questionStartTime, setQuestionStartTime] = useState(0);
  const [showLevelUp, setShowLevelUp] = useState(false);
  const [newLevel, setNewLevel] = useState(0);
  const [particles, setParticles] = useState<Particle[]>([]);

  // Combo penalty state
  const [penaltyTimerActive, setPenaltyTimerActive] = useState(false);
  const penaltyDuration = 1000;

  const shakeAnim = useRef(new RNAnimated.Value(0)).current;
  const wrongShakeAnim = useRef(new RNAnimated.Value(0)).current;
  const frenzyZoomAnim = useRef(new RNAnimated.Value(1)).current;
  const hypeAnim = useRef(new RNAnimated.Value(0)).current;
  const goldenAnim = useRef(new RNAnimated.Value(0)).current;
  const frenzyAnim = useRef(new RNAnimated.Value(0)).current;
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  if (!user) return <Redirect href="/login" />;

  // Study timer
  useEffect(() => {
    if (phase !== "study") return;
    timerRef.current = setInterval(() => {
      setStudyTimer((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          setPhase("challenge");
          setChallengeStartTime(Date.now());
          setQuestionStartTime(Date.now());
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [phase]);

  // Challenge question timer
  useEffect(() => {
    if (phase !== "challenge") return;
    setQuestionTimer(QUESTION_SECONDS);
    setQuestionStartTime(Date.now());
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

  // Auto-hide study card
  useEffect(() => {
    if (revealedCard === null) return;
    const t = setTimeout(() => setRevealedCard(null), 2500);
    return () => clearTimeout(t);
  }, [revealedCard]);

  // Auto-hide hype text
  useEffect(() => {
    if (!hypeText) return;
    hypeAnim.setValue(1);
    RNAnimated.timing(hypeAnim, { toValue: 0, duration: 1200, useNativeDriver: true }).start(() => setHypeText(null));
  }, [hypeText]);

  // Frenzy overlay animation
  useEffect(() => {
    const isFrenzy = combo >= 5;
    if (isFrenzy) {
      RNAnimated.loop(
        RNAnimated.sequence([
          RNAnimated.timing(frenzyAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
          RNAnimated.timing(frenzyAnim, { toValue: 0.5, duration: 400, useNativeDriver: true }),
        ])
      ).start();
    } else {
      frenzyAnim.setValue(0);
    }
  }, [combo]);

  // Frenzy heartbeat zoom effect
  useEffect(() => {
    const isFrenzy = combo >= 5;
    if (isFrenzy) {
      RNAnimated.spring(frenzyZoomAnim, {
        toValue: 1.08,
        useNativeDriver: true,
        speed: 50,
        bounciness: 8,
      }).start();
      // Sync haptic with frenzy
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      RNAnimated.spring(frenzyZoomAnim, {
        toValue: 1,
        useNativeDriver: true,
        speed: 50,
        bounciness: 0,
      }).start();
    }
  }, [combo >= 5]);


  // Penalty timer reset (hide red overlay after 1 second)
  useEffect(() => {
    if (!penaltyTimerActive) return;
    const timeout = setTimeout(() => {
      setPenaltyTimerActive(false);
    }, penaltyDuration);
    return () => clearTimeout(timeout);
  }, [penaltyTimerActive]);

  if (facts.length === 0) {
    return (
      <View style={s.container}><StatusBar style="dark" />
        <View style={s.center}>
          <Text style={s.bigEmoji}>🌰</Text>
          <Text style={s.errorText}>No seeds found for this plot.</Text>
          <TouchableOpacity style={s.btn} onPress={() => router.back()}>
            <Text style={s.btnText}>Go Back</Text>
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

  const flashGolden = () => {
    setGoldenFlash(true);
    goldenAnim.setValue(1);
    RNAnimated.timing(goldenAnim, { toValue: 0, duration: 1500, useNativeDriver: true }).start(() => setGoldenFlash(false));
  };

  const handleTimeout = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    doShake("heavy");
    setCombo(0);
    setConsecutiveCorrect(0);
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
    if (currentQ + 1 >= challengeFacts.length) {
      if (timerRef.current) clearInterval(timerRef.current);
      finishGame();
    } else {
      setCurrentQ((prev) => prev + 1);
    }
  };

  const finishGame = () => {
    const elapsed = (Date.now() - challengeStartTime) / 1000;
    const baseAccuracy = collected / challengeFacts.length;
    const avgCombo = comboCount > 0 ? comboSum / comboCount : 1;
    const fastBonus = calculateFastFinishBonus(elapsed, FAST_FINISH_TARGET);
    const finalAccuracy = calculateFinalAccuracy(baseAccuracy, avgCombo, fastBonus);

    if (materialId && !alreadyDone) {
      const prevLevel = Math.floor(state.totalXP / 200);
      const xp = completeStage(materialId, "remember", finalAccuracy, maxCombo, challengeStartTime);
      setEarnedXP(xp);
      const nextLevel = Math.floor((state.totalXP + xp) / 200);
      if (nextLevel > prevLevel) {
        setNewLevel(nextLevel);
        setShowLevelUp(true);
      }
    }
    setPhase("complete");
  };

  const handleStudyTap = (idx: number) => {
    if (phase !== "study") return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRevealedCard(idx);
  };

  const handleChallengeTap = (idx: number) => {
    if (phase !== "challenge" || wrongCard !== null || correctCard !== null) return;
    const responseTime = Date.now() - questionStartTime;
    const currentFact = challengeFacts[currentQ];
    const tappedFact = facts[idx];

    if (tappedFact.id === currentFact.id) {
      // CORRECT - Heavy haptic impact + particle explosion
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      setCorrectCard(idx);
      setCollected((prev) => prev + 1);
      const newCombo = updateCombo(combo, true, responseTime);
      setCombo(newCombo);
      setMaxCombo((prev) => Math.max(prev, newCombo));
      setComboSum((prev) => prev + getComboMultiplier(newCombo));
      setComboCount((prev) => prev + 1);
      const newConsec = consecutiveCorrect + 1;
      setConsecutiveCorrect(newConsec);
      setHypeText(getHypeText(newCombo, true));

      // ✨ PARTICLE EXPLOSION on correct answer
      const cardCenterX = Math.random() * 300 + 40;
      const cardCenterY = Math.random() * 200 + 200;
      const scoreCounterX = 60;
      const scoreCounterY = 60;
      const explosionParticles = generateExplosionParticles(
        cardCenterX,
        cardCenterY,
        scoreCounterX,
        scoreCounterY,
        14
      );
      setParticles((prev) => [...prev, ...explosionParticles]);

      // Auto-cleanup particles
      setTimeout(() => {
        setParticles((prev) =>
          prev.filter((p) => !explosionParticles.find((ep) => ep.id === p.id))
        );
      }, 1300);

      // Golden seed roll (5% chance, 10% in frenzy)
      const isFrenzy = newCombo >= 5;
      const roll = rollForGoldenSeed(isFrenzy);
      if (roll.isGolden) {
        setGoldenSeeds((prev) => prev + 1);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        flashGolden();
      }

      // Curiosity hook
      if (shouldShowCuriosityHook(newConsec)) {
        setTimeout(() => setHookText(getRandomHook()), 600);
      }

      if (timerRef.current) clearInterval(timerRef.current);
      setTimeout(() => advanceQuestion(), 500);
    } else {
      // WRONG - Heavy shake + error haptic
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      doShake("heavy");
      setWrongCard(idx);
      const correctIdx = facts.findIndex((f) => f.id === currentFact.id);
      setCorrectCard(correctIdx);

      // COMBO PENALTY: If combo >= 4, subtract 5 seconds from timer
      if (combo >= 4) {
        setQuestionTimer((prev) => Math.max(0, prev - 5));
        setPenaltyTimerActive(true);
      }

      setCombo(0);
      setConsecutiveCorrect(0);
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
          if (currentQ + 1 >= challengeFacts.length) finishGame();
          else setCurrentQ((prev) => prev + 1);
        }
      }, 1000);
    }
  };

  const handleSkipStudy = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setChallengeStartTime(Date.now());
    setQuestionStartTime(Date.now());
    setPhase("challenge");
  };

  const handleRetry = () => {
    setPhase("study");
    setStudyTimer(STUDY_SECONDS);
    setCurrentQ(0);
    setLives(MAX_LIVES);
    setCollected(0);
    setCombo(0);
    setComboSum(0);
    setComboCount(0);
    setGoldenSeeds(0);
    setConsecutiveCorrect(0);
    setWrongCard(null);
    setCorrectCard(null);
  };

  // ─── GAME OVER ───
  if (phase === "gameover") {
    return (
      <View style={s.container}><StatusBar style="dark" />
        <View style={s.center}>
          <Text style={s.bigEmoji}>🥀</Text>
          <Text style={s.title}>Seeds Lost!</Text>
          <Text style={s.sub}>Collected {collected}/{challengeFacts.length} seeds{"\n"}You ran out of lives</Text>
          <TouchableOpacity style={s.btn} onPress={handleRetry}><Text style={s.btnText}>Try Again</Text></TouchableOpacity>
          <TouchableOpacity style={s.btn2} onPress={() => router.replace({ pathname: "/games", params: { materialId } })}>
            <Text style={s.btn2Text}>Back to Stages</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ─── COMPLETE ───
  if (phase === "complete") {
    const pct = Math.round((collected / challengeFacts.length) * 100);
    return (
      <View style={s.container}><StatusBar style="dark" />
        <LevelUpSplash visible={showLevelUp} newLevel={newLevel} statName="+1 Memory" onDismiss={() => setShowLevelUp(false)} />
        <View style={s.center}>
          <Text style={s.bigEmoji}>📚</Text>
          <Text style={s.title}>Seeds Collected!</Text>
          {alreadyDone ? (
            <View style={s.doneBadge}><Text style={s.doneText}>Already completed</Text></View>
          ) : earnedXP > 0 ? (
            <View style={s.xpBadge}><Text style={s.xpText}>+{earnedXP} Water Drops</Text></View>
          ) : earnedXP < 0 ? (
            <View style={s.penaltyBadge}><Text style={s.penaltyText}>{earnedXP} Water Drops (penalty)</Text></View>
          ) : null}
          {goldenSeeds > 0 && (
            <View style={s.goldenBadge}><Text style={s.goldenBadgeText}>Golden Seeds: {goldenSeeds} (5x bonus!)</Text></View>
          )}
          <Text style={s.sub}>{collected}/{challengeFacts.length} recalled ({pct}%){"\n"}Lives: {lives} | Best combo: x{getComboMultiplier(maxCombo).toFixed(1)}</Text>
          <TouchableOpacity style={s.btn} onPress={() => router.replace({ pathname: "/games", params: { materialId } })}>
            <Text style={s.btnText}>Back to Stages</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ─── STUDY & CHALLENGE ───
  const isStudy = phase === "study";
  const timerValue = isStudy ? studyTimer : questionTimer;
  const timerColor = penaltyTimerActive
    ? "#FF6B6B"
    : timerValue <= 3 ? "#E57373" : timerValue <= 6 ? "#FFB74D" : "#7DB58D";

  return (
    <View style={s.container}>
      <StatusBar style="dark" />

      {/* Curiosity hook modal */}
      <Modal transparent visible={!!hookText} animationType="fade">
        <TouchableOpacity style={s.hookOverlay} activeOpacity={1} onPress={() => setHookText(null)}>
          <View style={s.hookCard}>
            <Text style={s.hookEmoji}>🧠</Text>
            <Text style={s.hookTitle}>Memory Anchor</Text>
            <Text style={s.hookBody}>{hookText}</Text>
            <Text style={s.hookDismiss}>Tap to continue</Text>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Frenzy overlay */}
      {combo >= 5 && (
        <RNAnimated.View
          style={[
            s.frenzyOverlay,
            { opacity: frenzyAnim },
          ]}
          pointerEvents="none"
        >
          <Text style={s.frenzyText}>FRENZY!</Text>
        </RNAnimated.View>
      )}

      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.6}>
          <Text style={s.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={s.tag}>Stage 1 · The Seed Library</Text>
      </View>

      {/* Phase banner */}
      <View style={[s.banner, isStudy ? s.bannerStudy : s.bannerChallenge]}>
        {isStudy ? (
          <View style={s.bannerRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.bannerTitle}>Study Phase</Text>
              <Text style={s.bannerDesc}>Tap seeds to peek at definitions. Memorize positions!</Text>
            </View>
            <TouchableOpacity onPress={handleSkipStudy} style={s.readyBtn}>
              <Text style={s.readyBtnText}>I'm Ready →</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <Text style={s.bannerTitle}>Which seed matches this?</Text>
            <View style={s.defBox}>
              <Text style={s.defText}>{challengeFacts[currentQ]?.definition}</Text>
            </View>
          </>
        )}
      </View>

      {/* Stats bar */}
      <View style={s.stats}>
        <RNAnimated.Text style={[s.timer, { color: timerColor }]}>
          {timerValue}s
          {penaltyTimerActive && <Text style={{ fontSize: 10 }}> -5s</Text>}
        </RNAnimated.Text>
        {!isStudy && <Text style={s.seedCount}>🌱 {collected}/{challengeFacts.length}</Text>}
        {!isStudy && combo >= 2 && <Text style={s.comboText}>x{getComboMultiplier(combo).toFixed(1)}</Text>}
        <Text style={s.lives}>{"❤️".repeat(lives)}{"🖤".repeat(MAX_LIVES - lives)}</Text>
      </View>

      {/* Hype text overlay */}
      {hypeText && (
        <RNAnimated.Text style={[s.hype, { color: hypeText.color, opacity: hypeAnim }]}>
          {hypeText.text}
        </RNAnimated.Text>
      )}

      {/* Golden flash */}
      {goldenFlash && (
        <RNAnimated.View style={[s.goldenOverlay, { opacity: goldenAnim }]}>
          <Text style={s.goldenText}>GOLDEN SEED!</Text>
        </RNAnimated.View>
      )}

      {/* Seed grid */}
      <ScrollView showsVerticalScrollIndicator={false} style={s.scroll}>
        <RNAnimated.View style={[s.grid, { transform: [{ scale: frenzyZoomAnim }, { translateX: shakeAnim }] }]}>
          {facts.map((fact, idx) => {
            const isRevealed = revealedCard === idx;
            const isWrong = wrongCard === idx;
            const isCorrect = correctCard === idx;

            return (
              <TouchableOpacity
                key={fact.id}
                style={[
                  s.seed,
                  isRevealed && s.seedRevealed,
                  isWrong && s.seedWrong,
                  isCorrect && s.seedCorrect,
                ]}
                onPress={() => isStudy ? handleStudyTap(idx) : handleChallengeTap(idx)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    s.seedText,
                    isRevealed && s.seedTextRevealed,
                    isCorrect && s.seedTextCorrect,
                  ]}
                  numberOfLines={isRevealed ? 4 : 2}
                >
                  {isStudy
                    ? (isRevealed ? fact.definition : fact.term)
                    : (isCorrect || isWrong ? fact.term : "🌱")}
                </Text>
              </TouchableOpacity>
            );
          })}
        </RNAnimated.View>
      </ScrollView>

      {/* Particle System */}
      <ParticleSystem particles={particles} />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFF8F0", paddingHorizontal: 20, paddingTop: 56, paddingBottom: 20 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  bigEmoji: { fontSize: 64, marginBottom: 12 },
  title: { fontSize: 26, fontWeight: "700", color: "#4A4A4A", marginBottom: 8 },
  sub: { fontSize: 15, color: "#9E9E9E", textAlign: "center", lineHeight: 22, marginBottom: 20 },
  errorText: { fontSize: 17, color: "#9E9E9E", marginBottom: 24 },
  xpBadge: { backgroundColor: "#7DB58D", borderRadius: 20, paddingHorizontal: 16, paddingVertical: 6, marginBottom: 10 },
  xpText: { color: "#FFF", fontSize: 16, fontWeight: "700" },
  penaltyBadge: { backgroundColor: "#FFEBEE", borderRadius: 20, paddingHorizontal: 16, paddingVertical: 6, marginBottom: 10 },
  penaltyText: { color: "#E57373", fontSize: 16, fontWeight: "700" },
  doneBadge: { backgroundColor: "#E8E8E8", borderRadius: 20, paddingHorizontal: 16, paddingVertical: 6, marginBottom: 10 },
  doneText: { color: "#9E9E9E", fontSize: 14, fontWeight: "600" },
  goldenBadge: { backgroundColor: "#FFF3E0", borderRadius: 16, paddingHorizontal: 14, paddingVertical: 6, marginBottom: 10, borderWidth: 1.5, borderColor: "#FFD700" },
  goldenBadgeText: { color: "#FF9800", fontSize: 14, fontWeight: "700" },
  btn: { backgroundColor: "#7DB58D", borderRadius: 14, paddingVertical: 16, paddingHorizontal: 32, alignItems: "center", marginBottom: 12, width: "100%" },
  btnText: { color: "#FFF", fontSize: 17, fontWeight: "600" },
  btn2: { borderWidth: 1.5, borderColor: "#7DB58D", borderRadius: 14, paddingVertical: 14, paddingHorizontal: 32, alignItems: "center", width: "100%" },
  btn2Text: { color: "#7DB58D", fontSize: 16, fontWeight: "600" },
  header: { marginBottom: 10 },
  back: { fontSize: 16, color: "#7DB58D", fontWeight: "600", marginBottom: 10 },
  tag: { fontSize: 13, fontWeight: "700", color: "#7DB58D", textTransform: "uppercase", letterSpacing: 1 },
  banner: { borderRadius: 16, padding: 14, marginBottom: 10 },
  bannerStudy: { backgroundColor: "#E8F5E9" },
  bannerChallenge: { backgroundColor: "#FFF3E0" },
  bannerRow: { flexDirection: "row", alignItems: "center" },
  bannerTitle: { fontSize: 15, fontWeight: "700", color: "#4A4A4A", marginBottom: 4 },
  bannerDesc: { fontSize: 12, color: "#7DB58D" },
  readyBtn: { backgroundColor: "#7DB58D", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, marginLeft: 10 },
  readyBtnText: { color: "#FFF", fontSize: 13, fontWeight: "700" },
  defBox: { backgroundColor: "#FFF", borderRadius: 12, padding: 12, marginTop: 6 },
  defText: { fontSize: 14, color: "#4A4A4A", lineHeight: 20 },
  stats: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  timer: { fontSize: 22, fontWeight: "800" },
  seedCount: { fontSize: 14, fontWeight: "600", color: "#4A4A4A" },
  comboText: { fontSize: 16, fontWeight: "800", color: "#FF9800" },
  lives: { fontSize: 16 },
  hype: { textAlign: "center", fontWeight: "800", fontSize: 18, marginBottom: 4 },
  goldenOverlay: { position: "absolute", top: "45%", left: 0, right: 0, alignItems: "center", zIndex: 99 },
  goldenText: { fontSize: 28, fontWeight: "900", color: "#FFD700", textShadowColor: "rgba(0,0,0,0.3)", textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 4 },
  scroll: { flex: 1 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingBottom: 16 },
  seed: { width: "47%", backgroundColor: "#FFF", borderWidth: 1.5, borderColor: "#E0E0E0", borderRadius: 14, padding: 12, minHeight: 64, justifyContent: "center", alignItems: "center" },
  seedRevealed: { backgroundColor: "#F0FAF3", borderColor: "#7DB58D" },
  seedWrong: { backgroundColor: "#FFEBEE", borderColor: "#E57373" },
  seedCorrect: { backgroundColor: "#E8F5E9", borderColor: "#66BB6A" },
  seedText: { fontSize: 13, fontWeight: "600", color: "#4A4A4A", textAlign: "center" },
  seedTextRevealed: { color: "#7DB58D", fontSize: 11, fontWeight: "500" },
  seedTextCorrect: { color: "#2E7D32" },
  hookOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center" },
  hookCard: { backgroundColor: "#FFF8F0", borderRadius: 20, padding: 28, width: "85%", alignItems: "center", borderWidth: 2, borderColor: "#7DB58D" },
  hookEmoji: { fontSize: 48, marginBottom: 8 },
  hookTitle: { fontSize: 18, fontWeight: "700", color: "#7DB58D", marginBottom: 8 },
  hookBody: { fontSize: 15, color: "#4A4A4A", textAlign: "center", lineHeight: 22, marginBottom: 12 },
  hookDismiss: { fontSize: 12, color: "#9E9E9E" },
  frenzyOverlay: { position: "absolute", top: "45%", left: 0, right: 0, alignItems: "center", zIndex: 99 },
  frenzyText: { fontSize: 28, fontWeight: "900", color: "#FF6B6B", textShadowColor: "rgba(0,0,0,0.3)", textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 4 },
});
