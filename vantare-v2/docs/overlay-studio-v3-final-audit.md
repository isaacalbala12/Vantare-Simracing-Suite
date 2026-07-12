# Overlay Studio V3 — auditoría final de cierre (Fase 8.8)

Fecha: 2026-07-12
Rama: `refactor`
Alcance de este cierre: cutover V3 en producción, hardening 8.1–8.6, retirement legacy (8.7) y auditoría final (8.8).

## Resumen ejecutivo

Overlay Studio V3 es el editor y runtime canónico para los cuatro widgets core (Delta, Standings, Relative, Pedals) en sistemas Original y Crystal. El legado de editor dual, mapas de widgets duplicados, presets y renderers React acoplados a telemetría fue retirado con evidencia de cero consumidores en producción.

**Estado:** el plan V3 queda completo para revisión/push de `refactor`. La expansión de widgets adicionales queda fuera de este cierre; lint frontend y algunos tests Go globales siguen siendo deuda preexistente y no se ocultan.

## Matriz de decisiones (evidencia)

| Área | Estado | Evidencia |
|------|--------|-----------|
| Perfil V3 + migración | ✅ | `pkg/config/profile_v3*.go`, goldens, `StudioProfileService` tests |
| Draft/comandos/undo | ✅ | Fase 3 tests `overlay-studio/state` |
| Registry 4×2 sistemas | ✅ | Fase 6 + `visual:overlay-studio` parity |
| Telemetría unificada | ✅ | `telemetry-rate-coordinator`, adapters Wails/SSE |
| Runtime Desktop/OBS V3 | ✅ | `DesktopOverlayRuntime`, `ObsOverlayRuntime`, `/api/profile-v3` |
| Hub → Studio directo | ✅ | `StudioRoute`, smoke manual usuario |
| Retirement legacy UI | ✅ | `overlay-studio-v3-retirement-audit.md` |
| Diseños usuario V3 | ✅ | `WidgetDesignService`, `widget-design-client` |
| Legacy consumidores producción | ✅ Cero | Búsqueda 8.7G |
| Smoke manual Wails | ✅ | Usuario post-7.10 y post-8.7D |
| i18n V3 | ✅ | Paridad de locales + frontera de literales + componentes V3 con `useI18n` |
| Accesibilidad/teclado | ✅ | Suite `overlay-studio-a11y` + browser gate wide/compact + Escape |
| Presupuesto de rendimiento | ✅ | Buckets 15/30 Hz, 20 instancias, Crystal blur ≤16px, reduced-motion |
| Diagnósticos acotados | ✅ | Collector bounded + logging Go de metadata segura |
| Kit authoring | ✅ | `_template`, contrato, checker, guía y worksheet |
| Docs vivos | ✅ | Seis contratos canónicos actualizados + auditoría de rendimiento |

## Tareas Fase 8 — estado

| Task | Título | Estado en este cierre |
|------|--------|----------------------|
| 8.1 | i18n cuatro idiomas V3 | **✅ Cerrado** — claves parity, frontera de literales y copy V3 traducible |
| 8.2 | Accesibilidad/teclado | **✅ Cerrado** — suite dedicada, foco visible, roles/nombres, drawers y Escape en browser |
| 8.3 | Presupuestos rendimiento | **✅ Cerrado** — coordinator/buckets, test 20×15/30 Hz, Crystal ≤16px y reduced-motion |
| 8.4 | Diagnósticos acotados | **✅ Cerrado** — collector bounded, wiring Studio/runtime y log seguro Go |
| 8.5 | Kit authoring sistemas | **✅ Cerrado** — template no registrado, contrato y `design-system:check` |
| 8.6 | Docs vivos alineados | **✅ Cerrado** — seis docs canónicos, auditoría de rendimiento y guías de authoring |
| 8.7 | Retirement legacy | **✅ Cerrado** 8.7A–8.7G |
| 8.8 | Auditoría final | **✅ Este documento** |

Riesgo residual: el lint global del frontend mantiene 44 errores/2 warnings preexistentes y `go test ./...` mantiene fallos en `internal/server`; ambos quedan fuera del alcance funcional de Fase 8 y deben resolverse como mantenimiento separado.

## Gates finales (2026-07-11)

| Check | Resultado | Notas |
|-------|-----------|-------|
| `pnpm --dir frontend test` | **PASS** — 213 archivos / 1578 tests | Happy-dom imprime dos `AbortError` de teardown, sin fallo de test ni exit code |
| `pnpm --dir frontend build` | PASS | Warning chunk size preexistente |
| `pnpm --dir frontend visual:overlay-studio` | **PASS** | 59 PNG 0.000% delta, parity, responsive, drag/resize, zoom y teclado |
| `pnpm --dir frontend design-system:check` | **PASS** | 2 sistemas registrados cumplen el contrato |
| `go test ./internal/app/... -run StudioProfileService -count=1` | **PASS** | Incluye regresión de logging seguro |
| `go test ./internal/app/... ./cmd/vantare/... -count=1` | PASS | Paquetes Studio/app/cmd pasan en foco V3 |
| `pnpm --dir frontend lint` | **FAIL preexistente** | 44 errores / 2 warnings globales; no se introdujo dependencia nueva ni error de build |
| `go test ./...` | **FAIL preexistente** | `internal/server` nonce/puerto; además el directorio no relacionado `vantare-v2/` contiene un test incompleto |
| `git diff --check` | **PASS** | Sin whitespace errors |

## Verificación manual recomendada post-push

1. Hub → Overlays → entra directo al Studio V3 con perfil activo.
2. Inspector Design: diseños oficiales + guardar diseño usuario.
3. Browser View con perfil guardado.
4. Desktop overlay + OBS con perfil V3.
5. Mis perfiles / Recomendados: miniaturas V3.

## Declaración de cierre

- Los cuatro widgets core están completos en Original y Crystal.
- V3 posee producción; legacy editor/renderer/preset paths eliminados.
- Las tareas 8.1–8.6 y los gates automatizados de calidad quedan implementados y verificados.
- No quedan tareas funcionales del plan inicial; los fallos globales indicados arriba son deuda previa y no forman parte del cierre V3.
