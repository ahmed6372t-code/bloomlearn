// lib/engagement.ts
// Hyper-Engagement Learning Loop Engine
// Kahoot (speed/combo) + Prodigy (jackpot/RPG) + Plant (taxonomy)

import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

// ─── Combo Meter ───────────────────────────────────────
// Speed-based combo that rewards fast correct answers

const COMBO_MULTIPLIERS = [1, 1.2, 1.5, 2, 2.5, 3]; // combo 0-5
const MAX_COMBO = 5;

export function getComboMultiplier(combo: number): number {
  return COMBO_MULTIPLIERS[Math.min(combo, MAX_COMBO)] ?? 1;
}

export function updateCombo(
  currentCombo: number,
  wasCorrect: boolean,
  responseTimeMs: number
): number {
  if (!wasCorrect) return 0; // reset on wrong
  if (responseTimeMs < 2000) return Math.min(currentCombo + 2, MAX_COMBO);
  if (responseTimeMs < 5000) return Math.min(currentCombo + 1, MAX_COMBO);
  return Math.max(currentCombo - 1, 0); // slow = decay
}

// ─── Hype Text Engine ──────────────────────────────────
// Dynamic feedback that replaces boring "Correct!" / "Wrong!"

const PRAISE = [
  "Unstoppable!",
  "Botanical Genius!",
  "Out-thinking the textbook!",
  "Memory like a root system!",
  "Your garden THRIVES!",
  "Absolute Pro!",
  "Knowledge is blooming!",
  "Deep soil knowledge!",
  "Photosynthesis-level brain!",
  "Seeds of wisdom!",
];

const FAIL_QUIPS = [
  "Almost had it!",
  "That seed needs more sun...",
  "Roots need deeper soil!",
  "Keep digging!",
  "Shake it off, replant!",
  "Even great gardeners miss!",
];

const COMBO_MILESTONES: Record<number, string> = {
  3: "ON FIRE!",
  4: "BLAZING!",
  5: "LEGENDARY!",
};

export interface HypeText {
  text: string;
  color: string;
  size: number;
}

export function getHypeText(combo: number, wasCorrect: boolean): HypeText {
  if (!wasCorrect) {
    return {
      text: FAIL_QUIPS[Math.floor(Math.random() * FAIL_QUIPS.length)],
      color: "#E57373",
      size: 16,
    };
  }

  // Check for combo milestone first
  if (COMBO_MILESTONES[combo]) {
    return {
      text: COMBO_MILESTONES[combo],
      color: "#FF9800",
      size: 22,
    };
  }

  return {
    text: PRAISE[Math.floor(Math.random() * PRAISE.length)],
    color: "#7DB58D",
    size: 17,
  };
}

// ─── Jackpot Loot (Golden Seeds) ───────────────────────
// 5% chance on correct answer = 5x XP multiplier

export interface GoldenSeedRoll {
  isGolden: boolean;
  multiplier: number;
}

export function rollForGoldenSeed(isFrenzy: boolean = false): GoldenSeedRoll {
  const chance = isFrenzy ? 0.1 : 0.05; // 10% in frenzy, 5% normal
  const isGolden = Math.random() < chance;
  return { isGolden, multiplier: isGolden ? 5 : 1 };
}

// ─── Curiosity Gap / Memory Anchors ────────────────────

const CURIOSITY_HOOKS = [
  "99% of people forget this in 24 hours — you just locked it in!",
  "Pro-tip: Visualize this as a giant tree to boost retention 65%!",
  "Say this fact out loud — it boosts recall by 50%.",
  "Your brain just formed a new neural pathway. One more rep locks it in!",
  "Spaced repetition is how memory champions train. You're doing it now!",
  "Top learners review missed items within 10 minutes. Keep going!",
  "Connecting this to a personal memory doubles your retention.",
  "You're in the top tier of active learners right now!",
];

const RETENTION_TRICKS = [
  "Memory Anchor: Try teaching this procedure to someone — it triples retention!",
  "Retention Trick: Write these steps on paper tonight. Handwriting beats typing for memory.",
  "Pro Move: Close your eyes and replay the steps mentally. Visualization = 2x retention.",
];

export function shouldShowCuriosityHook(consecutiveCorrect: number): boolean {
  return consecutiveCorrect > 0 && consecutiveCorrect % 3 === 0;
}

export function getRandomHook(): string {
  return CURIOSITY_HOOKS[Math.floor(Math.random() * CURIOSITY_HOOKS.length)];
}

export function getRetentionTrick(): string {
  return RETENTION_TRICKS[Math.floor(Math.random() * RETENTION_TRICKS.length)];
}

// ─── Haptic Feedback ───────────────────────────────────

export async function triggerHaptic(
  type: "success" | "error" | "tap" | "golden" | "frenzy"
): Promise<void> {
  if (Platform.OS === "web") return; // no haptics on web
  try {
    switch (type) {
      case "success":
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        break;
      case "error":
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        break;
      case "tap":
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        break;
      case "golden":
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        break;
      case "frenzy":
        // Intense burst: rapid-fire heavy impacts for maximum feedback
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        await new Promise((resolve) => setTimeout(resolve, 50));
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        await new Promise((resolve) => setTimeout(resolve, 50));
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        break;
    }
  } catch {
    // Haptics not available — silently ignore
  }
}

// ─── Fast-Finish Bonus ─────────────────────────────────

export function calculateFastFinishBonus(
  elapsedSeconds: number,
  targetSeconds: number
): number {
  return elapsedSeconds < targetSeconds ? 0.2 : 0;
}

// ─── Score Calculator ──────────────────────────────────
// Combines base accuracy + combo bonus + fast-finish + golden seeds

export function calculateFinalAccuracy(
  baseAccuracy: number,
  avgComboMultiplier: number,
  fastFinishBonus: number
): number {
  const boosted = baseAccuracy * avgComboMultiplier + fastFinishBonus;
  return Math.min(1, Math.max(0, boosted));
}
