import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useProgress } from "../../context/ProgressContext";
import { useTheme } from "../../context/ThemeContext";

export default function TabsLayout() {
    const { state } = useProgress();
    const compostCount = state.compost?.length ?? 0;
    const { colors } = useTheme();

    return (
        <Tabs
            screenOptions={{
                headerShown: false,
                tabBarActiveTintColor: colors.tabBarActive,
                tabBarInactiveTintColor: colors.tabBarInactive,
                tabBarStyle: {
                    backgroundColor: colors.tabBarBackground,
                    borderTopColor: colors.tabBarBorder,
                    borderTopWidth: 1,
                    height: 88,
                    paddingBottom: 28,
                    paddingTop: 8,
                },
                tabBarLabelStyle: {
                    fontSize: 11,
                    fontWeight: "700",
                },
            }}
        >
            <Tabs.Screen
                name="index"
                options={{
                    title: "Garden",
                    tabBarIcon: ({ color, size }: { color: string; size: number }) => (
                        <Ionicons name="leaf" size={size} color={color} />
                    ),
                }}
            />
            <Tabs.Screen
                name="study"
                options={{
                    title: "Library",
                    tabBarIcon: ({ color, size }: { color: string; size: number }) => (
                        <Ionicons name="book-outline" size={size} color={color} />
                    ),
                }}
            />
            <Tabs.Screen
                name="arcade"
                options={{
                    title: "Arcade",
                    tabBarIcon: ({ color, size }: { color: string; size: number }) => (
                        <Ionicons name="game-controller-outline" size={size} color={color} />
                    ),
                }}
            />
            <Tabs.Screen
                name="compost"
                options={{
                    title: "Compost",
                    tabBarBadge: compostCount > 0 ? compostCount : undefined,
                    tabBarBadgeStyle: { backgroundColor: "#FF6B6B", fontSize: 10, fontWeight: "800" },
                    tabBarIcon: ({ color, size }: { color: string; size: number }) => (
                        <Ionicons name="refresh-circle-outline" size={size} color={color} />
                    ),
                }}
            />
            <Tabs.Screen
                name="uploads"
                options={{
                    title: "Uploads",
                    tabBarIcon: ({ color, size }: { color: string; size: number }) => (
                        <Ionicons name="cloud-upload-outline" size={size} color={color} />
                    ),
                }}
            />
            <Tabs.Screen
                name="leaderboard"
                options={{
                    title: "Rankings",
                    tabBarIcon: ({ color, size }: { color: string; size: number }) => (
                        <Ionicons name="trophy-outline" size={size} color={color} />
                    ),
                }}
            />
        </Tabs>
    );
}
