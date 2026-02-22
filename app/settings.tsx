import { View, Text, StyleSheet, TouchableOpacity, Alert, Switch } from "react-native";
import { StatusBar } from "expo-status-bar";
import { Redirect, useRouter } from "expo-router";
import { signOut } from "firebase/auth";
import { auth } from "../firebaseConfig";
import { useAuth } from "../context/AuthContext";
import { useProgress } from "../context/ProgressContext";
import { useTheme } from "../context/ThemeContext";

export default function SettingsScreen() {
    const { user } = useAuth();
    const router = useRouter();
    const { clearMaterials } = useProgress();
    const { isDark, colors, toggleTheme } = useTheme();

    if (!user) return <Redirect href="/login" />;

    const handleReset = () => {
        Alert.alert(
            "Reset study materials?",
            "This removes all study materials and files but keeps your XP, streaks, and stats.",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Reset",
                    style: "destructive",
                    onPress: async () => {
                        await clearMaterials();
                        router.back();
                    },
                },
            ]
        );
    };

    return (
        <View style={[s.container, { backgroundColor: colors.background }]}>
            <StatusBar style={isDark ? "light" : "dark"} />
            <View style={s.content}>
                <Text style={[s.title, { color: colors.text }]}>Settings</Text>
                <Text style={[s.subtitle, { color: colors.muted }]}>Manage your study data.</Text>

                <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}
                >
                    <Text style={[s.cardTitle, { color: colors.text }]}>Appearance</Text>
                    <Text style={[s.cardSub, { color: colors.muted }]}>Theme and display options.</Text>
                    <View style={s.row}>
                        <View style={s.rowText}>
                            <Text style={[s.rowTitle, { color: colors.text }]}>Dark Mode</Text>
                            <Text style={[s.rowSub, { color: colors.muted }]}>Reduce glare at night.</Text>
                        </View>
                        <Switch
                            value={isDark}
                            onValueChange={toggleTheme}
                            trackColor={{ false: "#D8D0C6", true: "#4B6B55" }}
                            thumbColor={isDark ? "#8BC49B" : "#F5F1EB"}
                        />
                    </View>
                </View>

                <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}
                >
                    <Text style={[s.cardTitle, { color: colors.text }]}>Reset Study Materials</Text>
                    <Text style={[s.cardSub, { color: colors.muted }]}
                    >
                        Clears all materials and uploads without affecting XP or streaks.
                    </Text>
                    <TouchableOpacity
                        style={[s.resetButton, { backgroundColor: colors.dangerSoft }]}
                        onPress={handleReset}
                        activeOpacity={0.8}
                    >
                        <Text style={[s.resetButtonText, { color: colors.danger }]}>Reset Materials</Text>
                    </TouchableOpacity>
                </View>

                <TouchableOpacity
                    style={[s.signOutButton, { borderColor: colors.accent }]}
                    onPress={async () => {
                        await signOut(auth);
                        router.replace("/login");
                    }}
                    activeOpacity={0.8}
                >
                    <Text style={[s.signOutText, { color: colors.accent }]}>Sign Out</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

const s = StyleSheet.create({
    container: { flex: 1 },
    content: { paddingHorizontal: 20, paddingTop: 60 },
    title: { fontSize: 24, fontWeight: "700" },
    subtitle: { fontSize: 14, marginTop: 4, marginBottom: 16 },

    card: {
        borderRadius: 16,
        borderWidth: 1,
        padding: 16,
        marginBottom: 16,
    },
    cardTitle: { fontSize: 15, fontWeight: "700" },
    cardSub: { fontSize: 12, marginTop: 6 },
    row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 14 },
    rowText: { flex: 1, paddingRight: 12 },
    rowTitle: { fontSize: 14, fontWeight: "700" },
    rowSub: { fontSize: 12, marginTop: 4 },

    resetButton: {
        marginTop: 14,
        borderRadius: 12,
        paddingVertical: 12,
        alignItems: "center",
    },
    resetButtonText: { fontSize: 14, fontWeight: "700" },

    signOutButton: { marginTop: 16, borderWidth: 1.5, borderRadius: 12, paddingVertical: 12, alignItems: "center" },
    signOutText: { fontSize: 14, fontWeight: "700" },
});
