# BloomLearn Enhancement Implementation Plan

**Created**: February 19, 2026  
**Status**: Planning Phase  
**Priority**: Phased rollout (Quick Wins → Medium → Long-term)

---

## Overview

This document outlines the strategic improvements to enforce strict learning rules while maximizing engagement and fixing current app issues.

### Three Pillars

1. **Strict Learning Rules** (Mastery Gating, Wilting, Penalties)
2. **Gamification & Delight** (Garden Evolution, Frenzy Mode, Daily Streaks)
3. **App Stability & Anti-Cheat** (Timestamp validation, Timer clarity)

---

## Phase 1: Quick Wins (1-2 hours) 🚀

### 1.1 Remove Timer Anxiety from Apply Stage
**File**: `app/games/apply.tsx`  
**Change**: Hide timer UI, add "Take Your Time" badge  
**Impact**: Reduces speed-rushing anxiety carryover from kahoot-style stages  
**Effort**: 15 minutes

**What to change**:
- Remove the GAME_SECONDS timer display from UI top bar
- Add a permanent badge: "🕐 Take Your Time — Deliberate Execution"
- Keep no actual timer (already correct)

**Code Location**: Lines ~130 (stats bar)

---

### 1.2 Timestamp Validation (Cheat Prevention)
**File**: `context/ProgressContext.tsx`  
**Change**: Add timestamp check in `completeStage()`  
**Impact**: Prevents impossible speedruns (e.g., 10 questions in 2 seconds)  
**Effort**: 30 minutes

**Logic**:
```typescript
const completeStage = (materialId, stageName, accuracy) => {
  const startTime = gameStartTime; // passed from game component
  const elapsedSeconds = (Date.now() - startTime) / 1000;
  
  // Minimum rules (example for remember.tsx):
  // - 10 questions = min 60s (6s per question)
  // - If elapsed < minRequired, flag as suspicious
  // - Still award XP but log for review
  
  if (elapsedSeconds < minPhysicallyPossible) {
    console.warn('[CHEAT FLAG]', {materialId, stageName, elapsedSeconds, minRequired});
  }
  
  // ... continue normal award logic
};
```

**Required**: Games must pass `gameStartTime` to context calls

**Files to update**:
- `app/games/remember.tsx` - pass gameStartTime to completeStage()
- `app/games/understand.tsx` - same
- `app/games/apply.tsx` - same

---

### 1.3 Metro Cache Command in package.json
**File**: `package.json`  
**Change**: Add npm script for safe start  
**Impact**: Prevents bundler crashes  
**Effort**: 5 minutes

```json
"scripts": {
  "start": "expo start",
  "start:clear": "expo start -c",  // <-- NEW
  "android": "expo start --android",
  "ios": "expo start --ios",
  "web": "expo start --web"
}
```

Then use: `npm run start:clear` instead of `npx expo start --clear`

---

## Phase 2: Medium Effort (2-4 hours) 🎯

### 2.1 Mastery Gating (Stage Unlock Requirements)
**Files**: `context/ProgressContext.tsx`, `app/(tabs)/index.tsx`  
**Requirements**:
- Stage 2 unlock: Stage 1 accuracy ≥ 80% AND max combo ≥ x3
- Stage 3 unlock: Stage 2 accuracy ≥ 80% AND max combo ≥ x3
- If fail unlock check: Lose "Water Drop" (XP penalty), mandatory 30s study, retry

**New Context Function**:
```typescript
canUnlockStage(materialId: string, nextStageName: string) → boolean
{
  const material = state.materials[materialId];
  const prevStage = getPreviousStage(nextStageName); // remember→understand→apply
  const prevResult = material.stageResults[prevStage];
  
  return prevResult?.accuracy >= 0.80 && prevResult?.maxCombo >= 3;
}
```

**New Data Structure** (add to Material):
```typescript
stageResults: {
  remember: { accuracy: 0.95, maxCombo: 5, attempts: 2, timestamp: 1687... },
  understand: { accuracy: 0.82, maxCombo: 3, attempts: 1, timestamp: 1687... },
  apply: null // not yet unlocked
}
```

