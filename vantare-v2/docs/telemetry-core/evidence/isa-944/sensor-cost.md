# ISA-944 — coste marginal del sensor

## Microbenchmark de `HostSampler.Sample`

Equipo: AMD Ryzen 7 3700X, Windows amd64. Comando:

```text
go test ./internal/app/performance/sensor -run '^$' -bench '^BenchmarkHostSamplerMarginalCost$' -benchtime=20x -count=3 -benchmem
```

Antes de cachear el inventario de PIDs (`HEAD 731968d1`, implementación todavía
sin el cambio P2.5):

| Condición | ns/op (3 corridas) | B/op | allocs/op |
| --- | --- | --- | --- |
| OFF | 40 / 50 / 100 | 0 | 0 |
| ON | 80.216.315 / 88.772.060 / 109.934.125 | 380.506–381.942 | 1.824–1.831 |

Después, simulando el ticker real de 1 Hz y un refresh del inventario cada 5 s:

| Condición | ns/op (3 corridas) | B/op | allocs/op |
| --- | --- | --- | --- |
| OFF | 20 / 50 / 20 | 0 | 0 |
| ON 1 Hz | 11.788.930 / 14.959.365 / 17.178.185 | 75.972–76.437 | 368–369 |

La mediana ON baja de 88,77 ms a 14,96 ms por muestra (-83,1 %); bytes y
asignaciones bajan aproximadamente un 80 %. CPU/RAM de los PIDs conocidos se
siguen leyendo cada segundo; solo el inventario PID→PPID se reutiliza cinco
segundos. Procesos muertos se omiten inmediatamente al fallar su lectura y un
WebView nuevo puede tardar como máximo cinco segundos en entrar en la suma.

## A/A Wails + LMU

El guion reproducible es `scripts/bench/isa944-sensor-cost.ps1`: usa el mismo
binario, perfil, nivel 5 y sesión LMU para OFF y ON; mide el árbol completo de
la app durante 60 s por condición e incluye el PresentMon propio en ON. Valida
que Automático no abandona el nivel 5 fijado y limpia únicamente su PID/sesión.

La ejecución física `sensor-cost-20260830-034626` se realizó con LMU en Spa,
práctica WEC 2026, jugador en el garaje e IA rodando, sin otro Vantare ni Vitest
activo. Cada condición tuvo 10 s de calentamiento y 60 ventanas de CPU de 1 s:

| Condición | CPU media (%) | CPU p95 (%) | Private MB media |
| --- | ---: | ---: | ---: |
| Sensor OFF | 1,8917 | 2,7364 | 267,36 |
| Sensor ON | 2,0637 | 2,8979 | 275,32 |

El coste marginal observado fue +0,1720 puntos de CPU media (+9,09 % relativo),
+0,1615 puntos de CPU p95 (+5,90 %) y +7,96 MiB privados (+2,98 %). El log ON
contiene 109 decisiones, todas en nivel 5; 108 llevan frametime real de LMU y
la primera queda `unavailable` mientras arranca PresentMon. Tras cerrar no quedó
ningún `vantare-*.exe` ni `VantareSensor-*`; permaneció únicamente el
PresentMon de Radeon asociado a `RSXTraceSession`.
