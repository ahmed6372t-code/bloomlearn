# Combo Penalty System - Logic Flow & Architecture

## Game Loop Logic Flow

```
┌─────────────────────────────────────────┐
│   Player Taps Card/Seed/Step            │
│   (handleChallengeTap / handleSeedTap / handleStepTap)
└────────────────┬────────────────────────┘
                 │
                 ▼
        ┌────────────────────┐
        │  Is answer CORRECT?│
        └────────┬───────────┘
                 │
        ┌────────┴─────────┐
        │                  │
       YES                NO
        │                  │
        ▼                  ▼
    ┌───────────┐    ┌─────────────────────────┐
    │ CORRECT   │    │ WRONG ANSWER            │
    │ LOGIC     │    │ ─────────────────────── │
    │ - Combo++ │    │ ┌─────────────────────┐ │
    │ - Max++   │    │ │ Check: combo >= 4?  │ │
    │ - XP++    │    │ └──────┬────────┬─────┘ │
    │ - Hype++  │    │        │        │       │
    │ - Golden? │    │       YES      NO      │
    │ - Advance │    │        │        │       │
    │           │    │        ▼        ▼       │
    └───────────┘    │    PENALTY   NORMAL   │
                     │    ──────────────────  │
                     │    ┌──────────────┐ ┌──────────────┐
                     │    │ Timer -5s    │ │ Timer -0s    │
                     │    │ Lives -2     │ │ Lives -1     │
                     │    │ Red Flash    │ │ Shake only   │
                     │    │ Haptic 2x    │ │ Haptic 1x    │
                     │    └──────────────┘ └──────────────┘
                     │        │                   │
                     │        ▼                   ▼
                     │    Combo = 0           Combo = 0
                     │    Consecutive = 0     Consecutive = 0
                     │        │                   │
                     │        └─────────┬─────────┘
                     │                  ▼
                     │         Check: Lives <= 0?
                     │                  │
                     │         ┌────────┴────────┐
                     │         │                 │
                     │        YES               NO
                     │         │                 │
                     │         ▼                 ▼
                     │      GAMEOVER         CONTINUE
                     │
                     └─────────────────────────┘
```

---

## Player Experience Timeline (Scenario: Break x5 Combo with Wrong Answer)

### REMEMBER.TSX Timeline
```
T=0ms:    Player has 5 combo streak
          Timer: 8 seconds remaining
          ◾ Combo visual: "x1.5"  (5 stars earned)
          
T=0.3s:   Player taps WRONG card
          └─► triggerHaptic("error")
          └─► doShake() animation starts
          
T=0.4s:   Check: combo >= 4? YES
          └─► questionTimer = 8 - 5 = 3 seconds
          └─► penaltyTimerActive = true
          └─► setPenaltyStartTime(Date.now())
          └─► setCombo(0)
          
T=0.5s:   Visual Feedback Displays:
          ├─ Timer text turns "#FF6B6B" (bright red)
          ├─ Timer shows "3s -5s" (with penalty indicator)
          ├─ Combo resets to "x1.0"
          ├─ Shake animation shaking the grid
          ├─ Wrong card highlighted in red
          ├─ Correct card highlighted in green
          └─ Hype text: "Careful!" (0x combo)
          
T=0.5-0.7s: Screen continues showing penalty
            (1 second total duration)
            
T=1.3s:   Timer red effect expires
          └─► penaltyTimerActive = false
          └─► Timer returns to normal color
          └─► "-5s" indicator removed
          
T=1.8s:   Next question ready to show
          Timer counts down from 3s toward zero
```

### UNDERSTAND.TSX Timeline
```
T=0ms:    Player has 4 combo streak
          Timer: 45 seconds remaining
          
T=0.3s:   Player taps WRONG seed
          └─► triggerHaptic("error")
          
T=0.35s:  Check: combo >= 4? YES
          └─► timer = 45 - 5 = 40 seconds
          └─► penaltyTimerActive = true
          └─► setCombo(0)
          
T=0.4s:   Visual Feedback:
          ├─ Timer turns bright red "#FF6B6B"
          ├─ Timer text shows "40s -5s"
          ├─ Wrong seed card shows error state
          ├─ Combo counter resets to "x1.0"
          └─ Haptic warning felt
          
T=1.4s:   Penalty highlight expires (1 sec duration)
          └─► Timer returns to normal color
          └─► Continue normal gameplay
```

