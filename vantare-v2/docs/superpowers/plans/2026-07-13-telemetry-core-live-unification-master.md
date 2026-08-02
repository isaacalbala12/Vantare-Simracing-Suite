# Telemetry Core Live Unification Implementation Plan — SUPERSEDED

> **Sustituido el 2026-07-19** por `2026-07-19-telemetry-core-final-architecture-master.md` y ADR 0004. Se conserva únicamente como historia de la planificación previa. No ejecutar TC-02–TC-05 desde este documento.

> **Estado reconciliado (ISA-100, 2026-07-19):** TC-01 está completado e integrado en `develop@f492007`. TC-02–TC-05 siguen sin iniciar. Este documento gobierna objetivo, fronteras y secuencia; no autoriza iniciar ISA-26. Antes de TC-02A debe realizarse una revisión conjunta con Isaac. Consulta `docs/telemetry-core/README.md`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unificar LMU shared memory y LMU REST local en un único Telemetry Core, mantener Overlay sin regresiones y llevar toda la funcionalidad real de Engineer Release a producción sin pipelines duplicados.

**Architecture:** TC-01 ya reconcilió `refactor` y `codex/engineer-release` en `develop`. Telemetry Core posee identidad, tiempo, secuencia, calidad, capabilities, fusión y fan-out; Overlay y Engineer reciben proyecciones puras. Los sistemas legacy solo se eliminan después de shadow parity, replay parity y aprobación manual.

**Tech Stack:** Go 1.25, Wails v3, React 19, TypeScript estricto, SSE, Vitest, Playwright, LMU shared memory, LMU REST local.

---

## 1. Autoridad y dependencias

- Autoridad operativa: `docs/telemetry-core/README.md` y la evidencia de `docs/telemetry-core/`.
- Base actual reconciliada: `develop@f492007`.
- `refactor` y `codex/engineer-release` son antecedentes históricos ya integrados por TC-01; no son bases para nuevos cortes.
- Destino final de PR: `develop`, únicamente después de validación manual completa de Isaac.
- Strategy Product B queda fuera de este paquete. Su integración futura consumirá contratos públicos estables sin poseer el runtime live.
- `vantare-core` está desactualizada y no se usa.

## 2. Regla de preservación

La integración crea `docs/telemetry-core/engineer-rescue-matrix.md` y clasifica cada módulo `KEEP`, `ADAPT`, `HARDEN`, `DISABLE`, `REPLACE` o `DELETE`.

- `KEEP/ADAPT/HARDEN` no requieren nueva decisión de producto.
- `DISABLE` exige motivo de capability/dato y experiencia honesta en UI.
- `REPLACE` o eliminar lógica funcional exige revisión previa de Isaac.
- `DELETE` sin consulta solo se permite para infraestructura duplicada con consumidores cero.

Se preservan por defecto Spotter, monitores, notificaciones, audio/TTS, comandos, Pit Manager, replay y tests útiles de `codex/engineer-release`.

## 3. Estructura objetivo

```text
internal/telemetry/
  model/                 identidades, tiempos, calidad, capabilities y Observation
  live/                  servicio único, fan-out, orden, stale y lifecycle
  lmu/                   readers/adapters raw de shared memory
  lmuapi/                cliente REST local
  fusion/                reglas por campo shared memory + REST
  projection/            OverlayWire y futuras proyecciones

internal/engineer/
  projection/            model.Observation -> EngineerObservation
  service/               orquestación, notificaciones y audio; no abre LMU
  spotter/, fuel/, ...   lógica preservada
  replay/                adapter determinista para tests/harness

frontend/src/overlay/
  core/telemetry-wire.ts contrato versionado de transporte
  core/telemetry-snapshot.ts ViewModel visual legítimo
  transports/            Wails/SSE sin semántica de dominio duplicada
```

Dirección obligatoria:

```text
LMU adapters -> Telemetry Core -> projections -> transports/apps -> UI/renderers
```

## 4. Paquete de microplanes

