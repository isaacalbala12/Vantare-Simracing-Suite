> **Plan status: historical**
> Snapshot conservado como evidencia. No autoriza ejecución. Las referencias a
> `docs/current-plan.md`, `develop`, `refactor`, ramas, bases o siguientes
> acciones son históricas y quedan sustituidas por Linear y Git.

# ISA-129 / TC-07A.1 — Canonical Overlay Signals and Honest Runtime Plan

> **Execution contract:** implement each microcut with TDD, commit it
> independently, request adversarial review, and resolve every P0/P1/P2 and
> reasonable P3 before moving to the next microcut.

**Goal:** make the single modular LMU runtime capable of publishing an honest,
multivehicle canonical state for Overlay consumers, while removing every
production path that presents synthetic telemetry as a live connection.

**Base:** ISA-105 / TC-07A,
`c9acee24cf4c4d80922b380b12f7367c2a60c937`.

**Branch:**
`vantareapp/isa-129-tc-07a1-senales-canonicas-overlay-y-retirada-del-mock`.

**Worktree:** `C:\tmp\vantare-isa129\vantare-v2`.

**Linear:** ISA-129, before ISA-106.

**Architecture:** retain one `core.DriverManager` and one LMU driver. Shared
Memory and LMU REST remain complementary at field level. The driver emits
source observations; an LMU-specific stateful mapper converts canonical LMU
observations into `core.Batch`; the generic reducer, derivations, fan-out and
product projections remain simulator-neutral.

**Scope boundary:** no CSS, renderer, canvas, drag/resize, visual baseline,
layout, navigation, product cutover or promotion. No new dependency. No second
Shared Memory reader. No mock value may become production telemetry.

---

## 1. Evidence and decisions already closed

### 1.1 Confirmed blockers

1. Production injects `createMockSource()`. Its synthetic `Spa` /
   `TestDriver` buffer reaches `Normalizer` as `Connected=true`, then Wails and
   SSE publish it to Studio/Desktop/OBS.
2. No production adapter exists from `lmu.Observation` to `core.Batch`.
3. The modular LMU observation contains only player fields; it does not expose
   a stable multivehicle grid.
4. The currently running LMU executable is `1.4.0.0`; the driver allowlist only
   accepts `1.3.0.0`.
5. The modular REST fixture is synthetic and player-only. It is not evidence
   for team, car number or full-grid semantics.
6. `withFreshness` omits `InPit`.
7. Engineer starts a separate production simulator as connected. That is a
   blocking Engineer debt, not an excuse to widen ISA-129.

### 1.2 Existing real evidence

- `testdata/lmu-fixture.bin`: sanitized LMU 1.3 track capture, 44 vehicles,
  SHA-256
  `959c51421529c6157371678d8db9bcbbdc8ab3780bd5557828f2bc0d2225e5ff`.
- `testdata/lmu-menu-fixture.bin`: sanitized LMU 1.3 menu capture, SHA-256
  `8fc09829441e11a466bc9ff92e1a667b819eb6cf83cdf16891d7ed756d887f1a`.
- Audited object size: 324820 bytes.
- Audited scoring rows: offset 2192, stride 584, maximum 104.
- Audited telemetry rows: offset 128468, stride 1888.
- The track fixture declares `mNumVehicles=44`. Its first 44 scoring IDs and
  first 44 telemetry IDs are independently unique and form the same exact set.
  The unique scoring player is row 43 with ID `0`, which maps only to active
  telemetry row 43. All 60 inactive telemetry rows after `mNumVehicles` are
  zero-filled and also expose ID `0`; this proves that scanning all 104 rows by
  ID is invalid.

### 1.3 Signal rules

- False and zero are valid observed values.
- Missing, stale and invalid are different states.
- A signal is canonical only after its source, unit, range, reference, sign,
  freshness and provenance are documented and tested.
- Driver name, team, car number and external IDs are never used as session
  identity.
- Vehicle ID comes from the LMU scoring/telemetry numeric ID. Position is never
  an identity fallback.
- Scoring and telemetry are correlated only inside the active half-open range
  `[0,mNumVehicles)`. Both active ID lists must contain unique non-negative IDs
  and must be an exact bijection. Inactive tail rows are ignored. The player is
  selected from the unique active scoring `mIsPlayer` row and then joined to
  the unique active telemetry row with the same ID. `mPlayerVehicleIdx` and
  `mPlayerHasVehicle` are not selection authorities. Any active-range
  non-bijection rejects the frame atomically; position or full-array scans are
  forbidden fallbacks.
- Speed is canonical in m/s. The TypeScript adapter converts to km/h exactly by
  multiplying by 3.6.
- Same-lap relative gap uses:

  `player.timeBehindLeader - vehicle.timeBehindLeader`

  Positive means the other vehicle is ahead of the player; negative means it
  is behind. Lapped cars use an explicit lap delta and do not receive invented
  seconds.
- Delta uses an actual completed player lap as reference. Positive means the
  current lap is slower than the reference; negative means faster. The legacy
  constant-speed synthetic reference and a raw zero `mDeltaBest` are not
  canonical evidence.
- Fuel is admitted only as liters after the live value and capacity pass
  finite/non-negative/capacity invariants. `FuelFraction` never substitutes for
  liters.
- Virtual Energy is a separate future signal and remains missing in this cut.
- Team, number, tyre compound, damage and unsupported weather remain missing
  until real evidence exists.

### 1.4 Admission matrix: exact evidence per signal

