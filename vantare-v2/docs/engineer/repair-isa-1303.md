# Reparación Spotter — VAN-738 / GitHub #1303

Estado: candidato implementado y revisado, sin integración.
CI remoto, PR y siguiente paso: consultar la tarea Notion enlazada.
Tarea: https://app.notion.com/p/3e3e51695c658171ac4cfd0e9498e642
Base inicial: nightly@1e9932c4d8ca3d53a58d093449cfb840f7108e8f.
Base final de revalidación: nightly@1101f73579ddaa8798b7d9948bae8b4e2a77d850.
Incluye CI VAN-737/#1302 y Widgets #1298, integrados por sus tareas propietarias.
Ninguno modifica Spotter, radio ni las familias Engineer de la base inicial.
Rama: `vantareapp/isa-1303-spotter-parity-repair`.

## Ciclo por corte

1. Fijar reglas y escenarios desde CrewChief predeterminado y demostrar la
   diferencia antes de editar el producto.
2. Reparar la ruta activa mínima, con regresiones rojas y controles positivos.
3. Volver a la misma fuente, comparar fronteras y resultados, revisar de
   forma independiente y registrar los límites. El audio físico es otro gate.

La referencia fijada es `4c3865e09a347d4c806c0bc0cd66aae335fbc610`.
No se copia implementación, voces, textos ni assets de CrewChief.

## Contraste previo y decisión

| Caso | Fuente CrewChief fijada | Contrato del corte |
| --- | --- | --- |
| Nuevo solape | NoisyCartesianCoordinateSpotter.cs:559–624 | Admitir únicamente si abs(delta velocidad mundo X) < 12 y abs(delta Z) < 12. El límite exacto se excluye; no usar módulo ni velocidades locales sin orientar. |
| Solape existente | Mismo archivo:595–624 | La ocupación del tick anterior conserva geometría de separación ampliada; el filtro nuevo no inventa un clear de un coche que sigue al lado. |
| Primera observación libre | Mismo archivo:638–658 | Programar clear desde esa observación, con 150 ms en circuito normal. Retirar la espera temporal adicional de 350 ms. |
| Frontera clear | Mismo archivo:808–810 | Elegible estrictamente después del vencimiento. Primer vacío en 1050 ms: silencio en 1200, elegible en 1201; con ticks de 50 ms, primera salida en 1250. |
| Reaparición antes del clear | Mismo flujo y contrato de cancelación Vantare | Cancelar clear si reaparece un solape válido. Una situación de mensaje todavía ocupada no autoriza saltarse el filtro de una detección nueva. |
| Comunicación y ciclo de vida | Contrato radio Vantare existente | Mantener ACK started, TTL, supersession, reset y revalidación; no renuevan contexto por seleccionar o encolar. |

Defaults en Settings.settings: `max_closing_speed_for_spotter=12`,
`spotter_clear_delay=150`. El modo oval tiene otro valor (500 ms) y queda
fuera de este corte: no se infiere tipo de pista ausente.

## Velocidad y límite de equivalencia

RF2Spotter.cs:155–177 deriva velocidad mundo del jugador a partir de dos
posiciones y pasa solo posiciones rivales. NoisyCartesianCoordinateSpotter
estima la velocidad rival con historial y una ventana mínima de 200 ms
(líneas 33 y 354–375). El primer encuentro solo inicializa ese historial.

Vantare ya recibe `LocalVelocity` y `Orientation` canónicos. El contrato de
`internal/telemetry/schema/spatial/types.go` define las columnas de la matriz
como ejes locales expresados en mundo: velocidad mundo = matriz × velocidad
local. X es Row0 · local; Z es Row2 · local. El oráculo de la captura LMU real
en `drivers/lmu/spatial_test.go` usa la transformación inversa. Se prueban
rotaciones no triviales para no confundir filas y columnas.

Se usa esta velocidad observada y no se introduce un historial duplicado para
imitar RF2. Por tanto, este corte iguala el predicado de admisión y el clear
acotado; no certifica equivalencia temporal del estimador RF2 ni del primer
aviso de solape. Una velocidad no usable no autoriza un solape nuevo. La
ocupación observada se conserva separada del contexto de mensajes pendientes.

El probe original de VAN-735 con rival parado usa una sola observación. Es
regresión válida del producto, pero no una trayectoria RF2 completa. Su
control de primera observación a igual velocidad también es de producto.
Se añaden secuencias de posiciones coherentes, después de al menos 200 ms y
con separación longitudinal no nula, para apoyar la comparación del filtro.

## Alcance y archivos

Productor y policy en `internal/spotter`; helper geométrico solo si mejora la
claridad sin crear otra autoridad. Pruebas de productor/policy/servicio/replay
afectadas; actualizar únicamente expectativas temporales justificadas.
No cambia el bus, la proyección, el lector LMU, UI, audio, dependencias,
proveedores, doble rival por lado ni configuración de sensibilidad.

Documentación: este microplan, handoff vivo, fragmento ISA-1303 y únicamente
`milestones:engineer-radio-spotter` del roadmap; JSON generado desde la base.
VAN-736/#1300 permanece como entrega separada.

## Validación exigida

- Antes/después: rival parado, deltas positivos/negativos por eje, límite
  exacto, diagonales válidas por componente y rotaciones distintas.
- Datos ausentes, stale e invalid; cero observado legítimo.
- Solape establecido, primer vacío, antes/exacto/después del clear, reaparición
  en la espera y nueva admisión sin heredar ocupación del mensaje pendiente.
- Contexto absent/pending/started, TTL y reinicios existentes.
- Pruebas focales, race, vet, gofmt, calidad y global aplicable; revisión
  independiente contra la fuente y el candidato.
