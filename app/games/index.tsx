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
import { useProgress } from "../../context/ProgressContext";

const STAGES = [
  { key: "remember", num: 1, label: "Seed Library", emoji: "📚", desc: "Collect seeds from memory", ready: true },
  { key: "understand", num: 2, label: "Greenhouse", emoji: "🏡", desc: "Sort seeds by concept", ready: true },
  { key: "apply", num: 3, label: "Potting Bench", emoji: "🪴", desc: "Pot seeds step by step", ready: true },
  { key: "analyze", num: 4, label: "Root Router", emoji: "🌿", desc: "Guide roots to water", ready: false },
  { key: "evaluate", num: 5, label: "Companion Planting", emoji: "🌼", desc: "Judge plant pairings", ready: false },
  { key: "create", num: 6, label: "Seed Splicer", emoji: "🧬", desc: "Create hybrid seeds", ready: false },
];

export default function GameSelectionScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const { state } = useProgress();
  const { materialId } = useLocalSearchParams<{
    materialId: string;
  }>();

  if (!user) {
    return <Redirect href="/login" />;
  }

  const mat = materialId ? state.materials[materialId] : undefined;
  const completedStages = mat?.stagesCompleted ?? [];
  const level = Math.floor(state.totalXP / 200);
  const xpInLevel = state.totalXP % 200;
  const growthStages = ["🌰", "🌱", "🌿", "🌸", "🌻", "🌳"];
  const growthEmoji = growthStages[Math.min(completedStages.length, growthStages.length - 1)];

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity onPress={() => router.replace("/home")} activeOpacity={0.6}>
          <Text style={styles.backButton}>← Dashboard</Text>
        </TouchableOpacity>

        <Text style={styles.title}>{growthEmoji} Growth Stages</Text>
        <Text style={styles.subtitle}>
          Nurture this plot through 6 stages of growth.
        </Text>

        {/* Stats header */}
        <View style={styles.statsRow}>
          <View style={styles.xpContainer}>
            <Text style={styles.statsLabel}>Garden Level {level}</Text>
            <View style={styles.xpTrack}>
              <View style={[styles.xpFill, { width: `${Math.round(xpInLevel / 2)}%` }]} />
            </View>
            <Text style={styles.xpText}>{state.totalXP} Water Drops</Text>
          </View>
          <View style={styles.starsBadge}>
            <Text style={styles.starsIcon}>🌱</Text>
            <Text style={styles.starsCount}>{state.totalStars}</Text>
          </View>
        </View>

        <View style={styles.stageList}>
          {STAGES.map((stage) => {
            const done = completedStages.includes(stage.key);
            return (
              <TouchableOpacity
                key={stage.key}
                style={[styles.stageCard, !stage.ready && styles.stageCardLocked]}
                activeOpacity={stage.ready ? 0.8 : 1}
                onPress={() => {
                  if (stage.ready) {
                    router.push({
                      pathname: `/games/${stage.key}`,
                      params: { materialId },
                    });
                  }
                }}
              >
                <Text style={styles.stageEmoji}>{stage.emoji}</Text>
                <View style={styles.stageInfo}>
                  <Text style={styles.stageNum}>Stage {stage.num}</Text>
                  <Text style={[styles.stageLabel, !stage.ready && styles.stageLabelLocked]}>
                    {stage.label}
                  </Text>
                  <Text style={styles.stageDesc}>{stage.desc}</Text>
                </View>
                {done ? (
                  <Text style={styles.checkmark}>✓</Text>
                ) : (
                  <Text style={styles.stageArrow}>{stage.ready ? "→" : "🔒"}</Text>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFF8F0",
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 64,
    paddingBottom: 40,
  },
  backButton: {
    fontSize: 16,
    color: "#7DB58D",
    fontWeight: "600",
    marginBottom: 20,
  },
  title: {
    fontSize: 26,
    fontWeight: "700",
    color: "#4A4A4A",
    letterSpacing: 0.3,
  },
  subtitle: {
    fontSize: 15,
    color: "#9E9E9E",
    marginTop: 8,
    lineHeight: 22,
    marginBottom: 28,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#E8E8E8",
  },
  xpContainer: {
    flex: 1,
    marginRight: 16,
  },
  statsLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#7DB58D",
    marginBottom: 6,
  },
  xpTrack: {
    height: 8,
    backgroundColor: "#E8E8E8",
    borderRadius: 4,
    overflow: "hidden",
  },
  xpFill: {
    height: 8,
    backgroundColor: "#7DB58D",
    borderRadius: 4,
  },
  xpText: {
    fontSize: 12,
    color: "#9E9E9E",
    marginTop: 4,
  },
  starsBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF8F0",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  starsIcon: {
    fontSize: 18,
    marginRight: 4,
  },
  starsCount: {
    fontSize: 17,
    fontWeight: "700",
    color: "#4A4A4A",
  },
  checkmark: {
    fontSize: 20,
    fontWeight: "700",
    color: "#7DB58D",
    marginLeft: 8,
  },
  stageList: {
    gap: 12,
  },
  stageCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: "#E8E8E8",
  },
  stageCardLocked: {
    opacity: 0.5,
  },
  stageEmoji: {
    fontSize: 32,
    marginRight: 16,
  },
  stageInfo: {
    flex: 1,
  },
  stageNum: {
    fontSize: 11,
    fontWeight: "700",
    color: "#7DB58D",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 2,
  },
  stageLabel: {
    fontSize: 17,
    fontWeight: "600",
    color: "#4A4A4A",
  },
  stageLabelLocked: {
    color: "#9E9E9E",
  },
  stageDesc: {
    fontSize: 13,
    color: "#B0B0B0",
    marginTop: 2,
  },
  stageArrow: {
    fontSize: 18,
    color: "#7DB58D",
    marginLeft: 8,
  },
});
