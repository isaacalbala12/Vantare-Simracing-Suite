# Overlay Studio V3 — auditoría final de cierre (Fase 8.8)

Fecha: 2026-07-11  
Rama: `refactor` (27 commits ahead de `origin/refactor` al cierre)  
Alcance de este cierre: cutover V3 en producción + retirement legacy (8.7) + gates automatizados.

## Resumen ejecutivo

Overlay Studio V3 es el editor y runtime canónico para los cuatro widgets core (Delta, Standings, Relative, Pedals) en sistemas Original y Crystal. El legado de editor dual, mapas de widgets duplicados, presets y renderers React acoplados a telemetría fue retirado con evidencia de cero consumidores en producción.

**Estado:** listo para push de `refactor` y merge cuando el usuario apruebe. Expansión de widgets adicionales queda explícitamente fuera de este cierre.

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

## Tareas Fase 8 — estado

| Task | Título | Estado en este cierre |
|------|--------|----------------------|
| 8.1 | i18n cuatro idiomas V3 | **Diferido** — UI V3 funcional; literals parciales; sin `overlay-studio-i18n.test.ts` |
| 8.2 | Accesibilidad/teclado | **Diferido** — hotkeys y shell cubiertos por tests existentes; sin suite `overlay-studio-a11y` dedicada |
| 8.3 | Presupuestos rendimiento | **Parcial** — coordinator + frames V3 en Fase 7; sin `overlay-performance.test.tsx` ni audit doc nuevo |
| 8.4 | Diagnósticos acotados | **Diferido** — sin `widget-diagnostics.ts` |
| 8.5 | Kit authoring sistemas | **Diferido** — sin `_template` ni `design-system:check` |
| 8.6 | Docs vivos alineados | **Parcial** — `current-plan` + inventario + esta auditoría; docs históricos (`widget-architecture.md`, etc.) sin barrido completo |
| 8.7 | Retirement legacy | **✅ Cerrado** 8.7A–8.7G |
| 8.8 | Auditoría final | **✅ Este documento** |

Riesgo aceptado: hardening 8.1–8.6 se aborda en fase de expansión/post-merge sin bloquear cutover V3.

## Gates finales (2026-07-11)

| Check | Resultado | Notas |
|-------|-----------|-------|
| `pnpm --dir frontend test` | 1561/1562 PASS | 1 flaky: `useCanvasInteraction` bajo suite completa |
| `pnpm --dir frontend build` | PASS | Warning chunk size preexistente |
| `pnpm --dir frontend visual:overlay-studio` | PASS | 59 PNG 0.000% delta |
| `go test ./internal/app/... ./cmd/vantare/...` | PASS | |
| `pnpm --dir frontend lint` | No ejecutado | 11 errores preexistentes documentados en Fase 1 |
| `go test ./...` | No gate | `internal/server` nonce/port preexistentes |
| `design-system:check` | N/A | Script no existe aún (Task 8.5) |

## Verificación manual recomendada post-push

1. Hub → Overlays → entra directo al Studio V3 con perfil activo.
2. Inspector Design: diseños oficiales + guardar diseño usuario.
3. Browser View con perfil guardado.
4. Desktop overlay + OBS con perfil V3.
5. Mis perfiles / Recomendados: miniaturas V3.

## Declaración de cierre

- Los cuatro widgets core están completos en Original y Crystal.
- V3 posee producción; legacy editor/renderer/preset paths eliminados.
- La expansión (widgets nuevos, 8.1–8.6 hardening, `design-system:check`) puede comenzar tras merge de `refactor`.