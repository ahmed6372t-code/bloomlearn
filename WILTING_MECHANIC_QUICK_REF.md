# Wilting Mechanic - Quick Reference

## What Was Added

### 1. ProgressContext.tsx

**Location:** Lines 27-31 (StageResult interface)
```tsx
export interface StageResult {
  accuracy: number;
  maxCombo: number;
  attempts: number;
  timestamp: number;
  lastPlayedTimestamp?: number; // NEW: timestamp of last successful completion
}
```

**Location:** Lines 87-104 (exported helper function)
```tsx
export function calculateFreshness(lastPlayedTimestamp?: number): number {
  if (!lastPlayedTimestamp) return 100;
  const now = Date.now();
  const elapsedMs = now - lastPlayedTimestamp;
  const elapsedDays = elapsedMs / (1000 * 60 * 60 * 24);
  
  if (elapsedDays <= 2) return 100;
  if (elapsedDays <= 6) return 75;
  if (elapsedDays <= 13) return 50;
  return 0;
}
```

**Location:** Line 381 (in completeStage() stageResults assignment)
```tsx
lastPlayedTimestamp: unlocked ? Date.now() : (currentStageRes.lastPlayedTimestamp || Date.now()),
```

### 2. home.tsx

**Import at top:**
```tsx
import { useProgress, calculateFreshness } from "../context/ProgressContext";
```

**StageCardProps interface:**
```tsx
freshness?: number; // NEW: 0-100 percentage from calculateFreshness()
```

**StageCard component logic:**
```tsx
const isFullyWilted = isCompleted && freshness === 0;
const isWilting = isCompleted && freshness <= 50 && freshness > 0;
const isDrooping = isCompleted && freshness === 75;
```

**Each stage card rendering now includes:**
```tsx
freshness={calculateFreshness(material.stageResults?.remember?.lastPlayedTimestamp)}
```

**New StyleSheet entries:**
- `stageCardDrooping` (gold border, light yellow)
- `stageCardWilting` (orange border, lower opacity)
- `stageCardWilted` (red border, wilted emoji, urgent badge)
- `wiltedBadge`, `wiltedBadgeText`, `wiltedBadgeSubtext`
- `wiltingWarning`, `droopingWarning`, `wiltedWarning`, `replayText`

---

## Freshness Scale

```
Freshness % | Days Elapsed | Visual State | Emoji | Badge | Urgency
───────────────────────────────────────────────────────────────────
    100%    | 0-2 days     | Fresh        | 🌾    | ✓     | None
     75%    | 3-6 days     | Drooping     | 🌾    | 📉    | Gentle
     50%    | 7-13 days    | Wilting      | 🌾    | ⚠️    | High
      0%    | 14+ days     | Wilted       | 🥀    | ⚠️    | URGENT
```

---

## Gameplay Impact

### For Players

**Fresh stages (0-2 days):**
- Shows green checkmark ✓
- Display stats: "92% Accuracy · x5 Combo"
- No action needed

**Drooping stages (3-6 days):**
- Gold border appears
- Shows "📉 Fading (review soon)"
- Subtle reminder to review

**Wilting stages (7-13 days):**
- Orange border, lower opacity (0.85)
- Shows "⚠️ Knowledge wilting"
- Clear warning: knowledge is fading

**Wilted stages (14+ days):**
- Red border, very low opacity (0.75)
- Emoji changes to 🥀 (wilted flower)
- Red badge: "Needs Watering! Replay to restore"
- CTA: "Tap to Replay →"
- Critical urgency

### For Learning

- **Encourages spaced repetition** at optimal intervals
- **Prevents knowledge decay** by showing visual urgency
- **Increases replayability** of stages (not just one-shot)
- **Implements Ebbinghaus forgetting curve** in game design

---

## Key Behaviors

✅ **Fresh stage: Timestamp is < 2 days old**
- Keep green checkmark
- Show accuracy/combo stats
- Disable interaction (read-only review of performance)

✅ **Drooping stage: Timestamp is 3-6 days old**
- Switch to gold border
- Add "📉 Fading (review soon)" warning
- Button still clickable to replay

✅ **Wilting stage: Timestamp is 7-13 days old**
- Switch to orange border, opacity 0.85
- Add "⚠️ Knowledge wilting" warning
- Button clickable to replay

