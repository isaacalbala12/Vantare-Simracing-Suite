# ISA-1403 — Sustitución completa del camino live Go por Rust

Fecha: 2026-09-29. Autoridad: decisión de Isaac de portar también la entrega
de telemetría y optimizar por rondas medidas. Rama
`vantareapp/isa-1403-rust-telemetry`; PR draft #1415 a `nightly`.
[ADR 0098](../../adr/0098-rust-end-to-end-live-telemetry.md) fija la nueva
frontera. El plan R01–R28 del 2026-09-27 conserva la historia, contratos y
evidencia de lo construido; sus pasos de entrega Go y su gate CPU `<= 0,50`
quedan sustituidos por este plan. No se reetiquetan sus pruebas parciales como
prueba de la arquitectura final.

## Resultado y exclusiones

El helper Rust es el único dueño productivo de la ruta live LMU, Core,
derivaciones, proyecciones y distribución a Overlay, Engineer y Strategy.
Eliminar los cálculos, colas, cursores, cadencias, frescura y selección de
destinatarios live de Go cuando tengan consumidores cero. Wails, Engineer como
servicio de producto, Strategy histórico, Analysis, recording SQLite, cuenta,
licencias y demás servicios Go siguen. El código Go de frontera que quede
solo puede transportar bytes decididos por Rust o invocar al consumidor de
producto; se enumera y se somete a prueba de arquitectura.

## Antes de retirar Go

1. **E0 — Congelar referencia.** Fijar SHA Go de comparación, configuración,
   corpus real LMU47 de 3839 eventos/60 s y hashes. Repetir el oráculo completo
   Overlay/Engineer/Strategy/facts y añadir estados no cubiertos con capturas
   reales; el corpus de pista estable no prueba menú, boxes ni crash. Registrar
   qué paquetes Go históricos comparten tipos para no borrarlos.
2. **E1 — Frontera de entrega.** Inventariar cada receptor y salida real de
   `telemetryprocess`, `telemetrytransport`, Wails/SSE, Engineer y Strategy.
   Congelar los contratos de status, snapshot, facts, revisión, ACK, late join,
   secciones, límites y backpressure. Diseñar y probar el transporte Rust por
   destino antes de activarlo. El host Go solo conserva adaptadores opacos
   imprescindibles; no decide orden ni frecuencia.
3. **E2 — Rust distribuye.** Mover en cortes pequeños la demanda efectiva,
   últimas versiones, colas por producto, retransmisión de facts y resync a
   Rust. Probar primero con el corpus y consumidores aislados, luego con las
   superficies reales. No abrir otro lector LMU ni introducir fallback a Go.
4. **E3 — Integración de producto.** Conectar Studio, Desktop y OBS con el
   contrato visual existente; conectar Engineer y Strategy a las entradas de
   producto existentes. Verificar apertura tardía, cierre, cambio de política,
   reinicio, fuente stale, cola llena y destino lento. El test de aceptación
   debe fallar ante una entrega perdida o duplicada sin boundary explícito.
5. **E4 — Medición y optimización.** Medir Go actual, control equivalente y
   ruta final Rust con el mismo trabajo, configuración y destino. Primero A/A;
   después al menos cinco bloques intercalados. CPU incluye todos los procesos
   que trabajan para cada brazo; p99 mide disponibilidad de la muestra hasta
   aceptación por el destino; RSS suma procesos simultáneos. Conservar crudos,
   hashes, contadores de entradas/salidas, drops y versiones. Cada ronda cambia
   una causa perfilada, tiene test de paridad y repite el banco; conservar
   también resultados que empeoran. Cinco rondas sin mejora reproducible u
   ocho horas de bucle experimental activan revisión, según la política de
   Telemetría V2; no autorizan a rebajar trabajo o calidad.
6. **E5 — Retirada.** Inventariar importadores y callers de las rutas live Go.
   Retirar por familias con consumidor cero, conservar DTO y paquetes
   históricos necesarios, y quitar el selector `go|rust` del producto. Un test
   de arquitectura protege la ausencia de motor, proyecciones y publisher Go
   live. No borrar un directorio entero por contener la palabra telemetry.
7. **E6 — Binario final.** Ejecutar suites Go/Rust/frontend afectadas, contrato,
   CI Windows, packaging/portable/updater/rollback, soak y sesión física
   LMU/Wails/OBS sobre el SHA final. Repetir paridad y banco de rendimiento
   después de la retirada. La PR permanece draft y no se promociona por
   completar pruebas locales.

## Puertas de resultado

- Paridad estructural, orden, calidad, tiempos, identidad, facts y contratos
  externos: cero diferencias no explicadas sobre corpus real y escenarios de
  recuperación. Capacidad de parser/transporte de 104 coches probada sin
  inventar un segundo corpus físico.
- Un solo reader LMU, cierre y recuperación acotados, sin estado fresh
  congelado ni pérdida silenciosa de facts. Overlay, Engineer y Strategy
  reciben solo lo que su demanda autoriza.
- Rendimiento: publicar CPU, p99 y RSS de cada brazo y los ratios pareados.
  El antiguo `<= 0,50` no es puerta de aceptación de la nueva arquitectura.
  La ganancia solo se declara si el banco completo la mide; una regresión
  abre otra ronda perfilada o una decisión explícita de producto.
- Archivo `docs/roadmap/plan.md` restaurado por instrucción de Isaac en esta
  PR para reflejar la nueva dirección. La app actual consume la publicación
  Supabase de #1380; restaurar el archivo no publica por sí solo un hito ni
  regenera `roadmap.json`, pues `.github/scripts/roadmap_digest.py` ya no
  existe en esta base. No afirmar visibilidad pública sin verificarla.

## Estado inicial comprobado en este corte

El candidato del HEAD `fce96fc0` y la prueba de fuente aislada posterior
`4a2120f1` mantienen Go como ruta normal. La prueba Go aislada recorrió 3902
productos/consumidor y 7,15625 s CPU en ~61 s; el candidato Rust+Go recorrió
3872 productos/consumidor y 16,34375 s CPU agregada. Las fronteras y cuentas
son distintas, así que esas cifras no prueban una ganancia ni la descartan para
la ruta final. `go test ./...` pasó tras el corte de la fuente aislada.
E1 tiene un inventario inicial. E2 contiene un módulo Rust aislado para pull
Overlay (sesión/ACK/replay/latest-wins/secciones) probado con golden de
1/20/44/104 coches, pero aún no conectado al helper ni a Wails. `cargo test
--release --locked`, Clippy y `go test ./...` pasaron tras ese corte. Faltan
los demás destinos, la retirada Go, el banco final, CI del nuevo SHA y la
verificación física de la arquitectura final.
