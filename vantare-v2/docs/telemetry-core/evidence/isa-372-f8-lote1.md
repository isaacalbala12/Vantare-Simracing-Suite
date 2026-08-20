# ISA-372 / F8 — lote 1: fase del comparador + StandingsVM y SessionVM en shadow

Fecha: 2026-08-20.

Rama: `vantareapp/isa-372-tc-f8-builders-lote1`.

Base: `tc-integration@f7e2cc07f252e0259d2aaf0117c7864ae5c43f7e` (F0–F7 + LMU
1.4.1.3 + CSP).

## Resultado

El gate shadow deja de contar como divergencia lo que es una diferencia de
contrato declarada, y `OverlayFrame v2` pasa a publicar la clasificación con el
orden ya resuelto en Go. Overlay v1 sigue intacto y productivo:
`overlayV2Features` está vacío por defecto y ningún widget se conmuta.

## 1. Segmentación por fase

### El problema medido

En la sesión #1 el comparador acumuló 317k mismatches de `gear` durante la fase
stale/degraded. La causa no era un bug: Overlay v1 retiene el último valor
conocido mientras el ViewModel v2 oculta lo que el frame declara ausente. Es
una diferencia de contrato **intencional**. En `live` dio 0 mismatches sobre
1.598 frames.

La sesión #2 (54 coches de IA) añadió un segundo patrón. Bajo esa carga el
bloque de sesión de LMU roza el `freshnessLimit` de 500 ms y el driver oscila
`stale↔live` cada pocos segundos; los dos productores ven ese borde en
instantes distintos. Mismatches observados sobre 273 frames emparejados:

| Campo | Mismatches | Clasificación |
| --- | ---: | --- |
| `display.status` | 153 | Transición: v1 y v2 cruzan el borde en instantes distintos |
| `gear` | 213 | Contrato intencional: retención v1 vs ocultación v2 |
| `display.gear` | 213 | Contrato intencional (mismo origen) |

### El cambio

Cada comparación se etiqueta con una fase efectiva resuelta desde **las dos**
autoridades: el `status` del snapshot v1 y el `source.state` del update v2.

| Fase | Condición |
| --- | --- |
| `live` | Ambas autoridades dicen live |
| `stale` | Ambas dicen stale |
| `degraded` | Ambas dicen degraded |
| `no-frame` | Ambas dicen desconectado, parado o error |
| `transition` | **Las dos autoridades discrepan** |

El gate lee **únicamente** `phase="live"`: `summary.frames` y
`summary.mismatches` son el denominador y el numerador de la fase live. Todo lo
demás se acumula aparte en `declaredDifferences`, con su desglose completo en
`framesByPhase` y `mismatchesByPhase`. Las métricas exportadas por
`window.__vantareOverlayV2Diagnostics()` llevan las tres etiquetas:
`overlay_shadow_mismatches_total{feature,field,phase}`.

Aplicado a los datos anteriores: los 153 de `display.status` caen en
`transition` y los 426 de `gear`/`display.gear` caen en `stale`. Ninguno entra
en el gate. Los mismatches en `phase="live"` quedan en **0**.

`framesByPhase` cuenta **frames emparejados**, no comparaciones: solo la
feature ancla (`player-instruments`) lo incrementa, de modo que añadir features
no infla el denominador del gate.

### Rotación de acumuladores

- El runtime shadow resetea comparador y colas pendientes al cambiar
  `epoch` o `sessionId`, y cuenta la rotación en `epochResets`.
- El histograma de parse **sí rotaba** por muestra (ring de 512 con `shift`),
  al contrario de lo que sugería el diagnóstico previo; lo que no hacía era
  reiniciarse entre carreras ni distinguir régimen. Ahora se vacía al cambiar
  de stream y solo muestrea updates con `source.state === "live"`, así que
  `overlay_v2_parse_duration` publica p50/p99 **de la ventana live actual**.
  Las muestras no-live se cuentan aparte en `nonLiveSamples`.

### Atasco de emparejamiento

Confirmado el atasco: tras el flapping inicial el comparador se quedó en 18
frames emparejados durante ~2 minutos y luego se recuperó solo. La ventana de
pendientes era de 8 secuencias por lado con desalojo por orden de inserción:
cuando los dos productores se separaban más de 8 secuencias, los conjuntos de
claves dejaban de solaparse y no volvían a emparejar hasta que la deriva se
reducía. La ventana sube a **64** y el desalojo pasa a descartar las secuencias
más atrasadas, nunca la contraparte que aún está llegando. Cubierto por
`overlay-v2-shadow-runtime.test.ts` con una ráfaga completa de un lado y fase
alternante.

## 2. Qué lógica sube a Go

