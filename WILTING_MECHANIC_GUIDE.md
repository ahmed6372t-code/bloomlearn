# Wilting Mechanic (Spaced Repetition) - Implementation Guide

## Overview

The Wilting Mechanic is a **spaced repetition system** that ensures long-term knowledge retention by visually tracking when learned material needs review. Mastered stages gradually "wilt" over time, encouraging players to replay and refresh their knowledge before it fully deteriorates.

**Philosophy:** Knowledge decays without reinforcement. The visual garden metaphor represents this decay and provides urgency to review material.

---

## Implementation Summary

### Files Modified
1. **context/ProgressContext.tsx**
   - Added `lastPlayedTimestamp` to `StageResult` interface
   - Created `calculateFreshness()` helper function (exported)
   - Updated `completeStage()` to set `lastPlayedTimestamp` on successful completion

2. **app/(tabs)/home.tsx**
   - Imported `calculateFreshness` from ProgressContext
   - Added `freshness` prop to `StageCardProps`
   - Updated `StageCard` component rendering logic with wilting visuals
   - Added 5 new stylesheet entries for wilting states
   - Updated all three stage card renders to calculate and pass freshness

---

## Code Changes Detailed

### 1. ProgressContext.tsx - Type Updates

```tsx
// Added to StageResult interface
export interface StageResult {
  accuracy: number;
  maxCombo: number;
  attempts: number;
  timestamp: number;
  lastPlayedTimestamp?: number; // NEW: tracks last successful completion time
}
```

### 2. ProgressContext.tsx - Freshness Calculator

```tsx
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
```

**Logic Breakdown:**
- **Days 0-2:** Knowledge is fresh, full recall ability
- **Days 3-6:** Knowledge showing decay, needs attention soon
- **Days 7-13:** Knowledge significantly faded, urgent review recommended
- **Days 14+:** Knowledge essentially lost, reset to first principles

### 3. ProgressContext.tsx - State Update in completeStage()

```tsx
stageResults: {
  ...stageResults,
  [stageKey]: {
    accuracy: newAccuracy,
    maxCombo: newMaxCombo,
    attempts: newAttempts,
    timestamp: Date.now(),
    lastPlayedTimestamp: unlocked ? Date.now() : (currentStageRes.lastPlayedTimestamp || Date.now()),
  } as StageResult,
}
```

**When Updated:**
- `unlocked = true` (stage just completed): `lastPlayedTimestamp = Date.now()`
- `unlocked = false` (stage failed): Keep existing `lastPlayedTimestamp`
- Never set before: Initialize to `Date.now()`

---

## Visual Design

### Freshness States & Styling

| Freshness | Days | Card Color | Border | Emoji | Badge | Opacity | CTA Text |
|-----------|------|-----------|--------|-------|-------|---------|----------|
| **100%** | 0-2 | `#F1F8F5` | `#7DB58D` (green) | Original | ✓ | 1.0 | Stats shown |
| **75%** | 3-6 | `#FFF9E6` | `#FFD54F` (gold) | Original | 📉 | 1.0 | "Fading (review soon)" |
| **50%** | 7-13 | `#FFF3E0` | `#FFB74D` (orange) | Original | ⚠️ | 0.85 | "Knowledge wilting" |
| **0%** | 14+ | `#FFEBEE` | `#EF5350` (red) | 🥀 (wilted) | "Needs Watering!" | 0.75 | "Tap to Replay →" |

### Component Behavior

```
Completed Stage → Fresh (100%)
    ↓
    [2 days pass]
    ↓
Still Fresh (100%) → Stats: "92% Accuracy · x5 Combo" ✓
    ↓
    [3-4 more days]
    ↓
Drooping (75%) → Gold border, "📉 Fading (review soon)"
    ↓
    [1 more week]
    ↓
Wilting (50%) → Orange border, Slightly opaque, "⚠️ Knowledge wilting"
    ↓
    [1 more week]
    ↓
Fully Wilted (0%) → Red border, 🥀 emoji, Red badge: "Needs Watering! Replay to restore"
    ↓
Player Replays → Resets to Fresh (100%)
```

---

## Player Experience Timeline

### Scenario: Review Schedule over 15 days

**Day 0:** Completes "The Seed Library" stage
```
✓ The Seed Library
92% Accuracy · x5 Combo
Fresh / Green border
```

**Day 3:** Opens app, checks garden
```
📉 The Seed Library
92% Accuracy · x5 Combo
Drooping / Gold border + warning "Fading (review soon)"
```
→ *Player thinks: "Better not forget this, let me review"*

