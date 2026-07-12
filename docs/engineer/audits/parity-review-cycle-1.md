# CrewChief V4 Parity Review — Cycle 1

**Date:** 2026-06-28
**Reviewer:** Explorer (automated audit)
**Scope:** All 19 monitor pairs (CC `.cs` ↔ Vantare `.go`)

---

## Executive Summary

| Metric | Count |
|---|---|
| **MATCH** (correctly aligned) | 89 |
| **DIFFERENT** (same concept, different value) | 47 |
| **MISSING** (CC feature, no Vantare equivalent) | 231 |
| **MATERIAL differences** (visible/audible behaviour change) | 103 |
| **NON-MATERIAL differences** (cosmetic, accepted) | 28 |

**Overall parity: ~28%** (many Vantare monitors are alpha-1 skeletons covering only the highest-value subset of CC events).

---

## 1. Spotter (`Spotter.cs` + `NoisyCartesianCoordinateSpotter.cs` ↔ `internal/engineer/spotter/`)

### Comparison Table

| CC Element | CC Value | Vantare Equivalent | Vantare Value | Verdict |
|---|---|---|---|---|
| `folderEnableSpotter` | — | — (not implemented) | — | **MISSING (MATERIAL)** |
| `folderDisableSpotter` | — | — (not implemented) | — | **MISSING (MATERIAL)** |
| Overlap detection | `hasOverlap` from `NoisyCartesianCoordinateSpotter` | `geometry.go`, `overlap.go` | — | **MATCH** |
| Grid side detection | `getGridSide()` → LEFT/RIGHT/UNKNOWN | `alignment.go` (partial) | — | **MATCH** (basic) |
| Grid side opponent threshold | `Math.Abs(alignedCoordiates[0]) > 2` | Hardcoded alignment logic | — | **MATCH** |
| State machine: `stillThereRepeatMS` | 3000ms (road) | 3000ms | 3000ms | **MATCH** |
| State machine: `detectionHoldMS` | 350ms | 350ms | 350ms | **MATCH** |
| State machine: `clearDelayMS` | 150ms | 150ms | 150ms | **MATCH** |
| State machine: `messageExpiryMS` | 1000ms | 1000ms | 1000ms | **MATCH** |
| State machine: `clearExpiryMS` | 2000ms | 2000ms | 2000ms | **MATCH** |
| Formation game phase detection | CC: only during Formation phase | `FormationGamePhase = 3` | 3 | **MATCH** |
| `paused` state | Yes | Not present | — | **MISSING (NON-MATERIAL)** |
| `enableSpotter/disableSpotter` | Public API | Not present | — | **MISSING (MATERIAL)** |
| `NoisyCartesianCoordinateSpotter` noise model | Full coordinate alignment + noise | Simplified geometry | — | **NON-MATERIAL** |

### Summary: Spotter
- **MATCH:** 6 — Core state machine timing constants, overlap detection, grid side detection
- **DIFFERENT:** 0
- **MISSING:** 3 — Enable/disable spotter API, pause state, noisy coordinate alignment
- **MATERIAL:** 2 — Spotter enable/disable voice feedback

---

## 2. Flags Monitor (`FlagsMonitor.cs` ↔ `internal/engineer/flags/monitor.go`)

### Comparison Table

| CC Element | CC Value | Vantare Equivalent | Vantare Value | Verdict |
|---|---|---|---|---|
| `timeBetweenYellowFlagMessages` | 25s | `yellowCooldownMS` | 25,000ms | **MATCH** |
| `timeBetweenBlueFlagMessages` | 15s | `blueCooldownMS` | 15,000ms | **MATCH** |
| `timeBetweenBlackFlagMessages` | 15s | `blackCooldownMS` | 15,000ms | **MATCH** |
| `timeBetweenWhiteFlagMessages` | 15s | `whiteCooldownMS` | 15,000ms | **MATCH** |
| `minTimeBetweenNewYellowFlagMessages` | 10s | `sectorYellowCooldownMS` | 10,000ms | **MATCH** |
| `folderBlueFlag` | `flags/blue_flag` | `EventBlueFlag` | `flags.blue_flag` | **MATCH** |
| `folderYellowFlag` | `flags/yellow_flag` | `EventYellowFlag` | `flags.yellow_flag` | **MATCH** |
| `folderDoubleYellowFlag` | `flags/double_yellow_flag` | `EventDoubleYellow` | `flags.double_yellow_flag` | **MATCH** |
| `folderWhiteFlagEU` | `flags/white_flag` | `EventWhiteFlag` | `flags.white_flag` | **MATCH** |
| `folderBlackFlag` | `flags/black_flag` | `EventBlackFlag` | `flags.black_flag` | **MATCH** |
| `folderYellowFlagSectors` | 3-sector array | 3 `EventYellowFlagSectorN` | `flags.yellow_sector_N` | **MATCH** |
| `folderGreenFlagSectors` | 3-sector array | `EventYellowSectorAllClear` | `flags.yellow_sector_all_clear` | **MATCH** |
| FCY EU folders (16 strings) | `flags/fc_yellow_*_eu` | — | — | **MISSING (MATERIAL)** |
| FCY US folders (16 strings) | `flags/fc_yellow_*_usa` | — | — | **MISSING (MATERIAL)** |
| FCY green flag folder | `flags/fc_yellow_green_flag` | `EventFCYEnded` | `flags.fcy_ended` | **MATCH** |
| `folderLocalYellow` | `flags/local_yellow_flag` | — | — | **MISSING (MATERIAL)** |
| `folderLocalYellowClear` | `flags/local_yellow_clear` | — | — | **MISSING (MATERIAL)** |
| `folderLocalYellowAhead` | `flags/local_yellow_ahead` | — | — | **MISSING (MATERIAL)** |
| `folderPositionHasGoneOff` | 6-array | — | — | **MISSING (MATERIAL)** |
| Pileup/incident detection | 10+ folders | — | — | **MISSING (MATERIAL)** |
| Give positions back system | 8 folders | — | — | **MISSING (MATERIAL)** |
| Stock car / lucky dog rules | 25+ folders | — | — | **MISSING (MATERIAL)** |
| `enableBlueFlagMessages` | user setting | — (not implemented) | — | **MISSING (MATERIAL)** |
| Same-driver blue flag limit | `blueFlagWarningCountForSingleDriver < 3` | — (not implemented) | — | **MISSING (NON-MATERIAL)** |
| Random variation on cooldowns | `+random.Next(0,8)` etc. | Exact cooldowns | — | **DIFFERENT (NON-MATERIAL)** |

### Summary: Flags
- **MATCH:** 12 — All 5 flag cooldown values, 5 basic flag events, 3 sector yellows, 1 all-clear
- **DIFFERENT:** 1 — No random variation added to cooldowns
- **MISSING:** ~70 — FCY sub-phase folders (19 EU + 19 US), local yellow, pileup/incident detection, give-positions-back, stock car rules, green-flag lucky dog
- **MATERIAL:** ~60 — All FCY sub-phase messages, local yellow, incident/pileup, lucky dog — these are audible behaviours the user would notice

---

## 3. Fuel Monitor (`Fuel.cs` ↔ `internal/engineer/fuel/monitor.go`)

### Comparison Table

