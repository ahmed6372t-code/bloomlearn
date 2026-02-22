import {
    ref,
    uploadBytesResumable,
    getDownloadURL,
    type UploadTask,
} from "firebase/storage";
import { storage } from "../firebaseConfig";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface UploadStudyFileOptions {
    /** Local URI returned by expo-document-picker (cache-directory copy). */
    localUri: string;
    /** Firebase Auth UID of the current user. */
    uid: string;
    /** The material this file is being attached to. */
    materialId: string;
    /** Original filename (e.g. "lecture-notes.pdf"). */
    fileName: string;
    /** MIME type (e.g. "application/pdf"). Falls back to octet-stream if unknown. */
    mimeType?: string | null;
    /** Called periodically with a 0-1 progress value during upload. */
    onProgress?: (progress: number) => void;
}

export interface UploadStudyFileResult {
    /** gs://bucket/path — stable reference for future downloads. */
    storageUri: string;
    /** Public HTTPS download URL. */
    downloadUrl: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Engine
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Uploads a locally-cached file (from expo-document-picker) to Firebase Storage.
 *
 * Storage path: `uploads/{uid}/{materialId}/{fileName}`
 *
 * Returns a `{ storageUri, downloadUrl }` object that should be persisted via
 * `linkFileToMaterial` in ProgressContext.
 *
 * @example
 * const result = await uploadStudyFile({
 *   localUri: file.uri,
 *   uid: user.uid,
 *   materialId,
 *   fileName: file.name,
 *   mimeType: file.mimeType,
 *   onProgress: (pct) => setProgress(pct),
 * });
 */
export async function uploadStudyFile(
    opts: UploadStudyFileOptions
): Promise<UploadStudyFileResult> {
    const { localUri, uid, materialId, fileName, mimeType, onProgress } = opts;

    // 1. Convert the local file:// URI to a Blob.
    //    React Native's fetch() cannot reliably construct a Blob from a file:// URI.
    //    The XMLHttpRequest + responseType='blob' pattern is the correct RN workaround.
    const blob: Blob = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.onload = function () { resolve(xhr.response as Blob); };
        xhr.onerror = function () { reject(new TypeError("Network request failed — could not read local file")); };
        xhr.responseType = "blob";
        xhr.open("GET", localUri, true);
        xhr.send(null);
    });

    // 2. Build the Storage reference.
    //    Sanitise the filename to avoid path traversal (replace any slashes).
    const safeName = fileName.replace(/\//g, "_");
    const storagePath = `uploads/${uid}/${materialId}/${safeName}`;
    const storageRef = ref(storage, storagePath);

    // 3. Start the resumable upload.
    const contentType = mimeType ?? "application/octet-stream";
    const uploadTask: UploadTask = uploadBytesResumable(storageRef, blob, {
        contentType,
    });

    // 4. Wrap in a Promise so we can await it and report progress.
    return new Promise<UploadStudyFileResult>((resolve, reject) => {
        uploadTask.on(
            "state_changed",
            (snapshot) => {
                // Bytes-based progress, 0 → 1
                const progress =
                    snapshot.totalBytes > 0
                        ? snapshot.bytesTransferred / snapshot.totalBytes
                        : 0;
                onProgress?.(progress);
            },
            (error) => {
                // Log the full payload — 'storage/unknown' is usually a rules
                // denial or uninitialised bucket. The serverResponse field has the detail.
                console.warn("[uploadStudyFile] Upload failed:", error.code, error.message);
                if ("serverResponse" in error) {
                    console.warn("[uploadStudyFile] Server response:", (error as any).serverResponse);
                }
                reject(error);
            },
            async () => {
                // Upload complete — get the public download URL.
                const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
                const storageUri = `gs://${uploadTask.snapshot.ref.bucket}/${uploadTask.snapshot.ref.fullPath}`;
                resolve({ storageUri, downloadUrl });
            }
        );
    });
}
