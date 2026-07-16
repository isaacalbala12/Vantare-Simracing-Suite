# ISA-91 - Baseline post-preview y auditoria visual

Fecha: 2026-07-14
Rama: `vantareapp/isa-91-os-01-baseline-post-preview-y-auditoria-visual-de-las-dos`
SHA base post-preview: `b011d4b59362224c0239b5e823736257132a5699`
Base publicada: `origin/refactor@b011d4b59362224c0239b5e823736257132a5699`

## Veredicto

El fix de preview queda apto como base funcional: click sin movimiento, move, Escape, zoom y los ocho handles pasan en el harness real.

La paridad visual no esta cerca de 1:1 todavia. La auditoria separa dos frentes:

- Studio/editor: la implementacion actual difiere de `layout-studio-v10.html` un 87.254% en wide, 88.146% en medium y 92.831% en compact. Parte de ese delta es esperado porque se conserva la topbar real de Vantare, pero los bounds muestran que hay diferencias estructurales de shell/canvas/paneles que deben ir a ISA-92.
- Vantare Crystal: los 4 widgets actualmente renderizables en el harness tienen deltas 87.958%-99.979% contra la referencia `docs/overlay-glassmorphism-pro.html`. Ademas, el catalogo actual cubre solo parcialmente el inventario 21/21: 6 disenos no tienen tipo funcional registrado y 10 tipos/disenos registrados no son renderizables por el harness visual real. Esto debe ir a ISA-93.

No se han hecho cambios de producto, CSS, componentes, renderers ni contratos.

## Artefactos principales

- Metricas completas: [isa-91-visual-metrics.json](./isa-91-visual-metrics.json)
- Smoke interaccion: [isa-91-interaction-smoke.json](./isa-91-interaction-smoke.json)
- Capturas Studio:
  - [studio-wide.png](./artifacts/studio-wide.png)
  - [studio-medium.png](./artifacts/studio-medium.png)
  - [studio-compact.png](./artifacts/studio-compact.png)
- Referencia editor:
  - [layout-reference-wide.png](./artifacts/layout-reference-wide.png)
  - [studio-vs-layout-wide-overlay.png](./artifacts/studio-vs-layout-wide-overlay.png)
  - [studio-vs-layout-wide-diff.png](./artifacts/studio-vs-layout-wide-diff.png)
- Referencia Crystal:
  - [crystal-reference-full.png](./artifacts/crystal-reference-full.png)
  - secciones numeradas 01-16 en `artifacts/crystal-reference-section-*.png`

## Condiciones de captura

- Browser: Chromium headless via Playwright.
- DPR: 1.
- Viewports Studio: wide `1920x1080`, medium `1200x800`, compact `800x700`.
- Harness real: `overlay-studio-v3-harness.html`.
- Crystal referencia: `docs/overlay-glassmorphism-pro.html`, solo secciones 01-16.
- Excluido: bloque final `V2. WIDGETS REESTILIZADOS` y `.v2-section`.
- Motion: animaciones/transiciones desactivadas por inyeccion CSS durante capturas de auditoria.
- Fonts: Playwright espero `document.fonts`; los diffs siguen siendo altos, por geometria/composicion, no solo antialiasing.

## Deltas Studio -> ISA-92

| Viewport | Delta pixel | Dimension ref/impl | Bounds diff | Owner | Issue |
|---|---:|---|---|---|---|
| wide | 87.254% | 1920x1080 / 1920x1080 | pantalla completa | `frontend/src/hub/overlay-studio/` + `frontend/src/hub/overlay-studio/overlay-studio-v3.css` | ISA-92 |
| medium | 88.146% | 1200x800 / 1200x800 | pantalla completa | `frontend/src/hub/overlay-studio/` + CSS Studio | ISA-92 |
| compact | 92.831% | 800x700 / 800x700 | pantalla completa | `frontend/src/hub/overlay-studio/` + responsive/drawers | ISA-92 |

Clasificacion:

- P1 geometria/layout: proporciones de paneles, area canvas, gutters, toolbars y drawers no coinciden con la referencia.
- P1 spacing/shell: densidad, separadores, offsets y anchuras de panel deben ajustarse.
- P2 color/borde/sombra: fondo, grid, borders y materiales deben alinearse despues de fijar geometria.
- P2 tipografia/iconografia: revisar jerarquia y pesos al cerrar shell.

Nota: la topbar real de Vantare se conserva aunque no exista en `layout-studio-v10.html`; no debe copiarse una topbar del HTML.

## Matriz 21/21 Crystal -> ISA-93

