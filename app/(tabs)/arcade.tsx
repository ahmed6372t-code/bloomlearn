import { useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from "react-native";
import { StatusBar } from "expo-status-bar";
import { Redirect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../context/AuthContext";
import { useProgress } from "../../context/ProgressContext";
import MaterialPicker from "../../components/MaterialPicker";
import { useTheme } from "../../context/ThemeContext";

interface MiniGame {
    key: string;
    title: string;
    description: string;
    icon: keyof typeof Ionicons.glyphMap;
    color: string;
    route: string;
    needsMaterial: boolean;
}

const MINI_GAMES: MiniGame[] = [
    {
        key: "pest-patrol",
        title: "Pest Patrol",
        description: "Squash false facts, let true ones pass!",
        icon: "bug-outline",
        color: "#E74C3C",
        route: "/games/pest-patrol",
        needsMaterial: true,
    },
    {
        key: "pruning",
        title: "Pruning Shears",
        description: "Reorder steps and cut the weed.",
        icon: "cut-outline",
        color: "#8E44AD",
        route: "/games/pruning",
        needsMaterial: true,
    },
    {
        key: "fertilizer-frenzy",
        title: "Fertilizer Frenzy",
        description: "Rapid recall to revive wilting plots.",
        icon: "flash-outline",
        color: "#F39C12",
        route: "/games/fertilizer-frenzy",
        needsMaterial: false,
    },
    {
        key: "grafting",
        title: "Grafting",
        description: "Link concepts across materials.",
        icon: "git-merge-outline",
        color: "#27AE60",
        route: "/games/grafting",
        needsMaterial: false,
    },
];

export default function ArcadeScreen() {
    const { user } = useAuth();
    const { state } = useProgress();
    const { isDark, colors } = useTheme();
    const router = useRouter();

    if (!user) return <Redirect href="/login" />;

    const materialEntries = Object.keys(state.materials);
    const [selectedId, setSelectedId] = useState(materialEntries[0] ?? "");
    const hasMaterials = materialEntries.length > 0;

    const handlePlay = (game: MiniGame) => {
        if (game.needsMaterial) {
            if (!hasMaterials) {
                Alert.alert("No Materials", "Plant some seeds in the Garden first!");
                return;
            }
            if (!selectedId) {
                Alert.alert("Pick a Material", "Select a material above before playing.");
                return;
            }
            router.push({ pathname: game.route as any, params: { materialId: selectedId } });
        } else {
            if (!hasMaterials) {
                Alert.alert("No Materials", "Plant some seeds in the Garden first!");
                return;
            }
            router.push(game.route as any);
        }
    };

    return (
        <View style={[s.container, { backgroundColor: colors.background }]}>
            <StatusBar style={isDark ? "light" : "dark"} />
            <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
                <Text style={[s.title, { color: colors.text }]}>Mini-Game Arcade</Text>
                <Text style={[s.subtitle, { color: colors.muted }]}>
                    Pick a material, then jump into a game!
                </Text>

                <MaterialPicker
                    materials={state.materials}
                    selectedId={selectedId}
                    onSelect={setSelectedId}
                    title="Active Material"
                />

                <View style={s.grid}>
                    {MINI_GAMES.map((game) => (
                        <TouchableOpacity
                            key={game.key}
                            style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}
                            activeOpacity={0.7}
                            onPress={() => handlePlay(game)}
                        >
                            <View style={[s.iconCircle, { backgroundColor: game.color + "20" }]}>
                                <Ionicons name={game.icon} size={28} color={game.color} />
                            </View>
                            <Text style={[s.cardTitle, { color: colors.text }]}>{game.title}</Text>
                            <Text style={[s.cardDesc, { color: colors.muted }]}>{game.description}</Text>
                            {game.needsMaterial && (
                                <View style={[s.badge, { backgroundColor: colors.accentSoft }]}>
                                    <Text style={[s.badgeText, { color: colors.accent }]}>Needs material</Text>
                                </View>
                            )}
                        </TouchableOpacity>
                    ))}
                </View>
            </ScrollView>
        </View>
    );
}

const s = StyleSheet.create({
    container: { flex: 1 },
    content: { paddingHorizontal: 20, paddingTop: 60, paddingBottom: 40 },
    title: { fontSize: 24, fontWeight: "700" },
    subtitle: { fontSize: 13, marginTop: 4, marginBottom: 14 },

    grid: { marginTop: 12, gap: 14 },
    card: {
        borderRadius: 16,
        padding: 18,
        borderWidth: 1,
    },
    iconCircle: {
        width: 48,
        height: 48,
        borderRadius: 24,
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 10,
    },
    cardTitle: { fontSize: 16, fontWeight: "700" },
    cardDesc: { fontSize: 12, marginTop: 4, lineHeight: 18 },
    badge: { alignSelf: "flex-start", borderRadius: 10, paddingVertical: 3, paddingHorizontal: 8, marginTop: 10 },
    badgeText: { fontSize: 10, fontWeight: "700" },
});
