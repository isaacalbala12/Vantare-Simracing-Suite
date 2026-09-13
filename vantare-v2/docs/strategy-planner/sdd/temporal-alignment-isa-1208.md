# ISA-1208 — microplan de alineación temporal LMU registrada

Estado: plan de ejecución aprobado por continuidad del SDD. Fecha: 2026-09-14.
Base: `e3b637082bcbf84aa608ec75eccb926ae0324c86`. Rama:
`vantareapp/isa-1208-strategy-temporal-alignment`.

## Estado de ejecución

- **A — cerrado localmente.** `BuildTemporalAlignment` produce una copia
  profunda, valida `GPS Time` como puente de fuente y alinea por canal mediante
  índices/frecuencias exactamente coincidentes. No interpola ni reescribe la
  procedencia. El importador ya solicita el canal puente desde la unión
  canónica.
- RED observado: el focal falló por `undefined: BuildTemporalAlignment` antes
  de existir producción. GREEN: focal y paquete completo de Telemetry Analysis.
- El gate `go test ./...` sólo quedó rojo en `cmd/vantare` y `frontend` por
  ausencia de `frontend/dist` en el worktree; todos los demás paquetes
  ejecutados pasaron. Este corte no genera el embed al no tocar frontend.
- Sigue **B**: consumir esta vista una sola vez en vueltas/correcciones y
  reemplazar la unión ordinal de `fuel_jump` por el timestamp alineado.

## Problema demostrado

