# Plan maestro — retirada V1, auditoría integral y optimización de Telemetría V2

Fecha: 2026-09-03. Diseño aprobado por Isaac mediante brainstorming e interrogatorio;
autorización documental final: «sí. sustitúyelo completamente por esto».
Expediente: [ISA-962](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/962).

Revisión del maestro escrito aprobada por Isaac: «estoy de acuerdo».
[R0 — inventario, rollback y regresiones](../plans/2026-09-03-telemetria-v1-retirada-r0.md)
autorizado y ejecutado en alcance documental/artefacto/checks; revisión independiente
registrada en el handoff. [R1 — pull V2-only](../plans/2026-09-03-telemetria-v1-retirada-r1.md)
preparado, no ejecutado. Estado SDD: SPECIFY aprobado; R0 en verificación final.
No se ha modificado código productivo, retirado V1 ni iniciado la auditoría V2.

## 1. Una sola dirección activa

El objeto es **Telemetría V2 de extremo a extremo**, no toda la aplicación ni
sólo OverlayFrame V2. Buscamos conservar funcionalidad y garantías, retirar
legado y duplicación y reducir CPU, RAM y GPU con el código más sencillo posible.
Superar el coste del HUD equivalente de LMU es una aspiración a demostrar,
no una conclusión ni una razón para encadenar trabajo ilimitado.

```text
1. Retirar telemetría V1 con seguridad
                ↓ candidato sin legado, verificado y congelado
2. Auditar V2 en cuatro carriles de sólo lectura → consolidar hallazgos
                ↓ correcciones/simplificaciones acotadas, con revisión
3. Experimentar y medir → conservar o descartar → informe de cierre
```

Este diseño **sustituye**, no amplía, la secuencia A–J del
[maestro anterior](2026-09-02-huella-minima-plan-maestro-superado.md).
Redline deja de ser el primer bloque obligatorio. La continuidad de este
programa vive únicamente en el [handoff Telemetry Core](../../vantare-program/handoffs/telemetry-core.md);
el handoff Overlay conserva su evidencia específica, sin otra cola de ejecución.

Este corte publica el diseño y reconcilia sus fuentes. No ejecuta retirada,
auditoría de código, experimentos, pruebas del juego ni promociones. Es la base
de los posteriores microplanes, no una orden masiva de modificación.

## 2. Alcance e invariantes

La auditoría cubre adquisición y drivers, normalización/reducción, estado
canónico, cálculos, commit, proyecciones, serialización, transporte, consumo
frontend, cadencias y lifecycle. Incluye todos los consumidores afectados
(Overlay, Engineer, Strategy y recording/Analysis), contratos, seguridad,
errores, observabilidad, pruebas y coste. No rediseña esos productos.

Base semántica: [ADR 0004](../../adr/0004-telemetry-core-modular-observation-architecture.md)
y [ADR 0008](../../adr/0008-telemetry-engine-commit-boundary-and-overlay-frame-v2.md).
Se audita si el código cumple estas garantías: escribirlas no acredita su cumplimiento.

| Invariante | Lo que debe sobrevivir a cualquier simplificación |
| --- | --- |
| Un propietario de adquisición | Un owner por simulador activo; Shared Memory y REST de LMU se complementan. Ningún producto abre otro reader. Core neutral al simulador; un nuevo driver no exige reescribir widgets. |
| Verdad y calidad por campo | Autoridad, presencia, validez, frescura y procedencia explícitas; ausente no es cero. Observado, derivado y estimado distintos; unidades conocidas. Sin fallback inventado. |
| Go como autoridad de dominio | Cálculos/decisiones canónicos en Go, proyecciones tipadas preparadas. El frontend presenta/formatea/anima; no reconstruye otra verdad de negocio. |
| Commit atómico | Estado aceptado, cursor y hechos coherentes; un rechazo no deja mapper/reducer/cursores parcialmente avanzados. |
| Identidad y tiempo | Epoch, sesión, vehículo y stint distintos; orden y reloj monotónico correctos. Sin datos atrasados ni reciclado indebido de identidad. |
| Estado continuo y hechos distintos | Latest-wins para estado continuo; hechos ordenados con huecos/resync explícitos. No descartar hechos silenciosamente para ahorrar. |
| Aislamiento | Un producto lento/fallido o recording no bloquea ni mata Core; live tiene prioridad. Cancelación y recuperación observables. |
| Recursos acotados | Colas, cachés, historias, identidades y suscripciones con límites/retirada; goroutines y transportes cierran. La frescura envejece sin nuevos frames. |
| Contratos pequeños y compartidos | Proyecciones versionadas por producto, TS generado desde Go, autoridad común Studio/Desktop/OBS; Analysis histórico fuera del transporte visual live. |

