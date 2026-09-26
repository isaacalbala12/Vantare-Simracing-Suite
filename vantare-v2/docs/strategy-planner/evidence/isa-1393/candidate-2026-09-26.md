# T22 · candidato local con disponibilidad temporal

## Reconciliación con Nightly: runtime y bancos reales (2026-09-26)

Sobre el código `057d9e77` de `vantareapp/isa-1393-nightly-reconcile`, el
preparador canónico `prepare-runtime.ps1 -UsePublishedRuntime` instaló en el
`bin` ignorado el lector aprobado. La verificación antes y después del traslado
comprobó sus cinco miembros y el manifiesto SHA-256
`700201f90266ae6b829372d9989408c6b0efd86725a50980d46fc05adfc24869`;
el smoke informó DuckDB v1.5.5 en Windows amd64. No se ejecutó Wails ni LMU.

Con ese runtime, `go test -p 1 ./internal/app -run
'^TestRecordedStrategyRealDuckDB$' -count=1 -v` pasó dos veces con fuentes de
**preparación** de #1030, seleccionadas explícitamente, sin WAL y con SHA
comprobado antes y después. S201 Sebring GT3
(`8daf968e50e43bb351f0e5e1dfb27d6e991d21bf57610df28995dbcda7733dd9`)
→ S026 Monza (`08a1e626d7154becd493aa84addbf146cc7f0f229c8a7aa39664766813495538`):
98 canales, ocho vueltas utilizables, Fuel 3,120 L/vuelta y VE 4,281 puntos/vuelta;
29 vueltas, dos paradas y `optimality=proven` **dentro del evento supuesto**.
Paridad paginada/materializada, historial exacto, clasificación, familias,
restauración y reapertura PASS en 30,34 s.

S026 Monza Hypercar → S266 Algarve
(`6b912640e5b68da087fbe86ce70401101edbdc89cb89cb93df30c9ef396d9362`):
98 canales, 53 vueltas utilizables, Fuel 2,876 L/vuelta y VE 3,328 puntos/vuelta;
37 vueltas, una parada y `optimality=proven` **dentro del evento supuesto**.
Las mismas comprobaciones de revisión e identidad pasaron en 157,76 s y los
originales conservaron sus hashes. Estos bancos verifican el camino Go sobre
el candidato reconciliado; no son evaluación independiente del error real,
recorrido Wails ni acreditación E01–E08. El directorio LMU seguía sin nuevas
Race posteriores a agosto; T21 aún carece de holdout suficiente.

Rama `vantareapp/isa-1393-strategy-native-validation`, base anterior
`0bdac8d7`; se incorporaron en orden los commits de #1395 (`0665876b`) y
#1396 (`144880e7`). El candidato contiene el mismo contrato temporal en Go y
en la mesa recorded. No hay cambio de canal.

## Checks sobre el candidato

- `pnpm --dir frontend build`: PASS, 1156 módulos transformados.
- `go test ./...`: PASS tras generar `frontend/dist`; ningún paquete falló.
- Las ramas de origen ya habían pasado 76 tests frontend focales, suite completa
  de 493 archivos y 4325 tests (2 omitidos), typecheck, lint, i18n ES/EN/PT/IT
  y 44 tests de roadmap. Esos resultados corresponden al mismo stack de código
  anterior al cherry-pick.
- `CGO_ENABLED=0 wails3 build DEV=true`: PASS; esa receta genera
  `bin/vantare.exe` con canal `master`, por lo que no se usará para QA local.
- Una primera compilación manual con `-X main.buildChannel=localdev` omitió
  el tag `vantare_localdev`: **no activaba el acceso de desarrollo**. No se
  abrió y fue sustituida; el nombre/canal del binario no era prueba suficiente.
- `go test -tags vantare_localdev ./cmd/vantare` y
  `go test -tags production,vantare_localdev ./cmd/vantare`: PASS; producción
  desactiva el acceso local.
