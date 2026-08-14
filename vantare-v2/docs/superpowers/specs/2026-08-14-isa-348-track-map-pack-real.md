# Spec: ISA-348 / TM-02 — Pack real de circuitos

Rama: `vantareapp/isa-348-tm-02-track-pack`
Base: `vantareapp/isa-344-tm-01-track-map` @ `9615519` (apilada sobre TM-01, que aún no está integrada).

## Objetivo

Llenar el pack de geometría con los circuitos reales de LMU, generados offline a
partir de la telemetría que el juego ya escribe, sin capturar nada nuevo.

## Hallazgo de partida

Los canales `GPS Latitude` / `GPS Longitude` de la telemetría DuckDB de LMU no son
geográficos: son la posición mundo del coche anclada en 60°N, 0°E.

```
worldX = lon * cos(60°) * K
worldZ = (lat - 60)  * K
```

Verificado contra los 44 vehículos de `testdata/lmu-fixture.bin`: RMS 1,07 m,
rotación 0,00°, sin reflexión, traslación nula. Ancla constante en 16 circuitos.

## Decisión: no se escribe ningún lector de DuckDB

`internal/telemetryanalysis/duckdbadapter` ya existe y está en Nightly, pero su
contrato es de producto: exige runtime firmado con digest de manifiesto,
artefacto autorizado, copia en staging llamada `session.duckdb` y evidencia
SHA-256 coincidente. Montar eso para una herramienta de desarrollo es
desproporcionado, y escribir un segundo lector está prohibido.

**Salida: el paquete de geometría no toca ficheros.** Recibe muestras ya
extraídas y devuelve un trazado. La extracción es un paso separado que usa el
CLI `duckdb` que ya está instalado.

Consecuencias:

- cero dependencias nuevas en `go.mod`;
- cero acoplamiento a DuckDB en la lógica que importa;
- la lógica queda cubierta por tests con fixtures CSV y por el oráculo real;
- si TA-04 abre en el futuro una vía cómoda de lectura, el paquete se conecta
  sin cambiar una línea, porque su entrada son muestras y no rutas.

## Estructura

```
internal/trackgeometry/        → lógica pura, sin I/O; cubierta por go test ./...
tools/trackgeometry/           → CLI: extrae con duckdb, genera el pack
frontend/src/overlay/track-geometry/track-geometry-pack.ts → destino
```

`internal/trackgeometry` es autoría offline del pack, no runtime. No lo importa
ningún camino de producto, así que no entra en el binario; vive en `internal`
para que CI lo pruebe y para poder leer `testdata/`.

## Comandos

```
Test Go:    go test ./internal/trackgeometry/...
Suite Go:   go test ./...
Frontend:   pnpm --dir frontend test | lint | build
Generar:    go run ./tools/trackgeometry -telemetry "<...>\UserData\Telemetry" -out <pack.ts>
```

## Contrato del paquete puro

```go
type Sample struct {
    LapDistance float64 // m
    Latitude    float64 // pseudo-grados
    Longitude   float64 // pseudo-grados
    InPit       bool
}

type Point struct{ X, Z float64 } // metros mundo

func WorldPosition(latitude, longitude float64) Point
func Build(samples []Sample, options Options) (Result, error)
```

`Result` expone el trazado, la longitud integrada, la cobertura y el número de
vueltas usadas, para que la herramienta pueda reportar en vez de afirmar.

## Reglas de validación

Fallan cerradas, con error tipado:

- muestras en boxes se descartan antes de nada;
- una vuelta solo cuenta si es completa y su `lapDist` avanza sin retrocesos
  grandes;
- sin ninguna vuelta completa no se emite geometría: el circuito se reporta como
  no cubierto;
- la cobertura de bins debe superar el umbral; un trazado con huecos se rechaza
  en lugar de interpolarse a ciegas;
- valores no finitos invalidan la muestra, nunca se convierten en cero.

## Estrategia de pruebas

TDD por microcortes, table-driven.

Obligatorio:

- `WorldPosition` contra el oráculo real: los 10 vehículos fuera de boxes de
  `testdata/lmu-fixture.bin` emparejados por `lapDistance` con una traza real,
  exigiendo RMS por debajo del umbral;
- vuelta incompleta, retroceso, boxes y no finitos rechazados;
- determinismo: misma entrada, mismo trazado;
- cierre del bucle y longitud integrada coherente con `lapDist`.

## Límites

- **Siempre:** copia read-only, original intacto; reportar circuito no cubierto
  en vez de emitir geometría parcial; sanitizar (sin piloto, tiempos ni fechas).
- **Preguntar antes:** añadir dependencias; leer DuckDB desde producto; tocar
  `internal/telemetryanalysis`.
- **Nunca:** escribir sobre la telemetría original; inventar puntos para tapar
  huecos; duplicar el lector de TA.

## Criterios de éxito

1. `K` fijada con evidencia y error acotado.
2. Oráculo real en verde bajo el umbral acordado.
3. Vueltas inválidas rechazadas de forma demostrable.
4. Cada circuito emitido declara longitud integrada y desviación.
5. Circuito sin vuelta válida reportado, no rellenado.
6. `go test ./...` y frontend en verde; `go.mod` sin cambios.

## Preguntas abiertas

1. **Corrección a centerline con `Path Lateral`.** El signo de la normal no está
   verificado. Queda fuera de este corte: promediar varias vueltas ya cancela la
   mayor parte de la variación de trazada. Se documenta como mejora posterior.
2. **Variantes de trazado.** Spa empaqueta tres layouts. Si el nombre del DuckDB
   no los distingue, se cubre la variante observada y se documenta el resto.
