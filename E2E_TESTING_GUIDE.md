# BloomLearn Phase 3 E2E Testing Guide

## ✅ Implementation Summary

### Currently Implemented Features:
- ✅ **Sunlight Tracker** - Daily streak tracking with XP multipliers (1-3x)
- ✅ **Frenzy Mode** - Pulsing "FRENZY!" overlay in Stage 1 (Remember)
- ✅ **Mastery Gates** - 80% accuracy + x3 combo requirement
- ✅ **Anti-Cheat Detection** - Console warnings for impossible speedruns
- ✅ **XP Multiplier** - Dynamic multiplier based on streak (3-14+ days)
- ✅ **Wilting Mechanic** - Stage freshness tracking (0-14+ days)
- ✅ **Take Your Time Badge** - Stage 3 shows 🕐 badge (no timer)
- ✅ **Plant Growth** - Visual Level progression (🏜️ → 🌱 → 🌿 → 🪴 → 🌸 → 🌳)

### Features to Verify/Complete:
- ⚠️ **Frenzy Overlay in Stage 2** - Needs to be added to understand.tsx
- ⚠️ **Combo Penalty in Stage 3** - Verify 2-life loss on wrong step with high combo

---

## 🧪 Complete Testing Checklist

### 1️⃣ App Launch & Sunlight System (Home Screen)

**Setup:** Fresh app install or cleared AsyncStorage

- [ ] **Sunlight Tracker Visibility**
  - Boot the app and navigate to Home Screen
  - Verify "🌞" appears on the stats card
  - For new users, verify streak shows "0" or "No streak"
  - **Expected:** Third stat box shows 🌞 emoji with streak number

- [ ] **Visual Garden Level Display**
  - For brand new user, verify emoji shows 🏜️ (Dirt, Level 0)
  - **Terminal check:** `state.totalXP` should be 0
  - **Expected:** "Level 0" text displayed below emoji

- [ ] **Stage Lock System**
  - Stage 1 (The Seed Library 🌾) → **UNLOCKED**
  - Stage 2 (The Greenhouse 🌿) → **LOCKED 🔒** with message "Master previous stage"
  - Stage 3 (The Potting Bench 🪴) → **LOCKED 🔒**
  - **Expected:** Locked stages appear faded (opacity: 0.7)

---

### 2️⃣ Playing Stage 1: The Seed Library (Remember)

**Setup:** Click Stage 1 from Home Screen

