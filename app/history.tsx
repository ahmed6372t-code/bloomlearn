import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { Redirect, useRouter } from "expo-router";
import { useAuth } from "../context/AuthContext";
import { useProgress } from "../context/ProgressContext";

export default function HistoryScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const { state } = useProgress();

  if (!user) {
    return <Redirect href="/login" />;
  }

  const entries = Object.entries(state.materials).sort(
    ([, a], [, b]) => b.createdAt - a.createdAt
  );

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.6}>
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>

        <Text style={styles.title}>My Garden Plots</Text>
        <Text style={styles.subtitle}>
          {entries.length === 0
            ? "No seeds planted yet — import some material to start growing!"
            : `${entries.length} plot${entries.length === 1 ? "" : "s"} in your garden`}
        </Text>

        {entries.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>🌱</Text>
            <Text style={styles.emptyText}>
              Your garden plots will appear here once you plant some seeds.
            </Text>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => router.push("/importer")}
              activeOpacity={0.8}
            >
              <Text style={styles.primaryButtonText}>Plant Seeds</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.list}>
            {entries.map(([id, mat]) => (
              <TouchableOpacity
                key={id}
                style={styles.card}
                activeOpacity={0.8}
                onPress={() =>
                  router.push({
                    pathname: "/games",
                    params: { materialId: id },
                  })
                }
              >
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle} numberOfLines={2}>
                    {mat.title}
                  </Text>
                  <View style={styles.starsPill}>
                    <Text style={styles.starsText}>
                      {["🌰", "🌱", "🌿", "🌳"][Math.min(mat.stagesCompleted.length, 3)]} {mat.stagesCompleted.length}/3
                    </Text>
                  </View>
                </View>
                <Text style={styles.cardCategory}>{mat.category}</Text>
                <View style={styles.cardFooter}>
                  <Text style={styles.xpLabel}>{mat.xpEarned} water drops</Text>
                  <Text style={styles.stagesLabel}>
                    {mat.stagesCompleted.length === 0
                      ? "Not started"
                      : mat.stagesCompleted.length === 3
                        ? "Fully bloomed! 🌳"
                        : `${mat.stagesCompleted.length} stage${mat.stagesCompleted.length === 1 ? "" : "s"} grown`}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
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
  emptyState: {
    alignItems: "center",
    paddingTop: 48,
  },
  emptyEmoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 16,
    color: "#9E9E9E",
    textAlign: "center",
    lineHeight: 24,
    marginBottom: 32,
    paddingHorizontal: 16,
  },
  list: {
    gap: 12,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: "#E8E8E8",
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 6,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: "#4A4A4A",
    flex: 1,
    marginRight: 12,
  },
  starsPill: {
    backgroundColor: "#FFF8F0",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  starsText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#4A4A4A",
  },
  cardCategory: {
    fontSize: 13,
    color: "#7DB58D",
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  xpLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#9E9E9E",
  },
  stagesLabel: {
    fontSize: 12,
    color: "#B0B0B0",
  },
  primaryButton: {
    backgroundColor: "#7DB58D",
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 32,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
});
