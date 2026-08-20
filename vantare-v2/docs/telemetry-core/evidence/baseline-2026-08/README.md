# Baseline F0 — Overlay projection + JSON

Fecha: 2026-08-19. Issue: ISA-373. Esta baseline mide `ProjectV1` y
`json.Marshal` sobre el mismo `FinalState`, calentado durante cuatro frames.
No usa build tags ni código de producción adicional.

Entorno: Windows/amd64, Go 1.26.4, AMD Ryzen 7 3700X, `GOMAXPROCS=16`.
Comando:

```powershell
go test ./internal/telemetry/projection/overlay -run '^$' -bench BenchmarkOverlayProjectionAndMarshal -benchmem -count=5
```

`benchstat` no estaba instalado. La tabla usa la mediana manual de las cinco
repeticiones; `payload_bytes` es determinista.

| Vehículos | ns/op | B/op | allocs/op | payload_bytes |
|---:|---:|---:|---:|---:|
| 1 | 19.965 | 12.139 | 21 | 4.425 |
| 20 | 270.839 | 158.643 | 21 | 54.685 |
| 44 | 555.716 | 374.745 | 22 | 118.235 |
| 104 | 1.593.117 | 1.160.221 | 29 | 277.119 |

El payload Overlay de 104 vehículos supera el límite vigente de 262.144
bytes; F0 solo congela la medición y no cambia ese contrato.
