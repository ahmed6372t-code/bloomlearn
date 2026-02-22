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
import { useTheme } from "../context/ThemeContext";

export default function ImportScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const { registerMaterial } = useProgress();
  const { isDark, colors } = useTheme();
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

  // textInput — used for paste flow (direct text bypass)
  // fileOverride — used for file flow (storageUri → multimodal Cloud Function)
  const handleProcess = async (
    textInput?: string,
    fileOverride?: { storageUri: string; downloadUrl?: string; mimeType?: string }
  ) => {
    const content = (textInput ?? text).trim();

    // Skip the 50-char check for file uploads — the function validates server-side
    if (!fileOverride && content.length < 50) {
      Alert.alert(
        "Not enough content",
        "Please paste at least 50 characters of study material so we can generate meaningful activities."
      );
      return;
    }

    Keyboard.dismiss();
    // Don't re-start pulse/baking state if already set (file upload path pre-sets it)
    if (!fileOverride) {
      startPulse();
      setIsBaking(true);
      setProgressText("Starting...");
      setProgressPercent(0);
    }

    try {
      setProgressText("Preparing the soil...");
      if (!fileOverride) setProgressPercent(15);

      const bakeMaterial = httpsCallable<
      { text?: string; storageUri?: string; downloadUrl?: string; mimeType?: string },
      RecipeMatrix
      >(functions, "bakeMaterial");

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

      // File upload path → multimodal; text paste path → plain text
      const payload = fileOverride
        ? { storageUri: fileOverride.storageUri, downloadUrl: fileOverride.downloadUrl, mimeType: fileOverride.mimeType }
        : { text: content };

      const result = await bakeMaterial(payload);
      clearInterval(progressTimer);

      const matrix = result.data;
      setProgressText("Seeds planted!");
      setProgressPercent(100);

      const materialId = Date.now().toString(36);
      const sourceLabel = fileOverride ? `[file] ${fileOverride.storageUri}` : content;

      // Register in ProgressContext → saved to Firestore + local state
      registerMaterial(materialId, matrix.topic_title, "Imported", sourceLabel, matrix);

      stopPulse();
      setIsBaking(false);

      router.push({
        pathname: "/games/remember",
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
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <StatusBar style={isDark ? "light" : "dark"} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.6}>
          <Text style={[styles.backButton, { color: colors.accent }]}>← Back</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Plant New Seeds</Text>
        <Text style={[styles.subtitle, { color: colors.muted }]}
        >
          Paste your study material and we'll plant it into your learning garden.
        </Text>
      </View>

      {isBaking ? (
        <View style={styles.loadingContainer}>
          <Animated.Text style={[styles.loadingEmoji, { opacity: pulseAnim }]}>
            🌱
          </Animated.Text>
          <Text style={[styles.loadingText, { color: colors.muted }]}>{progressText}</Text>

          {/* Progress bar */}
          <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
            <View
              style={[styles.progressFill, { width: `${progressPercent}%`, backgroundColor: colors.accent }]}
            />
          </View>
          <Text style={[styles.progressPercent, { color: colors.muted }]}>{progressPercent}%</Text>

          <ActivityIndicator
            color={colors.accent}
            size="small"
            style={{ marginTop: 16 }}
          />
        </View>
      ) : (
        <>

          <View style={styles.inputWrapper}>
            <TextInput
              ref={inputRef}
              style={[styles.textInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]}
              placeholder="Paste your notes, textbook excerpt, article, or any study material here..."
              placeholderTextColor={colors.muted}
              value={text}
              onChangeText={setText}
              multiline
              textAlignVertical="top"
              autoCorrect={false}
            />
            <Text
              style={[styles.charCount, { color: isValid ? colors.accent : colors.muted }]}
            >
              {charCount} characters{charCount < 50 ? " (min 50)" : ""}
            </Text>
          </View>

          <TouchableOpacity
            style={[
              styles.processButton,
              { backgroundColor: colors.accent },
              !isValid && styles.processButtonDisabled,
            ]}
            onPress={() => handleProcess()}
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
    paddingHorizontal: 24,
    paddingTop: 64,
    paddingBottom: 32,
  },
  header: {
    marginBottom: 24,
  },
  backButton: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 20,
  },
  title: {
    fontSize: 26,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  subtitle: {
    fontSize: 15,
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
    letterSpacing: 0.3,
    textAlign: "center",
    marginBottom: 20,
  },
  progressTrack: {
    width: "80%",
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
  },
  progressFill: {
    height: 8,
    borderRadius: 4,
  },
  progressPercent: {
    fontSize: 13,
    marginTop: 6,
  },
  inputWrapper: {
    flex: 1,
    marginBottom: 16,
  },
  textInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 16,
    fontSize: 16,
    lineHeight: 24,
  },
  charCount: {
    fontSize: 13,
    textAlign: "right",
    marginTop: 8,
  },
  processButton: {
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
