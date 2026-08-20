# ISA-372 / F8 — lote 2b: ControlsVM, SpotterVM y veredicto de damage

Fecha: 2026-08-20.

Rama: `vantareapp/isa-372-tc-f8-builders-lote2b`.

Base: `tc-integration@b17f6228` (F0–F8 lote 2a + F11 integrados).

## Resultado

Cierra los builders del contrato v2: **todas** las secciones del frame quedan
pobladas o declaradas con evidencia.

| Sección | Estado tras este lote |
| --- | --- |
| `session`, `player`, `standings`, `relative`, `delta`, `fuel` | Pobladas (lotes 1 y 2a) |
| `controls` | **Nueva y poblada**: historial de pedales derivado en Go |
| `spotter` | **Poblada**: presencia lateral desde el spatial canónico |
| `capabilities` | Poblada; `CapabilityModesV2` sigue en `none` (F10) |
| `damage` | **Declarada inexistente**, con la evidencia en el apartado 3 |

Overlay v1 sigue intacto y productivo: `overlayV2Features` está vacío por
defecto y ningún widget se conmuta.

## 1. Historial de controles: forma y coste

La derivación canónica ya mantenía `derive.FinalState.Derived.ControlsHistory`
(hasta 120 muestras, la misma serie que Overlay v1 proyecta como
`controlsHistory`). Lo que faltaba era publicarla en el contrato v2.

### Forma en el wire

```json
"controls": {
  "history": {
    "q": "fresh",
    "windowMs": 1000,
    "throttle": [750, 750],
    "brake": [125, 125],
    "clutch": [0, 0]
  }
}
```

Tres decisiones de forma, todas por tamaño y todas reversibles:

| Decisión | Alternativa descartada | Motivo |
| --- | --- | --- |
| Arrays paralelos | Array de objetos `{throttle,brake,clutch}` | Un número por muestra en vez de un objeto con tres claves repetidas 120 veces |
| Enteros por mil (0..1000) | Float con tres decimales (`0.123`) | Cuatro caracteres como máximo en vez de cinco, y la cuantización es exactamente los tres decimales que el widget dibuja |
| Un solo `windowMs` | Un timestamp por muestra | Las muestras son una por tick canónico, así que un único vano primero→último basta para reconstruir el eje x |

`windowMs` es cero cuando hay menos de dos muestras: un punto no abarca nada.

### Coste medido

| Escenario | Bytes |
| --- | ---: |
| Sección `controls` al máximo canónico (120 muestras) | **1.515** (`TestBuildControlsAtTheCanonicalMaximumStaysUnderTwoKiB`) |
| Sección `controls` en los goldens reales (2 muestras) | 95 |

El historial es **solo del jugador**, no de la parrilla: su coste es constante
y no escala con el número de coches.

### Cambio en `derive/pipeline.go`

`ControlSample` gana `CapturedAt`, copiado de `header.Clock.ReceivedUTC`,
exactamente como `SelfDeltaSample` ya hacía (`derive/delta.go:31,334`). Es el
mínimo necesario para que la serie lleve su propia base de tiempo: sin él la
serie solo tiene un orden y cualquier consumidor que la dibuje contra el tiempo
tendría que inventarse el espaciado. **No** es una derivación nueva: no calcula
nada, transporta un instante que el sobre ya traía.

### Diferencia declarada frente a Overlay v1

Overlay v1 acumulaba la serie en el navegador
(`input-telemetry-accumulator.ts`), un acumulador por id de widget alimentado
por los snapshots que llegaran, de modo que dos widgets mirando la misma vuelta
podían tener series distintas y un remount perdía la vuelta. Ahora hay una sola
autoridad y una sola regla de retención.

Lo que la serie canónica no puede llevar, declarado y no reconstruido:

| Campo | Motivo |
| --- | --- |
| `history[].capturedAt` | v2 lo reconstruye como paso constante sobre `windowMs`; exacto mientras el tick sea regular, aproximación del eje x si no |
| `history[].speedKph`, `rpm`, `gear` | La muestra canónica registra pedales; v1 guardaba además estos tres |

Se exponen en `OVERLAY_V2_CONTROLS_DECLARED_GAPS`. El acumulador de v1 **no se
borra**: sigue sirviendo al camino v1 y se retira con él en F9.

