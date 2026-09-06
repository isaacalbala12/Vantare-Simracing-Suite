# ISA-996: siguiente ronda CPU, RAM y GPU

2026-09-06. Worktree `C:/tmp/vantare-isa996-performance`, rama
`vantareapp/isa-996-cierre-rendimiento`, HEAD `1c835bc0` con cambios locales.
Objetivo aprobado: CPU propia media inferior al 2% con los mismos seis widgets
L1, minimizando RAM/GPU sin reducir calidad, cadencias ni señales. No está
alcanzado al abrir esta ronda. Sin subagentes ni promoción.

## Referencia y método

Referencia previa: N3 2,87947% y410,33MiB privados; véase
[informe anterior](telemetria-v2-seis-widgets-cpu-996.md). Misma escena LMU
Practice54, jugador estacionario. CPU máquina con16 procesadores lógicos,
árbol completo propio (incluye renderer-unassigned). Muestras GPU inválidas
excluidas, no tratadas como cero. El contador GPU agregado no equivale al
porcentaje de un motor concreto del Administrador de tareas. No hay prueba
de superioridad frente al HUD LMU.

## E12 — una sola lectura del JSON entrante

Atribución aparte de aceptación: `C:/tmp/isa996-e12-attribution` conserva la
captura minificada y `C:/tmp/isa996-e12-js.cpuprofile` su perfil crudo. El
resumidor rechaza atribuir nombres minificados; no se oculta el error. Build
legible diagnóstica SHA244aa4fbc4d278796d72de49553d8d3cd7bb99cde8027a1dbbde0d0e9511119c,
crudos `C:/tmp/isa996-e12-readable`, JS `...e12-readable-js.json`, Go
`...e12-readable-cpu.pprof`. En30s: cloneJSONInput621ms, socket JSON331ms,
TextEncoder170ms. Go registra esperas cgocall (~58s) que NO son CPU activa;
no se atribuyen como cuello de botella. Entre trabajo Go aparecen marshal,
memmove, proyección Engineer y CachedProjector.

El cambio parsea el sobre una vez y valida/congela cada update V2 con las
mismas funciones. Un WeakMap privado reconoce exclusivamente esos objetos
ya validados al ingerir; no retiene frames históricos ni es estado de producto.
Objetos de llamadores siguen con copia defensiva. El límite de72KiB por
update permanece: si el sobre completo cabe, cada update también; sobres
mayores conservan el chequeo exacto por update. No varían Core, ACK, reglas
de orden, cadencia, identidad, datos de simulador o presentación.

TDD: `C:/tmp/isa996-e12-red.log` reproduce dos fallos; posteriormente30 tests
focales PASS (`...e12-green.log`), incluyendo propiedad, inmutabilidad,
contrato estricto,72KiB exactos, exceso y UTF-8. Build normal E12 SHA
f31efe02039d6245e7a15857c89ce71ac45fb60f2a72cc6f4dd74c8a08588f5a.
Primera captura `C:/tmp/isa996-e12-1`: CPU2,67007%, RAM400,38MiB, seis
widgets vivos y cierre limpio. N1 exploratorio; no acredita mejora repetida
ni el objetivo inferior a2. Control intercalado anterior (exe441b1db7) en
`C:/tmp/isa996-e12-control-1`: 2,81571% y425,36MiB, cierre limpio. N1 no
justifica todavía aceptar el ahorro total. Se conserva también el tiempo
de parseo/validación hecho antes del store; los diagnósticos no lo omiten
(conservador: incluye coste de sobre entero por update). Error de contrato
preservado en socket. Regresiones RED/GREEN específicas en
`C:/tmp/isa996-e12-contract-{red,green}.log` y
`C:/tmp/isa996-e12-timing-{red,green}.log`;32 focales pasan al final.

## E13 — preparar la geometría estática del mapa una vez

El asset de circuito y viewport son inmutables: proyección y SVG se preparan
una vez; posiciones de coches continúan cambiando con cada frame. Dos tests
verifican geometría exacta de todos los assets y movimiento de marcadores,
sin reconstruir el trazado. RED/GREEN en `C:/tmp/isa996-e13-{red,green}.log`.
25 tests de geometría/modelo PASS. Build normal5b0be396.

Primera corrida `C:/tmp/isa996-e13-1`: 2,84516% /397,55MiB; GPU agregada
0,18232%,26 muestras válidas,101,33MiB dedicados. Seis widgets vivos y cierre
limpio. **No confirma ahorro global de CPU frente a E12.** Conservación
condicionada a repetir; no confundir eliminación de trabajo aislado con
mejora total medida.

## E14 — lectura sin copias redundantes para Engineer

Tres operaciones reutilizan ownership existente: `ProjectorV1.Project` lee
Core con Peek y transfiere sus colecciones recién creadas con NewSnapshotOwned;
el adaptador in-process lee esa proyección privada con Peek y crea su salida.
ProjectV1/Value externos mantienen copia defensiva. No se cambia autoridad,
datos, capacidad del ingeniero ni frecuencia; V1 en este nombre es versión
de la proyección Engineer, no reintroducción de TelemetrySnapshot legado.