No es obligatorio conservar un número de capas, managers, interfaces o adapters.
Se pueden fusionar separaciones artificiales o cambiar representaciones sin
perder garantías ni pruebas. Cambios arquitectónicos se proponen con evidencia,
alcance y ADR cuando proceda; auditar no concede permiso para implementarlos.

## 3. Fase 1 — eliminar V1 de forma segura

Owner: [ISA-894](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/894).
Isaac autoriza diseñar la retirada segura, no su promoción automática. Esta
decisión sustituye la condición histórica de pedir nuevamente autorización
genérica de Cut 2 y completar primero toda la secuencia Redline/S1–S5.
No transforma fallos históricos de memoria/paridad en PASS.

Antes del primer borrado, inventariar productores, consumidores, imports,
emisores, flags, adaptadores, tipos, shadow, tooling y fixtures. Clasificar
KEEP/MIGRATE/DELETE con evidencia. Es la comprobación de seguridad de retirada,
no la auditoría completa de fase 2. Un contrato independiente llamado `v1`
(por ejemplo Strategy/Engineer) no es necesariamente la telemetría legacy.

Condiciones:

- Congelar base/candidato y pruebas de comportamiento. Ningún consumidor
  legítimo pierde información, funcionalidad o soporte al migrar.
- Guardar y verificar build anterior, hash, commit y procedimiento de vuelta
  atrás, con compatibilidad de perfiles/datos. Sin migraciones irreversibles.
- Migrar y probar un consumidor necesario antes de borrar su dependencia.
  Si no se sabe preservar/verificar, parar ese corte.
- Retirar por completo motor/transporte/snapshot legacy y sus caminos
  productivos, switches de retorno y shadow de compatibilidad. El nuevo
  ejecutable **no incluye V1 como plan B**: el rollback es cambiar de versión.
- Conservar evidencia histórica y tests semánticos útiles, migrándolos a la
  frontera vigente cuando corresponda. No debilitar assertions para borrar código.
- Verificar ausencia de referencias productivas/bundling legacy, contratos,
  consumidores, builds y revisión adversarial. Mantener Go/TS generado y
  superficies compartidas coherentes.
- Una prueba real imprescindible ausente queda pendiente de Isaac; fixture no
  la sustituye. Puede entregarse un candidato aislado, pero no se difiere un
  bloqueo de seguridad conocido a la optimización ni se afirma aceptación.

Salida: candidato sin telemetría V1, rollback por build comprobable, inventario
resuelto y evidencia de lo verificado/pendiente. Rama sin V1, CI e integración
son estados distintos. No prometer ahorro de esta retirada antes de medirlo.

## 4. Fase 2 — auditar V2 antes de cambiarla

Cuatro Muse independientes, en paralelo y **sólo lectura**, sobre el mismo
SHA congelado sin V1. Cada uno en su snapshot/worktree; ninguno delega.
Fijar archivos y matriz de cobertura antes del despacho, desde el código real,
para que «integral» no signifique sólo los módulos más visibles.

