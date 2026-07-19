# TC-09 — Retirada, hardening y gate final

**Objetivo:** eliminar deuda temporal, demostrar consumidores cero y entregar una única arquitectura observable y segura.

## ISA-113 / TC-09A — Auditoría final de consumidores

- `rg`, `go list`, imports TS, handlers Wails, rutas SSE, tests, scripts y docs.
- Matriz KEEP/MOVE/DELETE con evidencia por símbolo/paquete.
- Detectar modelos, services, normalizers, fusion, adapters, mocks y fixtures legacy.
- No borrar en esta issue.

## ISA-114 / TC-09B — Retirar backend duplicado

- Eliminar solo paquetes/símbolos con consumidores cero demostrados.
- Retirar fallback mock productivo, manager anterior y reader/poller duplicados.
- Mover fixtures útiles al nivel de replay correcto.
- No dejar shims de compatibilidad sin fecha/consumer.

## ISA-115 / TC-09C — Retirar frontend/transporte legacy

- Eliminar decoder/store/events/rutas duplicadas y selector shadow.
- Un único contrato por proyección y transporte.
- Actualizar docs y búsquedas negativas.
- No cambiar UI/estilos.

## ISA-116 / TC-09D — Seguridad, rendimiento y observabilidad

- Fuzz/validation en buffers, REST, recordings y envelopes.
- Redacción de logs y límites de recursos.
- Benchmarks contra baseline: parse, fusion, reducer, derivations, projection, transport y recording.
- Soak con 5+ widgets, parrilla grande, Engineer y recorder simultáneos.
- Métricas/status sin payload personal.

## ISA-87 / TC-09E — Wails, lifecycle y teardown

- Capturar payload Wails real y correlacionarlo con SSE/proyección.
- Demostrar cierre de readers, HTTP polling, queues, recorder, hotkeys, Wails y Engineer.
- Detectar goroutines/handles/puertos residuales con harness no productivo.
- No considerar `process exited` como prueba suficiente de teardown interno.

## ISA-117 / TC-09F — Gate final y handoff

- Go global, race, frontend, build, lint focal/global documentado, Playwright, visual, benchmarks, soak y replay.
- LMU apagado/menú/garaje/pista/pits/reconnect/cambio sesión.
- Overlay + Engineer + recording simultáneos.
- Matriz de deuda residual explícita; cero P0/P1/P2.
- PR draft/final sin merge y checklist manual completo para Isaac.

## Criterio final

- un driver activo y una adquisición LMU;
- un core, una identidad/tiempo/calidad y una proyección por producto;
- no mock/simulator productivo;
- no código legacy con consumidores cero abandonado;
- grabación/replay honestos;
- documentación y Linear coinciden;
- nada se integra en `develop` hasta aprobación explícita.

## Stop conditions

- borrar sin consumidores cero demostrados;
- ocultar baseline o deuda;
- merge automático;
- datos reales no disponibles para un gate declarado obligatorio;
- degradación de rendimiento no entendida;
- teardown no demostrable.
