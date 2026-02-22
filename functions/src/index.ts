import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { GoogleGenerativeAI } from "@google/generative-ai";
import * as admin from "firebase-admin";

const geminiApiKey = defineSecret("GEMINI_API_KEY");

if (admin.apps.length === 0) {
  admin.initializeApp();
}

const PHASES_PROMPT = `You are an expert educator. Analyze the provided file and extract exactly 20 facts, 5 concepts, and 3 procedures. Also create 4-6 plausible but incorrect statements (false facts) that are close to the real facts but wrong. For each concept, create one "plausible flaw" statement that looks correct but contains a specific incorrect word or phrase. Return ONLY a JSON object matching the RecipeMatrix schema.`;

const recipeSchema = {
  type: "object",
  properties: {
    topic_title: { type: "string" },
    master_skill: { type: "string" },
    facts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          term: { type: "string" },
          definition: {
            type: "string",
            description: "A brief, one-sentence definition. Max 15 words."
          }
        },
        required: ["id", "term", "definition"]
      }
    },
    concepts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          explanation: { type: "string" },
          fact_ids: { type: "array", items: { type: "string" } }
        },
        required: ["id", "name", "explanation", "fact_ids"]
      }
    },
    procedures: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          steps: { type: "array", items: { type: "string" } },
          concept_ids: { type: "array", items: { type: "string" } }
        },
        required: ["id", "name", "steps", "concept_ids"]
      }
    },
    false_facts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          text: { type: "string" },
          source_fact_id: { type: "string" }
        },
        required: ["id", "text", "source_fact_id"]
      }
    },
    plausible_flaws: {
      type: "array",
      items: {
        type: "object",
        properties: {
          concept_id: { type: "string" },
          flawed_statement: { type: "string" },
          flawed_span: { type: "string" }
        },
        required: ["concept_id", "flawed_statement", "flawed_span"]
      }
    }
  },
  required: ["topic_title", "master_skill", "facts", "concepts", "procedures"]
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function parseGsUri(storageUri: string): { bucketName: string; filePath: string } {
  const withoutScheme = storageUri.replace(/^gs:\/\//, "");
  const slashIdx = withoutScheme.indexOf("/");
  if (slashIdx === -1) throw new Error(`Invalid storageUri: ${storageUri}`);
  return {
    bucketName: withoutScheme.slice(0, slashIdx),
    filePath: withoutScheme.slice(slashIdx + 1),
  };
}

function parseDownloadUrl(downloadUrl: string): { bucketName: string; filePath: string } {
  const url = new URL(downloadUrl);
  const match = url.pathname.match(/\/v0\/b\/([^/]+)\/o\/(.+)$/);
  if (!match) throw new Error(`Unsupported downloadUrl: ${downloadUrl}`);
  const bucketName = match[1];
  const filePath = decodeURIComponent(match[2]);
  return { bucketName, filePath };
}

async function downloadFromStorage(params: {
  fileUri?: string;
  downloadUrl?: string;
}): Promise<{ buffer: Buffer; mimeType: string } | null> {
  const { fileUri, downloadUrl } = params;
  if (!fileUri && !downloadUrl) return null;

  const { bucketName, filePath } = fileUri
    ? parseGsUri(fileUri)
    : parseDownloadUrl(downloadUrl as string);

  const bucket = admin.storage().bucket(bucketName);
  const file = bucket.file(filePath);

  const [buffer] = await file.download();
  const [metadata] = await file.getMetadata();
  const mimeType = (metadata.contentType as string) || "application/octet-stream";

  return { buffer, mimeType };
}

function buildParts(params: {
  prompt: string;
  fileBuffer?: Buffer | null;
  mimeType?: string;
}): any[] {
  const { prompt, fileBuffer, mimeType } = params;
  if (fileBuffer && mimeType) {
    return [
      { inlineData: { data: fileBuffer.toString("base64"), mimeType } },
      { text: prompt },
    ];
  }
  return [{ text: prompt }];
}

function forceValidJson(text: string): string {
  let cleaned = text.replace(/```json|```/g, "").trim();
  cleaned = cleaned.replace(/,[ \t\r\n]*([}\]])/g, "$1");
  return cleaned;
}

function parseAndLog(text: string) {
  try {
    return JSON.parse(forceValidJson(text));
  } catch (err) {
    console.error(`Mangled End:`, text.slice(-100));
    throw err;
  }
}

function validateRecipeMatrix(extraction: any) {
  if (!extraction) throw new Error("Empty extraction payload.");
  if (!Array.isArray(extraction.facts) || extraction.facts.length !== 20) {
    throw new Error(`Expected 20 facts, received ${extraction.facts?.length ?? 0}.`);
  }
  if (!Array.isArray(extraction.concepts) || extraction.concepts.length !== 5) {
    throw new Error(`Expected 5 concepts, received ${extraction.concepts?.length ?? 0}.`);
  }
  if (!Array.isArray(extraction.procedures) || extraction.procedures.length !== 3) {
    throw new Error(`Expected 3 procedures, received ${extraction.procedures?.length ?? 0}.`);
  }
}