## 2. Spotter: semántica y relación con Engineer

El canónico sí tiene con qué responder: cada `core.VehicleState` lleva
`WorldPosition` y `Orientation`, y el driver de LMU los rellena
(`drivers/lmu/format.go:292-332`, desde scoring y telemetry con `preferFresh`).

`builder_spotter.go` rota las posiciones de los rivales al marco del jugador
(yaw desde `Orientation.Row2`, `atan2(X, Z)`) y declara un lado ocupado cuando
el rival cumple las tres condiciones a la vez.

| Umbral | Valor | Significado |
| --- | ---: | --- |
| Zona de pista | 20,0 m | Más allá, el coche no está al lado sino al otro lado del circuito |
| Ancho de coche | 1,8 m | Separación lateral mínima para estar *al lado* y no delante o detrás |
| Largo de coche | 4,5 m | Solape longitudinal por delante |
| Extra por detrás | 0,4 m | Solape algo mayor para el coche de atrás, que es el que no se ve |
| Velocidad mínima | 10,0 m/s | Por debajo, el spotter calla (parrilla, pit lane) |

Además: silencio si el jugador está en boxes; se descarta el rival en boxes o
con `LapDistance` negativa.

### Relación con Engineer

Son exactamente los números y las puertas de `internal/engineer/spotter` a
sensibilidad **normal** (`DefaultOverlapConfig`, `overlapConfigForSensitivity`,
`MinSpotterSpeedMPS`). La evidencia de Engineer para su spotter de audio se
construye con `spotter.Classify`
(`engineer/projectioninput/policy.go:49-57`), que es `ClassifyWithActiveSides`
con `ActiveSides{}`, o sea la misma clasificación sin histéresis que hace el
builder.

**No se puede reutilizar su código**: `engineer/spotter` clasifica un
`engineer/telemetry.Frame`, una forma rF2 propia del producto, y la proyección
solo ve el estado canónico. Además `internal/telemetry` no puede importar un
paquete de producto y el test de arquitectura lo impide.

Lo que sí se hace es **anclar** los números: dos tests importan
`engineer/spotter` (los tests están fuera del escaneo de arquitectura,
`TestScanProductionImportsIgnoresTestsGeneratedFilesAndTools`) y comprueban que
los umbrales coinciden uno a uno y que el veredicto coincide oferta a oferta en
un barrido de 13×8 offsets alrededor del jugador. Si alguien mueve un metro en
un lado, el otro lo nota.

### Divergencias declaradas, a unificar en F13

| Divergencia | Motivo |
| --- | --- |
| Sin puerta de Full Course Yellow | Engineer la deriva de la fase de juego rF2; el `ObservedState` canónico no tiene fase de sesión ni bandera (`BuildSession` deja `Flag` en missing). No se puede reproducir sin inventar una señal |
| Sensibilidad fija en normal | Engineer la expone como ajuste de usuario; el contrato v2 no tiene preferencia para ella y el frame publica la que usa la propia evidencia de Engineer |
| Sin lista de zonas, sin colapso de rivales apilados, sin identidad del rival más cercano | El contrato v2 son dos booleanos; colapsar rivales del mismo lado no puede cambiar si ese lado está ocupado |

### `mode`

`mode` es `xyz` **solo** cuando la clasificación pudo ejecutarse de verdad; si
no, `none` con los lados en missing. «No hay nadie al lado» y «no se puede
saber» son respuestas distintas y el contrato las mantiene separadas por la
calidad de `left`/`right`, no por el booleano.

`ModeXYZ` es aditivo sobre el enum `Mode` (`none|official|reconstructed|
estimated|xyz`), regenerado con `contract-gen` y aceptado por el validador del
transporte.

### Sin paridad v1

**No existe widget de spotter en Overlay v1** (ni en v2). No se crea un
ViewModel sin consumidor: sería código muerto y un renderizador paralelo sin
decisión que lo respalde. La cobertura son los tests unitarios del builder con
casos sintéticos izquierda / derecha / ambos / ninguno, más los dos tests de
anclaje contra Engineer. La sección queda poblada en el contrato para el
consumidor que la necesite.

En los goldens la sección sigue siendo `none`: en su fixture el jugador está en
boxes y sin orientación. Los goldens **no cambian** en esta tarea.