| Carril | Preguntas principales |
| --- | --- |
| A — Core y datos | Origen/transformación de cada dato, autoridades/cálculos duplicados, calidad, unidades, identidad, frescura, commit y orden de hechos. |
| B — Transporte y lifecycle | Entrega, retrasos, huecos, cancelación, reconnect, teardown, consumidores lentos y retenciones sin límite. |
| C — Rendimiento | Trabajo repetido, copias, allocations, serialización, polling/renders, demanda/cambios reales y contaminación de instrumentación. |
| D — Arquitectura, seguridad y calidad | Código/abstracciones sobrantes, dependencias, fronteras de confianza, validaciones, errores, contratos y cobertura de tests; complejidad con garantía real. |

Cada hallazgo lleva ruta/línea y SHA, reproducción o razonamiento verificable,
impacto, invariante afectada, prueba protectora y propuesta mínima. Separar
**defecto demostrado**, **hipótesis de rendimiento** y **simplificación justificada**.
Sin ejecución representativa no hay mejora medida; zona no revisada no recibe APPROVE.

El orquestador lee código/diffs relevantes, consolida duplicados y contradicciones
y publica un mapa único de cobertura/hallazgos. No abre implementaciones
superpuestas. Correcciones de seguridad/corrección y simplificaciones revisadas
se hacen en microcortes antes del bucle. Registrar reducción neta de código
productivo y carga conceptual; nunca usar líneas borradas para quitar tests.

## 5. Fase 3 — mejorar sin rebajar el producto

Cada experimento: **hipótesis → cambio mínimo → tests → revisión adversarial
independiente → medida comparable → conservar o descartar**. Comparar con la
mejor versión validada hasta ese momento, con manifiesto/SHA. Conservar también
la referencia inicial para informar de la mejora acumulada.

Mantener funcionalidad, apariencia, información, calidad/frescura y frecuencias
efectivas. Bajar Hz, ocultar widgets, quitar efectos/información, reducir resolución
o degradar perfiles no cuenta como optimización equivalente. Los niveles de
ahorro existentes son otra dimensión del producto y se preservan.

Preferir menos código y responsabilidades claras a rendimiento equivalente.
Complejidad adicional sólo por mejora medida, reproducible y justificada frente
a la alternativa sencilla. Explicitar mantenimiento y reducción neta; no retener
experimentos descartados en producción.

### Banco y criterio de mejora

Reutilizar [ISA-924](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/924),
sin sensor paralelo. Manifiesto: build/configuración, perfil/contenido equivalente,
escenario, resolución/DPI/refresh, hardware, cadencias, versiones, procesos y
fuentes. Coste total incluye Go, WebView y auxiliares propios, sin atribuir PID
desconocido al overlay. RAM privada/working set, CPU máquina/core, GPU y frametime
son magnitudes distintas. Ausente no es cero; no sumar porcentajes GPU incompatibles.

Antes de aceptar una ganancia, fijar métricas/umbrales, estimar variabilidad con
control A/A y repetir comparaciones intercalando orden. El margen depende del
ruido medido y relevancia práctica, no de elegir después el porcentaje ganador.
Conservar crudos, manifiesto, agregación y dispersión, no sólo medias favorables.
Una prueba contaminada/inconclusa no acredita mejora. CDP/perfilado y medidas
de producción son corridas separadas; no builds ni workers pesados mientras se mide.

Comparación final sobre un subconjunto realmente equivalente:

| Condición | Finalidad |
| --- | --- |
| LMU sin el HUD sustituido y sin Vantare | Referencia incremental; el juego sigue presente. |
| LMU con ese HUD y sin Vantare | Coste del HUD nativo equivalente. |
| LMU sin ese HUD y con Vantare sustituyéndolo | Coste total de la alternativa Vantare. |

Se puede aceptar mejora de un recurso o frametime sin regresión significativa
en los demás. Compensaciones relevantes CPU/RAM/GPU/frametime requieren decisión
de Isaac, no del worker. «Mejor que LMU» exige esa comparación y se limita a las
condiciones medidas. Un microbenchmark de V2 o quitar V1 no lo demuestra.

### Regla de parada vinculante

- **Cinco experimentos consecutivos sin mejora de rendimiento demostrada O
  ocho horas de ejecución del bucle**, lo que ocurra primero.
