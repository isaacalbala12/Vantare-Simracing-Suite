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