## 3. Damage: veredicto

**No hay señal de daño en el canónico y por eso no hay builder ni ViewModel.**

Cadena de evidencia:

| Dónde | Qué hay |
| --- | --- |
| `core.VehicleState` (estado observado completo de un vehículo) | Ningún campo de daño. `derive.DerivedState` tampoco |
| `schema/**`, `catalog/**` | Cero apariciones de daño |
| Overlay Projection v1 (Go) | Tampoco lo lleva: el adaptador del frontend lo lista como `unsupported-by-projection` (`overlay-projection-adapter.ts:70`) |
| Widgets v1 `car-damage-numbers` / `car-damage-visual` | Leen `snapshot.damage` vía `widget-types/shared/damage-reader.ts`; lo rellena el camino Wails heredado, no la proyección |
| `engineer/telemetry.VehicleTelemetry` | **Aquí sí**: `DentSeverity[8]` (mDentSeverity de LMU) y `WheelDetachedCount`, lector propio de Engineer, privado del producto y nunca promovido al esquema canónico |

Por eso `damage` queda **ausente** de `CapabilitiesV2` en lugar de declararse
presente y vacío: `Supported` dice lo que el driver activo puede entregar y
ningún descriptor anuncia daño. Publicar una sección alimentada por nada sería
inventar la señal, que es justo lo que el briefing prohíbe.

Dos tests fijan el veredicto en
`internal/telemetry/projection/overlayv2/damage_capability_test.go`: uno
comprueba que ninguna capability publicada menciona daño y otro lee
`core.VehicleState` y **falla** el día que aparezca un campo de daño, que es
cuando habrá que revisar esta decisión.

### Qué haría falta (enganche para F10)

En orden: (1) dominio de daño en el esquema canónico; (2) el driver de LMU
mapeando `mDentSeverity` y el contador de ruedas desprendidas a ese dominio;
(3) capability `damage` en el descriptor del driver; (4) solo entonces builder
y ViewModel. Los tres primeros son trabajo de adquisición y pertenecen a F10.
Este lote no toca ninguno de sus archivos.

## 4. Presupuesto del frame @104

| Escenario | Bytes | Antes (lote 2a) | Límite |
| --- | ---: | ---: | --- |
| Sintético completo @104 (`TestFrameV2SyntheticFullUnder64KiBWith104Vehicles`) | **36.037** | 34.650 | < 65.536 ✅ |
| Golden real compacto @1 | 1.751 | 1.579 | — |
| Golden real compacto @20 | 6.359 | 6.186 | — |
| Golden real compacto @44 | 10.980 | 10.807 | — |
| Golden real compacto @104 | 23.116 | 22.942 | — |

El sintético sube 1.387 B: es la ventana canónica completa de 120 muestras de
pedales, que es el peor caso real y por eso se mide poblada. El golden sube
174 B en cualquier parrilla (95 B de `controls` con dos muestras + 62 B de
`spotter` + separadores): **constante**, porque ninguna de las dos secciones
nuevas escala con el número de coches.

## 5. Paridad y tests por feature

| Feature | Paridad | Cobertura |
| --- | --- | --- |
| `controls` | Sí, contra `input-telemetry` v1 | `input-telemetry-domain-free.test.ts` + `compareControls` en el shadow |
| `spotter` | **Sin paridad (feature nueva en overlay)** | Tests unitarios del builder: casos sintéticos izquierda/derecha/ambos/ninguno, puertas de silencio, heading rotado, y anclaje contra la geometría de Engineer |
| `damage` | No aplica | Tests de veredicto: capability ausente + tripwire sobre `core.VehicleState` |

### Comparador

`compareControls` entra en el mismo circuito que las demás features, con
métrica `overlay_shadow_mismatches_total{feature="controls",field,phase}` y
gate **solo en `phase=live`**. Tests de secuencia `stale→live` y del caso
`transition` cuando los dos contratos discrepan sobre la frescura.

| Campo | Tolerancia | Motivo |
| --- | ---: | --- |
| `throttle`, `brake`, `clutch` (y los de la serie) | 5e-4 | Medio paso de la cuantización a por mil |

