import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  serverTimestamp,
  writeBatch,
  arrayUnion,
} from "firebase/firestore";
import { deleteObject, ref } from "firebase/storage";
import { db, storage } from "../firebaseConfig";
import { useAuth } from "./AuthContext";
import type { RecipeMatrix } from "../lib/gemini";

// --- Types ---

export interface CompostItem {
  id: string; // Fact ID or Procedure Step
  materialId: string;
  question: string;
  answer: string;
  type: "fact" | "procedure";
  addedAt: number;
  mistakeCount: number;
  isResolved: boolean;
}

export interface OrganicWasteItem {
  id: string; // The plant/plot ID that died
  addedAt: number; // converted to ms from server timestamp
}

export interface LinkedFile {
  name: string;
  storageUri: string;    // gs://bucket/path — for re-downloads
  downloadUrl: string;   // HTTPS URL — for direct access
  mimeType: string | null;
  size: number | null;   // bytes
  addedAt: number;       // ms timestamp
}

export interface HybridBloom {
  id: string;
  rootMaterialId: string;
  rootConcept: string;
  scionMaterialId: string;
  scionText: string;
  confidence: number;
  createdAt: number;
}

export interface ShinyMutation {
  id: string;
  conceptA: string;
  procedureB: string;
  color: string;
  rarity: "common" | "rare" | "ultra";
  createdAt: number;
}

export interface StreakData {
  lastLoginDate: string; // YYYY-MM-DD format
  currentStreak: number; // consecutive days including today
  maxStreak: number; // highest streak achieved
}

export interface StageResult {
  accuracy: number; // 0-1
  maxCombo: number; // highest combo achieved
  attempts: number; // total attempts
  timestamp: number; // last attempt timestamp
  lastPlayedTimestamp?: number; // last time this stage was successfully completed (for spaced repetition)
  variant?: "shiny" | "normal";
}

export interface MaterialRecord {
  title: string;
  category: string;
  rawText: string;
  stagesCompleted: string[];
  stars: number;
  xpEarned: number;
  createdAt: number;
  matrix: RecipeMatrix;
  stageResults?: {
    remember?: StageResult;
    understand?: StageResult;
    apply?: StageResult;
    analyze?: StageResult;
    evaluate?: StageResult;
    create?: StageResult;
  };
  linkedFiles?: LinkedFile[];
}

interface ProgressState {
  totalXP: number;
  totalStars: number;
  totalPestsSwatted: number;
  highestFrenzyCombo: number;
  materials: Record<string, MaterialRecord>;
  streakData: StreakData;
  studyStreak: number;
  lastStudyDate: number | null;
  goldenHourActive: boolean;
  compost: CompostItem[];
  organicWaste: OrganicWasteItem[];
  superFertilizerCount: number;
  hybrids: HybridBloom[];
  mutations: ShinyMutation[];
}

interface ProgressContextType {
  state: ProgressState;
  registerMaterial: (
    id: string,
    title: string,
    category: string,
    rawText: string,
    matrix: RecipeMatrix
  ) => void;
  completeStage: (
    materialId: string,
    stageKey: string,
    accuracy: number,
    maxCombo: number,
    gameStartTime?: number
  ) => number;
  canUnlockStage: (materialId: string, nextStageName: string) => boolean;
  checkAndApplyStreak: () => void;
  getXPMultiplier: (streak: number) => number;
  addToCompost: (item: Omit<CompostItem, "addedAt" | "mistakeCount" | "isResolved">) => void;
  removeFromCompost: (id: string) => void;
  incrementPestsSwatted: () => void;
  updateHighestCombo: (combo: number) => void;
  addDeadPlantToWaste: (plotId: string) => void;
  harvestFertilizer: (wasteId: string) => void;
  updateLeaderboard: () => void;
  setGoldenHourActive: (active: boolean) => void;
  /** Award XP directly (e.g. Compost Bin reward) and persist to Firestore. */
  addWaterDrops: (amount: number) => void;
  /** Attach an uploaded file to a material's linkedFiles array. */
  linkFileToMaterial: (materialId: string, file: LinkedFile) => void;
  /** Remove an uploaded file from a material and Storage. */
  removeFileFromMaterial: (materialId: string, storageUri: string) => Promise<void>;
  /** Consume one fertilizer charge (if available). */
  consumeFertilizer: () => boolean;
  /** Revive a plot by updating last played timestamp. */
  revivePlot: (materialId: string, stageKey: "remember" | "understand" | "apply") => void;
  /** Store a hybrid bloom from grafting. */
  addHybrid: (hybrid: HybridBloom) => void;
  /** Store a shiny mutation from splicing. */
  addMutation: (mutation: ShinyMutation) => void;
  clearMaterials: () => Promise<void>;
}

// --- XP table (Bloom's cognitive complexity) ---

const STAGE_XP: Record<string, number> = {
  remember: 10,
  understand: 20,
  apply: 30,
  analyze: 40,
  evaluate: 50,
  create: 60,
};

// --- Defaults ---

const EMPTY_STREAK: StreakData = {
  lastLoginDate: new Date().toISOString().split("T")[0], // YYYY-MM-DD
  currentStreak: 0,
  maxStreak: 0,
};

