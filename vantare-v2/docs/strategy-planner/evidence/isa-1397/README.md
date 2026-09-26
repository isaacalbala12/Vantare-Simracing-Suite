# ISA-1397 · cálculo GT3 con energía virtual

## Reproducción y alcance

En el candidato T22 `ef1d94c1`, el banco Go opt-in con S201 Sebring GT3
(`8daf968e50e43bb351f0e5e1dfb27d6e991d21bf57610df28995dbcda7733dd9`)
y S026 Monza como segundo original
(`08a1e626d7154becd493aa84addbf146cc7f0f229c8a7aa39664766813495538`)
abría 98 canales y proyectaba 8 vueltas secas utilizables, ritmo 123,618 s,
Fuel 3,120 L/vuelta y VE 4,281 puntos/vuelta. `CalculateOrbit` devolvía
`calculation_overflow (input.variants.0)` tras 18,37 s. Ambos originales
conservaron su SHA-256. Estas fuentes pertenecen al conjunto de preparación
de #1030, no a su holdout empírico.

La cota previa de una parada no cerraba el caso: el mejor plan de una parada
tenía 3807,698242 s y la cota optimista de dos o más paradas, 3784,280212 s.
La curva combinada de ritmo observada favorecía tres stints de diez vueltas.
El nuevo certificado calcula la partición de menor tiempo con servicios
gratuitos, construye un plan con recursos para el escenario de consumo
desfavorable, lo reproduce con el motor y sólo cierra si es factible y alcanza
esa cota dentro de la tolerancia numérica del solver. De lo contrario continúa
la búsqueda ordinaria. No eleva cuotas ni convierte resultados parciales en
óptimos.

## Verificaciones locales

- Caso pequeño de dos paradas con Fuel y VE: rojo antes del certificado,
  verde después, con paridad de tiempo y decisión frente al oráculo exhaustivo.
- Caso pequeño con consumos desfavorables simultáneos de Fuel y VE: plan
  certificado y reproducción del escenario desfavorable factible.
- Banco S201→S026 posterior: PASS en 36,76 s. `CalculateOrbit` dio 29 vueltas,
  dos paradas y `optimality=proven` para el evento **supuesto** del test;
  comprobó revisión exacta, guardado, reapertura, restauración e identidad.
  Los dos SHA-256 originales permanecieron intactos, sin WAL.
- `go test ./...`: PASS en todos los paquetes. La build de frontend ya se
  había completado en este worktree antes de ejecutar Go con `frontend/dist`.
- Banco de regresión S026 Monza Hypercar→S266 Algarve: PASS en 191,22 s;
  conserva 53 vueltas utilizables, 37 vueltas/una parada en el evento
  supuesto y los hashes originales intactos. Una primera invocación usó
  nombres de archivo inexistentes y falló antes de abrir cualquier fuente;
  se corrigieron con las rutas literales del corpus #1030.
- Tests completos del solver y `go vet ./internal/strategy/solver`: PASS tras
  ajustar la cota para que seleccione el mínimo estricto de cada partición.
- Tras ese último ajuste, S201→S026 volvió a pasar en 35,56 s con 29 vueltas,
  dos paradas y los SHA-256 originales intactos; `go test ./...` volvió a
  pasar en todos los paquetes.

Este banco acredita el cálculo Go para estas sesiones y reglas supuestas. No
acredita precisión empírica, uso nativo Wails, validación visual ni aceptación
humana. E01–E08 y T19–T22 permanecen abiertos en #1393/#1030.