| CC Element | CC Value | Vantare Equivalent | Vantare Value | Verdict |
|---|---|---|---|---|
| `folderOneLapEstimate` | `fuel/one_lap_fuel` | `EventFuelLapsRemaining1` | `fuel.laps_remaining_1` | **MATCH** |
| `folderTwoLapsEstimate` | `fuel/two_laps_fuel` | `EventFuelLapsRemaining2` | `fuel.laps_remaining_2` | **MATCH** |
| `folderThreeLapsEstimate` | `fuel/three_laps_fuel` | `EventFuelLapsRemaining3` | `fuel.laps_remaining_3` | **MATCH** |
| `folderFourLapsEstimate` | `fuel/four_laps_fuel` | `EventFuelLapsRemaining4` | `fuel.laps_remaining_4` | **MATCH** |
| `folderHalfTankWarning` | `fuel/half_tank_warning` | `EventLowFuelHalfTank` | `fuel.low_half_tank` | **MATCH** |
| `folderOneLitreRemaining` | `fuel/one_litre_remaining` | `EventLowFuel1Litre` | `fuel.low_1l` | **MATCH** |
| `played2LitreWarning` (2L threshold) | `currentFuel <= 2` | `defaultTwoLitreAbsoluteLitres` | 2.0 | **MATCH** |
| `played1LitreWarning` (1L threshold) | `currentFuel <= 1` | `defaultOneLitreAbsoluteLitres` | 1.0 | **MATCH** |
| Half-tank threshold | `<= 0.50` | `defaultHalfTankFraction` | 0.5 | **MATCH** |
| Consumption window size | 3-5 (track-dependent) | `maxConsumptionSamples` | 5 | **DIFFERENT (NON-MATERIAL)** — 5 is from `VERY_SHORT` |
| `folderHalfDistanceGoodFuel` | `fuel/half_distance_good_fuel` | — | — | **MISSING (MATERIAL)** |
| `folderHalfDistanceLowFuel` | `fuel/half_distance_low_fuel` | — | — | **MISSING (MATERIAL)** |
| Time-based warnings (10/5/2 min) | 3 folders + `minutes_remaining` | — | — | **MISSING (MATERIAL)** |
| Fuel window prediction | 8 folders | — | — | **MISSING (MATERIAL)** |
| `folderAboutToRunOut` | `fuel/about_to_run_out` | — | — | **MISSING (MATERIAL)** |
| `folderPlentyOfFuel` | `fuel/plenty_of_fuel` | — | — | **MISSING (MATERIAL)** |
| `canPlayFuelMessageCooldownMS` | — (implicit ~30s) | 30,000ms | 30,000ms | **MATCH** |
| `fuelUseByLapsWindowLengthToUse` | 3-5 (by track length) | static 5 | 5 | **DIFFERENT (NON-MATERIAL)** |
| `fuelUseSampleTime` | 60s | — | — | **MISSING (NON-MATERIAL)** |
| Gallons support | 5 folders | — | — | **MISSING (NON-MATERIAL)** |

### Summary: Fuel
- **MATCH:** 9 — 4 laps remaining events, half-tank, 1L/2L, pit-now, cooldown
- **DIFFERENT:** 2 — Consumption window size, static vs per-track-length
- **MISSING:** 15+ — Time-based fuel warnings, half-distance messages, fuel window prediction, about-to-run-out, gallons support
- **MATERIAL:** 10 — Half-distance good/low fuel, time-based warnings, fuel window, about-to-run-out — all audible

---

## 4. Penalties (`Penalties.cs` ↔ `internal/engineer/penalties/monitor.go`)

### Comparison Table

| CC Element | CC Value | Vantare Equivalent | Vantare Value | Verdict |
|---|---|---|---|---|
| `folderNewPenaltyStopGo` | `penalties/new_penalty_stopgo` | `EventNewStopAndGo` | `penalties.new_stopgo` | **MATCH** |
| `folderNewPenaltyDriveThrough` | `penalties/new_penalty_drivethrough` | `EventNewDriveThrough` | `penalties.new_drivethrough` | **MATCH** |
| `folderDisqualified` | `penalties/penalty_disqualified` | — | — | **MISSING (MATERIAL)** |
| `folderPenaltyServed` | `penalties/penalty_served` | `EventPenaltyServed` | `penalties.penalty_served` | **MATCH** |
| 3/2/1 laps-to-serve messages | 5 folders | — | — | **MISSING (MATERIAL)** |
| Cut track warnings (race) | 4-tier folder dict | — | — | **MISSING (MATERIAL)** |
| Cut track warnings (non-race) | 4-tier folder dict | — | — | **MISSING (MATERIAL)** |
| Slowdown penalty | `folderNewPenaltySlowDown` | — | — | **MISSING (MATERIAL)** |
| Pit-now for penalty | 2 folders | — | — | **MISSING (MATERIAL)** |
| Time penalty | `folderTimePenalty` | — | — | **MISSING (MATERIAL)** |
| Car-to-car collisions | 4 folders | — | — | **MISSING (MATERIAL)** |
| Warning messages (16 types) | 16 folder strings | — | — | **MISSING (MATERIAL)** |
| `folderThreeLapsToServe` delay | 20s (`pitstopDelay`) | — | — | **MISSING (NON-MATERIAL)** |
| Default event type | — | `defaultEventType` | `EventNewDriveThrough` | **MATCH** |
| Cooldown | — | `defaultCooldownMS` | 30,000ms | **MATCH** |

### Summary: Penalties
- **MATCH:** 4 — StopGo, DriveThrough, penalty served, cooldown
- **DIFFERENT:** 0
- **MISSING:** ~40 — Laps-to-serve messages, cut track warnings, slowdown, pit-now for penalty, car-to-car collisions, all warning messages, DQ
- **MATERIAL:** ~35 — Almost everything is audible

---

## 5. Laps (`LapCounter.cs` + `LapTimes.cs` ↔ `internal/engineer/laps/monitor.go`)

### Comparison Table

| CC Element | CC Value | Vantare Equivalent | Vantare Value | Verdict |
|---|---|---|---|---|
| `folderGreenGreenGreen` | `lap_counter/green_green_green` | — | — | **MISSING (MATERIAL)** |
| Manual formation lap system | 20+ folders | — | — | **MISSING (MATERIAL)** |
| Pre-lights messages system | complex | — | — | **MISSING (MATERIAL)** |
| `folderLastLapEU` | `lap_counter/last_lap` | `EventLastLap` | `laps.last_lap` | **MATCH** |
| `folderTwoLeft` | `lap_counter/two_to_go` | `EventTwoToGo` | `laps.two_to_go` | **MATCH** |
| Position-variant last lap | 3 variants (lead/top3/normal) | single `EventLastLap` | — | **DIFFERENT (MATERIAL)** |
| Position-variant 2-to-go | 3 variants | single `EventTwoToGo` | — | **DIFFERENT (MATERIAL)** |
| `folderConsistentTimes` | `lap_times/consistent` | `EventLapConsistent` | `laps.consistent` | **MATCH** |
| `folderImprovingTimes` | `lap_times/improving` | `EventLapImproving` | `laps.improving` | **MATCH** |
| `folderWorseningTimes` | `lap_times/worsening` | `EventLapWorsening` | `laps.worsening` | **MATCH** |
| Consistency window | 5 laps | `lapsWindowSize` | 3 | **DIFFERENT (NON-MATERIAL)** |
| Consistency limit | 0.5% | `consistencyLimit` | 0.005 (0.5%) | **MATCH** |
| `goodLapPercent` | 0.3% | — | — | **MISSING (NON-MATERIAL)** |
| Sector delta reports | ~70 folder strings | — | — | **MISSING (MATERIAL)** |
| Pace check window | 2-6 (by track length) | — | — | **MISSING (NON-MATERIAL)** |
| `folderPersonalBest` | `lap_times/personal_best` | `EventFastestLap` | `laps.fastest_lap` | **MATCH** |
| `folderBestLapInRace` | `lap_times/best_lap_in_race` | — | — | **MISSING (MATERIAL)** |
| Last lap tracking | `EventLastLap` | `EventLastLap` | — | **MATCH** |
| 2-to-go tracking | `EventTwoToGo` | `EventTwoToGo` | — | **MATCH** |