#### 2.1 Anti-Cheat Speedrun Test
- [ ] Deliberately rush through study phase and challenge phase
  - Skip to challenge immediately (don't wait 20s)
  - Answer questions in <15 seconds total
- [ ] **Terminal Check:** Look for `[CHEAT FLAG] Impossible speedrun` warning
  - Should log: `{ stageKey: 'remember', elapsedSeconds: X, minimumRequired: 60 }`
- [ ] **Expected:** XP still awarded but flagged for review

#### 2.2 Frenzy Mode Activation
- [ ] Get 3 consecutive correct answers → Combo reaches 3
- [ ] Continue to 5+ consecutive correct answers
  - **Visual:** Red "FRENZY!" text should pulse
  - **Positioning:** Centered, 45% from top
  - **Animation:** Smooth fade in/out (800ms cycle)
- [ ] Verify the pulsing continues as long as combo ≥ 5
- [ ] **Expected:** Text appears and disappears smoothly with opacity animation

#### 2.3 Frenzy Golden Seed Rate
- [ ] While in Frenzy mode (x5+ combo), note golden seed drop frequency
- [ ] Complete test game and check Golden Seed count on completion screen
- [ ] **Expected:** Golden seeds should feel more frequent (visual confirmation via emoji appearance)

#### 2.4 Haptic Feedback Intensity
- [ ] Correct answer in normal combo → Standard success vibration
- [ ] Correct answer in Frenzy mode → Stronger success haptic
- [ ] Wrong answer → Error haptic (sharp buzz)
- [ ] **Device:** Test on physical device for best haptic feedback

#### 2.5 Combo Break Penalty Test
- [ ] Get to x5 combo, then deliberately tap wrong card
- [ ] **Expected Behavior:**
  - Timer flashes RED (≤3 seconds color)
  - Combo resets to 0
  - Loss only 1 life (not 2)
  - "Combo Breaker!" hype text appears
  - Error haptic triggers

---

### 3️⃣  Mastery Gate Failure & Retry Flow

**Setup:** Restart Stage 1, intentionally fail the gate

#### 3.1 Failing the Gate (Low Accuracy OR Low Combo)
- [ ] Play Stage 1 and intentionally get low accuracy (<80%)
  - **Or:** Keep max combo below x3 (don't get 3-combo chains)
- [ ] Complete the game with these criteria not met
- [ ] **Expected on Completion Screen:**
  - 🥀 emoji (Wilted/Failed state)
  - Message: "Failed to master stage" or similar
  - XP shows `-5` penalty (red text)
  - No star earned

#### 3.2 Return to Home Screen After Failure
- [ ] Navigate back to Home Screen
- [ ] Verify Stage 1 shows:
  - Amber border (not green)
  - "⚠️ -5 XP Penalty" badge
  - Accuracy % and max combo (e.g., "75% Accuracy · x2 Combo")
- [ ] Verify **Water Drops decreased by 5**
  - `state.totalXP` should reflect the -5 penalty
- [ ] Verify **Stage 2 still locked** (gate not bypassed)

#### 3.3 Passing the Gate on Retry
- [ ] Play Stage 1 again, this time achieving:
  - **≥80% accuracy** AND
  - **≥x3 max combo**
- [ ] Complete the game
- [ ] **Expected:**
  - ✅ Green checkmark on Stage 1
  - "Seed Collected!" celebration screen
  - XP awarded (multiplied by your current streak)
  - Stage 2 (The Greenhouse) should now be **UNLOCKED**

---

### 4️⃣ Playing Stage 2: The Greenhouse (Understand)

**Setup:** Enter Stage 2 after unlocking it

#### 4.1 Classification Mechanics
- [ ] Verify the "Classify the seeds" prompt appears
- [ ] Tap a seed, verify it gets selected (visual highlight)
- [ ] Tap a concept box to place the seed
- [ ] **Expected:** Seed moves to that greenhouse box
  - Correct placement → Green flash, ✅, combo +1
  - Wrong placement → Red flash, shake, combo reset, -1 life

#### 4.2 Frenzy Mode in Stage 2 ⚠️
- [ ] Get x5+ combo
- [ ] **ISSUE:** Frenzy overlay may NOT appear in Stage 2 yet
  - Need to verify if it renders or if it needs to be added
- [ ] **If appears:** Expected same pulsing "FRENZY!" text
- [ ] **If doesn't appear:** Known limitation, visual only in Stage 1 currently

#### 4.3 Golden Seed & Curiosity Hook
- [ ] Get 3+ consecutive correct placements
- [ ] **Expected:** Golden seed roll (occasional ✨ animation)
- [ ] **Expected:** Curiosity hook modal appears (~3 in a row): "🧠 Learning Insight" with memory trick

#### 4.4 Passing the Mastery Gate
- [ ] Play through and achieve:
  - **≥80% accuracy** (correct placements / total placements)
  - **≥x3 max combo**
- [ ] Time out should NOT happen (90s timer)
- [ ] Complete the game
- [ ] **Expected:**
  - "Greenhouse Complete!" celebration
  - XP awarded (with streak multiplier applied)
  - Level up if crossed 200 XP threshold
  - Stage 3 now **UNLOCKED**

#### 4.5 Plant Growth Update
- [ ] Check Home Screen after gaining XP
- [ ] If total XP crossed 200:
  - Level should be **Level 1**
  - Plant emoji should upgrade to 🌱 (Sprout) from 🏜️
- [ ] **Terminal:** `level = Math.floor(state.totalXP / 200)` should be 1

---

### 5️⃣ Playing Stage 3: The Potting Bench (Apply)

**Setup:** Enter Stage 3 after unlocking it

#### 5.1 "Take Your Time" Badge Visibility
- [ ] Enter Stage 3 gameplay
- [ ] Look for **🕐 Take Your Time** badge in stats bar
- [ ] **Confirm:** NO countdown timer exists (unlike Stages 1 & 2)
- [ ] **Expected:** Life hearts (❤️/🖤) visible, but no timer display

#### 5.2 Life Penalty on Wrong Step
- [ ] Get x2 or x3 combo, then tap **wrong procedural step**
- [ ] **Expected Behavior:**
  - UI flashes RED
  - Lose **1 life** (standard penalty)
  - Combo resets to 0
  - Shake animation
  - Error haptic
- [ ] **Repeat:** Get to x4+ combo, tap wrong step
- [ ] **Check:** Should lose 1 life, NOT 2 (combo breaker penalty is Stage 1/2 only)

#### 5.3 Sequence Tracking
- [ ] Verify correct steps appear in "Sequence:" row at bottom
- [ ] Each step shows in order as you complete them
- [ ] **Expected:** Sequence updates in real-time, showing visual progress

#### 5.4 Procedure Completion & Retention Trick
- [ ] Complete all steps in correct order for first procedure
- [ ] **Expected:** "Potted!" celebration screen
- [ ] 💡 **Retention Trick** modal appears with memory aid
- [ ] Tap to continue
- [ ] Next procedure loads (if not last)

#### 5.5 Completing All Procedures
- [ ] Finish all procedures without running out of lives
- [ ] **Expected on Completion:**
  - 🌳 emoji (Master Gardener)
  - "+X Water Drops" XP award (with streak multiplier)
  - Golden Seed count display
  - Best combo displayed
- [ ] Stage 3 returns to Home Screen with **✅ checkmark**

#### 5.6 Game Over (Out of Lives)
- [ ] Deliberately fail by losing all 3 lives
  - Make wrong step selections to lose lives
- [ ] **Expected:**
  - 💀 emoji (Garden Withered)
  - Message: "You completed X of Y procedures"
  - "You ran out of lives" message
  - Can retry or return to stages

---

### 6️⃣ The Wilting Mechanic (Time Simulation)

**Setup:** Dev testing requires AsyncStorage/Firestore manipulation

#### 6.1 Drooping State (3-6 days old)
- [ ] **Dev Hack:** Manually set `lastPlayedTimestamp` to 4 days ago for Stage 1
  - Edit Firestore or local AsyncStorage:
    ```json
    {
      "materials": {
        "[materialId]": {
          "stageResults": {
            "remember": {
              "lastPlayedTimestamp": 1708205959000 // ~4 days ago
            }
          }
        }
      }
    }
    ```
- [ ] Reload app
- [ ] Return to Home Screen
- [ ] **Expected Stage 1 Card:**
  - Border: Gold (#FFD54F) instead of green
  - Background: Warm yellow (#FFF9E6)
  - Warning text: "📉 Fading (review soon)"
  - Still playable, not wilted

#### 6.2 Wilting State (7-13 days old)
- [ ] Set `lastPlayedTimestamp` to 10 days ago
- [ ] Reload app
- [ ] **Expected Stage 1 Card:**
  - Border: Orange (#FFB74D)
  - Background: Light orange (#FFF3E0)
  - Warning text: "⚠️ Knowledge wilting"
  - Accuracy % faded (opacity reduced)
  - Still playable but shows urgency

#### 6.3 Fully Wilted State (14+ days old)
- [ ] Set `lastPlayedTimestamp` to 20 days ago
- [ ] Reload app
- [ ] **Expected Stage 1 Card:**
  - Emoji: 🥀 (Wilted flower) instead of 🌾
  - Border: Red (#EF5350)
  - Background: Light red (#FFEBEE)
  - Text: "Needs Watering!"
  - Subtext: "Replay to restore"
  - Checkmark removed (visually "incomplete")
  - Still playable

#### 6.4 Restoration on Replay
- [ ] Play the wilted Stage 1 again (≥80% accuracy + x3 combo)
- [ ] Complete the stage
- [ ] **Expected:**
  - Freshness resets to 100%
  - Emoji returns to 🌾
  - Border returns to green (#7DB58D)
  - Checkmark visible again
  - `lastPlayedTimestamp` updated to now

---

### 7️⃣ Sunlight Streak Multiplier Verification

**Setup:** Track streak across multiple days

#### 7.1 Day 1 Login
- [ ] Fresh app → No hours played yesterday
- [ ] Check Home Screen streak badge
- [ ] **Expected:** Either "No Streak" or "1-Day Streak", multiplier is 1x
- [ ] Complete a stage (10 XP base Stage 1)
- [ ] **Expected XP:** 10 × 1 = 10 (no multiplier)

#### 7.2 Day 2 Login (Consecutive)
- [ ] Simulate advancing 24 hours (dev hack: modify `lastLoginDate` in streakData)
- [ ] Reload app
- [ ] **Expected Streak:** "2-Day Streak", multiplier still 1x
- [ ] Complete Stage 1 again (10 XP base)
- [ ] **Expected XP:** 10 × 1 = 10

#### 7.3 Day 3 Login (Consecutive)
- [ ] Advance another 24 hours
- [ ] **Expected Streak:** "3-Day Streak"
- [ ] **Multiplier Badge:** "1.5x XP" should appear!
- [ ] Complete Stage 1: 10 × 1.5 = **15 XP**
- [ ] ✅ Yellow/gold badge visible on streak card

#### 7.4 Day 7 Milestone
- [ ] Fast-forward to Day 7
- [ ] **Expected Streak:** "7-Day Streak"
- [ ] **Multiplier Badge:** "2x XP"
- [ ] Complete Stage 1: 10 × 2 = **20 XP**
- [ ] ✅ Badge prominently displayed

#### 7.5 Day 14 Milestone
- [ ] Fast-forward to Day 14
- [ ] **Expected Streak:** "14-Day Streak"
- [ ] **Multiplier Badge:** "3x XP"
- [ ] Complete Stage 1: 10 × 3 = **30 XP**
- [ ] ✅ Maximum multiplier achieved

#### 7.6 Streak Reset After Gap
- [ ] Skip a day (set date to Day 16, don't log in on Day 15)
- [ ] Log in on Day 16
- [ ] **Expected Streak:** Reset to "1-Day Streak"
- [ ] **Multiplier:** Back to 1x
- [ ] XP awards go back to base value

---

## 🔴 Known Issues / Test Gaps

### Issue 1: Frenzy Overlay in Stage 2
- **Status:** ⚠️ Needs verification/implementation
- **Expected:** Pulsing "FRENZY!" text should appear in Stage 2 (Understand) at x5 combo
- **Current:** Only confirmed in Stage 1 (Remember)
- **Action:** Need to add `frenzyAnim` and overlay rendering to understand.tsx

### Issue 2: Combo Penalty in Stage 3
- **Status:** ⚠️ Needs verification
- **Expected:** Wrong step with high combo should lose 1 life, NOT 2
- **Spec:** Stage 3 has no time mechanic, only lives
- **Action:** Verify apply.tsx doesn't have extra combo penalty logic

### Issue 3: Streak Migration for Old Users
- **Status:** ✅ Fixed
- **Expected:** Old cached state without `streakData` should initialize to EMPTY_STREAK
- **Current:** Handled in ProgressContext load logic

---

## 📊 Testing Workflow Recommendation

### Phase A: Offline Testing (Quick)
1. Fresh install / Clear storage
2. Walk through checklist sections 1-3
3. Verify core unlock flow works
4. ~30 min

### Phase B: Full Flow Testing (Comprehensive)
1. Complete all 3 stages (Remember → Understand → Apply)
2. Verify mastery gates work
3. Test frenzy in both stages
4. ~60 min

### Phase C: Time-Based Testing (Dev Hacks Required)
1. Simulate streak milestones (Day 3, 7, 14)
2. Test wilting mechanic at different time thresholds
3. Verify multipliers apply correctly
4. ~45 min (with time manipulation)

### Phase D: Edge Cases (Robustness)
1. Anti-cheat detection
2. Offline mode / sync recovery
3. Level-up splash screens
4. ~30 min

---

## 🛠️ Developer Console Commands

### Monitor XP & Streak in Real-Time
```typescript
// Add this temporarily in home.tsx render to log state:
console.log("=== BLOOM STATE ===", {
  totalXP: state.totalXP,
  totalStars: state.totalStars,
  currentStreak: state.streakData.currentStreak,
  maxStreak: state.streakData.maxStreak,
  multiplier: getStreakMultiplier(state.streakData.currentStreak),
});
```

### Simulate Time Changes
```typescript
// Modify lastLoginDate in ProgressContext:
// Set to specific date for streak testing
const dateStr = new Date("2026-02-25").toISOString().split("T")[0];
```

### Firestore Debugging
```typescript
// View user data in Firebase Console:
// users → [user.uid] → materials → [materialId] → stageResults → remember
```

---

## ✅ Sign-Off Checklist

- [ ] All 7 test sections completed
- [ ] No critical bugs found (UI crashes, logic errors)
- [ ] Frenzy overlay working in both stages
- [ ] Mastery gates enforcing requirements
- [ ] Streak multiplier applying to XP correctly
- [ ] Wilting mechanic showing correct states
- [ ] Anti-cheat detection logging
- [ ] Level-up prompts appearing
- [ ] Plant emoji progression showing correctly
- [ ] No console errors in terminal/Xcode logs

---

**Last Updated:** February 19, 2026  
**App Version:** Phase 3 (Sunlight System + Frenzy Mode)  
**Status:** Ready for E2E Testing
