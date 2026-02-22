import { useEffect, useState } from "react";
import { View, Text, ScrollView, StyleSheet } from "react-native";
import { StatusBar } from "expo-status-bar";
import { Redirect } from "expo-router";
import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "../../firebaseConfig";
import { useAuth } from "../../context/AuthContext";
import { useProgress } from "../../context/ProgressContext";
import { useTheme } from "../../context/ThemeContext";

interface LeaderboardEntry {
    userId: string;
    displayName: string;
    shinyCount: number;
    totalPoints: number;
}

const MEDALS = ["🥇", "🥈", "🥉"];

export default function LeaderboardScreen() {
    const { user } = useAuth();
    const { state } = useProgress();
    const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
    const { isDark, colors } = useTheme();

    // Top-level hook — no early return above
    useEffect(() => {
        if (!user) return undefined;
        const q = query(
            collection(db, "leaderboard"),
            orderBy("totalPoints", "desc"),
            limit(10)
        );
        const unsub = onSnapshot(
            q,
            (snap) => {
                const rows: LeaderboardEntry[] = [];
                snap.forEach((d) => rows.push(d.data() as LeaderboardEntry));
                setEntries(rows);
            },
            (error) => {
                if (error?.code !== "permission-denied") {
                    console.warn("Leaderboard listener failed", error);
                }
            }
        );
        return unsub;
    }, [user]);

    if (!user) return <Redirect href="/login" />;

    const myRank = entries.findIndex((e) => e.userId === user.uid);

    return (
        <View style={[s.container, { backgroundColor: colors.background }]}>
            <StatusBar style={isDark ? "light" : "dark"} />
            <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

                {/* Header */}
                <View style={s.header}>
                    <Text style={[s.title, { color: colors.text }]}>🏆 Rankings</Text>
                    <Text style={[s.subtitle, { color: colors.muted }]}>Top 10 knowledge gardeners</Text>
                </View>

                {/* Your standing */}
                <View style={[s.myCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                >
                    <View style={s.myCardRow}>
                        <Text style={[s.myCardLabel, { color: colors.muted }]}>Your Water Drops</Text>
                        <Text style={[s.myCardValue, { color: colors.text }]}>💧 {state.totalXP}</Text>
                    </View>
                    <View style={s.myCardRow}>
                        <Text style={[s.myCardLabel, { color: colors.muted }]}>Shiny Plants</Text>
                        <Text style={[s.myCardValue, { color: colors.text }]}>✨ {state.totalStars}</Text>
                    </View>
                    {myRank >= 0 && (
                        <View style={s.myCardRow}>
                            <Text style={[s.myCardLabel, { color: colors.muted }]}>Your Rank</Text>
                            <Text style={[s.myCardValue, { color: colors.text }]}>#{myRank + 1}</Text>
                        </View>
                    )}
                </View>

                {/* Leaderboard list */}
                {entries.length === 0 ? (
                    <View style={s.empty}>
                        <Text style={s.emptyEmoji}>🌱</Text>
                        <Text style={[s.emptyTitle, { color: colors.text }]}>No rankings yet</Text>
                        <Text style={[s.emptySub, { color: colors.muted }]}>Complete stages to appear on the board!</Text>
                    </View>
                ) : (
                    <View style={[s.board, { borderColor: colors.border }]}>
                        {entries.map((entry, index) => {
                            const isMe = entry.userId === user.uid;
                            return (
                                <View
                                    key={entry.userId}
                                    style={[
                                        s.row,
                                        { borderColor: colors.border, backgroundColor: colors.card },
                                        isMe && { backgroundColor: colors.accentSoft },
                                    ]}
                                >
                                    <Text style={s.rank}>
                                        {index < 3 ? MEDALS[index] : `#${index + 1}`}
                                    </Text>
                                    <View style={s.info}>
                                        <Text style={[s.name, { color: colors.text }, isMe && { color: colors.accent }]}>
                                            {entry.displayName}{isMe ? " (you)" : ""}
                                        </Text>
                                        <Text style={[s.meta, { color: colors.muted }]}>
                                            ✨ {entry.shinyCount} shinies · 💧 {entry.totalPoints} pts
                                        </Text>
                                    </View>
                                </View>
                            );
                        })}
                    </View>
                )}
            </ScrollView>
        </View>
    );
}

const s = StyleSheet.create({
    container: { flex: 1 },
    content: { paddingHorizontal: 20, paddingTop: 60, paddingBottom: 40 },
    header: { marginBottom: 24 },
    title: { fontSize: 26, fontWeight: "700" },
    subtitle: { fontSize: 14, marginTop: 4 },

    myCard: { borderRadius: 16, padding: 18, marginBottom: 24, borderWidth: 1, gap: 12 },
    myCardRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    myCardLabel: { fontSize: 14, fontWeight: "600" },
    myCardValue: { fontSize: 16, fontWeight: "700" },

    board: { borderRadius: 16, overflow: "hidden", borderWidth: 1 },
    row: { flexDirection: "row", alignItems: "center", paddingVertical: 14, paddingHorizontal: 16, borderTopWidth: 1 },
    rowMe: {},
    rank: { width: 40, fontSize: 18, fontWeight: "700", color: "#B88700" },
    info: { flex: 1 },
    name: { fontSize: 14, fontWeight: "700" },
    nameMe: {},
    meta: { fontSize: 12, marginTop: 2, fontWeight: "600" },

    empty: { alignItems: "center", paddingVertical: 60 },
    emptyEmoji: { fontSize: 48, marginBottom: 12 },
    emptyTitle: { fontSize: 18, fontWeight: "700", marginBottom: 6 },
    emptySub: { fontSize: 14, textAlign: "center" },
});