- Una mejora aceptada reinicia sólo los consecutivos, nunca las ocho horas.
  Reiniciar PC, sesión o worker tampoco reinicia el presupuesto.
- Tiempo acumulado de implementación, revisión y medida del bucle; fases 1–2
  quedan fuera. Registrar inicio/fin y pausas explícitas. Esperar pruebas manuales
  de Isaac no dispara trabajo autónomo ni un reloj nuevo.
- Simplificar sin mejora medible puede aceptarse por mantenimiento, pero cuenta
  como experimento sin mejora. Descartes, regresiones e inconclusos tampoco
  reinician el contador; no renombrarlos para eludir el límite.
- Al límite: mejor versión validada e informe de resultados/limitaciones.
  Detenerse no significa superar al HUD ni alcanzar un óptimo global.

Esta regla sustituye el límite genérico de tres enfoques fallidos sólo para la
búsqueda experimental de rendimiento. Se mantienen los stops de seguridad,
autoridad, conflictos, dependencias y errores no comprendidos.

## 6. Microcortes, modelos y autoridad

Los microplanes posteriores fijarán issue, base/SHA, worktree, archivos
permitidos, prueba previa, hasta tres criterios de aceptación, checks, reviewer
y rollback. Issue antes de editar; no se despachan desde este corte documental.

Sólo `opencode-go/muse-spark-1.3-contributor`, variante `xhigh`, por MCP OpenCode.
Si falta, informar sin sustituir modelo. Un nivel de delegación, tareas
independientes en paralelo, un writer por worktree/rama, reviewers en copias
independientes y una medida controlada a la vez. Workers sin juego ni promociones.

Isaac realizará las pruebas manuales de LMU. El agente prepara candidatos,
comprobaciones automáticas no invasivas y protocolos, y analiza evidencia real
entregada. No lanzar Vantare/LMU ni controlar PC sin nueva petición. Delta y
vueltas del jugador siguen excluidos de comprobaciones automáticas; conservar
sus regresiones. Si hacen falta muestras, solicitarlas, no fabricarlas. Cada
comprobación física propuesta dura máximo cinco minutos; no prueba estabilidad
de horas. Sin soaks encubiertos ni tareas programadas.

AGENTS.md rige `issue → nightly → testers → master`. Este diseño no autoriza
merge, promoción, release o gasto. Go/contratos compartidos: `gofmt`, tests
pertinentes y `go test ./...`; frontend: test, typecheck real, build y lint
aplicables. Sin gates vacíos ni deuda silenciada. Dependencias nuevas/cambios
arquitectónicos se justifican y aprueban antes. No leer/copiar/versionar `.env*`.

## 7. Trazabilidad y cierre

Se retira el programa anterior como mandato, no la historia ni el producto:

- Redline conserva S3 y correcciones en rama. S4/S5/S2 no pasan por esta
  decisión; las pruebas que Isaac quiera realizar quedan manuales.
- Niveles, Personalizado, Automático y lifecycle existentes se preservan.
  Cambiar capacidades exige otra decisión, no esta auditoría.
- Efectos noBlur/flat (#952), recortes generales Hub/renderer (#951), widget
  Coste, informe post-sesión, asistente HUD y composición/clusters ya no son
  fases obligatorias. Sus pendientes no se cierran como entregados ni se
  reactivan automáticamente al acabar V2.
- #956 aporta evidencia de memoria a la auditoría, no PASS heredado ni permiso
  de refactor general. No repetir pruebas válidas por un cambio documental.

El cierre informa reducción de código/complejidad, garantías comprobadas,
hallazgos abiertos, antes/después y descartes, contador/tiempo y comparación
LMU si existe. Distinguir tests, evidencia física, CI, integración y publicación;
incluir rutas, hashes, riesgos y siguiente decisión. Pendientes de otro producto
no bloquean por inercia este alcance; un defecto de garantías V2 sí se resuelve
o se declara bloqueante.