- Sesión LMU/Windows y escucha real pendientes; no confundir latencia de
  política con el primer sonido.

## Fuentes reproducibles

| Archivo CrewChief | Blob Git |
| --- | --- |
| NoisyCartesianCoordinateSpotter.cs | `d303a30905d94a4a1540cf244a3d2aed10b439da` |
| RF2/RF2Spotter.cs | `45b2f0e2b70adf71b2734cc234b7436014e6afa7` |
| Properties/Settings.settings | `13b19f78217111a8d2bbf4d7bbfbd340b68dc530` |

Repositorio primario: https://gitlab.com/mr_belowski/CrewChiefV4

## Desarrollo y comprobación posterior

Implementación worker `f81e98dbc965bf75e45b5a7f73ae2ec6affbe0b5`, aplicada
como `552734e0` al candidato. Solo `producer.go` y `policy.go` cambian producto.
La transformación usa la matriz propia de cada coche; el límite sigue siendo
estricto por componente. La ocupación se actualiza en cada observación, mientras
la entrega conserva su contexto y caducidad. Así, un aviso pendiente no puede
empezar después de observar el vacío ni habilitar la admisión de otro coche.

El worker registró los fallos antes de editar producto. Después se vuelve a
leer la misma fuente y sus defaults; un reviewer independiente inspecciona el
diff, repite race y ejecuta el probe original mediante un overlay de pruebas
externo. Veredicto PASS acotado, sin P1/P2; no significa paridad integral.

| Escenario | Antes | Después |
| --- | --- | --- |
| Rival parado; jugador a 40 m/s | Nuevo aviso lateral indebido | Silencio |
| Control de igual velocidad | Aviso lateral | Aviso lateral conservado |
| Deltas ±12 por eje | Admitidos | Excluidos; ±11,999 siguen admitidos |
| Deltas 11,9 en ambos ejes | Admitidos | Admitidos: no se usa el módulo |
| Orientaciones distintas | Sin filtro comparable | Comparación en mundo por coche |
| Velocidad missing/stale/invalid | Podía admitir un solape nuevo | No lo admite |
| Primer vacío 1050; ticks de 50 ms | Clear a 1550 | Clear a 1250 |
| Vencimiento exacto 1200 | No se aislaba la frontera | Silencio en 1200; elegible en 1201 |
| Aviso/reminder pendiente tras vacío | ACK podía aceptarlo | Inicio obsoleto rechazado |
| Reaparición durante la espera | Heredaba ocupación del mensaje | Vuelve a pasar el filtro de admisión |

Los dos casos Spotter de VAN-735 y su control se repiten sin modificar el probe:
los tres pasan. El replay `multi-cycle` conserva sus 61 eventos y las métricas:
exactamente 47 hojas `atMs` cambian +1/+2 ms por dos avances de 150 a 151 ms.
Se comprueba estructuralmente; no se regenera el golden desde el resultado.
Los IDs, intents, prioridades, estados y orden son idénticos.

## Evidencia y reproducción

Desde `vantare-v2`, con Go 1.25.0 y `TMPDIR=/private/tmp` en macOS:

```sh
go test -count=1 ./internal/spotter/... ./internal/radio/... ./internal/engineer/... ./internal/families/... ./internal/telemetry/projection/engineer/...
go test -race -count=1 ./internal/spotter/... ./internal/radio/... ./internal/engineer/replayoracle/... ./internal/engineer/service/... ./internal/telemetry/projection/engineer/...
go vet ./internal/spotter/... ./internal/radio/... ./internal/engineer/replayoracle/... ./internal/engineer/service/... ./internal/telemetry/projection/engineer/...
go test -timeout 90s ./...
```

41 paquetes focales PASS. Race, vet focal, gofmt y diff-check PASS; también
comprobados por revisión independiente en los paquetes afectados. Build de
assets frontend PASS con Node 22.23.2; el corte no modifica frontend.
Calidad local PASS contra la base final: cero hallazgos NEW y política intacta.
Contrato de roadmap vivo PASS: exactamente `milestones:engineer-radio-spotter`;
fragmento de cambios validado. No se cambia tooling, baseline ni dependencias.

Go global y vet global no son verdes en este host macOS: el ejecutable depende
de símbolos Windows. La suite global del candidato tiene 119 paquetes PASS
y fallos en cmd/vantare, Launcher, Server y Recording SQLite. La base final se
ejecuta con el mismo comando, toolchain y assets: también 119 paquetes PASS y
los mismos cuatro paquetes fallidos. No se declara PASS global.

## Verificación física pendiente

En Windows/LMU, circuito normal, sensibilidad normal y ajustes predeterminados:

1. Rodar en paralelo con un rival a velocidad similar: debe anunciar el lado.
2. Pasar cerca de un rival parado con una diferencia absoluta de velocidad
   mayor o igual a 12 m/s en al menos uno de los ejes mundo X/Z: no debe iniciar
   un solape nuevo; uno ya establecido sigue su geometría. Una diferencia total
   superior a 12 m/s puede admitirse si ambos componentes están por debajo.
3. Separarse después de un aviso iniciado y observar la salida libre. Registrar
   por separado último solape, primer vacío, decisión, ACK y primer sonido.
4. Reaparecer en el lado antes del clear: una ocupación válida cancela el libre;
   un aviso lateral aún pendiente no empieza si el lado ya está vacío.

La prueba física no se ejecuta desde este host. No hay merge ni promoción en
esta entrega. T0a/T0b, cadencias Timings, estimador RF2, oval/doble rival y audio
siguen sus cortes y puertas propios; VAN-736/#1300 no forma parte de este diff.
