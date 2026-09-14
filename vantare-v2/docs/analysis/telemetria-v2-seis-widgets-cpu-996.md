# ISA-996 — seis widgets, Hub descargado y CPU

2026-09-06. Trabajo directo de main, sin subagentes. **Build final: 2,87947%
CPU media propia y 410,33 MiB privados con seis widgets.**
Objetivo alcanzado como media de tres corridas en este equipo/perfil/escena;
no como techo de cada pico o de cada corrida (la primera media fue3,00740%).
Este informe conserva la historia de los experimentos: los veredictos de E1–E10
son los de cada corte, no contradicen la evidencia posterior de E11.

## Resultado final reproducible (sin overrides)

Binario `bin/vantare-isa996-final.exe`, frontend normal minificado, licencia
embebida por el procedimiento autorizado; conserva CDP de diagnóstico, **no
es una release publicada ni acredita una build con tag production**.
SHA256 `441b1db7e723588243f4fab0e8b826a3a57ef80b2ada256cc8fb58e68d3fa680`.
La documentación/digest de cierre se actualiza después de congelar ese exe;
no se recompila durante las capturas ni se atribuye este SHA a futuras builds.

| Corrida final | CPU media máquina | MiB privados | p95 de muestras CPU | Reabrir Hub |
|---|---:|---:|---:|---:|
| 1 | 3,00740% | 402,41 | 3,68909% | 367,64ms |
| 2 | 2,82336% | 429,36 | 3,50029% | 315,20ms |
| 3 | 2,80766% | 399,21 | 3,57098% | 326,43ms |

Media entre corridas: **2,87947% /410,33MiB**. No se redondea la primera
corrida para presentarla como inferior a3. Máximo de muestra observado4,12457%;
estos son intervalos del banco, no medición de todos los picos instantáneos.
Cada corrida: 30s calentamiento, 60s de CPU, 26 muestras; seis widgets vivos
al inicio y al final, secuencia V2 progresiva, 54 coches, licencia autenticada,
exe/dist estables, Hub reabierto y cierre limpio. Prueba previa rAF120 en la
primera; no se reducen Hz ni calidad para alcanzar la cifra. CPU incluye todos
los procesos propios y auxiliares, incluido renderer-unassigned; no incluye
el juego y no se resta un baseline para reducir artificialmente el total.

Crudos locales (no se publica identidad de cuenta en este documento):

- `C:/tmp/isa996-final-default-1/hubmin-20260906-043454.csv`
- `C:/tmp/isa996-final-default-2/hubmin-20260906-043649.csv`
- `C:/tmp/isa996-final-default-3/hubmin-20260906-043843.csv`

En cada carpeta: JSON inicial/final de V2 y widgets, reapertura, licencia,
procesos, logs y CSV. Agregación independiente:
`C:/tmp/isa996-summarize-final.ps1`; lanzador de las tres:
`C:/tmp/isa996-final-default-repeat.ps1` (verifica ausencia real de GOGC,
GOMAXPROCS y overrides del experimento). No profiler ni builds/tests durante
los intervalos. El lint de confirmación acabó antes del muestreo de la primera
corrida de control; las capturas default se hicieron después de todos los gates.

Los tres controles con **el mismo exe** y GOGC vacío/GC100 dieron3,22517 /
3,33010 /3,24051%, media3,26526% /389,91MiB. GC300 reduce0,38579 puntos CPU
con20,41MiB adicionales en esta serie; orden100×3→300×3, no aleatorizado.
La evidencia exploratoria intercalada E11 anterior se conserva abajo. La
referencia inicial del conjunto estaba alrededor de5,8%; no se presenta su
diferencia como un A/B final de una sola variable con frontend idéntico.

### Qué queda conservado

- Hub minimizado descargable aunque el HUD siga en L1, sujeto a los guardas
  de borradores y con reapertura. No se destruye por estar visible.
- Una sola serialización de publicación y sin copia redundante tras Marshal.
- Engineer publica cambios reales, no dos estados idénticos por observación;
  observaciones, alertas, audio y snapshot inicial intactos.
- Socket local persistente por ventana: mismo pull/ACK/replay y validadores
  V2. HTTP permanece como control explícito, sin conmutación silenciosa.
- GC300 por defecto si no existe GOGC explícito; no cambia GOMAXPROCS/GOMEMLIMIT.

### Gates finales y límites