- `scripts/build-local-development.ps1`: PASS con frontend en modo localdev y
  `go build -tags vantare_localdev`; `go version -m` confirma el tag embebido.

El ejecutable localdev corregido, regenerado tras las correcciones frontend,
tiene **46.397.440 bytes**, SHA-256
`52EC466241C681F61F58BA745B6BBE7A4EBED35532F8AAF92FE09112B00A2ECE`.
No se abrió. El preflight de build por sí solo no certifica E01–E08, memoria
de resistencia ni precisión empírica; el banco Go posterior se detalla abajo.

Sin push, PR, CI remota, integración, promoción ni release.

## Cálculo con revisión LMU real y límite temporal

El banco Go opt-in `TestRecordedStrategyRealDuckDB` abrió una copia autorizada
de S266 Algarve (SHA-256
`6b912640e5b68da087fbe86ce70401101edbdc89cb89cb93df30c9ef396d9362`)
y una segunda fuente Monza para la verificación de identidad. No se usaron
las carreras reservadas por #1030. El parser informó 71 eventos, 70 resets,
66 vueltas completas y 70 fronteras válidas; la derivación paginada igualó
la materializada y Strategy mantuvo la referencia exacta después de guardar
otra revisión. La fuente proyectó ritmo seco **95,190 s** y Fuel **2,135
L/vuelta**, ambos válidos; VE en LMP2 quedó no aplicable.

Con reglas **supuestas para el test**, el mismo camino `CalculateOrbit`
produjo 38 vueltas, cero paradas y `optimality=proven` dentro del modelo.
Al repetirlo con el único piloto indisponible desde 0 hasta 7200 segundos,
rechazó el cálculo como inviable. La segunda petición reutiliza exactamente
la referencia real, los recursos y el evento anterior; sólo cambia la regla
temporal. Tras ello pasó cierre, reapertura, restauración de revisiones e
identidad/familias. El test terminó PASS en 221,88 s; ambos hashes originales
seguían intactos. `go test ./...` pasó después de simplificar el test.

Esto acredita transporte y aplicación Go de la regla sobre magnitudes LMU
reales, no la precisión empírica del evento supuesto ni el recorrido Wails de
la UI que edita esos minutos. E01–E08 y aceptación T22 permanecen abiertos.

## Regresión del menú al reabrir un borrador

En el harness de navegador con runtime mock, al reabrir un borrador y pulsar
«Cambiar origen» el menú mostraba «Buscando sesiones…» sin iniciar `discover`.
La lectura automática anterior sólo se programaba cuando no había borrador
inicial. El test reprodujo la ausencia de sesión; ahora la primera apertura del
menú inicia la búsqueda aunque el borrador haya sido reabierto. La prueba focal
pasó 18/18; suite frontend 493 archivos y 4326 tests PASS (2 omitidos),
typecheck, lint y build PASS. Tras recargar el harness, reabrir el borrador,
volver a preparación y cambiar origen, apareció la sesión mock disponible y
se pudo adoptarla. También se verificó en el harness que la ventana de piloto
65–120 minutos permanecía tras guardar, salir y reabrir el borrador.

Esto sólo valida navegación y persistencia del mock. La disponibilidad real de
sesiones, el guardado y la adopción en Wails con DuckDB permanecen en E01–E08.
Se regeneró `vantare-localdev.exe` después del arreglo con
`scripts/build-local-development.ps1`; el comando terminó PASS, y
`go version -m` confirma `-tags=vantare_localdev`. El hash de arriba
identifica esta nueva build. Aún no se ha abierto en Wails.

## Regla de energía al sustituir una sesión

El harness reprodujo un fallo distinto: al reabrir la carrera LMGT3, cambiar
origen, elegir de nuevo la misma sesión y calcular, la UI mostraba un error
genérico. Abrir esa misma revisión desde la biblioteca permitía calcular. La
regresión de `useRecordedWorkflow` mostró la causa: la sustitución vaciaba la
combinación antes de seleccionarla otra vez y convertía la regla VE confirmada
(`applicable`, capacidad 100 %, inicial 96 %, reserva 4 %) en `unknown`, aunque
coche y circuito seguían siendo los mismos. Ahora conserva la combinación
verificada y su regla VE sólo si el `combinationId` coincide; cambiar a otra
combinación reinicia la regla. El test falló antes y pasó después.

