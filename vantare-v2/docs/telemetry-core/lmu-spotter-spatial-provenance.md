# LMU Spotter spatial provenance — ISA-130 / TC-08A.1

Estado: implementado y verificado sobre la base ISA-108. Este documento fija
únicamente geometría canónica; no activa Spotter ni Engineer.

## Resultado

Telemetry Core conserva ahora, por vehículo, posición mundo, velocidad local y
orientación desde el único reader LMU existente hasta `core.VehicleState`.
Cada valor mantiene presencia y freshness explícitas. Un valor espacial no
finito o una matriz no ortonormal queda `invalid`; no se rechazan por ello los
campos independientes de sesión o scoring.

## Contrato fuente

La estructura de referencia compatible con `InternalsPlugin.hpp` declara:

| Campo | Tipo fuente | Semántica | Unidad |
|---|---|---|---|
| `mPos` | tres `double` | posición en mundo | metros |
| `mLocalVel` | tres `double` | velocidad en coordenadas locales del vehículo | m/s |
| `mOri` | 3 × 3 `double` | filas de la matriz de orientación | adimensional |

La copia local de la definición usada para contrastar nombres, unidades y
packing tuvo SHA-256
`439572ea3db4200b594d1147b66f35ed2782b82b7c74dc4eef7c41aca5d9ae05`.
El generador independiente que calculó el layout tuvo SHA-256
`21ba6f4bde141e0683b90d3edf0221bfa67cda5cba535e86a7788639b6de57b5`.
Esas copias son evidencia de auditoría, no dependencias del producto ni código
reutilizado por Vantare.

## Offsets admitidos

Todos los offsets son relativos al inicio de la fila y usan packing Windows de
4 bytes ya fijado por TC-03/TC-07.

| Scope | Base/stride | Posición | Velocidad local | Orientación |
|---|---:|---:|---:|---:|
| `LMUVehicleScoring` | 2192 / 584 | 264 | 288 | 336 |
| `LMUVehicleTelemetry` | 128468 / 1888 | 160 | 184 | 232 |

Scoring aporta los tres campos para todos los IDs activos. Para el único
jugador marcado por scoring, la fila telemetry del mismo `mID` sustituye cada
valor con la muestra rápida cuando esa muestra es válida; si un campo rápido es
inválido, se conserva su equivalente scoring válido. Nunca se une por índice,
nombre, posición de carrera ni orden de filas.

## Ejes y handedness

El frame local LMU/rFactor es:

- `+X`: izquierda del piloto;
- `+Y`: arriba;
- `+Z`: parte trasera del coche;
- forward: `-Z`.

`mOri` se almacena por filas. Sus columnas expresan los ejes locales
izquierda/arriba/atrás en coordenadas mundo. La matriz real auditada tiene
determinante `0.999999986981119` y norma aproximadamente uno en sus tres filas;
por tanto se admite como ortonormal y right-handed. El parser exige finitud,
normas unitarias, ortogonalidad y determinante cercano a `+1` con tolerancia
`1e-3`.

La transformación usada únicamente como oráculo de test es:

```text
deltaWorld = opponentPosition - playerPosition
localLeft  = dot(deltaWorld, column0(mOri))
localUp    = dot(deltaWorld, column1(mOri))
localRear  = dot(deltaWorld, column2(mOri))
```

`localLeft > 0` significa lado izquierdo. Esta fórmula no activa todavía la
máquina de estados Spotter.

## Evidencia real

Fixture: `testdata/lmu-fixture.bin`.

- LMU `1.3.0.0` inferido y ya admitido por el contrato versionado;
- SHA-256
  `959c51421529c6157371678d8db9bcbbdc8ab3780bd5557828f2bc0d2225e5ff`;
- 44 vehículos activos, 44 geometrías scoring finitas y ortonormales;
- jugador: scoring row 43, `mID=0`; telemetry row unida por ese ID;
- posición telemetry del jugador:
  `(-487.8100280761719, -0.00456496141850948, -482.8159484863281)` m;
