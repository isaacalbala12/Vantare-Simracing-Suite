# TC-02 — Fundamentos y contratos

**Objetivo:** fijar un lenguaje canónico modular antes de conectar ninguna fuente o consumidor. Esta fase no cambia el runtime productivo.

**Base:** cada issue parte de la base registrada en Linear. Para ISA-26 la base aprobada es `vantareapp/isa-100-tc-00b-separar-y-reconciliar-la-planificacion-de-telemetry@724158a262eaa5dbcc8ab89c98aa74847ffed06b`, no `develop`.

**Estado operativo 2026-07-19:** ISA-26 está `Done` tras validación manual de Isaac. ISA-27 está preparada para `In Review` sobre `9bd922fe245b27440d239c3578f1a4aaf6ea2817`; ISA-28 no está iniciada. Las líneas de cierre de cada issue inferiores describen sus gates históricos.

## ISA-26 / TC-02A — Cerrar arquitectura e inventario de dominios

### Alcance

- Inventariar campos realmente consumidos por Overlay, Engineer, Launcher y futuros Strategy/Analysis.
- Clasificar cada dato como identidad, atributo, señal continua, hecho o derivación.
- Registrar unidad, rango, frecuencia útil, fuente actual y consumidor.
- Fijar el grafo de imports del ADR 0004 mediante un test arquitectónico inicial.
- Documentar nombres de paquetes y ownership; no implementar datos runtime.

### Archivos esperados

- `docs/telemetry-core/domain-inventory.md`
- `docs/telemetry-core/dependency-rules.md`
- `internal/telemetry/architecture_test.go`
- actualizaciones estrictamente documentales del plan/Linear

### Tests y cierre

- El inventario cubre el modelo Overlay actual y los 30 directorios Engineer auditados.
- Cada campo tiene owner y ningún campo ambiguo se marca como obligatorio.
- El test falla si `core` importa productos, LMU concreto, Wails/SSE o almacenamiento.
- `go test ./internal/telemetry/... -count=1` y `go test ./... -count=1` PASS.
- ISA-26 queda `In Review`; ISA-27 no está iniciado y permanece bloqueado hasta la review/validación humana de Isaac.

## ISA-27 / TC-02B — Schema tipado, catálogo y unidades

### Alcance

- Crear dominios Go pequeños: identity, session, vehicle, controls, wheels, energy, pit, standings, weather y spatial.
- Definir IDs estables y unidades canónicas SI o documentadas.
- Mantener runtime tipado; el catálogo no usa `map[string]any` en producción.
- Crear generador/validador con standard library si hace falta. No añadir dependencia.
- No migrar `pkg/models.Telemetry` todavía.

### Archivos esperados

- `internal/telemetry/schema/**`
- `internal/telemetry/catalog/**`
- `docs/telemetry-core/signal-catalog.md` o artefacto generado equivalente

### Tests y cierre

- table tests de IDs, unidades, duplicados y rangos;
- golden del catálogo determinista;
- IDs retirados no pueden reutilizarse;
- benchmark confirma que leer structs no depende de reflection;
- `go test ./internal/telemetry/schema/... ./internal/telemetry/catalog/... -count=1` PASS.

## ISA-28 / TC-02C — Presencia, calidad, tiempo e identidad

### Alcance

- Modelar presencia separada del valor; cero/false/vacío siguen siendo valores válidos.
- Modelar procedencia `observed/derived/estimated` y estado `fresh/stale/missing/invalid`.
- Definir source time, received UTC, session time, epoch y sequence.
- Crear IDs separados para evento, sesión, vehículo, equipo y piloto.
- Definir envelopes de observaciones, snapshots y hechos sin implementar el loop productivo.
- Diseñar ownership inmutable sin exponer slices/maps mutables.

### Tests y cierre

- casos de cero válido, dato ausente, stale, wrap/reset de reloj y desconexión breve;
- tests de copia/mutación que demuestran aislamiento;
- cambio de participante o fuente no cambia identidad de sesión;
- cambio real de evento/coche sí puede cambiarla;
- serialización no expone tiempo monotónico interno.

## ISA-29 / TC-02D — Puertos mínimos y guardarraíles

### Alcance

- Definir puertos de driver, observation sink, snapshot reader, fact subscriber, projector y recording sink.
- Las interfaces viven en el consumidor y contienen solo lifecycle/datos necesarios.
- Fijar estados del driver: stopped, detecting, connecting, live, degraded, stale, error y stopping.
- Definir contratos de resync, backpressure y cierre.
- Añadir tests de imports y compile-time con fakes contractuales solo de test.

### No incluye

- LMU concreto;
- DuckDB;
- Wails/SSE;
- lógica Overlay/Engineer;
- un framework de plugins o registry dinámico.

### Gate TC-02

- ADR, inventario, schema, tiempo/calidad/identidad y puertos coherentes.
- Cero cambios de comportamiento productivo.
- Review adversarial sin P0/P1/P2.
- Isaac acepta los contratos antes de TC-03.

## Stop conditions

- dos fuentes de verdad para schema/catálogo;
- interfaces con métodos especulativos sin consumidor;
- tipos LMU en schema canónico;
- snapshot universal serializado directamente;
- presencia inferida a partir de cero;
- dependencia nueva.