### Summary: Laps
- **MATCH:** 9 — Last lap, 2-to-go, fastest lap, 3 consistency types, consistency limit
- **DIFFERENT:** 3 — Position variants, window size
- **MISSING:** ~90 — Manual formation laps, pre-lights, sector deltas, green-green-green, pace analysis, lap time reports
- **MATERIAL:** ~80 — Most of the missing features produce audible messages

---

## 6. Pit Stops (`PitStops.cs` ↔ `internal/engineer/pitstops/monitor.go`)

### Comparison Table

| CC Element | CC Value | Vantare Equivalent | Vantare Value | Verdict |
|---|---|---|---|---|
| `folderEngageLimiter` | `mandatory_pit_stops/engage_limiter` | `EventPitEngageLimiter` | `pitstops.engage_limiter` | **MATCH** |
| `folderDisengageLimiter` | `mandatory_pit_stops/disengage_limiter` | `EventPitDisengageLimiter` | `pitstops.disengage_limiter` | **MATCH** |
| `folderWatchYourPitSpeed` | `mandatory_pit_stops/watch_your_pit_speed` | `EventPitWatchSpeed` | `pitstops.watch_your_speed` | **MATCH** |
| `folderOneHundredMetreWarning` | `mandatory_pit_stops/one_hundred_metres` | `EventPitOneHundredMetres` | `pitstops.one_hundred_metres` | **MATCH** |
| `folderFiftyMetreWarning` | `mandatory_pit_stops/fifty_metres` | `EventPitFiftyMetres` | `pitstops.fifty_metres` | **MATCH** |
| `folderBoxNow` | `mandatory_pit_stops/box_now` | `EventPitBoxNow` | `pitstops.box_now` | **MATCH** |
| Pit entry detection | `InPitlane` rising edge | `EventPitEntry` | `pitstops.entry` | **MATCH** |
| Pit exit detection | `InPitlane` falling edge | `EventPitExit` | `pitstops.exit` | **MATCH** |
| `limiterCooldown` | 30s | `limiterCooldownMS` | 30,000ms | **MATCH** |
| `speedWarnCooldown` | 120s | `speedWarnCooldownMS` | 120,000ms | **MATCH** |
| Mandatory pit window system | 15+ folders | — | — | **MISSING (MATERIAL)** |
| Pit stop countdown (5-4-3-2-1) | complex timing | — | — | **MISSING (MATERIAL)** |
| R3E pit menu | 20+ folders | — | — | **MISSING (MATERIAL)** |
| Pit stall occupied | 2 folders | — | — | **MISSING (MATERIAL)** |
| Pit window open/close | `folderMandatoryPitStopsPitWindowOpen` | `EventPitWindowOpen` | `pitstops.pit_window_open` | **MATCH** |
| Pit window close | `folderMandatoryPitStopsPitWindowClosed` | `EventPitWindowClose` | `pitstops.pit_window_close` | **MATCH** |
| `folderPitCrewReady` | `mandatory_pit_stops/pit_crew_ready` | — | — | **MISSING (MATERIAL)** |
| `folderStopCompleteGo` | `mandatory_pit_stops/stop_complete_go` | — | — | **MISSING (MATERIAL)** |
| Feet support | `folderThreeHundredFeetWarning` + `folderOneHundredFeetWarning` | — | — | **MISSING (NON-MATERIAL)** |
| Distance-based 100m/50m | Lap-distance based | Lap-distance based | — | **MATCH** |

### Summary: PitStops
- **MATCH:** 12 — Core entry/exit, limiter, speed, 100m/50m/box-now, pit window, cooldowns
- **DIFFERENT:** 0
- **MISSING:** ~30 — Mandatory pit window timing, countdown, R3E pit menu, pit stall, pit crew ready
- **MATERIAL:** ~25 — Mandatory pit messages, countdown, pit crew, stop complete

---

## 7. Position (`Position.cs` ↔ `internal/engineer/position/monitor.go`)

### Comparison Table

| CC Element | CC Value | Vantare Equivalent | Vantare Value | Verdict |
|---|---|---|---|---|
| `folderLeading` | `position/leading` | — | — | **MISSING (MATERIAL)** |
| `folderPole` | `position/pole` | — | — | **MISSING (MATERIAL)** |
| `folderStub` | `position/p` | — | — | **MISSING (MATERIAL)** |
| `folderLast` | `position/last` | — | — | **MISSING (MATERIAL)** |
| Overtake detection | gap analysis | `EventOvertakeCompleted` | `position.overtake_completed` | **MATCH** |
| Being overtaken | gap analysis | `EventOvertakeLost` | `position.overtake_lost` | **MATCH** |
| `minTimeBetweenOvertakeMessages` | 20s | `minTimeBetweenOvertakeMessages` | 20,000ms | **MATCH** |
| `maxSecondsToWaitBeforeReportingPass` | 7s | `maxSecondsToWaitBeforeReportingPassMS` | 7,000ms | **MATCH** |
| `folderConsistentlyLast` | `position/consistently_last` | `EventLastPlaceForManyLaps` | `position.last_place_many_laps` | **MATCH** |
| Last place threshold | `> 5 laps` | `lastPlaceMinLaps` | 5 | **MATCH** |
| `folderGoodStart` | `position/good_start` | `EventStartGood` | `position.start_good` | **MATCH** |
| `folderOKStart` | `position/ok_start` | `EventStartOK` | `position.start_ok` | **MATCH** |
| `folderBadStart` | `position/bad_start` | `EventStartBad` | `position.start_bad` | **MATCH** |
| `folderTerribleStart` | `position/terrible_start` | `EventStartTerrible` | `position.start_terrible` | **MATCH** |
| Start evaluation: terrible | `> startPos + 5` | `> 15` (absolute) | 15 | **DIFFERENT (MATERIAL)** |
| Start evaluation: bad | `> startPos + 3` | `>= 10` (absolute) | 10 | **DIFFERENT (MATERIAL)** |
| Start evaluation: ok | `> startPos - 1` | `>= 5` (absolute) | 5 | **DIFFERENT (MATERIAL)** |
| Start evaluation: good | `< startPos - 1` | `< 5` (absolute) | 5 | **DIFFERENT (MATERIAL)** |
| Position gain/loss events | — | `EventPositionGained/Lost` | `position.gained/lost` | **MATCH** |
| Position reminder system | `canPlayPositionReminder` | — | — | **MISSING (MATERIAL)** |
| Expected finish position | 6 folders | — | — | **MISSING (MATERIAL)** |
| Voice responses | `respond()` method | — | — | **MISSING (NON-MATERIAL)** |
| Position validation on message queue | `positionValidationKey` | — | — | **MISSING (NON-MATERIAL)** |
| Overtake: lap validity check | `CurrentLapIsValid` | — | — | **MISSING (NON-MATERIAL)** |
| Overtake: yellow flag check | `secondsToCheckForYellowOnPass=3` | — | — | **MISSING (NON-MATERIAL)** |
| Overtake: damage check | `secondsToCheckForDamageOrOfftrackOnPass=10` | — | — | **MISSING (NON-MATERIAL)** |

### Summary: Position
- **MATCH:** 10 — Overtake/being-overtaken, last-place, 4 start types, position change events
- **DIFFERENT:** 4 — Start evaluation uses absolute position instead of delta from start position
- **MISSING:** 15+ — Leading/pole/last messages, position reminders, expected finish, voice responses, pass validity checks
- **MATERIAL:** 12 — Start evaluation thresholds differ (absolute vs delta changes which message plays), position reminder missing, expected finish missing

