# TC-03 — Driver Platform y LMU

**Objetivo:** adquirir LMU mediante un único driver que encapsule Shared Memory y REST local y emita observaciones canónicas verificables.

## ISA-30 / TC-03A — Inventario raw, fixtures y compatibilidad LMU

- Auditar offsets, structs, endpoints REST, frecuencia, ownership y campos duplicados.
- Comparar parsers de `internal/telemetry/lmu` e `internal/engineer/lmu` sin borrar ninguno.
- Capturar fixtures sanitizados para menú, garaje, pista y boxes; si un estado real no está disponible, marcar fixture pendiente sin inventarlo.
- Registrar versión/build LMU y fingerprint del formato.
- Definir comportamiento ante buffer corto, offsets incompatibles, NaN/Inf, REST parcial y game update.

**Gate:** fuzz/parser tests no hacen panic; fixtures tienen procedencia y privacidad; no cambia producción.

## ISA-31 / TC-03B — Lifecycle, catálogo de drivers y selección

- Implementar `DriverManager` cancelable con exactamente un driver activo.
- Drivers compilados internamente; sin DLL/plugins dinámicos.
- Política determinista si existen varios simuladores: configuración del usuario y prioridad declarada.
- No conectado significa disconnected, nunca mock.
- Reconnect con backoff/jitter acotado y sin log spam.
- Estado/capabilities actuales separados del soporte estático.

**Tests:** state machine, cancelación, doble start, fallo de constructor, reconnect, cambio de driver y teardown.

## ISA-32 / TC-03C — Adquisición Shared Memory LMU

- Mover/adaptar el reader canónico a `internal/telemetry/drivers/lmu`.
- El reader produce observaciones LMU validadas; no calcula delta, gaps o avisos.
- Una única apertura de `LMU_Data` y ownership de handles claro.
- Detectar freshness, reset/wrap de clocks y versión incompatible.
- Mantener raw privado salvo hook diagnóstico explícito de test.

**Tests:** fixtures, malformed buffers, reconnect, handle close, race y benchmark a frecuencia objetivo.

## ISA-33 / TC-03D — Adquisición REST local LMU

- Adaptar el cliente REST al driver LMU.
- Polling cancelable, deadlines, backoff y cache con timestamps por respuesta/campo.
- Diferenciar endpoint no soportado, LMU apagado, timeout, dato vacío y dato stale.
- No reemplazar listas o sesiones dentro del cliente; solo emitir observaciones.

**Tests:** servidor HTTP local determinista, respuestas parciales/antiguas/malformadas, cancelación y cero goroutines tras cierre.

## ISA-34 / TC-03E — Matriz de autoridad y fusión LMU

- Crear matriz versionada por campo: fuente preferida, alternativa semánticamente equivalente, validez y TTL.
- Shared Memory gana para señales rápidas válidas; REST gana donde sea fuente real o única.
- Nunca promediar conflictos.
- Emitir diagnóstico acotado de conflicto y freshness, sin payload raw.
- Exponer lotes de observaciones canónicas; no construir todavía proyecciones de producto.

**Tests:** tabla completa de campos solapados, stale preferred source, REST parcial, source recovery, cero válido y conflictos.

## Gate TC-03

- LMU Driver es el único owner nuevo de ambas fuentes.
- Harness puede mostrar estados y observaciones sin activar producción.
- No quedan cálculos de producto dentro del driver nuevo.
- `go test -race` se ejecuta donde haya toolchain compatible; si no, se documenta el gate pendiente.
- Prueba manual LMU de conexión/desconexión antes de TC-04.

## Stop conditions

- hace falta publicar structs raw fuera del driver;
- una discrepancia no tiene semántica demostrable;
- dos readers/pollers nuevos quedan activos;
- un error abre mock/simulator;
- una goroutine no tiene cancelación/cierre;
- se modifica Engineer u Overlay.