La regresión reproduce la copia de Core y protege ausencia de alias/mutación
(`C:/tmp/isa996-e14-red.log`); paquete Engineer y envelope PASS en green.
Microbenchmark con fixture de dos coches, NO evidencia LMU, seis repeticiones:
antes16,84–17,80µs/14.920B/13alloc; después14,38–14,67µs/6.808B/7alloc.
Crudos `C:/tmp/isa996-e14-bench-{before,after}.log`. Benchstat no disponible
en PATH; no se atribuye un p-value. Build normal61cd5e5f. Primera captura real
`C:/tmp/isa996-e14-1`: CPU2,60851%, RAM aproximadamente402,56MiB,
GPU0,18176%, seis widgets vivos/54 coches y cierre limpio. N1, no confirma
todavía ahorro repetido ni el objetivo inferior a2.

## Atribución de layout y recuperación de escena

Traza diagnóstica `C:/tmp/isa996-e14-trace-renderer.trace.json`: unas3.600
operaciones de layout en30s; raíces observadas en Standings. La prueba CSS
E15 (`C:/tmp/isa996-e15-css`) es **inválida**: source degraded, secuencia nula,
cero vehículos y sólo placeholders. El banco la marca no publicable; los
ceros de layout no prueban ahorro. Computer Use confirma la práctica a0:00;
se reinicia LMU mediante cierre normal. No se atribuye la causa del estado
degradado exclusivamente al cronómetro sin más evidencia.

La captura E14 mostró la última fila de Relative recortada por el perfil del
banco (alto380). Se amplía únicamente ese marco a480, conservando los seis
widgets y su contenido. Original recuperable en
`C:/tmp/isa996-six-l1-original.json`. Las nuevas comparaciones usarán el mismo
perfil corregido en ambos ejecutables; no se atribuirá su efecto a código.

E15 repetida tras reiniciar: la parrilla real es62, no54; no se mezcla con
la referencia previa. Diagnóstico separado de aceptación en
`C:/tmp/isa996-e15-css-62-diagnostic.json`: seis widgets, fuente live y secuencia
creciente antes/después de cada brazo. En10s normales TaskDuration1,673s,
repetición1,829s; quitar transición de Standings1,850s, Relative1,700s,
animación de cronómetro1,798s, contain1,893s. No demuestra mejora: no se
conserva ningún CSS experimental. Fue atribución con instrumentación,
no ahorro de CPU máquina. Captura `C:/tmp/isa996-e15-62-overlay.png` confirma
la última fila Relative visible con alto480. Fuel y Weather siguen usando
Original en este perfil; no se afirma que los seis sean Redline.

## E16 — ownership del replay sin copia intermedia

Perfil legible posterior a E14: SHAfa986da9, crudos en
`C:/tmp/isa996-e16-readable`. En30s JS: parseOverlayPullJSON500ms,
TextEncoder269ms, relativeRowArray123ms. Geometría estática ya no aparece
entre los primeros hotspots. Go muestra memmove530ms y appendCompact460ms
acumulados, además de esperas del SO: sus116,62s en cgocall NO son CPU
activa ni se atribuyen como ahorro. El perfil Go incluye arranque; no se
confunde con aceptación en caliente.

`OverlayPullTransport` ahora conserva los bytes propios de Replay en su
estado privado y copia únicamente la respuesta pública. Elimina una copia
intermedia y evita que una mutación del llamador altere el registro de datos
ya entregados. ACK, replay, latest-wins y límites no cambian. Test RED reproduce
la entrega espuria tras mutar respuesta; GREEN paquete completo y race.
Microbenchmark64KiB, seis repeticiones: antes137–149µs,301–304KB/8alloc;
después114–128µs,226–228KB/7alloc. Crudos
`C:/tmp/isa996-e16-{red,green,bench-before,bench-after}.log`.
No extrapolar este ahorro a CPU total.

Build normal candidata E16 SHA
92dbb6b08b91a20e35072e0e88a41782e4f3f9503e782c4ce742038c1e71147d.
Go completo PASS, race de transport/Engineer/service PASS. La suite frontend
primero falló5 tests de integración con mocks que sólo tenían json(); se
sustituyen por Response real, sin relajar asserts. Repetición final:
408 archivos /3177 tests PASS. Lint, typecheck, build,24 tests del banco,
digest y diff-check pasan. AbortError de teardown Happy DOM se conserva en
logs; resumen final y exit0 verifican la suite. Crudos
`C:/tmp/isa996-subdos-*test*.log`, `...lint.log`, `...typecheck.log`,
`...race.log`, `...roadmap.log` y `C:/tmp/isa996-e16-build.log`.

Aceptación nueva: A/B intercalado control/E16, N3 cada uno, misma parrilla62,
perfil Relative480,60s por corrida tras30s de calentamiento, sin perfiles CPU.
Lanzador `C:/tmp/isa996-subdos-matrix.ps1`; seis corridas terminadas con fuente
live/seis widgets/62 coches, SHA estable y cierre limpio. Agregación independiente
`C:/tmp/isa996-subdos-summarize.ps1`, resultado `C:/tmp/isa996-subdos-summary.json`.