**UI Change** (Home screen):
- Show locked stages with "Master Stage 1 (80% accuracy + x3 combo)"
- Show attempt count
- Show "Retry Stage" button with -5 XP penalty message

**Effort**: 2-3 hours

---

### 2.2 Combo Breaker Time Penalties
**File**: `app/games/remember.tsx`, `app/games/understand.tsx`, `app/games/apply.tsx`  
**Change**: Wrong answer at high combo = -5 seconds  
**Impact**: Forces deliberation, punishes mental slips at high streaks  
**Effort**: 1 hour

**Logic in games**:
```typescript
const handleWrongAnswer = (combo: number) => {
  if (combo >= 4) { // x4 or x5 combo
    setTimeRemaining(prev => Math.max(0, prev - 5000)); // -5 seconds
    triggerHaptic("error");
    showTimeWarning(); // Flash timer in red
  }
  setCombo(0);
};
```

**UI**:
- When penalty applies, show red flash on timer: "⚠️ -5s"
- Haptic feedback type: "error" (medium pattern)

**Effort**: 45 minutes (implementation + testing)

---

### 2.3 Visual Garden Evolution (Home Screen)
**File**: `app/(tabs)/index.tsx`  
**What**: Map user level to plant SVG growth stages  
**Change**: Replace text-based level with visual plant  
**Impact**: Psychological reward, visible progress  

**Mapping**:
```
Level 0: Dirt / Barren 🏜️
Level 1: Sprout (tiny green line)
Level 5: Seedling (small plant)
Level 10: Sapling (medium plant)
Level 15: Blooming (flowers)
Level 20: Mature Tree (full garden)
```

**Implementation**:
- Create `components/PlantGrowth.tsx` with SVG assets (or use emoji)
- Read `level` from ProgressContext
- Render appropriate SVG with smooth transition animation
- Below plant: Level badge + XP progress bar to next level

**Effort**: 1-2 hours (design + animation)

---

## Phase 3: Long-term Features (4+ hours) 📈

### 3.1 Wilting Mechanic (Spaced Repetition)
**Files**: `context/ProgressContext.tsx`, game screens  
**What**: Knowledge decays; plants wilt if not reviewed  
**Logic**:
- Track last-played timestamp for each material
- Calculate "freshness" (0-100%) based on days since last play:
  - 0 days: 100% (full health)
  - 3 days: 75%
  - 7 days: 50%
  - 14 days: 0% (fully wilted)
- Show wilting visual on home screen (fading plant)
- Req:Play remember.tsx or understand.tsx to restore

**Data**:
```typescript
Material {
  ...
  lastPlayedStages: {
    remember: timestamp,
    understand: timestamp,
    apply: timestamp
  };
  freshness: 0-1; // computed based on longest untouched stage
}
```

**Effort**: 3-4 hours

---

### 3.2 Frenzy Mode (x5 Combo Peak Experience)
**Files**: All game files (`remember.tsx`, `understand.tsx`, `apply.tsx`)  
**What**: When combo hits x5, trigger visual/haptic rush  
**Changes**:
- Invert screen colors slightly (overlay tint -10% brightness)
- Double golden seed spawn rate: 10% instead of 5%
- Speed up any background animations by 1.5x
- Add screen shake on each correct answer
- Haptic: rapid burst pattern

**Implementation**:
```typescript
const [frenzyMode, setFrenzyMode] = useState(false);

useEffect(() => {
  if (combo >= 5) {
    setFrenzyMode(true);
    triggerHaptic("golden"); // intense burst
    // Screen effect
  } else {
    setFrenzyMode(false);
  }
}, [combo]);

// In render:
{frenzyMode && <Animated.View style={s.frenzyOverlay} />}
```

**Effort**: 1.5-2 hours

---