- `go test ./...` PASS, exit0 (`C:/tmp/isa996-final-go-confirm.log`).
- Race detector focal de socket/GC/Hub PASS, exit0
  (`C:/tmp/isa996-final-race.log`); no se ejecutó toda la suite con `-race`.
- Frontend completo:408 archivos,3169 tests PASS, exit0; después se añadió
  una regresión de cierre de socket y sus16 focales PASS. No se presenta
  esa última prueba como una segunda ejecución de toda la suite.
- `pnpm --dir frontend lint` PASS, exit0; typecheck incorporado en build
  (`tsc -b && vite build`) PASS. Go build configurado PASS.
- Banco Node completo:45/45 PASS (`C:/tmp/isa996-final-bank-tests.log`).
- Tras actualizar el roadmap de cierre:42/42 pruebas de sus dos archivos PASS;
  digest regenerado y `--check` sin cambios, `git diff --check` PASS.
- HappyDOM emitió AbortError en teardown con resumen verde/exit0; build avisa
  de chunk heredado mayor de500kB. No se ocultan ambos avisos.
- Revisión manual del diff: identidad inyectada por Wails, origen/host/token,
  límite/timing, cancelación, reconexión y cierre; misma autoridad V2, sin
  nuevos datos, fallbacks de telemetría ni dependencias/versiones. No equivale
  a revisión independiente de otro agente (Isaac pidió trabajo directo).
- No pruebas de conducción/vueltas/Delta, comparación A/B contra HUD LMU,
  catálogo visual completo, otros PCs, DPI, ni certificación de memoria larga.
  No se acredita p95 CPU inferior a3 ni consumo instantáneo constante.

Verificación manual: usar el exe y perfil fijos indicados y el comando del
lanzador, sin overrides explícitos ni procesos competidores. Revisar seis
widgets y datos vivos, minimizar/reabrir el Hub, comparar crudos sumando los
roles propios por muestra. No usar una ventana vacía como supuesto ahorro.
Las capturas terminaron y el PC se liberó a ISA-1000; LMU quedó abierto.

### Archivos y estado de entrega

Producto: `cmd/vantare/main.go`, nuevos `overlay_socket.go` y `runtime_gc.go`;
`internal/app/telemetry_core_runtime.go`, `internal/app/telemetrytransport/publisher.go`,
`internal/engineer/service/engineer_service.go`; `frontend/src/telemetry-transport/overlay-wails-pull.ts`
y nuevo `overlay-socket-pull.ts`.

Pruebas: `cmd/vantare/main_test.go`, `telemetry_lifecycle_harness_test.go`, nuevos
`overlay_socket_test.go`/`runtime_gc_test.go`; `internal/app/telemetrytransport/publisher_test.go`,
nuevos `internal/app/telemetry_overlay_publication_test.go`,
`internal/engineer/service/status_dedup_test.go` y `overlay-socket-pull.test.ts`.
Banco: `scripts/bench/build-measurement.ps1`, `huella.ps1`, `huella-cdp.mjs`,
`huella-procesos.mjs` y tests `huella-lifecycle.test.mjs`/`huella-procesos.test.mjs`;
nuevo perfil `testdata/bench/huella-seis-l1.json`.
Docs: este informe, el de atribución, ADR0094, maestroV2, handoff telemetry-core,
plan.md y roadmap.json generado. No se mueven ni borran archivos del usuario.

Rama `vantareapp/isa-996-cierre-rendimiento`; HEAD
`1c835bc031df17d2b33c0ab6a95e474e80404358` más diff local, base común local
con origin/nightly `659b2c57dc2c7fc75962cc3c8e425ed1289266ec`.
**Sin commit, push, PR nuevo, CI remota, integración, promoción o release de
este corte.** Sólo documentación/estado en ISA-996 y coordinación del PC como
acciones externas. La aceptación/integración sigue separada del resultado local.

## Condiciones y artefactos

Worktree `C:/tmp/vantare-isa996-performance/vantare-v2`, rama
`vantareapp/isa-996-cierre-rendimiento`, HEAD `1c835bc0` más diff local.
No commit, push, PR, CI remota, merge, promoción ni release de estos cambios.

Ryzen 7 3700X, 16 procesadores lógicos; LMU Practice, 54 vehículos observados
por diagnóstico V2, jugador parado. Sin conducir ni cambiar el HUD de LMU.
CPU es porcentaje de máquina: suma por muestra de procesos propios, incluyendo
auxiliares descendientes. RAM es suma de private bytes, no working set.
Las cifras de cada corrida son medias aritméticas de sus 26 muestras.

