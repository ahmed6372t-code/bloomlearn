import { useCallback, useState } from "react";
import * as DocumentPicker from "expo-document-picker";

// ------------------------------------------------------------
// Types
// ------------------------------------------------------------

/** MIME types / UTIs accepted by the picker. Extend as needed. */
const ACCEPTED_TYPES: string[] = [
    // Documents
    "application/pdf",
    // Plain text
    "text/plain",
    "text/markdown",
    // Images
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/heic",
];

export interface PickedFile {
    /** Local URI usable with Firebase Storage `uploadBytesResumable` or `fetch`. */
    uri: string;
    /** Original filename (e.g. "notes.pdf"). */
    name: string;
    /** MIME type reported by the OS (e.g. "application/pdf"). May be null. */
    mimeType: string | null;
    /** File size in bytes. May be null if OS did not report it. */
    size: number | null;
}

export interface UseFilePickerResult {
    /** Open the native Apple Files / Android file picker. */
    pickFile: () => Promise<PickedFile | null>;
    /** True while the picker sheet is open. */
    isPicking: boolean;
    /** Last error thrown during picking, if any. */
    error: Error | null;
    /** Clear the last error. */
    clearError: () => void;
}

// ------------------------------------------------------------
// Hook
// ------------------------------------------------------------

/**
 * `useFilePicker`
 *
 * Opens the native document picker (Apple Files on iOS, system picker on Android).
 * On success, returns a `PickedFile` with a local URI that is safe to read with
 * `fetch()` and upload directly to Firebase Storage via `uploadBytesResumable`.
 *
 * The URI is a **security-scoped** local file URI on iOS — Expo's document picker
 * automatically copies the file to a sandboxed temp location so you own the access.
 *
 * Usage:
 * ```tsx
 * const { pickFile, isPicking, error } = useFilePicker();
 *
 * const handlePress = async () => {
 *   const file = await pickFile();
 *   if (file) {
 *     await uploadToStorage(file.uri, file.name);
 *   }
 * };
 * ```
 */
export function useFilePicker(): UseFilePickerResult {
    const [isPicking, setIsPicking] = useState(false);
    const [error, setError] = useState<Error | null>(null);

    const pickFile = useCallback(async (): Promise<PickedFile | null> => {
        setError(null);
        setIsPicking(true);

        try {
            const result = await DocumentPicker.getDocumentAsync({
                // Pass the accepted MIME types. On iOS this also enables iCloud Drive,
                // Dropbox, Google Drive, and any Files app provider.
                type: ACCEPTED_TYPES,
                // copyToCacheDirectory: true ensures we get a stable local URI that
                // remains accessible after the picker closes (important for async uploads).
                copyToCacheDirectory: true,
                // Single-file pick for now. Change to `multiple: true` if bulk import
                // is needed — the return type becomes an array in that case.
                multiple: false,
            });

            // User cancelled — SDK 50+ uses `canceled`, older SDKs use `type: "cancel"`
            if (("canceled" in result && result.canceled) || ("type" in result && result.type === "cancel")) {
                return null;
            }

            // Expo SDK 50+ returns `result.assets`; older SDKs return a flat object
            const asset = "assets" in result ? result.assets?.[0] : result;
            if (!asset || !("uri" in asset)) return null;

            return {
                uri: asset.uri,
                name: "name" in asset ? asset.name : "uploaded-file",
                mimeType: "mimeType" in asset ? asset.mimeType ?? null : null,
                size: "size" in asset ? asset.size ?? null : null,
            };
        } catch (err) {
            const typedError = err instanceof Error ? err : new Error(String(err));
            setError(typedError);
            console.warn("[useFilePicker] Error picking file:", typedError.message);
            return null;
        } finally {
            setIsPicking(false);
        }
    }, []);

    const clearError = useCallback(() => setError(null), []);

    return { pickFile, isPicking, error, clearError };
}
