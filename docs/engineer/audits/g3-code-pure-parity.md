# G3 — Code Parity Audit: 4 New Vantare Engineer Features vs CrewChief

> **Date:** 2026-06-29
> **Scope:** 4 Vantare engineer features vs CC (CrewChief) reference.
> **Outcome:** 0 MATCH, 3 DIFFERENT, 1 MISSING (in CC) — plus 2 features are completely Vantare-original (CC has no equivalent).

---

## Feature 1: Blue Flag Optimization

| Aspect | CrewChief (FlagsMonitor.cs) | Vantare (flags/monitor.go) | Verdict |
|--------|----------------------------|----------------------------|---------|
| **Max warnings per driver** | `blueFlagWarningCountForSingleDriver < 3` (max 3) | `count < 3` (max 3) | ✅ MATCH |
| **Per-driver tracking** | `opponentWhoTriggeredLastBlueFlag` string key | `blueFlagWarningsPerDriver` map[int32]int by vehicle ID | ✅ MATCH (different key type, same semantics) |
| **Cooldown** | `timeBetweenBlueFlagMessages = 15s` + `Random(0,8)s` jitter | `blueCooldownMS = 15_000` (no jitter) | ⚠️ DIFFERENT (jitter missing in Vantare) |
| **Gate: in pits** | `!currentGameState.PitData.InPitlane` at line 374 | `player.InPits` check at line 180-182 | ✅ MATCH |
| **Gate: session running time** | `SessionRunningTime < 10` at line 343 | `Session.SessionTime < 10` at line 185-187 | ✅ MATCH |
| **Gate: car speed** | `CarSpeed < 1` at line 362-365 | `Player.Speed < 1.0` at line 190-192 | ✅ MATCH |
| **Gate: enable setting** | `enableBlueFlagMessages` (UserSettings) | **Not implemented** — always enabled | ❌ MISSING |
| **Gate: gap threshold** | No gap check — only validates opponent exists behind via `getOpponentKeyBehindOnTrack(true)` | `isBlueFlagReal()` checks `TimeBehindNext < 1.5s` | ❌ EXTRA (Vantare is stricter) |
| **Gate: player position** | No check | `player.Place <= 1` → no blue flag (leader can't have blue) | ❌ EXTRA |
| **Session phase check** | `applicableSessionPhases` = Green, Checkered, FCY. But blue flag logic itself has no explicit session-phase gate (only the general gates above). | No explicit session-phase gate for blue flag (only general gates). | ✅ MATCH |
| **Reset on new session** | `clearState()` resets `blueFlagWarningCountForSingleDriver = 0` | `ResetBlueFlagWarnings()` called on GetReady transition (GamePhase 3/4) | ✅ MATCH (different trigger, same effect) |

### Summary: DIFFERENT

Vantare's blue flag is **stricter** than CC's:
- **Extra gate**: requires `TimeBehindNext < 1.5s` (CC warns whenever the flag is raised, regardless of gap)
- **Extra gate**: skips when player is P1 (CC doesn't explicitly skip for leader)
- **Missing**: `enableBlueFlagMessages` user setting toggle

The gap gate is the most material difference. CC warns on every blue flag; Vantare only warns when the approaching car is actually close. This is the "optimization" by design.

---

## Feature 2: Give Positions Back

### CC has two distinct implementations — neither matches Vantare:

#### A) CC FlagsMonitor.cs — Illegal Overtakes (lines 606-668)

| Aspect | CrewChief | Vantare (position/monitor.go) |
|--------|-----------|-------------------------------|
| **Trigger** | `numCarsPassedIllegally >= 0` — game detects illegal overtakes | Player gains a position (Place improves) |
| **Gap check** | None (uses penalty system) | Gap < 0.3s → "back now"; gap < 1.0s → "back" |
| **Cooldown** | `illegalPassRepeatInterval = 7s` | `giveBackCooldown = 60s` |
| **Messages** | First/repeat/completed (using `folderGivePositionsBackFirstWarningIntro` etc.) | `EventGivePositionBack` / `EventGivePositionBackNow` |
| **Penalty tracking** | Uses `PenaltiesData.NumOutstandingPenalties` | No penalty tracking |
| **"Completed" message** | Yes — `folderGivePositionsBackCompleted` when `NumOutstandingPenalties == 0` | No "completed" message |
| **Tracked via** | `numCarsPassedIllegally` count | `lastGainMS`, `lastGainFromPlace`, `lastGainToPlace` |

#### B) CC LapCounter.cs — Formation Lap Overtaking (lines 773-787)

| Aspect | CrewChief | Vantare |
|--------|-----------|---------|
| **Trigger** | Player overtakes `opponentToFollow` during manual formation lap (`onManualFormationLap`) | Position gain during any racing phase |
| **Message** | `lap_counter/give_that_position_back` + driver name | Not implemented in Vantare at all |

### Summary: DIFFERENT ORIGIN

The name "give positions back" is the same, but the implementation is completely different:

- **CC's implementation** is a **penalty/reaction** system: the game tells you that you illegally passed cars, and CC tells you to give the positions back. It also has a separate formation-lap give-back.
- **Vantare's implementation** is a **proactive sportsmanship** system: when you gain a position and someone is close behind, it suggests you might want to give it back.

Neither feature exists in the other codebase. Vantare lacks CC's illegal-overtake give-back (using PenaltiesData/numCarsPassedIllegally). CC lacks Vantare's position-gain-based proactive give-back.

**Verdict: DIFFERENT** — same concept name, fundamentally different behavior.

---

## Feature 3: Pit Window Countdown

| Aspect | CrewChief (PitStops.cs) | Vantare (pitstops/monitor.go) | Verdict |
|--------|------------------------|-------------------------------|---------|
| **Window open source** | Game-provided `PitWindowStart` / `PitWindowEnd` (live data) | Estimated: `SessionLapsTotal / 3` for open, `(SessionLapsTotal * 2) / 3` for close | ❌ DIFFERENT (CC uses real data; Vantare estimates) |
| **Countdown: window opening** | 1 lap before: `folderMandatoryPitStopsPitWindowOpening` (`pitWindowOpenLap - 1`) | Opens-in-5, opens-in-3, opens-in-1 | ❌ DIFFERENT thresholds |
| **Countdown: window closing** | 1 lap before: `folderMandatoryPitStopsPitWindowClosing` (`pitWindowClosedLap - 1`) | Closes-in-3, closes-in-1 | ❌ DIFFERENT thresholds |
| **Window open announcement** | Yes — `folderMandatoryPitStopsPitWindowOpen` at `pitWindowOpenLap` | Yes — `EventPitWindowOpen` on pit entry (not lap-based) | ❌ DIFFERENT trigger |
| **Window close announcement** | Yes — `folderMandatoryPitStopsPitWindowClosed` at `pitWindowClosedLap` | Yes — `EventPitWindowClose` on pit exit or lap change | ❌ DIFFERENT trigger |
| **Time-based warnings** | 2min/1min open/close warnings for time-based sessions | **Not implemented** | ❌ MISSING |
| **"Pit this lap" / "Box now"** | Yes — `folderMandatoryPitStopsPitThisLap`, `folderMandatoryPitStopsPitNow` with sector-3 timing | Only `EventPitBoxNow` fires on pit entry (distance-based), not as a mandatory stop reminder | ❌ DIFFERENT |
| **Mandatory tyre type messages** | Yes — Prime/Option tyre-specific messages (`folderMandatoryPitStopsFitPrimesThisLap`, etc.) | **Not implemented** | ❌ MISSING |
| **Mandatory stop completed** | Yes — tracks `mandatoryStopCompleted`, `mandatoryStopMissed` | **Not implemented** | ❌ MISSING |
| **Session type gate** | Only race sessions with `HasMandatoryPitStop` | Race-like sessions (type 4/5) with `SessionLapsTotal > 0` | ⚠️ DIFFERENT |

### Summary: DIFFERENT

CC and Vantare approach pit windows completely differently:

- **CC** relies on game-provided pit window data (`PitWindowStart`/`PitWindowEnd`), fires warnings 1 lap before open/close, and includes time-based alternatives, tyre-specific messages, mandatory stop tracking, and "box now" calls.
- **Vantare** estimates the window from total race laps, fires multi-step countdowns (5/3/1 open, 3/1 close), but lacks time-based support, tyre-specific messages, mandatory stop tracking, and the "box now" reminder.

**Vantare is missing**: time-based window warnings, tyre-specific messages, mandatory stop completion tracking, and box-now reminders. CC has no multi-step countdown (only 1-lap-before warnings).

---

## Feature 4: Pre-race Time Announcements

| Aspect | CrewChief (RaceTime.cs) | Vantare (racetime/monitor.go) | Verdict |
|--------|------------------------|-------------------------------|---------|
| **Pre-race 2 min** | ❌ Does not exist | `EventPreRaceTwoMin` at `rem > 115 && rem <= 125` seconds during Formation(3)/Countdown(4) | ❌ MISSING in CC |
| **Pre-race 1 min** | ❌ Does not exist | `EventPreRaceOneMin` at `rem > 55 && rem <= 65` seconds during Formation/Countdown | ❌ MISSING in CC |
| **Pre-race 30s** | ❌ Does not exist | `EventPreRaceThirty` at `rem > 25 && rem <= 35` seconds during Formation/Countdown | ❌ MISSING in CC |
| **Mid-race 20 min** | `folder20mins` at `timeLeft/60 < 20 && > 19.9`, gate `SessionRunningTime > 120` | `EventTwentyMinRemain` at same thresholds + gate | ✅ MATCH |
| **Mid-race 15 min** | `folder15mins` at `timeLeft/60 < 15 && > 14.9`, gate `SessionRunningTime > 120` | `EventFifteenMinRemain` at same thresholds + gate | ✅ MATCH |
| **Mid-race 10 min** | `folder10mins` at `timeLeft/60 < 10 && > 9.9`, gate `SessionRunningTime > 120` | `EventTenMinRemain` at same thresholds + gate | ✅ MATCH |
| **Mid-race 5 min** | `folder5mins` at `timeLeft/60 < 5 && > 4.9`, gate `SessionRunningTime > 120` | `EventFiveMinRemain` at same thresholds + gate | ✅ MATCH |
| **Mid-race 2 min** | `folder2mins` at `timeLeft/60 < 2 && > 1.9`, gate `SessionRunningTime > 60` | `EventTwoMinRemain` at same thresholds + gate | ✅ MATCH |
| **Mid-race 0 min** | `folder0mins` at `timeLeft <= 0.2`, gate `SessionRunningTime > 0` | `EventZeroMinRemain` at `rem <= 0.2`, gate `runningTime > 60` | ⚠️ DIFFERENT gate (CC: >0s, Vantare: >60s) |
| **Halfway** | `folderHalfWayHome` at `timeLeft < halfTime`, gate `SessionRunningTime > 120` | `EventHalfWayRemain` at `rem < halfTime`, gate `runningTime > 120` | ✅ MATCH |
| **Pearls disable** | `disablePearlsOfWisdom = true` at `timeLeft/60 < 3`, gate `SessionRunningTime > 60` | `EventPearlsDisable` at `rem/60 < 3`, gate `runningTime > 60` | ✅ MATCH |
| **Per-position variants** | Yes — `folder5minsLeading`, `folder5minsPodium`, `folderLastLapLeading`, `folderLastLapPodium` | **Not implemented** | ❌ MISSING |
| **Last lap** | `folderLastLap` when leader is on last lap or time will expire | **Not implemented** in this monitor | ❌ MISSING |
| **One-minute sub-marker** | Via voice command only (`folderOneMinuteRemaining`) | `EventOneMinRemain` at `rem > 0 && rem <= 60` | ❌ EXTRA (Vantare auto-fires, CC only on voice) |
| **30s sub-marker** | Only via `folderLessThanOneMinute` for voice response | `EventThirtySecRemain` at `rem > 0 && rem <= 30` | ❌ EXTRA |

### Summary: MISSING (in CC) for pre-race; DIFFERENT for mid-race markers

CC has no pre-race countdown at all — this is a Vantare-original feature.

The mid-race time markers (20/15/10/5/2/0/halfway) match CC thresholds. However:
- **MISSING in Vantare**: per-position variants (leading/podium), last-lap detection
- **EXTRA in Vantare**: auto-firing 1-minute and 30-second sub-markers (CC only plays these on voice command)
- **DIFFERENT**: 0-minute gate (Vantare requires `runningTime > 60`, CC uses `SessionRunningTime > 0`)

---

## Test Results

```
go test ./internal/engineer/... -count=1 -timeout 90s

Result: ok — all 30 packages pass (0 failures, 0 skipped)
```

| Package | Time | Status |
|---------|------|--------|
| audio | 0.308s | ✅ |
| commands | 0.095s | ✅ |
| conditions | 0.082s | ✅ |
| core | 0.078s | ✅ |
| damage | 0.142s | ✅ |
| driverswaps | 0.119s | ✅ |
| engine | 0.140s | ✅ |
| **flags** | **0.059s** | ✅ |
| fuel | 0.153s | ✅ |
| laps | 0.078s | ✅ |
| lmu | 0.167s | ✅ |
| multiclass | 0.122s | ✅ |
| opponents | 0.163s | ✅ |
| pearls | 0.118s | ✅ |
| penalties | 0.083s | ✅ |
| pitmanager | 0.130s | ✅ |
| **pitstops** | **0.061s** | ✅ |
| **position** | **0.132s** | ✅ |
| push | 0.118s | ✅ |
| **racetime** | **0.113s** | ✅ |
| replay | 0.121s | ✅ |
| service | 8.099s | ✅ |
| sessionend | 0.050s | ✅ |
| simulator | 0.131s | ✅ |
| spotter | 0.100s | ✅ |
| strategy | 0.073s | ✅ |
| telemetry | 0.059s | ✅ |
| telemetry/service | 0.110s | ✅ |
| timings | 0.077s | ✅ |
| tyre | 0.076s | ✅ |
| watchedopponents | 0.129s | ✅ |

---

## Overall Summary

| Feature | Verdict | Key Difference |
|---------|---------|----------------|
| **1. Blue Flag** | DIFFERENT | Extra gap gate (<1.5s) in Vantare; missing enableBlueFlagMessages setting |
| **2. Give Positions Back** | DIFFERENT | CC's is penalty-based (illegal overtakes); Vantare's is position-gain-based (proactive). Completely different triggers. |
| **3. Pit Window Countdown** | DIFFERENT | CC uses game-provided data with 1-lap warnings; Vantare estimates from total laps with multi-step countdown (5/3/1). Vantare missing time-based warnings, tyre messages, mandatory stop tracking. |
| **4. Pre-race Time** | MISSING in CC | CC has no pre-race countdown. Mid-race markers match CC thresholds. Per-position variants missing in Vantare. |