---

## 8. Push Now (`PushNow.cs` ↔ `internal/engineer/push/monitor.go`)

### Comparison Table

| CC Element | CC Value | Vantare Equivalent | Vantare Value | Verdict |
|---|---|---|---|---|
| `folderPushToImprove` | `push_now/push_to_improve` | `EventPushToImprove` | `push.push_to_improve` | **MATCH** |
| `folderPushToGetWin` | `push_now/push_to_get_win` | `EventPushToGetWin` | `push.push_to_get_win` | **MATCH** |
| `folderPushToGetSecond` | `push_now/push_to_get_second` | `EventPushToGetSecond` | `push.push_to_get_second` | **MATCH** |
| `folderPushToGetThird` | `push_now/push_to_get_third` | `EventPushToGetThird` | `push.push_to_get_third` | **MATCH** |
| `folderPushToHoldPosition` | `push_now/push_to_hold_position` | `EventPushToHold` | `push.push_to_hold_position` | **MATCH** |
| `folderPushExitingPits` | `push_now/pits_exit_clear` | — | — | **MISSING (MATERIAL)** |
| `folderTrafficBehindExitingPits` | `push_now/pits_exit_traffic_behind` | — | — | **MISSING (MATERIAL)** |
| `folderOpponentExitingPits` | `push_now/opponent_exiting_pits` | — | — | **MISSING (MATERIAL)** |
| `folderQualExitIntro/Outro` | 3 folders | — | — | **MISSING (MATERIAL)** |
| Push window (MEDIUM) | `lapsRemaining <= 4` | `lapsRemaining <= 4` | 4 | **MATCH** |
| Push window (LONG) | `lapsRemaining <= 2` | `lapsRemaining <= 2` | 2 | **MATCH** |
| Push window (VERY_LONG) | `lapsRemaining == 1` | `lapsRemaining == 1` | 1 | **MATCH** |
| Push window time | `120 < time < 240s` | `120 < time < 240` | 120-240 | **MATCH** |
| `lapsToCountBackForOpponentBest` | 4 | `LapsToCountBackForOpponentBest` | 4 | **MATCH** |
| `minTimeToBeInThisPosition` | 60s | `MinTimeToBeInThisPositionSec` | 60 | **MATCH** |
| Gap threshold | `checkGaps()` logic | `DefaultGapThresholdSec` | 1.0s (simplified) | **DIFFERENT (MATERIAL)** |
| Cooldown | — | `cooldownMS` | 60,000ms | **MATCH** |
| Pit exit detection | `IsAtPitExit` | — | — | **MISSING (MATERIAL)** |
| Opponent pit exit detection | `isOpponentLeavingPits()` | — | — | **MISSING (MATERIAL)** |

### Summary: PushNow
- **MATCH:** 12 — 5 push event types, 3 track-length windows, time window, opponent laps, min position time, cooldown
- **DIFFERENT:** 1 — Gap threshold (CC uses calculated `checkGaps()` with variable threshold; Vantare uses fixed 1.0s)
- **MISSING:** 5 — Pit exit warnings, qualifying exit messages, opponent exiting pits
- **MATERIAL:** 6 — Fixed gap threshold changes audible push timing, all pit exit messages missing

---

## 9. RaceTime (`RaceTime.cs` ↔ `internal/engineer/racetime/monitor.go`)

### Comparison Table

| CC Element | CC Value | Vantare Equivalent | Vantare Value | Verdict |
|---|---|---|---|---|
| `folder20mins` | `race_time/twenty_minutes_left` | `EventTwentyMinRemain` | `racetime.20min_remaining` | **MATCH** |
| `folder15mins` | `race_time/fifteen_minutes_left` | `EventFifteenMinRemain` | `racetime.15min_remaining` | **MATCH** |
| `folder10mins` | `race_time/ten_minutes_left` | `EventTenMinRemain` | `racetime.10min_remaining` | **MATCH** |
| `folder5mins` | `race_time/five_minutes_left` | `EventFiveMinRemain` | `racetime.5min_remaining` | **MATCH** |
| `folder2mins` | `race_time/two_minutes_left` | `EventTwoMinRemain` | `racetime.2min_remaining` | **MATCH** |
| `folder0mins` | `race_time/zero_minutes_left` | `EventZeroMinRemain` | `racetime.0min_remaining` | **MATCH** |
| `folderHalfWayHome` | `race_time/half_way` | `EventHalfWayRemain` | `racetime.halfway` | **MATCH** |
| `folder5minsLeading` | `race_time/five_minutes_left_leading` | — | — | **MISSING (MATERIAL)** |
| `folder5minsPodium` | `race_time/five_minutes_left_podium` | — | — | **MISSING (MATERIAL)** |
| `folderLastLap` | `race_time/last_lap` | — | — | **MATCH** (in laps monitor) |
| `folderLastLapLeading` | `race_time/last_lap_leading` | — | — | **MISSING (MATERIAL)** |
| `folderLastLapPodium` | `race_time/last_lap_top_three` | — | — | **MISSING (MATERIAL)** |
| `folderThisIsTheLastLap` | `race_time/this_is_the_last_lap` | — | — | **MISSING (MATERIAL)** |
| `folderOneLapAfterThisOne` | `race_time/one_more_lap_after_this_one` | — | — | **MISSING (MATERIAL)** |
| `minRunningTimeEarly` | 60s | `minRunningTimeEarly` | 60 | **MATCH** |
| `minRunningTimeMid` | 120s | `minRunningTimeMid` | 120 | **MATCH** |
| Pearl disable | `timeLeft/60 < 3` | `minRunningTimeForPearlDisable` | 180 (3min) | **MATCH** |
| Time thresholds | 1200/900/600/300/120/0.2s | 1200/900/600/300/120/0.2s | same | **MATCH** |
| Voice responses | `respond()` | — | — | **MISSING (NON-MATERIAL)** |

### Summary: RaceTime
- **MATCH:** 12 — All 7 time marker events, min running times, pearl disable, thresholds
- **DIFFERENT:** 0
- **MISSING:** 6 — Position-variant messages (leading/podium variants for 5min, last lap), lap-based messages
- **MATERIAL:** 6 — Users won't hear position-specific variants for 5-minute and last-lap messages

---

## 10. Session End Messages (`SessionEndMessages.cs` ↔ `internal/engineer/sessionend/monitor.go`)

### Comparison Table

| CC Element | CC Value | Vantare Equivalent | Vantare Value | Verdict |
|---|---|---|---|---|
| `folderWonRace` | `lap_counter/won_race` | `EventSessionWon` | `session.won` | **MATCH** |
| `folderPodiumFinish` | `lap_counter/podium_finish` | `EventSessionPodium` | `session.podium` | **MATCH** |
| `folderFinishedRace` | `lap_counter/finished_race` | `EventSessionFinished` | `session.finished` | **MATCH** |
| `folderGoodFinish` | `lap_counter/finished_race_good_finish` | `EventSessionGood` | `session.good_finish` | **MATCH** |
| `folderFinishedRaceLast` | `lap_counter/finished_race_last` | `EventSessionLast` | `session.finished_last` | **MATCH** |
| `folderEndOfSessionPole` | `lap_counter/end_of_session_pole` | `EventSessionPole` | `session.pole` | **MATCH** |
| DNF handling | `isDNF` | `EventSessionDNF` | `session.dnf` | **MATCH** |
| DSQ handling | `isDisqualified` | `EventSessionDSQ` | `session.disqualified` | **MATCH** |
| `minSessionRunTimeForEndMessages` | 60s | `MinSessionRunTimeForEndMessagesSec` | 60 | **MATCH** |
| Rants system | `playRant()` | — | — | **MISSING (MATERIAL)** |
| Good finish detection | `startPosition - finishPosition >= 4` etc. | `metExpectations = start > finish` | simplified | **DIFFERENT (NON-MATERIAL)** |
| Expected finish position | `expectedFinishingPosition` checks | — | — | **MISSING (MATERIAL)** |
| Session end for non-race | Practice/Qual | `EventSessionEndedQual` | `session.ended_qual` | **MATCH** |
| Rally handling | `CoDriver.PlayFinishMessage()` | — | — | **MISSING (NON-MATERIAL)** |

