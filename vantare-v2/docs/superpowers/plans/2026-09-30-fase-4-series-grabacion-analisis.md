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

Solo `native/runtime/src/flows/` y este expediente. Enganche mínimo permitido:
un accessor `Core::series_mut` en `core/mod.rs` para configurar la entrega
antes de adquirir; no cambiar adquisición, modelo, derivaciones o IPC.
Almacenamiento y cálculo serán módulos propios bajo flows, sin nuevo crate:
el workspace de cuatro paquetes no necesita otra frontera de build ahora.
El orquestador es propietario del handoff vivo compartido y de la integración.

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

Nunca más de dos jobs. No tocar UI, Cargo manifests/lock ni otros worktrees.
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
- Cortes 4–5: siguientes, independientes del backend de almacenamiento.
