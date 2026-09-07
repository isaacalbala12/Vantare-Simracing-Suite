# ISA-1020 — conservar cálculos de Carreras cuando el tiempo relevante no cambia

Primer corte productivo de la campaña #1015. Base nightly
`d6d0992f8dbc800ccb6d75f60fffdc7c3d561da2`, rama
`vantareapp/isa-1020-races-stable-clock`, worktree
`C:/tmp/vantare-isa1020-races-clock`. Sin depender del código de #1017.

## Reproducción y cambio

El reloj de columna ya avanza cada 30 s, pero `useClock` devolvía un Date nuevo
en cada render provocado por el reloj principal de 1 s. Ese objeto invalidaba
`followedRows` aunque su valor temporal no cambiase. Timeline también reconstruía
sus filas cada segundo porque su inicio de hora se devolvía como otro Date.

Dos regresiones con la página real en Happy DOM y las funciones originales
observadas fallan antes del arreglo: 10 llamadas redundantes a timelineRows en
10 ticks y 29 a upcomingRows en los 29 ticks previos a la actualización de columna.
No son datos de conducción ni mediciones de latencia Wails. Se reutiliza el
fixture de calendario existente; no se presenta como fuente real del simulador.

Cambio mínimo: conservar el Date de useClock hasta que cambie su tick/reloj
inyectado, y conservar el Date de inicio del Timeline por su valor en milisegundos.
Se sigue llamando a timelineStart para respetar hora local y cambios horarios;
no sustituirlo por división UTC. Las dependencias de calendario y filtro siguen
invalidando filas. No caché global, dependencia, store ni nueva arquitectura.

GREEN focal: 44 tests de página/modelo PASS. Entre esos ticks las llamadas
redundantes son cero; Timeline se recalcula al cambiar hora/filtro y columna a
los 30 s. El detalle sigue cambiando tras un segundo. Los tests existentes
protegen las cinco vistas, selección, seguimiento, zoom y datos vacíos.

## Límites y validación

Esto reduce trabajo redundante demostrado, no acredita porcentaje de CPU/RAM/GPU
ni navegación más rápida. Los perfiles previos de #1015 localizan recálculos de
Timeline, pero sus tiempos instrumentados no sustituyen A/B de este candidato.
No cambia el render visual ni cadencias, y no evita todo el render React de cada
segundo. No se toca HUD/Studio, renderers, transportes ni capacidades visuales.

Suite frontend completa: 3238/3238 tests, 415/415 archivos PASS, salida 0.
Happy DOM emitió AbortError de teardown; se conserva en el log y no cambió
el resultado final. Typecheck y build PASS (aviso existente de chunks >500 kB).
Roadmap regenerado: 23 tests digest y 21 contrato PASS. Lint completo PASS.
No Go ni contratos compartidos modificados: no se repite
Go local por este corte. No se ocultan fallos ajenos ni se elevan sus umbrales.

Manual pendiente en Wails: con el mismo calendario y LMU abierto, visitar las
cinco vistas, seguir una serie, cambiar categoría y cruzar la siguiente hora;
comprobar selección/horarios/filas y cuenta atrás a 1 s. Comparar antes/después
en condiciones de foco/Auto/datos equivalentes. LMU y Edge se mantienen abiertos;
no sumar su consumo ni descontar interferencia. Sin ahorro Wails aceptado aún.

Archivos: RacesOrbitPage.tsx, su test, este informe, handoff platform-commercial,
plan.md y roadmap.json generado. Sin archivos movidos ni cambios al checkout
principal. Logs RED/GREEN y checks conservados localmente en
`results/isa1020-checks`. Revisión del diff completo realizada: sin cambios de
cadencias, contratos, estilos ni dependencias. Entrega en PR draft; consultar
issue #1020 para SHA, push y CI remoto actualizados;
no merge, promoción o release.
