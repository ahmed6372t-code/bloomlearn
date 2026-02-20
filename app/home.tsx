import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Animated,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { signOut } from "firebase/auth";
import { Redirect, useRouter } from "expo-router";
import { useRef, useEffect } from "react";
import { auth } from "../firebaseConfig";
import { useAuth } from "../context/AuthContext";
import { useProgress, calculateFreshness, getStreakMultiplier, getStreakLabel } from "../context/ProgressContext";

// --- PlantGrowth Component ---

interface PlantGrowthProps {
  level: number;
  currentXP: number;
  totalXP: number;
}

function PlantGrowth({ level, currentXP, totalXP }: PlantGrowthProps) {
  const prevLevel = Math.floor(totalXP / 200);
  const nextLevelXP = (prevLevel + 1) * 200;
  const xpInThisLevel = currentXP - prevLevel * 200;
  const xpNeeded = 200;
  const progressPercent = (xpInThisLevel / xpNeeded) * 100;

  // Map level to plant emoji
  const getPlantEmoji = (lvl: number): string => {
    if (lvl < 1) return "🏜️"; // Dirt
    if (lvl < 5) return "🌱"; // Sprout
    if (lvl < 10) return "🌿"; // Seedling
    if (lvl < 15) return "🪴"; // Sapling
    if (lvl < 20) return "🌸"; // Blooming
    return "🌳"; // Mature Tree
  };

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
    <View style={s.plantContainer}>
      <Animated.Text style={[s.plantEmoji, { transform: [{ scale: scaleAnim }] }]}>
        {getPlantEmoji(level)}
      </Animated.Text>
      <Text style={s.levelText}>Level {level}</Text>
      <View style={s.progressBarContainer}>
        <View style={s.progressBarBg}>
          <View style={[s.progressBarFill, { width: `${progressPercent}%` }]} />
        </View>
        <Text style={s.xpText}>
          {xpInThisLevel}/{xpNeeded} Water Drops
        </Text>
      </View>
    </View>
  );
}

// --- Stage Card Component ---

interface StageCardProps {
  stageName: "remember" | "understand" | "apply";
  stageLabel: string;
  stageEmoji: string;
  isCompleted: boolean;
  isLocked: boolean;
  hasFailedAttempt: boolean;
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
  accuracy,
  maxCombo,
  freshness = 100,
  onPress,
}: StageCardProps) {
  // Determine wilting state for completed stages
  const isFullyWilted = isCompleted && freshness === 0;
  const isWilting = isCompleted && freshness <= 50 && freshness > 0;
  const isDrooping = isCompleted && freshness === 75;

  return (
    <TouchableOpacity
      style={[
        s.stageCard,
        isLocked && s.stageCardLocked,
        isCompleted && !isFullyWilted && s.stageCardCompleted,
        isFullyWilted && s.stageCardWilted,
        isWilting && s.stageCardWilting,
        isDrooping && s.stageCardDrooping,
        hasFailedAttempt && !isCompleted && s.stageCardRetry,
      ]}
      onPress={onPress}
      disabled={isLocked}
      activeOpacity={isLocked ? 1 : 0.7}
    >
      <View style={s.stageCardHeader}>
        <Text style={[s.stageEmoji, isFullyWilted && { opacity: 0.4 }]}>
          {isFullyWilted ? "🥀" : stageEmoji}
        </Text>
        <Text style={[s.stageLabel, isLocked && s.stageLabelLocked, isFullyWilted && { opacity: 0.6 }]}>
          {stageLabel}
        </Text>
        {isCompleted && !isFullyWilted && <Text style={s.checkmark}>✓</Text>}
        {isFullyWilted && <Text style={s.wiltedWarning}>!</Text>}
        {isLocked && <Text style={s.lockEmoji}>🔒</Text>}
      </View>

      {isLocked && (
        <Text style={s.lockedMessage}>
          Master previous stage{"\n"}(80% accuracy + x3 combo)
        </Text>
      )}

      {hasFailedAttempt && !isCompleted && (
        <View style={s.failedBadge}>
          <Text style={s.failedBadgeText}>⚠️ -5 XP Penalty</Text>
        </View>
      )}

      {isCompleted && !isFullyWilted && (
        <Text style={[s.completedStats, isWilting && { opacity: 0.7 }]}>
          {accuracy && maxCombo
            ? `${Math.round(accuracy * 100)}% Accuracy · x${maxCombo} Combo`
            : "Mastered"}
        </Text>
      )}

      {isFullyWilted && (
        <View style={s.wiltedBadge}>
          <Text style={s.wiltedBadgeText}>Needs Watering!</Text>
          <Text style={s.wiltedBadgeSubtext}>Replay to restore</Text>
        </View>
      )}

      {isWilting && !isFullyWilted && (
        <Text style={s.wiltingWarning}>⚠️ Knowledge wilting</Text>
      )}

      {isDrooping && (
        <Text style={s.droopingWarning}>📉 Fading (review soon)</Text>
      )}

      {!isLocked && !isCompleted && !hasFailedAttempt && (
        <Text style={s.playNowText}>Tap to Play →</Text>
      )}

      {!isLocked && hasFailedAttempt && !isCompleted && (
        <Text style={s.retryText}>Retry Stage</Text>
      )}

      {isFullyWilted && (
        <Text style={s.replayText}>Tap to Replay →</Text>
      )}
    </TouchableOpacity>
  );
}