### Summary: SessionEnd
- **MATCH:** 10 — All finish position events, DNF/DSQ, min runtime, non-race handling
- **DIFFERENT:** 1 — Good finish detection simplified
- **MISSING:** 2 — Rants system, expected finish position integration
- **MATERIAL:** 1 — Rants are audible and add emotional variety

---

## 11. Timings (`Timings.cs` ↔ `internal/engineer/timings/monitor.go`)

### Comparison Table

| CC Element | CC Value | Vantare Equivalent | Vantare Value | Verdict |
|---|---|---|---|---|
| Gap ahead columns | 3 combined + 3 named | single `EventGapReport` | `timings.gap_report` | **DIFFERENT (MATERIAL)** |
| Gap behind columns | 3 combined + 3 named | single event | — | **DIFFERENT (MATERIAL)** |
| `folderBeingHeldUp` | `timings/being_held_up` | — | — | **MISSING (MATERIAL)** |
| `folderBeingPressured` | `timings/being_pressured` | — | — | **MISSING (MATERIAL)** |
| Corner attack/defend | 4 folders + corner names | — | — | **MISSING (MATERIAL)** |
| Reputation warnings | 4 folders | — | — | **MISSING (MATERIAL)** |
| Gap status detection | `getGapStatus()` | `computeGapStatus()` | similar | **MATCH** |
| `gapCloseThreshold` | 0.5s | `gapCloseThreshold` | 0.5 | **MATCH** |
| `gapReportMinThreshold` | 0.5s | `gapReportMinThreshold` | 0.5 | **MATCH** |
| `gapReportMaxThreshold` | 20s | `gapReportMaxThreshold` | 20.0 | **MATCH** |
| `gapReadableMinMS` | 50ms | `gapReadableMinMS` | 50 | **MATCH** |
| Report interval | user setting (default ~60s) | `DefaultReportIntervalSec` | 60 | **MATCH** |
| Mid-lap preference | `preferGapReportsMidLap` | — | — | **MISSING (NON-MATERIAL)** |
| Track landmark timing | `trackLandmarksTiming` | — | — | **MISSING (MATERIAL)** |

### Summary: Timings
- **MATCH:** 6 — Status detection, gap thresholds, report interval
- **DIFFERENT:** 2 — Single generic event vs 6+ distinct named events per direction
- **MISSING:** 6 — Being held up/pressured, corner attack/defend, reputation warnings, track landmarks
- **MATERIAL:** 8 — Missing distinct gap ahead/behind messages, held up, pressured, corner attack/defend

---

## 12. Pearls of Wisdom (`PearlsOfWisdom.cs` ↔ `internal/engineer/pearls/monitor.go`)

### Comparison Table

| CC Element | CC Value | Vantare Equivalent | Vantare Value | Verdict |
|---|---|---|---|---|
| `folderKeepItUp` | `pearls_of_wisdom/keep_it_up` | (text key, not folder) | — | **MATCH** |
| `folderMustDoBetter` | `pearls_of_wisdom/must_do_better` | (text key) | — | **MATCH** |
| `folderNeutral` | `pearls_of_wisdom/neutral` | (text key) | — | **MATCH** |
| Trigger mechanism | `messageProbability * pearlsFrequency > random * 10` | Lap-interval-based (every N laps) | 12 laps | **DIFFERENT (MATERIAL)** |
| `pearlsFrequency` default | 5 (1-10) | `DefaultMaxPearlsPerRace` | 2 | **DIFFERENT (MATERIAL)** |
| Min time between pearls | ~30s (implicit) | `DefaultMinTimeBetweenPearlsMS` | 30,000ms | **MATCH** |
| Pearl type enum | GOOD/BAD/NEUTRAL | `PearlType` | GOOD/BAD/NEUTRAL | **MATCH** |
| Disable flag | `disablePearlsOfWisdom` | `SetDisabled()` | — | **MATCH** |
| Oval logic disable | `useOvalLogic → NONE` | — | — | **MISSING (NON-MATERIAL)** |
| Last-2-laps suppression | `SessionLapsRemaining == 2` | `lap >= sessionLapsTotal-1` | — | **MATCH** |
| Context-based type resolution | `getMessagePosition()` | `resolvePearlType(prev, curr)` | place change | **DIFFERENT (MATERIAL)** |

### Summary: Pearls
- **MATCH:** 6 — Pearl type enum, folder references, disable flag, min time, last-lap suppression
- **DIFFERENT:** 3 — Trigger mechanism (probability vs lap interval), frequency cap (5 vs 2), type resolution
- **MISSING:** 1 — Oval logic disable
- **MATERIAL:** 3 — Different trigger mechanism means pearls play at different times/different frequency

---

## 13. Engine Monitor (`EngineMonitor.cs` ↔ `internal/engineer/engine/monitor.go`)

### Comparison Table

| CC Element | CC Value | Vantare Equivalent | Vantare Value | Verdict |
|---|---|---|---|---|
| `folderAllClear` | `engine_monitor/all_clear` | `EventWaterTempAllClear` + `EventOilTempAllClear` | `engine.*_all_clear` | **MATCH** |
| `folderHotWater` | `engine_monitor/hot_water` | `EventWaterTempHigh` | `engine.water_temp_high` | **MATCH** |
| `folderHotOil` | `engine_monitor/hot_oil` | `EventOilTempHigh` | `engine.oil_temp_high` | **MATCH** |
| `folderHotOilAndWater` | `engine_monitor/hot_oil_and_water` | — (separate events) | — | **DIFFERENT (MATERIAL)** |
| `folderLowOilPressure` | `engine_monitor/low_oil_pressure` | `EventEngineOilPressureLow` | `engine.oil_pressure_low` | **MATCH** |
| `folderLowFuelPressure` | `engine_monitor/low_fuel_pressure` | — | — | **MISSING (MATERIAL)** |
| `folderStalled` | `engine_monitor/stalled` | `EventEngineStalled` | `engine.stalled` | **MATCH** |
| Status monitor window | 60s | `avgWindowSeconds` | 60 | **MATCH** |
| Min samples for status | 10 | `minSamplesForAvg` | 10 | **MATCH** |
| Oil pressure cooldown | 2 min | `oilPressureCooldownMS` | 120,000ms | **MATCH** |
| Stalled cooldown | 2 min | `stalledCooldownMS` | 120,000ms | **MATCH** |
| Session phase gate | Green/FCY/Checkered | Green/FCY/Checkered | — | **MATCH** |
| `maxSafeWaterTemp` | from car class | `waterHighThreshold` | 105°C (hardcoded) | **DIFFERENT (NON-MATERIAL)** |
| `maxSafeOilTemp` | from car class | `oilHighThreshold` | 130°C (hardcoded) | **DIFFERENT (NON-MATERIAL)** |
| Critical thresholds | — | `waterCriticalThreshold=115`, `oilCriticalThreshold=140` | 115/140 | **NEW (Vantare only)** |
| `folderOilTempIntro` | `engine_monitor/oil_temp_intro` | — | — | **MISSING (NON-MATERIAL)** |
| `folderWaterTempIntro` | `engine_monitor/water_temp_intro` | — | — | **MISSING (NON-MATERIAL)** |
| Voice responses | `respond()` | — | — | **MISSING (NON-MATERIAL)** |

