import { useState, useCallback, useRef } from "react";
import * as Haptics from "expo-haptics";
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    Animated,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useProgress, type LinkedFile } from "../context/ProgressContext";
import { useAuth } from "../context/AuthContext";
import { useFilePicker } from "../lib/useFilePicker";
import { uploadStudyFile } from "../lib/uploadStudyFile";
import { useTheme } from "../context/ThemeContext";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface AppleFileSelectorProps {
    /** The material this attachment belongs to. */
    materialId: string;
    /**
     * Compact mode: renders as a square icon-only button so it can sit
     * alongside other buttons in a row without taking excess width.
     */
    compact?: boolean;
}

type UploadStatus = "idle" | "uploading" | "done" | "error";

// ─────────────────────────────────────────────────────────────────────────────
// Formatters
// ─────────────────────────────────────────────────────────────────────────────

function formatBytes(bytes: number | null): string {
    if (bytes === null) return "Unknown size";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `AppleFileSelector`
 *
 * A self-contained "Attach File" button that:
 * 1. Opens the native Apple Files / iCloud Drive picker.
 * 2. Uploads the selected file to Firebase Storage with a live progress bar.
 * 3. Persists the file reference to the material via `linkFileToMaterial`.
 *
 * Place this inside any material card on the Home screen.
 */
export default function AppleFileSelector({ materialId, compact = false }: AppleFileSelectorProps) {
    const { user } = useAuth();
    const { linkFileToMaterial, state } = useProgress();
    const { pickFile, isPicking } = useFilePicker();
    const { colors } = useTheme();

    const [uploadStatus, setUploadStatus] = useState<UploadStatus>("idle");
    const [progress, setProgress] = useState(0);        // 0-1
    const [pickedName, setPickedName] = useState<string | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    // Animated width for the progress bar
    const progressAnim = useState(() => new Animated.Value(0))[0];

    const animateProgress = useCallback((toValue: number) => {
        Animated.timing(progressAnim, {
            toValue,
            duration: 200,
            useNativeDriver: false,
        }).start();
    }, [progressAnim]);

    // All files already linked to this material
    const linkedFiles = state.materials[materialId]?.linkedFiles ?? [];

    const handlePress = useCallback(async () => {
        if (!user) return;
        setErrorMsg(null);

        // 1. Open native picker
        const file = await pickFile();
        if (!file) return; // user cancelled

        setPickedName(file.name);
        setUploadStatus("uploading");
        setProgress(0);
        animateProgress(0);

        try {
            // 2. Upload to Firebase Storage
            const result = await uploadStudyFile({
                localUri: file.uri,
                uid: user.uid,
                materialId,
                fileName: file.name,
                mimeType: file.mimeType,
                onProgress: (pct) => {
                    setProgress(pct);
                    animateProgress(pct);
                },
            });

            // 3. Persist link in Firestore + local state
            const linkedFile: LinkedFile = {
                name: file.name,
                storageUri: result.storageUri,
                downloadUrl: result.downloadUrl,
                mimeType: file.mimeType,
                size: file.size,
                addedAt: Date.now(),
            };
            linkFileToMaterial(materialId, linkedFile);

            // Success haptic + auto-reset after 3 s
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            setUploadStatus("done");
            setTimeout(() => reset(), 3000);
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Upload failed";
            console.warn("[AppleFileSelector]", msg);
            setErrorMsg(msg);
            setUploadStatus("error");
        }
    }, [user, pickFile, materialId, linkFileToMaterial, animateProgress]);

    const reset = () => {
        setUploadStatus("idle");
        setPickedName(null);
        setErrorMsg(null);
        setProgress(0);
        progressAnim.setValue(0);
    };

    // ── Render ────────────────────────────────────────────────────────────────

    // ── Compact mode — icon-only square button ────────────────────────────────
    if (compact) {
        return (
            <TouchableOpacity
                style={[
                    s.compactButton,
                    { borderColor: colors.accent, backgroundColor: colors.card },
                    (isPicking || uploadStatus === "uploading") && s.buttonDisabled,
                ]}
                onPress={handlePress}
                disabled={isPicking || uploadStatus === "uploading"}
                activeOpacity={0.75}
            >
                {uploadStatus === "uploading" ? (
                    <Ionicons name="cloud-upload-outline" size={22} color={colors.accent} />
                ) : uploadStatus === "done" ? (
                    <Ionicons name="checkmark-circle" size={22} color={colors.accent} />
                ) : uploadStatus === "error" ? (
                    <Ionicons name="alert-circle" size={22} color={colors.danger} />
                ) : (
                    <Ionicons name="attach" size={22} color={colors.accent} />
                )}
                {uploadStatus === "uploading" && (
                    <Text style={[s.compactPct, { color: colors.accent }]}>
                        {Math.round(progress * 100)}%
                    </Text>
                )}
            </TouchableOpacity>
        );
    }

    // ── Full mode — dashed button with file list ─────────────────────────────
    return (
        <View style={s.container}>
            {/* Primary attach button */}
            {uploadStatus === "idle" && (
                <TouchableOpacity
                    style={[s.button, { borderColor: colors.accent }, isPicking && s.buttonDisabled]}
                    onPress={handlePress}
                    disabled={isPicking}
                    activeOpacity={0.75}
                >
                    <Ionicons name="attach" size={18} color={colors.accent} />
                    <Text style={[s.buttonLabel, { color: colors.accent }]}>
                        {isPicking ? "Opening Files…" : "Attach Study File"}
                    </Text>
                </TouchableOpacity>
            )}

            {/* Uploading state — progress bar */}
            {uploadStatus === "uploading" && (
                <View style={[s.uploadingBox, { backgroundColor: colors.card }]}>
                    <Ionicons name="cloud-upload-outline" size={16} color={colors.accent} />
                    <View style={s.progressColumn}>
                        <Text style={[s.uploadingLabel, { color: colors.text }]} numberOfLines={1}>
                            {pickedName}
                        </Text>
                        <View style={[s.progressTrack, { backgroundColor: colors.border }]}>
                            <Animated.View
                                style={[
                                    s.progressFill,
                                    {
                                        width: progressAnim.interpolate({
                                            inputRange: [0, 1],
                                            outputRange: ["0%", "100%"],
                                        }),
                                        backgroundColor: colors.accent,
                                    },
                                ]}
                            />
                        </View>
                        <Text style={[s.progressPct, { color: colors.muted }]}>
                            {Math.round(progress * 100)}%
                        </Text>
                    </View>
                </View>
            )}

            {/* Success state */}
            {uploadStatus === "done" && (
                <TouchableOpacity
                    style={[s.successBox, { backgroundColor: colors.card }]}
                    onPress={reset}
                    activeOpacity={0.7}
                >
                    <Ionicons name="checkmark-circle" size={16} color={colors.accent} />
                    <Text style={[s.successLabel, { color: colors.text }]} numberOfLines={1}>
                        {pickedName} attached!
                    </Text>
                    <Ionicons name="close" size={14} color={colors.muted} />
                </TouchableOpacity>
            )}

            {/* Error state */}
            {uploadStatus === "error" && (
                <TouchableOpacity
                    style={[s.errorBox, { backgroundColor: colors.dangerSoft, borderColor: colors.danger }]}
                    onPress={reset}
                    activeOpacity={0.7}
                >
                    <Ionicons name="alert-circle" size={16} color={colors.danger} />
                    <Text style={[s.errorLabel, { color: colors.danger }]} numberOfLines={1}>
                        {errorMsg ?? "Upload failed — tap to retry"}
                    </Text>
                </TouchableOpacity>
            )}

            {/* Attached files list */}
            {linkedFiles.length > 0 && (
                <View style={s.fileList}>
                    {linkedFiles.map((f) => (
                        <View key={f.storageUri} style={[s.fileRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                            <Ionicons
                                name={
                                    f.mimeType?.startsWith("image/")
                                        ? "image-outline"
                                        : f.mimeType === "application/pdf"
                                            ? "document-text-outline"
                                            : "document-outline"
                                }
                                size={14}
                                color={colors.accent}
                            />
                            <Text style={[s.fileName, { color: colors.text }]} numberOfLines={1}>
                                {f.name}
                            </Text>
                            <Text style={[s.fileSize, { color: colors.muted }]}>{formatBytes(f.size)}</Text>
                        </View>
                    ))}
                </View>
            )}
        </View>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
    container: {
        marginTop: 10,
    },

    // Idle button
    button: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        borderWidth: 1.5,
        borderStyle: "dashed",
        borderRadius: 10,
        paddingVertical: 8,
        paddingHorizontal: 14,
        alignSelf: "flex-start",
    },
    buttonDisabled: {
        opacity: 0.5,
    },
    buttonLabel: {
        fontSize: 13,
        fontWeight: "600",
    },

    // Uploading
    uploadingBox: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        borderRadius: 10,
        paddingVertical: 8,
        paddingHorizontal: 12,
    },
    progressColumn: {
        flex: 1,
        gap: 4,
    },
    uploadingLabel: {
        fontSize: 12,
        fontWeight: "600",
    },
    progressTrack: {
        height: 4,
        borderRadius: 2,
        overflow: "hidden",
    },
    progressFill: {
        height: "100%",
        borderRadius: 2,
    },
    progressPct: {
        fontSize: 10,
        fontWeight: "600",
    },

    // Success
    successBox: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        borderRadius: 10,
        paddingVertical: 8,
        paddingHorizontal: 12,
    },
    successLabel: {
        flex: 1,
        fontSize: 12,
        fontWeight: "600",
    },

    // Error
    errorBox: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        borderWidth: 1,
        borderRadius: 10,
        paddingVertical: 8,
        paddingHorizontal: 12,
    },
    errorLabel: {
        flex: 1,
        fontSize: 12,
        fontWeight: "600",
    },

    // File list
    fileList: {
        marginTop: 8,
        gap: 4,
    },
    fileRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        borderRadius: 8,
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderWidth: 1,
    },
    fileName: {
        flex: 1,
        fontSize: 12,
        fontWeight: "500",
    },
    fileSize: {
        fontSize: 10,
        fontWeight: "600",
    },

    // Compact (icon-only) mode
    compactButton: {
        width: 56,
        height: 56,
        borderRadius: 14,
        borderWidth: 1.5,
        borderStyle: "dashed",
        alignItems: "center",
        justifyContent: "center",
        gap: 2,
    },
    compactPct: {
        fontSize: 9,
        fontWeight: "700",
    },
});