El navegador interno con mock completó desde ese recorrido: selección,
propuesta de 69 vueltas/2 paradas, ajuste de límite del stint 1 a vuelta 24,
recalcular, añadir 63,4 L en parada 1, recalcular y aceptar la revisión. Son
salidas deterministas del harness, **no** resultados empíricos ni Wails real.
Frontend: 493 archivos/4327 PASS, 2 omitidos; typecheck, lint y build PASS.
La receta localdev se ejecutó de nuevo tras esta corrección: PASS,
46.396.928 bytes y `-tags=vantare_localdev` confirmado. El SHA-256 de arriba
corresponde al frontend corregido. Aún falta abrirlo para T22 nativo.

## Menú intacto y borradores guardados

En el navegador interno, «Abrir borrador» desde la entrada recién cargada
mostró «Salir de la preparación / Los cambios sin guardar se perderán» antes
de abrirlo. `useRecordedWorkflow` marcaba como `dirty` el borrador nuevo y
vacío desde el primer render. Dos pruebas que exigían apertura directa de
borrador e historial fallaron antes del cambio; ahora el estado inicial es
limpio. Adoptar telemetría, empezar Manual o editar continúa marcándolo como
modificado, y la regresión de salida manual conserva el aviso de descarte.
La recarga del harness seguida de «Abrir borrador» abrió Carrera directamente,
sin diálogo; el runtime del navegador sigue siendo mock.

Tests focales 25/25 PASS. Frontend completo: 493 archivos, 4327 PASS y dos
omitidos; typecheck, lint y build PASS. El preflight de sólo lectura confirmó
WebView2 Runtime 153.0.4234.48 y ningún proceso `vantare-localdev` activo.
La receta oficial localdev regeneró el candidato desde este frontend: PASS,
46.396.928 bytes, SHA-256
`5F318D0E6333E82832B151D4DF2A727CBF07FB8338BDB2A630969378B95FF7F9`,
tag `vantare_localdev` verificado con `go version -m`. El hash anterior de
este documento quedó sustituido para el próximo recorrido Wails. No se abrió
la ventana nativa ni se ejecutó E01–E08; sin push, PR, CI, merge, promoción
ni release.

## E05 · resultado tardío después de cancelar

La revisión del hook de cálculo detectó que `application.cancel` podía devolver
éxito y, aun así, la petición original terminar normalmente un instante después.
En esa carrera el frontend empezaba `calculate_orbit` tras cancelar la
preparación, o publicaba un plan tras cancelar el cálculo. Dos regresiones
fallaron antes del arreglo con estados observados `calculating` y `success`.
Ahora, al recibir una respuesta tardía tras cancelar, ambas fases publican
`cancelled` y no despachan otro cálculo ni exponen el resultado como vigente.

Test focal 12/12 PASS; suite frontend 493 archivos, 4329 PASS y 2 omitidos;
typecheck, lint y build PASS. La receta localdev regeneró
`bin/vantare-localdev.exe`: 46.396.928 bytes, SHA-256
`A90F29A551AF0CE73D7720C7F091076A21FC13B00B2F3E62675878A06614AACB`,
tag `vantare_localdev` verificado. Esta prueba usa respuestas controladas,
no acredita que la cancelación real libere el reader ni la ventana Wails.
E05 y E01–E08 siguen pendientes de recorrido nativo. No se abrió la app,
ni hubo push, PR, CI, merge, promoción o release.

## E05 · respuesta posterior a cancelar una fuente

