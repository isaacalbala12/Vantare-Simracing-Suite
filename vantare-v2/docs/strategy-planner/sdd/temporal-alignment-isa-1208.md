# ISA-1208 — microplan de alineación temporal LMU registrada

Estado: implementación y banco real cerrados localmente. Fecha: 2026-09-14.
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
- **B — cerrado localmente.** `ReadCorrectionInput` construye una sola vista
  alineada y la comparte con validez y correcciones. Vueltas, tráfico,
  cobertura y repostajes sólo cruzan dominios mediante timestamps acreditados.
  La cobertura usa una única secuencia continua demostrada y `Lap Dist` como
  último respaldo alineado. Un repostaje gradual publica una sola frontera; si
  coincide con una visita a boxes, `pit` conserva prioridad. Estado inicial,
  fuentes sin puente y resets sin timestamp fallan cerrados.
- RED observado en B: los tests nuevos no compilaban antes de exponer el
  diagnóstico temporal. GREEN: siete regresiones dirigidas, paquete completo
  de Telemetry Analysis y todos los paquetes `internal/...`.
- **C1 — cerrado localmente.** Coldstart y cada derivación corregida construyen
  una sola vista alineada y la comparten con vueltas, Fuel, energía virtual,
  ritmo y curvas. Los lectores escalares y vectoriales sólo aceptan timestamps
  finitos con origen `source_timestamp`; se retiró el fallback a tiempo
  relativo o `index/frequency`. Las fórmulas, buckets, exclusiones y umbrales
  permanecen intactos. Las versiones persistibles avanzan a
  `consumption-pace.v5` y `derived-curves.v4`.
- RED observado en C1: los lectores elegían el tiempo relativo y las fuentes
  sin puente todavía producían métricas. GREEN: regresiones de offset, deriva,
  ausencia de puente y desgaste, más Telemetry Analysis, coldstart e
  `internal/...` completos.
- **C2 — cerrado localmente.** Las visitas cerradas calculan Fuel/VE con el
  reloj alineado y la duración real de las muestras que demuestran la subida.
  Una entrada sin salida conserva inicio, final ausente y duración no
  disponible, con motivo explícito; no alimenta tasas, medias ni paradas
  completas. La primera fila `In Pits` permanece estado inicial. El cambio de
  desgaste se compara en finales de vueltas consecutivas reales, sin resets ni
  ordinales. Versiones: `pit-observation.v2` y `observed-strategy.v2`.
- RED observado en C2: el contrato rechazaba el intervalo abierto y el helper
  de wear aún exigía resets ordinales. GREEN: casos de abierto, estado inicial,
  tasa con deriva, agregado mixto/abierto, número real de vuelta y contrato.
- **D — cerrado localmente.** El banco productivo sobre S125/S266/S026
  confirma puente alineado, recursos en el reloj de eventos y ausencia de los
  tres `fuel_jump` fantasma de T19a. S026 conserva `pit@9149.8` y
  `pit@12158.9`; S125 queda en `pit@2893.76` y S266 en `pit@13580.36`.
  Hashes intactos y sin `.wal`. La regresión real descubrió y corrigió el caso
  de repostaje dentro del estado inicial `In Pits=true`. #1210 separa el límite
  de preparación que S266 supera con el conjunto actual de canales.
  Evidencia: `../evidence/isa-1208/README.md` y `real-bank.json`.

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

Precisión incorporada tras consejo de simplicidad: una subida acumula un tramo
ascendente contiguo y emite un único candidato sólo cuando el total supera el
umbral vigente; no exige que una muestra individual supere 3 L. Si ocurre
dentro de una visita `In Pits`, comparte la frontera de entrada de esa visita,
por lo que la prioridad existente de `pit` evita duplicados. Los resets de
`Lap Dist` se conservan como diagnóstico, pero no se convierten por ordinal en
anclas de evento. Tráfico sólo se atribuye mediante timestamp alineado. No se
tocan incidentes, outliers, consumo, curvas ni el análisis detallado de parada.

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
- `internal/telemetryanalysis/strategyprojection/projection.go`
- `internal/telemetryanalysis/strategyprojection/strategyprojection_test.go`

Fuel, VE y wear alineados pueden cruzarse con intervalos `In Pits`. Un
intervalo abierto continúa abierto; `In Pits` no se convierte en garaje o
servicio. `resource_clock_unaligned` sólo desaparece cuando la vista demuestra
el reloj compartido.

Gate C2: tasas y cantidades pertenecen al intervalo correcto; ausencia del
puente conserva el motivo; no hay doble conteo.

### D — banco real, compatibilidad y expediente

Ejecutado el banco opt-in sobre S125, S266 y S026 con exportación privada
saneada. Los tres originales conservan su SHA-256 y no crean WAL. El contraste
con T19a demuestra límites, cobertura, recursos y visitas abiertas en el mismo
reloj; el resumen versionado está en `../evidence/isa-1208/`. La importación
productiva pasa en las tres fuentes. S266 supera el
presupuesto independiente de `PrepareCorrections`; #1210 conserva ese hallazgo
fuera del alcance temporal sin relajar el límite.

Checks ejecutados:

```powershell
go test ./internal/telemetryanalysis/... -count=1
go test ./internal/strategy/... -count=1
go test ./internal/... -count=1
```

Los dos primeros gates pasan. El tercero mostró sólo el presupuesto temporal
de un test SQLite ajeno al cambio; su repetición focal pasó en 0.25 s. Tras
generar sólo el embed web, `go test ./... -count=1` pasa. `go vet ./...` conserva
únicamente tres avisos heredados de `unsafe.Pointer` fuera del alcance; los
paquetes modificados pasaron vet focal. No se abrió app/Wails/LMU.

## Condición para T13a

El corte final ya demuestra simultáneamente:

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
