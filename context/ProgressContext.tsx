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
} from "firebase/firestore";
import { db } from "../firebaseConfig";
import { useAuth } from "./AuthContext";
import type { RecipeMatrix } from "../lib/gemini";

// --- Types ---

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
  };
}

interface ProgressState {
  totalXP: number;
  totalStars: number;
  materials: Record<string, MaterialRecord>;
  streakData: StreakData;
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
  materials: {},
  streakData: EMPTY_STREAK,
};

const STORAGE_KEY = "@bloom_progress";

// --- Streak Utilities ---

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

          // Also try to load streak from user root doc
          let streakData = EMPTY_STREAK;
          try {
            const userDocRef = doc(db, "users", user.uid);
            const userSnap = await getDoc(userDocRef);
            if (userSnap.exists() && userSnap.data().streakData) {
              streakData = userSnap.data().streakData as StreakData;
            }
          } catch {
            // ignore — use default streak if user doc fetch fails
          }

          const firestoreState: ProgressState = {
            totalXP,
            totalStars,
            materials,
            streakData,
          };
          setState(firestoreState);
          // Cache to AsyncStorage
          await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(firestoreState));
        } else if (!cancelled) {
          // Firestore empty — try AsyncStorage as fallback
          const raw = await AsyncStorage.getItem(STORAGE_KEY);
          if (raw) {
            const parsed = JSON.parse(raw);
            // Ensure streakData exists (migration for old cached state)
            setState({
              ...parsed,
              streakData: parsed.streakData || EMPTY_STREAK,
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
              // Ensure streakData exists (migration for old cached state)
              setState({
                ...parsed,
                streakData: parsed.streakData || EMPTY_STREAK,
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
        stageResults: {
          remember: undefined,
          understand: undefined,
          apply: undefined,
        },
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

      // Check: accuracy >= 80% AND maxCombo >= 3
      const meetsAccuracy = prevResult.accuracy >= 0.8;
      const meetsCombo = prevResult.maxCombo >= 3;

      return meetsAccuracy && meetsCombo;
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
        };
        const requiredPreviousStage = unlockRequirements[stageKey];

        if (requiredPreviousStage && !isAlreadyCompleted) {
          const prevResult = stageResults[requiredPreviousStage as keyof typeof stageResults];
          canUnlock =
            (prevResult &&
              prevResult.accuracy >= 0.8 &&
              prevResult.maxCombo >= 3) ?? true;
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
          console.log("[MASTERY GATE] Stage locked - insufficient performance:", {
            stageKey,
            accuracy: newAccuracy,
            maxCombo: newMaxCombo,
            requiredAccuracy: 0.8,
            requiredCombo: 3,
          });
        }

        awardedXP = xpAward;

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
            } as StageResult,
          },
        };

        // Sync to Firestore (fire-and-forget)
        if (user) {
          const materialDoc = doc(db, "users", user.uid, "materials", materialId);
          updateDoc(materialDoc, {
            stagesCompleted: updatedMat.stagesCompleted,
            stars: updatedMat.stars,
            xpEarned: updatedMat.xpEarned,
            stageResults: updatedMat.stageResults,
          }).catch((err) =>
            console.warn("Firestore update failed:", err)
          );
        }

        return {
          totalXP: Math.max(0, prev.totalXP + xpAward), // Don't go below 0
          totalStars: unlocked ? prev.totalStars + 1 : prev.totalStars,
          materials: {
            ...prev.materials,
            [materialId]: updatedMat,
          },
          streakData: prev.streakData, // Preserve streak data
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

  return (
    <ProgressContext.Provider value={{ state, registerMaterial, completeStage, canUnlockStage, checkAndApplyStreak, getXPMultiplier }}>
      {children}
    </ProgressContext.Provider>
  );
}

export function useProgress() {
  return useContext(ProgressContext);
}
