# Búsqueda temporal nativa: incumbent y memoria (#1458)

Entrega local de [#1458](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1458), sobre la entrada congelada de [#1450](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1450). Ejecución y gates finales: 2026-10-04, tras recuperar el worktree del reinicio. El solver obtiene un plan factible antes de enumerar las recargas; la búsqueda interrumpida conserva ese plan y publica `NotProven`. No se modifican validación, replay, reglas, discretización ni dominancia de reloj/pilotos.

## Diagnóstico previo al cambio

Se instrumentó la búsqueda original y se congeló su ejecutable antes de introducir la semilla. `VANTARE_STRATEGY_TRACE=1` activa únicamente logs JSON a stderr: frontera máxima por vuelta, propuestas creadas, podas, comparaciones y tiempo al primer incumbent. La implementación final añade estados expandidos por vuelta y máximos de estados/historia retenidos. Un monitor externo muestrea RSS y memoria privada cada 5 ms; el solver no añade una dependencia ni consultas al sistema operativo.

Con Fuji y el presupuesto del Hub (2.000 ms, 250.000 candidatos, 1.000.000 iteraciones), la búsqueda original crea 2.726 propuestas, hace 1.000.001 comparaciones, poda cero estados y no alcanza ningún incumbent. Las fronteras crecen mientras todavía se expande el estado inicial: vuelta 9 = 357, 10 = 456, 11 = 546 y 12 = 438. El replay acepta la decisión testigo congelada. Esto confirma que el presupuesto se consume comprobando dominancia en el producto de recargas antes de llegar a un plan completo; no demuestra que una fusión de relojes o pilotos sea correcta. Los intentos de 120 s y memoria superior a 1,5 GiB documentados en #1450 son evidencia previa, no mediciones nuevas de este informe.

## Cambio mínimo elegido

1. Semilla de stints largos y recargas suficientes, con replay de cada prefijo y validación completa antes de aceptar el plan. Respeta secuencia de pilotos, neumáticos, ventanas, límites y reservas. Su tiempo se limita a 200 ms o un cuarto del presupuesto, lo que sea menor, con cancelación dentro del recorrido. Reduce la última recarga por pasos de la rejilla mientras el replay siga aceptándola. Si el último servicio cruza la duración e impide iniciar otra vuelta, intenta adelantarlo una vuelta, recalculando los recursos mediante replay. No introduce esperas ni excepciones de validación.
2. Cota optimista de vueltas/tiempo para branch and bound, solo en modelos sin riesgo, meteorología, neumáticos físicos, curvas de ritmo, peso de combustible o ajustes negativos. Ignora costes futuros y usa el ritmo base más rápido. Los demás modelos mantienen la enumeración original. No se redondea el reloj ni se declara simetría de pilotos.
3. Frontera dispersa por vuelta mediante `BTreeMap`, manteniendo el orden previo. En carreras temporales se limita a 4.096 estados y 16.384 registros de stints/paradas retenidos. Alcanzar el límite devuelve `frontier_memory_budget_exhausted` con `NotProven`, nunca `NoSolution`. La frontera evita reservar un vector vacío por cada vuelta del horizonte; una regresión cubre el máximo ya aceptado de 100.000 vueltas.

La semilla solo se incorpora a los candidatos cuando la enumeración se interrumpe. Las búsquedas completas conservan su política de candidatos/variantes. No hay dependencias nuevas, `unsafe` nuevo ni `unwrap()` en el código productivo añadido. No se cambia la rejilla Fuel × VE ni se añade indexación de dominancia: la semilla resuelve la ausencia de plan y los límites acotan la estructura retenida; el escaneo lineal sigue pendiente si se pretende demostrar óptimos grandes.

## Mediciones comparables

Tres rondas alternadas antes/después, sin cargo propio simultáneo, con procesos nuevos sobre la misma máquina compartida. Se reutiliza el perfil del workspace (`dev`, crate Strategy con `opt-level=3`), no se compara debug con release. Tiempos y picos de memoria son medianas de tres ejecuciones; no son un p95 estadístico. «API» procede de `proof.durationMillis`, incluye la obtención del resultado; el primer plan se mide dentro del solver antes de ajustar la última carga. «Proceso» incluye arranque, JSON y replay posterior. RSS/privada son MiB, muestreados externamente; los logs conservan todos los valores.

| Entrada | Primer plan antes → después (ms) | API antes → después (s) | Proceso antes → después (s) | RSS antes → después (MiB) | Privada antes → después (MiB) | Calidad después: vueltas / tiempo previsto (s) |
|---|---:|---:|---:|---:|---:|---|
| Fuji 1 h, variante | ninguno → 2,2 | 0,997 → 0,993 | 1,045 → 1,059 | 84,6 → 84,9 | 82,6 → 82,8 | 39 / 3.641,624 |
| Fuji 2 h, variante | ninguno → 1,8 | 0,995 → 1,058 | 1,036 → 1,113 | 85,2 → 84,9 | 83,2 → 82,8 | 79 / 7.266,121 |
| Fuji 6 h, entrada #1450 | ninguno → 3,8 | 1,022 → 1,046 | 1,065 → 1,110 | 84,9 → 85,2 | 82,9 → 83,1 | 236 / 21.662,089 |
| Fuji 24 h, variante | ninguno → 43,6 | 1,009 → 1,201 | 1,054 → 1,335 | 85,1 → 85,9 | 83,1 → 83,8 | 940 / 86.446,867 |

Todas las salidas nuevas son factibles en replay y `NotProven`; todas las originales carecen de plan. Se mantienen el presupuesto temporal de 2 s y los límites del Hub indicados arriba. Rango del proceso final: 1 h = 1,036–1,070 s; 2 h = 1,107–1,261 s; 6 h = 1,101–1,256 s; 24 h = 1,325–1,344 s. RSS máximo entre las tres rondas de cada caso: 85,5 / 85,2 / 85,4 / 86,2 MiB. Solo 6 h es la entrada original; 1, 2 y 24 h cambian duración y horizonte a 40 vueltas/h, conservando los demás datos y la secuencia de pilotos. No existe una entrada de Imola en `native/strategy/testdata` ni `internal/strategy`; Fuji 2 h no se presenta como Imola.

El testigo de #1450 completa 236 vueltas en 21.663,689 s con 312,200 s de boxes. El plan nuevo hace `42/42/42/42/42/26`, seis stints, 21.662,089 s y 310,600 s de boxes: mismas vueltas, **1,600 s menos** en el modelo. Ambas decisiones pasan el replay completo. Es una comparación contra un plan factible, no contra un óptimo ni una carrera observada; no hay testigo independiente de las variantes.

Con 2 s pero 100 M candidatos y 1.000 M iteraciones, antes: ningún plan, API 2,013 s, proceso 2,081 s, RSS 129,4 MiB y parada por deadline. Después: el mismo plan de 236 vueltas, primer incumbent 3,9 ms, API 1,864 s, proceso 1,957 s, RSS 124,9 MiB, parada por memoria de frontera. Un estrés separado de 20 s con esos límites grandes termina igualmente por frontera: API 1,883 s, proceso 1,974 s, RSS 124,9 MiB. No es el presupuesto productivo del Hub. La traza registra 4.097 propuestas, 1.941.678 comparaciones, 4.096 estados retenidos y 8.192 registros de decisiones; no crece hasta agotar los 20 s. Los guards externos de 512 MiB/10 s no se activaron.

En Fuji bajo los límites normales todavía se crean 2.726 propuestas y se hacen 1.000.001 comparaciones, con cero podas y un máximo de 2.725 estados/5.450 registros retenidos. La cota optimista no elimina ese producto inicial: el beneficio observado viene de obtener y preservar la semilla, y del tope estructural al ampliar presupuestos. No se atribuye una reducción de complejidad a branch and bound sin evidencia.

## Regresiones y paridad

`native/strategy/tests/search_budget.rs` añade cinco pruebas: Fuji 6 h frente al replay testigo; todas las duraciones enteras 1–24 h, aislando la semilla con un candidato; límite de historia con 1.000 M iteraciones; horizonte de 100.000 vueltas; y una tabla de seis casos pequeños que compara vueltas y tiempo óptimos con enumeración independiente de todas las particiones y cargas de la rejilla. La tabla cubre ambos lados de los límites de duración 5.400 y 9.003 s, usa el replay público y no reutiliza la poda productiva. Los casos pequeños son modelos de test, no evidencia de una carrera real.

El corpus Go congelado y sus hashes no se modifican. Las pruebas existentes comparan solver escalar/V2, neumáticos físicos, curvas y resto de contratos con sus resultados sellados. No se genera un oráculo nuevo ni se modifica Go.

| Gate final, desde `native/` | Resultado |
|---|---|
| `cargo fmt --check` | Salida 0 |
| `cargo clippy --workspace --all-targets -j 2 -- -D warnings` | Salida 0, sin warnings |
| `cargo nextest run --workspace --build-jobs 2 -j 2 --no-fail-fast` | Salida 0: **1.022 pasadas, 4 omitidas**, 179,351 s de pruebas |
| Crate Strategy, incluido en ese gate | **57 pasadas**, cinco regresiones nuevas y toda la paridad Go congelada; hashes sellados correctos |
| `cargo test --workspace --test lifecycle -j 2` | Salida 0: **5 Engineer + 11 Runtime pasadas** |
| `git diff --check` | Correcto |

Los gates sustituyen `cargo test --workspace` conforme al encargo. Se ejecutó un único cargo propio a la vez mediante `C:/tmp/fase2/bin/cargo.cmd`, con dos jobs; no se ejecutó `cargo test -p`. El `cargo check --workspace --all-targets -j 2` de iteración está conservado en `check.log`; la fuente final queda comprobada por Clippy y el build de la suite. Los cuatro tests omitidos por el perfil requieren REST/memoria compartida LMU y ACC con broadcasting; no se arrancaron juegos. No se ejecutan Go/frontend, porque no se modifican sus fuentes ni contratos compartidos. Sin CI remoto.

## Evidencia y límites de la entrega

Toda la evidencia está fuera del repositorio en `C:/tmp/isa-1458-evidence/`: runner original y final, fuentes del runner/monitor, entradas y decisiones, resultados completos, trazas, resúmenes, logs de gates y manifiesto de hashes. Las primeras rondas y errores quedan conservados: la primera semilla fallaba a 15 h por el último servicio; la reparación se comprobó en las 24 duraciones. Tras el reinicio Rust descartó automáticamente un artefacto incremental corrupto del Hub. Clippy detectó dos inicializaciones `Default` poco explícitas; se corrigieron y se repitió el gate. Un primer comando de regresión se lanzó desde un directorio sin Cargo.toml y se repitió correctamente.

La semilla es una heurística validada, no una garantía de encontrar plan para cualquier combinación de reglas de 1–24 h. Los límites acotan estados e historia retenidos, no un número universal de bytes: cadenas, metadatos y opciones dependen de la entrada. La memoria RSS medida solo respalda estas entradas. No se garantiza una devolución exacta en 2 s para cualquier entrada aceptada; los replay y operaciones individuales siguen siendo síncronos. No hay prueba de optimalidad grande, gap ni cota inferior publicada. Sin entrada nativa de Imola no se afirma cobertura de Imola; tampoco hay nueva ejecución visual del Hub ni runtime LMU.

Verificación: deserializar `native/strategy/testdata/fuji-1450-input.json` y llamar `solve_v2`; reproducir el `best` con las cargas iniciales devueltas y comprobar factibilidad, reserva y comienzo de la última vuelta antes de duración. Ejecutar `cargo nextest run --workspace --build-jobs 2 -j 2 -E 'package(vantare-strategy)'`. Para reproducir la tabla, ejecutar el monitor externo alternando los runners congelados, sin cargo simultáneo, y leer primero `C:/tmp/fase2/notas-1458.md` si existe. Las trazas solo se activan con la variable indicada.

Rama `vantareapp/isa-1458-strategy-busqueda`; base y HEAD de entrada `03f97a9335c1c1b58ef1a78797c56fd8ae14d2bd`. SHA final en la entrega y comentario #1458. Commit local sujeto a revisión del orquestador. Sin push, PR, CI remoto, merge, promoción ni release. Notion no disponible bajo la excepción explícita de esta tarea: proyecto/estado/última actualización no verificables; no se declara completado el seguimiento Notion ni se toca el handoff fuera del alcance. Preguntas pendientes: aportar una entrada nativa de Imola si se requiere su medición específica y decidir por separado si se necesita optimalidad de carreras largas.
