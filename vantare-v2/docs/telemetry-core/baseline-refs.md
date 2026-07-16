# TC-01A — Baseline inmutable de refs

Fecha de auditoría: 2026-07-14 (Europe/Madrid).

Esta evidencia se obtuvo después de `git fetch origin --prune`. La base de ISA-23 es el HEAD local solicitado de `refactor`; no se capturó ningún cambio sin commit de los worktrees existentes.

## Rama y worktree de ejecución

- Rama: `vantareapp/isa-23-tc-01a-baseline-de-refs-merge-simulation-y-matriz-de-rescate`
- Worktree Git: `C:\Users\isaac\emdash\worktrees\vantare-v2\isa-23-telemetry-baseline`
- Subproyecto Go/frontend: `C:\Users\isaac\emdash\worktrees\vantare-v2\isa-23-telemetry-baseline\vantare-v2`
- HEAD inicial de la rama: `9712d993fa0099beeaac6616899b30b3c4261bae`
- Estado inicial del worktree ISA-23: limpio (`git status --short` sin salida).

## SHAs fijados

| Ref local auditada | SHA completo | Fecha del commit | Commit |
|---|---|---|---|
| `refactor` | `9712d993fa0099beeaac6616899b30b3c4261bae` | 2026-07-13T01:03:07+02:00 | `chore(overlays): close microplan 04 gate` |
| `codex/engineer-release` | `91cf7e9323bd53edbf1d554d2d32f3f4fd748c82` | 2026-07-12T15:52:27+02:00 | `feat(engineer): implementar suite completa del ingeniero Go` |
| `develop` | `c49e14aab474ee132c0368e92918f78d66a162c8` | 2026-07-12T21:22:40+02:00 | `chore: delete obsolete analysis docs (covered by stash cleanup)` |
| merge-base `refactor` / `codex/engineer-release` | `b58917c028f1b11915e99b1bdef770e8b2cdb655` | 2026-06-27T12:34:12+02:00 | `docs: corrige alcance release, decisiones de pago y ambiguedades R14/R15` |

## Divergencia

`git rev-list --left-right --count refactor...codex/engineer-release` devolvió:

```text
426  24
```

Por tanto, desde el merge-base hay 426 commits exclusivos de `refactor` y 24 exclusivos de `codex/engineer-release`.

Las refs locales están por delante de las remotas observadas tras el fetch y no están detrás:

| Ref | Local | `origin/*` | Divergencia local / remota |
|---|---|---|---:|
| `refactor` | `9712d993fa0099beeaac6616899b30b3c4261bae` | `39e338a0a6816adfbb108be483e1cb2bf885a940` | 39 / 0 |
| `codex/engineer-release` | `91cf7e9323bd53edbf1d554d2d32f3f4fd748c82` | `a79f75d16eac80a0623294c68270e840d2445041` | 1 / 0 |
| `develop` | `c49e14aab474ee132c0368e92918f78d66a162c8` | `1af75dab0e76f24922f5885d598ab2256b508dc6` | 61 / 0 |

La auditoría y la simulación usan las refs locales fijadas en la tabla anterior, tal como exige ISA-23. Un push de esta rama publicará también la historia local de `refactor` que todavía no está en `origin/refactor`; no se hará rebase ni force-push.

## Remotes

```text
origin  git@github.com:isaacalbala12/Vantare-Simracing-Suite.git (fetch)
origin  git@github.com:isaacalbala12/Vantare-Simracing-Suite.git (push)
```

## Worktrees implicados y cambios sin commit

No se modificó ni limpió ninguno de estos checkouts. Los cambios se auditaron con `git status --short`; la simulación e inventario leen exclusivamente objetos commiteados mediante refs.

### `refactor` — 48 entradas

Worktree: `C:\Users\isaac\Desktop\Vantare-Overlays`