// --- Main Home Screen ---

export default function HomeScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const { state, canUnlockStage } = useProgress();

  if (!user) {
    return <Redirect href="/login" />;
  }

  const level = Math.floor(state.totalXP / 200);
  const materialCount = Object.keys(state.materials).length;

  const handleSignOut = async () => {
    await signOut(auth);
    router.replace("/login");
  };

  const getStageRoute = (materialId: string, stageName: string) => {
    return `/games/${stageName}?materialId=${materialId}`;
  };

  return (
    <View style={s.container}>
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={s.header}>
          <Text style={s.greeting}>Your Garden</Text>
          <Text style={s.email}>{user?.email}</Text>
        </View>

        {/* Garden Evolution */}
        <PlantGrowth level={level} currentXP={state.totalXP} totalXP={state.totalXP} />

        {/* Quick Stats */}
        {(() => {
          const multiplier = getStreakMultiplier(state.streakData.currentStreak);
          return (
            <View style={s.statsCard}>
              <View style={s.statBox}>
                <Text style={s.statNumber}>{state.totalXP}</Text>
                <Text style={s.statName}>Water Drops</Text>
              </View>
              <View style={s.statBox}>
                <Text style={s.statNumber}>{state.totalStars}</Text>
                <Text style={s.statName}>Plots Mastered</Text>
              </View>
              <View style={[s.statBox, state.streakData.currentStreak > 0 && s.statBoxStreak]}>
                <Text style={s.streakEmoji}>🌞</Text>
                <Text style={s.streakNumber}>{state.streakData.currentStreak}</Text>
                <Text style={s.statName}>{getStreakLabel(state.streakData.currentStreak)}</Text>
                {multiplier > 1 && (
                  <Text style={s.multiplierBadge}>{multiplier.toFixed(1)}x XP</Text>
                )}
              </View>
            </View>
          );
        })()}

        {/* Plant New Seeds Button */}
        <TouchableOpacity
          style={s.importButton}
          onPress={() => router.push("/importer")}
          activeOpacity={0.8}
        >
          <Text style={s.importEmoji}>🌱</Text>
          <Text style={s.importTitle}>Plant New Seeds</Text>
          <Text style={s.importSubtitle}>
            Paste study material and grow your knowledge garden
          </Text>
        </TouchableOpacity>

        {/* Material Stages */}
        {materialCount === 0 ? (
          <View style={s.emptyState}>
            <Text style={s.emptyStateEmoji}>🏡</Text>
            <Text style={s.emptyStateTitle}>Your garden awaits</Text>
            <Text style={s.emptyStateSubtitle}>
              Plant some seeds to begin your learning journey
            </Text>
          </View>
        ) : (
          Object.entries(state.materials).map(([materialId, material]) => (
            <View key={materialId} style={s.materialSection}>
              <View style={s.materialHeader}>
                <Text style={s.materialTitle}>{material.title}</Text>
                <Text style={s.materialCategory}>{material.category}</Text>
              </View>

              {/* Three Stages */}
              <View style={s.stagesGrid}>
                {/* Remember Stage */}
                <StageCard
                  stageName="remember"
                  stageLabel="The Seed Library"
                  stageEmoji="🌾"
                  isCompleted={material.stagesCompleted?.includes("remember") ?? false}
                  isLocked={false}
                  hasFailedAttempt={
                    !!(
                      material.stageResults?.remember &&
                      !(material.stagesCompleted?.includes("remember") ?? false)
                    )
                  }
                  accuracy={material.stageResults?.remember?.accuracy}
                  maxCombo={material.stageResults?.remember?.maxCombo}
                  freshness={calculateFreshness(material.stageResults?.remember?.lastPlayedTimestamp)}
                  onPress={() =>
                    router.push(getStageRoute(materialId, "remember"))
                  }
                />

                {/* Understand Stage */}
                <StageCard
                  stageName="understand"
                  stageLabel="The Greenhouse"
                  stageEmoji="🌿"
                  isCompleted={material.stagesCompleted?.includes("understand") ?? false}
                  isLocked={!canUnlockStage(materialId, "understand")}
                  hasFailedAttempt={
                    !!(
                      material.stageResults?.understand &&
                      !(material.stagesCompleted?.includes("understand") ?? false)
                    )
                  }
                  accuracy={material.stageResults?.understand?.accuracy}
                  maxCombo={material.stageResults?.understand?.maxCombo}
                  freshness={calculateFreshness(material.stageResults?.understand?.lastPlayedTimestamp)}
                  onPress={() => {
                    if (!canUnlockStage(materialId, "understand")) {
                      return;
                    }
                    router.push(getStageRoute(materialId, "understand"));
                  }}
                />

                {/* Apply Stage */}
                <StageCard
                  stageName="apply"
                  stageLabel="The Potting Bench"
                  stageEmoji="🪴"
                  isCompleted={material.stagesCompleted?.includes("apply") ?? false}
                  isLocked={!canUnlockStage(materialId, "apply")}
                  hasFailedAttempt={
                    !!(
                      material.stageResults?.apply &&
                      !(material.stagesCompleted?.includes("apply") ?? false)
                    )
                  }
                  accuracy={material.stageResults?.apply?.accuracy}
                  maxCombo={material.stageResults?.apply?.maxCombo}
                  freshness={calculateFreshness(material.stageResults?.apply?.lastPlayedTimestamp)}
                  onPress={() => {
                    if (!canUnlockStage(materialId, "apply")) {
                      return;
                    }
                    router.push(getStageRoute(materialId, "apply"));
                  }}
                />
              </View>
            </View>
          ))
        )}

        {/* My Garden Plots Button */}
        <TouchableOpacity
          style={s.historyButton}
          onPress={() => router.push("/history")}
          activeOpacity={0.8}
        >
          <Text style={s.historyButtonText}>📋 My Garden Plots</Text>
        </TouchableOpacity>

        {/* Sign Out Button */}
        <TouchableOpacity
          style={s.signOutButton}
          onPress={handleSignOut}
          activeOpacity={0.8}
        >
          <Text style={s.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFF8F0",
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 24,
  },
  greeting: {
    fontSize: 28,
    fontWeight: "700",
    color: "#4A4A4A",
    letterSpacing: 0.3,
  },
  email: {
    fontSize: 14,
    color: "#9E9E9E",
    marginTop: 4,
  },

  // --- Plant Growth Styles ---
  plantContainer: {
    backgroundColor: "#FFF",
    borderRadius: 20,
    padding: 24,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#E8F5E9",
    alignItems: "center",
  },
  plantEmoji: {
    fontSize: 64,
    marginBottom: 8,
  },
  levelText: {
    fontSize: 20,
    fontWeight: "700",
    color: "#7DB58D",
    marginBottom: 4,
  },
  progressBarContainer: {
    width: "100%",
    marginTop: 12,
  },
  progressBarBg: {
    height: 8,
    backgroundColor: "#E8F5E9",
    borderRadius: 4,
    overflow: "hidden",
    marginBottom: 6,
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: "#7DB58D",
    borderRadius: 4,
  },
  xpText: {
    fontSize: 12,
    color: "#9E9E9E",
    textAlign: "center",
    fontWeight: "600",
  },

  // --- Stats Card ---
  statsCard: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 20,
  },
  statBox: {
    flex: 1,
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E8E8E8",
  },
  statNumber: {
    fontSize: 22,
    fontWeight: "700",
    color: "#7DB58D",
  },
  statName: {
    fontSize: 11,
    color: "#9E9E9E",
    marginTop: 4,
    fontWeight: "600",
  },
  statBoxStreak: {
    backgroundColor: "#FFFAED",
    borderColor: "#FFD700",
  },
  streakEmoji: {
    fontSize: 24,
    marginBottom: 4,
  },
  streakNumber: {
    fontSize: 26,
    fontWeight: "700",
    color: "#FFB800",
    lineHeight: 30,
  },
  multiplierBadge: {
    fontSize: 10,
    color: "#FFF",
    backgroundColor: "#FF9800",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 4,
    fontWeight: "700",
    overflow: "hidden",
  },

  // --- Import Button ---
  importButton: {
    backgroundColor: "#7DB58D",
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
  },
  importEmoji: {
    fontSize: 32,
    marginBottom: 8,
  },
  importTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#FFFFFF",
    marginBottom: 4,
  },
  importSubtitle: {
    fontSize: 13,
    color: "rgba(255,255,255,0.85)",
    lineHeight: 18,
  },

  // --- Empty State ---
  emptyState: {
    alignItems: "center",
    paddingVertical: 40,
  },
  emptyStateEmoji: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#4A4A4A",
    marginBottom: 6,
  },
  emptyStateSubtitle: {
    fontSize: 14,
    color: "#9E9E9E",
  },

  // --- Material Section ---
  materialSection: {
    marginBottom: 24,
  },
  materialHeader: {
    marginBottom: 12,
  },
  materialTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#4A4A4A",
    marginBottom: 2,
  },
  materialCategory: {
    fontSize: 12,
    color: "#7DB58D",
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  // --- Stages Grid ---
  stagesGrid: {
    gap: 10,
  },

  // --- Stage Card Styles ---
  stageCard: {
    backgroundColor: "#FFF",
    borderRadius: 14,
    padding: 16,
    borderWidth: 2,
    borderColor: "#E8F5E9",
  },
  stageCardLocked: {
    backgroundColor: "#F5F5F5",
    borderColor: "#E0E0E0",
    opacity: 0.7,
  },
  stageCardCompleted: {
    backgroundColor: "#F1F8F5",
    borderColor: "#7DB58D",
    borderWidth: 2,
  },
  stageCardDrooping: {
    backgroundColor: "#FFF9E6",
    borderColor: "#FFD54F",
    borderWidth: 2,
  },
  stageCardWilting: {
    backgroundColor: "#FFF3E0",
    borderColor: "#FFB74D",
    borderWidth: 2,
    opacity: 0.85,
  },
  stageCardWilted: {
    backgroundColor: "#FFEBEE",
    borderColor: "#EF5350",
    borderWidth: 2,
    opacity: 0.75,
  },
  stageCardRetry: {
    backgroundColor: "#FFF8E1",
    borderColor: "#FFB74D",
  },

  stageCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  stageEmoji: {
    fontSize: 24,
    marginRight: 10,
  },
  stageLabel: {
    fontSize: 15,
    fontWeight: "700",
    color: "#4A4A4A",
    flex: 1,
  },
  stageLabelLocked: {
    color: "#9E9E9E",
  },
  checkmark: {
    fontSize: 20,
    color: "#7DB58D",
    fontWeight: "700",
  },
  lockEmoji: {
    fontSize: 16,
  },

  lockedMessage: {
    fontSize: 12,
    color: "#9E9E9E",
    lineHeight: 16,
    fontWeight: "500",
  },

  failedBadge: {
    backgroundColor: "#FFF3CD",
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginTop: 8,
  },
  failedBadgeText: {
    fontSize: 12,
    color: "#856404",
    fontWeight: "700",
  },

  completedStats: {
    fontSize: 13,
    color: "#7DB58D",
    fontWeight: "600",
    marginTop: 8,
  },

  playNowText: {
    fontSize: 13,
    color: "#7DB58D",
    fontWeight: "700",
    marginTop: 8,
  },

  retryText: {
    fontSize: 13,
    color: "#FFB74D",
    fontWeight: "700",
    marginTop: 8,
  },

  wiltedBadge: {
    backgroundColor: "#FFCDD2",
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginTop: 8,
  },
  wiltedBadgeText: {
    fontSize: 13,
    color: "#C62828",
    fontWeight: "700",
  },
  wiltedBadgeSubtext: {
    fontSize: 11,
    color: "#D32F2F",
    fontWeight: "600",
    marginTop: 2,
  },
  wiltingWarning: {
    fontSize: 12,
    color: "#E65100",
    fontWeight: "600",
    marginTop: 8,
  },
  droopingWarning: {
    fontSize: 12,
    color: "#F57F17",
    fontWeight: "600",
    marginTop: 8,
  },
  wiltedWarning: {
    fontSize: 18,
    color: "#C62828",
    fontWeight: "700",
  },
  replayText: {
    fontSize: 13,
    color: "#D32F2F",
    fontWeight: "700",
    marginTop: 8,
  },

  // --- History Button ---
  historyButton: {
    marginTop: 8,
    borderWidth: 1.5,
    borderColor: "#7DB58D",
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: "center",
    marginBottom: 10,
    backgroundColor: "#F1F8F5",
  },
  historyButtonText: {
    color: "#7DB58D",
    fontSize: 15,
    fontWeight: "700",
  },

  // --- Sign Out Button ---
  signOutButton: {
    marginTop: 12,
    borderWidth: 1.5,
    borderColor: "#7DB58D",
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: "center",
    marginBottom: 20,
  },
  signOutText: {
    color: "#7DB58D",
    fontSize: 15,
    fontWeight: "700",
  },
});