**Day 8:** Still hasn't reviewed
```
⚠️ The Seed Library (semi-transparent, orange border)
Knowledge wilting
```
→ *Player thinks: "Oh no, I need to review this before it's gone!"*

**Day 15:** Still hasn't reviewed
```
🥀 The Seed Library (faded, red border)
Needs Watering!
Replay to restore
```
→ *Clear urgency - knowledge is lost*

**Day 15 @ 3pm:** Player replays stage
```
✓ The Seed Library
87% Accuracy · x4 Combo (slightly lower since it's been long)
Fresh / Green border
```
→ *Knowledge restored, cycle resets*

---

## Home Screen Integration

### Updated StageCard Props

```tsx
interface StageCardProps {
  stageName: "remember" | "understand" | "apply";
  stageLabel: string;
  stageEmoji: string;
  isCompleted: boolean;
  isLocked: boolean;
  hasFailedAttempt: boolean;
  accuracy?: number;
  maxCombo?: number;
  freshness?: number; // NEW: 0-100 percentage
  onPress: () => void;
}
```

### Stage Card Rendering Logic

For each material's three stages:
```tsx
<StageCard
  stageName="remember"
  // ... other props ...
  freshness={calculateFreshness(material.stageResults?.remember?.lastPlayedTimestamp)}
  // ...
/>
```

The component internally determines state:
```tsx
const isFullyWilted = isCompleted && freshness === 0;
const isWilting = isCompleted && freshness <= 50 && freshness > 0;
const isDrooping = isCompleted && freshness === 75;
```

Then applies appropriate styling:
```tsx
style={[
  s.stageCard,
  isCompleted && !isFullyWilted && s.stageCardCompleted,
  isFullyWilted && s.stageCardWilted,        // Red, wilted styling
  isWilting && s.stageCardWilting,           // Orange, urgent styling
  isDrooping && s.stageCardDrooping,         // Gold, gentle warning
  // ...
]}
```

---

## Educational Psychology

### Why This Works

1. **Spacing Effect:** Reviews at increasing intervals enhance long-term retention (proven by cognitive science)

2. **Visual Urgency:** Garden metaphor makes abstract concept concrete
   - Fresh plant = healthy memory
   - Drooping plant = attention needed
   - Wilted plant = failure imminent

3. **Reduced Cognitive Load:** Players don't need to remember "when to review" — the system shows them visually

4. **Progressive Degradation:** 4 levels (Fresh → Drooping → Wilting → Wilted) provide clear action cues at each stage

5. **Replayability:** Encourages repeated engagement with same content (not new content only)

### Suggested Review Schedule

Based on scientific spacing research (e.g., Ebbinghaus):
```
Day 0:   Initial learning (Remember, Understand, Apply stages)
Day 1-2: First review (stay Fresh)
Day 3-6: Second review (before Drooping becomes urgent)
Day 7-13: Third review (before Wilting occurs)
Day 14+: Major review needed (Wilted state triggers action)
```

---

## Data Persistence

### What Gets Stored

In Firestore `materials/{materialId}/stageResults`:
```json
{
  "remember": {
    "accuracy": 0.92,
    "maxCombo": 5,
    "attempts": 3,
    "timestamp": 1708300000000,
    "lastPlayedTimestamp": 1708300000000
  },
  "understand": {
    "accuracy": 0.85,
    "maxCombo": 4,
    "attempts": 2,
    "timestamp": 1708390000000,
    "lastPlayedTimestamp": 1708390000000
  },
  "apply": null
}
```

### When Updated

`lastPlayedTimestamp` is updated **only when**:
- `completeStage()` is called with `accuracy >= 80% AND maxCombo >= 3`
- (i.e., when the stage is successfully mastered and unlocked)

Failed attempts **do not** reset the timestamp, preserving the original "last success" time.

---

## Testing Checklist

### Initial Setup
- [ ] Restart app after deploying
- [ ] Load a user with existing completed stages
- [ ] Verify `lastPlayedTimestamp` exists in Firestore for completed stages
- [ ] Verify `calculateFreshness` is exported from ProgressContext

### Freshness Calculation (Offline Testing)
- [ ] Mock timestamps to test each freshness level
- [ ] Verify 100% returns fresh green state
- [ ] Verify 75% returns drooping gold state (days 3-6)
- [ ] Verify 50% returns wilting orange state (days 7-13)
- [ ] Verify 0% returns wilted red state (14+ days)