| Orden | Documento | Resultado verificable |
|---|---|---|
| TC-01 | `2026-07-13-telemetry-core-microplan-01-baseline-integration.md` | **COMPLETADO** — merge controlado, baseline dinámico y matriz de rescate |
| TC-02 | `2026-07-13-telemetry-core-microplan-02-canonical-live-core.md` | Contratos, fusión y servicio canónico sin cutover |
| TC-03 | `2026-07-13-telemetry-core-microplan-03-overlay-shadow-cutover.md` | Desktop/OBS/Studio sobre el core con paridad |
| TC-04 | `2026-07-13-telemetry-core-microplan-04-engineer-preservation-cutover.md` | Engineer completo sobre proyección real LMU |
| TC-05 | `2026-07-13-telemetry-core-microplan-05-retirement-hardening.md` | Duplicación retirada, código muerto cero y gates finales |

Cada microplan se divide en issues ejecutables. Una issue = una rama Linear = un worktree = un chat Sol medium.

## 5. Gates globales

Todos los cortes requieren:

```powershell
git diff --check
go test ./internal/telemetry/... ./internal/engineer/... ./internal/app/... ./internal/server/... -count=1
pnpm --dir frontend test
pnpm --dir frontend build
```

Cuando aplique Overlay:

```powershell
pnpm --dir frontend visual:overlay-studio
pnpm --dir frontend bench:overlay-studio-drag
```

El worker registra comandos exactos y resultados. Fallos globales preexistentes se reproducen en el SHA base y se documentan; nunca se ocultan ni se “arreglan” debilitando tests.

## 6. Stop conditions globales

Parar y actualizar Linear si:

- la simulación de merge pierde funcionalidad o tiene conflictos no clasificables;
- un campo Engineer carece de fuente real LMU y el monitor lo presenta como observado;
- se requiere dependencia nueva;
- cambia el JSON público de Overlay fuera del contrato aprobado;
- aparece un segundo owner de shared memory o REST polling;
- se propone eliminar lógica funcional del Engineer;
- Playwright/visual detecta regresión no entendida;
- no existe rollback seguro del cutover.

## 7. Criterio de cierre

- Una apertura shared memory y un subsistema REST local, ambos fuentes principales del mismo core.
- Identidad, epoch, secuencia, capturedAt, unidades, calidad y capabilities canónicos.
- Desktop, OBS y Studio conservan comportamiento/visual y usan una proyección.
- Engineer/Spotter usa telemetría LMU real y conserva funcionalidad validada.
- Replay/mock/simulator solo existen en tests/harness explícitos.
- Los modelos/servicios/adapters reemplazados tienen consumidores cero y se eliminan.
- No hay fallback a datos ficticios en producción.
- Auditoría de seguridad, rendimiento, goroutines y handles cerrada.
- Isaac valida manualmente todo antes de cualquier merge a `develop`.

## 8. Rollback

Cada cutover mantiene durante un único microcorte un selector interno old/new. Tras validación se elimina en el siguiente corte. El rollback consiste en revertir el commit de cutover, no mantener dos pipelines permanentes.

## 9. Matriz de cobertura revisada

| Riesgo/resultado | Corte |
|---|---|
| Divergencia `refactor` / Engineer Release | TC-01A–C |
| Una identidad/tiempo/secuencia/calidad/capabilities | TC-02A |
| Shared memory + REST como fuentes principales | TC-02B |
| Un servicio live y fan-out acotado | TC-02C |
| Paridad Studio/Desktop/OBS | TC-03A–C |
| Preservación completa Engineer/Spotter | TC-04A–E |
| Replay parity y heurísticas honestas | TC-04A–C |
| Retirada por consumidores cero | TC-05A–C |
| Lifecycle, backpressure, seguridad y rendimiento | TC-05D |
| Observabilidad Wails y teardown | TC-05E (ISA-87) |
| Validación simultánea y gate humano | TC-05F (ISA-41) |

Revisión 2026-07-13: el plan no autoriza eliminar funcionalidad Engineer. `REPLACE/DELETE` funcional requiere decisión de Isaac; la retirada automática se limita a infraestructura duplicada demostrada sin consumidores.

Reconciliación 2026-07-19: ISA-23/24/25/96/97 cierran TC-01. ISA-26 permanece en Backlog y su contenido heredado se considera borrador hasta la sesión conjunta de planificación.
