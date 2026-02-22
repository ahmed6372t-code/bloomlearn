import { useEffect } from "react";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { AuthProvider, useAuth } from "../context/AuthContext";
import { ProgressProvider } from "../context/ProgressContext";
import { ThemeProvider } from "../context/ThemeContext";

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
      {/* Tab group — primary authenticated shell */}
      <Stack.Screen name="(tabs)" />
      {/* Full-screen stack screens on top of tabs */}
      <Stack.Screen name="index" />
      <Stack.Screen name="login" />
      <Stack.Screen name="importer" />
      <Stack.Screen name="compost-session" />
      <Stack.Screen name="games" />
      <Stack.Screen name="history" />
      <Stack.Screen name="settings" />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <ProgressProvider>
          <RootNavigator />
        </ProgressProvider>
      </ThemeProvider>
    </AuthProvider>
  );
}
