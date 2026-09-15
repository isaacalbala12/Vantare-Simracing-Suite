# Segunda ronda de optimización dirigida por hechos

Fecha: 2026-09-15
Estado: diseño aprobado en conversación; pendiente de revisión del documento escrito
Tarea: [VAN-727](https://app.notion.com/p/3dce51695c65814e97def0b85ba62a48)
Proyecto: Telemetry Core

## Objetivo

Contrastar adversarialmente los candidatos F01–F08 contra el código real,
reproducir su coste y conservar únicamente cambios pequeños cuya corrección y
mejora estén demostradas. La campaña no reduce frecuencia, precisión,
validación, calidad visual ni volumen de datos para mejorar cifras.

## Referencias y procedencia

- `AUDIT_BASE=f617467427f8d78f7432b4445d52be0c4dfe616a`.
- `ROUND_BASE=ae11bef79471e04aaa8f11422e0c91d834b4277b`.
- E1 ya existente: `c0f47c6a7c750978bb867de3876d003829869035`.
- E2 ya existente: `a5de341ef6d9032c4f99477a29785e75917ba47d`.
- La mejora incremental se mide contra `ROUND_BASE`. La comparación contra
  `AUDIT_BASE` es acumulada y atribuye E1/E2 por separado.
- E1/E2 se conservan y no se presentan como descubrimientos de esta ronda.

## Organización

Codex es el coordinador y único integrador. Tres subagentes Luna trabajan sin
delegación anidada y con ámbitos de escritura separados:

1. **Studio:** F01 y F02.
2. **Overlays frontend:** F03, F04 y F08.
3. **Go:** F05, F06 y F07.

Cada worker recibe un worktree y rama propios derivados de `ROUND_BASE`. Ningún
worker escribe en el worktree coordinador, en el checkout de integración ni en
`quality/antislop-bootstrap`. Los benchmarks intensivos, builds y suites
globales se ejecutan de forma secuencial por el coordinador.

El coordinador revisa el código y los consumidores, el diff completo, las
pruebas, el harness y las métricas de cada worker antes de integrar. Un informe
del worker no constituye aceptación.

## Método por candidato

Antes de cambiar código se registra:

1. hecho confirmado o refutado en `ROUND_BASE`;
2. consumidor productivo y frecuencia esperada;
3. hipótesis mínima;
4. comportamiento que debe protegerse;
5. criterio de aceptación y reversión;
6. harness, datos y configuración comunes para base y candidato.

Después se añade primero la regresión o caracterización necesaria, se aplica el
cambio mínimo, se ejecutan pruebas focales y se repite la medición. Los
resultados incluyen todas las muestras y contadores de trabajo, no sólo la mejor
corrida. Los cambios sin mejora suficiente se revierten del producto, pero su
evidencia queda registrada.

Cada candidato termina exactamente en uno de estos estados:

- `IMPLEMENTADO_Y_MEDIDO`;
- `SIMPLIFICADO_SIN_GANANCIA_RUNTIME_DEMOSTRADA`;
- `DESCARTADO_CON_EVIDENCIA`;
- `YA_RESUELTO_EN_HEAD`;
- `BLOQUEADO_CON_CAUSA_CONCRETA`.

## Orden de ejecución

1. Confirmar `ROUND_BASE`, E1/E2, instrucciones y aislamiento.
2. Ejecutar primero los experimentos pequeños F01 y F03.
3. Completar F05/F06 y después F07 en la ruta Go.
4. Completar F02/F04/F08 sin permitir que F08 desplace candidatos de mayor
   coste demostrado.
5. Integrar candidatos aceptados uno por uno en el worktree coordinador.
6. Repetir escenarios principales sobre la combinación final.
7. Ejecutar gates focales y globales aplicables.
8. Actualizar evidencia, handoff y VAN-727 y preparar la revisión Astra High.

El límite del bucle experimental sigue siendo cinco experimentos consecutivos
sin mejora medida u ocho horas acumuladas, sin relajar otras condiciones de
seguridad o verificación.

## Contratos protegidos

### Studio

- La entrada y los payloads de comandos no se mutan.
- Se preservan materialización desde `general`, independencia entre sesiones,
  contenido y visual anidados, comandos reales/no-op, undo/redo, saved/dirty y
  límite de historial 100.
- Los benchmarks separan validación DEV/test de la aproximación a producción.

### Overlays frontend

- La preparación estática se invalida con todos sus inputs reales; no se cachea
  sólo por ID ni se crean mapas globales sin límite.
- Se conservan diagnósticos, recuperación desde configuración inválida,
  reduced motion, marca/licencia, orden de hooks y ViewModels dinámicas.
- El coordinador mide host y renderer con telemetría cambiante, además de
  parsers, migraciones, clones, firmas, notificaciones y allocations.
- F08 mantiene límites de tamaño, UTF-8, ACK, revisión/base, rollback y rechazo
  de payloads malformados.

### Go

- Se preservan dirty detection inmediata, freshness, calidad, ventanas,
  wrap-around, empates, orden estable, settled relative y ausencia de jugador.
- Toda lectura prestada exige una auditoría de ownership; no se sustituye
  globalmente `Snapshot.Value()` por `Peek()`.
- Snapshots anteriores y entradas no cambian al mutar salidas o procesar ticks
  futuros; los builders inyectados siguen siendo parte del contrato.
- El historial de controles produce ventanas inmutables, incluidas cancelación,
  `Prepare` sin `Commit`, resets y muestras stale/missing/invalid.

## Medición

### TypeScript/React

- Cargas representativas por tamaño y número de consumidores/widgets.
- Contadores de parseos, migraciones, clones, comparaciones, serializaciones,
  notificaciones y renders.
- Comparaciones repetidas base/candidato con todas las corridas conservadas.
- Separación entre decoder/validación, coordinador/notificaciones/ViewModels y
  render/efectos visuales.

### Go

- Casos 1/44/104 vehículos, estáticos y dinámicos, con y sin jugador.
- Ticks omitidos y reconstruidos, builders y costes internos instrumentados.
- Benchmarks repetidos y `benchstat` cuando el coste lo permita; perfiles de
  CPU/alloc sólo cuando ayuden a atribuir el resultado.
- Pipeline de controles lleno durante miles de ticks, con `B/op` y `allocs/op`.

Las cifras macOS no se presentan como FPS, CPU o RAM de LMU/Windows. Cualquier
validación Windows/Wails/LMU no ejecutada se marca como pendiente.

## Integración y Git

- Rama coordinadora local: `perf/facts-round2-20260915`.
- Commits pequeños y reversibles, con staging por rutas.
- Los commits de workers sólo se integran tras revisión del coordinador.
- No hay push, PR, merge, deploy, promoción, release ni cambio administrativo.
- No se modifican CI, reglas globales, baselines globales, skills ni el worktree
  anti-slop.
- No se añaden dependencias runtime.

La campaña local no modifica el roadmap público. Una integración posterior de
código productivo requerirá una tarea/puente técnico y una decisión de roadmap
separados conforme a los gates vigentes.

## Evidencia y cierre

El cierre contiene:

- resumen en lenguaje no técnico del trabajo que dejó de hacerse;
- tabla F01–F08 con hecho, consumidor, experimento, resultado, decisión y commit;
- métricas `ROUND_BASE -> final` y, por separado, comparación acumulada contra
  `AUDIT_BASE`;
- corrección, aliasing/inmutabilidad, seguridad y validación Windows pendiente;
- saldo Git exacto separado en producto, pruebas/benchmarks y documentación;
- comandos y artefactos para revisión adversarial posterior con Astra High;
- checks PASS y también todo check `NO_EJECUTADO` o `BLOQUEADO` con su causa.

VAN-727 y el handoff vivo de Telemetry Core se actualizan y releen después de
cada worker o decisión material y al entregar. La tarea pasa a `En revisión`, no
a `Aceptada`, al finalizar la rama local.

## Criterios de aceptación

- F01–F08 tienen estado final razonado y evidencia reproducible.
- Toda mejora conservada demuestra equivalencia funcional y de ownership.
- Las mediciones base/candidato usan el mismo harness y configuración.
- La combinación final vuelve a medirse y pasa los gates aplicables.
- No se atribuyen E1/E2 a esta ronda ni se suman microbenchmarks como mejora
  global.
- No quedan modificaciones sin clasificar ni afirmaciones de runtime no
  ejecutado.