Perfil fijo `testdata/bench/huella-seis-l1.json`, calidad L1: Standings Redline,
Relative Redline Mirror, Pedals Redline, Track Map Endurance Outline,
Fuel Strategy Original y Track Weather Original. Estos dos últimos no tienen
el renderer Endurance solicitado inicialmente: se comunicó la selección
provisional antes de repetir. Se comprobaron seis renderers sin diagnóstico
de variante. No equivale a aceptación visual humana ni a seis Redline.
SHA256 perfil: `0243fd8bbebd64b6fb35af0f4bfec34b3909ec925d8784898ad3658db0276908`.

Ejecutables locales en `bin/`, licencia configurada, activa y autenticada:

| Variante | Archivo | SHA256 |
|---|---|---|
| Referencia | vantare-isa996-measurement.exe | 329b3f6705282415e1c4dcf95c83b9c9b5b5a7b4c5fa5dd430862f0833541ad6 |
| E1 | vantare-isa996-e1.exe | 2177db069b7ea0afed2ab5bff58dda7911b3a87ec0fe5e984767f92edef61bf2 |
| E1+E2 | vantare-isa996-e2.exe | d1fddbf649633d84a1be8b326ade971da13f66f8349ed2fc4fd07e73f982e469 |

El código frontend no cambia entre la referencia `db40f76e` y HEAD. E1/E2
usan el mismo dist `2072b38e26221c9ae99c4cf4e2132a314cb8a3fcfadf906db52c2e083bdcf8c3`.
La referencia reutiliza una build anterior: el hash de dist que calcula el
banco describe el directorio local, no verifica el dist embebido en un exe
anterior. No afirmar equivalencia byte a byte de ese dist ni A/A perfecto.

## E1 — descargar el Hub sin bajar calidad del HUD

Se reutiliza `HubLifecycle`, no se introduce otro controlador. Cuando el HUD
está activo, minimizar el Hub permite descargarlo también en L1/L2, manteniendo
las guardas de borradores y la recreación. El Hub visible no se cierra a la
fuerza; ni la política del HUD ni sus cadencias se modifican.

Tres parejas alternas, cada condición 30 s de calentamiento + 60 s medidos,
sin builds/tests/tracing simultáneos. Crudos bajo `C:/tmp/isa996-e1-steady-*`:

| Pareja | CSV referencia | CPU % / MiB | CSV E1 | CPU % / MiB |
|---|---|---|---|---|
| 1 | measurement-1/hubmin-20260906-014214.csv | 5,748 / 466,92 | e1-1/hubmin-20260906-014414.csv | 5,514 / 412,46 |
| 2 | measurement-2/hubmin-20260906-014610.csv | 5,854 / 465,94 | e1-2/hubmin-20260906-014809.csv | 5,184 / 434,13 |
| 3 | measurement-3/hubmin-20260906-015004.csv | 5,800 / 461,18 | e1-3/hubmin-20260906-015203.csv | 5,240 / 411,54 |
| Media | | **5,801 / 464,68** | | **5,313 / 419,38** |

Reducción observada ~0,488 puntos CPU y 45,3 MiB. Tres diferencias concordantes,
no garantía universal ni prueba de rendimiento óptimo. Todos los cierres fueron
limpios. CDP comprobó ausencia del target Hub tras minimizar en E1 y el banco
reabrió el Hub; la prueba corta inicial registró ~350 ms de reapertura.

## Correcciones del banco (no son mejoras del producto)

- Incluye PresentMon/conhost propios por descendencia; no suma el PresentMon
  permanente de Radeon. Los renderers sin atribución fina siguen etiquetados
  `renderer-unassigned`: cuentan en total, no se adjudican arbitrariamente.
- La CPU ahora usa reloj monotónico por PID después de leer contadores GPU.
  Antes, el intervalo terminaba antes que la lectura CPU y deformaba muestras.
- Calentamiento explícito con `-Calentamiento 30`. Sin quitar muestras malas
  a posteriori. Las pruebas iniciales `isa996-e1-before` (dos variantes inválidas)
  y `isa996-e1-valid-before/after` (sin esta corrección) no acreditan mejora.

## E2 — eliminar una copia redundante