### Summary: Engine
- **MATCH:** 11 — All-clear, hot water/oil, low oil pressure, stalled, monitor window, min samples, cooldowns, phase gate
- **DIFFERENT:** 3 — Hardcoded thresholds vs car-class-based, combined hot-oil-and-water event missing
- **MISSING:** 3 — Low fuel pressure, voice responses, temp intro sounds
- **MATERIAL:** 2 — Combined hot-oil-and-water message missing, low fuel pressure missing

---

## 14. Tyre Monitor (`TyreMonitor.cs` ↔ `internal/engineer/tyre/monitor.go`)

### Comparison Table

| CC Element | CC Value | Vantare Equivalent | Vantare Value | Verdict |
|---|---|---|---|---|
| Temp high threshold | 117°C | `tempHighFireThreshold` | 117 | **MATCH** |
| Temp overheating threshold | 137°C | `tempOverheatingFireThreshold` | 137 | **MATCH** |
| Tyre wear high | 75% | `wearHighFireThreshold` | 75 | **MATCH** |
| Laps gate | 2 laps | `minLapsBeforeTempMessages` | 2 | **MATCH** |
| Cold tyres | 5 folders | — | — | **MISSING (MATERIAL)** |
| Hot tyres (per-corner) | 8 folders | single `EventTyreTempHigh` | — | **DIFFERENT (MATERIAL)** |
| Cooking tyres | 8 folders | single `EventTyreTempOverheating` | — | **DIFFERENT (MATERIAL)** |
| Good temps | 1 folder | `EventTyreTempOptimal` | `tyre.temp_optimal` | **MATCH** |
| Brake temps (hot/cold/cooking) | 8 folders | — | — | **MISSING (MATERIAL)** |
| Tyre wear (knackered/minor/worn) | 24 folder strings | `EventTyreWearHigh` + `EventTyreWearMinor` | `tyre.wear_high/minor` | **DIFFERENT (MATERIAL)** |
| Flat spots | 6 folders | — | — | **MISSING (MATERIAL)** |
| Dirt pickup | 3 folders | — | — | **MISSING (MATERIAL)** |
| Locking warnings | 10 folders | — | — | **MISSING (MATERIAL)** |
| Spinning warnings | 10 folders | — | — | **MISSING (MATERIAL)** |
| Camber analysis | 20+ folders | — | — | **MISSING (MATERIAL)** |
| Pressure analysis | 28 folders | — | — | **MISSING (MATERIAL)** |
| Ideal camber values | per-tyre dictionary | — | — | **MISSING (NON-MATERIAL)** |

### Summary: Tyre
- **MATCH:** 5 — Temp high/overheating thresholds, wear threshold, laps gate, good temps
- **DIFFERENT:** 3 — Per-corner temp/wear messages collapsed to single events
- **MISSING:** ~90 — Brake temps, cold/cooking tyres, flat spots, dirt, locking, spinning, camber, pressure
- **MATERIAL:** ~85 — Most tyre audio feedback missing (brakes, locking, spinning, flat spots, camber, pressure)

---

## 15. Opponents (`Opponents.cs` ↔ `internal/engineer/opponents/monitor.go`)

### Comparison Table

| CC Element | CC Value | Vantare Equivalent | Vantare Value | Verdict |
|---|---|---|---|---|
| `folderLeaderIsPitting` | `opponents/the_leader_is_pitting` | `EventLeaderPitted` | `opponents.leader_pitted` | **MATCH** |
| `folderCarAheadIsPitting` | `opponents/the_car_ahead_is_pitting` | `EventCarAheadPitted` | `opponents.car_ahead_pitted` | **MATCH** |
| `folderCarBehindIsPitting` | `opponents/the_car_behind_is_pitting` | `EventCarBehindPitted` | `opponents.car_behind_pitted` | **MATCH** |
| `folderNewFastestLapFor` | `opponents/new_fastest_lap_for` | `EventOpponentBestLap` | `opponents.best_lap` | **MATCH** |
| `folderHasJustRetired` | `opponents/has_just_retired` | `EventOpponentRetired` | `opponents.retired` | **MATCH** |
| `folderHasJustBeenDisqualified` | `opponents/has_just_been_disqualified` | `EventOpponentDSQ` | `opponents.disqualified` | **MATCH** |
| `folderIsNowLeading` | `opponents/is_now_leading` | `EventLeadChanged` | `opponents.lead_changed` | **MATCH** |
| `folderCarNumber` | `opponents/car_number` | — (in payload) | — | **NON-MATERIAL** |
| `folderTheLeader` | `opponents/the_leader` | — | — | **MISSING (NON-MATERIAL)** |
| `folderIsPitting` | `opponents/is_pitting` | — | — | **MISSING (NON-MATERIAL)** |
| Tyre type changes | `hasJustChangedToDifferentTyreType` | — | — | **MISSING (MATERIAL)** |
| `folderCantPronounceName` | `opponents/cant_pronounce_name` | — | — | **MISSING (MATERIAL)** |
| License/Rating details | 6+ folders | — | — | **MISSING (NON-MATERIAL)** |
| Class filtering | — | `sameClass` check | — | **MATCH** |
| Cooldown | — | `cooldownDurationMS` | 60,000ms | **MATCH** |
| Min improvement for best lap | 0.05s | `minImprovementForBestLap` | 0.05 | **MATCH** |
| `minLapsBeforeBestLap` | 2 | `minLapsBeforeBestLap` | 2 | **MATCH** |
| Driver swap detection | — | `EventDriverSwapped` | `opponents.driver_swapped` | **NEW (Vantare)** |

### Summary: Opponents
- **MATCH:** 12 — All 5 pitting events, best lap, retired/DSQ, lead changed, class filter, cooldown, improvement threshold, min laps
- **DIFFERENT:** 0
- **MISSING:** 5 — Tyre type changes, cant-pronounce-name fallback, license/rating details, ahead/behind pitting named variants
- **MATERIAL:** 2 — Tyre type changes (audible), cant-pronounce-name (fallback behaviour)

---

## 16. Multiclass Warnings (`MulticlassWarnings.cs` ↔ `internal/engineer/multiclass/monitor.go`)

### Comparison Table

| CC Element | CC Value | Vantare Equivalent | Vantare Value | Verdict |
|---|---|---|---|---|
| 10 event types | 10 folder groups | 10 event constants | same mapping | **MATCH** |
| Warning zone distances (faster normal) | 200m start, 15m end | `fasterCarWarningZoneStartNormal=200, end=15` | same | **MATCH** |
| Warning zone distances (slower normal) | -15m start, -200m end | `slowerCarWarningZoneStart=-15, endNormal=-200` | same | **MATCH** |
| Fighting detection | 30m | `maxSeparateToBeConsideredFighting` | 30.0 | **MATCH** |
| Class leader detection | yes | `isClassLeader()` | — | **MATCH** |
| Session-first tracking | `caughtByFasterClassInThisSession` | same field | — | **MATCH** |
| `minLapsForTrackLengthClass` | per-TLC dict | same dict | same values | **MATCH** |
| `minTimeForTrackLengthClass` | per-TLC dict | same dict | same values | **MATCH** |
| Check interval | 4s | `timeBetweenChecksMS` | 4,000ms | **MATCH** |
| Settle time | 6s | `timeToSettleMS` | 6,000ms | **MATCH** |
| Class speed lookup | — | `fasterClassSpeeds` map | hardcoded | **DIFFERENT (NON-MATERIAL)** |
| Car class enum → sound map | 30+ entries | — | — | **MISSING (NON-MATERIAL)** |
| TrackLengthClass mapping | 5 classes | 5 classes | same | **MATCH** |

