import { View, Text, ScrollView, StyleSheet } from "react-native";
import { StatusBar } from "expo-status-bar";
import { Redirect, useRouter } from "expo-router";
import { useAuth } from "../../context/AuthContext";
import { useProgress } from "../../context/ProgressContext";
import MaterialCard from "../../components/MaterialCard";
import { useTheme } from "../../context/ThemeContext";

export default function StudyScreen() {
    const { user } = useAuth();
    const router = useRouter();
    const { state, canUnlockStage } = useProgress();
    const { isDark, colors } = useTheme();

    if (!user) return <Redirect href="/login" />;

    const materialCount = Object.keys(state.materials).length;

    return (
        <View style={[s.container, { backgroundColor: colors.background }]}>
            <StatusBar style={isDark ? "light" : "dark"} />
            <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

                {/* Header */}
                <View style={s.header}>
                    <Text style={[s.title, { color: colors.text }]}>📚 The Library</Text>
                    <Text style={[s.subtitle, { color: colors.muted }]}>
                        Your active study plots and materials.
                    </Text>
                </View>

                {/* Material List */}
                <Text style={[s.sectionTitle, { color: colors.text }]}>🌿 Active Plots</Text>

                {materialCount === 0 ? (
                    <View style={s.emptyState}>
                        <Text style={s.emptyEmoji}>🌾</Text>
                        <Text style={[s.emptyTitle, { color: colors.text }]}>No active plots yet</Text>
                        <Text style={[s.emptySub, { color: colors.muted }]}
                        >
                            Head to the Garden tab to plant your first seed
                        </Text>
                    </View>
                ) : (
                    Object.entries(state.materials).map(([materialId, material]) => (
                        <MaterialCard
                            key={materialId}
                            materialId={materialId}
                            material={material}
                            canUnlockStage={canUnlockStage}
                            onNavigate={(route) => router.push(route as any)}
                        />
                    ))
                )}
            </ScrollView>
        </View>
    );
}

const s = StyleSheet.create({
    container: { flex: 1 },
    content: { paddingHorizontal: 20, paddingTop: 60, paddingBottom: 40 },
    header: { marginBottom: 16 },
    title: { fontSize: 26, fontWeight: "700" },
    subtitle: { fontSize: 14, marginTop: 4 },
    sectionTitle: { fontSize: 17, fontWeight: "800", marginBottom: 16, marginTop: 8 },

    emptyState: { alignItems: "center", paddingVertical: 40 },
    emptyEmoji: { fontSize: 48, marginBottom: 12 },
    emptyTitle: { fontSize: 18, fontWeight: "700", marginBottom: 6 },
    emptySub: { fontSize: 14 },
});
