# ISA-884 — Relative sobre progreso temporal de vuelta

Fecha: 2026-08-27. Base final: `origin/nightly@2672f211`. Rama:
`vantareapp/isa-884-relative-time`. Implementación: `e929de03`, `8459101b`,
`c8cb943f` y `b344ee44`.

## Resultado contractual

Relative representa tráfico físico alrededor del jugador en un circuito
circular. La ventana se selecciona por `LapDistance`, no por clasificación ni
por disponibilidad del texto de gap. Su orden es:

1. coches por delante, de lejano a cercano;
2. jugador;
3. coches por detrás, de cercano a lejano.

El gap mostrado es temporal y firmado respecto al jugador: positivo delante,
cero para el jugador y negativo detrás. `relativeLapDelta` conserva de forma
independiente la diferencia de vueltas de clasificación; nunca invalida ni
sustituye los segundos físicos.

## Flujo de autoridad

```text
equivalente nativo del simulador
  -> driver concreto
  -> standings.lap_progress_time (Field con calidad y procedencia)
  -> reducer canónico
  -> standings.relative-gaps@2 (Go)
  -> BuildRelative / proyección Overlay
  -> ViewModel visual
  -> WidgetVisualHost
```

LMU mapea `mTimeIntoLap` de cada fila scoring, `float64` en offset `+464`.
Valores finitos positivos, cero y negativos son datos observados válidos. La
derivación calcula `vehicle - player` y normaliza el resultado al arco temporal
firmado más corto usando una vuelta estimada observada y positiva del jugador
como periodo. No estima la coordenada desde distancia, velocidad ni gaps al
líder.

`BuildRelative` conserva la magnitud de ese arco y orienta el signo mediante la
topología física que ya resolvió: delante positivo, detrás negativo y jugador
cero. Esto cubre también pit lane, donde LMU puede situar un coche físicamente
delante mientras su coordenada temporal circular queda al otro lado del ancla.
No se descarta la señal por estar en pit ni se inventan segundos. El ViewModel
V2 recibe el signo terminado y solo lo formatea; V1 aplica la misma orientación
visual como compatibilidad legacy hasta su cutover.

SimX demuestra la neutralidad del contrato mapeando su equivalente exacto: su
fuente cerrada conoce el tiempo transcurrido dentro de la vuelta y el periodo
de cada coche. Cualquier driver futuro deja la señal `missing` mientras no
exista un equivalente nativo exacto demostrado. No hay ramas por simulador por
encima del driver y no se añadió un contrato de ViewModel alternativo.

## Ausencia y datos contradictorios

El cero individual sigue siendo válido. Las fixtures antiguas LMU 1.3/1.4
revelan, sin embargo, un patrón de fuente no poblada: todos los coches publican
exactamente cero mientras `mLapDist` demuestra que ocupan puntos distintos del
circuito. El driver marca ese conjunto `missing`; conservar los ceros
fabricaría gaps `0.0`. Un valor no finito permanece `invalid` y no se degrada a
`missing` por esa regla.

Si falta el gap temporal de un vecino, `BuildRelative` conserva la fila física
y publica únicamente `gapSeconds.q=missing`. Si falta la distancia del jugador,
publica el ancla del jugador sin inventar vecinos.

## Encaje arquitectónico

El corte aplica ADR 0004 sin cambiar sus fronteras: adquisición y peculiaridad
LMU permanecen en el driver; schema, reducer y derivación son neutrales al
simulador; la proyección entrega datos listos para presentar; React no calcula
telemetría. Por ello no hace falta un ADR nuevo.

La selección física compartida también alimenta la marca dirty de Relative.
Así, cadence y builder no mantienen algoritmos paralelos que puedan escoger
filas distintas. El comparador shadow vuelve a contrastar `gapText`, porque V1
y V2 ya comparten semántica física.

## Regresiones

- derivación temporal alrededor del wrap y con lap delta de clasificación no
  nulo;
