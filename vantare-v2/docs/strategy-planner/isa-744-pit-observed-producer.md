# ISA-744 — pit degradado, estrategia observada y productor v2

Estado: implementado en rama de issue; pendiente de review.

## Frontera de pit

El derivador conserva cada intervalo cerrado de `In Pits` como
`ObservedPitLaneInterval`. `In Pits` cubre todo el carril, por lo que la salida
no publica ni estima tránsito, cajón o duración de servicio.

Fuel y Virtual Energy solo se asocian al intervalo cuando el canal continuo
declara `TimeOriginSourceTimestamp`. El algoritmo suma incrementos positivos
mayores de `0,01` dentro del intervalo y calcula la tasa sobre el episodio de
subida (`último incremento - primer incremento + un periodo de muestra`). No
estima offsets entre relojes.

- reloj desconocido: `ambiguous=true`, motivo `resource_clock_unaligned`;
- reloj común sin subida: `ambiguous=true`, motivo
  `no_resource_rise_detected`;
- subida observable: delta y tasa presentes, con calidad de familia `unknown`
  porque A4 sigue degradada.

La agregación acepta solo la misma combinación, elimina sesiones repetidas y
recalcula media, N, rango y varianza por separado para L/s y pp/s. Nunca mezcla
las dos unidades en un mismo rango.

## `ObservedStrategy v1`

El extractor acepta únicamente sesiones clasificadas como carrera. Reutiliza
los `StintBoundary` de F3-a2 para producir stints y vueltas de parada. Conserva
el código raw de `TyresCompound` solo cuando las cuatro ruedas coinciden; no le
asigna un nombre semántico.

Los cambios observables publicados son:

- salto de Fuel ya identificado por F3-a2;
- cambio de neumático indicado por la frontera de stint;
- subida de desgaste mayor de 2 pp entre fronteras `Lap Dist` del mismo reloj
  continuo.

El resultado incluye número de vueltas completadas y la suma de sus tiempos.
`completed` solo se activa con un `Finish Status` observable; la posición queda
ausente porque el contrato histórico auditado no aporta una fuente fiable.

## Productor `StrategyInputProjection v2`

La entrada es una combinación y una selección ordenada de sesiones. Cada
sesión puede aportar de forma independiente clasificación, validez/segmentos,
consumo/ritmo, curvas, tyres/ahorro y pit. Un puntero ausente se convierte en
`missing` con motivo y no impide componer las demás familias.

El productor:

1. valida identidad y evita sesiones duplicadas;
2. agrega consumo y curvas con las funciones de F3-a3/F3-a4;
3. conserva buckets de clima y el bucket con mayor N como resumen escalar;
4. conserva la mejor evidencia disponible de tyres y ahorro;
5. agrega pit solo entre sesiones de la misma combinación;
6. publica mapas y listas vacías, nunca `nil`, para familias ausentes.

Todas las familias contractuales llevan presencia/calidad, procedencia,
confianza versionada y motivo cuando no son utilizables.

## Fixtures y contract test

- `pit-observed-v1.json`: reloj común, reloj desconocido y pit sin subida.
- `observed-strategy-derived-v1.json`: tres stints, cambios y resultado.
- `projection-producer-v1.json`: inventario versionado de las nueve familias.
- fixtures old/new de F1.2: el wire v2 producido valida en el consumidor; el
  fixture `strategyinputprojection.v1` se rechaza por versión sin fallback.

## Verificación

```text
go test ./internal/telemetryanalysis/... -count=1
go test -race ./internal/telemetryanalysis/... -count=1
go vet ./internal/telemetryanalysis/...
go test ./internal/strategy/... -count=1
gofmt -l internal/telemetryanalysis
git diff --check
```

`go test ./...` requiere `frontend/dist` para los paquetes con `go:embed`; ese
árbol no está presente en este worktree y el límite se reporta por separado.