| Variante N3 | CPU media máquina | RAM privada MiB | GPU agregada | VRAM MiB |
|---|---:|---:|---:|---:|
| Control441b1db7 | 3,43304% | 403,73 | 0,19254% | 101,66 |
| Candidata92dbb6b0 | 3,06185% | 393,47 | 0,18941% | 100,33 |

CPU por corrida: control3,31665/3,29975/3,68273; candidata3,06644/3,11858/
3,00052. El coeficiente de variación muestral del control6,30% supera el
umbral5%; candidata1,93%. Hay tendencia favorable, pero **no se acredita
un porcentaje estable de ahorro global**: no seleccionar ni retirar el tercer
control. RAM cambia unos10MiB, sin acreditación estadística independiente.
GPU similar, no mejora concluyente;78 timestamps válidos por variante.
El objetivo inferior a2 no se ha alcanzado. Estos62 coches/perfil480 NO se
comparan con los54 coches/perfil380 de la referencia2,87947 anterior.

Los cambios quedan locales y reversibles, no promovidos. Revisión personal
del diff mantiene ownership público, ACK/replay, límites y validación completa.
La lectura estática identifica el siguiente experimento posible: transportar
sólo secciones cambiadas y reconstruir un frame completo/atómico antes del
store. **Propuesta pendiente de autorización**, no implementada; necesita
contrato/ADR, bootstrap completo, reconexión, secuencias, borrados, frescura,
paridad, límites de memoria y rollback. No implica mover reglas de simulador
al frontend ni autoriza bajar datos/cadencias para alcanzar el número.

## Pendientes de cierre

Petición adicional de Isaac: comparar LMU con su HUD, LMU sin HUD y LMU sin
HUD con seis widgets Vantare. El orden inicial, después de optimizar, fue
sustituido por medir primero: la comparación exploratoria Full/Off está en
[informe HUD](lmu-hud-comparacion-996.md), no acredita ahorro causal y se
restauró Full. Isaac solicita ahora continuar optimizando. Operar Ajustes/HUD
con computer use y restaurar el ajuste. Medir juego, Vantare y total con
denominadores explícitos para porcentajes, RAM y VRAM también en MiB; misma
escena, calentamiento y capturas repetidas. No equiparar conjuntos de widgets
con distinta información visual ni dar por probada una ventaja sobre LMU.

Cerrar el ruido de la referencia antes de publicar ahorro estable; validar
el siguiente experimento sólo tras autorización. Actual ronda tiene gates
locales verdes y geometría revisada; no hay PR/CI/integración nueva.
No afirmar óptimo global ni declarar finalizado el plan por un promedio.

### Referencia al reanudar tras comparar HUD

2026-09-06 15:44: E16 SHA92dbb6b0, seis widgets L1, Relative480,
LMU Practice62 live/HUD Full. Banco60s+30s,26 timestamps: CPU máquina
2,80122%, memoria privada386,87MiB, GPU agregada0,23169% (26 válidos).
Go1,03726%; renderers1,28894% sin atribución individual de ventana,
GPU-process CPU0,32672%, utility0,12631%, browser0,00482%; resto auxiliares
incluidos en total. No usar sólo la suma de los dos primeros como coste total.
N1: no demuestra mejora estable frente al N3 anterior ni cumple<2.
Crudo `C:/tmp/isa996-resume-e16-2/hubmin-20260906-154202.csv`, prueba final
`...-overlay-end.json`:6 widgets,62 coches,live,sequence7105; SHA estable,
reapertura y cierre limpio. Agregación independiente por timestamp de todo
el árbol; ninguna fila marcada no publicable. Captura inicial abortada
por Edge Startup Boost sin ventana, no se midió ni se usó -Forzar.
No código productivo cambiado. El envío de secciones sigue siendo propuesta,
no mejora demostrada ni autorización inferida de esta reanudación.

## Entrega local y archivos

Esta ronda modifica store/pull JSON y tests de `frontend/src/telemetry-transport`,
modelo/tests `track-map-view-model-v2`, `engineer/{adapter,v1}.go` y sus tests
de ownership/fixtures, `telemetrytransport/overlay_pull.go` y tests. Se ajustan
los mocks HTTP en CompositeApp/StudioRoute, el perfil de banco, este informe,
plan maestro, handoff y roadmap/digest. `ownership_test.go` y este informe son
archivos nuevos dentro del conjunto local; se conservan los cambios E1–E11
previos. La lista completa actual está en `git status --short`; no hay borrados.

Rama `vantareapp/isa-996-cierre-rendimiento`, base659b2c57dc2c7fc75962cc3c8e425ed1289266ec,
HEAD1c835bc031df17d2b33c0ab6a95e474e80404358. Sin nuevo commit/push/PR/CI,
merge, promoción ni release. Issue996 y handoff reflejan el estado local.
Verificación manual: repetir el lanzador con directorios nuevos, los mismos
exe/SHA y seis widgets L1; inspeccionar última fila Relative, standings,
reapertura Hub y fuente viva. No validar latencia de vueltas conduciendo ni
contar placeholders como widgets funcionales.
