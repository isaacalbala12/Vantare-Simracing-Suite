# ISA-1079 — revisión durable y cliente

Base 4452fe4b; rama vantareapp/isa-1079-revision-binding;
worktree C:/tmp/vantare-isa1079. Cuatro archivos de lógica/tests: nuevos
corrections_projection.go y test, cliente Strategy TS y su test.

La custodia carga el ID exacto solicitado y recalcula su snapshot. Devuelve
familias y referencia juntas. No usa head como sustituto si falta el ID.
Fixture registrada sanitizada con corrección controlada de tiempos demuestra
que una revisión anterior se reproduce después de restaurar la base. Los
metadatos/unidad omitidos en la fixture se declaran para el test; no son prueba
de precisión física. Incluye revisión base explícita, ID ausente y cancelación.

Cliente TS añade tipo/validación de sourceRevisions. Test usa la fixture JSON
de contrato Go: legado y referencias completas pasan; parcial, duplicado,
fuente ajena, digest inválido, vacío y null se rechazan.
RED observado antes de API/validación; GREEN posterior.

## Checks

- Go completo y vet Analysis: pasan; log C:/tmp/isa1079-go-test.log.
- Cliente focal: 27 tests pasan.
- Frontend build, typecheck real y lint: pasan. Aviso heredado de chunks >500 kB.
- Frontend inicial concurrente con Go/build: 3261 pasan, 3 fallan. Dos timeouts
  Pedals y presupuesto OverlayFrame 1,562 ms frente a 1,5 ms.
- Los dos archivos afectados pasan aislados: 6 tests, sin editar umbrales.
- Frontend completo con dos workers y sin Go concurrente: 416 archivos,
  3264 tests pasan, código 0. Log C:/tmp/isa1079-frontend-bounded.log.
  AbortError de happy-dom en teardown no cambia ese resultado.

Revisión personal completa del diff, referencias, error paths y autorización.
Docs: contrato, handoffs Strategy/Analysis, roadmap manual/generado y evidencia.
Pendientes autorización de servicio, selección de revisión en planes, operaciones
restantes, UI productiva, calibración y Wails. No se declara editor terminado.
Sin dependencias nuevas, fuentes reales leídas, LMU, push/PR/CI remota,
merge, promoción o release.
