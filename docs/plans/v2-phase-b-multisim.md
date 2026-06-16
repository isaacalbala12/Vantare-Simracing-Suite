# Fase B — Multisimulador

> Objetivo: soportar Assetto Corsa, refactorizar LMU al nuevo adapter, y añadir iRacing.
> Entregable: `v0.3.0-alpha.1`
> Orden de simuladores: AC primero, LMU refactor, iRacing.
> Estado: planificado a alto nivel; detalles se completarán al cerrar Fase A.

## Implementaciones

| # | Implementación | Estado |
|---|---|---|
| 1 | Interfaz `SimAdapter` en Go | `pending` |
| 2 | Refactor LMU a `SimAdapter` | `pending` |
| 3 | Detección automática de simulador activo | `pending` |
| 4 | Assetto Corsa adapter (shared memory) | `pending` |
| 5 | Assetto Corsa normalizer a `TelemetryData` | `pending` |
| 6 | Assetto Corsa integración en pipeline | `pending` |
| 7 | iRacing adapter (iRSDK) | `pending` |
| 8 | iRacing normalizer a `TelemetryData` | `pending` |
| 9 | iRacing integración en pipeline | `pending` |
| 10 | Widget Track Map — backend | `pending` |
| 11 | Widget Track Map — frontend Canvas | `pending` |
| 12 | Widget Input Trace — backend | `pending` |
| 13 | Widget Input Trace — frontend Canvas | `pending` |
| 14 | Widget Fuel | `pending` |
| 15 | Widget Tire Wear | `pending` |
| 16 | Widget Stint Timer | `pending` |
| 17 | Tests multisimulador | `pending` |
| 18 | Documentación y release v0.3.0-alpha.1 | `pending` |

## Notas

- Todos los sims deben mapear a `TelemetryData` unificado.
- El frontend no debe saber qué sim está corriendo; recibe datos normalizados.
- iRacing requiere suscripción/licencia para testear realmente. Si no está disponible, se desarrolla con mocks/replay.
- AC tiene prioridad porque es el sim base para la Fase C (app nativa).

## Criterios de cierre

- [ ] LMU, AC e iRacing producen datos normalizados.
- [ ] Detección automática funciona.
- [ ] Tests Go pasan.
- [ ] Tests frontend pasan.
- [ ] Build de producción ok.
- [ ] CHANGELOG actualizado.
- [ ] Tag `v0.3.0-alpha.1` y release.