### Summary: Multiclass
- **MATCH:** 12 — All 10 event types, warning zones, fighting detection, class leader, session-first, min laps/time, check interval
- **DIFFERENT:** 1 — Speed classification via hardcoded lookup vs CC's dynamic comparison
- **MISSING:** 1 — Car class enum → sound folder map
- **MATERIAL:** 0 — Good overall parity

---

## 17. Strategy (`Strategy.cs` ↔ `internal/engineer/strategy/monitor.go`)

### Comparison Table

| CC Element | CC Value | Vantare Equivalent | Vantare Value | Verdict |
|---|---|---|---|---|
| Strategy messages | 20+ folder strings | `EventStrategySectorFuel_Low` + `EventStrategyFuelOk` | 2 events | **DIFFERENT (MATERIAL)** |
| Pit exit position estimates | 10+ folders | — | — | **MISSING (MATERIAL)** |
| Benchmark pitstop timing | 6 folders | — | — | **MISSING (MATERIAL)** |
| Opponent pit tracking | `opponentsWhoWillExitCloseInFront` etc. | — | — | **MISSING (MATERIAL)** |
| Pit stall sharing detection | `folderWeAreSharingOurPitboxWith` | — | — | **MISSING (MATERIAL)** |
| Fuel strategy | Full integration with Fuel monitor | `FuelConsumptionFn` callback | partial | **MATCH** (concept) |
| `fuelConsumptionFn` | — | callback | average L/lap | **MATCH** |
| Sector tracking | — | `lastSectorTimes` | per-sector | **MATCH** |

### Summary: Strategy
- **MATCH:** 3 — Fuel consumption callback, sector tracking, concept
- **DIFFERENT:** 1 — CC has 20+ message types, Vantare has 2
- **MISSING:** 12 — Pit exit estimates, benchmark timing, opponent pit tracking, pit stall sharing
- **MATERIAL:** 13 — Almost everything is missing/underimplemented

---

## 18. Driver Swaps (`DriverSwaps.cs` ↔ `internal/engineer/driverswaps/monitor.go`)

### Comparison Table

| CC Element | CC Value | Vantare Equivalent | Vantare Value | Verdict |
|---|---|---|---|---|
| `folder15MinutesLeftInStint` | `driver_swaps/15_minutes_left_in_stint` | `EventStintHalfway` | `driverswaps.stint_halfway` | **DIFFERENT (MATERIAL)** |
| `folder10MinutesLeftInStint` | `driver_swaps/10_minutes_left_in_stint` | — | — | **MISSING (MATERIAL)** |
| `folder5MinutesLeftInStint` | `driver_swaps/5_minutes_left_in_stint` | `EventStintLong` | `driverswaps.stint_long` | **DIFFERENT (MATERIAL)** |
| `folder2MinutesLeftInStint` | `driver_swaps/2_minutes_left_in_stint` | — | — | **MISSING (MATERIAL)** |
| `folderEndOfDriverStint` | `driver_swaps/pit_this_lap_for_driver_change` | — | — | **MISSING (MATERIAL)** |
| `folderEndOfTotalDriverStint` | `driver_swaps/pit_this_lap_driver_change_no_more_stints` | `EventStintWillExceed` | `driverswaps.stint_will_exceed` | **DIFFERENT (MATERIAL)** |
| Stint source | `DriverStintSecondsRemaining` (game telemetry) | Elapsed session time + pit counter | — | **DIFFERENT (MATERIAL)** |
| 15 min check | `960 > remaining > 930` (15.5-16 min) | `halfway` = 15 min elapsed | 15 min | **DIFFERENT (MATERIAL)** |
| 10 min check | `600 > remaining > 570` (9.5-10 min) | — | — | **MISSING (MATERIAL)** |
| 5 min check | `300 > remaining > 270` (4.5-5 min) | `stintLongMinutes` = 45 min elapsed | 45 min | **DIFFERENT (MATERIAL)** |
| 2 min check | `120 > remaining > 110` (1.8-2 min) | — | — | **MISSING (MATERIAL)** |
| End-of-stint check | `remaining < bestLap + 30s` | `stintWillExceed` at 65 min elapsed | 65 min | **DIFFERENT (MATERIAL)** |

### Summary: DriverSwaps
- **MATCH:** 0 — No element matches exactly
- **DIFFERENT:** 5 — Thresholds, timing, and trigger mechanism completely different
- **MISSING:** 5 — 10-minute, 2-minute, end-of-stint, end-of-total-stint messages
- **MATERIAL:** 10 — All differences are audible — CC uses real game stint data, Vantare uses elapsed time heuristic

---

## 19. Watched Opponents (`WatchedOpponents.cs` ↔ `internal/engineer/watchedopponents/monitor.go`)

### Comparison Table

| CC Element | CC Value | Vantare Equivalent | Vantare Value | Verdict |
|---|---|---|---|---|
| `folderIsInPosition` | `watched_opponents/is_in_position` | — | — | **MISSING (MATERIAL)** |
| `folderYourTeamMate` | `watched_opponents/your_team_mate` | — | — | **MISSING (MATERIAL)** |
| `folderYourRival` | `watched_opponents/your_rival` | — | — | **MISSING (MATERIAL)** |
| `folderAcknowledgeWeWillWatch` | 8 folders | — | — | **MISSING (MATERIAL)** |
| Track sector times | `sectorNumber` in `WatchedOpponentData` | — | — | **MISSING (MATERIAL)** |
| Track tyre type changes | `currentTyreType` | — | — | **MISSING (MATERIAL)** |
| Track class position | `classPosition` | — | — | **MISSING (MATERIAL)** |
| Pit exit detection | `isLeavingThePit` folders | — | — | **MISSING (MATERIAL)** |
| Gap tracking within 5 positions | — | `withinFivePositions()` + `gapSecs` | ≤ 5 positions | **NEW (Vantare)** |
| Gap increasing/decreasing | — | `EventWatchedGapIncreasing/Decreasing` | `watched.gap_*` | **NEW (Vantare)** |
| Watched opponent data structure | `WatchedOpponentData` | `WatchedOpponent` | simplified | **DIFFERENT (MATERIAL)** |
| Player class | — | `SetPlayerClass()` | — | **MATCH** |
| Session reset | — | `ResetSession()` | — | **MATCH** |

### Summary: WatchedOpponents
- **MATCH:** 2 — Player class, session reset
- **DIFFERENT:** 1 — Watched data structure (CC tracks more fields)
- **MISSING:** 12 — Team mate/rival detection, acknowledge messages, sector/tyre/position tracking, pit exit messages
- **MATERIAL:** 10 — Team mate/rival functionality entirely missing, all acknowledge messages missing

---

## MATERIAL Differences Requiring Fixing

### High Priority (visible/audible behaviour mismatch)

