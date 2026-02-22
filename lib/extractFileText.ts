const MAX_CHARS = 50_000; // bakeMaterial context limit

/**
 * Read a local file URI as text.
 *
 * Strategy: React Native's XHR bridge supports responseType='blob' for file://
 * URIs (same pattern as our upload code), but NOT responseType='text'.
 * We fetch as a blob, then decode via FileReader — the only reliable approach.
 */
export async function extractFileText(localUri: string, mimeType?: string | null): Promise<string> {
    // Reject known binary types early
    const binaryPrefixes = ["image/", "video/", "audio/", "application/zip"];
    if (mimeType && binaryPrefixes.some((p) => mimeType.startsWith(p))) {
        throw new Error(
            `Cannot extract text from a "${mimeType}" file. Please choose a .txt or .md file.`
        );
    }

    // Step 1: fetch file as blob (this works for file:// URIs in React Native)
    const blob: Blob = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.onload = () => resolve(xhr.response as Blob);
        xhr.onerror = () => reject(new TypeError("Could not read the file — make sure it is accessible."));
        xhr.responseType = "blob";
        xhr.open("GET", localUri, true);
        xhr.send(null);
    });

    if (!blob || blob.size === 0) {
        throw new Error("The selected file appears to be empty.");
    }

    // Step 2: decode blob to text via FileReader
    const text: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("Could not decode file content as text."));
        reader.readAsText(blob);
    });

    if (!text || text.trim().length === 0) {
        throw new Error("The file was read but appears to be empty or unreadable as text.");
    }

    // Truncate to fit the bakeMaterial context window
    return text.length > MAX_CHARS ? text.slice(0, MAX_CHARS) : text;
}