```text
 M strategy-base.html
 M vantare-v2/AGENTS.md
 M vantare-v2/configs/calendar-lmu.json
 M vantare-v2/configs/license-cache.json
 M vantare-v2/docs/agent-workflow.md
 M vantare-v2/docs/current-plan.md
 M vantare-v2/frontend/src/hub/overlay-studio/canvas/StudioWidgetFrame.test.tsx
 M vantare-v2/frontend/src/hub/overlay-studio/canvas/canvas-frame-preview.test.ts
 M vantare-v2/frontend/src/hub/overlay-studio/canvas/canvas-frame-preview.ts
 M vantare-v2/frontend/src/hub/overlay-studio/canvas/canvas-resize.test.ts
 M vantare-v2/frontend/src/hub/overlay-studio/canvas/canvas-resize.ts
 M vantare-v2/frontend/src/hub/overlay-studio/canvas/useCanvasInteraction.test.tsx
 M vantare-v2/frontend/src/hub/overlay-studio/canvas/useCanvasInteraction.ts
 M vantare-v2/frontend/src/hub/overlay-studio/canvas/widget-content-base-size.test.ts
 M vantare-v2/frontend/src/hub/overlay-studio/canvas/widget-content-base-size.ts
 M vantare-v2/frontend/src/hub/overlay-studio/canvas/widget-intrinsic-scale.ts
 M vantare-v2/frontend/src/overlay/design-systems/vantare-crystal/relative/RelativeCrystal.test.tsx
 M vantare-v2/frontend/src/overlay/design-systems/vantare-crystal/relative/RelativeCrystal.tsx
 M vantare-v2/frontend/src/overlay/design-systems/vantare-original/relative/RelativeOriginal.test.tsx
 M vantare-v2/frontend/src/overlay/design-systems/vantare-original/relative/RelativeOriginal.tsx
 M vantare-v2/frontend/testdata/overlay-studio-visual/delta-crystal-disconnected.png
 M vantare-v2/frontend/testdata/overlay-studio-visual/delta-crystal-error.png
 M vantare-v2/frontend/testdata/overlay-studio-visual/delta-crystal-ready-desktop.png
 M vantare-v2/frontend/testdata/overlay-studio-visual/delta-crystal-ready-obs.png
 M vantare-v2/frontend/testdata/overlay-studio-visual/delta-crystal-ready-studio.png
 M vantare-v2/frontend/testdata/overlay-studio-visual/delta-crystal-stale.png
 M vantare-v2/frontend/testdata/overlay-studio-visual/pedals-crystal-disconnected.png
 M vantare-v2/frontend/testdata/overlay-studio-visual/pedals-crystal-error.png
 M vantare-v2/frontend/testdata/overlay-studio-visual/pedals-crystal-full.png
 M vantare-v2/frontend/testdata/overlay-studio-visual/pedals-crystal-ready-desktop.png
 M vantare-v2/frontend/testdata/overlay-studio-visual/pedals-crystal-ready-obs.png
 M vantare-v2/frontend/testdata/overlay-studio-visual/pedals-crystal-ready-studio.png
 M vantare-v2/frontend/testdata/overlay-studio-visual/pedals-crystal-stale.png
 M vantare-v2/frontend/testdata/overlay-studio-visual/pedals-crystal-zero.png
 M vantare-v2/frontend/testdata/overlay-studio-visual/relative-crystal-disconnected.png
 M vantare-v2/frontend/testdata/overlay-studio-visual/relative-crystal-error.png
 M vantare-v2/frontend/testdata/overlay-studio-visual/relative-crystal-fill.png
 M vantare-v2/frontend/testdata/overlay-studio-visual/relative-crystal-ready-desktop.png
 M vantare-v2/frontend/testdata/overlay-studio-visual/relative-crystal-ready-obs.png
 M vantare-v2/frontend/testdata/overlay-studio-visual/relative-crystal-ready-studio.png
 M vantare-v2/frontend/testdata/overlay-studio-visual/relative-crystal-stale.png
 M vantare-v2/frontend/testdata/overlay-studio-visual/standings-crystal-disconnected.png
 M vantare-v2/frontend/testdata/overlay-studio-visual/standings-crystal-error.png
 M vantare-v2/frontend/testdata/overlay-studio-visual/standings-crystal-ready-desktop.png
 M vantare-v2/frontend/testdata/overlay-studio-visual/standings-crystal-ready-obs.png
 M vantare-v2/frontend/testdata/overlay-studio-visual/standings-crystal-ready-studio.png
 M vantare-v2/frontend/testdata/overlay-studio-visual/standings-crystal-stale.png
 M vantare-v2/frontend/testdata/overlay-studio-visual/standings-crystal-stress60.png
```

Estos cambios no se capturan: ISA-23 parte del commit `9712d993...` y registra explícitamente la diferencia respecto al checkout principal.

### `codex/engineer-release` — 37 entradas

