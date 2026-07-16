# Crystal Microplan 02 Reference and Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans, test-driven-development and browser-testing-with-devtools.

**Goal:** Congelar las 21 composiciones canónicas y construir tokens/primitivas Crystal sin modificar widgets funcionales.

**Architecture:** El HTML es fixture visual, no código de producción. Un extractor limita autoridad al rango 01–16; las primitivas aceptan props puras y el CSS queda scoped por `data-widget-system="vantare-crystal"`.

**Tech Stack:** Node ya instalado, Playwright existente, React, CSS, Vitest.

---

### Task 1: Manifest canónico de 21 crops

**Files:** Create `frontend/scripts/extract-crystal-reference.mjs`, `frontend/scripts/crystal-reference-manifest.test.mjs`, `frontend/testdata/crystal-reference/manifest.json`, `docs/templates/vantare-crystal-glassmorphism-worksheet.md`.

- [ ] RED: script exige marcador final V2, corta antes de él y compara IDs exactos: relative, standings, broadcast, fuel, pedals-telemetry, pedals-telemetry-compact, pedals, flags, delta-bar, delta-trace, schedule, head-to-head, input-blade/capsule/dense, multiclass, weather, damage-visual, damage-numbers, delta-simple, delta-advanced.
- [ ] Test rechaza cualquier crop cuyo selector empiece `.v2-` y exige 21 IDs únicos.
- [ ] Cada entrada JSON fija `referenceSelector`, `widgetType`, `designId`, `width`, `height` y `htmlSection`.
- [ ] Run node test twice; Expected: 21 PASS deterministas.
- [ ] Commit `test(crystal): freeze canonical reference inventory`.

### Task 2: Captura HTML estable

**Files:** Create `frontend/scripts/crystal-reference-capture.mjs`; output PNGs under `frontend/testdata/crystal-reference/`.

- [ ] Servir repo por Vite existente; DPR=1, Chromium, viewport 1920×1080, `document.fonts.ready`, animations/transitions disabled.
- [ ] Capturar selector exacto con fondo transparente estable; fallar por missing selector, overflow, console error o request fallida.
- [ ] Escribir hash y bounding box en manifest; segunda ejecución debe producir hashes iguales.
- [ ] Commit `test(crystal): capture 21 canonical glass compositions`.

### Task 3: Tokens exactos y fuentes offline

**Files:** Modify `frontend/src/overlay/design-systems/vantare-crystal/tokens.css`, create `reference-contract.test.ts`, add font assets only if already licensed/available in repo.

- [ ] RED contractual para `#060608`, Inter, Plus Jakarta Sans, JetBrains Mono, fondos rgba, bordes, radios, sombras y blur 20/24/25 usados por HTML.
- [ ] Scope completo; no cambiar Original ni CSS del Studio.
- [ ] Si una fuente no está legal/localmente disponible, usar fallback explícito y registrar pixel delta; no descargar sin aprobación.
- [ ] Actualizar performance budget de 16 a 24 solo junto a benchmark que pruebe 20 widgets.
- [ ] Tests tokens/performance PASS; commit `feat(crystal): install canonical glass tokens`.

### Task 4: Primitivas puras

**Files:** Create `crystal-primitives.tsx`, `crystal-primitives.test.tsx`, optional colocated CSS under `vantare-crystal/`.

- [ ] RED para `CrystalSurface`, `CrystalHeader`, `CrystalBrand`, `CrystalPill`, `CrystalFooter`, `CrystalTableRow`, `CrystalStatusFrame`.
- [ ] Props solo strings/numbers/ReactNode/status; prohibidos imports de profile, Wails, SSE, access policy, telemetry store y layout.
- [ ] No forzar una primitive si solo aparece en un widget; mantener markup local para paridad.
- [ ] Vitest + `rg` de imports prohibidos PASS; commit `feat(crystal): add pure glass primitives`.

## Gate

21 crops canónicos, cero `.v2-*`, hashes repetibles, fuentes resueltas, contract tests PASS, design-system checker PASS. No baseline React actualizado todavía.
