import { useEffect, useRef } from "react";
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Animated,
  Modal,
} from "react-native";
import { triggerHaptic } from "../../lib/engagement";
import { useTheme } from "../../context/ThemeContext";

interface LevelUpSplashProps {
  visible: boolean;
  newLevel: number;
  statName: string; // "+1 Memory", "+1 Analysis", "+1 Execution"
  onDismiss: () => void;
}

export default function LevelUpSplash({
  visible,
  newLevel,
  statName,
  onDismiss,
}: LevelUpSplashProps) {
  const { colors } = useTheme();
  const scaleAnim = useRef(new Animated.Value(0.5)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;
    triggerHaptic("golden");
    Animated.parallel([
      Animated.spring(scaleAnim, { toValue: 1, friction: 4, tension: 80, useNativeDriver: true }),
      Animated.timing(opacityAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
    ]).start();

    const timer = setTimeout(onDismiss, 4000);
    return () => clearTimeout(timer);
  }, [visible]);

  if (!visible) return null;

  return (
    <Modal transparent animationType="fade" visible={visible}>
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={onDismiss}
      >
        <Animated.View
          style={[
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.accent },
            { transform: [{ scale: scaleAnim }], opacity: opacityAnim },
          ]}
        >
          <Text style={styles.emoji}>🌳</Text>
          <Text style={styles.title}>LEVEL UP!</Text>
          <Text style={styles.level}>Garden Level {newLevel}</Text>
          <View style={styles.statBadge}>
            <Text style={styles.statText}>{statName}</Text>
          </View>
          <Text style={styles.hint}>Tap to continue</Text>
        </Animated.View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
  },
  card: {
    borderRadius: 24,
    padding: 40,
    alignItems: "center",
    width: "80%",
    borderWidth: 3,
  },
  emoji: { fontSize: 72, marginBottom: 12 },
  title: {
    fontSize: 32,
    fontWeight: "900",
    color: "#FFD700",
    letterSpacing: 2,
    marginBottom: 4,
  },
  level: {
    fontSize: 20,
    fontWeight: "700",
    color: "#4A4A4A",
    marginBottom: 16,
  },
  statBadge: {
    backgroundColor: "#7DB58D",
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 8,
    marginBottom: 16,
  },
  statText: {
    color: "#FFF",
    fontSize: 18,
    fontWeight: "700",
  },
  hint: {
    fontSize: 13,
    color: "#9E9E9E",
  },
});