### `builder_session.go`

- `BuildSession` sale de `builder_player.go` a su propio archivo.
- `Flag` se publica **missing** de forma deliberada y documentada: el
  `ObservedState` canónico no tiene ninguna señal de bandera, ni global ni por
  sector. El builder declara la ausencia en vez de inventar un verde por
  defecto. Overlay v1 tiene el mismo hueco, así que ambos contratos coinciden.
- El resto del slice (`track`, `phase`, `remaining`, `maxLaps`) ya estaba y
  conserva la calidad por campo.

### `builder_standings.go`

Lo que antes resolvía el widget y ahora resuelve Go:

- **Orden de la clasificación.** Los vehículos con `Position` usable ordenan
  ascendente por ella; los que no la tienen quedan detrás conservando el orden
  observado. La ordenación es estable y **no muta** el slice del snapshot.
- **Fallback explícito.** `standings-view-model.ts:96` caía a `index+1` sin
  avisar cuando faltaba `Position`. El fallback vive ahora en Go, es
  determinista y está cubierto por test.
- **`ClassPosition`.** Derivada del orden final dentro de cada `ClassID`.
- **`PitState`.** Distingue solo los dos estados que el booleano `InPit`
  observa (`track` / `pit`) y se queda vacío cuando el propio booleano falta.
  No existe un enum `PitState` canónico.

## 3. Tamaño del frame con standings poblados

| Medición | Bytes |
| --- | ---: |
| Sintético Go completo @104 (`TestFrameV2SyntheticFullUnder64KiBWith104Vehicles`) | **34.650** |
| Golden real compacto @104 con 104 filas de standings | **21.775** |
| Golden real compacto @44 | ver `testdata/overlay_v2_44.golden.json` |

El presupuesto sigue verde: límite duro 64 KiB, objetivo 48 KiB. El golden real
queda muy por debajo del sintético porque el sintético rellena además
`relative`, `delta`, `fuel` y `spotter`, que este lote no puebla.

## 4. Paridad por widget

| Widget | Feature | Cobertura |
| --- | --- | --- |
| `racing-flags` | `session` | Paridad de valor mostrado v1↔v2 sobre goldens 1/20/44/104; ausencia de bandera compartida |
| `standings` | `standings` | Orden resuelto en Go respetado sin reordenar; identidad de jugador desde el frame; scope por clase; ciclo de vida de la fuente |

Widget de sesión elegido: **`racing-flags`**. Solo lee `frame.session`, sin
acoplamiento a vehículos, scoring ni histórico, así que es la sonda honesta del
slice. `race-schedule` se descartó: es un consumidor de calendario externo que
no toca telemetría y no demuestra nada del contrato.

El comparador ampliado trata el **orden de filas como significativo** y compara
por identidad de vehículo, no por índice.

## 5. Señales ausentes y pendientes

Declaradas ausentes, **no** inventadas:

| Campo | Motivo |
| --- | --- |
| `session.flag` | El `ObservedState` canónico no tiene señal de bandera |
| `standings[].carNumber` | El `VehicleState` canónico no tiene dorsal; no se deriva del nombre |
| `standings[].bestLap` | El contrato wire v2 no lleva mejor vuelta por fila |
| `standings[].interval` | El frame lleva el gap al líder, no al coche de delante |
| `rows[].driverNumber`, `teamCode`, `teamBrandColor`, `tireCompound` | Sin señal canónica detrás |
| `player.steering` | Ya declarado ausente en F6 |

Estos campos se exponen en `OVERLAY_V2_STANDINGS_DECLARED_GAPS` y el comparador
los declara en vez de compararlos, de modo que no pueden ensuciar el gate.

Pendiente para lotes posteriores: `relative`, `delta`, `fuel` y `spotter`
siguen sin poblar; `CapabilityModesV2` sigue en `none`.

## 6. Instrucciones de muestreo

1. Arrancar una sesión real con el overlay OBS o el compositor.
2. En la consola de la ventana del overlay: `__vantareOverlayV2Diagnostics()`.
3. Leer `shadow.frames` y `shadow.mismatches` — **son ya solo la fase live**.
4. `shadow.declaredDifferences` y `shadow.mismatchesByPhase` documentan las
   diferencias de contrato; no bloquean la conmutación.
5. `shadow.epochResets` indica cuántas veces se rotaron los acumuladores; un
   valor alto significa que la evidencia corresponde a la última carrera.
6. `overlay_v2_parse_duration.nonLiveSamples` avisa si la ventana live es corta
   comparada con el total ingerido.

Criterio de conmutación (sin cambios respecto al plan): 
`overlay_shadow_mismatches_total{feature,field,phase="live"} = 0` durante N
sesiones reales.
