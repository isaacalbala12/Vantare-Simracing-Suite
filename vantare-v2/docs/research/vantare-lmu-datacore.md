# Vantare LMU DataCore

## Status

Draft technical direction. No implementation in this document.

## Context

The doX LMU overlay research shows a useful split:

- Most overlay data can be rebuilt from local LMU sources.
- Official LMU Safety Rating and Driver Rating are not available from the confirmed local REST endpoints or shared memory. doX appears to get those from RaceControl/Nakama.
- Vantare should not depend on SimHub, doX, copied plugin logic, or unofficial RaceControl authentication for the v0.1.x base.

Vantare already has local telemetry infrastructure:

- `internal/telemetry/lmu`: LMU/rFactor2 shared memory reader and parser.
- `internal/telemetry/lmuapi`: local REST client for `localhost:6397`.
- `internal/telemetry/normalizer`, `pipeline`, `fusion`, `gap`, `delta`, `service`: existing processing layers.

The goal is to turn those pieces into a clear Vantare-owned LMU data foundation that can power Hub pages, overlays, engineer features, and future widgets without relying on SimHub.

## Decision

Build a small **Vantare LMU DataCore** as an internal normalization layer over local LMU sources:

```text
LMU local sources
  ├─ Shared memory rFactor2/LMU
  ├─ REST API http://localhost:6397
  └─ Local result/log/config files, later if needed

Vantare LMU DataCore
  ├─ Source adapters
  ├─ Normalized LMU snapshot
  ├─ Derived racing state
  └─ Read-only consumers

Consumers
  ├─ Overlay widgets
  ├─ Hub Telemetry page
  ├─ Engineer
  ├─ Diagnostics
  └─ Calendar/race context, where useful
```

The DataCore is not a new service boundary or dependency. It should be a conservative internal package or set of packages that reuse the current telemetry service shape.

## Non-goals

- Do not replicate SimHub as a product.
- Do not depend on SimHub plugins or properties.
- Do not copy doX or NeoRed implementation.
- Do not implement unofficial Nakama/RaceControl auth in v0.1.x.
- Do not claim official LMU SR/DR if the data is not locally available.
- Do not add a database or network backend.
- Do not rewrite existing telemetry packages unless a smaller adapter is insufficient.

## Source Map

| Source | Local | Confirmed usefulness | Typical data | Risk |
| --- | --- | --- | --- | --- |
| LMU REST `localhost:6397` | Yes | High | session, standings, teams, weather, pit/garage screens | Low |
| rFactor2/LMU shared memory | Yes | High | live telemetry, scoring, flags, fuel, tyres, position | Low/Medium |
| Result XML/logs | Yes | Medium | historical sessions, classification, lap history | Low |
| Nakama/RaceControl | Remote | SR/DR likely, online events | official ratings, profile, event data | High |
| SimHub DataCore | Local but external | Indirect | normalized properties from plugins | Medium/High dependency |

## Normalized Snapshot

The DataCore should expose one stable internal snapshot shape. Exact structs can evolve, but the model should be explicit:

```go
type LMUSnapshot struct {
    SourceStatus SourceStatus
    Session      LMUSession
    Player       LMUDriver
    Standings    []LMUStanding
    Relative     []LMURelativeCar
    Flags        LMUFlags
    Vehicle      LMUVehicleState
    Weather      LMUWeather
    Pit          LMUPitState
    Track        LMUTrackState
    UpdatedAt    time.Time
}
```

Important constraints:

- Keep units explicit: seconds, liters, percent, meters, Celsius.
- Keep timestamps explicit and monotonic where possible.
- Preserve raw IDs/names when useful, but do not leak tokens or personal identifiers into diagnostics by default.
- Treat every external field as optional. LMU endpoints and shared memory can be absent or partial.

## Responsibilities

### Source adapters

Adapters read from one source and return raw or lightly typed data:

- `lmuapi`: HTTP REST client, short timeouts, context-aware.
- `lmu`: shared memory parser and reader.
- future `lmuresults`: local files/results, if needed.

Adapters should not know about overlay UI.

### DataCore aggregation

Aggregation combines sources into one snapshot:

- REST session/standings can fill names, teams, class, weather, pit estimates.
- Shared memory can fill high-frequency telemetry and scoring.
- Fusion code should decide precedence when two sources overlap.
- Missing sources should degrade gracefully.

### Derived state

