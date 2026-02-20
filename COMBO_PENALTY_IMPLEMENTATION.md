# Combo Penalty System - Implementation Guide

## Overview
This document provides drop-in code snippets for adding time/life penalties when players break a combo streak (≥4 in a row).

---

## 1. REMEMBER.TSX - Timer Penalty Implementation

### Step 1: Add State Variables (after line 47, with other state declarations)

```tsx
const [penaltyTimerActive, setPenaltyTimerActive] = useState(false);
const [penaltyStartTime, setPenaltyStartTime] = useState(0);
const penaltyDuration = 1000; // Red timer displays for 1 second
```

### Step 2: Update Question Timer Logic (replace the Challenge question timer useEffect - lines 101-117)

```tsx
// Challenge question timer
useEffect(() => {
  if (phase !== "challenge") return;
  setQuestionTimer(QUESTION_SECONDS);
  setQuestionStartTime(Date.now());
  timerRef.current = setInterval(() => {
    setQuestionTimer((prev) => {
      if (prev <= 1) {
        if (timerRef.current) clearInterval(timerRef.current);
        handleTimeout();
        return 0;
      }
      return prev - 1;
    });
  }, 1000);
  return () => { if (timerRef.current) clearInterval(timerRef.current); };
}, [phase, currentQ]);

// Penalty timer reset (hide red overlay after 1 second)
useEffect(() => {
  if (!penaltyTimerActive) return;
  const timeout = setTimeout(() => {
    setPenaltyTimerActive(false);
  }, penaltyDuration);
  return () => clearTimeout(timeout);
}, [penaltyTimerActive]);
```

### Step 3: Update Timer Color Logic (replace line 341)

```tsx
// ─── STUDY & CHALLENGE ───
const isStudy = phase === "study";
const timerValue = isStudy ? studyTimer : questionTimer;
const timerColor = penaltyTimerActive 
  ? "#FF6B6B" 
  : timerValue <= 3 
    ? "#E57373" 
    : timerValue <= 6 
      ? "#FFB74D" 
      : "#7DB58D";
```

### Step 4: Update Wrong Answer Handler (replace the WRONG branch, lines 248-260)

```tsx
    } else {
      // WRONG - Check for combo penalty
      triggerHaptic("error");
      doShake();
      setWrongCard(idx);
      const correctIdx = facts.findIndex((f) => f.id === currentFact.id);
      setCorrectCard(correctIdx);
      
      // COMBO PENALTY: If combo >= 4, subtract 5 seconds from timer
      if (combo >= 4) {
        setQuestionTimer((prev) => Math.max(0, prev - 5)); // Subtract 5 seconds
        setPenaltyTimerActive(true);
        setPenaltyStartTime(Date.now());
      }
      
      setCombo(0);
      setConsecutiveCorrect(0);
      setHypeText(getHypeText(0, false));
      const newLives = lives - 1;
      setLives(newLives);
      if (newLives <= 0) {
        if (timerRef.current) clearInterval(timerRef.current);
        setPhase("gameover");
      } else {
        setTimeout(() => advanceQuestion(), 500);
      }
    }
  };
```

### Step 5: Add Timer Penalty Visual Feedback (in the stats bar, around line 380, modify the timer display)

```tsx
      {/* Stats bar */}
      <View style={s.stats}>
        <Animated.Text style={[s.timer, { color: timerColor }]}>
          {timerValue}s
          {penaltyTimerActive && <Text style={{ fontSize: 10 }}> -5s</Text>}
        </Animated.Text>
        {!isStudy && <Text style={s.seedCount}>🌱 {collected}/{challengeFacts.length}</Text>}
        {!isStudy && combo >= 2 && <Text style={s.comboText}>x{getComboMultiplier(combo).toFixed(1)}</Text>}
        <Text style={s.lives}>{"❤️".repeat(lives)}{"🖤".repeat(MAX_LIVES - lives)}</Text>
      </View>
```

---

## 2. UNDERSTAND.TSX - Timer Penalty Implementation

### Step 1: Add State Variables (after line 55, with other state declarations)

```tsx
const [penaltyTimerActive, setPenaltyTimerActive] = useState(false);
const [penaltyStartTime, setPenaltyStartTime] = useState(0);
const penaltyDuration = 1000; // Red timer displays for 1 second
```

### Step 2: Add Penalty Timer Reset Effect (after the main timer useEffect, around line 85)

```tsx
  // Penalty timer reset (hide red overlay after 1 second)
  useEffect(() => {
    if (!penaltyTimerActive) return;
    const timeout = setTimeout(() => {
      setPenaltyTimerActive(false);
    }, penaltyDuration);
    return () => clearTimeout(timeout);
  }, [penaltyTimerActive]);
```

### Step 3: Update Timer Color Logic (find where timerColor is defined, add similar logic)

Add this before the return statement (around line 400):

```tsx
const timerColor = penaltyTimerActive 
  ? "#FF6B6B" 
  : timer <= 3 
    ? "#E57373" 
    : timer <= 6 
      ? "#FFB74D" 
      : "#7DB58D";
```

### Step 4: Update Wrong Answer Handler (replace the WRONG branch in handleSeedTap)

Find the wrong answer section (around line 170) and replace:

```tsx
    } else {
      // WRONG - Check for combo penalty
      triggerHaptic("error");
      
      // COMBO PENALTY: If combo >= 4, subtract 5 seconds from timer
      if (combo >= 4) {
        setTimer((prev) => Math.max(0, prev - 5)); // Subtract 5 seconds
        setPenaltyTimerActive(true);
        setPenaltyStartTime(Date.now());
      }
      
      setCombo(0);
      setConsecutiveCorrect(0);
      setHypeText(getHypeText(0, false));
      const newLives = lives - 1;
      setLives(newLives);

      if (newLives <= 0) {
        if (timerRef.current) clearInterval(timerRef.current);
        setPhase("gameover");
      }
      setTimeout(() => setSelectedSeed(null), 500);
    }
```

