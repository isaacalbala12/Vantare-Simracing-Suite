# Crystal Microplan 04 Live Widgets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans and test-driven-development. Complete one widget and commit before starting the next.

**Goal:** Añadir ocho tipos nuevos que pueden funcionar con telemetría LMU ya disponible.

**Architecture:** Primero se amplía `TelemetrySnapshot` de forma aditiva desde `TelemetryPayload`; después cada tipo obtiene definición, parser de content, ViewModel puro, inspector, Original, Crystal, mocks y registro. Ausente nunca significa cero.

**Tech Stack:** TypeScript, React, Vitest, existing telemetry adapters.

---

### Task 1: Snapshot normalizado suficiente

**Files:** Modify `telemetry-snapshot.ts`, `telemetry-adapter.ts/test`, `mock-scenarios.ts/test`; create `widget-types/shared/input-readers.ts/test` and extend `scoring-readers.ts/test`.

- [ ] RED para player opcional `speedKph`, `rpm`, `gear`, `fuelLiters`, `totalLaps`; session `key`, `epoch`, `trackName`, `globalFlag`, `sectorFlags`; scoring readers tipados para number/name/team/class/place/laps/gaps/pits/tyre/penalties.
- [ ] Mapear solo campos presentes en `TelemetryPayload`/`TelemetryRefState`; conservar `undefined`; clamp inputs 0..1, speed/RPM/fuel ≥0.
- [ ] Disconnected/error vacían datos live; stale conserva último valor con status stale.
- [ ] Adapter tests PASS; commit `feat(telemetry): expose normalized live widget fields`.

## Contrato repetible por widget

Cada tarea crea carpeta en `widget-types`, cuatro archivos definition/view-model + tests, inspector, ambos renderers/tests, manifest registrations, official designs, mock fixture e i18n. Definition declara `createDefault`, parser estricto, minimum/default size, updateHz y acceso. Original debe ser funcional, no placeholder.

### Task 2: Pedals Telemetry

- [ ] Tipo `pedals-telemetry`; model `{status, throttle, brake, clutch, speedKph?, rpm?, gear?, playerPosition?}`; 30Hz; content `{showPosition:true, showClutch:true}`.
- [ ] Crystal `pedals-telemetry` reproduce columna 04 V1 cápsula; Original presenta mismos campos sin glass.
- [ ] Test diferencia identidad de `pedals`; commit `feat(overlays): add pedals telemetry`.

### Task 3: Pedals Telemetry Compact

- [ ] Tipo `pedals-telemetry-compact`; mismo conjunto de datos pero ViewModel/definition independientes; 30Hz; content `{showSpeed:true, showRpm:true, showClutch:true}`.
- [ ] Crystal reproduce columna 04 V2 perfil bajo; no importar componentes V1 salvo readers puros.
- [ ] Commit `feat(overlays): add compact pedals telemetry`.

### Task 4: Racing Flags

- [ ] Model `{status, globalFlag?: string, sectorFlags: readonly string[], message?: string}`; 10Hz; content `{showSectorFlags:true, hideWhenGreen:false}`.
- [ ] Normalizar flag únicamente desde session actual; behavior puede ocultar green, renderer no decide visibilidad global.
- [ ] Crystal sección 05; commit `feat(overlays): add racing flags`.

### Task 5: Broadcast Tower

- [ ] Model `{status, sessionLabel, lap?, trackTempC?: undefined, sof?: undefined, rows}`; rows máximo 8 con place/number/name/team/class/gap/isPlayer.
- [ ] `trackTempC` y SOF permanecen unknown mientras snapshot no los exponga; HTML-ready mock sí fija valores para paridad.
- [ ] Content `{rowCount:5, showWeather:true, showSof:true}` con rowCount 3..8; Crystal sección 02.
- [ ] Commit `feat(overlays): add broadcast tower`.

### Task 6: Head to Head

- [ ] Model `{status, player?, opponent?, gapSeconds?, sectorComparisons}`; target default coche inmediatamente anterior; content `{target:"ahead"|"behind", showSectors:true}`.
- [ ] Selección pura/determinista desde scoring; si falta rival, status `missing` dentro del frame.
- [ ] Crystal sección 09; commit `feat(overlays): add head to head`.

### Task 7: Input Telemetry con tres diseños

- [ ] Tipo único `input-telemetry`; model inputs + speed/RPM/gear + histories acotados a 120 muestras; 30Hz; content `{historySeconds:4, showClutch:true}`.
- [ ] Crear accumulator fuera de renderer, keyed por widget/session y limpiado al cambiar epoch; ninguna mutación dentro de `buildViewModel`.
- [ ] Crystal `templateId` exactos `input-blade`, `input-capsule`, `input-dense`; tres official designs 10A/B/C; un Original default.
- [ ] Tests prueban una entrada de catálogo y tres diseños; commit `feat(overlays): add input telemetry designs`.

### Task 8: Multiclass Relative

- [ ] Model rows máximo 7 `{place,classId,classColor,number,name,gap,isPlayer}`; centrar player y conservar vecinos de otras clases; 10Hz.
- [ ] Content `{rowCount:5, classMode:"all", showClassDivider:true}`; palette determinista desde class string, override visual opcional.
- [ ] Crystal sección 11; commit `feat(overlays): add multiclass relative`.

### Task 9: Delta Advanced

- [ ] Tipo `delta-advanced`; model `{best?, sector?, theoretical?, last?}` con disponibilidad por campo; no es `delta` ni diseño de Delta.
- [ ] Solo mapear best/last existentes; sector/theoretical quedan unknown live hasta fuente real; mock canónico llena cuatro para visual parity.
- [ ] Crystal sección 16 y Original funcional; commit `feat(overlays): add delta advanced`.

## Gate

18 tipos todavía pueden resolverse en ambos manifests; estos 8 aparecen en AddWidget; 10 diseños Crystal nuevos listados correctamente; mock/live status honestos; no imports prohibidos; focused tests/build/checker PASS.