const EMPTY_STATE: ProgressState = {
  totalXP: 0,
  totalStars: 0,
  totalPestsSwatted: 0,
  highestFrenzyCombo: 0,
  materials: {},
  streakData: EMPTY_STREAK,
  studyStreak: 0,
  lastStudyDate: null,
  goldenHourActive: false,
  compost: [],
  organicWaste: [],
  superFertilizerCount: 0,
  hybrids: [],
  mutations: [],
};

const STORAGE_KEY = "@bloom_progress";

// --- Streak Utilities ---

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function countShinyVariants(materials: Record<string, MaterialRecord>, mutationCount = 0): number {
  const stageCount = Object.values(materials).reduce((count, material) => {
    const stageResults = material.stageResults;
    if (!stageResults) return count;
    const stages = [
      stageResults.remember,
      stageResults.understand,
      stageResults.apply,
      stageResults.analyze,
      stageResults.evaluate,
      stageResults.create,
    ];
    return count + stages.filter((stage) => stage?.variant === "shiny").length;
  }, 0);
  return stageCount + mutationCount;
}

/**
 * Calculate XP multiplier based on current streak.
 * 1-2 days: 1x (no bonus)
 * 3-6 days: 1.5x
 * 7-13 days: 2x
 * 14+ days: 3x
 */
export function getStreakMultiplier(streak: number): number {
  if (streak >= 14) return 3;
  if (streak >= 7) return 2;
  if (streak >= 3) return 1.5;
  return 1;
}

/**
 * Get human-readable streak description for UI display
 */
export function getStreakLabel(streak: number): string {
  if (streak === 0) return "No streak";
  return `${streak}-Day Streak`;
}

// --- Wilting Mechanic / Spaced Repetition ---

/**
 * Calculate freshness percentage (0-100) based on how long ago a stage was last played.
 * 0-2 days: 100% (Fresh)
 * 3-6 days: 75% (Drooping)
 * 7-13 days: 50% (Wilting)
 * 14+ days: 0% (Fully Wilted)
 */
export function calculateFreshness(lastPlayedTimestamp?: number): number {
  if (!lastPlayedTimestamp) return 100; // Never played counts as fresh

  const now = Date.now();
  const elapsedMs = now - lastPlayedTimestamp;
  const elapsedDays = elapsedMs / (1000 * 60 * 60 * 24);

  if (elapsedDays <= 2) return 100;
  if (elapsedDays <= 6) return 75;
  if (elapsedDays <= 13) return 50;
  return 0; // 14+ days
}

// --- Context ---

const ProgressContext = createContext<ProgressContextType>({
  state: EMPTY_STATE,
  registerMaterial: () => { },
  completeStage: () => 0,
  canUnlockStage: () => false,
  checkAndApplyStreak: () => { },
  getXPMultiplier: () => 1,
  addToCompost: () => { },
  removeFromCompost: () => { },
  incrementPestsSwatted: () => { },
  updateHighestCombo: () => { },
  addDeadPlantToWaste: () => { },
  harvestFertilizer: () => { },
  updateLeaderboard: () => { },
  setGoldenHourActive: () => { },
  addWaterDrops: () => { },
  linkFileToMaterial: () => { },
  removeFileFromMaterial: async () => { },
  consumeFertilizer: () => false,
  revivePlot: () => { },
  addHybrid: () => { },
  addMutation: () => { },
  clearMaterials: async () => { },
});

// --- Provider ---