- cero, negativo, no finito y patrón de cero uniforme contradictorio en LMU;
- mapping SimX del mismo significado sin lógica específica sobre el driver;
- selección circular física aun cuando los gaps sugieren otro orden;
- vecino físico presente con gap `missing`;
- dirty mark idéntica a la ventana emitida;
- goldens Overlay v2 de 1, 20, 44 y 104 coches;
- ViewModels y comparador shadow sin veto por `relativeLapDelta`, con la misma
  ventana y orientación aunque jugador o rival estén en pit;
- renderizadores Original y Crystal con 2 filas `ahead`, jugador y 2 filas
  `behind` aun bajo estado pit.

## Gates locales

- `go test ./... -count=1`: PASS;
- `go test ./internal/telemetry/... -count=1`: PASS;
- `go test ./internal/telemetry/drivers/lmu -count=20`: PASS;
- `go test ./internal/telemetry/derive -count=20`: PASS;
- `pnpm test`: PASS, 417 archivos y 3.144 tests;
- regresiones Relative/Shadow: PASS, 3 archivos y 42 tests;
- regresiones visuales Original/Crystal: PASS, 2 archivos y 25 tests;
- `pnpm typecheck`: PASS;
- ESLint sobre los seis archivos frontend modificados: PASS;
- `pnpm build`: PASS; conserva el warning conocido de chunk principal grande;
- `go vet ./internal/telemetry/...`: conserva solo dos avisos heredados de
  `unsafe.Pointer` en `reader_windows.go` y `version_windows.go`, fuera del diff.

La primera ejecución global en paralelo encontró la expectativa SimX obsoleta
y un timeout de `voiceinput`. El primero se corrigió mapeando el equivalente
temporal exacto de SimX; el segundo pasó aislado y la repetición completa sin
competencia pasó. No se debilitó ningún test.

## Prueba real LMU / Wails

La app combinada con ISA-879 se reconstruyó desde esta rama con el
`frontend/.env.local` autorizado leído solo en memoria. El preflight mostró
únicamente los dos nombres públicos como `SET`; `cmd/vantare/supabase_build.go`
se generó temporalmente y se eliminó en `finally`. LMU 1.4130 permaneció abierto
en una práctica y Telemetry Core publicó estado `live` sobre el servidor propio
`127.0.0.1:39262`.

La ventana Overlay nativa de Wails mostró los cuatro widgets del perfil activo.
Relative renderizó 2 coches delante + jugador + 2 detrás y, en la build final,
los cuatro rivales conservaron segundos aun con coches en pit. Una muestra DOM
real fue `+32.9`, `+15.9`, jugador `—`, `-8.8` y `-8.9`; Standings publicó 18
filas, Pedals recibió valores y Delta declaró sus datos ausentes sin inventarlos.
La captura nativa confirmó los renderizadores productivos Original, no un mock
de navegador.

Una captura SSE continua alineó V1/V2 con una secuencia en la que la sección
Relative fue realmente reconstruida (`sequence=59402`) y obtuvo
`mismatch: []`: mismos ids, orden, segundos, texto y tono. Comparar todos los
frames por la cabecera global produce falsos positivos porque Relative está
memoizado a 4 Hz mientras `FrameV2.sequence` avanza a 60 Hz. Ese defecto del
gate, general a secciones reguladas, quedó separado en #887; no se amplió una
tolerancia ni se cambió la cadencia dentro de ISA-884.

Con Hub y Overlay abiertos, 13 muestras durante 142 s dejaron el árbol de 9
procesos entre 542,9 y 613,2 MiB y terminaron en 585,8 MiB. El WebView mayor
terminó en 175,3 MiB. Hubo picos que regresaron; no apareció el crecimiento
monótono de varios MiB/s del incidente anterior.

La inspección geométrica también distinguió un dato local ajeno a este corte:
el layout persistido del perfil coloca Delta en `top=940`, `height=240` sobre un
viewport de 1080 px, por lo que queda recortado. El renderer y su DOM existen;
ISA-884 no modifica posiciones guardadas del usuario.