### Step 5: Update Timer Display (in the header/stats section of the UI)

Find where the timer is rendered and update to:

```tsx
<Animated.Text style={[s.timer, { color: timerColor }]}>
  {timer}s
  {penaltyTimerActive && <Text style={{ fontSize: 10 }}> -5s</Text>}
</Animated.Text>
```

---

## 3. APPLY.TSX - Life Penalty Implementation (No Timer)

### Step 1: Add Penalty Animation State (after line 42, with other state declarations)

```tsx
const [penaltyLifeActive, setPenaltyLifeActive] = useState(false);
const penaltyDuration = 1000; // Life penalty highlight for 1 second
```

### Step 2: Add Penalty Reset Effect (after other useEffects)

```tsx
// Life penalty reset (hide highlight after 1 second)
useEffect(() => {
  if (!penaltyLifeActive) return;
  const timeout = setTimeout(() => {
    setPenaltyLifeActive(false);
  }, penaltyDuration);
  return () => clearTimeout(timeout);
}, [penaltyLifeActive]);
```

### Step 3: Update Wrong Answer Handler (replace the WRONG branch in handleStepTap, around line 164)

```tsx
    } else {
      // WRONG - Check for combo penalty
      triggerHaptic("error");
      doShake();
      
      // COMBO PENALTY: If combo >= 4, subtract 1 life instead of losing steps
      if (combo >= 4) {
        const newLives = lives - 1;
        setLives(newLives);
        setPenaltyLifeActive(true);
        
        if (newLives <= 0) {
          setPhase("gameover");
        }
      }
      
      setCombo(0);
      setConsecutiveCorrect(0);
      setHypeText(getHypeText(0, false));
      const comboLives = lives - 1; // Original lives counter (if not penalized by combo)
      const finalLives = combo >= 4 ? lives : comboLives; // Don't double-penalize
      
      // Only lose a life if no combo penalty was applied
      if (combo < 4) {
        const newLivesNoCombo = lives - 1;
        setLives(newLivesNoCombo);
        if (newLivesNoCombo <= 0) {
          setPhase("gameover");
        }
      }
    }
```

**Important:** If apply.tsx currently deducts a life on wrong answers, simplify the logic to:

```tsx
    } else {
      // WRONG - Check for combo penalty (bonus life lost if high combo broken)
      triggerHaptic("error");
      doShake();
      
      // COMBO PENALTY: If combo >= 4, subtract EXTRA life as penalty
      const extraPenalty = combo >= 4 ? 1 : 0;
      if (extraPenalty > 0) {
        setPenaltyLifeActive(true);
      }
      
      const newLives = lives - 1 - extraPenalty; // 1 for wrong + 1 for combo break
      setLives(Math.max(0, newLives));
      
      setCombo(0);
      setConsecutiveCorrect(0);
      setHypeText(getHypeText(0, false));
      
      if (newLives <= 0) {
        setPhase("gameover");
      }
    }
```

### Step 4: Update Lives Display (in the header section, around line 370)

```tsx
<Animated.Text style={[
  s.lives, 
  penaltyLifeActive && { color: "#FF6B6B", fontWeight: "700" }
]}>
  {"❤️".repeat(Math.max(0, lives))}{"🖤".repeat(Math.max(0, MAX_LIVES - lives))}
  {penaltyLifeActive && <Text> ⚠️</Text>}
</Animated.Text>
```

---

## 4. Engaged Gameplay Guide

### Combo Penalty Triggers When:
- Player has built a combo of **4 or more** consecutive correct answers
- Player then makes a **careless mistake** and selects the wrong card/seed/step
- Haptic feedback triggers immediately: `triggerHaptic("error")`
- **For Remember & Understand:** 5 seconds subtracted from timer, timer turns bright red for 1 second
- **For Apply:** Player loses an extra life (beyond the normal wrong-answer penalty)
- Combo resets to 0

### Visual Feedback Cascade:
1. ⚠️ **Haptic**: Immediate error vibration
2. 🎯 **Screen**: Shake animation triggers
3. ⏱️ **Timer** (Remember/Understand): Turns **#FF6B6B** (bright red) with "-5s" text
4. ❤️ **Lives** (Apply): Red highlight with ⚠️ badge for the penalty frame
5. 🔄 **Combo**: Resets to 0, hype text shows "0x"

### Player Psychology:
- **High-combo mistakes are punished harder** to encourage careful play, not just speed
- **Visual feedback is immediate** so players understand cause-and-effect
- **Penalty magnitude (5s / 1 life)** is significant enough to matter but not game-ending
- **Haptic feedback** ensures even distracted players feel the consequence

---

## Testing Checklist

- [ ] Build combo of 4+ in Remember game
- [ ] Make wrong answer → timer reduces 5 seconds + turns red
- [ ] Red timer effect lasts exactly 1 second, then reverts
- [ ] Combo resets to 0 after penalty
- [ ] Build combo of 4+ in Understand game
- [ ] Make wrong answer → timer reduces 5 seconds + turns red
- [ ] Red timer effect lasts exactly 1 second, then reverts
- [ ] Build combo of 4+ in Apply game
- [ ] Make wrong answer → lose extra life + lives display highlights in red
- [ ] Penalty doesn't apply if combo < 4
- [ ] Haptic feedback works on all three games
- [ ] Shake animation triggers on wrong answer
- [ ] Timer never goes below 0
- [ ] Lives never go below 0