La serie se compara **por solapamiento**: ambas se recorren desde la muestra
más nueva hacia atrás y se comparan los puntos que las dos cubren. No se
comparan longitudes, porque el acumulador del navegador empieza cuando monta el
widget y el historial canónico cuando empieza la sesión. Que una parte tenga
serie y la otra no **sí** es divergencia, y se reporta una sola vez como
`history.presence`.

El runtime de shadow alimenta el acumulador v1 con su propio id de widget al
aceptar cada snapshot, para que la serie comparada sea la que v1 habría
dibujado de verdad y no una reconstruida en el momento de comparar. Se limpia
junto al resto cuando cambia el epoch.

Spotter y damage no entran en el comparador y eso es el resultado de la tarea,
no un olvido: spotter no tiene camino v1 con el que comparar, damage no tiene
camino v2.

## 6. Estado global del contrato v2

Todos los builders de F8 están cerrados. Lo que queda no es de F8:

- `CapabilityModesV2` sigue en `none` — pertenece a F10 junto con
  `capability/` y el registro de drivers.
- `damage` necesita señal canónica antes que builder — F10.
- Unificar la geometría del spotter con Engineer — F13.
- Retirar `input-telemetry-accumulator.ts` y el resto del camino v1 — F9.
- `fuel.perLap`: sigue pendiente la derivación de consumo por vuelta en
  `derive/` (heredado del lote 2a).
- La línea de integración en `telemetry_core_runtime.go` y la excepción del
  wiring guard siguen sin aplicar (F10/F11).

## 7. Auditoría del trabajo heredado

Este lote empezó con ~24 archivos modificados sin commit de un worker anterior
que murió a mitad de T1. Se revisó como diff ajeno antes de continuar.

**Qué estaba hecho:** T1 completa y verde de punta a punta — sección
`controls` en `frame.go`, `builder_controls.go` con sus tests, registro en
`DefaultSectionBuilders` y en la cadencia como tier fast, `CapturedAt` en
`derive/pipeline.go`, goldens regenerados, TS regenerado, validador del
transporte, ViewModel v2 y su test domain-free, y la medida del presupuesto con
la ventana llena.

**Qué se verificó y se dejó como estaba:**

- El cambio en `derive/pipeline.go` está dentro de alcance. Es mínimo (un campo
  copiado del sobre), es necesario para poder publicar `windowMs`, y replica un
  patrón que ya existía en `SelfDeltaSample`. No introduce ninguna derivación
  nueva. **No se recortó.**
- Cambio aditivo en `frame.go`, historial tomado del canónico, registro
  correcto en `DefaultSectionBuilders` (el centinela byte a byte lo confirma),
  y ningún archivo propiedad de F10 tocado.

**Qué se corrigió:** se retiró de T1 la constante `OVERLAY_V2_SPOTTER` en
`overlay-v2-features.ts`, añadida por adelantado y sin uso en esa tarea. Al no
existir ViewModel de spotter (apartado 2), tampoco se reintrodujo en T2: sería
una feature flag sin consumidor.

## 8. Gates

Ejecutados por commit:

- `go build ./...` — verde salvo `build/ios`, fallo preexistente y excluido.
- `go vet ./tools/... ./internal/telemetry/... ./internal/app/...` — los 3
  `unsafe.Pointer` preexistentes, nada más.
- `go test ./tools/... ./internal/telemetry/... ./internal/app/... -count=1` —
  verde excluyendo `internal/app/launcher`, que tiene un panic preexistente en
  `TestDiscoverIconsSmoke` (`assignment to entry in nil map`), ajeno a este
  trabajo.
- `go run ./tools/telemetry-contract-gen -check` — verde.
- Centinelas verdes en cada commit:
  `TestCachedProjectorMatchesProjectV2ByteForByte` y
  `TestFrameV2SyntheticFullUnder64KiBWith104Vehicles`.
- `pnpm --dir frontend test` — 406 archivos / 2.978 tests verdes. En una de las
  ejecuciones falló `TestingCenterPage.test.tsx` bajo carga paralela; pasa en
  aislamiento y en la repetición completa. Es flaky de UI, ajeno a telemetría.
- `pnpm --dir frontend exec tsc -b --noEmit`, lint focal y `git diff --check` —
  verdes.

Sin push, PR, CI remoto, merge, promoción ni release.
