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
- la compatibilidad solo es `known` con build allowlisted (`1.3.0.0`) y evidencia
  estructural positiva. Windows localiza `Le Mans Ultimate.exe`, conserva su
  ruta solo en memoria y lee FileVersion/ProductVersion con `version.dll`; la
  ruta nunca entra en estado, fingerprint ni error. Build ausente/no soportado,
  all-zero o evidencia insuficiente quedan `unknown`, fingerprint `insufficient`
  y todos los campos de offsets `missing`;
- scoring y telemetry se prueban aparte: menú requiere build + invariantes
  scoring y puede ser `live` sin vehículo; con jugador se exige un único slot
  scoring `isPlayer`, ID consistente, vehículo y track coherentes con el slot
  telemetry. Scoring válido con telemetry movida/corrupta queda `unknown` y no
  publica campos rápidos;
- jugador ausente: runtime `live`, con `PlayerPresent=false` y campos de
  vehículo ausentes;
- reloj inmóvil sobre el límite: runtime `stale` y campos presentes `stale`;
- retroceso del reloj: `ClockReset`; retroceso tras un contador largo:
  `ClockWrap`.

`RuntimeSnapshot` usa copia defensiva y mutex de lectura; no bloquea en I/O. El
driver no crea goroutines propias. Clock, ticker y apertura son inyectables solo
dentro del paquete para tests deterministas sin `time.Sleep`.

Los errores de cierre se propagan mediante `errors.Join`; no se ignoran aunque
la lectura o el sink ya hayan fallado. `driver.ErrTeardown` conserva el resultado
por generación para que uno o varios `DriverManager.Stop` lo reciban sin
contaminar un restart. Los diagnósticos contienen nombres de
canal, operación y errores tipados, nunca bytes raw, nombres de pilotos, pista o
vehículo.

Teardown tiene prioridad absoluta sobre disconnected/incoherent: nunca es
retryable y `DriverManager` no construye otra instancia aunque el mismo error
contenga marcadores transitorios.

`LMU_Data` no ofrece un contador/generación de frame demostrado. Por eso cada
muestra exige dos copias completas consecutivas idénticas, con scratch
preasignado y hasta tres comparaciones. Si nunca estabiliza, no se publica y
`ErrIncoherentSnapshot` devuelve el reconnect al manager. Esta comprobación
reduce torn reads, pero no puede probar atomicidad del productor sin protocolo.

Gear y lap conservan valores source según sus contratos actuales; no se inventan
límites. RPM negativa, componentes no finitos y velocidad final no finita tras
`sqrt` son `invalid`.

## Rendimiento

El benchmark estabilidad (dos copias)+parse+evidencia de compatibilidad da
23,25–23,83 µs/op, 592 B/op y 14 allocs/op en Windows amd64. A 60 Hz hay
16,67 ms por muestra: el microcorte consume menos del 0,15 % de ese presupuesto
(>690x de margen). La consulta proceso/version y la normalización allowlist
ocurren una vez por `Run`, fuera del hot path. Las
asignaciones pertenecen a los strings canónicos de la observación; el buffer de
324.820 B y su scratch se reservan una vez por `Run` y se reutilizan.

## Fixtures y límites

- pista: `testdata/lmu-fixture.bin`, captura real sanitizada;
- menú: `testdata/lmu-menu-fixture.bin`, captura real sanitizada sin vehículo;
- garaje y boxes: pendientes de captura real; no se simulan ni se declara
  cobertura.
- no-Windows, LMU ausente o versión fuera de allowlist: `unknown/degraded`.

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
