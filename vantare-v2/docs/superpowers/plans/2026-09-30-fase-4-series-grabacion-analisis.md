# Microplan — Fase 4: series, grabación y análisis (ISA-1429)

Fecha: 2026-09-30. Proyecto: arquitectura Rust nativa, ADR 0099.
Issue: [#1429](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1429).
Worker: Codex. Orquestador/revisor: Claude Opus 5.5.
Rama: `vantareapp/isa-1429-fase4-series-grabacion`.
Base entregada: `abcf10acdbb6500eabdbb88f20e6ed568bb484e4`.
Inventario: [rutas y contratos](2026-09-30-fase-4-inventario.md).

## Objetivo y fronteras

Entregar muestras del jugador en bloques durante la vuelta y al sellarla,
sin esperar a almacenamiento o análisis, y calcular exactamente lo mismo
al consumir esos bloques en directo o reproducirlos. Recording permanece
desactivado por defecto. No prometer durabilidad sin commit efectivo DuckDB.

Rutas principales: `native/runtime/src/flows/` y este expediente. Enganche mínimo:
un accessor `Core::series_mut` en `core/mod.rs` para configurar la entrega
antes de adquirir; no cambiar adquisición, modelo, derivaciones o IPC.
Almacenamiento y cálculo serán módulos propios bajo flows, sin nuevo crate:
el workspace de cuatro paquetes no necesita otra frontera de build ahora.
El orquestador es propietario del handoff vivo compartido y de la integración.
Única configuración Cargo necesaria para el codec: activar `float_roundtrip`
en serde_json existente (`native/runtime/Cargo.toml`). Sin nueva dependencia,
sin cambio de lock: el fixture real reproduce pérdida de un ULP con el parser
por defecto. Esta feature vacía de dependencias permite roundtrip exacto sin
parser propio; se justifica en el commit y requiere revisión del orquestador
al combinar manifests. No se modifica la configuración de otro crate.

No se altera la base ni se hace fetch: el encargo entrega este worktree e
impide red excepto documentación pública. `origin/nightly` local no acredita
frescura remota (referencia local f29b5fee; merge-base 5838de5a).
Notion inaccesible, excepción explícita de Isaac; seguimiento sin completar.

## Cortes verticales, en orden y con commit local por corte

1. **Inventario y microplan**, cada uno con commit `(ISA-1429)` antes de código.
   Mantener evidencia de límites y no atribuir wiring Go no demostrado.
2. **Series incrementales**: mantener LapBlock v1 y publicar chunks de máximo
   64 muestras con epoch/sesión/coche/vuelta, offset, índice creciente,
   cierre y huecos. Cola stdlib acotada, un receptor propietario, `try_send`:
   no disco, SQL, serialización ni espera al consumidor en adquisición.
   Receptor ausente/lento se refleja en estado y pérdidas; el siguiente bloque
   entregado informa pérdidas previas. Reconfigurar exige una base nueva con
   hueco; esta API inicial rechaza reconfiguración tras arrancar y exige un
   nuevo productor, cuya época/base configura el propietario. Publicación
   parcial explícita permite cadencia menor a 64 muestras.
   Tests: entrega antes del cierre, cierre sin mezclar vueltas, saturación,
   desconexión, sesión/contador y memoria acotada. Conservar goldens v1 previos.
3. **Almacenamiento DuckDB, propietario único**: BLOQUEADO desde el inventario.
   No hay bindings en Cargo.lock/caché y el encargo prohíbe descargar artefactos.
   No reemplazarlo por JSONL, SQLite, Python ni CLI embebido. El helper Go
   existente es read-only y no se modifica. Reanudar con crate/runtime fijado
   y empaquetado autorizado; worker/proceso bajo demanda, conexión única,
   transacciones por chunk y watermark confirmado, queries paginadas,
   recuperación tras cierre abrupto, error de disco visible y stop con plazo.
   El journal de fase 3 seguirá siendo responsabilidad de su worker: esta
   entrega no convierte JSONL en durabilidad DuckDB compartida.
4. **Codec y análisis puro sobre el mismo bloque** (independiente de 3):
   codec versionado y validado en frontera, límites de bytes/muestras,
   señales finitas/SI, ausencia y calidad conservadas. Analizador con una
   vuelta activa y retención acotada de resúmenes; métricas de cobertura
   observada y velocidad/pedales disponibles. No reconstruir hechos entre
   huecos ni deducir duración completa a partir de muestras parciales.
   API typed para consumo live y replay; ninguna dependencia de simulador,
   persistencia o UI. Tests golden, malformed/order/gap, calidad/zero, paridad
   live → bytes → decode → replay y fixture LMU real no vacío.
5. **Carga reproducible y entrega**: test de adquisición de muchas muestras
   mientras un consumidor no drena, progreso y tope de memoria, recuperación
   visible tras drenar y medidas de tiempo con/sin entrega. No gate de ratio
   ruidoso entre workers: el test tiene plazo externo y prueba progreso sin
   liberar al consumidor. Capturar salida, método y comandos para el revisor.
   Ratificación CPU/latencia/frame time LMU+OBS y journal+series: BLOQUEADA a
   prueba física y presupuestos acordados; no sustituirla por este test.

## Qué se porta y qué queda fuera

Se portan los principios Go de calidad/presencia, secuencia, identidad, cola
acotada, incompleto explícito y cálculo sin I/O. Reutilizar LapBlock nativo v1
es más sano que copiar channelsList LMU: este último usa nombres/unidades y
relojes específicos, carece de calidad por campo y no es el esquema canónico
neutral que exige ADR 0099. El nuevo wire incremental conserva unidades SI.

No se portan aún importación arbitraria/LMU DuckDB, staging/ACL, correcciones
versionadas, catálogo multisesión, curvas clima/consumo/degradación ni solver
Strategy: esos cálculos requieren señales/fronteras que esta serie v1 de
velocidad/pedales no contiene. No se inventan valores ni se declara paridad
total del análisis Go. Hub y visualización pertenecen a fase 5; remoto, fuera.

## Dependencias propuestas, riesgos y preguntas para desbloquear

- **Propuesta condicionada, no añadida:** crate oficial [`duckdb`](https://github.com/duckdb/duckdb-rs) (MIT) con
  versión y libduckdb fijadas, preferiblemente en proceso de almacenamiento
  separado. Necesario para conexión/transacciones/consultas sin FFI manual.
  stdlib no implementa DuckDB; Python/CLI añade runtime y viola la dirección
  Rust/ADR 0005; helper Go read-only no escribe. Bundled C++ aumenta build y
  tamaño; dynamic exige DLL validada, redistribución/notices y rollback.
  Confirmar versión/features/toolchain y disponer del artefacto offline antes
  de implementarlo; justificarlo también en el commit que lo incorpore.
  Documentación pública leída el 2026-09-30: también advierte que la opción
  sin bundled puede descargar el binario precompilado; fijar library local
  y verificar builds offline, no asumir que basta descargar solo el crate.
- ¿Puede el orquestador provisionar bindings/runtime DuckDB offline fijados
  o autorizar descarga? No se descarga ni se ejecuta backend alternativo.
- ¿Qué presupuestos absolutos/relativos ratifica Isaac con journal y series?
  Frame time, CPU total/driver/DWM, memoria privada y latencia quedan abiertos.
- El tope heredado de 18.000 muestras/vuelta sigue activo incluso con receptor
  rápido (180 s a 100 Hz, 300 s a 60 Hz). Al superarlo hay hueco hasta la vuelta
  siguiente. Revisar retención por chunks al desbloquear DuckDB: no prometer
  sesiones completas con ese techo ni esconderlo subiendo un número sin medir.
- La cola es de un consumidor: almacenar y analizar comparten propietario de
  bloques; fan-out/IPC entre procesos depende de fase 3/5 y no se improvisa.
- Solo señales actuales del jugador. Sin fuel/wetness/tyres/incident/pit en
  esta serie, consumo y clasificación completa no son demostrables.
- Los únicos fixtures con cierre son sintéticos explícitos; no acreditar
  una vuelta completa real ni rendimiento físico con ellos.
- Guías Rust adicionales nombradas en el plan no figuran instaladas en las
  rutas de skills inspeccionadas; aplicar Rust idiomático, ponytail, fmt y
  clippy estricto sin fingir lectura de una skill ausente.

## Verificación por hito

Antes de cada commit Rust, desde `native/`, secuencialmente y offline:

```powershell
cargo fmt --check
cargo clippy --offline --workspace --all-targets -j 2 -- -D warnings
cargo test --offline --workspace -j 2
```

Nunca más de dos jobs. No tocar UI, otros manifests/lock ni otros worktrees.
Revisar `git diff --check`, diff completo, rutas staged y commits con trailer
`Co-Authored-By: GPT-6.1 Sol <noreply@openai.com>`.
Registrar resultados, producción/tests añadidos y límites al finalizar.
La compilación incremental UI y campaña física corresponden al orquestador,
en serie; no producir cifras comparativas de UI mientras otros compilan.

## Avance local

- Inventario `1030c9f5`; microplan previo a implementación `bef61696`.
- Corte 2: implementado para revisión. Seis tests nuevos, 25 tests flows
  focales correctos; fmt y clippy workspace correctos. Suite workspace: 390
  tests correctos (incluye siete lifecycle sin harness), cuatro live ignorados,
  cero fallos. LapBlock v1 y sus goldens se conservan.
- Corte 3: bloqueado; no worker DuckDB ni persistencia nueva implementados.
- Corte 2 entregado en `9cd79448`, pendiente de review del orquestador.
- Corte 4: codec y cálculo implementados. Primer gate reproduce un ULP perdido
  con el fixture LMU real: `104.05534362792969 → 104.05534362792967`.
  Se activa float_roundtrip en serde_json existente, sin paquetes nuevos;
  la prueba exacta no se debilita. Tras la corrección: fmt/clippy workspace
  correctos, 399 tests workspace correctos, cuatro live ignorados, cero fallos.
- Corte 4 entregado en `5dcaedbd`, pendiente de review del orquestador.
- Corte 5: terminado localmente, pendiente de review. Carga del feed volátil,
  no benchmark de grabación DuckDB. Gates finales: fmt/clippy correctos,
  400 tests workspace correctos, cuatro live ignorados, cero fallos.

## Evidencia final del corte de carga (2026-09-30)

Prueba `flows::series_load_tests::saturated_delivery_keeps_acquisition_progress_without_the_storage_owner_draining`.
36.000 fotos sintéticas explícitas, 104 coches, 100 Hz lógicos, tres vueltas
de 120 s, reloj determinista. La entrada va por `Core::observe`; no incluye
lector SHM, REST productivo ni adquisición del simulador. El generador y Core
están incluidos en el tiempo. El consumidor permanece vivo, sin leer la cola
hasta que acaba el productor en otro hilo; timeout diagnóstico de un minuto.
No hay `sleep`. Si la entrega espera por capacidad, la prueba falla por plazo.

Entorno: Windows x64, Ryzen 7 3700X (8/16), rustc 1.95.0
`59807616e`, perfil test/debug. Otros workers compilan en paralelo. Pareja
secuencial A/B única, sin aislamiento del equipo ni control A/A: tiempos
informativos, no gate de ratio ni ratificación de presupuesto.

Salida de la ejecución focal (literal):

```text
ISA-1429 carga sintética debug: frames=36000, coches=104, hz_lógicos=100, baseline_ms=2311.315, receptor_saturado_ms=2338.503, intentos=564, entregados=2, perdidos=562, cola_muestras=128, cola_payload_bytes=11264; sin DuckDB/LMU/OBS
```

- Todas las 36.000 fotos llegan al núcleo, revisión 36.000 y 104 coches.
- Cola de dos chunks: exactamente 128 muestras y 11.264 bytes de payload
  `LapSample`; no es memoria privada del proceso ni incluye allocator/headers.
- 562 intentos perdidos de 564; la memoria no crece con la sesión ni espera a
  escritura. Al drenar, la revisión 36.001 publica seal con esos 562 perdidos.
- El mismo analizador conserva el hueco e incompleto: no rellena vueltas
  desaparecidas ni calcula ventana continua sobre la pérdida.
- Tope de muestras en la vuelta activa y última sellada comprobado; los tests
  previos cubren saturación del tope de 18.000 y consumidores desconectados.

SHA-256 del binario test usado:
`80a8e5005b9af02454eae0453a597ee86d63a28af9cedbd3ff3294dc3066b0de`.
SHA-256 de `series_load_tests.rs`:
`16bb41746c8da8c9723810c81ef1251b734bf2fa51e8b97741425b62e8a8077a`.
No se fijan como oráculo temporal: el revisor recompila y registra sus crudos.

Reproducción desde `native/`:

```powershell
cargo test --offline --workspace -j 2 flows::series_load_tests -- --nocapture
```

Este comando filtra la prueba de carga, pero el ejecutable lifecycle sin
harness ejecuta también sus siete escenarios. No confundir el filtrado con
la suite global; esta última se ejecutó íntegra antes del commit.

## Salida de gates y alcance final

```text
cargo fmt --check                                    exit 0
cargo clippy --offline --workspace --all-targets -j 2 -- -D warnings
Finished `dev` profile [unoptimized + debuginfo] target(s) in 1.00s
cargo test --offline --workspace -j 2                 exit 0
runtime: 159 passed; 0 failed; 2 ignored
workspace: 400 correctos; 0 fallos; 4 live ignorados (incluye 7 lifecycle)
git diff --check                                     exit 0
```

Desglose del último workspace: domain 50 + arquitectura 1; ipc 25 + pipes 7;
runtime lib 159 + launcher 5 + core 2 + grabadora ACC 15 + grabadora LMU 24;
conformidad ACC 2 + core e2e 4 + lifecycle 7 + conformidad LMU 9 + oráculo LMU 5;
UI lib 79 + overlays 2 + Workshop 4. Cuatro ignorados: dos LMU live de runtime,
uno LMU live de grabadora y uno ACC live. No se activa el juego ni se llama
REST productivo. Los fixtures y servidores loopback de tests no son QA físico.

Cambios respecto a la base (líneas, con doc comments/espacios): Rust producción
`+579/-9`; tests Rust `+550/-0` (incluye nueve líneas de registro cfg/test en
mod.rs); config Cargo `+2/-1`; generado `+0/-0`. Cero paquetes nuevos.
UI incremental no medida: compilaciones concurrentes y feature compartida
impiden comparabilidad. No se cambia código UI. Nueva señal de serie exige
editar serie/codec/cálculo, sin adaptadores ni UI; añadir señal al modelo común
sigue siendo responsabilidad del otro worker.

Archivos nuevos:
- `docs/superpowers/plans/2026-09-30-fase-4-inventario.md`.
- Este microplan.
- `native/runtime/src/flows/series_feed.rs`, `series_feed_tests.rs`.
- `native/runtime/src/flows/series_codec.rs`, `analysis.rs`, `analysis_tests.rs`.
- `native/runtime/src/flows/series_load_tests.rs`.

Archivos modificados:
- `native/runtime/src/flows/series.rs`, `mod.rs`, `README.md`.
- `native/runtime/src/core/mod.rs`: solo accessor de seis líneas, justificado.
- `native/runtime/Cargo.toml`: solo float_roundtrip existente, justificado.

No movidos/eliminados. `domain/model.rs`, IPC, adaptadores, UI y Go intactos.
No suites Go/frontend: solo inventariados, sin cambios. No pruebas físicas,
release, CI remoto ni DB real: no disponibles/autorizados en este encargo.

**Estado: entrega local parcial para review de Opus, fase 4 NO cerrada.**
Bloqueados: writer/proceso DuckDB, esquema persistido y queries históricas
contra DB, watermark durable/recovery/disco lleno y prueba de presupuesto
journal+series+LMU+OBS. No hay wiring de worker/CLI ni transporte IPC nuevo.
Las APIs internas de bloques/codec/cálculo sí funcionan y están probadas.
Consumo, clima/curvas y validez completa Go necesitan señales adicionales.

Siguiente paso del orquestador: revisar/reproducir estos commits; actualizar
Notion cuando vuelva el acceso; provisionar bindings/runtime offline fijados,
decidir política del techo por vuelta y continuar el corte DuckDB. Isaac
ratifica presupuestos y autoriza la prueba física. Sin push, PR, merge,
promoción, release, gasto, secretos ni cambios de otros worktrees.