- velocidad local:
  `(0.00766611099243164, 0.171518176794052, -15.5912675857544)` m/s;
- el rival anonimizado `mID=30`, proyectado mediante las columnas de la
  orientación rápida del jugador, resulta
  `(left=63.8869364506716, up=-2.26703562668103, rear=189.645536363618)` m.

La fixture es una captura real sanitizada y hash-pinned. El oráculo geométrico
del test está escrito independientemente del parser y verifica números exactos,
no solo que parser y consumidor compartan la misma fórmula.

## LMU 1.4 y sanitización

Las fixtures LMU 1.4 de TC-07 fueron reconstruidas antes de este corte y, por
diseño, dejaron a cero los bytes espaciales. Esos ceros no prueban ausencia ni
una nueva convención. ISA-130 amplía la allowlist zero-rebuild para conservar
solo `mPos`, `mLocalVel` y `mOri` de filas activas; identidades siguen
reemplazadas por aliases deterministas y el resto permanece en cero.

El layout, tamaño y packing 1.4 ya están admitidos por evidencia separada. La
próxima captura real 1.4 podrá validar espacialmente esta misma convención sin
cambiar el contrato. Hasta entonces, el gate perceptual de tráfico real queda
agrupado con ISA-112; no se presenta una fixture 1.4 a cero como evidencia
espacial.

## Calidad y ciclo de vida

- Cero es una posición o velocidad válida y permanece presente.
- NaN/Inf produce `invalid` solo en el campo afectado.
- Una orientación degenerada, left-handed o fuera de tolerancia es `invalid`.
- La caducidad del reloj de origen convierte la geometría completa en `stale`.
- Menú sin vehículos no inventa geometría.
- Reorder conserva valores por ID; vacancy/reuse recibe nueva generación en el
  `BatchMapper`; reset y reconnect siguen las reglas existentes de sesión.
- No se añade ningún reader, goroutine, transporte o dependencia.

## Cadena implementada

```text
LMU_Data único
  -> parser LMU (VehicleObservation)
  -> Fusion matrix v4
  -> BatchMapper (core.VehicleState)
  -> Reducer / snapshots inmutables
```

No hay wiring hacia `internal/engineer/spotter`, audio, TTS, UI ni Strategy.
ISA-109 puede consumir este contrato mediante `projection/engineer`, sin abrir
LMU ni conocer offsets.

## Verificación y referencia de rendimiento

Los gates del corte se ejecutaron sobre Windows/amd64 con un Ryzen 7 3700X:

- Telemetry Core completo, diez repeticiones: PASS.
- Parser, mapper, fusion y catálogo, veinte repeticiones: PASS.
- Suite Go global después de generar `frontend/dist`: PASS.
- Build frontend: PASS; no hubo cambios frontend.
- Fuzzer del parser: 40.414 ejecuciones en 10 s, sin hallazgos.
- Fuzzer del sanitizador: 39.607 ejecuciones en 11 s, sin hallazgos.
- `go vet` focal conserva únicamente los dos avisos Win32 heredados por uso de
  `unsafe.Pointer` en `reader_windows.go` y `version_windows.go`.

Con 44 vehículos, cinco muestras del benchmark dieron:

| Operación | Tiempo | Memoria | Allocations |
|---|---:|---:|---:|
| parse | 49,3–53,7 µs/op | 29.548 B/op | 155 allocs/op |
| zero-rebuild sanitizer | 164,5–201,2 µs/op | ~360.134 B/op | 287 allocs/op |

La geometría aumenta el coste respecto a la referencia previa porque valida y
copia tres vectores/matrices por vehículo. El coste sigue por debajo de 0,06 ms
para el parse y 0,21 ms para la sanitización diagnóstica; el sanitizador no está
en el camino live normal. Estos números son la nueva referencia explícita para
regresiones posteriores, no un umbral relajado.

## Rollback

Revertir el commit de ISA-130 devuelve exactamente la base ISA-108. No hay
migración de datos, cambio de documento del usuario ni efecto remoto.
