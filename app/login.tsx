import { useState, useEffect } from "react";
import { StatusBar } from "expo-status-bar";
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
} from "react-native";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithCredential,
} from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";
import { Redirect, useRouter } from "expo-router";
import { auth, db } from "../firebaseConfig";
import { useAuth } from "../context/AuthContext";

WebBrowser.maybeCompleteAuthSession();

const GOOGLE_WEB_CLIENT_ID =
  "120361277566-9lntlbsuo9q4vhb07ptkddoevq11178a.apps.googleusercontent.com";

export default function LoginScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    clientId: GOOGLE_WEB_CLIENT_ID,
  });

  useEffect(() => {
    if (response?.type === "success" && response.params?.id_token) {
      handleGoogleCredential(response.params.id_token);
    }
  }, [response]);

  if (user) {
    return <Redirect href="/home" />;
  }

  const handleGoogleCredential = async (idToken: string) => {
    setGoogleLoading(true);
    try {
      const credential = GoogleAuthProvider.credential(idToken);
      const result = await signInWithCredential(auth, credential);

      // Create user doc if it doesn't exist (first-time Google sign-in)
      const userDoc = doc(db, "users", result.user.uid);
      const existing = await getDoc(userDoc);
      if (!existing.exists()) {
        await setDoc(userDoc, {
          email: result.user.email || "",
          displayName: result.user.displayName || "",
          createdAt: serverTimestamp(),
          study_materials: [],
        });
      }

      router.replace("/home");
    } catch (error: any) {
      Alert.alert("Google Sign-In Failed", error?.message || String(error));
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleAuth = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert("Oops", "Please fill in both email and password.");
      return;
    }

    setLoading(true);
    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      } else {
        const userCredential = await createUserWithEmailAndPassword(
          auth,
          email.trim(),
          password
        );
        await setDoc(doc(db, "users", userCredential.user.uid), {
          email: email.trim(),
          displayName: "",
          createdAt: serverTimestamp(),
          study_materials: [],
        });
      }
      router.replace("/home");
    } catch (error: any) {
      const msg = getFriendlyError(error.code);
      Alert.alert("Something went wrong", msg);
    } finally {
      setLoading(false);
    }
  };

  const getFriendlyError = (code: string): string => {
    switch (code) {
      case "auth/invalid-email":
        return "That email address doesn't look right.";
      case "auth/user-disabled":
        return "This account has been disabled.";
      case "auth/user-not-found":
        return "No account found with that email.";
      case "auth/wrong-password":
        return "Incorrect password. Please try again.";
      case "auth/email-already-in-use":
        return "An account with that email already exists.";
      case "auth/weak-password":
        return "Password should be at least 6 characters.";
      case "auth/too-many-requests":
        return "Too many attempts. Please wait and try again.";
      default:
        return "An unexpected error occurred. Please try again.";
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <StatusBar style="dark" />

      <View style={styles.header}>
        <Text style={styles.logo}>🌱</Text>
        <Text style={styles.title}>BloomLearn</Text>
        <Text style={styles.subtitle}>Grow your knowledge</Text>
      </View>

      <View style={styles.form}>
        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor="#B0B0B0"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor="#B0B0B0"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleAuth}
          disabled={loading}
          activeOpacity={0.8}
        >
          {loading ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={styles.buttonText}>
              {isLogin ? "Log In" : "Sign Up"}
            </Text>
          )}
        </TouchableOpacity>

        <View style={styles.dividerContainer}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or</Text>
          <View style={styles.dividerLine} />
        </View>

        <TouchableOpacity
          style={[styles.googleButton, googleLoading && styles.buttonDisabled]}
          onPress={() => promptAsync()}
          disabled={!request || googleLoading}
          activeOpacity={0.8}
        >
          {googleLoading ? (
            <ActivityIndicator color="#4A4A4A" />
          ) : (
            <Text style={styles.googleButtonText}>Sign in with Google</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setIsLogin(!isLogin)}
          style={styles.toggleContainer}
        >
          <Text style={styles.toggleText}>
            {isLogin
              ? "Don't have an account? "
              : "Already have an account? "}
            <Text style={styles.toggleLink}>
              {isLogin ? "Sign Up" : "Log In"}
            </Text>
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFF8F0",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  header: {
    alignItems: "center",
    marginBottom: 48,
  },
  logo: {
    fontSize: 56,
    marginBottom: 8,
  },
  title: {
    fontSize: 32,
    fontWeight: "700",
    color: "#4A4A4A",
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 16,
    color: "#9E9E9E",
    marginTop: 6,
    letterSpacing: 0.3,
  },
  form: {
    width: "100%",
  },
  input: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E0E0E0",
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 14,
    fontSize: 16,
    color: "#4A4A4A",
    marginBottom: 16,
  },
  button: {
    backgroundColor: "#7DB58D",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
  dividerContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#E0E0E0",
  },
  dividerText: {
    marginHorizontal: 16,
    fontSize: 14,
    color: "#9E9E9E",
  },
  googleButton: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1.5,
    borderColor: "#E0E0E0",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  googleButtonText: {
    color: "#4A4A4A",
    fontSize: 17,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
  toggleContainer: {
    marginTop: 24,
    alignItems: "center",
  },
  toggleText: {
    fontSize: 14,
    color: "#9E9E9E",
  },
  toggleLink: {
    color: "#7DB58D",
    fontWeight: "600",
  },
});
