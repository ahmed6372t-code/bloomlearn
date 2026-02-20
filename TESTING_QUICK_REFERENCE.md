# 🧪 BloomLearn E2E Testing Quick Reference

## 🚀 Quick Start Test (5 min)

**Goal:** Verify app boots and core features render

```
1. Fresh app launch
   ✓ Sunlight Tracker visible (🌞 badge on Home)
   ✓ Visual Garden shows 🏜️ (Level 0, if new user)
   ✓ Stage 1 unlocked, Stage 2 & 3 locked

2. Play Stage 1 (Remember) - 2 min
   ✓ Study phase: 20s countdown to memorize cards
   ✓ Challenge phase: Answer 10 questions correctly
   ✓ Get x5 combo → See "FRENZY!" pulsing text

3. Return to Home
   ✓ XP increased
   ✓ Stage 2 now unlocked (if passed mastery gate)
```

---

## 🎮 Full Test Sequence (30 min)

### Session 1: Bootstrap + Stage 1
```
Time: 10 min

□ Login/Auth working
□ Home screen loads without errors
□ Sunlight badge displays
□ Level emoji correct (🏜️ for Level 0)
□ Stage 1 unlocked, others locked

□ Enter Stage 1
□ Study for 20s
□ Challenge: Try to get x5 combo
□ Verify FRENZY! overlay appears when combo ≥ 5
□ Pass gate (≥80% accuracy + x3 combo)
□ Celebration screen shows XP award
```

### Session 2: Stage 2 + Unlock Stage 3
```
Time: 10 min

□ Return to Home
□ Verify Stage 2 now unlocked
□ Enter Stage 2 (Understand)
□ Get x5 combo → Verify FRENZY! appears here too
□ Pass mastery gate
□ Return to Home
□ Verify Stage 3 unlocked
□ Check plant emoji upgraded (if XP crossed 200)
```

### Session 3: Stage 3 + Wilting Test
```
Time: 10 min

□ Enter Stage 3
□ Verify "🕐 Take Your Time" badge visible
□ Verify NO timer countdown visible
□ Complete a procedure correctly
□ Get x4+ combo, then tap wrong step
   - Lose 1 life (not 2)
   - Combo resets
   - See error haptic
□ Pass mastery gate

□ [DEV] Modify lastPlayedTimestamp for Stage 1 → 10 days ago
□ Return to Home
□ Stage 1 should show: 🥀, red border, "Needs Watering!"
□ Replay Stage 1
□ Verify restored to 🌾, green border
```

---

## 🧮 Streak Multiplier Quick Check

| Day | Streak | Multiplier | XP Award* |
|-----|--------|-----------|----------|
| 1   | 1-Day  | 1.0x      | 10 XP    |
| 2   | 2-Day  | 1.0x      | 10 XP    |
| 3   | 3-Day  | 1.5x      | 15 XP    |
| 7   | 7-Day  | 2.0x      | 20 XP    |
| 14+ | 14-Day | 3.0x      | 30 XP    |

*Assumes Stage 1 Remember base = 10 XP with 100% accuracy

---

## 🔴 Critical Test Fails (Stop & Fix)

If ANY of these fail, blockers for Phase 3 completion:

```
□ App crashes on launch → Check ProgressContext.tsx initialization
□ Home screen crashes → Check state.streakData initialization
□ Stage 2 doesn't unlock after Stage 1 → Check mastery gate logic
□ XP multiplier not applied → Check getStreakMultiplier() in completeStage()
□ Wilting shows wrong emoji → Check calculateFreshness timestamps
```

---

## 🟢 Nice-to-Have Verifications

```
□ FRENZY! text has text shadow
□ Plant emoji progression smooth (🏜️ → 🌱 → 🌿)
□ Golden seed animations appear
□ Curiosity hook modals show hints
□ Retention tricks display on Stage 3 completion
□ Anti-cheat logs appear in console on speedrun
```

---

## 📝 Testing Checklist Config

### Environment Setup
```
• Device: Physical phone or emulator
• Storage: Cleared (or fresh install)
• Network: Connected (for Firestore sync)
• Timezone: System default OK
• Dev Tools: Expo DevTools optional
```

### Required Checks
```
✓ No TypeScript errors
✓ No runtime crashes
✓ No console errors (warnings OK)
✓ Haptics work (if physical device)
✓ All stage gates function
✓ XP calculations correct
```

---

## 🛠️ Dev Hacks for Testing

### Set Specific Streak Day
```typescript
// In ProgressContext.tsx, temporarily:
const today = "2026-02-25"; // Change for different days
```

### Simulate Old lastPlayedTimestamp
```typescript
// In Firestore Console or AsyncStorage editor:
"lastPlayedTimestamp": 1708000000000 // 10 days ago
```

### Check Actual XP Values
```typescript
// Add to home.tsx render:
console.log("XP:", state.totalXP, "Streak:", state.streakData.currentStreak);
```

---

## 📊 Test Results Template

```
Test Session: ___________
Date: ___________
Tester: ___________

Stage 1 (Remember): [PASS] [FAIL] [BLOCKED]
  - Frenzy overlay: [YES] [NO]
  - Xp multiplier applied: [YES] [NO]
  - Gate enforcement: [YES] [NO]

Stage 2 (Understand): [PASS] [FAIL] [BLOCKED]
  - Frenzy overlay: [YES] [NO] [BROKEN]
  - Classification works: [YES] [NO]
  - Gate enforcement: [YES] [NO]

Stage 3 (Apply): [PASS] [FAIL] [BLOCKED]
  - "Take Your Time" badge: [VISIBLE] [MISSING]
  - No timer: [CORRECT] [SHOWS TIMER]
  - Life penalty: [1 LIFE] [2 LIVES]

Streak System: [PASS] [FAIL] [BLOCKED]
  - Multiplier Day 3: [1.5x] [INCORRECT]
  - Multiplier Day 7: [2x] [INCORRECT]
  - Reset on gap: [WORKS] [BROKEN]

Wilting: [PASS] [FAIL] [BLOCKED]
  - 10 days: [🥀 + RED] [INCORRECT]
  - Restored: [🌾 + GREEN] [INCORRECT]

Issues Found:
1. ___________
2. ___________
3. ___________

Sign-Off: [ ] All critical items passing
```

---

**Last Updated:** February 19, 2026  
**Version:** Quick Reference v1.0