### APPLY.TSX Timeline
```
T=0ms:    Player has 6 combo streak
          Lives: 2 remaining
          Current step sequence: 40% complete
          
T=0.2s:   Player taps WRONG step in sequence
          └─► triggerHaptic("error")
          └─► doShake() animation
          
T=0.3s:   Check: combo >= 4? YES
          └─► lives = 2 - 1 (normal) - 1 (penalty) = 0
          └─► penaltyLifeActive = true
          └─► setCombo(0)
          └─► setPhase("gameover")
          
T=0.4s:   Visual Feedback (final):
          ├─ Lives display: "❤️❤️ 🖤 ⚠️" (red + warning)
          ├─ Lives turn red for 1000ms
          ├─ Combo resets from "x1.8" to "x1.0"
          ├─ Wrong step highlighted
          └─ Hype text: "Careful!" (0x combo)
          
T=0.5s:   Game Over screen appears
          ├─ "Garden Withered"
          ├─ "You completed [n] of [total] procedures"
          ├─ "You ran out of lives"
          └─ [Try Again] button
```

---

## State Machine for Penalty System

### remember.tsx / understand.tsx
```
┌──────────────────────────────────────────────────┐
│ Initial State                                    │
│ ─────────────────────────────────────────────── │
│ combo: 0-3                                       │
│ questionTimer: 10s-0s                            │
│ penaltyTimerActive: false                        │
│ timerColor: "#7DB58D" (green)                    │
└────────────────────┬─────────────────────────────┘
                     │
          ┌──────────┴───────────┐
          │                      │
          ▼                      ▼
    ┌──────────────┐    ┌──────────────────┐
    │ Building     │    │ Idle             │
    │ Combo 1-3    │    │ combo < 4        │
    │              │    │                  │
    │ Correct      │    │ Correct or       │
    │ answers      │    │ Wrong answers    │
    │              │    │ don't trigger    │
    │ timer:       │    │ 5s penalty       │
    │ normal       │    │                  │
    └──────┬───────┘    │ timer: normal    │
           │            │                  │
           ▼            └──────┬───────────┘
    ┌──────────────────┐       │
    │ HIGH COMBO       │       │
    │ combo >= 4       │   Wrong
    │                  │   Answer
    │ Correct:         │       │
    │ ├─ combo++       │       │
    │ ├─ max++         │       ▼
    │ └─ advance       │   ┌──────────────┐
    │                  │   │ Normal       │
    │ Wrong:           │   │ Penalty      │
    │ └─► [PENALTY]    │   │ -1 life      │
    │     ├─ -5s       │   │ Combo reset  │
    │     ├─ Red flash │   │ Continue     │
    │     ├─ -1 life   │   └─────────────┘
    │     └─ Reset     │
    │                  │
    └──────────────────┘
```

### apply.tsx
```
┌──────────────────────────────────────────────────┐
│ Normal Gameplay State                            │
│ ─────────────────────────────────────────────── │
│ combo: 0-3                                       │
│ lives: 1-3                                       │
│ penaltyLifeActive: false                         │
│ procState: "playing"                             │
└────────────────────┬─────────────────────────────┘
                     │
          ┌──────────┴───────────┐
          │                      │
          ▼                      ▼
    ┌──────────────┐    ┌──────────────────┐
    │ Correct      │    │ Wrong Step       │
    │ Step         │    │ Selected         │
    │              │    │                  │
    │ ├─ combo++   │    │ combo < 4:       │
    │ ├─ max++     │    │ ├─ lives--       │
    │ ├─ advance   │    │ ├─ combo reset   │
    │ └─ sequence+ │    │ └─ continue      │
    │              │    │                  │
    └──────        │    │ combo >= 4:      │
                   │    │ ├─ lives-- (x2)  │
                   │    │ ├─ lives red     │
                   │    │ ├─ combo reset   │
                   │    │ └─ potential     │
                   │    │    GAMEOVER      │
                   │    │                  │
                   │    └──────────────────┘
                   │
        ┌──────────┴──────────┐
        │                     │
    CORRECT               WRONG
    SEQUENCE            SEQUENCE
        │                     │
        ▼                     ▼
    ┌──────────┐        ┌──────────┐
    │ POTTED   │        │ Proceed  │
    │ (Retain) │        │ to Next  │
    │          │        │ Attempt  │
    └──────────┘        │          │
                        │ (or      │
                        │ GAMEOVER │
                        │ if lives │
                        │ run out) │
                        └──────────┘
```

