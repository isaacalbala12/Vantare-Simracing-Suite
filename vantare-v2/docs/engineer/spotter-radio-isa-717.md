# ISA-717 / F3 — Spotter unificado sobre radio.v1

Fecha: 2026-08-21. Rama: `vantareapp/isa-717-spotter-unificado`.
Base: `origin/nightly@df6ef2e14c861bae2f153b452df3b9b2b8e785b4`.

## Diseño entregado

- `internal/spotter/geometry` es la única autoridad numérica y algorítmica de
  solape lateral. El Spotter legacy conserva wrappers de compatibilidad y
  `builder_spotter` del frame v2 llama al mismo paquete; el contrato wire v2 no
  cambia.
- `internal/spotter` consume directamente `ObservationSnapshotV1`, la misma
  observación canónica entregada a `EngineerService` por el puerto asíncrono F7.
  No abre LMU, no crea otra fuente y no posee goroutines.
- Los siete intents del catálogo se registran en el resolver de `internal/radio`
  con los textos exactos `es`, `en`, `it` y `pt-BR`. Todos son P0, tienen TTL de
  tres segundos y comparten el sujeto `player`.
- La policy conserva la matriz `all-clear/left/right/three-wide`, debounce de
  350 ms, clear diferido 150 ms y `still_there` a 3 s. Un estado P0 pendiente
  menos específico se sustituye por el estado actual. Un clear contextual solo
  puede apoyarse en un antecedente cuyo ACK `started` haya llegado; seleccionar
  o encolar no comunica. `still_there` no renueva ese contexto. Source, epoch,
  sesión, disable y stop borran estado, cola y cooldowns.
- La entrega usa el mismo slot activo de `EngineerService`, el player cancelable
  y el router cache-only. El adaptador Go vuelve a publicar
  `EngineerNotification`, por lo que se conservan `engineer:notification`,
  `engineer:stream` y `/engineer/stream` sin cambios frontend.

## Desconexión legacy y rollback

`approvedProjectionFamilies` ya no contiene `FamilySpotter`, y la evidencia de
las otras familias se construye sin ejecutar la geometría ni los semantic
claims Spotter antiguos. Fuel, penalties, laps, timings y pitstops continúan en
el stack anterior hasta F4.

El rollback de un ciclo es explícito y exclusivo:

```powershell
go run ./cmd/vantare -engineer-legacy-spotter -profile configs/example-racing.json
```

El flag debe fijarse antes de `EngineerService.Start`. Cuando está activo, el
productor radio queda apagado para evitar dobles anuncios. Sin el flag, el
camino productivo es radio.v1.

## Benchmark reproducible

El harness crea una observación canónica con rival lateral, un bus nuevo y un
clip WAV fake. El cronómetro empieza antes de
`Producer.Evaluate(observation)` y se detiene al entrar en `PlayContext`; para
entonces `queued` y `started` ya han sido confirmados y `Item.Started()` ha
avanzado el contexto.

```powershell
go test ./internal/spotter -run '^$' -bench '^BenchmarkObservationToRadioStarted$' -benchmem -count=3
```

Resultado local, Windows amd64, AMD Ryzen 7 3700X:

| repetición | ns/op | B/op | allocs/op |
| ---: | ---: | ---: | ---: |
| 1 | 12.076 | 1.837 | 26 |
| 2 | 12.265 | 1.837 | 26 |
| 3 | 12.368 | 1.837 | 26 |

Esto demuestra el carril Go sintético, no el p95 del binario Wails, el driver
de audio real ni una sesión LMU.

## Validación local

- `gofmt` sobre los archivos Go modificados: limpio.
- `go vet ./internal/radio/... ./internal/spotter/... ./internal/engineer/... ./cmd/vantare`: PASS.
- `go test ./internal/radio/... ./internal/spotter/... ./internal/engineer/... -count=1`: PASS.
- `go test ./internal/telemetry/projection/overlayv2 -count=1`: PASS.
- `go build ./internal/...`: PASS.
- `go test ./... -count=1`: PASS.
- Digest del roadmap reproducible y fragmento `ISA-717.json` válido contra su
  schema. Se generó `frontend/dist` desde el lockfile existente solo como
  precondición local de `go:embed`; no hay cambios frontend versionados.

## Gate humano LMU real — pendiente de Isaac

No ejecutar con `-engineer-legacy-spotter`. Desde el worktree/SHA que se quiera
validar:

```powershell
go run ./cmd/vantare -live=true -profile configs/example-racing.json -http 127.0.0.1:39261
```

Con LMU abierto, usar una sesión con tráfico real y completar esta matriz:

1. Provocar coche a izquierda, coche a derecha y tres en paralelo. Confirmar
   una frase audible y una presentación visual por transición, sin dobles.
2. Mantener un rival lateral más de tres segundos y confirmar `still_there`.
   Después provocar el clear y comprobar que no aparece un clear falso si el
   aviso antecedente no llegó a empezar.
3. Mientras habla un aviso no crítico del Engineer, entrar en solape lateral:
   Spotter debe preemptarlo y empezar sin esperar al audio anterior.
4. Entrar/salir de pits y cambiar/reiniciar sesión. No debe sobrevivir ningún
   clear, cooldown ni presentación de la generación anterior.
5. Abrir otro PowerShell y comprobar health:

   ```powershell
   Invoke-RestMethod http://127.0.0.1:39261/api/engineer/health | ConvertTo-Json -Depth 8
   ```

   Esperado: `ok=true`, `connected=true`, `lastError` vacío,
   `radioDelivery.samples > 0` y `radioDelivery.p95MS < 150`.
6. Comprobar el mismo evento visual por SSE durante otra transición:

   ```powershell
   curl.exe -N --max-time 30 http://127.0.0.1:39261/engineer/stream
   ```

   El evento `presentation` debe llevar `textKey=spotter.*`, `role=spotter`,
   `channel=spotter`, `source=telemetry-core` y el mismo texto que la app.

Registrar SHA, duración, circuito, tamaño de parrilla, matriz PASS/FAIL, p95 y
errores sanitizados. No adjuntar nombres de pilotos, rutas privadas ni payloads
crudos. Este gate continúa abierto hasta que Isaac aporte esa evidencia.