### Home Screen Display
- [ ] Fresh stage shows green checkmark + stats
- [ ] Drooping stage shows gold border + "📉 Fading (review soon)"
- [ ] Wilting stage shows orange border + "⚠️ Knowledge wilting" (lower opacity)
- [ ] Wilted stage shows 🥀 emoji + red badge "Needs Watering!" + "Tap to Replay →"

### Interaction
- [ ] Tapping wilted stage navigates to game (Remember, Understand, or Apply)
- [ ] Completing stage during wilt period refreshes `lastPlayedTimestamp`
- [ ] Card immediately updates to Fresh on next app refresh

### Edge Cases
- [ ] New stages (never played) show as Fresh (100%)
- [ ] Completed apply.tsx stage also tracks freshness correctly
- [ ] Locked stages don't show freshness badges
- [ ] Failed attempts don't update `lastPlayedTimestamp`

---

## Configuration & Tuning

### Adjusting Time Intervals

Edit `calculateFreshness()` in ProgressContext.tsx:

```tsx
// Current thresholds (in days):
if (elapsedDays <= 2) return 100;  // ← Change here for "Fresh" window
if (elapsedDays <= 6) return 75;   // ← Change here for "Drooping" window
if (elapsedDays <= 13) return 50;  // ← Change here for "Wilting" window
return 0;                          // ← 14+ days = Fully Wilted
```

**Examples:**
- **Aggressive retention:** `<1, <3, <7` (daily, 3x/week, weekly reviews)
- **Relaxed retention:** `<3, <10, <21` (forgiving schedule)
- **Exam prep:** `<1, <2, <7` (daily reviews before test week)

### Adjusting Colors

Edit StyleSheet in home.tsx:

```tsx
stageCardDrooping: {
  backgroundColor: "#FFF9E6",  // ← Drooping background
  borderColor: "#FFD54F",      // ← Drooping border
}
stageCardWilting: {
  backgroundColor: "#FFF3E0",  // ← Wilting background
  borderColor: "#FFB74D",      // ← Wilting border
  opacity: 0.85,               // ← Make slightly transparent
}
stageCardWilted: {
  backgroundColor: "#FFEBEE",  // ← Wilted background
  borderColor: "#EF5350",      // ← Wilted border
  opacity: 0.75,               // ← More transparent
}
```

---

## Future Enhancements

### Phase 3+ Ideas

1. **Spaced Repetition Algorithm**
   - Implement SM-2 or Leitner system for optimal review scheduling
   - Show "recommended review date" on wilted cards

2. **Batch Review Mode**
   - "Review Dashboard" showing all wilted stages grouped by urgency
   - Fast-review option (no timer, just accuracy check)

3. **Notifications**
   - Push notification when stage enters "Wilting" state
   - "Daily digest" of stages needing watering

4. **Gamification**
   - "Preservation streak" — XP bonus for keeping all stages fresh
   - "Garden health" score (% of plants fresh)
   - "Botanist" achievement for 100% garden freshness

5. **Analytics**
   - Optimal review timing for each user
   - Predict when user will forget stage based on historical data
   - Personalized reminder intervals

---

## Debugging & Troubleshooting

### Freshness Not Updating
1. Check Firestore shows `lastPlayedTimestamp` is being set
2. Verify `calculateFreshness()` is imported in home.tsx
3. Check browser console for `calculateFreshness` errors
4. Confirm stage was actually marked as completed (not just attempted)

### Wrong Wilting State Showing
1. Manually calculate expected freshness: `(now - lastPlayedTimestamp) / (1000*60*60*24)`
2. Compare to thresholds in `calculateFreshness()`
3. Check for timezone issues (use UTC for timestamp)

### Visual Styling Incorrect
1. Verify StyleSheet entry matches state condition
2. Check `isFullyWilted`, `isWilting`, `isDrooping` computed correctly
3. Test with mock timestamp values in browser devtools

---

## Summary

| Component | Changes | Impact |
|-----------|---------|--------|
| **ProgressContext.tsx** | +1 Optional field, +1 exported function, +1 line in completeStage | ~25 lines added |
| **home.tsx** | +1 prop, +1 import, +5 styles, ~15 conditional renders | ~60 lines added |
| **Total** | Low-risk, high-impact feature | ~85 lines total |

**Result:** Complete spaced repetition system with zero breaking changes, backward compatible with existing user data, and immediately visible visual feedback to drive engagement.

