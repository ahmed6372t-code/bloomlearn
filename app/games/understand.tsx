import { useRef, useState, useEffect, useMemo } from "react";
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Modal,
  Animated,
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
  calculateFinalAccuracy,
} from "../../lib/engagement";
import LevelUpSplash from "./LevelUpSplash";

const STUDY_SECONDS = 25;
const QUESTION_SECONDS = 12;
const MAX_LIVES = 3;

type Phase = "study" | "play" | "complete" | "gameover";

export default function UnderstandScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const { materialId } = useLocalSearchParams<{ materialId: string }>();
  const { state, completeStage } = useProgress();

  const material = materialId ? state.materials[materialId] : undefined;
  const alreadyDone = material?.stagesCompleted?.includes("understand") ?? false;
  const concepts = material?.matrix?.concepts ?? [];
  const facts = material?.matrix?.facts ?? [];

  // Build question list: for each concept, pick its linked facts as questions
  const questions = useMemo(() => {
    const qs: { conceptId: string; conceptName: string; factId: string; factTerm: string }[] = [];
    for (const concept of concepts) {
      for (const fid of concept.fact_ids) {
        const fact = facts.find((f) => f.id === fid);
        if (fact) {
          qs.push({
            conceptId: concept.id,
            conceptName: concept.name,
            factId: fact.id,
            factTerm: fact.term,
          });
        }
      }
    }
    // Shuffle
    for (let i = qs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [qs[i], qs[j]] = [qs[j], qs[i]];
    }
    return qs.slice(0, Math.min(10, qs.length));
  }, [concepts, facts]);

  // Build answer options: all concept names (for multiple choice)
  const conceptNames = useMemo(
    () => concepts.map((c) => ({ id: c.id, name: c.name })),
    [concepts]
  );

  const [phase, setPhase] = useState<Phase>("study");
  const [studyTimer, setStudyTimer] = useState(STUDY_SECONDS);
  const [questionTimer, setQuestionTimer] = useState(QUESTION_SECONDS);
  const [currentQ, setCurrentQ] = useState(0);
  const [lives, setLives] = useState(MAX_LIVES);
  const [collected, setCollected] = useState(0);
  const [earnedXP, setEarnedXP] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [correctAnswer, setCorrectAnswer] = useState<string | null>(null);
  const [combo, setCombo] = useState(0);
  const [maxCombo, setMaxCombo] = useState(0);
  const [comboSum, setComboSum] = useState(0);
  const [comboCount, setComboCount] = useState(0);
  const [goldenSeeds, setGoldenSeeds] = useState(0);
  const [hypeText, setHypeText] = useState<{ text: string; color: string } | null>(null);
  const [hookText, setHookText] = useState<string | null>(null);
  const [goldenFlash, setGoldenFlash] = useState(false);
  const [consecutiveCorrect, setConsecutiveCorrect] = useState(0);
  const [gameStartTime, setGameStartTime] = useState(0);
  const [questionStartTime, setQuestionStartTime] = useState(0);
  const [showLevelUp, setShowLevelUp] = useState(false);
  const [newLevel, setNewLevel] = useState(0);
  const [revealedConcept, setRevealedConcept] = useState<number | null>(null);

  // Combo penalty state
  const [penaltyTimerActive, setPenaltyTimerActive] = useState(false);
  const penaltyDuration = 1000;

  const shakeAnim = useRef(new Animated.Value(0)).current;
  const hypeAnim = useRef(new Animated.Value(0)).current;
  const goldenAnim = useRef(new Animated.Value(0)).current;
  const frenzyAnim = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  if (!user) return <Redirect href="/login" />;

  // Study timer
  useEffect(() => {
    if (phase !== "study") return;
    timerRef.current = setInterval(() => {
      setStudyTimer((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          setPhase("play");
          setGameStartTime(Date.now());
          setQuestionStartTime(Date.now());
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [phase]);

  // Question timer
  useEffect(() => {
    if (phase !== "play") return;
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
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [phase, currentQ]);

  // Auto-hide revealed concept card
  useEffect(() => {
    if (revealedConcept === null) return;
    const t = setTimeout(() => setRevealedConcept(null), 3000);
    return () => clearTimeout(t);
  }, [revealedConcept]);

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
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      frenzyAnim.setValue(0);
    }
  }, [combo]);

  // Penalty timer reset
  useEffect(() => {
    if (!penaltyTimerActive) return;
    const timeout = setTimeout(() => {
      setPenaltyTimerActive(false);
    }, penaltyDuration);
    return () => clearTimeout(timeout);
  }, [penaltyTimerActive]);

  if (questions.length === 0) {
    return (
      <View style={s.container}>
        <StatusBar style="dark" />
        <View style={s.center}>
          <Text style={s.bigEmoji}>🌰</Text>
          <Text style={s.errorText}>No concepts found for this plot.</Text>
          <TouchableOpacity style={s.btn} onPress={() => router.back()}>
            <Text style={s.btnText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const doShake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 15, duration: 80, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -15, duration: 80, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 15, duration: 80, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -15, duration: 80, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 80, useNativeDriver: true }),
    ]).start();
  };

  const flashGolden = () => {
    setGoldenFlash(true);
    goldenAnim.setValue(1);
    Animated.timing(goldenAnim, { toValue: 0, duration: 1500, useNativeDriver: true }).start(() =>
      setGoldenFlash(false)
    );
  };

  const handleTimeout = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    doShake();
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
    setSelectedAnswer(null);
    setCorrectAnswer(null);
    if (currentQ + 1 >= questions.length) {
      if (timerRef.current) clearInterval(timerRef.current);
      finishGame();
    } else {
      setCurrentQ((prev) => prev + 1);
    }
  };

  const finishGame = () => {
    const baseAccuracy = collected / questions.length;
    const avgCombo = comboCount > 0 ? comboSum / comboCount : 1;
    const finalAccuracy = calculateFinalAccuracy(baseAccuracy, avgCombo, 0);

    if (materialId && !alreadyDone) {
      const prevLevel = Math.floor(state.totalXP / 200);
      const xp = completeStage(materialId, "understand", finalAccuracy, maxCombo, gameStartTime);
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
    setRevealedConcept(idx);
  };

  const handleAnswerTap = (conceptId: string) => {
    if (phase !== "play" || selectedAnswer !== null) return;
    const responseTime = Date.now() - questionStartTime;
    const currentQuestion = questions[currentQ];
    const isCorrect = conceptId === currentQuestion.conceptId;

    if (isCorrect) {
      // CORRECT
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      setCorrectAnswer(conceptId);
      setCollected((prev) => prev + 1);
      const newCombo = updateCombo(combo, true, responseTime);
      setCombo(newCombo);
      setMaxCombo((prev) => Math.max(prev, newCombo));
      setComboSum((prev) => prev + getComboMultiplier(newCombo));
      setComboCount((prev) => prev + 1);
      const newConsec = consecutiveCorrect + 1;
      setConsecutiveCorrect(newConsec);
      setHypeText(getHypeText(newCombo, true));

      // Golden seed roll (5% chance, 10% in frenzy)
      const isFrenzy = newCombo >= 5;
      const roll = rollForGoldenSeed(isFrenzy);
      if (roll.isGolden) {
        setGoldenSeeds((prev) => prev + 1);
        triggerHaptic("golden");
        flashGolden();
      }

      // Curiosity hook
      if (shouldShowCuriosityHook(newConsec)) {
        setTimeout(() => setHookText(getRandomHook()), 600);
      }

      if (timerRef.current) clearInterval(timerRef.current);
      setTimeout(() => advanceQuestion(), 600);
    } else {
      // WRONG
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      doShake();
      setSelectedAnswer(conceptId);
      setCorrectAnswer(currentQuestion.conceptId);

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
          advanceQuestion();
        }
      }, 1000);
    }
  };

  const handleSkipStudy = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setGameStartTime(Date.now());
    setQuestionStartTime(Date.now());
    setPhase("play");
  };

  const handleRetry = () => {
    setPhase("study");
    setStudyTimer(STUDY_SECONDS);
    setCurrentQ(0);
    setLives(MAX_LIVES);
    setCollected(0);
    setCombo(0);
    setMaxCombo(0);
    setComboSum(0);
    setComboCount(0);
    setGoldenSeeds(0);
    setConsecutiveCorrect(0);
    setSelectedAnswer(null);
    setCorrectAnswer(null);
    setPenaltyTimerActive(false);
  };

  // ─── GAME OVER ───
  if (phase === "gameover") {
    return (
      <View style={s.container}>
        <StatusBar style="dark" />
        <View style={s.center}>
          <Text style={s.bigEmoji}>🥀</Text>
          <Text style={s.title}>Greenhouse Wilted!</Text>
          <Text style={s.sub}>
            Sorted {collected}/{questions.length} seeds{"\n"}You ran out of lives
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
    const pct = Math.round((collected / questions.length) * 100);
    return (
      <View style={s.container}>
        <StatusBar style="dark" />
        <LevelUpSplash
          visible={showLevelUp}
          newLevel={newLevel}
          statName="+1 Understanding"
          onDismiss={() => setShowLevelUp(false)}
        />
        <View style={s.center}>
          <Text style={s.bigEmoji}>🌿</Text>
          <Text style={s.title}>Seeds Sorted!</Text>
          {alreadyDone ? (
            <View style={s.doneBadge}>
              <Text style={s.doneText}>Already completed</Text>
            </View>
          ) : earnedXP > 0 ? (
            <View style={s.xpBadge}>
              <Text style={s.xpBadgeText}>+{earnedXP} Water Drops</Text>
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
            {collected}/{questions.length} concepts matched ({pct}%){"\n"}Best combo: x
            {getComboMultiplier(maxCombo).toFixed(1)}
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

  // ─── STUDY & PLAY ───
  const isStudy = phase === "study";
  const timerValue = isStudy ? studyTimer : questionTimer;
  const timerColor = penaltyTimerActive
    ? "#FF6B6B"
    : timerValue <= 3
    ? "#E57373"
    : timerValue <= 6
    ? "#FFB74D"
    : "#7DB58D";

  const currentQuestion = questions[currentQ];

  // Build shuffled answer options for current question
  const answerOptions = useMemo(() => {
    if (!currentQuestion) return [];
    // Always include the correct concept
    const opts = [{ id: currentQuestion.conceptId, name: currentQuestion.conceptName }];
    // Add other concepts as distractors
    const distractors = conceptNames
      .filter((c) => c.id !== currentQuestion.conceptId)
      .sort(() => Math.random() - 0.5)
      .slice(0, Math.min(3, conceptNames.length - 1));
    opts.push(...distractors);
    // Shuffle all options
    for (let i = opts.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [opts[i], opts[j]] = [opts[j], opts[i]];
    }
    return opts;
  }, [currentQ, currentQuestion?.conceptId]);

  return (
    <View style={s.container}>
      <StatusBar style="dark" />

      {/* Curiosity hook modal */}
      <Modal transparent visible={!!hookText} animationType="fade">
        <TouchableOpacity
          style={s.hookOverlay}
          activeOpacity={1}
          onPress={() => setHookText(null)}
        >
          <View style={s.hookCard}>
            <Text style={s.hookEmoji}>🧠</Text>
            <Text style={s.hookTitle}>Understanding Anchor</Text>
            <Text style={s.hookBody}>{hookText}</Text>
            <Text style={s.hookDismiss}>Tap to continue</Text>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Frenzy overlay */}
      {combo >= 5 && (
        <Animated.View
          style={[s.frenzyOverlay, { opacity: frenzyAnim }]}
          pointerEvents="none"
        >
          <Text style={s.frenzyText}>FRENZY!</Text>
        </Animated.View>
      )}

      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.6}>
          <Text style={s.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={s.tag}>Stage 2 · The Greenhouse</Text>
      </View>

      {/* Phase banner */}
      <View style={[s.banner, isStudy ? s.bannerStudy : s.bannerChallenge]}>
        {isStudy ? (
          <View style={s.bannerRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.bannerTitle}>Study Phase</Text>
              <Text style={s.bannerDesc}>
                Tap concepts to see which facts belong to each. Memorize the connections!
              </Text>
            </View>
            <TouchableOpacity onPress={handleSkipStudy} style={s.readyBtn}>
              <Text style={s.readyBtnText}>I'm Ready →</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <Text style={s.bannerTitle}>Which concept does this fact belong to?</Text>
            <View style={s.defBox}>
              <Text style={s.defText}>{currentQuestion?.factTerm}</Text>
            </View>
          </>
        )}
      </View>

      {/* Stats bar */}
      <View style={s.stats}>
        <Animated.Text style={[s.timer, { color: timerColor }]}>
          {timerValue}s
          {penaltyTimerActive && <Text style={{ fontSize: 10 }}> -5s</Text>}
        </Animated.Text>
        {!isStudy && (
          <Text style={s.seedCount}>
            🌿 {collected}/{questions.length}
          </Text>
        )}
        {!isStudy && combo >= 2 && (
          <Text style={s.comboText}>x{getComboMultiplier(combo).toFixed(1)}</Text>
        )}
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

      {/* Content */}
      <ScrollView showsVerticalScrollIndicator={false} style={s.scroll}>
        {isStudy ? (
          // STUDY PHASE: Show concept cards to tap and explore
          <Animated.View style={[s.grid, { transform: [{ translateX: shakeAnim }] }]}>
            {concepts.map((concept, idx) => {
              const isRevealed = revealedConcept === idx;
              const linkedFacts = concept.fact_ids
                .map((fid) => facts.find((f) => f.id === fid))
                .filter(Boolean);

              return (
                <TouchableOpacity
                  key={concept.id}
                  style={[s.conceptCard, isRevealed && s.conceptCardRevealed]}
                  onPress={() => handleStudyTap(idx)}
                  activeOpacity={0.7}
                >
                  <Text style={[s.conceptCardTitle, isRevealed && s.conceptCardTitleRevealed]}>
                    {concept.name}
                  </Text>
                  {isRevealed && (
                    <View style={s.conceptCardDetails}>
                      <Text style={s.conceptExplanation}>{concept.explanation}</Text>
                      <View style={s.factsList}>
                        {linkedFacts.map((fact) => (
                          <Text key={fact!.id} style={s.factItem}>
                            • {fact!.term}
                          </Text>
                        ))}
                      </View>
                    </View>
                  )}
                  {!isRevealed && (
                    <Text style={s.conceptCardHint}>
                      {concept.fact_ids.length} fact{concept.fact_ids.length !== 1 ? "s" : ""} — tap
                      to explore
                    </Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </Animated.View>
        ) : (
          // PLAY PHASE: Match fact to concept
          <Animated.View style={[s.answersGrid, { transform: [{ translateX: shakeAnim }] }]}>
            {answerOptions.map((option) => {
              const isWrong = selectedAnswer === option.id && option.id !== currentQuestion.conceptId;
              const isCorrectChoice = correctAnswer === option.id;

              return (
                <TouchableOpacity
                  key={option.id}
                  style={[
                    s.answerCard,
                    isCorrectChoice && s.answerCardCorrect,
                    isWrong && s.answerCardWrong,
                  ]}
                  onPress={() => handleAnswerTap(option.id)}
                  activeOpacity={0.7}
                  disabled={selectedAnswer !== null || correctAnswer !== null}
                >
                  <Text
                    style={[
                      s.answerCardText,
                      isCorrectChoice && s.answerCardTextCorrect,
                      isWrong && s.answerCardTextWrong,
                    ]}
                  >
                    {option.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </Animated.View>
        )}
        <View style={{ height: 20 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFF8F0",
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 20,
  },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  bigEmoji: { fontSize: 64, marginBottom: 12 },
  title: { fontSize: 26, fontWeight: "700", color: "#4A4A4A", marginBottom: 8 },
  sub: {
    fontSize: 15,
    color: "#9E9E9E",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 20,
  },
  errorText: { fontSize: 17, color: "#9E9E9E", marginBottom: 24 },
  xpBadge: {
    backgroundColor: "#7DB58D",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 6,
    marginBottom: 10,
  },
  xpBadgeText: { color: "#FFF", fontSize: 16, fontWeight: "700" },
  penaltyBadge: {
    backgroundColor: "#FFEBEE",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 6,
    marginBottom: 10,
  },
  penaltyBadgeText: { color: "#E57373", fontSize: 16, fontWeight: "700" },
  doneBadge: {
    backgroundColor: "#E8E8E8",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 6,
    marginBottom: 10,
  },
  doneText: { color: "#9E9E9E", fontSize: 14, fontWeight: "600" },
  goldenBadge: {
    backgroundColor: "#FFF3E0",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginBottom: 10,
    borderWidth: 1.5,
    borderColor: "#FFD700",
  },
  goldenBadgeText: { color: "#FF9800", fontSize: 14, fontWeight: "700" },
  btn: {
    backgroundColor: "#7DB58D",
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 32,
    alignItems: "center",
    marginBottom: 12,
    width: "100%",
  },
  btnText: { color: "#FFF", fontSize: 17, fontWeight: "600" },
  btn2: {
    borderWidth: 1.5,
    borderColor: "#7DB58D",
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 32,
    alignItems: "center",
    width: "100%",
  },
  btn2Text: { color: "#7DB58D", fontSize: 16, fontWeight: "600" },
  header: { marginBottom: 10 },
  back: { fontSize: 16, color: "#7DB58D", fontWeight: "600", marginBottom: 10 },
  tag: {
    fontSize: 13,
    fontWeight: "700",
    color: "#7DB58D",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  banner: { borderRadius: 16, padding: 14, marginBottom: 10 },
  bannerStudy: { backgroundColor: "#E8F5E9" },
  bannerChallenge: { backgroundColor: "#FFF3E0" },
  bannerRow: { flexDirection: "row", alignItems: "center" },
  bannerTitle: { fontSize: 15, fontWeight: "700", color: "#4A4A4A", marginBottom: 4 },
  bannerDesc: { fontSize: 12, color: "#7DB58D" },
  readyBtn: {
    backgroundColor: "#7DB58D",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginLeft: 10,
  },
  readyBtnText: { color: "#FFF", fontSize: 13, fontWeight: "700" },
  defBox: { backgroundColor: "#FFF", borderRadius: 12, padding: 12, marginTop: 6 },
  defText: { fontSize: 14, color: "#4A4A4A", lineHeight: 20 },
  stats: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  timer: { fontSize: 22, fontWeight: "800" },
  seedCount: { fontSize: 14, fontWeight: "600", color: "#4A4A4A" },
  comboText: { fontSize: 16, fontWeight: "800", color: "#FF9800" },
  lives: { fontSize: 16 },
  hype: { textAlign: "center", fontWeight: "800", fontSize: 18, marginBottom: 4 },
  goldenOverlay: {
    position: "absolute",
    top: "45%",
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 99,
  },
  goldenText: {
    fontSize: 28,
    fontWeight: "900",
    color: "#FFD700",
    textShadowColor: "rgba(0,0,0,0.3)",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 4,
  },
  frenzyOverlay: {
    position: "absolute",
    top: "45%",
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 99,
  },
  frenzyText: {
    fontSize: 28,
    fontWeight: "900",
    color: "#FF6B6B",
    textShadowColor: "rgba(0,0,0,0.3)",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 4,
  },
  scroll: { flex: 1 },

  // Study phase: concept cards
  grid: { gap: 10, paddingBottom: 16 },
  conceptCard: {
    backgroundColor: "#FFF",
    borderWidth: 1.5,
    borderColor: "#E0E0E0",
    borderRadius: 14,
    padding: 16,
    minHeight: 64,
  },
  conceptCardRevealed: {
    backgroundColor: "#F0FAF3",
    borderColor: "#7DB58D",
  },
  conceptCardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#4A4A4A",
  },
  conceptCardTitleRevealed: {
    color: "#2E7D32",
  },
  conceptCardHint: {
    fontSize: 12,
    color: "#9E9E9E",
    marginTop: 4,
  },
  conceptCardDetails: {
    marginTop: 10,
  },
  conceptExplanation: {
    fontSize: 13,
    color: "#7DB58D",
    lineHeight: 18,
    marginBottom: 8,
  },
  factsList: {
    backgroundColor: "#E8F5E9",
    borderRadius: 8,
    padding: 10,
  },
  factItem: {
    fontSize: 12,
    color: "#2E7D32",
    lineHeight: 18,
    fontWeight: "600",
  },

  // Play phase: answer cards
  answersGrid: { gap: 10, paddingBottom: 16 },
  answerCard: {
    backgroundColor: "#FFF",
    borderWidth: 2,
    borderColor: "#E0E0E0",
    borderRadius: 14,
    padding: 18,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 64,
  },
  answerCardCorrect: {
    backgroundColor: "#E8F5E9",
    borderColor: "#66BB6A",
  },
  answerCardWrong: {
    backgroundColor: "#FFEBEE",
    borderColor: "#E57373",
  },
  answerCardText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#4A4A4A",
    textAlign: "center",
  },
  answerCardTextCorrect: {
    color: "#2E7D32",
  },
  answerCardTextWrong: {
    color: "#C62828",
  },

  // Modals
  hookOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  hookCard: {
    backgroundColor: "#FFF8F0",
    borderRadius: 20,
    padding: 28,
    width: "85%",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#7DB58D",
  },
  hookEmoji: { fontSize: 48, marginBottom: 8 },
  hookTitle: { fontSize: 18, fontWeight: "700", color: "#7DB58D", marginBottom: 8 },
  hookBody: {
    fontSize: 15,
    color: "#4A4A4A",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 12,
  },
  hookDismiss: { fontSize: 12, color: "#9E9E9E" },
});
