"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bakeMaterial = void 0;
const https_1 = require("firebase-functions/v2/https");
const generative_ai_1 = require("@google/generative-ai");
// ─────────────────────────────────────────────────
// Prompts — The Sieve (2-Phase)
// ─────────────────────────────────────────────────
const PHASE_1_PROMPT = `You are "The Sieve" — a Knowledge Architect.
Perform a RECURSIVE ANALYSIS. Identify:
1. **Master Skill:** The peak actionable competency.
2. **Thematic Threads:** How basic facts evolve into theory.
3. **Gap Detection:** Critical inferences required.

Respond ONLY with valid JSON:
{
  "master_skill": "The ability to...",
  "thematic_threads": [{ "thread": "string", "description": "string" }],
  "gaps": [{ "gap": "string", "why_it_matters": "string" }]
}`;
const PHASE_2_PROMPT = `You are "The Sieve" — Phase 2: Strict 20/5/3 Extraction.
Categorize the source material into this EXACT hierarchy:

**20 Essential Ingredients (Facts):** IDs f1..f20. Terms and definitions.
**5 Base Recipes (Concepts):** IDs c1..c5. Must link to fact IDs.
**3 Baking Techniques (Procedures):** IDs p1..p3. Must link to concept IDs.

IMPORTANT: You MUST return exactly 20 facts, 5 concepts, and 3 procedures.

Respond ONLY with valid JSON:
{
  "topic_title": "string",
  "master_skill": "string",
  "facts": [{ "id": "f1", "term": "string", "definition": "string" }],
  "concepts": [{ "id": "c1", "name": "string", "explanation": "string", "fact_ids": ["f1"] }],
  "procedures": [{ "id": "p1", "name": "string", "steps": ["string"], "concept_ids": ["c1"] }]
}`;
// ─────────────────────────────────────────────────
// Gemini helper
// ─────────────────────────────────────────────────
async function callGemini(model, prompt, material, temperature = 0.2) {
    const result = await model.generateContent({
        contents: [
            { role: "user", parts: [{ text: `${prompt}\n\nSOURCE:\n${material}` }] },
        ],
        generationConfig: {
            temperature,
            responseMimeType: "application/json",
        },
    });
    return result.response.text();
}
// ─────────────────────────────────────────────────
// Cloud Function: bakeMaterial
// ─────────────────────────────────────────────────
exports.bakeMaterial = (0, https_1.onCall)({ timeoutSeconds: 120, memory: "512MiB" }, async (request) => {
    var _a;
    // 1. Auth check
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "You must be signed in to bake material.");
    }
    // 2. Validate input
    const text = (_a = request.data) === null || _a === void 0 ? void 0 : _a.text;
    if (!text || typeof text !== "string" || text.trim().length < 50) {
        throw new https_1.HttpsError("invalid-argument", "Please provide at least 50 characters of study material.");
    }
    // 3. Init Gemini
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new https_1.HttpsError("internal", "GEMINI_API_KEY is not configured on the server.");
    }
    const genAI = new generative_ai_1.GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    try {
        // Phase 1: Skill Analysis
        const phase1Raw = await callGemini(model, PHASE_1_PROMPT, text.trim(), 0.3);
        let phase1;
        try {
            phase1 = JSON.parse(phase1Raw);
        }
        catch (_b) {
            phase1 = { master_skill: "Mastery of the topic" };
        }
        // Phase 2: Strict 20/5/3 Extraction
        const phase2Context = `PHASE 1 ANALYSIS: ${JSON.stringify(phase1)}\n\n${text.trim()}`;
        const phase2Raw = await callGemini(model, PHASE_2_PROMPT, phase2Context, 0.2);
        let extraction;
        try {
            extraction = JSON.parse(phase2Raw);
        }
        catch (_c) {
            throw new https_1.HttpsError("internal", "Failed to parse extraction results.");
        }
        if (!extraction.facts || extraction.facts.length === 0) {
            throw new https_1.HttpsError("internal", "Extraction returned 0 facts. Please try more specific material.");
        }
        // Enforce referential integrity
        const validFactIds = new Set(extraction.facts.map((f) => f.id));
        (extraction.concepts || []).forEach((concept) => {
            concept.fact_ids = (concept.fact_ids || []).filter((fid) => validFactIds.has(fid));
        });
        const validConceptIds = new Set((extraction.concepts || []).map((c) => c.id));
        (extraction.procedures || []).forEach((proc) => {
            proc.concept_ids = (proc.concept_ids || []).filter((cid) => validConceptIds.has(cid));
        });
        // Return RecipeMatrix
        return {
            topic_title: extraction.topic_title || "Extracted Recipe",
            master_skill: extraction.master_skill || phase1.master_skill,
            facts: extraction.facts,
            concepts: extraction.concepts || [],
            procedures: extraction.procedures || [],
        };
    }
    catch (err) {
        // Re-throw HttpsError as-is, wrap anything else
        if (err instanceof https_1.HttpsError)
            throw err;
        console.error("bakeMaterial error:", err);
        throw new https_1.HttpsError("internal", err.message || "Unknown error during baking.");
    }
});
//# sourceMappingURL=index.js.map