| Ref | Widget type | Diseno oficial esperado | Estado actual | Prioridad | Owner sugerido |
|---|---|---|---|---|---|
| 01 Relative | `relative` | `relative-crystal-vertical` | renderizable, diff medido 99.453% | P1 | `frontend/src/overlay/design-systems/vantare-crystal/relative/RelativeCrystal.tsx` |
| 01 Standings | `standings` | `standings-crystal-vertical` | renderizable, diff medido 99.590% | P1 | `frontend/src/overlay/design-systems/vantare-crystal/standings/StandingsCrystal.tsx` |
| 02 Broadcast Tower | `broadcast-tower` | `broadcast-tower-crystal` | registrado, no cubierto por harness real | P1 | `frontend/src/overlay/design-systems/vantare-crystal/broadcast-tower/` |
| 03 Fuel Strategy | `fuel-strategy` | `fuel-strategy-crystal-unified` | falta tipo funcional | P1 | `frontend/src/overlay/widget-types/fuel-strategy/` |
| 04 Pedals V1 | `pedals-telemetry` | `pedals-telemetry-crystal-v1` | registrado, no cubierto por harness real | P1 | `frontend/src/overlay/design-systems/vantare-crystal/pedals-telemetry/` |
| 04 Pedals V2 | `pedals-telemetry-compact` | `pedals-telemetry-compact-crystal-v2` | registrado, no cubierto por harness real | P1 | `frontend/src/overlay/design-systems/vantare-crystal/pedals-telemetry-compact/` |
| 04 Pedals V3 | `pedals` | `pedals-crystal-v3` | renderizable, diff medido 99.979% | P1 | `frontend/src/overlay/design-systems/vantare-crystal/pedals/PedalsCrystal.tsx` |
| 05 Racing Flags | `racing-flags` | `racing-flags-crystal` | registrado, no cubierto por harness real | P1 | `frontend/src/overlay/design-systems/vantare-crystal/racing-flags/` |
| 06 Delta Bar | `delta` | `delta-crystal-bar` | renderizable, diff medido 87.958% | P1 | `frontend/src/overlay/design-systems/vantare-crystal/delta/DeltaCrystal.tsx` |
| 07 Delta Trace | `delta-trace` | `delta-trace-crystal` | falta tipo funcional | P1 | `frontend/src/overlay/widget-types/delta-trace/` |
| 08 Race Schedule | `race-schedule` | `race-schedule-crystal` | falta tipo funcional | P1 | `frontend/src/overlay/widget-types/race-schedule/` |
| 09 Head to Head | `head-to-head` | `head-to-head-crystal` | registrado, no cubierto por harness real | P1 | `frontend/src/overlay/design-systems/vantare-crystal/head-to-head/` |
| 10A Input Blade | `input-telemetry` | `input-telemetry-crystal-blade` | registrado, no cubierto por harness real | P1 | `frontend/src/overlay/design-systems/vantare-crystal/input-telemetry/` |
| 10B Input Capsule | `input-telemetry` | `input-telemetry-crystal-capsule` | registrado, no cubierto por harness real | P1 | `frontend/src/overlay/design-systems/vantare-crystal/input-telemetry/` |
| 10C Input Dense | `input-telemetry` | `input-telemetry-crystal-dense` | registrado, no cubierto por harness real | P1 | `frontend/src/overlay/design-systems/vantare-crystal/input-telemetry/` |
| 11 Multiclass Relative | `multiclass-relative` | `multiclass-relative-crystal` | registrado, no cubierto por harness real | P1 | `frontend/src/overlay/design-systems/vantare-crystal/multiclass-relative/` |
| 12 Track Weather | `track-weather` | `track-weather-crystal` | falta tipo funcional | P1 | `frontend/src/overlay/widget-types/track-weather/` |
| 13 Car Damage Visual | `car-damage-visual` | `car-damage-visual-crystal` | falta tipo funcional | P1 | `frontend/src/overlay/widget-types/car-damage-visual/` |
| 14 Car Damage Numbers | `car-damage-numbers` | `car-damage-numbers-crystal` | falta tipo funcional | P1 | `frontend/src/overlay/widget-types/car-damage-numbers/` |
| 15 Delta Simple | `delta` | `delta-crystal-simple` | registrado, sin medicion dedicada en harness real | P2 | `frontend/src/overlay/design-systems/vantare-crystal/delta/DeltaCrystal.tsx` |
| 16 Delta Advanced | `delta-advanced` | `delta-advanced-crystal` | registrado, no cubierto por harness real | P1 | `frontend/src/overlay/design-systems/vantare-crystal/delta-advanced/` |

Resumen de cobertura:

