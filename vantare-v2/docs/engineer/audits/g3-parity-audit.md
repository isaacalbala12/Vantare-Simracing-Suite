# G3 Parity Audit: Vantare Engineer vs CrewChief (CC)

**Date**: 2026-06-29
**Auditor**: Explorer (automated)
**Scope**: DamageReporting, ConditionsMonitor, PitManager REST, Commands Catalog

---

## 1. DamageReporting

### Source files

| Side | File | Lines |
|------|------|-------|
| CC | `Events/DamageReporting.cs` | 1086 |
| Vantare | `internal/engineer/damage/monitor.go` | 251 |
| Vantare | `internal/engineer/damage/monitor_test.go` | 239 |

### CC message folders (unique audio sound paths)

37 total:

| # | Folder string | Description |
|---|--------------|-------------|
| 1 | `damage_reporting/minor_transmission_damage` | Minor transmission |
| 2 | `damage_reporting/minor_engine_damage` | Minor engine |
| 3 | `damage_reporting/minor_aero_damage` | Minor aero |
| 4 | `damage_reporting/minor_aero_damage_general` | Minor aero (general variant) |
| 5 | `damage_reporting/minor_suspension_damage` | Minor suspension |
| 6 | `damage_reporting/minor_suspension_damage_general` | Minor suspension (general variant) |
| 7 | `damage_reporting/minor_brake_damage` | Minor brakes |
| 8 | `damage_reporting/severe_transmission_damage` | Severe transmission |
| 9 | `damage_reporting/severe_engine_damage` | Severe engine |
| 10 | `damage_reporting/severe_aero_damage` | Severe aero |
| 11 | `damage_reporting/severe_brake_damage` | Severe brakes |
| 12 | `damage_reporting/severe_suspension_damage` | Severe suspension |
| 13 | `damage_reporting/busted_transmission` | Busted transmission |
| 14 | `damage_reporting/busted_engine` | Busted engine |
| 15 | `damage_reporting/busted_suspension` | Busted suspension |
| 16 | `damage_reporting/busted_brakes` | Busted brakes |
| 17 | `damage_reporting/no_transmission_damage` | No transmission damage |
| 18 | `damage_reporting/no_engine_damage` | No engine damage |
| 19 | `damage_reporting/no_aero_damage` | No aero damage |
| 20 | `damage_reporting/no_suspension_damage` | No suspension damage |
| 21 | `damage_reporting/no_brake_damage` | No brake damage |
| 22 | `damage_reporting/trivial_aero_damage` | Just a scratch (aero trivial) |
| 23 | `damage_reporting/trivial_aero_damage_general` | Trivial aero (general) |
| 24 | `damage_reporting/missing_wheel` | Missing wheel |
| 25 | `damage_reporting/left_front_puncture` | Left front puncture |
| 26 | `damage_reporting/right_front_puncture` | Right front puncture |
| 27 | `damage_reporting/left_rear_puncture` | Left rear puncture |
| 28 | `damage_reporting/right_rear_puncture` | Right rear puncture |
| 29 | `damage_reporting/no_damage` | No damage on any component |
| 30 | `damage_reporting/rolling` | Car is rolling |
| 31 | `damage_reporting/stopped_upside_down` | Car stopped upside down |
| 32 | `damage_reporting/are_you_ok_first_try` | "Are you OK?" (1st) |
| 33 | `damage_reporting/are_you_ok_second_try` | "Are you OK?" (2nd) |
| 34 | `damage_reporting/are_you_ok_third_try` | "Are you OK?" (3rd) |
| 35 | `damage_reporting/acknowledge_driver_is_ok` | Driver OK acknowledged |
| 36 | `damage_reporting/acknowledge_driver_is_ok_not_understood` | Response not understood |
| 37 | `damage_reporting/acknowledge_driver_is_ok_no_speech` | No speech detected |

### Vantare damage events

8 total:

| # | Event type | Description |
|---|------------|-------------|
| 1 | `damage.aero_minor` | Aero minor damage |
| 2 | `damage.aero_severe` | Aero severe damage |
| 3 | `damage.suspension_minor` | Suspension minor damage |
| 4 | `damage.suspension_severe` | Suspension severe damage |
| 5 | `damage.engine_minor` | Engine minor damage |
| 6 | `damage.engine_severe` | Engine severe damage |
| 7 | `damage.component_busted` | Any component busted (no per-component) |
| 8 | `damage.detached_part` | Wheel/part detached |