Una selección manual de archivo y la recuperación de una copia podían
completar su llamada después de `cancel()`. Aunque la señal estaba abortada,
el controlador añadía la fuente a candidatos y devolvía éxito. Dos tests
con respuestas diferidas fallaron antes del arreglo (`true` tras cancelar).
Ahora el controlador comprueba la señal antes de publicar una fuente o copia,
y al finalizar cualquier operación; la copia verificada no se muestra como
confirmada si su respuesta llega tras cancelar. Las pruebas terminan con
resultado cancelado y sin candidato nuevo.

Test focal 19/19 PASS; frontend completo 493 archivos, 4331 PASS y 2 omitidos;
typecheck, lint y build PASS. Build localdev oficial PASS: 46.397.440 bytes,
SHA-256 `BB5393301E5BE599E144FF3C346292F4AF3C2AF29B2D677F482EB04A7DF291EF`,
tag `vantare_localdev` confirmado. Son respuestas de test controladas; la
cancelación y liberación del lector DuckDB real siguen pendientes de E05 Wails.
No se abrió la app ni hubo push, PR, CI, merge, promoción o release.

## E08 · quinta sesión rechazada también en el controlador

La biblioteca desactivaba el botón cuando había cuatro sesiones, pero el
controlador `open` devolvía `true` silenciosamente ante una quinta apertura
directa. Una regresión con cinco candidatos lo reprodujo antes del cambio.
Ahora el intento devuelve `false`, conserva exactamente las cuatro fuentes,
no llama al lector para la quinta y presenta el aviso existente sobre el
límite de cuatro sesiones. El test focal terminó 20/20 PASS.

Frontend completo 493 archivos, 4332 PASS y dos omitidos; typecheck, lint y
build PASS. La receta oficial localdev regeneró el candidato: 46.397.440
bytes, SHA-256 `52EC466241C681F61F58BA745B6BBE7A4EBED35532F8AAF92FE09112B00A2ECE`,
tag `vantare_localdev` verificado. Esta es una prueba controlada del
controlador/UI; la biblioteca real de cientos de fuentes, los cuatro handles
y el quinto intento siguen pendientes de E08 en Wails. No se abrió la app
ni hubo push, PR, CI, merge, promoción o release.

## Límite del navegador de desarrollo

Se abrió el frontend actual con Vite en `127.0.0.1:5173` dentro del navegador
interno de Codex, sin ocupar la pantalla de Windows. La página quedó negra:
el runtime Wails advirtió que el navegador sólo permite previews, rechazó una
llamada nativa y el transporte de telemetría recibió HTTP 404. Se cerraron la
pestaña y el servidor. Ese intento no valida ni invalida el flujo nativo de
Strategy; no se usó como evidencia de E01–E08.

## Banco real Hypercar sobre el HEAD actual

En `f95894a2`, el test opt-in `TestRecordedStrategyRealDuckDB` pasó con la
fuente de preparación S026 Monza (Hypercar) y S266 Algarve como objetivo,
ambas sin WAL. El manifiesto del runtime autorizado conservaba SHA-256
`700201f90266ae6b829372d9989408c6b0efd86725a50980d46fc05adfc24869`.
El banco terminó PASS en 191,30 s: abrió 98 canales, igualó la derivación
paginada y materializada, proyectó 53 vueltas utilizables con ritmo seco
97,559 s, Fuel 2,876 L/vuelta y VE 3,328 puntos/vuelta aplicable a Hypercar.
Con reglas de evento supuestas, Go produjo 37 vueltas, una parada y
`optimality=proven` dentro de ese modelo, y rechazó un piloto indisponible
durante todo el evento supuesto. Guardó, restauró y reabrió revisiones exactas
de clasificación, identidad y uso por familia. Los originales conservaron
SHA-256 `08a1e626…5538` y `6b912640…9362`; no se creó WAL.

Este banco verifica la cadena Go real y que VE no desaparece para Hypercar;
no valida la UI, licencia/distribución, E01–E08 Wails, precisión empírica ni
un evento real de 37 vueltas. Una sola duración no es un benchmark de
rendimiento ni prueba de memoria de resistencia. No se abrió LMU o la app.