export const bakeMaterial = onCall(
  { timeoutSeconds: 300, memory: "512MiB", secrets: [geminiApiKey] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "You must be signed in to bake material.");
    }

    const { text, fileUri, downloadUrl, mimeType: clientMimeType, storageUri } = request.data ?? {};
    const resolvedFileUri = fileUri || storageUri;

    if (!text && !resolvedFileUri && !downloadUrl) {
      throw new HttpsError(
        "invalid-argument",
        "Provide either 'text' (pasted content) or a 'fileUri' for uploaded files."
      );
    }

    const apiKey = geminiApiKey.value();
    if (!apiKey) {
      throw new HttpsError(
        "failed-precondition",
        "Missing GEMINI_API_KEY secret. Set it in Firebase Functions secrets or .env for emulators."
      );
    }
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    try {
      const fileDownload = await downloadFromStorage({
        fileUri: resolvedFileUri,
        downloadUrl,
      });

      const fileBuffer = fileDownload?.buffer ?? null;
      const detectedMimeType = clientMimeType || fileDownload?.mimeType || "application/octet-stream";
      const textContent = typeof text === "string" ? text.trim() : "";

      const prompt = textContent
        ? `${PHASES_PROMPT}\n\nSOURCE:\n${textContent}`
        : PHASES_PROMPT;

      // @ts-ignore
      const result = await model.generateContent({
        contents: [
          {
            role: "user",
            parts: buildParts({
              prompt,
              fileBuffer,
              mimeType: detectedMimeType,
            }) as any,
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: recipeSchema as any,
          temperature: 0.1,
          maxOutputTokens: 8192,
        },
      });

      const responseText = result.response.text();
      const extraction = parseAndLog(responseText);

      validateRecipeMatrix(extraction);

      return {
        topic_title: extraction.topic_title || "Extracted Knowledge",
        master_skill: extraction.master_skill || "Mastery of the topic",
        facts: extraction.facts,
        concepts: extraction.concepts,
        procedures: extraction.procedures,
        false_facts: Array.isArray(extraction.false_facts) ? extraction.false_facts : [],
        plausible_flaws: Array.isArray(extraction.plausible_flaws) ? extraction.plausible_flaws : [],
      };
    } catch (err: any) {
      if (err instanceof HttpsError) throw err;
      console.error("bakeMaterial error:", err);
      throw new HttpsError("internal", err.message || "Unknown error during baking.");
    }
  }
);

const graftSchema = {
  type: "object",
  properties: {
    ok: { type: "boolean" },
    confidence: { type: "number" },
    reason: { type: "string" }
  },
  required: ["ok", "confidence", "reason"]
};

export const scoreGraft = onCall(
  { timeoutSeconds: 120, memory: "256MiB", secrets: [geminiApiKey] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "You must be signed in to score grafts.");
    }

    const { root, scion } = request.data ?? {};
    if (!root || !scion) {
      throw new HttpsError("invalid-argument", "Provide both 'root' and 'scion'.");
    }

    const apiKey = geminiApiKey.value();
    if (!apiKey) {
      throw new HttpsError(
        "failed-precondition",
        "Missing GEMINI_API_KEY secret. Set it in Firebase Functions secrets or .env for emulators."
      );
    }
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const prompt = `You are judging whether two study concepts are meaningfully related.
Return JSON with ok (true/false), confidence (0-1), reason (1 short sentence).
Root: ${root}
Scion: ${scion}`;

    try {
      // @ts-ignore
      const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: graftSchema as any,
          temperature: 0.2,
          maxOutputTokens: 512,
        },
      });

      const responseText = result.response.text();
      const extraction = parseAndLog(responseText);

      return {
        ok: !!extraction.ok,
        confidence: Math.max(0, Math.min(1, Number(extraction.confidence) || 0)),
        reason: extraction.reason || "No reason provided.",
      };
    } catch (err: any) {
      if (err instanceof HttpsError) throw err;
      console.error("scoreGraft error:", err);
      throw new HttpsError("internal", err.message || "Unknown error during graft scoring.");
    }
  }
);

const spliceSchema = {
  type: "object",
  properties: {
    ok: { type: "boolean" },
    confidence: { type: "number" },
    feedback: { type: "string" }
  },
  required: ["ok", "confidence", "feedback"]
};

export const evaluateSplice = onCall(
  { timeoutSeconds: 120, memory: "256MiB", secrets: [geminiApiKey] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "You must be signed in to evaluate splices.");
    }

    const { conceptA, procedureB, response } = request.data ?? {};
    if (!conceptA || !procedureB || !response) {
      throw new HttpsError("invalid-argument", "Provide conceptA, procedureB, and response.");
    }

    const apiKey = geminiApiKey.value();
    if (!apiKey) {
      throw new HttpsError(
        "failed-precondition",
        "Missing GEMINI_API_KEY secret. Set it in Firebase Functions secrets or .env for emulators."
      );
    }
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const prompt = `You are grading a synthesis response. Decide if the answer meaningfully combines the concept and the procedure.
Return JSON with ok (true/false), confidence (0-1), and feedback (1 short sentence).
Concept: ${conceptA}
Procedure: ${procedureB}
Response: ${response}`;

    try {
      // @ts-ignore
      const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: spliceSchema as any,
          temperature: 0.2,
          maxOutputTokens: 512,
        },
      });

      const responseText = result.response.text();
      const extraction = parseAndLog(responseText);

      return {
        ok: !!extraction.ok,
        confidence: Math.max(0, Math.min(1, Number(extraction.confidence) || 0)),
        feedback: extraction.feedback || "No feedback provided.",
      };
    } catch (err: any) {
      if (err instanceof HttpsError) throw err;
      console.error("evaluateSplice error:", err);
      throw new HttpsError("internal", err.message || "Unknown error during splice evaluation.");
    }
  }
);