✅ **Wilted stage: Timestamp is 14+ days old**
- Switch to red border, opacity 0.75
- Replace emoji with 🥀
- Show red badge: "Needs Watering! Replay to restore"
- Change text to "Tap to Replay →"

✅ **Player replays a wilted stage:**
- On successful completion, `lastPlayedTimestamp = Date.now()`
- Card immediately refreshes to Fresh (100%)
- Cycle repeats

---

## Testing Examples

### Mock Scenario 1: Fresh Stage
```
lastPlayedTimestamp: Date.now() - (1 day in ms)
Expected freshness: 100%
Expected visual: Green ✓, stats shown
```

### Mock Scenario 2: Drooping Stage
```  
lastPlayedTimestamp: Date.now() - (4 days in ms)
Expected freshness: 75%
Expected visual: Gold border, "📉 Fading (review soon)"
```

### Mock Scenario 3: Wilting Stage
```
lastPlayedTimestamp: Date.now() - (10 days in ms)
Expected freshness: 50%
Expected visual: Orange border (opacity 0.85), "⚠️ Knowledge wilting"
```

### Mock Scenario 4: Fully Wilted Stage
```
lastPlayedTimestamp: Date.now() - (20 days in ms)
Expected freshness: 0%
Expected visual: Red border (opacity 0.75), 🥀 emoji, "Needs Watering! Replay to restore"
```

---

## Configuration

### Adjust Time Windows

In `calculateFreshness()`, modify:
```tsx
if (elapsedDays <= 2) return 100;  // Fresh window (was: 0-2 days)
if (elapsedDays <= 6) return 75;   // Drooping window (was: 3-6 days)
if (elapsedDays <= 13) return 50;  // Wilting window (was: 7-13 days)
return 0;                          // Fully wilted (was: 14+ days)
```

**Presets:**
- **Aggressive:** `<1, <3, <7` (daily reviews recommended)
- **Relaxed:** `<3, <10, <21` (weekly reviews)
- **Exam mode:** `<1, <2, <7` (cramming schedule)

---

## Backward Compatibility

✅ **Fully backward compatible**
- New field (`lastPlayedTimestamp`) is optional
- Existing stages without this field default to `100%` (Fresh)
- No data migration needed
- Works with existing Firestore documents

---

## Edge Cases Handled

| Scenario | Behavior |
|----------|----------|
| Never played stage | Freshness: 100% (Fresh) |
| Stage failed attempt (not completed) | `lastPlayedTimestamp` preserved, not updated |
| Stage just completed (unlocked) | `lastPlayedTimestamp = Date.now()` immediately |
| Replay a wilted stage successfully | `lastPlayedTimestamp` resets to `Date.now()` |
| Replay a wilted stage unsuccessfully | `lastPlayedTimestamp` unchanged |

---

## Deployment Checklist

- [ ] Update ProgressContext.tsx with calculateFreshness export
- [ ] Update StageResult interface with lastPlayedTimestamp field
- [ ] Update completeStage() to set lastPlayedTimestamp on success
- [ ] Import calculateFreshness in home.tsx
- [ ] Add freshness prop to StageCardProps interface
- [ ] Update StageCard component with wilting logic
- [ ] Add all 5 new StyleSheet entries for wilting states
- [ ] Update each of 3 stage card renders to pass freshness prop
- [ ] Test with mock timestamps (days 1, 4, 10, 20)
- [ ] Verify wilted stage shows correct visual feedback
- [ ] Deploy and monitor Firestore updates
- [ ] Confirm backward compatibility with existing users

---

## Common Questions

**Q: Does replaying a stage multiple times reset the timer?**
A: No, only when the stage is successfully completed (unlocked). Failed replays don't update the timer.

**Q: What if a user hoards Xp and never reviews?**
A: They'll see wilted plants accumulate. Eventually the visual pressure becomes undeniable, driving review behavior.

**Q: Can stages wilt while user is offline?**
A: Yes! Freshness is calculated client-side based on stored `lastPlayedTimestamp`, so wilting happens regardless of app usage.

**Q: How do newbie accounts avoid early wilting?**
A: New stages default to `lastPlayedTimestamp = undefined`, which returns `freshness = 100%` (fresh). Only active, completed stages wilt.

**Q: Can I see wilting in real-time during testing?**
A: Yes, use browser DevTools console to temporarily modify `lastPlayedTimestamp` or mock `calculateFreshness()` with test values.

