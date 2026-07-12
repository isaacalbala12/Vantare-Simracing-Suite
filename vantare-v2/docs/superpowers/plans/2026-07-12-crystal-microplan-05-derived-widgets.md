# Crystal Microplan 05 Derived and Auxiliary Widgets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans and test-driven-development. Do not invent unavailable LMU fields.

**Goal:** Añadir seis tipos basados en historial acotado, calendario o datos aún no disponibles, manteniendo mocks visuales y live honesto.

**Architecture:** Histories/adapters viven fuera de renderers. Calendar se adapta desde la fuente existente. Weather/damage soportan contrato opcional pero permanecen `missing` en live hasta que el transporte lo proporcione.

**Tech Stack:** TypeScript, React, existing calendar/telemetry layers.

---

### Task 1: Derived telemetry store

**Files:** Create `frontend/src/overlay/core/derived-telemetry-store.ts/test`; modify runtime hosts only to provide derived snapshots, never canvas interaction.

- [ ] API exacta: `publish(snapshot)`, `getFuelHistory()`, `getInputHistory()`, `getDeltaHistory()`, `reset(sessionKey)`, `dispose()`.
- [ ] Límites: inputs/delta 120 puntos; fuel 64 laps; no timers propios; reset en session key/epoch/disconnected.
- [ ] Detectar nueva vuelta por incremento de `player.totalLaps` derivado de scoring player; consumo = fuel previo − actual solo si positivo y sin pit/refuel.
- [ ] Tests sin `time.Sleep`, inmutabilidad y cleanup PASS; commit `feat(telemetry): add bounded derived histories`.

### Task 2: Fuel Strategy

- [ ] Tipo `fuel-strategy`; model `{fuelLiters?, fuelPercent?, avgPerLap?, lapsRemaining?, requiredFuel?, history}`; content `{historyRows:4, units:"liters", showProjection:true}`.
- [ ] `lapsRemaining` usa session remaining / rolling lap time solo con ambos datos; `requiredFuel=avgPerLap*lapsRemaining`; sin inputs suficientes muestra `—`, nunca 0.
- [ ] Excluir Strategy Planner: no stints, tyres, pit optimization ni persistencia de estrategia.
- [ ] Crystal sección 03, Original funcional, 5Hz; commit `feat(overlays): add fuel strategy widget`.

### Task 3: Delta Trace

- [ ] Tipo `delta-trace`; model `{points,max120,currentDelta?,trend:"gaining"|"losing"|"stable"|"unknown",sectorDeltas,turnInsight?,trackPath?}`.
- [ ] Trend compara media de últimas 10 vs 10 anteriores con epsilon 0.01s; no fabricar turn/track live, quedan undefined.
- [ ] Content `{windowSeconds:4, showSectors:true, showTrackMap:true}`; Crystal sección 07 usa SVG puro.
- [ ] Commit `feat(overlays): add delta trace widget`.

### Task 4: Race Schedule

**Files:** Create widget files plus `frontend/src/overlay/widget-types/race-schedule/race-schedule-adapter.ts/test`; read existing calendar dataset through imported pure data API.

- [ ] Model máximo 4 events `{id,title,track,startAt,durationMinutes,classes,status,license?}`; ordenar por menor `startAt`; timezone solo formatea.
- [ ] Content `{rowCount:4, licenseFilter:"all", timeZone:"local"}`; no fetch, interval ni mutation en renderer.
- [ ] Dataset ausente/invalid produce missing; mock canónico reproduce sección 08.
- [ ] Commit `feat(overlays): add race schedule widget`.

### Task 5: Track Weather

- [ ] Extender snapshot opcional `environment` solo con parser/adapters cuando payload real contenga campos aprobados: ambientC, trackC, rainPercent, wetnessPercent, windKph, windDirection, pressureHpa.
- [ ] En el transporte actual todos quedan undefined; ViewModel `status:"missing"` con labels `—`; mock ready completa sección 12.
- [ ] Content `{showAmbient:true,showTrack:true,showRain:true,showWind:true}`; 2Hz.
- [ ] Commit `feat(overlays): add honest track weather widget`.

### Task 6: Car Damage Visual

- [ ] Snapshot opcional `damage` con body/aero/suspension y four tyre health values 0..1; no mapear desde campos inexistentes.
- [ ] Tipo `car-damage-visual`; model chassis/tyres/aero availability; content `{showPercent:true,showAero:true}`.
- [ ] Crystal sección 13, Original diagramático; mock ready y live missing.
- [ ] Commit `feat(overlays): add visual car damage widget`.

### Task 7: Car Damage Numbers

- [ ] Tipo independiente `car-damage-numbers`; model `{aero?,body?,suspension?,tyres?}`; content `{showTyres:true,format:"percent"}`.
- [ ] Puede compartir reader de damage, no definition/ViewModel/settings/renderer con Visual.
- [ ] Crystal sección 14, Original numérico; mock ready y live missing.
- [ ] Commit `feat(overlays): add numeric car damage widget`.

## Gate

Seis tipos registrados en ambos sistemas; derived store bounded/clean; calendar sin fetch; weather/damage no fingen live; six Crystal crops + Original render tests PASS; build/checker PASS.
