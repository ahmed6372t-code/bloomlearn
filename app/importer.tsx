import { useState, useRef } from "react";
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Keyboard,
  Animated,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { Redirect, useRouter } from "expo-router";
import { httpsCallable } from "firebase/functions";
import { useAuth } from "../context/AuthContext";
import { useProgress } from "../context/ProgressContext";
import { functions } from "../firebaseConfig";
import type { RecipeMatrix } from "../lib/gemini";

export default function ImportScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const { registerMaterial } = useProgress();
  const [text, setText] = useState("");
  const [isBaking, setIsBaking] = useState(false);
  const [progressText, setProgressText] = useState("");
  const [progressPercent, setProgressPercent] = useState(0);
  const inputRef = useRef<TextInput>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  if (!user) {
    return <Redirect href="/login" />;
  }

  const charCount = text.trim().length;
  const isValid = charCount >= 50;

  const startPulse = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.4,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    ).start();
  };

  const stopPulse = () => {
    pulseAnim.stopAnimation();
    pulseAnim.setValue(1);
  };

  const handleProcess = async () => {
    if (!isValid) {
      Alert.alert(
        "Not enough content",
        "Please paste at least 50 characters of study material so we can generate meaningful activities."
      );
      return;
    }

    Keyboard.dismiss();
    startPulse();
    setIsBaking(true);
    setProgressText("Starting...");
    setProgressPercent(0);

    try {
      // Simulated progress while Cloud Function runs
      setProgressText("Preparing the soil...");
      setProgressPercent(15);

      const bakeMaterial = httpsCallable<{ text: string }, RecipeMatrix>(
        functions,
        "bakeMaterial"
      );

      const progressTimer = setInterval(() => {
        setProgressPercent((prev) => {
          if (prev >= 85) {
            clearInterval(progressTimer);
            return 85;
          }
          const step = prev < 40 ? 8 : prev < 70 ? 5 : 2;
          const messages =
            prev < 30
              ? "Digging the garden bed..."
              : prev < 55
              ? "Sorting the seed packets..."
              : prev < 75
              ? "Planting knowledge seeds..."
              : "Watering the fresh soil...";
          setProgressText(messages);
          return prev + step;
        });
      }, 1500);

      const result = await bakeMaterial({ text: text.trim() });
      clearInterval(progressTimer);

      const matrix = result.data;
      setProgressText("Seeds planted!");
      setProgressPercent(100);

      const materialId = Date.now().toString(36);

      // Save everything to local context (and Firestore via ProgressContext)
      registerMaterial(materialId, matrix.topic_title, "Imported", text.trim(), matrix);

      stopPulse();
      setIsBaking(false);

      router.push({
        pathname: "/games",
        params: { materialId },
      });
    } catch (error: any) {
      stopPulse();
      setIsBaking(false);
      const msg = error?.message || error?.details || String(error);
      Alert.alert("Planting Failed", msg);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <StatusBar style="dark" />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.6}>
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Plant New Seeds</Text>
        <Text style={styles.subtitle}>
          Paste your study material and we'll plant it into your learning garden.
        </Text>
      </View>

      {isBaking ? (
        <View style={styles.loadingContainer}>
          <Animated.Text style={[styles.loadingEmoji, { opacity: pulseAnim }]}>
            🌱
          </Animated.Text>
          <Text style={styles.loadingText}>{progressText}</Text>

          {/* Progress bar */}
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
          </View>
          <Text style={styles.progressPercent}>{progressPercent}%</Text>

          <ActivityIndicator
            color="#7DB58D"
            size="small"
            style={{ marginTop: 16 }}
          />
        </View>
      ) : (
        <>
          <View style={styles.inputWrapper}>
            <TextInput
              ref={inputRef}
              style={styles.textInput}
              placeholder="Paste your notes, textbook excerpt, article, or any study material here..."
              placeholderTextColor="#C4C4C4"
              value={text}
              onChangeText={setText}
              multiline
              textAlignVertical="top"
              autoCorrect={false}
            />
            <Text style={[styles.charCount, isValid && styles.charCountValid]}>
              {charCount} characters{charCount < 50 ? " (min 50)" : ""}
            </Text>
          </View>

          <TouchableOpacity
            style={[
              styles.processButton,
              !isValid && styles.processButtonDisabled,
            ]}
            onPress={handleProcess}
            disabled={!isValid}
            activeOpacity={0.8}
          >
            <Text style={styles.processButtonText}>Plant Seeds</Text>
          </TouchableOpacity>
        </>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFF8F0",
    paddingHorizontal: 24,
    paddingTop: 64,
    paddingBottom: 32,
  },
  header: {
    marginBottom: 24,
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
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingEmoji: {
    fontSize: 64,
    marginBottom: 20,
  },
  loadingText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#7DB58D",
    letterSpacing: 0.3,
    textAlign: "center",
    marginBottom: 20,
  },
  progressTrack: {
    width: "80%",
    height: 8,
    backgroundColor: "#E8E8E8",
    borderRadius: 4,
    overflow: "hidden",
  },
  progressFill: {
    height: 8,
    backgroundColor: "#7DB58D",
    borderRadius: 4,
  },
  progressPercent: {
    fontSize: 13,
    color: "#9E9E9E",
    marginTop: 6,
  },
  inputWrapper: {
    flex: 1,
    marginBottom: 16,
  },
  textInput: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E0E0E0",
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 16,
    fontSize: 16,
    color: "#4A4A4A",
    lineHeight: 24,
  },
  charCount: {
    fontSize: 13,
    color: "#C4C4C4",
    textAlign: "right",
    marginTop: 8,
  },
  charCountValid: {
    color: "#7DB58D",
  },
  processButton: {
    backgroundColor: "#7DB58D",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  processButtonDisabled: {
    opacity: 0.45,
  },
  processButtonText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
});