Derived state belongs in pure helpers:

- relative gaps
- class position
- stint/fuel estimates
- tyre/damage summaries
- flag state normalization
- track map positions

Existing packages like `gap`, `delta`, `fusion`, and `normalizer` should be reused where possible.

## Consumer Contracts

Consumers should read normalized data, not raw LMU payloads.

| Consumer | Data needed | Notes |
| --- | --- | --- |
| Relative widget | player position, nearby cars, gaps, class | Needs stable, low-latency updates |
| Standings widget | ordered cars, class, lap/time gaps | Can use REST + scoring fusion |
| Fuel widget | fuel level, consumption, laps/time remaining | Shared memory first |
| Damage/tyres widget | wheel/tyre/damage channels | Shared memory first |
| Weather widget | weather REST + session weather | Low frequency |
| Track map/navigation | positions and track metadata | Shared memory + local metadata |
| Engineer | events, warnings, fuel/tyre/flags/context | Derived state, not raw polling |
| Hub Telemetry | connection status and high-level facts | No fake metrics |

## Rating and Safety

Official LMU SR/DR should remain out of the v0.1.x DataCore unless a clean, documented local source appears.

Recommended UI wording if needed:

- "Rating oficial LMU: no disponible localmente."
- "Vantare puede calcular métricas locales en el futuro, separadas del rating oficial."

A future **Vantare local rating** is possible, but it must be clearly named and based on local evidence:

- clean laps
- incident-like events if available
- off-track/penalty signals if exposed
- consistency and completion
- session history

It must never be presented as official LMU Safety Rating or Driver Rating.

## Implementation Plan

### LMU-DATA-01: Source inventory and contracts

Backend-only.

- Document confirmed REST endpoints and fields.
- Add fixtures for `sessionInfo`, `standings`, `multiplayer/teams`, weather if available.
- Ensure `internal/telemetry/lmuapi` has context-aware methods and tests.
- Define a first `LMUSnapshot` draft in a backend package.

### LMU-DATA-02: Snapshot builder

Backend-only.

- Build a pure function that merges REST + shared memory samples into `LMUSnapshot`.
- Use fixtures and synthetic shared-memory data.
- No Wails, no frontend.

### LMU-DATA-03: Diagnostics bridge

Minimal Wails bridge or existing diagnostics extension.

- Expose source status and a redacted snapshot summary.
- Do not expose raw personal IDs by default.
- Use this to verify the DataCore before building UI.

### LMU-DATA-04: Widget-ready models

Backend + frontend types.

- Define compact models for relative, standings, fuel, tyres/damage, weather.
- Keep widget rendering separate from source polling.

### LMU-DATA-05: First real widget integration

Pick one low-risk widget, preferably Relative or Standings.

- Consume normalized model.
- Preserve existing widget appearance controls.
- Do not mix with LayoutStudio position/size logic.

## Verification Strategy

- Unit tests for parsing and normalization.
- Fixtures from real LMU responses, with personal data redacted.
- Synthetic shared-memory tests for repeatability.
- Runtime diagnostics view before user-facing UI.
- Manual smoke with LMU running:
  - no LMU
  - LMU menu
  - practice session
  - race/session with multiple cars
  - offline vs online server

## Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Overbuilding a SimHub clone | High | Keep DataCore small and Vantare-specific. |
| Raw REST/shared-memory shapes leaking to UI | Medium | Normalize once; consumers use stable types. |
| Polling too aggressively | Medium | Separate high-frequency shared memory from low-frequency REST. |
| Claiming official SR/DR incorrectly | High | Explicitly exclude official SR/DR until clean source exists. |
| Large mixed feature diffs | High | Ship in LMU-DATA-* cuts with focused tests. |
| Personal data in diagnostics | Medium | Redact Steam IDs/tokens/paths by default. |

## Open Questions

- Which current telemetry package should own `LMUSnapshot`: existing `service`, new `datacore`, or `normalizer`?
- What update rates are safe for REST endpoints during gameplay?
- Which overlay should be the first real consumer: Relative, Standings, Fuel, or Weather?
- Do we need a local recording/replay fixture format for manual sessions?

## Recommended Next Step

After CALENDAR-05 is stable, create a technical plan:

`docs/superpowers/plans/YYYY-MM-DD-lmu-data-01-local-datacore.md`

Start with source contracts and fixtures only. Do not build UI until the snapshot is verified.
