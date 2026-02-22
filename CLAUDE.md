# BloomLearn

Garden-themed study app built with Expo + React Native. Users paste or upload materials, the app generates a learning matrix, and players grow knowledge through game stages. Progress stored in Firebase (Firestore + Storage).

## Build / Run

- `npm run start` — start Expo dev server
- `npm run start:clear` — start with cache reset
- `npm run android` / `npm run ios` / `npm run web`
- No test runner or lint/format scripts configured

## File Layout

- `app/` — screens and routes (expo-router)
- `context/` — app state and side effects (Firestore, AsyncStorage)
- `lib/` — UI helpers / game utilities
- `components/` — shared UI components
- `functions/` — Firebase Cloud Functions

## Navigation

- Garden (tab): import materials, garden stats, golden hour banner
- Uploads (tab): manage uploaded files
- Library (tab): view plots (materials), access stage games
- Compost (tab): review mistakes, harvest XP
- Rankings (tab): top 10 leaderboard
- Settings (stack): reset materials without losing XP/stats

## Study Materials

A material is a "plot" in the garden: title, category, rawText, recipe matrix (facts, concepts, procedures), stage progress, linked files. Stored in `users/{uid}/materials`.

### Importing

1. Paste text — Garden > "Plant New Seeds"
2. Upload file — Garden > "Generate from File" (PDF, TXT, Markdown). Cloud Function generates recipe matrix.

## Game Stages (Bloom's Taxonomy)

1. Remember — "Seed Library": rapid recall, combos, pests, golden seeds
2. Understand — "Greenhouse": match facts to concepts (multiple choice)
3. Apply — "Potting Bench": complete procedures step-by-step
4. Analyze — "Root Router": connect concept stems to facts/procedures
5. Evaluate — "Companion Planting": compatibility decisions, prune flaws
6. Create — "Seed Splicer": synthesize concept + procedure, Gemini scores

## Mini-Games

- Pest Patrol: squash false facts, let true pass
- Pruning Shears: reorder procedure steps, mark weed step
- Fertilizer Frenzy: rapid recall to revive wilting plots
- Grafting: connect concepts across materials, Gemini validates

## Compost System

Mistakes from Remember/Apply stored as Compost items. Timed recall clears items and awards XP. Stored in `users/{uid}/compost`.

## Organic Waste & Fertilizer

Dead plants become organic waste, ferment over time, harvested for fertilizer. Stored in `users/{uid}/organic_waste`.

## Leaderboard

Top 10 in `leaderboard/{userId}` — totalPoints, shinyCount, displayName.

## Golden Hour

Global toggle: `config/global_events`. Doubles mutation rate, shows banner.

## Streaks & XP

Daily login streak in user doc. XP multipliers scale with streak. XP from stage completion, compost sessions, bonuses.

## Cloud Functions

- `bakeMaterial` — text/file URI in, recipe matrix out (Gemini 2.5 Flash)
- `scoreGraft` — root concept + scion in, graft validity out
- `evaluateSplice` — concept + procedure + response in, synthesis quality out

## Data Model

- `users/{uid}` — streaks, stats, settings
- `users/{uid}/materials/{materialId}` — study materials
- `users/{uid}/compost/{itemId}` — compost mistakes
- `users/{uid}/organic_waste/{wasteId}` — dead plants
- `users/{uid}/plots/{plotId}` — plot spacing/wilting
- `users/{uid}/mutations/{mutationId}` — shiny mutations
- `leaderboard/{userId}` — ranking

## Coding Conventions

- Imports: 1) React/RN 2) Expo/third-party 3) Local (`../context`, `../lib`, `../components`). Double quotes.
- TypeScript: types inlined unless widely reused. Avoid `any`. Explicit Firestore doc interfaces.
- Components: function components + hooks. `useCallback` for passed-down setters. `useMemo` for heavy calcs. `StyleSheet.create`.
- Styling: warm earthy palette (#7DB58D, #EFEBE9, #5D4037, #FFD700). Rounded corners, soft shadows, mobile-first 12-24px spacing.
- Naming: PascalCase components, camelCase hooks with `use` prefix, snake_case Firestore collections/fields.
- Firestore: `writeBatch` for multi-doc. `serverTimestamp()` for writes. Fire-and-forget with `.catch`.
- Errors: `try/catch` around async Firestore. `console.warn`/`console.log`. Don't crash on transient errors.
- State: `ProgressContext` central. AsyncStorage offline fallback. Immutable updates.
- Mutations: rolls on stage completion. `variant` on stage result and plot doc. Streak-based bonus.
