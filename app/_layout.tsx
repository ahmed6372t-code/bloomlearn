import { useEffect } from "react";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { AuthProvider, useAuth } from "../context/AuthContext";
import { ProgressProvider } from "../context/ProgressContext";

// Firebase 12 JS SDK removed getReactNativePersistence but still logs a warning
// when it detects React Native without it. Suppress this false-positive.
if (__DEV__) {
  const _warn = console.warn;
  console.warn = (...args: unknown[]) => {
    if (typeof args[0] === "string" && args[0].includes("getReactNativePersistence")) return;
    _warn(...args);
  };
}

SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const { isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading) {
      SplashScreen.hideAsync();
    }
  }, [isLoading]);

  if (isLoading) return null;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="login" />
      <Stack.Screen name="home" />
      <Stack.Screen name="importer" />
      <Stack.Screen name="games" />
      <Stack.Screen name="history" />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <ProgressProvider>
        <RootNavigator />
      </ProgressProvider>
    </AuthProvider>
  );
}