`publisherPayload` ya obtiene un buffer propio de `json.Marshal`; se devuelve
ese buffer validado en vez de clonarlo otra vez. No se elimina JSON validation,
escaping, límite de bytes ni copias de protección hacia los consumidores.

Microbenchmark con fixture wire existente de 44 coches, **generada**, no LMU:
seis repeticiones de 500 ms, antes/después. 2 → 1 alloc/op y ~54,7 → 27,3 KB/op.
Crudos `C:/tmp/isa996-e2-before.txt` y `C:/tmp/isa996-e2-after.txt`.
La prueba de independencia de bytes pasa antes y después (protege el refactor).

Una corrida exploratoria E1+E2, mismo perfil y calentamiento:
`C:/tmp/isa996-e2-steady-1/hubmin-20260906-015640.csv`:
**5,348% CPU / 401,54 MiB**, cierre limpio. N=1: no acredita una ganancia
de CPU o RAM total frente a E1; sí persiste el ahorro de asignación aislado.
No se presenta como paso que haya acercado de forma demostrada al 3%.

## Checks y archivos históricos de E1/E2

- `go test ./...`: PASS en E1 y E2; logs `C:/tmp/isa996-e1-go-tests.log`
  y `C:/tmp/isa996-e2-go-tests.log`.
- Banco Node: 37/37 PASS (`C:/tmp/isa996-bank-tests.log`), incluyendo prueba
  ejecutable PowerShell de intervalos CPU y procesos nuevos.
- Builds frontend + Go E1/E2: PASS, aviso heredado de tamaño de chunks.
- `gofmt`, digest `--check` y `git diff --check`: PASS.
- Frontend completo: 3164/3165 PASS; falla el contrato público de roadmap sin
  porcentajes. Se retiró el objetivo numérico del texto público nuevo y se
  detectó además un `26%` preexistente en HEAD. El dato sigue en los informes,
  pero el roadmap lo remite al informe. Tras regenerar, las 12 pruebas de
  RoadmapOrbitPage PASS (`C:/tmp/isa996-roadmap-final.log`). No se repitió la
  suite completa después de esta última corrección exclusivamente documental.
  Logs completos `C:/tmp/isa996-e1-e2-frontend-tests.log` y
  `C:/tmp/isa996-e1-e2-frontend-tests-final.log`: no presentarlos como verdes.
- Sin prueba de conducción ni aceptación visual completa.

Cambios productivos: `cmd/vantare/main.go`, `internal/app/telemetrytransport/publisher.go`.
Regresiones: sus respectivos `main_test.go` y `publisher_test.go`.
Banco: `scripts/bench/huella.ps1`, `huella-procesos.mjs`, sus pruebas y
`huella-lifecycle.test.mjs`; perfil `testdata/bench/huella-seis-l1.json`.
Documentación: este informe, informe de atribución previo, maestro, handoff,
roadmap manual y digest generado.

## E3 ejecutado y descartado: transporte nativo

Tres exploraciones de 60 s tras 30 s de calentamiento, 26 muestras propias por
corrida, seis widgets y 54 coches reales; licencia y cierre limpio confirmados:

| Camino | CPU total propia media | RAM privada media |
|---|---:|---:|
| E3 HTTP control | 5,607% | 399,56 MiB |
| E3 nativo, objeto JS | 5,117% | 798,39 MiB |
| E3b nativo, JSON como string | 5,119% | 894,81 MiB |

N=1 por variante: exploratorio, no ahorro general estadísticamente acreditado.
La regresión de memoria basta para NO conservar el experimento. No prueba
que toda mensajería nativa sea peor; esta implementación usa ExecJS porque
Wails no expone PostWebMessage por su API pública de ventana instalada.
La causa exacta del crecimiento (compilación/retención) sigue siendo hipótesis.
E3 se retiró del código productivo y de sus tests; fuente recuperable en
`C:/tmp/isa996-e3-discarded/`, ejecutables y crudos preservados.

Crudos: `C:/tmp/isa996-e3-http-1/hubmin-20260906-023500.csv`,
`C:/tmp/isa996-e3-native-1/hubmin-20260906-023242.csv`,
`C:/tmp/isa996-e3b-native-1/hubmin-20260906-023925.csv`.
E3 SHA256 `a37753b6e2e692267bdde516b2bf6d66ea5e09e7191b0e575c3c032da1b6646c`;
E3b `503c3828e53c556386332743e7619b705c0732a5fc9fa0e0b0a01bc2157d0c15`.
E3 HTTP/nativo comparten ejecutable. Roles renderer-unassigned no se reclasifican
sin evidencia; sí se incluyen en la suma total. Excluir filas role=game al
agrupar CPU/RAM por timestamp (sus 4200 filas son frametimes, no CPU propia).