---

## Color Coding Reference

### Timer Display Colors
| State | Color | Meaning |
|-------|-------|---------|
| Normal gameplay | `#7DB58D` (Green) | Timer is healthy |
| Low time warning | `#FFB74D` (Amber) | 3-6 seconds left |
| Critical time | `#E57373` (Orange) | < 3 seconds |
| **COMBO PENALTY** | **`#FF6B6B` (Red)** | **5 seconds just lost!** |

### Lives Display Colors
| State | Emoji | Color | Meaning |
|-------|-------|-------|---------|
| Alive | ❤️ | Normal | Full health |
| Dead | 🖤 | Gray | Lost |
| **PENALTY HIT** | **⚠️** | **`#FF6B6B` (Red)** | **Extra life lost to combo break!** |

---

## Haptic Feedback Intensity

### Current triggerHaptic Calls:
```tsx
triggerHaptic("success")    // Light vibration - correct answer
triggerHaptic("error")      // Strong double vibration - wrong answer
triggerHaptic("golden")     // Three-pulse vibration - golden seed
triggerHaptic("tap")        // Subtle click - ui interaction
```

### Combo Penalty Uses:
```tsx
triggerHaptic("error")      // Strong vibration on wrong answer
                            // (Player feels consequence immediately)
```

---

## XP & Scoring Impact

### With Combo Penalty System
```
Scenario 1: Build x5 combo, maintain + complete game
├─ 5 correct answers × combo multiplier = higher XP
├─ Combo maintained throughout = higher final accuracy
└─ Result: +200-250 XP likely

Scenario 2: Build x5 combo, break on wrong answer
├─ 5 correct answers × combo multiplier earned
├─ Wrong answer: -5 seconds (timer penalty) OR -1 life (apply)
├─ Combo resets to 0 before next answer
├─ Remaining questions × 1.0 multiplier only
└─ Result: +100-150 XP (still progress, but significant reduction)

Scenario 3: Careful play, never break combo
├─ Slower but consistent x2-3 combo throughout
├─ Stability maintained = moderate XP accumulation
└─ Result: +150-180 XP (safe middle ground)
```

### Player Incentive Design:
1. **Speed Play** (build high combo, risk breaks)
   - High ceiling (400+ XP possible)
   - High risk (penalty system punishes carelessness)

2. **Steady Play** (conservative, stable combo)
   - Moderate ceiling (200-300 XP expected)
   - Lower risk (fewer penalty triggers)

3. **Mixed Play** (aggressive but careful)
   - Optimal ceiling (300-350 XP with low penalty)
   - Requires skill balance

---

## Testing Checklist with Penalty Focus

### Remember.tsx
- [ ] Timer at 8s, build x4 combo, wrong answer
  - Expected: Timer drops to 3s, turns red, "-5s" shows, lasts 1s
- [ ] Timer at 2s, build x0 combo, wrong answer
  - Expected: No 5s penalty (combo < 4), normal penalty only
- [ ] Timer at 3s, build x7 combo, wrong answer
  - Expected: Timer drops to 0 (not negative), turns red, game continues
- [ ] Shake animation still plays on wrong answer with penalty
- [ ] Haptic feedback is strong/double pulse

### Understand.tsx
- [ ] Timer at 60s, build x4 combo, wrong seed
  - Expected: Timer jumps to 55s, red flash, "-5s" text
- [ ] Red effect duration is exactly 1 second
- [ ] Penalty doesn't apply when combo < 4
- [ ] Lives still deducted normally per wrong answer

### Apply.tsx
- [ ] Lives at 2, build x5 combo, wrong step
  - Expected: Lives drop to 0, red highlight + ⚠️, GAMEOVER
- [ ] Lives at 3, build x4 combo, wrong step
  - Expected: Lives drop to 1 (2 lost: 1 normal + 1 penalty)
- [ ] Lives at 1, build x4 combo, wrong step
  - Expected: GAMEOVER immediately
- [ ] Penalty life loss is exactly 1 extra (not double deduction)

