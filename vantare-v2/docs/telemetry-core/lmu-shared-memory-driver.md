# ISA-32 / TC-03C — Driver Shared Memory LMU

## Alcance cerrado

`internal/telemetry/drivers/lmu` es el único owner nuevo de `LMU_Data`. Cada
`Run` abre el mapping una vez, copia cada muestra a memoria privada del driver y
cierra view y handle exactamente una vez al salir. No existe wiring productivo,
REST, fusión, delta, gaps, avisos ni acceso desde Engineer, Overlay o Strategy.

El payload emitido es product-neutral y no contiene `[]byte`: expone únicamente
campos canónicos demostrados por las fixtures reales de menú y pista, con
presencia, provenance y freshness explícitos. NaN, infinito o rangos inválidos
se publican como `invalid`; nunca se convierten en cero válido.

## Compatibilidad y lifecycle

- mapping ausente o lectura perdida: error retryable `ErrDisconnected`; el
  reconnect corresponde a `core.DriverManager`, no al driver;
- buffer menor a 324.820 bytes: `ErrIncompatibleBuffer` terminal;
- invariantes/firma desconocidos: runtime `degraded`, conservando solo campos
  que pasan validación individual;
- jugador ausente: runtime `live`, con `PlayerPresent=false` y campos de
  vehículo ausentes;
- reloj inmóvil sobre el límite: runtime `stale` y campos presentes `stale`;
- retroceso del reloj: `ClockReset`; retroceso tras un contador largo:
  `ClockWrap`.

`RuntimeSnapshot` usa copia defensiva y mutex de lectura; no bloquea en I/O. El
driver no crea goroutines propias. Clock, ticker y apertura son inyectables solo
dentro del paquete para tests deterministas sin `time.Sleep`.

Los errores de cierre se propagan mediante `errors.Join`; no se ignoran aunque
la lectura o el sink ya hayan fallado. Los diagnósticos contienen nombres de
canal, operación y errores tipados, nunca bytes raw, nombres de pilotos, pista o
vehículo.

## Rendimiento

El benchmark copy+parse de la fixture completa (324.820 B) da 7,28–7,37 µs/op,
200 B/op y 4 allocs/op en Windows amd64. A 60 Hz hay 16,67 ms por muestra: el
microcorte consume menos del 0,05 % de ese presupuesto (>2.200x de margen). Las
asignaciones pertenecen a los strings canónicos de la observación; el buffer de
324.820 B se reserva una vez por `Run` y se reutiliza.

## Fixtures y límites

- pista: `testdata/lmu-fixture.bin`, captura real sanitizada;
- menú: `testdata/lmu-menu-fixture.bin`, captura real sanitizada sin vehículo;
- garaje y boxes: pendientes de captura real; no se simulan ni se declara
  cobertura.

Los parsers legacy permanecen intactos para comparación posterior. El raw solo
es visible en tests internos del paquete y nunca forma parte de la API del
driver.

## Verificación manual LMU

Con LMU abierto en menú o pista:

```powershell
$env:LMU_LIVE_SHARED_MEMORY_TEST='1'
go test ./internal/telemetry/drivers/lmu -run TestLiveLMUSharedMemoryOptIn -count=1
Remove-Item Env:\LMU_LIVE_SHARED_MEMORY_TEST
```

El test realiza un único `Run`, recibe una observación sin raw y cancela; el
defer cierra view y handle. Para verificar desconexión, repetir con LMU cerrado:
debe fallar con `ErrDisconnected`, no publicar mock ni iniciar reconnect local.