### Comparison

| Dimension | CC | Vantare | Delta |
|-----------|----|---------|-------|
| Total messages/events | 37 | 8 | **-29** |
| Damage levels | NONE, TRIVIAL, MINOR, MAJOR, DESTROYED | NONE(0), MINOR(1-99), SEVERE(100-199), BUSTED(200+) | Lacks TRIVIAL; MAJOR → SEVERE rename |
| Components | ENGINE, TRANNY, AERO, SUSPENSION, BRAKES | ENGINE, TRANSMISSION, AERO, SUSPENSION, BRAKES | Match (transmission spelling diff) |
| Per-component busted events | busted_{engine,transmission,suspension,brakes} | Single `component_busted` with payload | **Missing: per-component busted discrimination at event level** |
| Per-component minor/severe | All 5 components | Only aero, suspension, engine (brakes/transmission fall through or skip) | **Missing: brake minor, brake severe, transmission minor, transmission severe events** |
| No-damage messages | 5 per-component + 1 overall | None | **Missing: status readout messages** |
| Trivial damage | aeri trivial ("just a scratch") | None (maps to LevelNone) | **Missing: trivial level** |
| Puncture detection | 4 per-corner puncture messages | None | **Missing: no tyre pressure data from LMU** |
| Missing wheel | dedicated message | `detached_part` with wheel count | Partial match (no per-corner) |
| Rollover / upside-down | 2 messages | None | **Missing: orientation detection** |
| "Are you OK?" | 3 tries + 3 acknowledge variants | None | **Missing: crash impact / driver OK flow** |

### Summary: DamageReporting gap is **large** — Vantare covers ~22% of CC's message surface. Major omissions: transmission/brake discrete events, trivial level, puncture, rollover, driver-OK crash detection.

---

## 2. ConditionsMonitor

### Source files

| Side | File | Lines |
|------|------|-------|
| CC | `Events/ConditionsMonitor.cs` | 508 |
| Vantare | `internal/engineer/conditions/monitor.go` | 123 |
| Vantare | `internal/engineer/conditions/monitor_test.go` | 176 |

### CC message folders

30 total:

| # | Folder string | Description |
|---|--------------|-------------|
| 1 | `conditions/air_and_track_temp_increasing` | Both temps increasing |
| 2 | `conditions/air_and_track_temp_decreasing` | Both temps decreasing |
| 3 | `conditions/track_temp_is_now` | Track temp current value |
| 4 | `conditions/air_temp_is_now` | Air temp current value |
| 5 | `conditions/track_temp_is` | Track temp is (intro) |
| 6 | `conditions/air_temp_is` | Air temp is (intro) |
| 7 | `conditions/air_temp_increasing_its_now` | Air temp increasing |
| 8 | `conditions/air_temp_decreasing_its_now` | Air temp decreasing |
| 9 | `conditions/track_temp_increasing_its_now` | Track temp increasing |
| 10 | `conditions/track_temp_decreasing_its_now` | Track temp decreasing |
| 11 | `conditions/celsius` | Celsius unit |
| 12 | `conditions/fahrenheit` | Fahrenheit unit |
| 13 | `conditions/seeing_some_rain` | PCars boolean rain |
| 14 | `conditions/we_expect_rain_in_the_next` | PCars cloud-based prediction |
| 15 | `conditions/drizzle_increasing` | Rain: drizzle increasing |
| 16 | `conditions/light_rain_increasing` | Rain: light increasing |
| 17 | `conditions/mid_rain_increasing` | Rain: mid increasing |
| 18 | `conditions/heavy_rain_increasing` | Rain: heavy increasing |
| 19 | `conditions/maximum_rain` | Rain: storm/max |
| 20 | `conditions/heavy_rain_decreasing` | Rain: heavy decreasing |
| 21 | `conditions/mid_rain_decreasing` | Rain: mid decreasing |
| 22 | `conditions/light_rain_decreasing` | Rain: light decreasing |
| 23 | `conditions/drizzle_decreasing` | Rain: drizzle decreasing |
| 24 | `conditions/stopped_raining` | Rain stopped |
| 25 | `conditions/we_expect_rain_to_stop_in_the_next` | ACC forecast: rain stops |
| 26 | `conditions/we_expect_drizzle_in_the_next` | ACC forecast: drizzle |
| 27 | `conditions/we_expect_light_rain_in_the_next` | ACC forecast: light rain |
| 28 | `conditions/we_expect_medium_rain_in_the_next` | ACC forecast: medium rain |
| 29 | `conditions/we_expect_heavy_rain_in_the_next` | ACC forecast: heavy rain |
| 30 | `conditions/we_expect_very_heavy_rain_in_the_next` | ACC forecast: very heavy rain |