The layout authority is the pinned rFactor 2/LMU-compatible API declaration at
[`InternalsPlugin.hpp@48aa12d`](https://github.com/TheIronWolfModding/rF2SharedMemoryMapPlugin/blob/48aa12dbb68849923870acd8e68044c46c3d83eb/Include/InternalsPlugin.hpp).
The offsets are independently reproduced by the existing Vantare fixtures and
the local LMU reader used only as provenance. Windows `long` is treated as
32-bit. Every row below is a hard allowlist: D3-D7 may implement only these
rows. A row with pending LMU 1.4 evidence may be exercised against 1.3 fixtures
but may not be enabled for 1.4 production until D4B closes.

All observed Shared Memory fields inherit the frame's `500 ms` freshness
policy. A derived field inherits the least-fresh required input. Text is
bounded at its declared fixed array and copied into owned memory.

| Canonical signal | Source member | Offset and source type | Unit, reference and admitted range | Evidence and decision |
|---|---|---|---|---|
| Track name | `ScoringInfoV01.mTrackName` | absolute `1632`, `char[64]` | bounded display text; never identity | Primary declaration plus 1.3 menu/track fixtures. Admit; sanitize in stored evidence. |
| Session type | `ScoringInfoV01.mSession` | absolute `1696`, `int32` | `0` test, `1..4` practice, `5..8` qualifying, `9` warmup, `10..13` race | Primary enum plus fixture. Admit through existing closed canonical session mapping; unknown code is invalid. |
| Source/current time | `ScoringInfoV01.mCurrentET` | absolute `1700`, `float64` | seconds since current session clock; finite and `>= 0` | Primary declaration plus fixture value `112.6`. Admit. |
| Session end time | `ScoringInfoV01.mEndET` | absolute `1708`, `float64` | seconds on the same clock as current time; finite and `>= current` | Primary declaration plus fixture value `3605`. Admit. |
| Maximum laps | `ScoringInfoV01.mMaxLaps` | absolute `1716`, `int32` | count `>= 0`; zero is a valid timed-session value | Primary declaration plus fixture zero. Admit. |
| Vehicle count | `ScoringInfoV01.mNumVehicles` | absolute `1736`, `int32` | count `0..104` | Primary declaration plus real 44-row fixture. Admit and require exact parsed-row agreement. |
| Vehicle source slot | `VehicleScoringInfoV01.mID` | scoring row `+0`, `int32` | opaque non-negative source slot, not position and not durable after vacancy | Primary declaration explicitly warns that a slot can be reused. Admit only through the generation policy in §2.4. |
| Driver label | `mDriverName` | row `+4`, `char[32]` | display text only; forbidden in canonical IDs and diagnostic evidence | Primary declaration; real fixture is sanitized to aliases. Admit for product display. |
| Vehicle label | `mVehicleName` | row `+36`, `char[64]` | display text only | Primary declaration plus sanitized fixture. Admit. |
| Completed laps | `mTotalLaps` | row `+100`, `int16` | count `>= 0`; zero valid | Primary declaration plus fixture. Admit. |
| Scoring sector | `mSector` | row `+102`, `int8` | source enum `0=sector3`, `1=sector1`, `2=sector2` | Primary enum plus all three fixture values. Admit exact mapping only. |
| Lap distance | `mLapDist` | row `+104`, `float64` | meters around track; finite `>= 0` is present, any finite negative sentinel is normalized to missing | Primary unit plus 1.3 fixture maximum `3982.366455078125` and live LMU 1.4 D4B probe with a negative sentinel. Admit without inventing zero. |
| Best lap | `mBestLapTime` | row `+144`, `float64` | seconds; present only when finite and `> 0` | Primary timing field; real `-1` sentinel proves non-positive must be missing. Admit. |
| Last lap | `mLastLapTime` | row `+168`, `float64` | seconds; present only when finite and `> 0` | Primary timing field; fixture zero means no demonstrated completed lap and is normalized to missing. Admit. |
| Pit-stop count | `mNumPitstops` | row `+192`, `int16` | count `>= 0`; zero valid | Primary declaration plus fixture. Admit. |
| Penalty count | `mNumPenalties` | row `+194`, `int16` | outstanding count `>= 0`; zero valid | Primary declaration plus fixture. Admit. |
| Player marker | `mIsPlayer` | row `+196`, one-byte C++ `bool` | exact byte `0/1`; exactly zero or one player per frame | Primary declaration plus real unique player. Admit; any other byte or multiple players rejects the frame. |
| In pits | `mInPits` | row `+198`, one-byte C++ `bool` | between pit entrance and exit; exact byte `0/1` | Primary declaration warns remote accuracy is imperfect. Admit as observed fact, not garage/pit-box state, and stale it with the frame. |
| Position | `mPlace` | row `+199`, `uint8` | one-based `1..104` | Primary declaration plus unique fixture range `1..44`. Admit; never identity. |
| Vehicle class | `mVehicleClass` | row `+200`, `char[32]` | display/grouping text | Primary declaration plus sanitized fixture. Admit. |
| Time behind next | `mTimeBehindNext` | row `+232`, `float64` | seconds behind next higher place; finite `>= 0` is present, any finite negative sentinel is normalized to missing | Primary reference plus 1.3 fixture `0..17.88` and live LMU 1.4 D4B probe with a negative sentinel. Admit without inventing zero. |
| Laps behind next | `mLapsBehindNext` | row `+240`, `int32` | lap count `>= 0` | Primary reference plus fixture zero. Admit. |
| Time behind leader | `mTimeBehindLeader` | row `+244`, `float64` | seconds behind leader; finite `>= 0` is present, any finite negative sentinel is normalized to missing | Primary reference plus 1.3 fixture `0..85.08` and live LMU 1.4 D4B probe with a negative sentinel. Admit without inventing zero. |
| Laps behind leader | `mLapsBehindLeader` | row `+252`, `int32` | lap count `>= 0` | Primary reference plus fixture zero. Admit. |
| Estimated lap | `mEstimatedLapTime` | row `+472`, `float64` | seconds; present only when finite and `> 0` | Primary declaration and real values around `98.632`. Admit as observed estimate with explicit provenance. |
| Active telemetry grid correlation | `VehicleTelemetryInfoV01.mID` | telemetry row `+0`, `int32`; only rows `[0,mNumVehicles)` | active IDs must be unique, non-negative and an exact bijection with active scoring IDs; inactive tail ignored | Real fixture: 44/44 unique equal sets; all 60 inactive tail IDs are zero. Admit. Any active mismatch, duplicate or negative ID rejects the complete frame. Never scan all 104 rows or select by header index/position. |
| Player telemetry correlation | scoring `mIsPlayer` plus matching active telemetry `mID` | unique scoring row inside `[0,mNumVehicles)`, then unique equal-ID telemetry row inside the same active range | zero or one active scoring player; if present, the equal-ID telemetry row is the sole authority for fast player fields | Real fixture player is scoring row 43, ID `0`, correlated to active telemetry row 43. `mPlayerVehicleIdx` and `mPlayerHasVehicle` are not selection authorities. No player means fast fields missing; a broken active-grid bijection rejects the frame atomically. |
| Player lap number | `mLapNumber` | telemetry row `+20`, `int32` | count `>= 0` | Existing modular parser plus fixture. Admit. |
| Player local velocity | `mLocalVel` | row `+184/+192/+200`, three `float64` | m/s per primary API; magnitude is canonical speed, finite and `>= 0` | Primary unit plus fixture. Admit. |
| Gear / RPM | `mGear`, `mEngineRPM` | row `+352` `int32`; `+356` `float64` | gear is source integer; RPM finite and `>= 0` | Existing parser plus fixture. Admit without inventing extra gear labels. |
| Player controls | `mFilteredThrottle`, `mFilteredBrake`, `mFilteredClutch` | row `+420/+428/+444`, three `float64` | ratios `0..1`; zero valid | Primary ranges plus fixture. Admit. |
| Fuel / capacity | `mFuel`, `mFuelCapacity` | row `+524/+608`, two `float64` | liters; finite, `capacity > 0`, `0 <= fuel <= capacity` | Primary source explicitly states liters; fixture player `99.586.../100`. Admit for player only. |
| Session remaining | derived from end/current | no raw offset | seconds, `end-current`, only when both inputs are fresh, finite and ordered; zero valid | Fixture disproves `mSessionTimeRemaining` as authority. Admit derived value only. |
| Relative gap | derived from leader/lap fields | no raw offset | positive other car ahead, negative behind; seconds only on same lap, otherwise lap delta only | Formula and source references in §1.3. Admit derived value. |
| Player delta | derived from completed player lap samples | no raw offset | positive slower, negative faster; reference=`best-completed-player-lap` | No raw LMU delta evidence. Admit only after D6 validates a real completed reference lap. |

Explicitly excluded from D3-D7:

- `mGamePhase`, `mYellowFlagState`, sector flags, vehicle flag and pit-state
  labels: structure is known, but LMU-specific non-zero transitions are not yet
  captured and correlated. Keep them diagnostic-only and missing in Overlay.
- `mSessionTimeRemaining`: the real fixture reports `0` while
  `mEndET-mCurrentET` is about `3492.4`; never treat it as authority.
- `mFuelFraction`: observed fixture bytes are non-semantic/noisy.
- native `mDeltaBest`: no non-zero LMU trace proves sign or reference.
- team, car number, compound, Virtual Energy, damage and weather: no admitted
  source/evidence in this cut.

### 1.5 Field-level Shared Memory / REST authority matrix

There is no global source authority. Shared Memory is the real, atomic,
multivehicle source. REST remains a timed complementary source only for fields
it actually publishes and only at player/session scope. Shared Memory freshness
is `500 ms`; REST TTL is `2 s`.

For exact enum/text/count/bool fields, disagreement means unequal normalized
values. For source time, compare both values projected to the decision instant
using their monotonic receive age; a difference greater than the SHM freshness
limit (`500 ms`) is a conflict. Conflicts are bounded diagnostics: they never
replace the preferred value. `0` and `false` remain valid observed values and
participate in comparison.

| Signal/family | Preferred | Alternative | Equivalence and scope | Stale/conflict policy |
|---|---|---|---|---|
| Current/source time | SHM, session-wide | REST `currentEventTime`, session-wide | Same session clock after monotonic age adjustment; tolerance `500 ms` | Fresh SHM wins; fresh REST is fallback only if SHM unusable; stale values retain preferred-first order; conflict recorded above tolerance. |
| Track name | SHM, session-wide | REST `trackName`, session-wide | Exact after the same trim/normalization | SHM wins disagreement; REST may fill only missing/stale-unusable SHM. |
| Session type | SHM, session-wide | REST parsed closed enum, session-wide | Exact canonical enum | Same policy; unknown REST enum never overrides a valid SHM value. |
| Vehicle count | SHM scoring grid | REST session count | Exact integer `0..104` | SHM defines grid cardinality. REST can describe session count when SHM is unavailable but cannot create vehicle rows. |
| Player present | SHM unique `mIsPlayer` row | REST unique `player=true` row | Exact boolean at player scope | SHM wins. REST fallback may state presence but never creates a player identity without a SHM slot. |
| Player position | SHM player scoring row | REST standings player row | Exact one-based count; player-only REST | SHM value populates the grid/player. Fresh REST is fallback only for the already SHM-identified player; disagreement is recorded. |
| Player completed laps | SHM player scoring row | REST standings player row | Exact non-negative count; player-only REST | Same as player position. REST never mutates rival rows. |
| Player pit-stop count | SHM player scoring row | REST standings player row | Exact non-negative count; player-only REST | Same as player position. |
| Rival position/laps/pit stops | SHM scoring rows | none | Per numeric occupied slot | Missing/stale stays explicit; never fan out player REST values. |
| Session end/max laps | SHM | none | Session-wide, §1.4 invariants | Missing/stale stays explicit. |
| Driver/vehicle/class/sector/lap distance/lap times/gaps/penalties/InPit | SHM | none | Per occupied scoring slot | Missing/stale stays explicit. |
| Player lap/gear/RPM/speed/controls/fuel/capacity | SHM telemetry row correlated through the validated active-ID bijection | none | Player-only | Select the unique active scoring `mIsPlayer` row, then its unique equal-ID active telemetry row. No player makes fields missing; broken active-grid bijection rejects the frame. Never use header index, position, REST order or inactive tail rows. |
| Remaining time / relative gaps / self delta | canonical derivation | none | Derived only after fusion from admitted inputs | Inherit least-fresh input; never derive from conflicting/missing inputs that violate the algorithm contract. |

Fusion invariants and red tests:

- [ ] SHM fresh + REST fresh equivalent selects SHM, no conflict.
- [ ] SHM fresh + REST fresh conflicting selects SHM and records one bounded
  conflict with both source labels.
- [ ] SHM missing/invalid/stale-unusable + REST fresh selects REST only for
  the explicitly equivalent player/session rows above.
- [ ] Both stale preserve preferred-first stale quality; no value becomes
  fresh.
- [ ] REST cannot create grid rows, vehicle IDs, rival values or a player ID.
- [ ] `0`/`false` versus missing and `0`/`false` versus non-zero/true follow
  normal presence/conflict rules.
- [ ] Every authority rule has preferred/alternative TTLs and scope in the
  generated authority-matrix documentation.
- [ ] D4A changes the existing REST-preferred player position/laps/pit rules
  to the table above only after SHM parses those fields with real fixture
  evidence.

### 1.6 Projection version decision

Keep Overlay projection v1 and make the new fields optional, explicitly
missing by default and accepted by the v1 TypeScript decoder. This is
backward-compatible because:

- v1 has no product cutover yet;
- existing v1 fields keep their names and semantics;
- old payloads decode with every new field missing;
- new payloads still contain the complete old contract;
- no field changes unit or meaning.

Create v2 only if implementation proves that one of those statements is
false. Do not widen the global transport version merely to add optional fields.

---

## 2. Target contracts

### 2.1 LMU observation

`internal/telemetry/drivers/lmu.Observation` gains:

- session end time and maximum laps;
- one `VehicleObservation` per scoring row;
- player fast telemetry joined by numeric vehicle ID;
- player fuel liters/capacity;
- matrix decisions for every admitted signal.

`VehicleObservation` contains typed fields only:

- numeric source ID;
- driver alias/name;
- vehicle name and class;
- player marker;
- position, completed laps, sector and lap distance;
- best, last and estimated lap;
- in-pit, pit stops and penalties;
- time/laps behind leader and next;
- optional player fast telemetry.

Slices are owned. Raw buffers, Steam IDs and unredacted capture data never
leave the driver.

### 2.2 Canonical state

Extend domain packages rather than creating a generic telemetry bag:

- `schema/identity`: no new raw IDs; mapper produces closed `RunIdentity`.
- `schema/session`: remaining time and lap limits.
- `schema/standings`: driver label, class, position, laps, timing and gaps.
- `schema/energy`: fuel amount and capacity in liters.
- `schema/pit`: existing booleans/counts only.

`core.VehicleState` gains only fields consumed by the admitted Overlay
contract. `core.ObservedState` gains session-wide fields. Every field remains a
`schema.Field[T]`.

### 2.3 Observation-to-batch mapper

Add `internal/telemetry/drivers/lmu/batch_mapper.go`.

`BatchMapper` is the long-lived sink passed once to `DriverManager.Start`, so
its cursor and runtime-issued event/session counters survive a driver
reconnect. It:

- accepts only `SourceCanonical` observations;
- rejects unknown compatibility and duplicate/negative vehicle source slots;
- advances `schema.Cursor` exactly once per accepted observation;
- starts a new epoch on source clock reset, demonstrated session boundary or
  player vehicle change;
- preserves the epoch across a brief disconnect/reconnect;
- issues opaque process-local event/session IDs, never hashes PII;
- maps each vehicle source ID to a stable `identity.VehicleID`;
- accepts scoring/telemetry grids only when the first `mNumVehicles` IDs on
  each side are unique, non-negative and bijective; ignores the inactive tail;
  resolves the optional player from scoring `mIsPlayer` and then equal active
  telemetry ID, never from `mPlayerVehicleIdx`/`mPlayerHasVehicle`;
- writes one complete `core.Batch` atomically to a downstream
  `core.BatchSink`.

The mapper performs no I/O and starts no goroutine.

`core.BatchSink` has one method:

```go
WriteBatch(context.Context, core.Batch) error
```

The interface lives in `core` beside the consumer. A collecting sink and a
reducer adapter exercise it; the product composition root is intentionally
left to ISA-106 shadow wiring.

### 2.4 Identity, session and epoch transition table

There is no durable event identifier in the admitted LMU signals. Therefore
`EventID` is allocated once per long-lived `BatchMapper` lifetime and never
inferred from track, driver name or clock. `SessionID` and epoch transitions
follow only demonstrated source facts. A rejected observation advances
nothing.

The numeric LMU slot is stable only while continuously occupied; the primary
API explicitly states it may be reused after a participant leaves. The mapper
therefore owns `slot → generation → VehicleID` state:

- row reordering does not change identity;
- driver disconnect with no accepted replacement batch does not vacate slots;
- an accepted canonical batch that omits a previously present slot vacates it;
- reappearance of a vacated numeric slot allocates a new generation even when
  display text is equal;
- names, class, position and other PII/display fields never decide identity.

| Source-backed condition | Previous → new state | Event / session | Epoch | Required behavior and test |
|---|---|---|---|---|
| First accepted compatible menu frame, no player | none → menu | allocate `event-1` / `session-1` | allocate epoch 1 | Empty player ID and zero vehicles are valid; no synthetic identity. |
| First accepted compatible track frame | none → track | allocate `event-1` / `session-1` | allocate epoch 1 | Allocate one generation per continuously occupied source slot. |
| Continuous clock, same track/session type, same occupied slots | track → track | preserve both | preserve | Advance sequence once; row order may change without identity churn. |
| Continuous clock, same session signature, player first appears | menu/garage → player present | preserve both | increment once | The unique active scoring `mIsPlayer` row becomes the generated player ID after the active scoring/telemetry ID bijection passes. Header player-index bytes are not authoritative. |
| Continuous clock, player row remains absent and no different player appears | player present → player absent | preserve both | preserve | Publish player presence as missing/false; do not guess a replacement. The absent slot is vacated if the accepted grid omits it. |
| Vacated source slot reappears | absent slot → occupied slot | preserve both | preserve unless it is the player | Allocate a new vehicle generation; never reuse the prior `VehicleID`. |
| Player source slot or player generation changes | player A → player B | preserve both | increment once | Update header atomically with the accepted batch. |
| Track name or canonical session type changes between fresh observations | session A → session B | preserve event; allocate next session | increment once | Reset session-scoped derivations and vehicle generations. |
| `ClockReset` (source time decreases without wrap) | any accepted session → reset clock | preserve event; allocate next session | increment once | Treat as a new session even if track/type text is unchanged; reset derivations and generations. |
| `ClockWrap` with otherwise unchanged fresh signature | session → same session, wrapped source counter | preserve both | increment once | Reset time-dependent derivations without inventing a new session boundary. |
| Driver disconnect/reconnect with no accepted observation between | connected → disconnected → connected | preserve both | preserve | Connection facts are outside the batch; the next accepted observation advances the existing cursor exactly once. |
| Reconnect followed by changed track/type or reset clock | disconnected → new facts | apply the corresponding row above | apply corresponding row | Reconnect itself is not the boundary; demonstrated new facts are. |
| Unknown compatibility, duplicate/negative slot, multiple players, invalid count or all identity/session facts invalid | any → ambiguous | preserve both | preserve | Reject atomically, do not call the sink and do not advance cursor/state. |
| Partially valid observation with a valid session/grid identity but optional fields missing/stale | any → partial | preserve according to rows above | preserve unless another explicit row applies | Publish valid fields and explicit missing/stale qualities; never invent values. |

Cursor rules:

1. `(epoch, sequence)` is allocated tentatively.
2. The complete batch is written once to `BatchSink`.
3. Mapper state and cursor commit only if `WriteBatch` succeeds.
4. A boundary increments epoch exactly once and starts its sequence at 1.
5. A normal accepted batch increments only sequence.
6. Epoch, session and vehicle generation counters are process-local opaque
   values and never contain PII.

### 2.5 Derived timing

Add two deterministic algorithms:

- relative gaps from observed leader/lap values;
- self-reference delta from a real completed player lap.

The algorithms are pure, versioned, bounded and reset on epoch. No native LMU
delta is published until a real non-zero trace proves its sign/reference.

### 2.6 Honest unavailable state

The legacy production transport remains temporarily in place, but with no
automatic mock:

- no LMU source means disconnected telemetry with no vehicles;
- a source waiting for LMU is live-capable but unavailable, not mock;
- retries can transition to real telemetry without restarting;
- closing LMU never reintroduces synthetic data;
- Studio preview can still select Mock explicitly;
- debug CLIs and tests may inject synthetic buffers explicitly.

---

## 3. Microcut D0 — Plan, provenance and baseline

### Files

- Create:
  `docs/superpowers/plans/2026-07-31-isa-129-tc-07a1-canonical-overlay-signals.md`
- Create:
  `docs/telemetry-core/lmu-overlay-signal-provenance.md`
- Update:
  `docs/telemetry-core/overlay-shadow-matrix.md`
- Update:
  `docs/current-plan.md`

### Steps

- [x] Record the exact base, branch and worktree.
- [x] Record the 1.3 fixture hashes and current LMU 1.4 evidence.
- [x] Add the closed source/unit/sign/reference table from this plan.
- [x] Mark team, number, compound, VE, damage and unsupported weather as
  missing, not zero.
- [x] Record the production mock and missing bridge as P0 blockers.
- [x] Run:

```powershell
git diff --check
go test ./internal/telemetry/drivers/lmu ./internal/telemetry/core `
  ./internal/telemetry/derive ./internal/telemetry/projection/overlay -count=1
go test ./internal/app ./internal/server -count=1
```

- [ ] Commit:

```powershell
git add -- docs/superpowers/plans/2026-07-31-isa-129-tc-07a1-canonical-overlay-signals.md `
  docs/telemetry-core/lmu-overlay-signal-provenance.md `
  docs/telemetry-core/overlay-shadow-matrix.md docs/current-plan.md
git commit -m "docs(telemetry): define ISA-129 signal contract"
```

### Gate

Independent review must return no open P0/P1/P2 or reasonable P3. No behavior
code starts before this gate.

---

## 4. Microcut D1 — Remove production synthetic connection

### Files

- Modify: `internal/app/telemetry_source_manager.go`
- Modify: `internal/app/telemetry_source_manager_test.go`
- Modify: `internal/app/app.go`
- Modify: `internal/app/app_test.go`
- Modify: `internal/app/lmu_enriched_source.go`
- Modify: `internal/telemetry/fusion/fusion.go`
- Modify: `internal/telemetry/fusion/fusion_test.go`
- Modify: `cmd/vantare/main.go`
- Modify: `frontend/src/overlay/core/telemetry-rate-coordinator.ts`
- Modify:
  `frontend/src/overlay/core/telemetry-rate-coordinator.test.ts`
- Modify: `internal/app/telemetry_bridge_test.go`
- Modify: `internal/server/sse_test.go`
- Create: `internal/app/no_product_mock_test.go`

### Red tests

- [x] Replace mock-preserving manager tests with:
  - `TestTelemetrySourceManagerStartsUnavailableWithoutLMU`
  - `TestTelemetrySourceManagerOpenFailureNeverCreatesMock`
  - `TestTelemetrySourceManagerLateLMUConnectionBecomesReal`
  - `TestTelemetrySourceManagerDisconnectNeverRestoresMock`
  - `TestTelemetrySourceManagerWithoutSourceReturnsDisconnectedTelemetry`
- [x] Add `TestMergeWithoutSharedMemoryNeverConnects`.
- [x] Add Wails/SSE regression checks for:
  - `connected=false`;
  - zero scoring rows;
  - no `Spa`, `TestDriver` or synthetic account canary.
- [x] Add a static guard that fails if `internal/app` or `cmd/vantare`
  references `BuildSyntheticBuffer` or `createMockSource`.
- [x] Run the focused tests and observe failure before implementation.

### Implementation

- [x] Remove the `Mock` field and implicit mock creation from
  `TelemetrySourceManagerConfig`.
- [x] Represent unavailable telemetry with a small explicit disconnected
  source/value, not a fake LMU-sized buffer.
- [x] Keep the live source instance available for `EnsureLive` retries when
  attach has not succeeded.
- [x] Delete `createMockSource` from `internal/app`.
- [x] Remove or hard-block the distributed `-live=false` path. Do not remove
  explicit `-mock` from diagnostic CLIs.
- [x] Make `fusion.Merge(nil, ...)` preserve disconnected state.
- [x] Replace the frontend initial mock import with a literal disconnected
  snapshot factory.
- [x] Keep preview Mock selection and Vite/Wails harness aliases unchanged.

### Verification

```powershell
gofmt -w internal/app/telemetry_source_manager.go `
  internal/app/telemetry_source_manager_test.go internal/app/app.go `
  internal/app/app_test.go internal/app/lmu_enriched_source.go `
  internal/telemetry/fusion/fusion.go internal/telemetry/fusion/fusion_test.go `
  internal/app/telemetry_bridge_test.go internal/server/sse_test.go `
  internal/app/no_product_mock_test.go cmd/vantare/main.go
go test ./internal/app ./internal/server ./internal/telemetry/fusion -count=1
pnpm --dir frontend test -- telemetry-rate-coordinator
git diff --check
```

- [x] Commit: `fix(telemetry): remove connected production mock` (`470d6a6`).
- [x] Independent review before the real retry: `SAFE`, P0/P1/P2/P3 = 0.
  The final track-correlation delta was reviewed adversarially in the
  orchestrator and passes its mismatch regression x20 plus the complete gates.

---

## 5. Microcut D2 — LMU layout contract on pinned 1.3 evidence

### Files

- Create: `internal/telemetry/drivers/lmu/layout.go`
- Create: `internal/telemetry/drivers/lmu/layout_test.go`
- Modify: `docs/telemetry-core/lmu-overlay-signal-provenance.md`

### Red tests

- [x] Assert every admitted offset/type in §1.4 against the pinned 1.3 fixtures.
- [x] Assert non-overlap, in-bounds access and 104-row maximum against
  `ObjectOutSize`.
- [x] Assert the scoring base/stride/count and telemetry base/stride/count do
  not overlap excluded regions.
- [x] Assert Windows source types explicitly: `int32`, `int16`, `int8`,
  `uint8`, one-byte bool and `float64`.
- [x] Assert all excluded fields in §1.4 remain absent from the admitted layout
  accessor API.

### Implementation

- [x] Replace scattered magic offsets used by the modular driver with named,
  audited layout constants.
- [x] Do not import the old generator or external Python module into the
  product build. Record them as provenance only.
- [x] Keep the production allowlist unchanged at 1.3 in this microcut.

### Verification

```powershell
gofmt -w internal/telemetry/drivers/lmu/layout.go `
  internal/telemetry/drivers/lmu/layout_test.go
go test ./internal/telemetry/drivers/lmu -count=20
go test ./internal/telemetry/... -count=1
git diff --check
```

- [x] Commit: `test(lmu): lock shared memory layout` (`e2c92fd`).
- [x] Independent review: `ACCEPT`, P0/P1/P2/P3 = 0.

---

## 6. Microcut D3 — Append-only schema and catalog

### Files

- Modify: `internal/telemetry/catalog/ids.go`
- Modify: `internal/telemetry/catalog/catalog.go`
- Modify: `internal/telemetry/catalog/catalog_test.go`
- Modify: `internal/telemetry/schema/types.go`
- Modify: `internal/telemetry/schema/session/types.go`
- Modify: `internal/telemetry/schema/session/types_test.go`
- Modify: `internal/telemetry/schema/standings/types.go`
- Create: `internal/telemetry/schema/standings/types_test.go`
- Modify: `internal/telemetry/schema/energy/types.go`
- Create: `internal/telemetry/schema/energy/types_test.go`
- Modify: `docs/telemetry-core/signal-catalog.md`

### Existing/new catalog decision matrix

Stable IDs and keys are never renumbered or silently duplicated.

| Admitted semantic signal | Catalog action |
|---|---|
| Driver display label | Reuse ID 1, `SignalIdentityDriverName` / `identity.driver_name`; harden documentation that it is display-only and never a runtime identity. Do not add `driver_label`. |
| Session type | Reuse ID 2; metadata unchanged except demonstrated closed range documentation. |
| Engine RPM and controls | Reuse IDs 3–6. |
| Fuel amount | Reuse ID 8, `energy.fuel_amount`; change unit from unknown to liters and document dynamic invariant `0 <= amount <= capacity`. Do not add `fuel_liters`. |
| Pit-stop count | Reuse ID 9; harden non-negative count range. |
| Standings position | Reuse ID 10; harden one-based range `1..104`. |
| Player lap number | Reuse ID 13; harden non-negative count range. |
| Gear | Reuse ID 14. |
| Vehicle name | Reuse ID 16. ID 15 team name stays active but unproduced and untouched because team is excluded. |
| Completed laps | Reuse ID 17; harden non-negative count range. |
| Source time, track, vehicle count, player present, speed m/s and InPit | Reuse IDs 19–24 and harden only metadata proven in §1.4. |
| Session end/remaining/max laps | Append three new IDs in that order. |
| Vehicle class, scoring sector, lap distance | Append three new IDs in that order. |
| Best/last/estimated lap | Append three new IDs in that order. |
| Penalty count | Append one new ID. |
| Time/laps behind leader and next | Append four new IDs in the order: time leader, laps leader, time next, laps next. |
| Relative time gap and relative lap delta | Append two new IDs. |
| Fuel capacity | Append one new liters ID. |
| Self delta seconds and reference kind | Append two new IDs. |
| Weather ambient, spatial position/orientation and team | Existing IDs 11, 12, 15 and 18 remain active but are neither changed nor produced by ISA-129. |
| Tombstones | None in this cut. No admitted signal is a retirement. |

Required catalog guards:

- [x] One canonical key per semantic concept, including aliases such as
  `driver name/display label` and `fuel amount/liters`.
- [x] Exact reuse/append map above; IDs 1–24 remain numerically stable.
- [x] Metadata hardening of an existing ID is allowed only with the §1.4
  evidence and a regression proving no unit/meaning contradiction.
- [x] Generated Markdown identifies reused, hardened, newly appended,
  unproduced-existing and tombstoned entries.
- [x] `catalog.Validate` plus a semantic-alias test rejects a duplicate meaning
  even when its key text differs.

### Additive signal IDs

Append only the new rows identified above; never reorder or reuse 1–24:

- session end time, remaining time and maximum laps;
- vehicle class;
- standings sector, lap distance, best/last/estimated lap;
- time/laps behind leader and next;
- relative time/lap gap to player;
- penalties;
- fuel capacity liters;
- derived delta seconds plus reference kind.

Do not catalog team, car number, compound, VE or damage in this cut.

### Red tests

- [x] Catalog length and exact append-only IDs.
- [x] Exact reuse/harden/append matrix and no semantic aliases.
- [x] Units:
  seconds, meters, liters, count, boolean or text.
- [x] Closed ranges where demonstrated:
  count `0..104`, ratios `0..1`, non-negative time/distance/liters.
- [x] Comparable domain structs preserve a legitimate zero.
- [x] Unknown enum values are invalid, not silently mapped.
- [x] Generated Markdown matches the Go ledger.

### Verification

```powershell
gofmt -w internal/telemetry/catalog/ids.go `
  internal/telemetry/catalog/catalog.go `
  internal/telemetry/catalog/catalog_test.go `
  internal/telemetry/schema/types.go `
  internal/telemetry/schema/session/types.go `
  internal/telemetry/schema/session/types_test.go `
  internal/telemetry/schema/standings/types.go `
  internal/telemetry/schema/standings/types_test.go `
  internal/telemetry/schema/energy/types.go `
  internal/telemetry/schema/energy/types_test.go
go test ./internal/telemetry/catalog ./internal/telemetry/schema/... -count=20
go test ./internal/telemetry/... -count=1
git diff --check
```

- [x] Commit: `feat(telemetry): add overlay signal schema` (`462f0ee`).
- [x] Independent review: `ACCEPT`, P0/P1/P2/P3 = 0.

---

## 7. Microcut D4A — Multivehicle parser and sanitizer on real 1.3 evidence

### Files

- Modify: `internal/telemetry/drivers/lmu/format.go`
- Modify: `internal/telemetry/drivers/lmu/format_test.go`
- Modify: `internal/telemetry/drivers/lmu/fusion.go`
- Modify: `internal/telemetry/drivers/lmu/fusion_test.go`
- Modify: `internal/telemetry/drivers/lmu/capture.go`
- Modify: `internal/telemetry/drivers/lmu/capture_test.go`
- Modify: `internal/telemetry/drivers/lmu/replay_test.go`
- Create:
  `internal/telemetry/drivers/lmu/testdata/grid_v1.golden.json`
- Modify: `docs/telemetry-core/lmu-authority-matrix.md`
- Modify: `docs/telemetry-core/lmu-overlay-signal-provenance.md`

### Red tests

- [x] Parse all 44 sanitized scoring rows from the real 1.3 fixture.
- [x] Assert the real track fixture has 44 unique active scoring IDs, 44 unique
  active telemetry IDs, exact set equality and one scoring player whose ID maps
  to exactly one active telemetry row.
- [x] Prove the 60 zero-filled inactive telemetry rows are ignored, so active ID
  `0` remains valid and a full-104-row ID scan cannot select the player.
- [x] Prove the parser does not depend on `mPlayerVehicleIdx` or
  `mPlayerHasVehicle` for player selection.
- [x] Preserve row order but make identity independent of position.
- [x] Reject duplicate/negative IDs in either active grid, any active scoring ↔
  telemetry non-bijection, multiple players, invalid booleans, out-of-range
  rows, unterminated strings, non-finite time and out-of-bounds counts.
- [x] Prove false/zero fields remain present.
- [x] Prove `InPit` becomes stale with the rest of a frozen SHM frame.
- [x] Prove the sanitizer aliases all 44 identities/strings and retains only
  allowlisted numeric ranges.
- [x] Rebuild the complete admitted frame from a zero-filled buffer, including
  the full grid; never copy unknown byte ranges.
- [x] Add canaries across every excluded byte range and prove none survive.
- [x] Add table-driven SHM/REST authority tests for every §1.5 overlap:
  fresh/equal, fresh/conflict, preferred missing, preferred stale, both stale
  and legitimate zero/false.
- [x] Prove REST fallback can update only the already SHM-identified player and
  cannot create/modify rival rows or vehicle identity.
- [x] Fuzz the parser and sanitizer with no panic or leak.

### Implementation

- [x] Add owned `[]VehicleObservation` to `Observation`.
- [x] Parse each scoring row with helpers that return typed `schema.Field`.
- [x] Parse exactly the first `mNumVehicles` scoring and telemetry rows; validate
  their unique non-negative ID bijection before accepting the frame and ignore
  the inactive tail.
- [x] Select the optional player only from scoring `mIsPlayer`; join fast
  telemetry only through the unique equal active telemetry ID, never through
  the header player index, position or full-array search.
- [x] Parse session end and maximum laps.
- [x] Parse fuel/fuel capacity for the player only after finite and
  `0 <= fuel <= capacity` checks.
- [x] Keep phase/flags, pit-state enum, native delta, weather and every other
  excluded field from §1.4 absent.
- [x] Extend authority matrix additively; do not copy legacy zero-as-missing
  behavior.
- [x] Change player position/completed-laps/pit-stop authority from
  REST-preferred to the exact SHM-preferred player-only fallback in §1.5.

### Verification

```powershell
gofmt -w internal/telemetry/drivers/lmu/format.go `
  internal/telemetry/drivers/lmu/format_test.go `
  internal/telemetry/drivers/lmu/fusion.go `
  internal/telemetry/drivers/lmu/fusion_test.go `
  internal/telemetry/drivers/lmu/capture.go `
  internal/telemetry/drivers/lmu/capture_test.go `
  internal/telemetry/drivers/lmu/replay_test.go
go test ./internal/telemetry/drivers/lmu -count=20
go test ./internal/telemetry/drivers/lmu -run '^$' `
  -fuzz '^FuzzParseNeverPanics$' -fuzztime=10s
go test ./internal/telemetry/drivers/lmu -run '^$' `
  -fuzz '^FuzzFrameSanitizerNeverPanicsOrLeaksUnknownBytes$' -fuzztime=10s
go test ./internal/telemetry/drivers/lmu -run '^$' `
  -bench '^BenchmarkParseObjectOut44Vehicles$' -benchmem -count=5
go test ./internal/telemetry/drivers/lmu -run '^$' `
  -bench '^BenchmarkSanitizeObjectOut44Vehicles$' -benchmem -count=5
git diff --check
```

- [x] Commit: `feat(lmu): parse sanitized multivehicle grid` (`94c2994`).
- [x] Independent review: `ACCEPT`, P0/P1/P2/P3 = 0 after one fix cycle.

---

## 8. Microcut D4B — Diagnostic 1.4 proof before production allowlist

### Files

- Modify: `internal/telemetry/drivers/lmu/version.go`
- Modify: `internal/telemetry/drivers/lmu/version_test.go`
- Modify: `internal/telemetry/drivers/lmu/version_windows_test.go`
- Modify: `internal/telemetry/drivers/lmu/live_windows_test.go`
- Modify: `internal/telemetry/drivers/lmu/capture.go`
- Modify: `internal/telemetry/drivers/lmu/capture_test.go`
- Modify: `cmd/lmu-debug/main.go`
- Create: `testdata/lmu-1.4-menu-fixture.bin`
- Create: `testdata/lmu-1.4-track-fixture.bin`
- Create: `testdata/lmu-1.4-rest-menu-fixture.json`
- Create: `testdata/lmu-1.4-rest-track-fixture.json`
- Modify: `docs/telemetry-core/lmu-overlay-signal-provenance.md`

### Red tests before capture

- [x] Add a diagnostic-only candidate-layout profile that cannot mutate the
  production allowlist and is exercised independently from `supportedVersion`.
- [x] `TestLMU14BuildRequiresAndHasPinnedSanitizedFixtures` proves 1.4 remains rejected
  by production until both menu and track hashes are compiled into the
  allowlist.
- [x] Candidate parsing requires exact `ObjectOutSize`, all D2 bounds, valid
  count/correlation and zero-copy prohibition before sanitization.
- [x] Candidate sanitizer is the D4A zero-rebuild sanitizer and refuses any
  field outside the §1.4 allowlist.
- [x] No command-line flag can make an unknown layout productively canonical.
- [x] REST diagnostic sanitizer writes only the §1.5 session/player overlap,
  removes names/IDs and never writes the original response body.

### Diagnostic capture sequence

- [x] Add `lmu-debug -capture-sanitized <path>` with these exact properties:
  - uses the existing single Shared Memory mapping;
  - parses through the diagnostic candidate profile;
  - writes only the zero-rebuilt sanitized frame;
  - refuses unknown structure or failed invariants;
  - prints SHA-256 and sanitized semantic summary;
  - never writes raw bytes or PII.
- [x] Run the pre-allowlist diagnostic probe and capture LMU 1.4 menu:

```powershell
go run ./cmd/lmu-debug -once `
  -capture-sanitized testdata/lmu-1.4-menu-fixture.bin `
  -capture-rest-sanitized testdata/lmu-1.4-rest-menu-fixture.json
```

- [x] With a real player on track, run:

```powershell
go run ./cmd/lmu-debug -once `
  -capture-sanitized testdata/lmu-1.4-track-fixture.bin `
  -capture-rest-sanitized testdata/lmu-1.4-rest-track-fixture.json
```

- [x] During the same menu and track windows, capture sanitized REST overlap
  summaries to the two `lmu-1.4-rest-*-fixture.json` files and record receive
  timestamps needed for source-time age adjustment.
- [x] Scan both rebuilt fixtures and summaries for names, paths, Steam IDs and
  unique canaries before staging.
- [x] Pin all SHM/REST hashes; prove the SHM structural tests and every §1.5
  cross-source equivalence/conflict rule against the correlated real captures.

Pinned real LMU 1.4 evidence:

- menu SHM: `0567b69abf96ecf4c63594293e29151bd802d6e52f30b5d5ccfb68c36e8aa4e0`;
- track SHM: `c2e005362419f1db33df96aab70e9e0d56b627ce4aee02d11b8b9ea49707b0e5`;
- menu REST: `325d40882d718e7cb36837b0d3f77575eca72008ecef9bdb436325af1a285312`;
- track REST: `bb89380fb672387b97735b2d318c0c8d0a246eaf2f34adbe799f17daa6f0fa36`.

The final track pair was captured only after the diagnostic path compared the
real normalized track values through an in-memory SHA-256 digest. The original
track string is never retained in the artifact; both persisted values remain
the fixed alias `Track-01`.

### Production promotion inside this microcut

- [x] Only after both fixtures pass, add normalized `1.4.0.0` to the explicit
  production allowlist.
- [x] Require file and product version agreement.
- [x] Run the opt-in production path:

```powershell
$env:LMU_LIVE_SHARED_MEMORY_TEST='1'
go test ./internal/telemetry/drivers/lmu `
  -run '^TestLiveLMUSharedMemoryOptIn$' -v -count=1
Remove-Item Env:LMU_LIVE_SHARED_MEMORY_TEST
```

- [ ] If either real fixture cannot be captured, leave 1.4 unsupported and
  keep ISA-129 In Progress. Do not fabricate or mutate a 1.3 fixture into a
  passing 1.4 fixture.

### Verification

```powershell
gofmt -w internal/telemetry/drivers/lmu/version.go `
  internal/telemetry/drivers/lmu/version_test.go `
  internal/telemetry/drivers/lmu/version_windows_test.go `
  internal/telemetry/drivers/lmu/live_windows_test.go `
  internal/telemetry/drivers/lmu/capture.go `
  internal/telemetry/drivers/lmu/capture_test.go `
  cmd/lmu-debug/main.go
go test ./internal/telemetry/drivers/lmu -count=20
go test ./internal/telemetry/... -count=1
git diff --check
```

- [x] Commit: `be6563f` — `feat(lmu): prove and allow LMU 1.4 layout`.
- [x] Independent review: `ACCEPT`, P0/P1/P2/P3 = 0.

---

## 9. Microcut D5 — Observation-to-batch mapper and reducer state

### Files

- Create: `internal/telemetry/drivers/lmu/batch_mapper.go`
- Create: `internal/telemetry/drivers/lmu/batch_mapper_test.go`
- Modify: `internal/telemetry/core/ports.go`
- Modify: `internal/telemetry/core/ports_test.go`
- Modify: `internal/telemetry/core/reducer.go`
- Modify: `internal/telemetry/core/reducer_test.go`
- Modify: `internal/telemetry/core/driver_manager_test.go`
- Modify: `internal/telemetry/core/session_coordinator_test.go`
- Create:
  `internal/telemetry/drivers/lmu/testdata/driver_to_batch_v1.golden.json`
- Modify: `docs/telemetry-core/runtime-reducer.md`
- Modify: `docs/telemetry-core/session-coordinator.md`

### Red tests

- [x] Real sanitized fixture traverses:
  `Parse → Fusion → BatchMapper → Reducer`.
- [x] 44 stable vehicle IDs; no position fallback.
- [x] Player ID in header matches the unique player row.
- [x] Menu without player is valid; player appearance starts a new epoch.
- [x] Reordering rows does not change IDs.
- [x] A driver reconnect with no accepted intervening grid preserves vehicle
  generations.
- [x] A source slot omitted from an accepted grid is vacated; reappearance
  receives a new generation because LMU can reuse slots.
- [x] Brief driver reconnect preserves session ID and advances cursor.
- [x] `DriverManager` recreates the LMU Driver while reusing one explicit
  `ObservationBatchSink`; session, slot generation and cursor stay continuous.
- [x] A reconnect cannot hide a source-clock reset even when the new Driver
  reports `ClockContinuous` for its first observation.
- [x] Clock reset, track/session change and player vehicle change start exactly one
  epoch.
- [x] Clock reset allocates a new session; clock wrap preserves session but
  starts one new epoch.
- [x] Every row of the §2.4 transition table has a named table-driven case.
- [x] Duplicate or negative source slots reject the whole batch atomically.
- [x] Reducer count/vehicle mismatch and quality semantics remain protected.
- [x] Downstream backpressure/error does not advance mapper cursor/state.
- [x] Cancellation while waiting for mapper ownership reaches neither mapper
  state nor downstream sink.
- [x] Player absence clears the active header identity through Reducer,
  derivations and Overlay projection without retaining active controls.

### Implementation

- [x] Add domain fields to `core.VehicleState` and `core.ObservedState`.
- [x] Implement the synchronous `BatchMapper`.
- [x] Use opaque runtime counters such as `lmu-event-1`, `lmu-session-1` and
  generated aliases such as `lmu-slot-7-generation-2`; never include names or
  paths.
- [x] Implement the §2.4 transition table literally; keep one event per mapper
  lifetime and increment session only on demonstrated session boundaries.
- [x] Keep mapper state outside individual driver instances so manager
  reconnects do not reset identity.
- [x] Clone all slices before writing downstream.

### Verification

```powershell
gofmt -w internal/telemetry/drivers/lmu/batch_mapper.go `
  internal/telemetry/drivers/lmu/batch_mapper_manager_test.go `
  internal/telemetry/drivers/lmu/batch_mapper_test.go `
  internal/telemetry/core/ports.go internal/telemetry/core/ports_test.go `
  internal/telemetry/core/reducer.go internal/telemetry/core/reducer_test.go `
  internal/telemetry/core/driver_manager_test.go `
  internal/telemetry/core/session_coordinator_test.go `
  internal/telemetry/derive/pipeline.go
go test ./internal/telemetry/drivers/lmu ./internal/telemetry/core `
  ./internal/telemetry/derive ./internal/telemetry/projection/overlay -count=20
go test -race ./internal/telemetry/drivers/lmu ./internal/telemetry/core -count=5
go test ./internal/telemetry/... -count=1
git diff --check
```

- [x] Commit: `feat(telemetry): map LMU grid into canonical batches`.
- [x] Independent review: final `APPROVE`, P0/P1/P2/P3 = 0.

---

## 10. Microcut D6 — Session timing, gaps and self-reference delta

### Files

- Modify: `internal/telemetry/derive/pipeline.go`
- Modify: `internal/telemetry/derive/pipeline_test.go`
- Modify: `internal/telemetry/derive/pipeline_advanced_test.go`
- Create: `internal/telemetry/derive/gaps.go`
- Create: `internal/telemetry/derive/gaps_test.go`
- Create: `internal/telemetry/derive/delta.go`
- Create: `internal/telemetry/derive/delta_test.go`
- Create: `internal/telemetry/drivers/lmu/delta_trace.go`
- Create: `internal/telemetry/drivers/lmu/delta_trace_test.go`
- Modify: `cmd/lmu-debug/main.go`
- Create:
  `internal/telemetry/derive/testdata/lmu-1.4-self-delta-trace-v1.jsonl`
- Create:
  `internal/telemetry/derive/testdata/lmu-1.4-self-delta-trace-v1.golden.json`
- Create:
  `internal/telemetry/derive/testdata/overlay_timing_v1.golden.json`
- Modify: `docs/telemetry-core/runtime-derivations.md`
- Modify: `docs/telemetry-core/lmu-overlay-signal-provenance.md`

### Red tests

- [x] Session remaining is derived from observed end/current time only when both
  are finite and ordered; provenance is derived.
- [x] Timed sessions preserve remaining zero.
- [x] Lap-limited sessions preserve maximum laps and do not invent time.
- [x] Same-lap relative gaps obey the documented sign.
- [x] Lapped vehicles expose lap delta and no fabricated seconds.
- [x] Gaps reject missing, stale-incompatible, invalid or non-finite inputs.
- [x] Delta is missing until one complete valid reference lap exists.
- [x] A completed reference lap produces interpolated delta by lap distance.
- [x] Positive delta is slower; negative is faster.
- [x] The hash-pinned real LMU trace contains at least one complete valid
  reference lap and one subsequent complete comparable lap.
- [x] At each comparable real sample, derived sign equals the measured
  elapsed-time difference at the same interpolated distance; at least one
  sample must be non-zero beyond numeric epsilon.
- [x] Pit, wrap, epoch reset and missing samples reset/hold the tracker safely.
- [x] Memory remains bounded and no algorithm uses a synthetic constant-speed
  reference.

### Implementation

- [x] Add diagnostic-only
  `lmu-debug -capture-delta-trace <path> -trace-duration 30m`.
- [x] Sample the already-sanitized canonical player observation at a bounded
  `10 Hz`; never write raw Shared Memory, names, track, Steam IDs or source slot.
- [x] Trace schema is versioned and contains only:
  sample index, monotonic elapsed offset, source time, lap number, lap distance,
  speed, InPit and quality. Cap at 18,000 samples / 30 minutes.
- [x] Stop successfully only after two complete comparable non-pit laps.
  Otherwise delete the incomplete output and return a non-zero error.
- [x] Hash the JSONL, emit a sanitized semantic summary and pin both in tests.
- [x] Register `gaps.v1` and `self-delta.v1` in the fixed derivation chain.
- [x] Store explicit gap fields per vehicle in `DerivedState`.
- [x] Store delta value, reference kind and bounded history for the player.
- [x] Use actual observed lap samples. Promote a completed lap only after
  monotonic distance/time validation.
- [x] Keep native LMU `mDeltaBest` unconsumed until separately demonstrated.

### Verification

```powershell
gofmt -w internal/telemetry/derive/pipeline.go `
  internal/telemetry/derive/pipeline_test.go `
  internal/telemetry/derive/pipeline_advanced_test.go `
  internal/telemetry/derive/gaps.go internal/telemetry/derive/gaps_test.go `
  internal/telemetry/derive/delta.go internal/telemetry/derive/delta_test.go `
  internal/telemetry/drivers/lmu/delta_trace.go `
  internal/telemetry/drivers/lmu/delta_trace_test.go cmd/lmu-debug/main.go
go run ./cmd/lmu-debug -trace-duration 30m -capture-delta-trace `
  internal/telemetry/derive/testdata/lmu-1.4-self-delta-trace-v1.jsonl
go test ./internal/telemetry/derive -count=20
go test ./internal/telemetry/drivers/lmu `
  -run '^TestDeltaTrace' -count=20
go test ./internal/telemetry/derive -run '^$' `
  -fuzz '^FuzzGapDerivationNeverInventsSeconds$' -fuzztime=10s
go test ./internal/telemetry/derive -run '^$' `
  -fuzz '^FuzzSelfDeltaStateMachine$' -fuzztime=10s
go test ./internal/telemetry/derive -run '^$' `
  -bench '^BenchmarkGapDerivation44Vehicles$' -benchmem -count=5
go test ./internal/telemetry/derive -run '^$' `
  -bench '^BenchmarkSelfDeltaTracker$' -benchmem -count=5
go test ./internal/telemetry/... -count=1
git diff --check
```

- [x] Commit: `feat(telemetry): derive canonical gaps and delta`.
- [x] Independent review: final `APPROVE`, P0/P1/P2/P3 = 0.

---

## 11. Microcut D7 — Additive Overlay v1 contract and TypeScript adapter

### Files

- Modify: `internal/telemetry/derive/delta.go`
- Modify: `internal/telemetry/derive/delta_test.go`
- Modify: `internal/telemetry/projection/overlay/v1.go`
- Modify: `internal/telemetry/projection/overlay/v1_test.go`
- Modify:
  `internal/telemetry/projection/overlay/testdata/overlay_v1.golden.json`
- Modify:
  `frontend/src/overlay/telemetry-shadow/overlay-projection-v1.ts`
- Modify:
  `frontend/src/overlay/telemetry-shadow/overlay-projection-v1.test.ts`
- Modify:
  `frontend/src/overlay/telemetry-shadow/overlay-projection-adapter.ts`
- Modify:
  `frontend/src/overlay/telemetry-shadow/overlay-projection-adapter.test.ts`
- Modify:
  `frontend/src/overlay/telemetry-shadow/overlay-shadow-comparator.ts`
- Modify:
  `frontend/src/overlay/telemetry-shadow/overlay-shadow-comparator.test.ts`
- Modify:
  `frontend/src/telemetry-transport/projection-golden.test.ts`
- Modify:
  `frontend/src/telemetry-overlay-shadow-harness/TelemetryOverlayShadowHarness.test.tsx`
- Modify:
  `internal/telemetry/recording/replay/testdata/canonical-integration-v1.golden.json`
- Modify: `docs/telemetry-core/overlay-shadow-matrix.md`
- Modify: `docs/telemetry-core/projection-transport.md`

### Additive payload fields

- session: end time, remaining time and maximum laps;
- vehicles: driver label, class, sector, lap distance, best/last/estimated lap,
  penalties, gaps/intervals, fuel for player;
- derived: relative gap/lap delta and player self-reference delta/history;
- each public delta sample preserves its canonical `ReceivedUTC` capture time,
  so a retained sample keeps one stable identity across later frames;
- quality metadata for every field;
- existing v1 keys unchanged.

### Executable v1 compatibility policy

The current decoder requires the base keys and intentionally tolerates safe
additional keys. D7 preserves that property.

| Producer | Consumer | Expected result | Required proof |
|---|---|---|---|
| old v1 | old v1 | decode unchanged | Existing golden and adapter tests remain byte/semantic stable. |
| old v1 | new v1 | decode; every additive field becomes explicit missing | Test the exact pre-D7 golden through the new decoder and adapter. |
| new v1 | old v1 | decode old keys; safe additive keys are ignored | Freeze the pre-D7 decoder behavior as a test helper/fixture and run the new golden through it. |
| new v1 | new v1 | decode every known additive field | Go→JSON→TypeScript golden and adapter test. |

Rules:

- Base payload keys remain mandatory:
  `capabilities`, `trackName`, `sessionType`, `playerVehicleId`, `vehicles`,
  `controlsHistory`.
- Base vehicle/history keys remain mandatory and unchanged.
- Known D7 keys are optional. Absence is normalized to a typed
  `present=false`, `freshness=missing`, `provenance=unknown` field.
- Unknown additional keys are tolerated and ignored only after the existing
  transport/envelope safety validation. They never enter the returned typed
  object and cannot shadow a base or known additive key.
- A known key with an invalid value fails closed; it is not treated as absent.
- Unknown enum values inside known fields, duplicate IDs, unsafe numbers,
  invalid presence/freshness combinations and unsupported versions still fail.
- If implementation cannot satisfy all four matrix cells without weakening
  validation, stop D7 and create Overlay projection v2 instead.

### Red tests

- [x] Old v1 golden without new keys still decodes with explicit missing fields.
- [x] New v1 golden round-trips Go → JSON → TypeScript.
- [x] New v1 golden decodes through the frozen pre-D7 consumer and safely
  ignores additive fields.
- [x] Safe unknown extension keys remain ignored; invalid known keys and unsafe
  transport values still fail.
- [x] m/s → km/h is exactly `value * 3.6`.
- [x] Zero, false and empty-but-present values survive.
- [x] Driver names and IDs are used internally but redacted from diagnostic
  reports.
- [x] Comparator uses same-frame fields and never treats missing/stale/invalid
  as equal.
- [x] The 18-widget matrix improves only for signals actually admitted.
- [x] Phase/flags, team/number/compound/weather/damage remain explicit
  mismatches.

### Implementation

- [x] Extend v1 with optional `projection.Field` members.
- [x] Keep `CurrentVersion` and `MinimumSupportedVersion` at v1.
- [x] Make the TypeScript decoder normalize absent additive fields to missing.
- [x] Extend the adapter without touching ViewModels or renderers.
- [x] Update comparator source paths and capability rules.

### Verification

```powershell
gofmt -w internal/telemetry/derive/delta.go `
  internal/telemetry/derive/delta_test.go `
  internal/telemetry/projection/overlay/v1.go `
  internal/telemetry/projection/overlay/v1_test.go
go test ./internal/telemetry/derive ./internal/telemetry/projection/overlay `
  ./internal/app/telemetrytransport -count=20
pnpm --dir frontend test -- overlay-projection-v1 `
  overlay-projection-adapter overlay-shadow-comparator projection-golden
pnpm --dir frontend exec eslint `
  src/overlay/telemetry-shadow src/telemetry-transport
pnpm --dir frontend build
git diff --check
```

- [x] Commit: `feat(overlay): project canonical LMU signals`.
- [x] Independent review: final `APPROVE`, P0/P1/P2/P3 = 0 after one fix
  cycle covering stable delta timestamps, enum/identity validation and
  per-vehicle comparator quality.

---

## 12. Microcut D8 — Single live runtime integration harness

### Files

- Create: `internal/telemetry/drivers/lmu/runtime_integration_test.go`
- Modify: `internal/telemetry/drivers/lmu/replay_test.go`
- Modify: `internal/telemetry/derive/fanout_integration_test.go`
- Modify:
  `internal/telemetry/recording/replay/canonical_integration_test.go`
- Create:
  `internal/telemetry/drivers/lmu/testdata/menu_track_pit_disconnect_v1.golden.json`
- Create: `testdata/lmu-1.4-garage-fixture.bin`
- Create: `testdata/lmu-1.4-garage-fixture.json`
- Create: `testdata/lmu-1.4-pit-fixture.bin`
- Create: `testdata/lmu-1.4-pit-fixture.json`
- Create: `testdata/lmu-1.4-outlap-fixture.bin`
- Create: `testdata/lmu-1.4-outlap-fixture.json`
- Create:
  `internal/telemetry/drivers/lmu/testdata/disconnect_reconnect_v1.golden.json`
- Modify: `internal/telemetry/architecture_test.go`
- Modify: `docs/telemetry-core/overlay-shadow-matrix.md`

### Scenarios

- [x] Menu: no player, no invented grid identity or live payload.
- [x] Track: real sanitized multivehicle grid.
- [x] Pre-pit track → observed in-pit state → outlap uses real sanitized LMU
  1.4 frames and proves player `InPit` false/true/false without inferring a
  garage, box, pit-lane or pit-phase label the source cannot demonstrate.
- [x] Row reorder preserves identities; an accepted omitted slot followed by
  reappearance receives a new generation.
- [x] Source clock freeze and stale transition.
- [x] A real recorded driver disconnect/reconnect status sequence replays
  without mock and preserves IDs only when no accepted grid vacated them.
- [x] Session reset and player vehicle change.
- [x] First valid completed lap enables delta; before it delta is missing.
- [x] Every raw-frame input above is a zero-rebuilt, hash-pinned sanitized
  fixture. Connection-state events contain no telemetry payload.

### End-to-end path

```text
sanitized LMU frame
→ Parse
→ field-level Fusion
→ BatchMapper
→ Reducer
→ SessionCoordinator
→ Derive
→ Overlay projection v1
→ TypeScript decoder/adapter golden
```

- [x] Assert one driver/open per run.
- [x] Assert no imports from legacy `internal/telemetry/lmu`, mock fixtures or
  product UI inside the new runtime chain.
- [x] Assert deterministic byte-identical golden across 20 runs.

### Verification

```powershell
go test ./internal/telemetry/... -count=1
go test -race ./internal/telemetry/drivers/lmu ./internal/telemetry/core `
  ./internal/telemetry/derive -count=5
go vet ./internal/telemetry/...
pnpm --dir frontend test
pnpm --dir frontend build
git diff --check
```

- [x] Commit: `test(telemetry): prove LMU to Overlay pipeline`.
- [x] Independent review.

---

## 13. Microcut D9 — Real LMU, performance and delivery

### Real LMU checks

- [x] With LMU 1.4 in menu, run the opt-in driver test and record sanitized
  state only.
- [x] When a player session is available, verify:
  - one Shared Memory open;
  - player correlation;
  - real vehicle count;
  - stable identities across samples;
  - admitted session timing/lap-limit fields;
  - excluded phase/flag fields remain missing;
  - fuel invariants;
  - no mock strings;
  - no PII in stored evidence.
- [x] Perform and record the real sequence: menu evidence, pre-pit track,
  observed in-pit state, outlap/track, disconnect and reconnect. Preserve
  `mInPits` as a boolean only; do not infer garage/box/pit-lane semantics.
- [x] Capture and hash-pin two complete comparable non-pit player laps for
  self-delta; prove measured and derived sign at real shared distances.
- [x] Pit/outlap and disconnect/reconnect are mandatory ISA-129 gates. If any
  cannot be observed and sanitized, leave ISA-129 `In Progress`, document the
  exact missing evidence and do not open/advance ISA-106. Never synthesize,
  mutate or waive these gates.
- [x] The two-lap delta trace is equally mandatory. Without it, keep Delta
  missing and keep ISA-129/ISA-106 blocked.

### Performance checks

```powershell
go test ./internal/telemetry/drivers/lmu -run '^$' `
  -bench '^BenchmarkParseObjectOut44Vehicles$' -benchmem -count=10
go test ./internal/telemetry/drivers/lmu -run '^$' `
  -bench '^BenchmarkSanitizeObjectOut44Vehicles$' -benchmem -count=10
go test ./internal/telemetry/derive -run '^$' `
  -bench '^BenchmarkGapDerivation44Vehicles$' -benchmem -count=10
go test ./internal/telemetry/derive -run '^$' `
  -bench '^BenchmarkSelfDeltaTracker$' -benchmem -count=10
go test -race ./internal/telemetry/... -count=1
```

- [x] Compare against the prior driver/parser budget.
- [x] Confirm no per-frame logging, unbounded slices or new goroutines.

### Global gates

```powershell
go test ./... -count=1
go vet ./...
pnpm --dir frontend test
pnpm --dir frontend build
pnpm --dir frontend lint
git diff --check
git status --short
```

Known inherited failures must be reproduced on the exact base before being
classified as inherited. Do not hide them.

### Documentation and delivery

The module-level canonical record is
`docs/vantare-program/handoffs/telemetry-core.md` in this branch. The
program-wide `docs/vantare-program/orchestration-ledger.md` belongs to the
isolated governance worktree/branch and is intentionally not copied into this
issue branch. Update that single global ledger after the final D9 commit and PR
exist, so it can record their exact identifiers without creating two competing
ledgers.

- [x] Update in the issue branch:
  - `docs/current-plan.md`;
  - `docs/telemetry-core/README.md`;
  - `docs/telemetry-core/lmu-overlay-signal-provenance.md`;
  - `docs/telemetry-core/overlay-shadow-matrix.md`;
  - `docs/vantare-program/handoffs/telemetry-core.md`.
- [ ] After commit/PR, update the single program-wide orchestration ledger in
  its governance branch; do not create a parallel copy here.
- [x] Include the before/after 18-widget matrix.
- [x] Include all remaining missing signals and why.
- [x] Run final independent review over the full delta.
- [x] Resolve every P0/P1/P2 and reasonable P3.
- [ ] Commit D9 exactly once as:
  `docs(telemetry): close ISA-129 overlay signal evidence`.
- [ ] Push the issue branch.
- [ ] Open a draft PR against the exact ISA-105 branch.
- [ ] Move ISA-129 to `In Review`.
- [x] Do not merge or promote.

---

## 14. Reviewer checklist

- [x] No synthetic source can become connected/live outside explicit
  preview/harness/debug.
- [x] One LMU mapping and one runtime owner.
- [x] `Observation → Batch` is a real path, not a test-only shortcut.
- [x] Vehicle identity never falls back to position or PII.
- [x] Reconnect, session and vehicle transitions advance cursor/epoch exactly.
- [x] Multivehicle slices are bounded, owned and duplicate-free.
- [x] Source/unit/range/reference/sign/provenance/freshness are explicit.
- [x] Zero and false survive every layer.
- [x] Stale fields do not remain fresh.
- [x] Gaps and delta use demonstrated inputs and reset correctly.
- [x] Native delta, team, number, compound, VE, damage and unsupported weather
  remain missing unless new real evidence is added.
- [x] Overlay v1 remains backward-compatible.
- [x] No CSS, canvas, renderer or visual baseline changed.
- [x] Engineer simulator debt is preserved in the handoff, not silently fixed
  or forgotten.
- [x] All fixtures are sanitized from zero and hash-pinned.
- [x] No raw, names, Steam IDs, paths or payloads appear in evidence.
- [x] No new dependency, speculative plugin layer or unnecessary abstraction.
- [ ] Final branch is pushed with draft PR and Linear evidence, with no merge
  or promotion.

---

## 15. Rollback

There are exactly eleven ordered microcut commits:

1. D0 plan/provenance;
2. D1 honest disconnected runtime;
3. D2 pinned layout;
4. D3 schema/catalog;
5. D4A multivehicle parser/sanitizer;
6. D4B LMU 1.4 proof/allowlist;
7. D5 observation-to-batch;
8. D6 timing/gaps/delta;
9. D7 Overlay v1;
10. D8 end-to-end replay;
11. D9 delivery documentation.

Rollback is `git revert` of the affected complete commits in this literal
reverse order: `D9 → D8 → D7 → D6 → D5 → D4B → D4A → D3 → D2 → D1 → D0`.
The final handoff records actual SHAs beside these labels. Do not partially
revert schema before its consumers.

The old production path remains available until a later authorized cutover,
but its automatic connected mock is not a valid rollback target. If the real
LMU source is unavailable, the correct rollback behavior is disconnected
telemetry, not synthetic live data.