Worktree: `C:\Users\isaac\Desktop\Vantare-Overlays\vantare-v2-engineer`

```text
 M docs/lmu-capture/README.md
 M scripts/lmu-capture/capture.py
 M vantare-v2/internal/license/service.go
?? data/
?? docs/lmu-capture/aggressive/
?? docs/lmu-capture/capture-report.md
?? docs/lmu-capture/driving/
?? docs/lmu-capture/final-validation/
?? docs/lmu-capture/snapshot-00-pits.bin
?? docs/lmu-capture/snapshot-01-outlap.bin
?? docs/lmu-capture/snapshot-02-driving.bin
?? docs/lmu-capture/wheel-final/
?? docs/lmu-capture/wheel-findings.md
?? docs/lmu-capture/wheel-verify/
?? docs/superpowers/plans/2026-06-29-multi-language-audio-system.md
?? scripts/add_trans.py
?? scripts/add_wheel_fields.py
?? scripts/check_keys.py
?? scripts/check_keys2.py
?? scripts/check_trans.py
?? scripts/fix_trans.py
?? scripts/generate_all_voices.py
?? scripts/generate_driver_audio.py
?? scripts/kokoro_cache.py
?? scripts/lmu-capture/analyze_final.py
?? scripts/lmu-capture/analyze_wheels.py
?? scripts/lmu-capture/find_temps.py
?? scripts/lmu-capture/gen_driving_report.py
?? scripts/lmu-capture/scan_bytes.py
?? scripts/lmu-capture/scan_offsets_fast.py
?? scripts/lmu-capture/scan_offsets.py
?? scripts/lmu-capture/scan_wheel_offsets.py
?? scripts/setup.py
?? test_kokoro.mp3
?? vantare-v2/dev/
?? vantare-v2/docs/superpowers/plans/2026-06-27-engineer-release-expansion.md
?? vantare-v2/docs/tyre-strategy-planner-analysis.md
```

Los datos/capturas sin commit no forman parte del SHA auditado y no se usan como evidencia de disponibilidad real.

### `develop` — 21 entradas

Worktree: `C:\Users\isaac\emdash\worktrees\vantare-v2\develop`

```text
 M vantare-v2/build/darwin/icons.icns
 M vantare-v2/build/windows/nsis/project.nsi
 M vantare-v2/configs/calendar-lmu.json
 M vantare-v2/frontend/src/hub/overlays/BronzeCard.test.tsx
 M vantare-v2/frontend/src/hub/overlays/BronzeCard.tsx
 M vantare-v2/frontend/src/hub/overlays/LayoutStudio.tsx
 M vantare-v2/frontend/src/hub/overlays/SubNavContent.test.tsx
 M vantare-v2/frontend/src/hub/overlays/SubNavContent.tsx
 M vantare-v2/frontend/src/hub/overlays/SubNavRail.test.tsx
 M vantare-v2/frontend/src/hub/overlays/SubNavRail.tsx
 M vantare-v2/frontend/src/hub/overlays/WidgetSettingsPanel.test.tsx
 M vantare-v2/frontend/src/hub/overlays/WidgetSettingsPanel.tsx
 M vantare-v2/frontend/src/hub/overlays/WidgetStudio.test.tsx
 M vantare-v2/frontend/src/hub/overlays/sub-nav-config.test.ts
 M vantare-v2/frontend/src/hub/overlays/sub-nav-config.ts
 M vantare-v2/frontend/src/index.css
?? docs/superpowers/plans/2026-07-10-layout-studio-subnav-redesign.md
?? layout-studio-v10.html
?? nul
?? vantare-v2/docs/superpowers/plans/2026-07-10-layout-studio-subnav-redesign.md
?? vantare-v2/frontend/src/hub/overlays/DesignBronzeCards.tsx
```

## Fuente del plan TC-01A

Los tres planes Telemetry Core aún no existen en `refactor@9712d993...`. Se leyeron desde el worktree limpio de ISA-21, commit `6fa3c52af8309e000dafd164aa80189c718f0c7e`, sin copiarlo ni mezclarlo en esta rama. Esta diferencia no altera el baseline y evita adelantar archivos fuera de los tres autorizados por ISA-23.

## Rollback

Este corte no cambia refs base ni realiza merge. El rollback documental consiste en revertir el único commit de ISA-23 o eliminar los tres archivos en esta rama; los otros worktrees permanecen intactos.