### Implementación experimental retirada

Isaac aprueba el experimento el 2026-09-06. La build E3 permite comparar el
camino HTTP habitual con `VANTARE_OVERLAY_NATIVE_PULL=1`, que añade un selector
explícito a la URL del HUD. No cambia el transporte de OBS ni las cadencias.
El adaptador usa RawMessageHandler y responde sólo a la ventana emisora con
ExecJS; limita petición a 1024 bytes, valida origen local/top y sesión/ACK.
El protocolo de entrega sigue siendo OverlayPullTransport. No hay dependencias.
Tests incluyen timeout, correlación, replay, cierre sin datos, origen no fiable
y petición posterior a shutdown (RED reproducido, corregido a GREEN).
Go completo, typecheck/build y frontend 3168 tests pasaron antes de descartarlo.

## E6/E7: transporte loopback y aislamiento de pintura (descartados)

E6 mantuvo pull/ACK y emisor autenticado por ventana sobre HTTP 127.0.0.1.
Una pareja, misma build `77f73c95a084eb1dc4587f73af303dae27981069257aee0835081cb6505d567f`:
loopback 5,9422% CPU /423,48 MiB; Wails 5,3692% /397,67 MiB. Se retiró
el experimento por no mejorar; fuente recuperable en `C:/tmp/isa996-e6-discarded`.
Crudos en `C:/tmp/isa996-e6-loopback-1` y `C:/tmp/isa996-e6-wails-1`.

E7 puso opacity:0 temporalmente sobre la superficie real, manteniendo seis
widgets montados y actualizándose. 5,0422% /390,93 MiB; es atribución de
pintura, NO ahorro de producto. El banco marca diagnostic-hidden-paint y
publishable=false. Crudo `C:/tmp/isa996-e7-no-paint`; la app se cerró al terminar.

## E8: estado del ingeniero por cambio, no por observación

Diagnóstico real: 639 `engineer:status` y 639 `engineer:stream` en diez
segundos, sólo un estado diferente. `ConsumeObservation` emitía ambos por
observación aunque no cambiase el estado del ingeniero. Se conserva la
observación completa y se deduplica sólo la publicación idéntica, comparando
todos los campos de EngineerStatus más Active y manteniendo una copia privada.
Snapshots iniciales, avisos, audio, transiciones y orden siguen funcionando.
TDD RED (64 duplicados), GREEN y suite Engineer PASS; build E8 y log Go completo
sin fallos. Control temporal `VANTARE_BENCH_REPEAT_ENGINEER_STATUS=1` repite el
comportamiento anterior con la misma build.

Primera pareja visible, N=1 exploratorio por condición, 30s calentamiento y
60s medida: **5,21345% /413,88 MiB -> 4,20680% /409,16 MiB**. Seis widgets,
telemetría live54, reapertura Hub y cierres limpios. SHA E8
`7a7c15ee8ac34c7790dda9e8304642c9146b12b0ebdab5cc3759fe57f5038778`.
Crudos `C:/tmp/isa996-e8-repeat-1/hubmin-20260906-034406.csv` y
`C:/tmp/isa996-e8-dedup-1/hubmin-20260906-034143.csv`.
NO acredita todavía N3 ni objetivo <3%.

Diagnóstico separado posterior con deduplicación: cero eventos de estado
del ingeniero durante diez segundos estables y la secuencia V2 sigue avanzando
(`C:/tmp/isa996-e8-dedup-event-counts.json`). Métricas renderer 15s: 45,27 pulls/s,
TaskDuration 2,794s, ScriptDuration 0,992s, Layout 0,0148s y estilos 0,0212s;
rAF p50 8,3ms, sin long tasks. No sumar tiempos incluidos unos en otros ni usar
la corrida con profiler como ahorro publicable. Restan Go y trabajo nativo.

## E9/E10: conexión persistente y paralelismo

E9 reutiliza el mismo cliente de pull/ACK, sin cambiar los delays, sobre un
socket local persistente. Biblioteca `github.com/coder/websocket` ya presente
en go.mod; sin versiones ni dependencias nuevas. Bootstrap sólo por Wails,
credencial efímera por ventana, origen y host exactos, bind127.0.0.1, timeout
y límites de mensaje, cierre de ventana revoca socket/consumidor. Pruebas de
replay, reconexión, rutas ajenas, emisor falso, tamaño, cancelación y timeout.