T19a (#1030) prueba con S125 Imola, S266 Algarve y S026 Monza que LMU
expone eventos con `ts` de sesión y canales continuos con índice/frecuencia
desde el inicio de grabación. El análisis actual compara ambos directamente.
Esto crea cobertura artificial, muestreo desplazado y límites `fuel_jump`
unidos por ordinal en vez de por instante. S125 y S266 publican un stint
fantasma de una vuelta.

`GPS Time` es un canal continuo real a 100 Hz cuyo valor lleva el reloj de
sesión para cada muestra. La deriva observada descarta un offset constante.
El arreglo usa este canal como puente explícito por fuente. Si no puede
demostrar el puente, conserva `unknown`/no calculable y no inventa tiempos.

## Decisiones cerradas

1. El DuckDB y las páginas normalizadas originales permanecen intactos. Se
   construye una vista alineada para Analysis.
2. El puente se acepta sólo si `GPS Time` es numérico, finito, estrictamente
   monótono y cubre el índice solicitado. El mapeo entre frecuencias usa una
   muestra coincidente del mismo eje de grabación; no interpola valores.
3. Cada muestra continua alineada recibe `TimestampSeconds` y origen
   `source_timestamp` en la vista efectiva. El índice y tiempo relativo se
   conservan para trazabilidad.
4. Una derivación que cruza con eventos consume exclusivamente timestamps
   alineados. Ausencia, frecuencia incompatible, retroceso, duplicado o falta
   de cobertura producen una razón explícita; nunca vuelven implícitamente a
   `index/frequency`.
5. `addCoverage` compara inicio/fin ya alineados con eventos. Un canal sin
   puente no demuestra cobertura de vueltas.
6. `fuel_jump` se ubica por el timestamp alineado de la subida y se resuelve
   contra el `LapBoundary`/intervalo `In Pits` correspondiente. Se elimina el
   join ordinal resets↔vueltas. `pit` conserva prioridad cuando ambas señales
   describen el mismo límite.
7. `Lap Dist` puede seguir detectando resets dentro de su propio eje, pero un
   reset no se convierte en ancla de evento sin el puente válido.
8. No cambian criterios de incidente, outlier, calidad física ni umbrales de
   consumo. No se implementa todavía `set_stint_boundary`.

## Cortes ejecutables

### A — reproducción y puente puro

Paths de lógica/test esperados (máximo cinco):

- `internal/telemetryanalysis/temporal_alignment.go` (nuevo)
- `internal/telemetryanalysis/temporal_alignment_test.go` (nuevo)
- `internal/telemetryanalysis/required_channels.go`
- `internal/telemetryanalysis/required_channels_test.go`

Primero añadir casos RED que reproduzcan offset, deriva, canal ausente,
frecuencia incompatible, retroceso, duplicado y cobertura truncada. Después
implementar una función pura que clone sesión/páginas y produzca vista
alineada o diagnóstico cerrado. `GPS Time` pasa a la unión canónica de canales
requeridos; no se crea una lista paralela en el adapter.

Gate A: tests focales verdes; el input no cambia; ningún caso inválido recibe
`source_timestamp`; orden de páginas y muestras estable.

### B — vueltas, cobertura y límites

Paths esperados:

- `internal/telemetryanalysis/lapvalidity.go`
- `internal/telemetryanalysis/lapvalidity_test.go`
- `internal/telemetryanalysis/correction_input.go`
- `internal/telemetryanalysis/correction_input_test.go`

Aplicar la vista alineada una sola vez antes de derivar. Cambiar cobertura a
un único dominio. Sustituir `continuousLapEndValues` ordinal por detección de
subida con timestamp alineado y resolución inequívoca al borde de vuelta. Si
el puente o la resolución fallan, no publicar `fuel_jump`.

Gate B: RED/GREEN explícito para S125/S266 reducido; sin hueco de origen, sin
stint de una vuelta y sin regresión del caso S026. Las filas iniciales de
evento siguen siendo estado, no transición.

### C1 — Fuel, energía virtual y ritmo

Paths esperados:

- `internal/telemetryanalysis/consumptionpace.go`
- `internal/telemetryanalysis/consumptionpace_test.go`
- `internal/telemetryanalysis/derivedcurves.go`
- `internal/telemetryanalysis/derivedcurves_test.go`

Las series continuas usan `TimestampSeconds` sólo cuando la vista acredita
`source_timestamp`. Los cruces con vuelta fallan cerrados sin puente. Se
mantienen cero, ausente, no aplicable y desconocido como estados distintos.

Gate C1: límites de vuelta muestrean el instante correcto con deriva; fuentes
sin puente no producen métricas aparentes; invariantes y familias existentes
siguen tipadas.

### C2 — observación de parada

Paths esperados:

- `internal/telemetryanalysis/pitobserved.go`
- `internal/telemetryanalysis/pitobserved_test.go`

Fuel, VE y wear alineados pueden cruzarse con intervalos `In Pits`. Un
intervalo abierto continúa abierto; `In Pits` no se convierte en garaje o
servicio. `resource_clock_unaligned` sólo desaparece cuando la vista demuestra
el reloj compartido.

Gate C2: tasas y cantidades pertenecen al intervalo correcto; ausencia del
puente conserva el motivo; no hay doble conteo.

### D — banco real, compatibilidad y expediente

Reejecutar el banco opt-in sobre S125, S266 y S026, con exportación privada
saneada. Verificar hashes antes/después y ausencia de WAL. Comparar límites,
cobertura, vueltas con recursos y motivos frente a T19a. Después ejecutar:

```powershell
go test ./internal/telemetryanalysis -count=1
go test ./...
go vet ./...
```

Actualizar este microplan con resultado, el handoff vivo, #1208 y el hito
`strategy-recorded-editor`; regenerar `roadmap.json` mediante el digest. No
abrir app/Wails/LMU. No push, PR, integración o release.

## Condición para T13a

T13a sólo empieza si el corte final demuestra simultáneamente:

- un reloj compartido explícito o fallo cerrado por fuente;
- S125/S266 sin límites `fuel_jump` fantasma;
- S026 sin regresión;
- cobertura y recursos en el mismo dominio;
- originales intactos y replay determinista.

Entonces root cerrará la operación de límites. La decisión prevista es que
`set_stint_boundary` sustituya una ancla existente; retirar una frontera
espuria será una acción explícita del mismo comando o una operación separada,
nunca un empate o timestamp artificial. Esa forma final se decide en T13a
contra el modelo ya corregido.
