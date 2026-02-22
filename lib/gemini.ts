// lib/gemini.ts
// Type definitions for the RecipeMatrix returned by the bakeMaterial Cloud Function

export interface Fact {
  id: string;
  term: string;
  definition: string;
}

export interface Concept {
  id: string;
  name: string;
  explanation: string;
  fact_ids: string[];
}

export interface Procedure {
  id: string;
  name: string;
  steps: string[];
  concept_ids: string[];
}

export interface FalseFact {
  id: string;
  text: string;
  source_fact_id: string;
}

export interface PlausibleFlaw {
  concept_id: string;
  flawed_statement: string;
  flawed_span: string;
}

export interface RecipeMatrix {
  topic_title: string;
  master_skill: string;
  facts: Fact[];
  concepts: Concept[];
  procedures: Procedure[];
  false_facts?: FalseFact[];
  plausible_flaws?: PlausibleFlaw[];
}