Primera pareja N1, misma build
`d5933545c1b1b5770a52da8dd5cb02ec1943e8f4823813ba7a7ee27ec100352a`:
HTTP **4,41704% /408,83 MiB**; socket **3,20974% /390,69 MiB**.
Crudos `C:/tmp/isa996-e9-http-1` y `C:/tmp/isa996-e9-socket-1`.
Browser CPU cae de ~0,54 a ~0,03 puntos respecto a E8. No demuestra <3%.
El banco añade prueba fuera del intervalo de muestreo: seis widgets y secuencia
V2 progresiva/live al terminar; marca no publicable si no se acredita. Primera
socket es anterior a este endurecimiento; las siguientes deben conservarlo.

E10 (`GOMAXPROCS=4`, sin cambiar código/cadencias) da 3,31723% /383,10 MiB;
Go host ~1,438%, sin mejora sobre ~1,43% de E9. **Descartado**. Crudo
`C:/tmp/isa996-e10-p4-1`, prueba final live/seis y cierre limpio. E11 prueba
GOGC=300 con paralelismo normal: hipótesis de menos CPU de GC a cambio de
RAM. Su resultado posterior queda en E11, debajo.

## E11: GC300, resultado repetido y candidato local

Con el mismo exe E9 (SHA `d5933545c1b1b5770a52da8dd5cb02ec1943e8f4823813ba7a7ee27ec100352a`),
sin limitar GOMAXPROCS ni cambiar cadencias/visuales, tres capturas GC300:

| Corrida | CPU propia máquina | MiB privados | CSV, bajo C:/tmp/ |
|---|---:|---:|---|
| E11-1 | 2,91167 | 409,42 | isa996-e11-gc300-1/hubmin-20260906-040622.csv |
| E11-2 | 2,75480 | 408,26 | isa996-e11-gc300-2/hubmin-20260906-041141.csv |
| E11-3 | 2,69391 | 402,96 | isa996-e11-gc300-3/hubmin-20260906-041335.csv |

Media entre corridas: **2,78679% /406,88 MiB**. Cada una conserva seis widgets
live al final, licencia autenticada, 54 coches, hash estable y reapertura/cierre
limpios. Calentamiento30s, muestreo60s; sin profiler/CDP durante muestreo.
Las pruebas de estado por CDP son previas y posteriores, no prueba de paridad
visual completa ni de todas las transiciones de carrera.

Controles socket/GC100: 3,20974 /3,55683 /3,15891% y 390,69 /388,06 /392,70 MiB
(`C:/tmp/isa996-e9-socket-{1,2,3}`). La primera es anterior a la prueba final de
liveness añadida al banco. El último bloque se ordenó100→300→300→100; no es un
ensayo aleatorizado ni acredita por sí solo causalidad para todo escenario.
El ajuste ahorra aproximadamente0,52 puntos CPU a cambio de16,4MiB respecto a
la media de esos controles. Conserva GC activo y respeta GOGC/GOMEMLIMIT del
usuario; no cachea datos sin límite. Detalle arquitectónico: ADR0094.

Se retira el control temporal E8 de emisiones repetidas. El candidato configura
socket por defecto y GC300 cuando no hay GOGC explícito; HTTP sigue disponible
como control explícito `VANTARE_OVERLAY_SOCKET_PULL=0`, sin fallback silencioso.
El binario final se midió sin estas variables de prueba para acreditar que la
configuración viene incorporada; resultados al principio de este informe.
No hay commit, push ni integración.

Incidencia del lanzador final (no se descartan los crudos): en PowerShell/.NET
de esta máquina, `SetEnvironmentVariable('GOGC', $null, 'Process')` conserva una
entrada GOGC vacía. `os.LookupEnv` la considera una configuración explícita;
la app la respeta y Go usa GC100. Las corridas `C:/tmp/isa996-final-{1,2,3}`
son por tanto controles GC100, **no validación del valor predeterminado**.
Reproducción independiente: `Test-Path Env:GOGC` da True después de ese setter
y también en el proceso hijo. `Remove-Item -LiteralPath Env:GOGC` sí elimina
la entrada (False también en el hijo). El lanzador corregido
`C:/tmp/isa996-final-default-repeat.ps1` exige ausencia de overrides antes de
medir. No se cambió el producto para acomodar el banco.