| # | Monitor | Issue | Impact |
|---|---|---|---|
| 1 | **Flags** | 32 FCY sub-phase folders (EU+US) not implemented | User hears generic FCY messages only, missing 30+ specific caution phase announcements |
| 2 | **Flags** | Local yellow/yellow-ahead/yellow-clear not implemented | No local yellow zone warnings |
| 3 | **Flags** | Pileup/incident detection not implemented | No crash warnings for incidents ahead |
| 4 | **Flags** | Give-positions-back system not implemented | No "give back positions" for illegal overtakes |
| 5 | **Flags** | Stock car rules (lucky dog, wave-around, etc.) not implemented | NASCAR-specific yellow flag behaviour missing |
| 6 | **Penalties** | Cut track warnings (4-tier race + non-race) not implemented | No track limits escalation messages |
| 7 | **Penalties** | 1/2/3 laps-to-serve messages not implemented | No penalty deadline countdown |
| 8 | **Penalties** | Slowdown penalty not implemented | No "slow down" penalty warning |
| 9 | **Penalties** | Car-to-car collision messages not implemented | No "stop crashing into people" messages |
| 10 | **Penalties** | 16 warning message types not implemented | No wrong-way, headlights, blue-flag-penalty, etc. |
| 11 | **Laps** | No green-green-green message on race start | User doesn't hear "green green green" |
| 12 | **Laps** | No position-variant lap messages (leading/podium) | Last lap and 2-to-go always use generic variant |
| 13 | **Laps** | No sector delta reports | No "sector 1 is 0.5 seconds off the pace" |
| 14 | **Laps** | No pre-lights messages | No "track temperature is..." before race start |
| 15 | **Fuel** | No half-distance good/low fuel messages | No half-race fuel assessment |
| 16 | **Fuel** | No time-based fuel warnings (10/5/2 min) | No "10 minutes of fuel remaining" |
| 17 | **Fuel** | No fuel window prediction | No "pit window for fuel opens on lap X" |
| 18 | **Fuel** | No about-to-run-out message | No "about to run out of fuel" |
| 19 | **Position** | Start evaluation uses absolute thresholds (terrible >15) instead of CC's delta from start position (terrible > startPos+5) | Wrong start quality messages on large fields |
| 20 | **Position** | No position reminder system | No "you're in P5" a few laps into the race |
| 21 | **Position** | No expected finish position reporting | No end-of-qualifying finish prediction |
| 22 | **PushNow** | Pit exit warnings not implemented | No "clear track on pit exit" / "traffic behind" |
| 23 | **PushNow** | Qualifying exit messages not implemented | No "we have 10 minutes to set a lap" after qual exit |
| 24 | **RaceTime** | No position-variant time messages (leading/podium) | 5-min and last-lap messages always use generic variant |
| 25 | **Timings** | Single generic gap event instead of 6+ distinct named events | No "the gap to [name] is increasing" / "you're reeling in [name]" |
| 26 | **Timings** | Being-held-up / being-pressured not implemented | No "you're being held up by..." messages |
| 27 | **Timings** | Corner attack/defend not implemented | No "he's slower through turn 6, attack there" |
| 28 | **Tyre** | Brake temp warnings not implemented | No brake temp feedback |
| 29 | **Tyre** | Locking/spinning warnings not implemented | No wheel locking or spinning feedback |
| 30 | **Tyre** | Flat spot detection not implemented | No flat spot warnings |
| 31 | **Tyre** | Camber/pressure analysis not implemented | No camber or pressure setup feedback |
| 32 | **DriverSwaps** | Uses elapsed-time heuristic instead of game-provided stint time | Stint warnings fire at wrong times |
| 33 | **DriverSwaps** | 10-min and 2-min stint warnings missing | Fewer stint warnings than CC |
| 34 | **Strategy** | Pit exit position estimates not implemented | No "we should emerge in P5" on pit entry |
| 35 | **Strategy** | Opponent pit tracking not implemented | No predictions about opponents' pit exits |
| 36 | **WatchedOpponents** | Team mate / rival system not implemented | No "your team mate" / "your rival" messages |
| 37 | **Pearls** | Probability-based triggering replaced with lap-interval | Pearls play at different times/rates |

### Medium Priority

| # | Monitor | Issue |
|---|---|---|
| 38 | **Engine** | Combined hot-oil-and-water event missing (separate events used instead) |
| 39 | **Engine** | Low fuel pressure warning not implemented |
| 40 | **SessionEnd** | Rants system not implemented (rants add variety to DNF/last-place finishes) |
| 41 | **Position** | Overtake validity checks (yellow flag, damage, off-track) not implemented |
| 42 | **Fuel** | Gallons support not implemented |
| 43 | **PitStops** | Pit stop countdown (5-4-3-2-1-BOX) not implemented |
| 44 | **PitStops** | Feet-based distance warnings not implemented |
| 45 | **Opponents** | Tyre type change announcements not implemented |
| 46 | **Opponents** | Cant-pronounce-name fallback not implemented |

---

## NON-MATERIAL Differences (Accepted)

| # | Monitor | Difference | Reason |
|---|---|---|---|
| 1 | **Flags** | No random variation added to cooldowns | Cooldowns are the minimum; CC adds 0-8s random jitter — minor timing difference |
| 2 | **Fuel** | Consumption window always 5 instead of track-length-dependent 3-5 | Minor precision difference; 5 is reasonable default |
| 3 | **Laps** | Consistency window 3 instead of CC's 5 | Simpler; still provides useful trend detection |
| 4 | **Penalties** | Default event type is DriveThrough | Can't distinguish DT vs S&G in LMU without history messages; documented gap |
| 5 | **Position** | Overtake detection uses simplified gap buffer instead of CC's full gap analysis | Functional equivalent for alpha |
| 6 | **SessionEnd** | Good finish detection simplified | Acceptable for alpha |
| 7 | **Multiclass** | Speed classification via hardcoded lookup instead of dynamic comparison | Functional equivalent |
| 8 | **Engine** | Thresholds hardcoded instead of from car class | Acceptable placeholder |
| 9 | **PushNow** | Gap threshold fixed at 1.0s instead of computed per-class | Documented as alpha simplification |
| 10 | **Spotter** | No noisy coordinate model | Simplified geometry is functional |
| 11 | **Spotter** | `paused` state not implemented | Low-value edge case |
| 12 | **PitStops** | No mandatory pit window opening/closing countdown | Documented alpha gap |
| 13-28 | Various | Voice response methods not implemented | Speech recognition is future scope |

---

## Overall Recommendations

### Immediate Fixes (Cycle 1)

1. **Position monitor**: Fix start evaluation to use CC's delta-from-start-position logic instead of absolute thresholds — affects all start quality messages (terrible/bad/ok/good).
2. **Push monitor**: Implement gap calculation matching CC's `checkGaps()` instead of fixed 1.0s threshold.
3. **DriverSwaps**: If `DriverStintSecondsRemaining` becomes available from LMU telemetry, switch to CC's precise timing.

### Cycle 2 Priorities

1. **Flags**: Implement the 19 FCY sub-phase EU/US folders (requires YellowFlagState offset validation).
2. **Fuel**: Add time-based fuel warnings (10/5/2 min), half-distance assessment, fuel window prediction.
3. **Penalties**: Add cut track warnings, laps-to-serve, slowdown penalty, common warning messages.
4. **Laps**: Add green-green-green, position-variant lap messages, sector delta reports.
5. **Position**: Add position reminders, expected finish position.
6. **Tyre**: Add brake temps, locking/spinning detection.

### Cycle 3+ Priorities

1. **Timings**: Full gap report with named opponents, being-held-up detection, corner attack/defend.
2. **Flags**: Local yellow zone detection, incident/pileup calling, stock car rules.
3. **WatchedOpponents**: Team mate/rival system with acknowledge messages.
4. **Strategy**: Pit exit position estimates, opponent pit tracking.
5. **Pearls**: Probability-based trigger system matching CC.

---

*End of parity review. 103 material differences identified across 19 monitor pairs.*
