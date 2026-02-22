import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Text, TextInput } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

type ThemeColors = {
  background: string;
  surface: string;
  card: string;
  text: string;
  muted: string;
  border: string;
  accent: string;
  accentSoft: string;
  danger: string;
  dangerSoft: string;
  tabBarBackground: string;
  tabBarBorder: string;
  tabBarActive: string;
  tabBarInactive: string;
};

type ThemeContextType = {
  isDark: boolean;
  colors: ThemeColors;
  setDarkMode: (value: boolean) => void;
  toggleTheme: () => void;
};

const lightColors: ThemeColors = {
  background: "#FFF8F0",
  surface: "#FFFFFF",
  card: "#FFFFFF",
  text: "#4A4A4A",
  muted: "#9E9E9E",
  border: "#F0E6CC",
  accent: "#7DB58D",
  accentSoft: "#E8F5E9",
  danger: "#D32F2F",
  dangerSoft: "#FFEBEE",
  tabBarBackground: "#FFFDF9",
  tabBarBorder: "#EEE8DF",
  tabBarActive: "#7DB58D",
  tabBarInactive: "#AAAAAA",
};

const darkColors: ThemeColors = {
  background: "#1B1814",
  surface: "#24201A",
  card: "#26221C",
  text: "#F2EDE6",
  muted: "#B9B0A5",
  border: "#3C342A",
  accent: "#8BC49B",
  accentSoft: "#2F3A33",
  danger: "#FF6B6B",
  dangerSoft: "#3C2323",
  tabBarBackground: "#1F1B16",
  tabBarBorder: "#3C342A",
  tabBarActive: "#8BC49B",
  tabBarInactive: "#847A6E",
};

const STORAGE_KEY = "@bloom_theme";

const ThemeContext = createContext<ThemeContextType>({
  isDark: false,
  colors: lightColors,
  setDarkMode: () => {},
  toggleTheme: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [isDark, setIsDark] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((value) => {
        if (value === "dark") {
          setIsDark(true);
        }
      })
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(STORAGE_KEY, isDark ? "dark" : "light").catch(() => {});
  }, [isDark, loaded]);

  useEffect(() => {
    const baseTextStyle = { color: isDark ? darkColors.text : lightColors.text };
    const TextAny = Text as typeof Text & { defaultProps?: { style?: any } };
    TextAny.defaultProps = TextAny.defaultProps || {};
    const existingTextStyle = TextAny.defaultProps.style;
    TextAny.defaultProps.style = Array.isArray(existingTextStyle)
      ? isDark
        ? [...existingTextStyle, baseTextStyle]
        : [baseTextStyle, ...existingTextStyle]
      : isDark
        ? [existingTextStyle, baseTextStyle].filter(Boolean)
        : [baseTextStyle, existingTextStyle].filter(Boolean);

    const TextInputAny = TextInput as typeof TextInput & { defaultProps?: { style?: any } };
    TextInputAny.defaultProps = TextInputAny.defaultProps || {};
    const existingInputStyle = TextInputAny.defaultProps.style;
    TextInputAny.defaultProps.style = Array.isArray(existingInputStyle)
      ? isDark
        ? [...existingInputStyle, baseTextStyle]
        : [baseTextStyle, ...existingInputStyle]
      : isDark
        ? [existingInputStyle, baseTextStyle].filter(Boolean)
        : [baseTextStyle, existingInputStyle].filter(Boolean);
  }, [isDark]);

  const value = useMemo(
    () => ({
      isDark,
      colors: isDark ? darkColors : lightColors,
      setDarkMode: setIsDark,
      toggleTheme: () => setIsDark((prev) => !prev),
    }),
    [isDark]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