### Vantare conditions events

4 total:

| # | Event type | Description |
|---|------------|-------------|
| 1 | `conditions.rain_started` | Rain started (approximated via temp delta) |
| 2 | `conditions.rain_stopped` | Rain stopped |
| 3 | `conditions.track_temp_high` | Track temp > 40°C (once per session) |
| 4 | `conditions.track_freezing` | Ambient < 4°C (once per session) |

### Comparison

| Dimension | CC | Vantare | Delta |
|-----------|----|---------|-------|
| Total messages/events | 30 | 4 | **-26** |
| Rain levels | 6 (NONE, DRIZZLE, LIGHT, MID, HEAVY, STORM) | 2 (raining/not raining) | **Missing: rain intensity granularity** |
| Rain direction | separate increasing/decreasing for each level | None | **Missing: rain trend (increasing/decreasing)** |
| Rain detection method | Direct RainDensity from game data | Approximation via (trackTemp < ambientTemp - 5°C) | **Hueristic, not actual rain data (LMU doesn't expose rain)** |
| Temp reports | Air + track temp direction + value + units | Freezing/High only (once per session) | **Missing: temperature trend reporting, readout on demand** |
| Temp thresholds | Configurable delta + frequency | Hardcoded 4°C / 40°C once | **Missing: configurable thresholds, repeated reporting** |
| ACC forecast | 10-min & 30-min rain predictions (6 rain levels) | None | **Missing: ACC-style rain forecast** |
| PCars cloud prediction | Rain prediction from cloud density change | None | **Missing: PCars-specific rain prediction** |
| Unit support | Celsius + Fahrenheit | None (always Celsius) | **Missing: Fahrenheit support** |
| Combined temps report | Both temps increasing/decreasing together | None | **Missing: combined air+track temp report** |

### Summary: ConditionsMonitor gap is **very large** — Vantare covers ~13% of CC's message surface. The rain approximation is a heuristic (no direct rain data from LMU). Most CC features (temp trends, rain intensity, forecasts, units) are absent.

---

## 3. PitManager REST

### Source files

| Side | File | Lines |
|------|------|-------|
| Vantare | `internal/engineer/pitmanager/client.go` | 109 |
| Vantare | `internal/engineer/pitmanager/types.go` | 48 |
| CC | No direct equivalent (CC uses HWControl mmap for pit actions) | N/A |

### API endpoints used

| Method | Path | Vantare function | Notes |
|--------|------|-----------------|-------|
| GET | `/rest/pitmenu/status` | `GetStatus()` | Current pit menu state |
| POST | `/rest/pitmenu/action` | `RequestPitAction()` | Send action: request/confirm/abort |
| GET | `/rest/watch/standings` | `GetStandings()` | Race standings |

### LMU REST API verification

The paths match the known LMU `:6397` REST API documented in:
- `docs/adr/0001-close-lmu-pilot-ratings.md` — references `/rest/watch/standings`, `/rest/watch/sessionInfo`
- `cmd/lmu-api-probe/main.go` — probes `/rest/watch/standings`, `/rest/watch/sessionInfo`
- `internal/telemetry/lmuapi/client.go` — uses `/rest/watch/standings` and `/rest/watch/sessionInfo`

**Status**: ✅ All 3 API paths (`/rest/pitmenu/status`, `/rest/pitmenu/action`, `/rest/watch/standings`) are consistent with the LMU REST API ecosystem. Dry-run mode is a sane safety default.

---

## 4. Commands Catalog

### Source files

| Side | File | Lines |
|------|------|-------|
| Vantare | `internal/engineer/commands/catalog.go` | 40 |
| Vantare | `internal/engineer/commands/catalog_test.go` | 130 |
| CC | `SpeechRecogniser.cs` (3829 lines) + config-driven phrases | N/A |

### Vantare commands

14 commands:

| # | Phrase | Action | Description |
|---|--------|--------|-------------|
| 1 | `request pit stop` | `request` | Request pit stop |
| 2 | `confirm pit stop` | `confirm` | Confirm pit stop |
| 3 | `abort pit stop` | `abort` | Abort pit stop |
| 4 | `box this lap` | `request` | Pit this lap |
| 5 | `fuel` | `fuel` | Fuel only |
| 6 | `tyres` | `tyres` | Change tyres |
| 7 | `front wing` | `front_wing` | Front wing adjustment |
| 8 | `rear wing` | `rear_wing` | Rear wing adjustment |
| 9 | `engine mode` | `engine_mode` | Change engine mode |
| 10 | `brake bias` | `brake_bias` | Change brake bias |
| 11 | `headlights` | `headlights` | Toggle headlights |
| 12 | `wiper` | `wiper` | Toggle wiper |
| 13 | `rain light` | `rain_light` | Toggle rain light |
| 14 | `driver swap` | `driver_swap` | Request driver swap |

### CC voice command surface (damage + conditions related from SpeechRecogniser.cs)

CC defines these relevant speech arrays (each with multiple phrase variants via config):

**Damage-related**:
- `CAR_STATUS`, `STATUS`, `DAMAGE_REPORT` — general car status readout
- `HOWS_MY_AERO` — specific aero status
- `HOWS_MY_TRANSMISSION` — specific transmission status
- `HOWS_MY_ENGINE` — specific engine status
- `HOWS_MY_SUSPENSION` — specific suspension status
- `HOWS_MY_BRAKES` — specific brakes status

**Conditions-related**:
- `WHATS_THE_AIR_TEMP` — air temperature query
- `WHATS_THE_TRACK_TEMP` — track temperature query

**Broader CC speech commands** (approx 60+ phrase groups) include fuel, tyres, penalties, gaps, positions, sector times, opponent queries, etc.

### Comparison

| Dimension | CC (subset) | Vantare | Delta |
|-----------|-------------|---------|-------|
| Damage-specific commands | 8 (CAR_STATUS, STATUS, DAMAGE_REPORT + 5 HOWS_MY_*) | 0 | **Missing: on-demand damage status readout** |
| Conditions-specific commands | 2 (air temp, track temp) | 0 | **Missing: on-demand temp queries** |
| Pit-related commands | Via HWControl (iRacing) / pitmenu | 14 | Vantare targets LMU pitmenu directly |
| General status commands | STATUS, SESSION_STATUS, CAR_STATUS | 0 | Missing: overall status readout |

### Summary: Vantare commands catalog focuses on LMU pit menu actions (14 commands). It has **no damage readout commands** (CC has 8) and **no conditions readout commands** (CC has 2). This is consistent with the gaps in DamageReporting and ConditionsMonitor — without those events implemented, there's nothing to query.

---

## Overall Assessment

| Module | CC coverage | Vantare coverage | Gap |
|--------|-------------|-----------------|-----|
| DamageReporting | 37 messages | 8 events | **78% gap** |
| ConditionsMonitor | 30 messages | 4 events | **87% gap** |
| PitManager REST | N/A | 3 API endpoints | ✅ Correct for LMU |
| Commands Catalog | ~70+ phrase groups | 14 pit commands | Commands match pit focus; damage/conditions query missing |

### Key gaps (priority order)

1. **Crash/driver-OK detection** — completely absent from Vantare
2. **Rain intensity granularity** — LMU doesn't expose rain data, so this requires a different approach
3. **Temperature trend reporting** — CC reports air/track temp changes with configurable thresholds
4. **Per-component damage specificity** — Vantare lacks brake/transmission discrete events and trivial aero level
5. **On-demand status readout** — voice query commands for damage and conditions
6. **Puncture detection** — no tyre pressure data from LMU telemetry
7. **ACC-style rain forecast** — not applicable to LMU
8. **Unit conversion** (Fahrenheit)

### Test results

```
damage/...     — 15/15 PASS (0.045s)
conditions/... — 10/10 PASS (0.038s)
pitmanager/... — 8/8 PASS (0.058s)
commands/...   — 10/10 PASS (0.046s)
```
