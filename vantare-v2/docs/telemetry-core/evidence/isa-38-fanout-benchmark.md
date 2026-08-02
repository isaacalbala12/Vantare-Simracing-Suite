# ISA-38 — baseline fan-out

Fecha: 2026-07-28

Plataforma: Windows/amd64

CPU: AMD Ryzen 7 3700X 8-Core Processor

Comando:

```powershell
go test ./internal/telemetry/core -run '^$' `
  -bench 'BenchmarkFanout' -benchmem -count=5
```

## Resultado

| Benchmark | ns/op por repetición | Memoria |
|---|---|---|
| `PublishSnapshot64Vehicles` | 3.753; 4.349; 4.489; 4.843; 5.432 | 16.384 B/op; 1 alloc/op |
| `PublishSnapshotScalar` | 238,6; 231,1; 231,1; 249,2; 251,6 | 0 B/op; 0 allocs/op |
| `WriteFact` | 136,2; 134,2; 129,1; 132,4; 133,2 | 0 B/op; 0 allocs/op |

`PublishSnapshot64Vehicles` incluye la copia de ownership al crear el snapshot
de 64 vehículos. Los otros dos benchmarks aíslan la frontera fan-out. Estos
valores son una medición local fechada, no un SLA ni un rango estable entre
cargas distintas del equipo.
