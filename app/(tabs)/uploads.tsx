import { useMemo } from "react";
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert } from "react-native";
import { StatusBar } from "expo-status-bar";
import { Redirect } from "expo-router";
import { useAuth } from "../../context/AuthContext";
import { useProgress, type LinkedFile } from "../../context/ProgressContext";
import { useTheme } from "../../context/ThemeContext";

export default function UploadsScreen() {
    const { user } = useAuth();
    const { state, removeFileFromMaterial } = useProgress();
    const { isDark, colors } = useTheme();

    const materialEntries = useMemo(() => {
        return Object.entries(state.materials)
            .map(([id, material]) => ({
                id,
                title: material.title,
                files: material.linkedFiles ?? [],
            }))
            .filter((entry) => entry.files.length > 0);
    }, [state.materials]);

    if (!user) return <Redirect href="/login" />;

    const totalUploads = materialEntries.reduce((sum, entry) => sum + entry.files.length, 0);

    return (
        <View style={[s.container, { backgroundColor: colors.background }]}>
            <StatusBar style={isDark ? "light" : "dark"} />
            <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
                <View style={s.header}>
                    <Text style={[s.title, { color: colors.text }]}>☁️ Uploads</Text>
                    <Text style={[s.subtitle, { color: colors.muted }]}
                    >
                        Manage uploaded files across your materials.
                    </Text>
                </View>

                {totalUploads === 0 ? (
                    <View style={s.emptyState}>
                        <Text style={s.emptyEmoji}>📂</Text>
                        <Text style={[s.emptyTitle, { color: colors.text }]}>No uploads yet</Text>
                        <Text style={[s.emptySub, { color: colors.muted }]}
                        >
                            Upload a file in Garden to see it here.
                        </Text>
                    </View>
                ) : (
                    <View style={s.list}>
                        {materialEntries.map((entry) => (
                            <View key={entry.id} style={s.section}>
                                <Text style={[s.sectionTitle, { color: colors.text }]}>{entry.title}</Text>
                                <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}
                                >
                                    {entry.files.map((file: LinkedFile) => (
                                        <View
                                            key={file.storageUri}
                                            style={[s.row, { borderTopColor: colors.border, backgroundColor: colors.card }]}
                                        >
                                            <View style={s.fileMeta}>
                                                <Text style={s.fileIcon}>
                                                    {file.mimeType?.startsWith("image/")
                                                        ? "🖼️"
                                                        : file.mimeType === "application/pdf"
                                                            ? "📄"
                                                            : "📎"}
                                                </Text>
                                                <View style={s.fileTextBlock}>
                                                    <Text style={[s.fileName, { color: colors.text }]} numberOfLines={1}>{file.name}</Text>
                                                    <Text style={[s.fileSub, { color: colors.muted }]}
                                                    >
                                                        {file.mimeType ?? "Unknown type"}
                                                        {typeof file.size === "number" ? ` · ${formatBytes(file.size)}` : ""}
                                                    </Text>
                                                </View>
                                            </View>
                                            <TouchableOpacity
                                                style={[s.deleteButton, { backgroundColor: colors.dangerSoft }]}
                                                onPress={() => {
                                                    Alert.alert(
                                                        "Delete upload?",
                                                        `Remove ${file.name}? This deletes the file and unlinks it from this material.`,
                                                        [
                                                            { text: "Cancel", style: "cancel" },
                                                            {
                                                                text: "Delete",
                                                                style: "destructive",
                                                                onPress: async () => {
                                                                    try {
                                                                        await removeFileFromMaterial(entry.id, file.storageUri);
                                                                    } catch (err: any) {
                                                                        const msg = err?.message || "Failed to delete upload.";
                                                                        Alert.alert("Delete failed", msg);
                                                                    }
                                                                },
                                                            },
                                                        ]
                                                    );
                                                }}
                                                activeOpacity={0.7}
                                            >
                                                <Text style={[s.deleteText, { color: colors.danger }]}>Delete</Text>
                                            </TouchableOpacity>
                                        </View>
                                    ))}
                                </View>
                            </View>
                        ))}
                    </View>
                )}
            </ScrollView>
        </View>
    );
}

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    const mb = kb / 1024;
    return `${mb.toFixed(1)} MB`;
}

const s = StyleSheet.create({
    container: { flex: 1 },
    content: { paddingHorizontal: 20, paddingTop: 60, paddingBottom: 40 },
    header: { marginBottom: 20 },
    title: { fontSize: 26, fontWeight: "700" },
    subtitle: { fontSize: 14, marginTop: 4 },

    list: { gap: 18 },
    section: { gap: 10 },
    sectionTitle: { fontSize: 15, fontWeight: "800" },

    card: {
        borderRadius: 16,
        borderWidth: 1,
        overflow: "hidden",
    },
    row: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderTopWidth: 1,
    },
    fileMeta: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1, paddingRight: 10 },
    fileIcon: { fontSize: 18 },
    fileTextBlock: { flex: 1 },
    fileName: { fontSize: 14, fontWeight: "700" },
    fileSub: { fontSize: 11, marginTop: 2 },

    deleteButton: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 10 },
    deleteText: { fontSize: 12, fontWeight: "800" },

    emptyState: { alignItems: "center", paddingVertical: 60 },
    emptyEmoji: { fontSize: 48, marginBottom: 10 },
    emptyTitle: { fontSize: 18, fontWeight: "700", marginBottom: 6 },
    emptySub: { fontSize: 14, textAlign: "center" },
});
