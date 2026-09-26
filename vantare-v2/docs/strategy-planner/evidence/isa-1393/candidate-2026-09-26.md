# T22 · candidato local con disponibilidad temporal

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

El ejecutable localdev corregido tiene **46.396.928 bytes**, SHA-256
`0409E68F9C475649922044B00EF028DC8186A6380646B49AC787B0C3010AB8E8`.
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
El `vantare-localdev.exe` citado arriba se compiló antes de esta corrección
frontend: debe regenerarse con el script oficial antes de la siguiente prueba
nativa. Su SHA identifica la build anterior y no este HEAD.
