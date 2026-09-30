# ISA-1041 — evaluación del plan definitivo

2026-09-08. Base documental `286f99e8`, código previo `4ce96ded`.
Rama `vantareapp/isa-1041-orbit-final-evaluation`, worktree
`C:/tmp/vantare-isa1041`. Implementación y revisión personales, sin subagentes.

## Cambio

Orbit construye el reparto definitivo y lo somete al replay del solver con
carga inicial explícita. El replay histórico conserva el cálculo de carga
mínima para sus consumidores de solver/backtest. La consulta de consumos usa
el mismo balance y precisión de recursos del solver, sin nuevas fórmulas.

Se rechazan cargas insuficientes, excesos de capacidad, vueltas incompatibles
con VE y reservas incumplidas. Una carga indicada por el usuario no se eleva
ni se recorta silenciosamente. El combustible heredado de un stint anterior
se conserva; una edición que requiere retirarlo se rechaza.

Tiempo total, conducción, boxes, tiempos de stints y reserva proceden del
replay de la decisión final. Los pilotos con valores diferentes se evalúan con
su configuración efectiva, no con el consumo medio del reparto inicial. La
proyección original se conserva; si los valores son comunes se mantienen
directamente los escalares y su procedencia. Las configuraciones por piloto
son entradas de evaluación, no nuevas mediciones empíricas.

El resultado publica `optimality: not_proven`, conservado por el cliente y
visible en el análisis en ES/EN/PT/IT. Factibilidad y coste no prueban optimalidad.

## Regresiones y validación

- RED previo: carga 0,1 L para una vuelta de 1 L aceptada; reserva calculada
  con media de pilotos; pérdida de 12 s de degradación. Los tres casos fallaron
  antes del arreglo y pasan con evaluación final.
- RED previo para estado de optimalidad y aviso visible; GREEN posterior.
- Cobertura adicional: edición de vueltas que excede VE, fuente derivada con
  decimales de VE, carga inicial cero Fuel/VE, NaN y peso de combustible:
  llevar 2 L extra durante dos vueltas a 1 s/L añade exactamente 4 s.
- Golden compartido regenerado con el resultado Go y revisado. Mantiene
  reparto 12/32/32/32/31. Los tiempos ahora incluyen el coste de servicio de
  las tasas históricas `1e12`: diferencia menor de 1 ns; el assert absoluto
  usa ese límite, y la igualdad estructural con el JSON sigue siendo exacta.
  Los servicios corresponden a las cargas realmente mostradas.
- `go test ./...` PASS, repetido tras el último refactor local (log local
  `C:/tmp/vantare-isa1041-go-final.log`). Build, typecheck y lint PASS.
- Frontend completo: `pnpm --dir frontend run test --maxWorkers=2`, 415
  archivos / 3241 tests PASS, 360,05 s. Happy DOM emitió AbortError durante
  teardown; cierre exit 0 y resumen completo PASS. La primera invocación con
  doble separador fue rechazada por pnpm antes de ejecutar tests.

## Revisión personal y límites

Correctitud: lectura completa del adapter, replay, balance/reserva, perfiles,
parser y presentación cambiados; regresiones observables. Simplicidad: se
elimina el cálculo paralelo de tiempos y reservas de Orbit. La consulta de
recursos recoge el balance existente solo cuando se solicita; no añade
asignaciones por stint al recorrido normal de búsqueda.

Arquitectura: sigue siendo Go la autoridad; no hay motor alternativo,
dependencias, migración o escritura de datos. Seguridad: mismas validaciones
de entrada, sin I/O ni secretos nuevos. Rendimiento: se evalúa una decisión
final acotada después de la búsqueda; no se dispara otra búsqueda.

Este corte no corrige el horizonte de carrera por tiempo (#1042), la ventana
heurística de boxes, las etiquetas (#1043), reconciliación (#819), deadline
(#821) ni catálogo de referencias (#445). El gate #1038 sigue NO-GO para
nuevas secciones. No prueba precisión empírica, holdout, Wails o LMU.

Verificación manual pendiente en runtime: editar la carga inicial por debajo
del consumo; debe devolver inviabilidad. Con dos pilotos de consumos distintos,
verificar reserva del último. Con degradación configurada, comparar total y
stints. El análisis debe aclarar que no se ha demostrado el óptimo.

Sin merge, promoción, release, intervención en LMU ni modificación de DuckDB
originales. Commit local del corte; sin push, PR o CI remota en esta entrega.
