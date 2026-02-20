# Combo Penalty - Quick Copy-Paste Code Blocks

## REMEMBER.TSX

### BLOCK 1: State Variables (add after line 47)
```tsx
const [penaltyTimerActive, setPenaltyTimerActive] = useState(false);
const [penaltyStartTime, setPenaltyStartTime] = useState(0);
const penaltyDuration = 1000;
```

### BLOCK 2: Penalty Timer Reset useEffect (add after the Challenge timer useEffect)
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

### BLOCK 3: Timer Color Logic (replace line 341)
```tsx
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

### BLOCK 4: Updated Wrong Answer Handler (replace lines 248-260, the WRONG branch)
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
        setQuestionTimer((prev) => Math.max(0, prev - 5));
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
```

### BLOCK 5: Timer Display with Penalty Indicator (update stats bar, around line 382)
Replace this line:
```tsx
        <Text style={[s.timer, { color: timerColor }]}>{timerValue}s</Text>
```

With this:
```tsx
        <Animated.Text style={[s.timer, { color: timerColor }]}>
          {timerValue}s
          {penaltyTimerActive && <Text style={{ fontSize: 10 }}> -5s</Text>}
        </Animated.Text>
```

---

## UNDERSTAND.TSX

### BLOCK 1: State Variables (add after line 55)
```tsx
const [penaltyTimerActive, setPenaltyTimerActive] = useState(false);
const [penaltyStartTime, setPenaltyStartTime] = useState(0);
const penaltyDuration = 1000;
```

### BLOCK 2: Penalty Timer Reset useEffect (add after the main timer useEffect, around line 85)
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

### BLOCK 3: Timer Color Logic (add before return statement, around line 400)
```tsx
const timerColor = penaltyTimerActive 
  ? "#FF6B6B" 
  : timer <= 3 
    ? "#E57373" 
    : timer <= 6 
      ? "#FFB74D" 
      : "#7DB58D";
```

### BLOCK 4: Updated Wrong Answer Handler (replace the WRONG branch in handleSeedTap, around line 170)
```tsx
    } else {
      // WRONG - Check for combo penalty
      triggerHaptic("error");
      
      // COMBO PENALTY: If combo >= 4, subtract 5 seconds from timer
      if (combo >= 4) {
        setTimer((prev) => Math.max(0, prev - 5));
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

### BLOCK 5: Timer Display with Penalty Indicator (update wherever timer is rendered)
Replace:
```tsx
<Text style={[s.timer, { color: "#7DB58D" }]}>{timer}s</Text>
```

With:
```tsx
<Animated.Text style={[s.timer, { color: timerColor }]}>
  {timer}s
  {penaltyTimerActive && <Text style={{ fontSize: 10 }}> -5s</Text>}
</Animated.Text>
```

---

## APPLY.TSX

### BLOCK 1: State Variables (add after line 42)
```tsx
const [penaltyLifeActive, setPenaltyLifeActive] = useState(false);
const penaltyDuration = 1000;
```

### BLOCK 2: Penalty Reset useEffect (add after other useEffects)
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

### BLOCK 3: Updated Wrong Answer Handler (replace the WRONG branch in handleStepTap, around line 164)

**Option A: If apply.tsx doesn't currently penalize wrong answers**
```tsx
    } else {
      // WRONG - Check for combo penalty
      triggerHaptic("error");
      doShake();
      
      // COMBO PENALTY: If combo >= 4, subtract extra life
      if (combo >= 4) {
        const newLives = lives - 2; // 1 normal + 1 penalty
        setLives(Math.max(0, newLives));
        setPenaltyLifeActive(true);
        if (newLives <= 0) {
          setPhase("gameover");
        }
      } else {
        const newLives = lives - 1;
        setLives(Math.max(0, newLives));
        if (newLives <= 0) {
          setPhase("gameover");
        }
      }
      
      setCombo(0);
      setConsecutiveCorrect(0);
      setHypeText(getHypeText(0, false));
    }
```

**Option B: If apply.tsx already penalizes wrong answers**
```tsx
    } else {
      // WRONG - Check for combo penalty
      triggerHaptic("error");
      doShake();
      
      // COMBO PENALTY: If combo >= 4, subtract EXTRA life
      if (combo >= 4) {
        const newLives = lives - 1 - 1; // 1 for wrong + 1 for combo break
        setLives(Math.max(0, newLives));
        setPenaltyLifeActive(true);
        
        if (newLives <= 0) {
          setPhase("gameover");
        }
      } else {
        const newLives = lives - 1; // Normal penalty
        setLives(Math.max(0, newLives));
        if (newLives <= 0) {
          setPhase("gameover");
        }
      }
      
      setCombo(0);
      setConsecutiveCorrect(0);
      setHypeText(getHypeText(0, false));
    }
```

### BLOCK 4: Lives Display with Penalty Highlight (update in header/stats section, around line 370)
Replace:
```tsx
<Text style={s.lives}>{"❤️".repeat(lives)}{"🖤".repeat(MAX_LIVES - lives)}</Text>
```

With:
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

## Summary of Changes

### remember.tsx
- Add 3 state variables
- Add 1 useEffect
- Modify timer color logic
- Replace wrong-answer handler (5 lines become ~15 lines)
- Update timer display UI

### understand.tsx
- Add 3 state variables
- Add 1 useEffect
- Add timer color logic
- Replace wrong-answer handler (~10 lines become ~15 lines)
- Update timer display UI

### apply.tsx
- Add 2 state variables
- Add 1 useEffect
- Replace wrong-answer handler (~5 lines become ~15-20 lines)
- Update lives display UI

**Total Impact:** ~60 lines added across 3 files for a robust combo-break penalty system with visual feedback.