## E4: una sola serialización de la publicación

`publishOverlayV2` pasaba a PublishSnapshot un JSON que éste volvía a serializar.
Ahora pasa el UpdateV2 tipado directamente; mantiene validación, límite y copias
de consumidor. Los bytes observados provienen del contador de publicaciones
antes/después, bajo el mismo lock que serializa todos los snapshots del runtime.
El test compara revisión progresiva y el histograma contra bytes reales del wire.

Benchmark nuevo con consumidor real activo, entrada generada de 64 coches
(NO LMU): N6 de 500 ms. Mediana 684.633,5 -> 478.900,5 ns/op; 369 -> 367
allocs/op, ~335 -> 305 KB/op. Variación apreciable; no es CPU global ni FPS.
Logs `C:/tmp/isa996-e4-before.log` y `C:/tmp/isa996-e4-after.log`.
Go completo y build E4 PASS. Primera corrida física: ~5,03% CPU /400,73 MiB.
Crudo `C:/tmp/isa996-e4-http-1/hubmin-20260906-024718.csv`.
N=1 exploratorio, no mejora estadística ni objetivo <3% acreditados.

## E5 exploratorio: JSON textual por el mismo HTTP

El decoder admite ya JSON textual con la misma validación y límite. Se prueba
evitar stringify de objetos en frontend enviando el payload como string desde
el servicio HTTP. No cambia ACK, sesión, latest-wins ni frecuencia.
Test de contrato RED con objeto, GREEN con texto; Go completo y 20 tests
frontend focales PASS. Primera corrida: **5,25676% CPU /419,10 MiB privados**,
26 muestras agregadas del árbol propio excluyendo juego. Cierre limpio.
No mejora frente a la primera E4; no se acepta como ahorro.
Se retira E5 del candidato: respuesta JSON original restaurada y protegida
por el test. Binarios y capturas se conservan; no se borraron datos del usuario.
Crudo `C:/tmp/isa996-e5-http-1/hubmin-20260906-025934.csv`.
Exe SHA256 `080153375dce455741150f3002a4f658f795d22aa1ddd7c6a82d00942dfc534e`.
Se añade build frontend legible opt-in sólo para atribución, nunca para A/B
de producción. Sus 22 tests del banco/procesos pasan.
Perfil legible `C:/tmp/isa996-e5-readable-js.json` y `.cpuprofile`: 45,87
pulls/s; cloneJSONInput 474,747 ms/30 s, fetch 393,437 ms, encode 184,086 ms;
layout 29,861 ms y estilos 43,115 ms. La build no minificada y el profiler
impiden usar esta captura como ahorro total. No se identifica todo el trabajo
nativo con esta herramienta ni se demuestra que Wails esté saturado.

Próximo experimento propuesto, NO implementado: mismo pull/ACK sobre HTTP
loopback real para aislar el puente HTTP virtual de Wails. Necesita aprobación
arquitectónica y conservar autenticidad del emisor, sesión y cierre; el
servidor OBS existente publica SSE, no es sustituto directo equivalente.

### Motivación previa a la aprobación

La atribución anterior localiza el coste en Go y WebView/transporte; no demuestra
qué fracción exacta del tramo nativo es eliminable. Los microcambios anteriores
no explican ni eliminan los ~2,3 puntos todavía necesarios.

Propuesta a Isaac: experimento reversible para sustituir sólo el HTTP virtual
Wails del pull por mensajería dirigida a la ventana. Mantener el mismo
OverlayPullTransport, ACK, sesión, latest-wins, validación, límites, Hz y
renderer; nunca broadcast global ni una segunda autoridad de telemetría.
Sin dependencias nuevas ni migración Rust/Qt. Revisar autenticidad del emisor,
cierre, errores y presión antes de probar. Requiere aprobación arquitectónica;
su ahorro es una hipótesis por verificar, no una promesa de alcanzar el 3%.

Viabilidad verificada en la dependencia instalada Wails alpha.98-tui:
`application_options.go:96` ofrece `RawMessageHandler(window, message, originInfo)`;
el runtime `system.js:19` usa `chrome.webview.postMessage` en Windows y
`WebviewWindow.ExecJS` permite contestar a una ventana concreta. No se propone
`Events.Emit` como sustituto: su caller normal sigue usando HTTP fetch.
