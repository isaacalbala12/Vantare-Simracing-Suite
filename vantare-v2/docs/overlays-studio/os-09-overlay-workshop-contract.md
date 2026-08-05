# OS-09 — contrato ejecutable del Overlay Workshop

Estado: ISA-260, listo para review. Base auditada: `origin/nightly@4981e6fac5b2c95af9deb4ad2a64f0592a7b4d1e`.

## Contrato actual

Un widget se compone de **tipo** (ViewModel y comportamiento funcional), **sistema**
(Original o Crystal, versión y renderer), **diseño** (plantilla oficial copiada) y
**configuración** (settings visuales del widget). Un diseño no contiene identidad,
posición, tamaño ni z-order. `WidgetVisualHost` es el único selector de renderer:
Studio, Desktop y OBS llegan a él a través de sus frames; el stage controla
`transparent|grid|solid|context` y el fondo no pertenece al host, renderer ni crop.

## Snapshot de catálogo: dos contratos, no una cifra mezclada

`CurrentCatalogSnapshot` se deriva de `ALL_WIDGET_TYPES`, manifests y
`listOfficialDesigns()` en la prueba `overlay-workshop-characterization.test.ts`:

- 19 tipos funcionales: delta, standings, relative, pedals, broadcast-tower,
  fuel-strategy, pedals-telemetry, pedals-telemetry-compact, racing-flags,
  delta-trace, race-schedule, head-to-head, delta-advanced, input-telemetry,
  multiclass-relative, track-weather, car-damage-visual, car-damage-numbers y
  engineer-radio.
- 2 sistemas: `vantare-original` (18 registros) y `vantare-crystal` (19).
- 41 diseños oficiales: 22 Crystal sobre 19 tipos.

El `HistoricalParityContract` permanece separado: `frontend/testdata/crystal-reference/manifest.json`
declara 21 diseños Crystal sobre 18 tipos, según las secciones 01–16 de
`docs/overlay-glassmorphism-pro.html`. No se regenera ni se rebaja ese gate.
El adicional de catálogo es `engineer-radio-crystal` para `engineer-radio`:
es oficial y productivo (diseño oficial y manifest Crystal), procede de Engineer
(`be151de`, endurecido en `1d8fe16`, promoción `5238409`), pero no deriva del HTML
clásico. Workshop debe previsualizarlo bajo su contrato Engineer propio, no como
paridad Crystal histórica.

## Threat model y límites de OS-09

- Dev/HMR: solo una ruta local de desarrollo; no hay conversión Workshop→producción.
- Prerelease: Nightly/Testers será read-only y requerirá un entitlement `owner`
  real y firmado. Un tester, Pro Plus o deep-link conocido no autoriza.
- Stable: ruta, sentinel y chunk deben estar físicamente ausentes (compile-out),
  no solo ocultos. ISA-264 queda bloqueada hasta demostrar el owner firmado; esta
  issue no implementa auth ni Billing.
- Deep-links: se validan y se deniegan por defecto; no seleccionan sistema, diseño
  ni fixture fuera del catálogo permitido.
- Fixtures: explícitas, deterministas y sin secretos/telemetría real; no se elevan
  a datos runtime. Los renderers reciben ViewModels puros.
- Bundle/superficies: ningún segundo host, renderer alternativo productivo,
  persistencia, Wails/SSE ni configuración se añade. Captura: selector del root
  real; alpha/bounds/overflow se validan en el root, no en el fondo del stage.

## Plan de ejecución posterior

1. ISA-261: fixtures portables/deterministas, sin runtime live.
2. ISA-262/263: MVP local HMR y contract tests de stage/root/alpha/bounds.
3. ISA-264: owner firmado y compile-out Stable, solo tras demostrar la autoridad.
4. ISA-291: autoría directa sobre TSX/CSS productivo, smoke HMR reversible y guía ejecutable. No existe conversión Workshop→app ni scaffolder obligatorio.

La especificación aprobada para ISA-291 es
`docs/superpowers/specs/2026-08-05-overlay-workshop-direct-code-authoring-design.md`
y su guía operativa es `docs/overlays-studio/overlay-workshop-authoring-guide.md`.
Esa decisión sustituye el enfoque declarativo de ISA-266–278: sus declaraciones
universales, migración masiva, barrel generado, scaffolder y `catalogPosition` no
forman parte del producto. Un HTML puede seguir siendo referencia visual, pero la
única fuente de verdad ejecutable es el renderer productivo registrado y su CSS.

No tocar en estas fases canvas drag/resize, manifests/official-designs en masa,
Billing, lectores LMU, Wails/SSE o baselines sin issue propia. La promoción sigue
`issue -> aprobación de Isaac -> nightly -> testers -> master`.

## Cómo abrir Vantare correctamente desde una rama/worktree

El procedimiento operativo completo vive en el handoff
`docs/vantare-program/handoffs/overlays-launcher-hub.md`; las autoridades
complementarias son `docs/release-beta-operations-runbook.md` (Opción A2) y
`docs/tester-build-instructions.md`. No copies archivos de entorno entre worktrees
ni expongas valores de configuración.
