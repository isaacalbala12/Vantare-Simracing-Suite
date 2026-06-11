# Vantare v2 — Plan maestro (esqueleto)

> **Estado**: Activo | **Fecha**: 2026-06-11  
> Plan general de implementación. Cada fase se desglosa en **miniplanes** (`.omo/plans/v2-f{N}-*.md`) antes de codificar.

**Referencias:**

- Stack y optimizaciones: [`V2-STACK-AND-PERFORMANCE.md`](./V2-STACK-AND-PERFORMANCE.md)
- Código scaffold: [`../vantare-v2/`](../vantare-v2/)

---

## Cómo usar este documento

1. **Elige la fase** en la que estás (solo una activa a la vez).
2. **Antes de implementar**, crea un miniplan para la tarea concreta usando la [plantilla](#plantilla-de-miniplan).
3. **Al cerrar** la tarea: marca checklist, registra evidencia (`go test`, screenshot, benchmark) y actualiza el estado de la fase.
4. **No saltar fases** salvo spikes documentados (timebox ≤ 2 h, sin merge a main sin revisar).

---

## Mapa de fases (10)

| Fase | Nombre | Entregable | Validación | Estado |
|------|--------|------------|------------|--------|
| **0** | Entorno | Go instalado, `vantare-v2/` compila | `go test ./...` + `lmu-debug -mock -once` | ✅ Hecho |
| **1** | LMU reader + parser | mmap + parser por offsets + CLI | Consola: speed/rpm/gear (mock y live) | 🟡 Casi (falta offsets codegen + live LMU) |
| **2** | Pipeline telemetría | Normalizer + deadband + throttle 30 Hz | Benchmark parse < 2 ms/tick | ✅ |
| **3** | Wails overlay mínimo | 1 ventana compuesta shrink-wrap, 1 widget | < 80 MB RAM, bounds OK | ✅ MVP |
| **4** | Layout + modos | JSON layout, racing/edit, 3 widgets | Persistencia, skipWindowRefresh | 🟡 Plan listo |
| **5** | Hub React | Dashboard shadcn, config sin editar JSON | CRUD perfil desde UI | ⬜ Pendiente |
| **6** | OBS / SSE | HTTP embebido, modo streaming-only | Browser source sin ventana Wails | ⬜ Pendiente |
| **7** | Optimización UI | FPS por widget + diff payload | Standings 15 Hz, delta 30 Hz | ⬜ Pendiente |
| **8** | Temas | CSS variables + Lite mode | Swap tema en runtime | ⬜ Pendiente |
| **9** | Ops + multi-sim | System Performance widget, iRacing/AC | Usuario ve CPU/RAM; 2º sim | ⬜ Pendiente |

**Leyenda:** ✅ Hecho · 🟡 En curso · ⬜ Pendiente

---

## Presupuestos globales (no negociables)

| Métrica | Objetivo |
|---------|----------|
| RAM (hub + 1 overlay compuesto) | < 120 MB |
| CPU en pista | < 2 % |
| Binario release | < 40 MB |
| Parse LMU (tick) | < 2 ms |
| Broadcast UI | ≤ 30 Hz (lectura Go @ 60 Hz) |

---

## Fase 0 — Entorno ✅

**Objetivo:** Máquina de desarrollo lista para v2.

| Tarea | Miniplan | Estado |
|-------|----------|--------|
| Instalar Go (winget `GoLang.Go`) | — | ✅ |
| Scaffold `vantare-v2/` | — | ✅ |
| Fix mmap Windows (`kernel32` syscalls) | — | ✅ |
| `go test ./...` verde | — | ✅ |

**Evidencia:** `track=Spa | speed=54.0 km/h | gear=4 | rpm=7200 | fuel=45.2 L | lap=0` con `-mock -once`.

---

## Fase 1 — LMU reader + parser 🟡

**Objetivo:** Leer `LMU_Data` y exponer telemetría unificada desde Go.

### Tareas (miniplanes futuros)

| ID | Tarea | Archivos / área | Validación |
|----|-------|-----------------|------------|
| 1.1 | Portar `generate-lmu-offsets.py` → salida `offsets.go` | `vantare-v2/tools/`, CI hook | Diff offsets vs v1 TS | ✅ |
| 1.2 | Ampliar parser (standings, sesión completa) | `internal/telemetry/lmu/parser.go` | Tests con fixture `.bin` o JSON |
| 1.3 | Fixture de test desde v1 | `testdata/` | `go test` sin LMU | ✅ |
| 1.4 | Validación live con LMU en pista | `cmd/lmu-debug` | `-once` con sim abierto |
| 1.5 | Documentar requisitos LMU (shared memory plugin) | `vantare-v2/README.md` | — |

**Criterio de cierre Fase 1:** CLI live muestra datos reales en pista; tests unitarios con fixture; offsets generados, no hand-edited.

**Miniplan sugerido siguiente:** `v2-f1-offsets-codegen.md`

---

## Fase 2 — Pipeline telemetría

**Objetivo:** Capa 2 completa — normalizer, deadband, throttle antes de cualquier UI.

### Tareas

| ID | Tarea | Validación |
|----|-------|------------|
| 2.1 | `internal/telemetry/normalizer` — modelo `pkg/models` estable | Tipos compartidos documentados |
| 2.2 | Integrar `internal/core/deadband` en pipeline | Campos estables no re-emiten |
| 2.3 | Broadcaster 60→30 Hz + diff payload | Benchmark + test contadores |
| 2.4 | `cmd/lmu-debug -bench` o test `BenchmarkParse` | p99 < 2 ms |

**Criterio de cierre:** Un paquete `telemetry.Service` con `Subscribe()` listo para Wails/SSE.

**Miniplan sugerido:** `v2-f2-telemetry-pipeline.md`

---

## Fase 3 — Wails overlay mínimo

**Objetivo:** Primera ventana overlay compuesta (1 widget), shrink-wrap, click-through en racing.

### Tareas

| ID | Tarea | Validación |
|----|-------|------------|
| 3.1 | Init Wails v3 en `vantare-v2/` (frontend Vite + React) | App arranca |
| 3.2 | Binding Go→JS telemetría (Events o custom) | RPM/speed sin React state 60 Hz |
| 3.3 | Ventana transparente + always-on-top + bounds shrink-wrap | Task Manager < 80 MB |
| 3.4 | Widget placeholder (delta o speed) | Visible sobre escritorio |

**Criterio de cierre:** Overlay usable en Windows con mock telemetry.

**Miniplan sugerido:** `v2-f3-wails-scaffold.md`

---

## Fase 4 — Layout + modos perfil

**Objetivo:** Perfil JSON, modos `racing` | `edit` | `streaming`, varios widgets en una ventana.

### Tareas

| ID | Tarea | Validación |
|----|-------|------------|
| 4.1 | Schema `configs/*.json` (widgets, posiciones, tema) | Ejemplo en repo |
| 4.2 | Modo edit: ventana grande, drag widgets | Posiciones guardadas |
| 4.3 | Modo racing: shrink-wrap bbox, click-through | Sin fullscreen en carrera |
| 4.4 | 3 widgets (delta, standings, relative) | Render estable |
| 4.5 | `skipWindowRefresh` / debounce resize | Sin flicker al mover |

**Miniplan sugerido:** `v2-f4-composite-layout.md`

---

## Fase 5 — Hub React

**Objetivo:** Configuración visual; el usuario no edita JSON a mano.

### Tareas

| ID | Tarea | Validación |
|----|-------|------------|
| 5.1 | Hub window Wails (ventana normal) | Navegación básica |
| 5.2 | shadcn/ui + Tailwind v4 tokens | UI coherente |
| 5.3 | CRUD perfiles + selector sim | Persistencia disco |
| 5.4 | Preview overlay desde hub | Abre/cierra overlay |

**Miniplan sugerido:** `v2-f5-hub-dashboard.md`

---

## Fase 6 — OBS / SSE

**Objetivo:** Modo `streaming` — telemetría por HTTP+SSE, sin ventana overlay desktop.

### Tareas

| ID | Tarea | Validación |
|----|-------|------------|
| 6.1 | Servidor `localhost` embebido en Go | `/health` |
| 6.2 | SSE `/telemetry` con diff payload | OBS Browser Source |
| 6.3 | Página overlay estática servida por Go | Mismo layout JSON |
| 6.4 | Toggle perfil `streaming` vs `racing` | Sin WebView overlay en streaming |

**Miniplan sugerido:** `v2-f6-obs-sse.md`

---

## Fase 7 — Optimización UI

**Objetivo:** FPS por widget, hot path DOM, canvas donde aplique.

### Tareas

| ID | Tarea | Validación |
|----|-------|------------|
| 7.1 | Registry widget + `targetFps` | Standings @ 15 Hz |
| 7.2 | Direct DOM para RPM/speed/delta | Profiler React quieto |
| 7.3 | Canvas track map / inputs (si aplica) | Sin re-render full tree |

**Miniplan sugerido:** `v2-f7-widget-fps.md`

---

## Fase 8 — Temas

**Objetivo:** Personalización visual sin penalizar perf.

### Tareas

| ID | Tarea | Validación |
|----|-------|------------|
| 8.1 | Tokens CSS variables (`themes/*.json`) | Swap en runtime |
| 8.2 | Lite mode (menos blur/sombras) | Toggle en hub |
| 8.3 | Portar estética F1 desde v1 (opcional) | Preview en hub |

**Miniplan sugerido:** `v2-f8-themes.md`

---

## Fase 9 — Ops + multi-sim

**Objetivo:** Observabilidad propia y segundo sim.

### Tareas

| ID | Tarea | Validación |
|----|-------|------------|
| 9.1 | Widget System Performance (CPU/RAM app) | Visible en hub/overlay |
| 9.2 | Settings GPU compat (desactivar efectos) | Checkbox funcional |
| 9.3 | Adapter iRacing o AC (spike → implementación) | Mismo pipeline normalizer |

**Miniplan sugerido:** `v2-f9-multisim.md`

---

## Plantilla de miniplan

Guardar en `.omo/plans/v2-f{FASE}-{slug}.md`:

```markdown
# v2-f{FASE}-{slug}

**Fase padre:** {N} — {nombre}  
**Estado:** borrador | en curso | hecho  
**Fecha:** YYYY-MM-DD

## Objetivo (1 frase)


## Alcance

- [ ] In scope: …
- [ ] Out of scope: …

## Archivos tocados (estimado)

- `vantare-v2/...`

## Pasos

1. …
2. …
3. …

## Criterios de aceptación

- [ ] …
- [ ] Tests: `go test ./...` / `pnpm test` / manual: …

## Riesgos

| Riesgo | Mitigación |
|--------|------------|

## Evidencia al cerrar

- Comando / screenshot / benchmark: …
```

---

## Convenciones de repo v2 (objetivo)

```
vantare-v2/
├── cmd/
│   ├── lmu-debug/          # CLI debug (Fase 1)
│   └── vantare/            # App Wails principal (Fase 3+)
├── internal/
│   ├── core/               # deadband, util
│   ├── telemetry/          # lmu, normalizer, service
│   └── window/             # shrink-wrap, modos (Fase 3+)
├── pkg/models/
├── frontend/               # React hub + overlay (Fase 3+)
├── configs/
├── tools/                  # generate-lmu-offsets
└── docs/                   # miniplanes opcionales locales
```

---

## Orden recomendado de miniplanes (backlog)

1. `v2-f1-offsets-codegen.md` — generador Go desde Python
2. `v2-f1-parser-fixtures.md` — tests con datos v1
3. `v2-f1-live-validation.md` — checklist LMU en pista
4. `v2-f2-telemetry-pipeline.md` — normalizer + deadband + 30 Hz
5. `v2-f3-wails-scaffold.md` — primera ventana
6. … (uno por fila de tareas arriba)

---

## Changelog

| Fecha | Cambio |
|-------|--------|
| 2026-06-11 | Plan maestro creado; Fase 0 ✅; Fase 1 🟡 |