- 4/21 renderizables y medidos contra referencia HTML con diffs altos.
- 10/21 registrados parcial o totalmente, pero sin cobertura en el harness visual real.
- 6/21 sin tipo funcional registrado.
- 1/21 registrado pero sin medicion dedicada (`delta-crystal-simple`).

## Defectos separados por area

Studio / ISA-92:

- P1: geometria responsive no se alinea con `layout-studio-v10.html`.
- P1: panel izquierdo/canvas/inspector requieren normalizacion por viewport.
- P2: materiales, bordes, grid y sombras deben recalibrarse tras geometria.
- P2: estados `selected`, `disabled`, `dirty`, empty/loading y drawers necesitan crops dedicados en OS-02.

Crystal / ISA-93:

- P1: los renderers Crystal actuales no son una sustitucion directa del HTML canonico; los deltas medidos son estructurales.
- P1: faltan tipos funcionales obligatorios: `fuel-strategy`, `delta-trace`, `race-schedule`, `track-weather`, `car-damage-visual`, `car-damage-numbers`.
- P1: el harness visual no permite medir 14+ tipos fuera de los 4 core, aunque algunos ya esten registrados.
- P2: `delta-crystal-simple` existe como diseno oficial, pero necesita crop dedicado y seleccion por diseno para seccion 15.

Harness/baseline:

- P1: `frontend/src/overlay-harness/OverlayParityHarness.tsx` limita `HARNESS_WIDGETS` a `delta`, `standings`, `relative`, `pedals`; esto impide la auditoria automatica completa 21/21.
- P1: `visual:overlay-studio` se detiene en el primer fallo (`delta-crystal-ready-studio` 99.963%), por lo que no entrega una matriz completa cuando una baseline esta obsoleta.
- P2: el diff actual compara secciones completas cuando la referencia agrupa varios disenos; OS-03 debe crear crops por diseno exacto.

## Checks ejecutados

Desde `C:\tmp\vantare-isa-91`:

- `pnpm install --frozen-lockfile` -> PASS.
- `pnpm --dir vantare-v2/frontend visual:overlay-studio` -> FAIL esperado: `delta-crystal-ready-studio` 99.963% > 0.500%. No se regeneraron baselines.
- `pnpm --dir vantare-v2/frontend e2e:overlay-studio` -> PASS.
- `pnpm --dir vantare-v2/frontend design-system:check` -> PASS, 2 sistemas registrados.
- `pnpm --dir vantare-v2/frontend test` -> PASS, 251 files / 1719 tests. Happy DOM imprime `AbortError` durante teardown despues del resultado verde.
- `pnpm --dir vantare-v2/frontend build` -> PASS, con warning de chunk >500 kB.
- `pnpm --dir vantare-v2/frontend bench:overlay-studio-drag` -> primer intento en paralelo con test/build FAIL por ruido; repeticion aislada PASS (`move-slow` p95 40.90ms, `move-fast` p95 31.00ms, `resize-se` p95 39.50ms).
- Smoke Playwright post-preview -> PASS 12 checks: click sin movimiento, move, Escape, 8 handles y zoom 150%.

## Ajuste recomendado de ISA-92 / ISA-93

ISA-92 debe empezar por geometria de Studio, no por colores:

1. Paneles y canvas en wide/medium/compact.
2. Toolbar/action bar/drawers/inspector y estados.
3. Materiales, bordes, grid, sombras, tipografia e iconografia.
4. Repetir move/resize/zoom/teclado despues de cada microcorte.

ISA-93 debe tratar primero cobertura y harness antes de pixel-perfect:

1. Completar tipos faltantes y Original minimo para 18 tipos.
2. Expandir harness a 21 disenos, incluyendo `templateId` para Delta 06/15 e Input 10A/B/C.
3. Crear crops HTML por diseno, no por seccion agregada.
4. Sustituir Crystal actual bajo el mismo `systemId="vantare-crystal"` y versionar/migrar settings.
5. Solo entonces actualizar baselines.

## Verificacion manual para Isaac

Abrir primero:

- `docs/analysis/isa-91-overlay-studio-visual-audit/artifacts/studio-wide.png`
- `docs/analysis/isa-91-overlay-studio-visual-audit/artifacts/layout-reference-wide.png`
- `docs/analysis/isa-91-overlay-studio-visual-audit/artifacts/studio-vs-layout-wide-overlay.png`
- `docs/analysis/isa-91-overlay-studio-visual-audit/artifacts/implementation-vs-reference-06-delta-bar-overlay.png`
- `docs/analysis/isa-91-overlay-studio-visual-audit/artifacts/implementation-vs-reference-04-pedals-overlay.png`

No validar paridad por porcentaje agregado solamente: revisar composicion, geometria, spacing, tipografia, materiales y estados.