### 3.3 Daily Streaks (Sunlight System)
**Files**: `context/ProgressContext.tsx`, Home screen  
**What**: Daily login streak = permanent XP multiplier  
**Logic**:
- Track consecutive days user opens app
- Lose streak if 1 day skipped
- Multiplier: 1x (day 1) → 1.5x (day 3) → 2x (day 7) → 3x (day 14+)
- Display streak on home screen: "🌞 14-day Sunlight"

**Data**:
```typescript
User {
  ...
  streakLastDate: timestamp;
  currentStreak: number;
  streakMultiplier: 1 | 1.5 | 2 | 3;
  bestStreak: number;
}
```

**Integration**:
- Modify `calculateFinalXP()` to include `streakMultiplier`
- Check streak on app launch (if today != lastDate, reset)

**Effort**: 2-3 hours

---

### 3.4 Juicier Haptics & Hit-Stop Effects
**Files**: `lib/engagement.ts`, game files  
**What**: When golden seed triggers, freeze game frame 0.2s then continue  
**Implementation**:
```typescript
const triggerGoldenSeedEffect = async () => {
  // 1. Freeze game (pause animations, dim screen)
  setGamePaused(true);
  triggerHaptic("golden");
  
  // 2. Wait 0.2 seconds
  await sleep(200);
  
  // 3. Release (flash white, confetti, haptic burst)
  flashScreen();
  showConfetti();
  triggerHaptic("tap");
  setGamePaused(false);
};
```

**Effort**: 1 hour

---

## Implementation Order (Recommended)

### Week 1 (Quick Wins)
1. ✅ Remove timer anxiety (apply.tsx)
2. ✅ Timestamp validation (ProgressContext + games)
3. ✅ Metro cache script (package.json)

### Week 2 (Medium)
4. Mastery Gating (ProgressContext + home screen)
5. Combo Breaker penalties (all games)
6. Garden Evolution visualization (home screen)

### Week 3+ (Long-term)
7. Wilting mechanic (spaced repetition)
8. Frenzy mode (all games)
9. Daily streaks (context + home)
10. Juicier haptics (all games)

---

## File Change Summary

### Phase 1 Changes
| File | Change | LOC |
|------|--------|-----|
| `app/games/apply.tsx` | Remove timer UI, add "Take Your Time" badge | 5-10 |
| `context/ProgressContext.tsx` | Add gameStartTime param, validate in completeStage | 20-30 |
| `app/games/remember.tsx` | Pass gameStartTime to completeStage() | 3 |
| `app/games/understand.tsx` | Pass gameStartTime to completeStage() | 3 |
| `app/games/apply.tsx` | Pass gameStartTime to completeStage() | 3 |
| `package.json` | Add `start:clear` script | 1 |
| **Total** | | **50-60** |

### Phase 2 Changes
| Component | Files | LOC | Effort |
|-----------|-------|-----|--------|
| Mastery Gating | ProgressContext, home.tsx | 100-150 | 2-3h |
| Combo Penalties | 3 game files | 30-50 | 1h |
| Garden Evolution | PlantGrowth.tsx (new), home.tsx | 80-120 | 1-2h |
| **Total** | | **210-320** | **4-6h** |

---

## Success Metrics

### Learning Strictness
- ✅ 80% of players unlock Stage 2 on first attempt (vs. any completion)
- ✅ Average combo before unlock ≥ x3 (shows mastery)
- ✅ Timestamp validation catches ≥1 cheater per 1000 plays

### Engagement & Fun
- ✅ Players spend 2x time in Frenzy Mode (vs. normal play)
- ✅ 90% completion rate of daily challenges (from streak system)
- ✅ 50% improvement in returning user rate (from visual progress)

### App Stability
- ✅ Zero Metro bundler crashes after cache script adoption
- ✅ Zero "timer anxiety" complaints in apply.tsx (from clearer UX)

---

## Next Steps

1. Review this plan with design/product team
2. Prioritize based on timeline
3. Begin Phase 1 implementation immediately
4. Set up A/B testing for engagement features (Frenzy, Streaks, Wilting)
5. Create Firestore indexes for spaced repetition queries (if wilting goes live)

---

**Ready to implement Phase 1? Let's start! 🚀**
