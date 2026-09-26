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
- `CGO_ENABLED=0 go build -buildvcs=false -gcflags=all=-l
  -ldflags="-X main.buildChannel=localdev" -o bin/vantare-localdev.exe
  ./cmd/vantare`: PASS tras la generación de frontend/bindings/config.

El ejecutable localdev tiene **44.106.752 bytes**, SHA-256
`9FBDEA728D39097621E8708C0C4CA5A57EC7C56071EED1988FF30E0226FBC449`.
No se abrió. Tampoco se abrió un DuckDB ni se midió un cálculo con la ventana
temporal: el resultado de los tests no certifica E01–E08, memoria de resistencia
ni precisión empírica. Esas pruebas y la aceptación de Isaac siguen pendientes.

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