export function ProgressProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [state, setState] = useState<ProgressState>(EMPTY_STATE);
  const [loaded, setLoaded] = useState(false);

  // Load data when user changes (login/logout)
  useEffect(() => {
    if (!user) {
      // User signed out — reset state
      setState(EMPTY_STATE);
      setLoaded(true);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        // Try loading from Firestore first
        const materialsRef = collection(db, "users", user.uid, "materials");
        const snapshot = await getDocs(materialsRef);

        if (!cancelled && !snapshot.empty) {
          const materials: Record<string, MaterialRecord> = {};
          let totalXP = 0;
          let totalStars = 0;

          snapshot.forEach((docSnap) => {
            const data = docSnap.data() as MaterialRecord;
            materials[docSnap.id] = data;
            totalXP += data.xpEarned || 0;
            totalStars += data.stars || 0;
          });

          // Also try to load user data, streak, and subcollections
          let streakData = EMPTY_STREAK;
          let studyStreak = 0;
          let lastStudyDate: number | null = null;
          let compost: CompostItem[] = [];
          let organicWaste: OrganicWasteItem[] = [];
          let superFertilizerCount = 0;
          let totalPestsSwatted = 0;
          let highestFrenzyCombo = 0;
          let hybrids: HybridBloom[] = [];
          let mutations: ShinyMutation[] = [];

          try {
            const userDocRef = doc(db, "users", user.uid);
            const userSnap = await getDoc(userDocRef);
            if (userSnap.exists()) {
              const data = userSnap.data();
              if (data.streakData) streakData = data.streakData as StreakData;
              if (data.current_streak) studyStreak = data.current_streak;
              if (data.last_study_date) lastStudyDate = data.last_study_date.toMillis();
              if (data.total_pests_swatted) totalPestsSwatted = data.total_pests_swatted;
              if (data.highest_frenzy_combo) highestFrenzyCombo = data.highest_frenzy_combo;
              if (data.super_fertilizer_count) superFertilizerCount = data.super_fertilizer_count;

              // Run migration if old compost array exists on root
              if (data.compost && Array.isArray(data.compost)) {
                const batch = writeBatch(db);
                data.compost.forEach((item: any) => {
                  const compostDoc = doc(db, "users", user.uid, "compost", item.id);
                  const fullItem = {
                    ...item,
                    mistakeCount: 1,
                    isResolved: false
                  };
                  batch.set(compostDoc, fullItem, { merge: true });
                  compost.push(fullItem);
                });
                // Clear legacy compost array
                batch.update(userDocRef, { compost: null });
                await batch.commit().catch(e => console.warn("Migration batch failed", e));
              }
            }

            // Load active compost items from subcollection
            if (compost.length === 0) {
              const compostRef = collection(db, "users", user.uid, "compost");
              const compostSnap = await getDocs(compostRef);
              const compostBatch = writeBatch(db);
              let didMigrate = false;

              compostSnap.forEach(docSnap => {
                const data = docSnap.data() as CompostItem;
                if (data.isResolved) return;

                const materialPrefix = data.materialId ? `${data.materialId}_` : "";
                const normalizedId = data.materialId
                  ? data.id.startsWith(materialPrefix)
                    ? data.id
                    : `${data.materialId}_${data.id}`
                  : data.id;

                const normalizedItem: CompostItem = { ...data, id: normalizedId };

                if (data.materialId && docSnap.id !== normalizedId) {
                  compostBatch.set(doc(db, "users", user.uid, "compost", normalizedId), normalizedItem, { merge: true });
                  compostBatch.set(doc(db, "users", user.uid, "compost", docSnap.id), { ...data, isResolved: true }, { merge: true });
                  didMigrate = true;
                }

                compost.push(normalizedItem);
              });

              if (didMigrate) {
                await compostBatch.commit().catch(e => console.warn("Compost migration failed", e));
              }
            }

            // Load organic waste from subcollection
            const wasteRef = collection(db, "users", user.uid, "organic_waste");
            const wasteSnap = await getDocs(wasteRef);
            wasteSnap.forEach(docSnap => {
              const data = docSnap.data();
              organicWaste.push({
                id: docSnap.id, // Bug fix: use the document's own ID, not data.id (which can be undefined)
                addedAt: data.addedAt?.toMillis() || Date.now(),
              });
            });

            // Load plots (Wilting Engine) from subcollection
            const plotsRef = collection(db, "users", user.uid, "plots");
            const plotsSnap = await getDocs(plotsRef);

            plotsSnap.forEach(doc => {
              const plotData = doc.data();
              const materialId = doc.id.split('_')[0]; // assuming ID format materialId_stage
              const stageKey = plotData.stage_id as keyof NonNullable<MaterialRecord["stageResults"]>;
              if (materials[materialId] && materials[materialId].stageResults && materials[materialId].stageResults[stageKey]) {
                materials[materialId].stageResults[stageKey]!.lastPlayedTimestamp = plotData.last_mastered_at?.toMillis() || Date.now();
              }
            });

            // Load hybrids from subcollection
            const hybridsRef = collection(db, "users", user.uid, "hybrids");
            const hybridsSnap = await getDocs(hybridsRef);
            hybridsSnap.forEach(docSnap => {
              const data = docSnap.data();
              hybrids.push({
                id: docSnap.id,
                rootMaterialId: data.rootMaterialId,
                rootConcept: data.rootConcept,
                scionMaterialId: data.scionMaterialId,
                scionText: data.scionText,
                confidence: data.confidence ?? 0,
                createdAt: data.createdAt?.toMillis() || Date.now(),
              });
            });

            const mutationsRef = collection(db, "users", user.uid, "mutations");
            const mutationsSnap = await getDocs(mutationsRef);
            mutationsSnap.forEach(docSnap => {
              const data = docSnap.data();
              mutations.push({
                id: docSnap.id,
                conceptA: data.conceptA,
                procedureB: data.procedureB,
                color: data.color,
                rarity: data.rarity,
                createdAt: data.createdAt?.toMillis() || Date.now(),
              });
            });

          } catch (e) {
            console.warn("Failed fetching user/subcollections:", e);
          }

          const firestoreState: ProgressState = {
            totalXP,
            totalStars,
            totalPestsSwatted,
            highestFrenzyCombo,
            materials,
            streakData,
            studyStreak,
            lastStudyDate,
            goldenHourActive: false,
            compost,
            organicWaste,
            superFertilizerCount,
            hybrids,
            mutations,
          };
          setState(firestoreState);
          // Cache to AsyncStorage
          await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(firestoreState));
        } else if (!cancelled) {
          // Firestore empty — try AsyncStorage as fallback
          const raw = await AsyncStorage.getItem(STORAGE_KEY);
          if (raw) {
            const parsed = JSON.parse(raw);
            // Ensure streakData and compost exists (migration for old cached state)
            setState({
              ...parsed,
              streakData: parsed.streakData || EMPTY_STREAK,
              studyStreak: parsed.studyStreak || 0,
              lastStudyDate: parsed.lastStudyDate || null,
              goldenHourActive: parsed.goldenHourActive || false,
              compost: parsed.compost || [],
              organicWaste: parsed.organicWaste || [],
              superFertilizerCount: parsed.superFertilizerCount || 0,
              hybrids: parsed.hybrids || [],
              mutations: parsed.mutations || [],
            });
          }
        }
      } catch {
        // Firestore failed (offline?) — fall back to AsyncStorage
        if (!cancelled) {
          try {
            const raw = await AsyncStorage.getItem(STORAGE_KEY);
            if (raw) {
              const parsed = JSON.parse(raw);
              // Ensure streakData and compost exists (migration for old cached state)
              setState({
                ...parsed,
                streakData: parsed.streakData || EMPTY_STREAK,
                studyStreak: parsed.studyStreak || 0,
                lastStudyDate: parsed.lastStudyDate || null,
                goldenHourActive: parsed.goldenHourActive || false,
                compost: parsed.compost || [],
                organicWaste: parsed.organicWaste || [],
                superFertilizerCount: parsed.superFertilizerCount || 0,
                hybrids: parsed.hybrids || [],
                mutations: parsed.mutations || [],
              });
            }
          } catch {
            // ignore — start fresh
          }
        }
      }

      if (!cancelled) {
        setLoaded(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);

  // Persist to AsyncStorage whenever state changes (after initial load)
  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => { });
  }, [state, loaded]);

  // Check and apply daily login streak when component mounts and user is loaded
  useEffect(() => {
    if (!loaded || !user) return;

    const today = new Date().toISOString().split("T")[0];
    const lastLoginDate = state.streakData.lastLoginDate;

    // Only run check if it's a new day
    if (lastLoginDate !== today) {
      const lastDate = new Date(lastLoginDate);
      const todayDate = new Date(today);
      const diffTime = todayDate.getTime() - lastDate.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

      let newCurrentStreak = 0;
      let newMaxStreak = state.streakData.maxStreak;

      if (diffDays === 1) {
        // Yesterday → today: increment streak
        newCurrentStreak = state.streakData.currentStreak + 1;
      } else if (diffDays > 1) {
        // Older than yesterday: reset streak to 1 (starting fresh today)
        newCurrentStreak = 1;
      }

      // Update max streak if current exceeds it
      if (newCurrentStreak > newMaxStreak) {
        newMaxStreak = newCurrentStreak;
      }

      setState((prev) => ({
        ...prev,
        streakData: {
          lastLoginDate: today,
          currentStreak: newCurrentStreak,
          maxStreak: newMaxStreak,
        },
      }));

      // Persist streak to Firestore user root doc
      if (user) {
        const userDoc = doc(db, "users", user.uid);
        setDoc(userDoc, {
          streakData: {
            lastLoginDate: today,
            currentStreak: newCurrentStreak,
            maxStreak: newMaxStreak,
          }
        }, { merge: true }).catch((err) =>
          console.warn("Firestore streak write failed:", err)
        );
      }
    }
  }, [loaded, user]);

  const registerMaterial = useCallback(
    (
      id: string,
      title: string,
      category: string,
      rawText: string,
      matrix: RecipeMatrix
    ) => {
      const record: MaterialRecord = {
        title,
        category,
        rawText,
        stagesCompleted: [],
        stars: 0,
        xpEarned: 0,
        createdAt: Date.now(),
        matrix,
        stageResults: {},
      };

      setState((prev) => {
        if (prev.materials[id]) return prev; // already registered
        return {
          ...prev,
          materials: {
            ...prev.materials,
            [id]: record,
          },
        };
      });

      // Sync to Firestore (fire-and-forget)
      if (user) {
        const materialDoc = doc(db, "users", user.uid, "materials", id);
        setDoc(materialDoc, record).catch((err) =>
          console.warn("Firestore write failed:", err)
        );
      }
    },
    [user]
  );

  const canUnlockStage = useCallback(
    (materialId: string, nextStageName: string): boolean => {
      const material = state.materials[materialId];
      if (!material) return false;

      // Define unlock requirements: to unlock stage X, you must master stage Y
      const unlockRequirements: Record<string, string> = {
        understand: "remember",
        apply: "understand",
        analyze: "apply",
        evaluate: "analyze",
        create: "evaluate",
      };

      const requiredPreviousStage = unlockRequirements[nextStageName];
      if (!requiredPreviousStage) {
        // If no requirement (e.g., remember is the first stage), can always attempt
        return true;
      }

      // Check if previous stage has been completed with sufficient mastery
      const prevResult = material.stageResults?.[requiredPreviousStage as keyof typeof material.stageResults];
      if (!prevResult) {
        // Previous stage not completed, cannot unlock
        return false;
      }

      // Check: accuracy >= 80%
      const meetsAccuracy = prevResult.accuracy >= 0.8;

      return meetsAccuracy;
    },
    [state.materials]
  );

  const completeStage = useCallback(
    (
      materialId: string,
      stageKey: string,
      accuracy: number,
      maxCombo: number,
      gameStartTime?: number
    ): number => {
      // Validate timestamp to prevent cheating
      if (gameStartTime) {
        const elapsedSeconds = (Date.now() - gameStartTime) / 1000;
        const MIN_REQUIRED: Record<string, number> = {
          remember: 60, // 10 questions * 6s minimum
          understand: 50, // 5 facts * 10s minimum
          apply: 40, // 3 procedures * ~13s minimum
          analyze: 40,
          evaluate: 35,
          create: 30,
        };
        const minimum = MIN_REQUIRED[stageKey] ?? 30;

        if (elapsedSeconds < minimum) {
          console.warn("[CHEAT FLAG] Impossible speedrun:", {
            stageKey,
            elapsedSeconds,
            minimumRequired: minimum,
            timestamp: new Date().toISOString(),
          });
          // Still award XP but flag for review
        }
      }

      const clampedAccuracy = Math.max(0, Math.min(1, accuracy));
      let awardedXP = 0;
      let unlocked = false;

      setState((prev) => {
        const mat = prev.materials[materialId];
        if (!mat) return prev;

        // Initialize stageResults if not present
        const stageResults = mat.stageResults || {};

        const now = Date.now();
        const lastStudyDateMs = prev.lastStudyDate ?? 0;
        let nextStudyStreak = prev.studyStreak;

        if (!lastStudyDateMs) {
          nextStudyStreak = 1;
        } else {
          const diffMs = now - lastStudyDateMs;
          if (diffMs >= ONE_DAY_MS && diffMs < ONE_DAY_MS * 2) {
            nextStudyStreak = prev.studyStreak + 1;
          } else if (diffMs >= ONE_DAY_MS * 2) {
            nextStudyStreak = 1;
          } else {
            nextStudyStreak = Math.max(prev.studyStreak, 1);
          }
        }

        const newLastStudyDate = now;

        // Get current stage result (or create new)
        const currentStageRes: StageResult = stageResults[stageKey as keyof typeof stageResults] || {
          accuracy: 0,
          maxCombo: 0,
          attempts: 0,
          timestamp: 0,
        };

        // Increment attempts
        const newAttempts = currentStageRes.attempts + 1;

        // Update with best accuracy and combo
        const newAccuracy = Math.max(currentStageRes.accuracy, clampedAccuracy);
        const newMaxCombo = Math.max(currentStageRes.maxCombo, maxCombo);

        // Check if this stage is already completed (idempotent)
        const isAlreadyCompleted = mat.stagesCompleted?.includes(stageKey) ?? false;

        // Check if can unlock (mastery requirement)
        let canUnlock = true;
        const unlockRequirements: Record<string, string> = {
          understand: "remember",
          apply: "understand",
          analyze: "apply",
          evaluate: "analyze",
          create: "evaluate",
        };
        const requiredPreviousStage = unlockRequirements[stageKey];

        if (requiredPreviousStage && !isAlreadyCompleted) {
          const prevResult = stageResults[requiredPreviousStage as keyof typeof stageResults];
          canUnlock = (prevResult && prevResult.accuracy >= 0.8) ?? true;
        }

        // Determine XP award
        let xpAward = 0;
        if (isAlreadyCompleted) {
          // Already completed before - no XP
          xpAward = 0;
        } else if (canUnlock) {
          // Meets mastery gate - award full XP with streak multiplier
          const baseXP = STAGE_XP[stageKey] ?? 0;
          const baseAward = clampedAccuracy > 0 ? Math.max(1, Math.round(baseXP * clampedAccuracy)) : 0;
          // Apply streak multiplier
          const multiplier = getStreakMultiplier(prev.streakData.currentStreak);
          xpAward = Math.round(baseAward * multiplier);
          unlocked = true;
        } else {
          // Failed mastery gate - apply -5 XP penalty
          xpAward = -5;
        }

        awardedXP = xpAward;

        const previousVariant =
          (stageResults[stageKey as keyof typeof stageResults] as StageResult | undefined)?.variant ??
          "normal";
        const baseRate = 0.15;
        const bonus = Math.min(nextStudyStreak * 0.02, 0.10);
        const eventMultiplier = prev.goldenHourActive ? 2 : 1;
        const mutationRate = Math.min((baseRate + bonus) * eventMultiplier, 1);
        const rolledMutation = unlocked && !isAlreadyCompleted && Math.random() < mutationRate;
        const nextVariant = rolledMutation ? "shiny" : previousVariant;

        // Update material record
        const updatedMat: MaterialRecord = {
          ...mat,
          stagesCompleted: unlocked
            ? [...(mat.stagesCompleted || []), stageKey]
            : mat.stagesCompleted || [],
          stars: unlocked ? mat.stars + 1 : mat.stars,
          xpEarned: Math.max(0, mat.xpEarned + xpAward), // Don't go below 0
          stageResults: {
            ...stageResults,
            [stageKey]: {
              accuracy: newAccuracy,
              maxCombo: newMaxCombo,
              attempts: newAttempts,
              timestamp: Date.now(),
              // Always update lastPlayedTimestamp so wilting resets on replay
              lastPlayedTimestamp: Date.now(),
              variant: nextVariant,
            } as StageResult,
          },
        };

        // Sync to Firestore (fire-and-forget)
        if (user) {
          const batch = writeBatch(db);

          const materialDoc = doc(db, "users", user.uid, "materials", materialId);
          batch.update(materialDoc, {
            stagesCompleted: updatedMat.stagesCompleted,
            stars: updatedMat.stars,
            xpEarned: updatedMat.xpEarned,
            stageResults: updatedMat.stageResults,
          });

          const userDocRef = doc(db, "users", user.uid);
          batch.set(userDocRef, {
            current_streak: nextStudyStreak,
            last_study_date: serverTimestamp(),
          }, { merge: true });

          // Write to plots subcollection for Wilting Engine
          const plotDoc = doc(db, "users", user.uid, "plots", `${materialId}_${stageKey}`);
          batch.set(plotDoc, {
            stage_id: stageKey,
            last_mastered_at: serverTimestamp(),
            health_status: "blooming",
            refresh_runs_completed: isAlreadyCompleted ? 1 : 0, // Increment if revisiting
            variant: nextVariant,
          }, { merge: true });

          const updatedMaterials = {
            ...prev.materials,
            [materialId]: updatedMat,
          };
          const shinyCount = countShinyVariants(updatedMaterials, prev.mutations.length);
          const totalPoints = Math.max(0, prev.totalXP + xpAward);
          const displayName = user.displayName || user.email || "Anonymous";
          const leaderboardDoc = doc(db, "leaderboard", user.uid);
          batch.set(leaderboardDoc, {
            userId: user.uid,
            displayName,
            shinyCount,
            totalPoints,
            updatedAt: serverTimestamp(),
          }, { merge: true });

          batch.commit().catch((err) =>
            console.warn("Firestore completeStage batch failed:", err)
          );
        }

        return {
          ...prev,
          studyStreak: nextStudyStreak,
          lastStudyDate: newLastStudyDate,
          totalXP: Math.max(0, prev.totalXP + xpAward), // Don't go below 0
          totalStars: unlocked ? prev.totalStars + 1 : prev.totalStars,
          materials: {
            ...prev.materials,
            [materialId]: updatedMat,
          },
        };
      });

      return awardedXP;
    },
    [user]
  );

  const checkAndApplyStreak = useCallback(() => {
    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

    setState((prev) => {
      const currentStreak = prev.streakData;
      const lastLoginDate = currentStreak.lastLoginDate;

      // If we've already checked today, don't do anything
      if (lastLoginDate === today) {
        return prev;
      }

      // Calculate the difference in days
      const lastDate = new Date(lastLoginDate);
      const todayDate = new Date(today);
      const diffTime = todayDate.getTime() - lastDate.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

      let newCurrentStreak = 0;
      let newMaxStreak = currentStreak.maxStreak;

      if (diffDays === 1) {
        // Yesterday → today: increment streak
        newCurrentStreak = currentStreak.currentStreak + 1;
      } else if (diffDays === 0) {
        // Same day (shouldn't happen based on the check above)
        return prev;
      } else {
        // Older than yesterday: reset streak to 1 (starting fresh today)
        newCurrentStreak = 1;
      }

      // Update max streak if current exceeds it
      if (newCurrentStreak > newMaxStreak) {
        newMaxStreak = newCurrentStreak;
      }

      return {
        ...prev,
        streakData: {
          lastLoginDate: today,
          currentStreak: newCurrentStreak,
          maxStreak: newMaxStreak,
        },
      };
    });
  }, []);

  const getXPMultiplier = useCallback((streak: number): number => {
    return getStreakMultiplier(streak);
  }, []);

  const updateLeaderboard = useCallback(() => {
    if (!user) return;
    const shinyCount = countShinyVariants(state.materials, state.mutations.length);
    const totalPoints = state.totalXP;
    const displayName = user.displayName || user.email || "Anonymous";
    setDoc(doc(db, "leaderboard", user.uid), {
      userId: user.uid,
      displayName,
      shinyCount,
      totalPoints,
      updatedAt: serverTimestamp(),
    }, { merge: true }).catch((err) =>
      console.warn("Firestore leaderboard write failed:", err)
    );
  }, [state.materials, state.totalXP, user]);

  const setGoldenHourActive = useCallback((active: boolean) => {
    setState((prev) => {
      if (prev.goldenHourActive === active) return prev;
      return { ...prev, goldenHourActive: active };
    });
  }, []);

  const addToCompost = useCallback((item: Omit<CompostItem, "addedAt" | "mistakeCount" | "isResolved">) => {
    setState((prev) => {
      const compostId = item.materialId ? `${item.materialId}_${item.id}` : item.id;
      const existingIdx = prev.compost.findIndex((c) => c.id === compostId);
      let newCompost = [...prev.compost];
      let updatedItem: CompostItem;

      if (existingIdx >= 0) {
        // Increment mistake count
        updatedItem = { ...newCompost[existingIdx], mistakeCount: newCompost[existingIdx].mistakeCount + 1, isResolved: false };
        newCompost[existingIdx] = updatedItem;
      } else {
        // New addition
        updatedItem = { ...item, id: compostId, addedAt: Date.now(), mistakeCount: 1, isResolved: false };
        newCompost.push(updatedItem);
      }

      if (user) {
        setDoc(doc(db, "users", user.uid, "compost", compostId), updatedItem, { merge: true }).catch((err) =>
          console.warn("Firestore compost write failed:", err)
        );
      }
      return { ...prev, compost: newCompost };
    });
  }, [user]);

  const removeFromCompost = useCallback((id: string) => {
    setState((prev) => {
      // Create a copy of the compost array but filter out the resolved item
      const newCompost = prev.compost.filter((c) => c.id !== id);

      if (user) {
        // Find the item to resolve it in Firestore historically
        const resolvedItem = prev.compost.find(c => c.id === id);
        if (resolvedItem) {
          setDoc(doc(db, "users", user.uid, "compost", id), { ...resolvedItem, isResolved: true }, { merge: true }).catch((err) =>
            console.warn("Firestore compost resolve failed:", err)
          );
        }
      }
      return { ...prev, compost: newCompost };
    });
  }, [user]);

  const incrementPestsSwatted = useCallback(() => {
    setState(prev => {
      const newTotal = prev.totalPestsSwatted + 1;
      if (user) {
        updateDoc(doc(db, "users", user.uid), { total_pests_swatted: newTotal }).catch(console.warn);
      }
      return { ...prev, totalPestsSwatted: newTotal };
    });
  }, [user]);

  const updateHighestCombo = useCallback((combo: number) => {
    setState(prev => {
      if (combo <= prev.highestFrenzyCombo) return prev;
      if (user) {
        updateDoc(doc(db, "users", user.uid), { highest_frenzy_combo: combo }).catch(console.warn);
      }
      return { ...prev, highestFrenzyCombo: combo };
    });
  }, [user]);

  const addDeadPlantToWaste = useCallback((plotId: string) => {
    setState(prev => {
      const existingIdx = prev.organicWaste.findIndex(w => w.id === plotId);
      if (existingIdx >= 0) return prev; // Already turning to waste

      const now = Date.now();
      const newItem: OrganicWasteItem = { id: plotId, addedAt: now };

      if (user) {
        const wasteDoc = doc(db, "users", user.uid, "organic_waste", plotId);
        setDoc(wasteDoc, { id: plotId, addedAt: serverTimestamp() }).catch(err =>
          console.warn("Firestore organic_waste write failed:", err)
        );
      }

      return { ...prev, organicWaste: [...prev.organicWaste, newItem] };
    });
  }, [user]);

  const harvestFertilizer = useCallback((wasteId: string) => {
    setState(prev => {
      const wasteItem = prev.organicWaste.find(w => w.id === wasteId);
      if (!wasteItem) return prev;

      // 24 hours in ms
      const TWENTY_FOUR_HOURS_MS = 86400000;
      if (Date.now() <= wasteItem.addedAt + TWENTY_FOUR_HOURS_MS) {
        console.warn("Cannot harvest fertilizer yet: 24 hours have not passed.");
        return prev;
      }

      const newSuperFertilizerCount = prev.superFertilizerCount + 1;
      const newOrganicWaste = prev.organicWaste.filter(w => w.id !== wasteId);

      if (user) {
        const batch = writeBatch(db);
        const userDocRef = doc(db, "users", user.uid);
        const wasteDocRef = doc(db, "users", user.uid, "organic_waste", wasteId);

        batch.update(userDocRef, { super_fertilizer_count: newSuperFertilizerCount });
        batch.delete(wasteDocRef);
        batch.commit().catch(err => console.warn("Firestore harvest batch failed:", err));
      }

      return {
        ...prev,
        organicWaste: newOrganicWaste,
        superFertilizerCount: newSuperFertilizerCount,
      };
    });
  }, [user]);

  const consumeFertilizer = useCallback((): boolean => {
    if (state.superFertilizerCount <= 0) return false;
    const nextCount = Math.max(0, state.superFertilizerCount - 1);

    setState(prev => ({
      ...prev,
      superFertilizerCount: Math.max(0, prev.superFertilizerCount - 1),
    }));

    if (user) {
      updateDoc(doc(db, "users", user.uid), { super_fertilizer_count: nextCount }).catch(console.warn);
    }

    return true;
  }, [state.superFertilizerCount, user]);

  const revivePlot = useCallback((materialId: string, stageKey: "remember" | "understand" | "apply") => {
    setState(prev => {
      const mat = prev.materials[materialId];
      if (!mat) return prev;
      const now = Date.now();
      const currentStage = mat.stageResults?.[stageKey] ?? {
        accuracy: 0,
        maxCombo: 0,
        attempts: 0,
        timestamp: now,
      };
      const updatedStage = { ...currentStage, lastPlayedTimestamp: now };
      const updatedMat: MaterialRecord = {
        ...mat,
        stageResults: {
          ...(mat.stageResults ?? {}),
          [stageKey]: updatedStage,
        },
      };

      if (user) {
        const plotDoc = doc(db, "users", user.uid, "plots", `${materialId}_${stageKey}`);
        setDoc(plotDoc, {
          stage_id: stageKey,
          last_mastered_at: serverTimestamp(),
        }, { merge: true }).catch(err => console.warn("Plot revive failed:", err));
      }

      return { ...prev, materials: { ...prev.materials, [materialId]: updatedMat } };
    });
  }, [user]);

  const addHybrid = useCallback((hybrid: HybridBloom) => {
    setState(prev => ({
      ...prev,
      hybrids: [hybrid, ...prev.hybrids],
    }));

    if (user) {
      const hybridDoc = doc(db, "users", user.uid, "hybrids", hybrid.id);
      setDoc(hybridDoc, {
        ...hybrid,
        createdAt: serverTimestamp(),
      }, { merge: true }).catch(err => console.warn("Firestore addHybrid failed:", err));
    }
  }, [user]);

  const addMutation = useCallback((mutation: ShinyMutation) => {
    setState(prev => ({
      ...prev,
      mutations: [mutation, ...prev.mutations],
    }));

    if (user) {
      const mutationDoc = doc(db, "users", user.uid, "mutations", mutation.id);
      setDoc(mutationDoc, {
        ...mutation,
        createdAt: serverTimestamp(),
      }, { merge: true }).catch(err => console.warn("Firestore addMutation failed:", err));

      const shinyCount = countShinyVariants(state.materials, state.mutations.length + 1);
      const leaderboardDoc = doc(db, "leaderboard", user.uid);
      const displayName = user.displayName || user.email || "Anonymous";
      setDoc(leaderboardDoc, { totalPoints: state.totalXP, displayName, shinyCount, updatedAt: serverTimestamp() }, { merge: true }).catch(() => {});
    }
  }, [state.materials, state.mutations.length, state.totalXP, user]);

  /**
   * Bug #3 fix — Award XP directly (e.g. from Compost Bin) and persist to Firestore.
   * This is intentionally separate from completeStage to avoid the mastery-gate logic.
   */
  const addWaterDrops = useCallback((amount: number) => {
    if (amount <= 0) return;
    setState(prev => {
      const newXP = Math.max(0, prev.totalXP + amount);
      if (user) {
        const userDocRef = doc(db, "users", user.uid);
        // Persist to the leaderboard totalPoints as well
        const leaderboardDoc = doc(db, "leaderboard", user.uid);
        const displayName = user.displayName || user.email || "Anonymous";
        const shinyCount = countShinyVariants(prev.materials, prev.mutations.length);
        Promise.all([
          setDoc(userDocRef, { total_xp_bonus: amount }, { merge: true }),
          setDoc(leaderboardDoc, { totalPoints: newXP, displayName, shinyCount, updatedAt: serverTimestamp() }, { merge: true }),
        ]).catch(err => console.warn("Firestore addWaterDrops write failed:", err));
      }
      return { ...prev, totalXP: newXP };
    });
  }, [user]);

  const linkFileToMaterial = useCallback((materialId: string, file: LinkedFile) => {
    setState(prev => {
      const mat = prev.materials[materialId];
      if (!mat) return prev;
      const updatedMat: MaterialRecord = {
        ...mat,
        linkedFiles: [...(mat.linkedFiles ?? []), file],
      };
      if (user) {
        // arrayUnion ensures concurrent writes don't clobber each other
        updateDoc(
          doc(db, "users", user.uid, "materials", materialId),
          { linkedFiles: arrayUnion(file) }
        ).catch(err => console.warn("Firestore linkFileToMaterial failed:", err));
      }
      return { ...prev, materials: { ...prev.materials, [materialId]: updatedMat } };
    });
  }, [user]);

  const removeFileFromMaterial = useCallback(async (materialId: string, storageUri: string) => {
    const fileRef = ref(storage, storageUri);
    await deleteObject(fileRef);

    setState(prev => {
      const mat = prev.materials[materialId];
      if (!mat) return prev;
      const updatedMat: MaterialRecord = {
        ...mat,
        linkedFiles: (mat.linkedFiles ?? []).filter((file) => file.storageUri !== storageUri),
      };
      if (user) {
        updateDoc(
          doc(db, "users", user.uid, "materials", materialId),
          { linkedFiles: updatedMat.linkedFiles }
        ).catch(err => console.warn("Firestore removeFileFromMaterial failed:", err));
      }
      return { ...prev, materials: { ...prev.materials, [materialId]: updatedMat } };
    });
  }, [user]);

  const clearMaterials = useCallback(async () => {
    if (!user) return;
    setState(prev => ({
      ...prev,
      materials: {},
      compost: [],
      organicWaste: [],
      hybrids: [],
      mutations: [],
    }));
    try {
      const materialsRef = collection(db, "users", user.uid, "materials");
      const compostRef = collection(db, "users", user.uid, "compost");
      const wasteRef = collection(db, "users", user.uid, "organic_waste");
      const plotsRef = collection(db, "users", user.uid, "plots");
      const hybridsRef = collection(db, "users", user.uid, "hybrids");
      const mutationsRef = collection(db, "users", user.uid, "mutations");
      const userDocRef = doc(db, "users", user.uid);

      const [materialsSnap, compostSnap, wasteSnap, plotsSnap, hybridsSnap, mutationsSnap] = await Promise.all([
        getDocs(materialsRef),
        getDocs(compostRef),
        getDocs(wasteRef),
        getDocs(plotsRef),
        getDocs(hybridsRef),
        getDocs(mutationsRef),
      ]);

      const fileDeletes: Promise<void>[] = [];
      materialsSnap.forEach(docSnap => {
        const data = docSnap.data() as MaterialRecord;
        (data.linkedFiles ?? []).forEach(file => {
          if (file.storageUri) {
            fileDeletes.push(deleteObject(ref(storage, file.storageUri)).catch(() => undefined as never));
          }
        });
      });

      const batch = writeBatch(db);
      // Leave user stats intact (XP, streaks, fertilizer count)
      materialsSnap.forEach(docSnap => batch.delete(docSnap.ref));
      compostSnap.forEach(docSnap => batch.delete(docSnap.ref));
      wasteSnap.forEach(docSnap => batch.delete(docSnap.ref));
      plotsSnap.forEach(docSnap => batch.delete(docSnap.ref));
      hybridsSnap.forEach(docSnap => batch.delete(docSnap.ref));
      mutationsSnap.forEach(docSnap => batch.delete(docSnap.ref));

      await Promise.all([batch.commit(), ...fileDeletes]);
    } catch (err) {
      console.error("Failed to clear materials from Firestore", err);
    }
  }, [user]);

  return (
    <ProgressContext.Provider value={{
      state,
      registerMaterial,
      completeStage,
      canUnlockStage,
      checkAndApplyStreak,
      getXPMultiplier,
      addToCompost,
      removeFromCompost,
      incrementPestsSwatted,
      updateHighestCombo,
      addDeadPlantToWaste,
      harvestFertilizer,
      updateLeaderboard,
      setGoldenHourActive,
      addWaterDrops,
      linkFileToMaterial,
      removeFileFromMaterial,
      consumeFertilizer,
      revivePlot,
      addHybrid,
      addMutation,
      clearMaterials,
    }}>
      {children}
    </ProgressContext.Provider>
  );
}

export function useProgress() {
  return useContext(ProgressContext);
}
