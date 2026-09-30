# Microplan — Fase 4: series, grabación y análisis (ISA-1429)

Fecha: 2026-09-30. Proyecto: arquitectura Rust nativa, ADR 0099.
Issue: [#1429](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1429).
Worker: Codex. Orquestador/revisor: Claude Opus 5.5.
Rama: `vantareapp/isa-1429-fase4-series-grabacion`.
Base entregada: `abcf10acdbb6500eabdbb88f20e6ed568bb484e4`.
Inventario: [rutas y contratos](2026-09-30-fase-4-inventario.md).

**Estado actual tras la continuación:** cortes de datos/API terminados localmente
para review de Opus: series largas, proceso DuckDB único, queries, live/replay,
durabilidad y recuperación. Aceptación física journal+series+LMU+OBS bloqueada
a Isaac. Hub/launcher y RPC existentes no se modifican por propiedad paralela:
el orquestador conecta las APIs entregadas. No se declara la fase aceptada,
integrada ni promocionada. Los estados de bloqueo posteriores son históricos.

## Objetivo y fronteras

Entregar muestras del jugador en bloques durante la vuelta y al sellarla,
sin esperar a almacenamiento o análisis, y calcular exactamente lo mismo
al consumir esos bloques en directo o reproducirlos. Recording permanece
desactivado por defecto. No prometer durabilidad sin commit efectivo DuckDB.

Rutas principales: `native/runtime/src/flows/` y este expediente. Enganche mínimo:
un accessor `Core::series_mut` en `core/mod.rs` para configurar la entrega
antes de adquirir; no cambiar adquisición, modelo, derivaciones o IPC.
El cálculo puro permanece bajo flows. Almacenamiento tendrá crate y proceso
propios `native/storage`, autorizado por el orquestador el 2026-09-30; ningún
crate actual dependerá de él. `default-members` conserva los cuatro paquetes
ligeros, mientras los gates `--workspace` verifican también almacenamiento.
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
3. **Almacenamiento DuckDB, propietario único**: desbloqueado por autorización
   explícita del orquestador el 2026-09-30. El bloqueo inicial fue:
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
Excepción necesaria autorizada: workspace Cargo.toml y Cargo.lock para agregar
únicamente storage y su dependencia DuckDB fijada; ningún manifest UI/domain/IPC.
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

**Estado anterior a la continuación: entrega local parcial para review.**
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

## Continuación autorizada — 2026-09-30 (plan previo al código)

DuckDB autorizado: `duckdb = { version = "=1.10505.0", features = ["bundled"] }`.
Crate y libduckdb-sys comprobados en caché. Trabajar estrictamente offline.
Es la única dependencia nueva directa; stdlib no ofrece SQL/DuckDB y bindings
manuales, CLI o Python añadirían riesgo/runtime. C++ bundled implica coste
de compilación y binario; registrar tiempo de primer build y tamaño por perfil,
sin presentarlos como build de distribución. No activar extensiones ni red.

Cortes pendientes, un commit por hito, en este orden:

6. **Vueltas largas**: quitar el techo de grabación. Mantener como máximo
   18.000 muestras de ventana diagnóstica, reciclando la ventana con offset
   explícito; publicar antes de reciclar. Chunks de 64 y offsets absolutos
   no dependen del tiempo/distancia de la vuelta. Test de regresión primero:
   600 s a 100 Hz, receptor rápido, continuidad exacta y memoria acotada.
   El techo describe memoria local, nunca genera hueco en el feed.
7. **Writer aislado**: crate storage con binario bajo demanda, única conexión
   en su proceso; cliente de proceso en el mismo crate consume Receiver en
   hilo propio. Ningún SQL, serialización o espera entra en Core. Protocolo
   local acotado con comandos cerrados, sin SQL arbitrario. DB nueva por
   grabación, esquema versionado, chunks originales BLOB sin transformar,
   índice de intento como clave y watermark actualizado en la transacción.
   ACK solo después de COMMIT; duplicado idéntico idempotente, conflicto falla.
   Tests de escritura/lectura real, conexión única, validación y cola llena.
8. **Consultas**: paginación por índice, máximo acotado, replay con el mismo
   codec y analizador puro. Lectura histórica read-only; no importar/modificar
   bases Go/LMU. Schema desconocido falla. Tests de paridad live/durable/replay,
   límites, identidad y huecos. El proceso serializa peticiones; análisis
   fuera de la conexión, nunca en adquisición. La vista Hub sigue en fase 5.
9. **Durabilidad y recuperación**: reabrir WAL tras matar proceso real después
   de ACK, repetir envío sin duplicar y detectar cola final no confirmada.
   Validar watermark con filas persistidas; errores SQL/I/O no avanzan ACK.
   Cierre por EOF; cliente ofrece plazo y terminación del hijo si se bloquea.
   Tests rollback y DB ajena preservada, proceso caído, recuperación exacta.
   Carga con writer detenido prueba progreso y pérdida explícita; medir
   escritura real separadamente. Corte físico LMU+OBS/journal requiere Isaac.

El proceso no recibe rutas de importación/SQL desde chunks. Ruta de DB y
recording son parámetros explícitos del propietario. No interpreta formatos
Go/LMU ni migra originales. Solo v1 de velocidad/pedales; cálculos Go ricos
siguen fuera por señales ausentes. Integración de arranque Hub/fase 5 y
journal/fase 3 permanece del orquestador: entregar API ejecutable y probada.

Preguntas pendientes para Isaac: presupuesto físico total con journal+series,
campaña LMU/OBS y empaquetado final/notices DuckDB. No bloquean estos cortes.
Gates previos al commit de esta continuación: fmt/clippy/test del workspace
original, offline y `-j 2`; registrar resultado antes de commitear.

Gates de este microplan: fmt exit 0; clippy exit 0 (33,32 s); test exit 0,
400 correctos y 4 live ignorados, incluyendo 7 lifecycle sin harness.

Corte 6: prueba previa falló con `left: 18000 / right: 60000` (exit 101).
Se publica antes de reciclar la ventana; offsets diagnósticos explícitos,
chunks absolutos y memoria constante sin trasladar el Vec. Se comprueba
overflow de offset en codec y del conteo u32 en análisis antes de mutar.

Corte 6 gates: fmt exit 0; clippy exit 0 (5,77 s); test workspace exit 0,
401 correctos, 4 live ignorados y cero fallos. El test nuevo pasa con 60.000.

Primer build storage: `cargo build --offline -p vantare-storage --bin
vantare-storage -j 2`, perfil dev/debug, target MSVC, DuckDB/C++ y sus 49
paquetes nuevos sin artefactos previos; dependencias antiguas del workspace
calientes. 886,605 s hasta acabar C++/binding y detectar E0507 en la frontera
BufRead propia. Corregido reborrow explícito con `Read::take`, sin cambiar el
binding ni flags. No es medida de workspace completamente frío ni de release.
DuckDB compiló 280 unidades C++; archivo estático final 2.323.527.676 bytes
(2,16 GiB; la lectura previa durante su escritura era parcial). Tiempo
del build corregido y tamaño final del ejecutable se registran a continuación.
El lock añade 49 paquetes, no actualiza versiones anteriores (solo desambigua
nombres de dependencias que ahora tienen dos versiones). Ningún crate vivo
depende de DuckDB: test de grafo transitivo añadido en storage, sin editar
domain/IPC/UI. Nuevo crate necesario para aislar binding y proceso; estándar,
helper Go read-only, CLI/Python o FFI manual no cumplen esta frontera.

Build corregido: 19,474 s, exit 0. Primer ejecutable debug: 61.479.936 bytes
(58,63 MiB); archivo estático DuckDB debug: 2.323.527.676 bytes. Inspección local con
`llvm-readobj --coff-imports`: sin duckdb.dll; sí MSVCP140, VCRUNTIME140 y
VCRUNTIME140_1 además de DLL del sistema. Redistribución VC++/notices final
corresponde a empaquetado, no se declara portable autónomo por bundled.
El primer clippy `--workspace` genera otro fingerprint del build-script
por unificación de features host con UI y recompila C++; también registrar
este coste. Builds normales de default-members no incorporan storage.

Gate clippy workspace: exit 0, 12 min 37 s; segundo archivo estático final
2.323.527.568 bytes. `cargo test --workspace -j 2` genera un tercer fingerprint
del build-script/artefactos host y compila otras 280 unidades C++ antes de
ejecutar pruebas. Dos cl.exe del proceso propio confirmados; no se saltan
gates ni se cambia el perfil para ocultar este coste. La caché de fuentes no
equivale a caché de artefactos. Fmt exit 0; suite aún en curso a este punto.
Comprobación manual del binario: DB temporal nueva bajo target, ready=0,
ACK=1 y cierre normal exit 0; fixture explícita, no telemetría física.

Corte 7 terminado: fmt/clippy/test exit 0; 408 correctos (incluye lifecycle),
4 live ignorados, cero fallos. Compilación test: 12 min 39 s, tercer artefacto
C++ incluido. Siete pruebas nuevas: seis de DB/protocolo/grafo y una con dos
procesos reales para exclusión de propietario. Sin DB de usuario.
Las consultas públicas y cierre/recovery completo siguen en cortes 8/9.

Corte 8: protocolo page con cursor por índice y máximo 16 chunks; queries
parametrizadas, sin SQL arbitrario. Read-only no reconstruye toda la sesión
al abrir. Tests de 40 chunks/cuatro vueltas con todas las calidades y f64
sensible al roundtrip: comparación exacta con análisis live, archivo original
sin cambios, límites de página/cursor, pérdida y versión desconocida.

Detalle del corte 9 antes de implementarlo: cliente de proceso bajo flows,
solo stdlib/serde_json/arc-swap ya presentes. Un hilo posee pipes y receiver;
el padre conserva Child para terminarlo al agotar plazo. Cancelación y join,
también si el hilo solo espera al productor. Summary live latest-wins del
prefijo ACK, con ArcSwap existente y SeriesAnalysis compartido, máximo 256
resúmenes; replay de prefijo antes de reanudar. No bloquea adquisición ni añade
un motor de cálculo. Finish devuelve estado durable y resumen final. El stop
se registra con intentos totales, haciendo visible la cola final perdida;
EOF/caída no inventa ese total. Una DB ajena se inspecciona primero read-only.

Corte 8 gates: fmt/clippy/test exit 0; clippy 14,69 s; compilación test
1 min 07 s (sin recompilar C++). 410 correctos, 4 live ignorados, cero fallos.

## Cierre de implementación del corte 9

Writer/proceso real, una conexión RW, configuración sin extensiones/acceso
externo, inspección read-only de DB existentes antes de RW. Solo nuevas DB
propias v1; ninguna DB Go/LMU abierta en esta entrega. Reanudar reconstruye
prefijo por páginas, valida identidad/orden/offset/calidad y conserva gaps.
SQL INSERT+watermark atómicos; ACK tras COMMIT. Cache del binding reutiliza
las dos sentencias preparadas por chunk; sin nueva dependencia ni motor.

API flows: SeriesWorker start/analysis/watermark/failed/finish, SeriesReader
state/page/analyze. Pipe y Receiver de un único hilo; Child del padre permite
terminarlo al agotar plazo. Cancelación/join cubre espera al productor, ready
y ACK. Plazo absoluto incluye salida del hijo. Summary live latest-wins con
arc-swap ya existente, hasta 256 resúmenes, sobre prefijo ACK. Finish entrega
estado y resumen final; bloque/vuelta no observada nunca se fabrica.

EOF/caída conserva finished=false y total final desconocido. Finish confirma
attempted y permite ver cola final perdida sin esperar otro chunk. Reenvío
idéntico seguro; contenido distinto o índice nuevo después de finish falla.
La recuperación no repara/trunca filas ni ficheros ajenos. Feed desconectado
no se reinicia automáticamente: supervisor decide nueva grabación/productor.
Queries históricas son síncronas y se invocan fuera de adquisición/renderizado;
recuperar un archivo grande cuesta recorrerlo, aunque la memoria sea acotada.

Ocho pruebas nuevas del corte 9 (17 totales storage):

- Proceso real muerto después de ACK con WAL presente, reapertura, retry
  idéntico, continuación y paridad de resúmenes live/durable/replay.
- Carga Core → Receiver → pipes → proceso → DuckDB → finish → reader: 6.001
  fotos, 104 coches, 100 Hz lógicos, 6.000 muestras de vuelta y 95 chunks.
- Cola sin drenar: Core progresa; finish conserva pérdida final conocida
  aun sin un siguiente chunk. Sigue el test anterior de 36.000 fotos con plazo.
- Timeout cero y Drop con productor vivo: cancelación sin propietario huérfano;
  lectura posterior confirma prefijo, finished=false y cola final desconocida.
- Finish incompatible/repetido y nuevas escrituras después de cierre.
- Fallo SQL real en UPDATE después de INSERT: rollback de chunk y watermark,
  writer latched, reapertura del prefijo. Es constraint failure, no disco lleno.
- Watermark inconsistente y payload corrupto: error visible, sin reparación.
- Fallo de entrega de ACK después de COMMIT: incertidumbre del cliente y retry
  idempotente sin duplicar muestras.

Últimos gates del código final, desde native (offline, siempre -j 2):

```text
cargo fmt --check                                      exit 0
cargo clippy --offline --workspace --all-targets -j 2 -- -D warnings
Finished dev profile target(s) in 34.24s                exit 0
cargo test --offline --workspace -j 2                   exit 0
Finished test profile target(s) in 1m 48s
418 correctos, 0 fallos, 4 live ignorados; incluye 7 lifecycle sin harness
storage: 12 unitarios + 5 proceso, todos correctos
```

Gates previos del mismo corte también pasaron; cambios posteriores limitados a
cache de statements y plazo absoluto motivaron repetir todos. Los primeros
lints propios (doc_markdown/collapsible_if y estilo de tests) se corrigieron,
sin allow de producción ni dependencia bytecount. Sin unwrap/unsafe nuevos
en producción. Go/frontend no ejecutados porque no se modificó su código.

## Carga del writer real: salida y reproducción

Windows x64, Ryzen 7 3700X (8/16), rustc 1.95.0, perfil test/debug, workers
concurrentes. Generador+Core incluidos en adquisición; startup/COMMIT/cierre
solo en total. Una pareja secuencial informativa, sin A/A ni gate de ratio.

Antes de reutilizar planes SQL (mismo test, ejecución anterior, no comparación
controlada): baseline_ms=573.741, adquisición_con_writer_ms=547.826,
total_commit_stop_ms=26291.277, 95 chunks durables. La mejora de código evita
preparaciones repetidas; estas dos ejecuciones no acreditan un factor causal.

Salida literal del test final, aislado del resto de la suite:

```text
ISA-1429 writer real debug: frames=6001, coches=104, hz_lógicos=100, baseline_ms=576.505, adquisición_con_writer_ms=559.563, total_commit_stop_ms=4074.367, chunks_durables=95, muestras_vuelta=6000; sintético, sin LMU/OBS, sin gate de ratio
test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 4 filtered out
```

Binario test process SHA-256:
`290758aef41eb3b58a49f3fb62cdd460557e78057f3decc9f68e88d6b2ba44c5`.
Ejecutable storage debug final: **61.710.848 bytes (58,85 MiB)**; sin medición
release ni claim de instalador/portable. Costes en frío 886,605+19,474 s,
clippy 12m37s y primer test 12m39s documentados arriba, con tres fingerprints
C++ distintos. Artefactos bajo target ignorado, no distribuidos/versionados.

Reproducción con build cache actual:

```powershell
cargo test --offline --workspace -j 2 actual_writer_preserves -- --nocapture
cargo test --offline --workspace -j 2 --test process
```

El primero ejecuta también lifecycle por su harness propio. La ejecución focal
citada se hizo directamente sobre process-*.exe con nombre de test --exact
--nocapture para aislar esa medición. No confundir filtro con gates completos.

## Límites y entrega al orquestador

Rutas adicionales justificadas: native/Cargo.toml y Cargo.lock para incorporar
storage; la dependencia no entra en domain, IPC, UI ni runtime. Runtime usa
solo stdlib, serde_json/float_roundtrip y arc-swap previos. Nuevo worker bajo
flows; ningún nuevo cambio en core/model/adaptadores/ipc. Enganche previo
Core::series_mut de seis líneas sigue siendo el único cambio core.

Implementación de datos/API lista para review; sin flag de launcher ni vista
Hub. El orquestador integra arranque/parada con el propietario core/IPC/journal,
evitando edición concurrente. Recording sigue opt-in. No importación/migración
de originales, catálogo multisesión global ni consumo/clima/tyres/validez
completa Go: faltan señales y contratos que no pertenecen a este corte.

Bloqueado a Isaac: presupuesto CPU/latencia/frame time/RSS con journal+series
activos en LMU+OBS, prueba física de juego y disco lleno/pérdida de energía.
El rollback SQL y el kill de proceso no se presentan como esos escenarios.
Pregunta abierta de empaquetado: runtime VC++/notices DuckDB y medidas release
para fase 7. No acciones externas, gasto, secretos, .env, push, PR ni merge.
Notion no accesible, excepción GitHub autorizada: seguimiento operativo queda
al orquestador cuando vuelva acceso; no se simula actualización verificada.
