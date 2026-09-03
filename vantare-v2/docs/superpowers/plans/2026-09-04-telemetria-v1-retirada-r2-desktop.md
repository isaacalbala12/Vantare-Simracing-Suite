# Retirada V1 — R2 Desktop exclusivamente V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use subagent-driven-development and test-driven-development. One writer only; independent spec and quality reviewers.

**Goal:** retirar de `CompositeApp` la suscripcion y adaptacion V1 que R1 dejo sin eventos, manteniendo Desktop alimentado exclusivamente por `OverlayFrameV2` y las fuentes auxiliares aprobadas.

**Architecture:** Desktop conserva un unico pull Wails, el store V2 y `bindOverlayV2Coordinator`. Ya no crea `createWailsProjectionTelemetryAdapter`, no publica `TelemetrySnapshot` legacy y no activa shadow al recibir V1. OBS, Studio, productor Go, SSE, flags, builders y contratos V1 permanecen fuera de este corte.

**Base:** issue ISA-894, rama `vantareapp/isa-894-retirada-v1-r2`, worktree `C:\tmp\vantare-v1-retirada-r2`, base exacta R1 `c3cb104aeba78bb5f962165283a49eb42e47798d`. Sin apps/LMU, dependencias nuevas, merge, promocion o release.

## Conjunto cerrado

| Archivo | Cambio permitido |
| --- | --- |
| `frontend/src/overlay/CompositeApp.tsx` | Quitar adapter V1, shadow legacy y su lifecycle/diagnostico; conservar V2, Engineer, Calendar y cleanup |
| `frontend/src/overlay/CompositeApp.test.tsx` | RED/GREEN de ausencia V1 y regresion V2/lifecycle |

Documentacion de cierre: este microplan, evidencia R2, handoff vivo, `docs/roadmap/plan.md` y digest generado. Si hace falta otro archivo productivo, parar y revisar el alcance.

## Tarea 1 — RED conductual

- [x] Anadir una prueba que monte Desktop con el pull controlado y despache solo `telemetry:overlay:projection`.
- [x] Exigir que no se publique snapshot al coordinator, no se cree/alimente shadow y no aparezca un widget con datos V1.
- [x] Ejecutar el focal antes de tocar produccion. Debe fallar por comportamiento actual, no por imports o mocks rotos, y registrar la salida.

## Tarea 2 — GREEN minimo

- [x] Eliminar de `CompositeApp.tsx` el import/instancia/start/stop de `createWailsProjectionTelemetryAdapter`.
- [x] Eliminar la activacion shadow legacy y el campo `shadow` de los diagnosticos Desktop; conservar diagnosticos V2 y pull.
- [x] Mantener sin cambios el orden seguro: reset store, binding V2, attach V2, start Engineer/RaceSchedule/pull, y teardown inverso completo.
- [x] Confirmar que un snapshot V2 sigue llegando al coordinator/runtime y que mount/unmount no deja listeners o pulls vivos.

## Tarea 3 — gates y cierre aislado

- [x] Focales: `CompositeApp.test.tsx`, `overlay-wails-pull.test.ts`, `overlay-frame-v2-store.test.ts`, `legacy-retirement.test.ts` y `v1-authority-guard.test.ts`.
- [x] `pnpm --dir frontend typecheck`, `pnpm --dir frontend build` y lint aplicable; Go focal R1 como testigo de frontera, aunque Go no cambie.
- [x] `rg` confirma que `CompositeApp.tsx` no contiene adapter/snapshot/shadow V1 y que OBS/Studio siguen intactos. `git diff --check` y diff completo.
- [ ] Actualizar evidencia, handoff, roadmap/digest e issue con afirmaciones exactas. Dos Muse xhigh independientes revisan primero especificacion y despues calidad sobre SHA exacto.
- [ ] Push y PR draft apilado sobre R1 solo tras gates/reviews; ningun merge/promocion sin autorizacion expresa de Isaac.

**Done R2:** Desktop productivo ya no construye ni consume V1 y V2 conserva su lifecycle. **No significa:** OBS/Studio/productor/SSE/builders/flags retirados, V1 ausente del binario, auditoria V2 ejecutada o rendimiento optimo certificado.
