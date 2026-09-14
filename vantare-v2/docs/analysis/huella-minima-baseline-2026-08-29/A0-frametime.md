# Huella mínima · A0

Corridas: `a0-20260828-234908.csv`, `a0-20260829-015330.csv`, `a0-20260829-020942.csv`. Ruido = desviación muestral / media; hacen falta al menos 3 corridas y el gate falla por encima de 5 %.

## WebView2 del sistema permitidos

No invalidan la corrida porque cada perfil tiene browser y GPU process propios.

| Corrida | Procesos | Perfiles `--user-data-dir` |
|---:|---:|---|
| 1 | 6 | `C:\Users\isaac\AppData\Local\Packages\MicrosoftWindows.Client.CBS_cw5n1h2txyewy\LocalState\EBWebView` |
| 2 | 6 | `C:\Users\isaac\AppData\Local\Packages\MicrosoftWindows.Client.CBS_cw5n1h2txyewy\LocalState\EBWebView` |
| 3 | 6 | `C:\Users\isaac\AppData\Local\Packages\MicrosoftWindows.Client.CBS_cw5n1h2txyewy\LocalState\EBWebView` |

## Resumen por corrida

| Corrida | Rol | Métrica | Media | p50 | p95 | p99 | Máximo |
|---:|---|---|---:|---:|---:|---:|---:|
| 1 | go-host | privateBytes | 70.63 MiB | 70.40 MiB | 73.40 MiB | 75.63 MiB | 77.16 MiB |
| 1 | go-host | workingSetBytes | 64.31 MiB | 63.98 MiB | 66.89 MiB | 69.75 MiB | 70.37 MiB |
| 1 | go-host | cpuPct | 1.856 | 2.000 | 3.000 | 3.000 | 6.000 |
| 1 | go-host | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 1 | go-host | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 1 | utility | privateBytes | 21.49 MiB | 21.47 MiB | 21.87 MiB | 21.87 MiB | 21.87 MiB |
| 1 | utility | workingSetBytes | 57.28 MiB | 57.27 MiB | 58.66 MiB | 58.66 MiB | 58.66 MiB |
| 1 | utility | cpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 1 | utility | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 1 | utility | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 1 | browser | privateBytes | 38.25 MiB | 38.23 MiB | 38.52 MiB | 38.62 MiB | 38.87 MiB |
| 1 | browser | workingSetBytes | 120.34 MiB | 120.33 MiB | 121.21 MiB | 121.38 MiB | 121.38 MiB |
| 1 | browser | cpuPct | 0.044 | 0.000 | 0.000 | 1.000 | 1.000 |
| 1 | browser | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 1 | browser | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 1 | crashpad | privateBytes | 2.83 MiB | 2.80 MiB | 3.24 MiB | 3.24 MiB | 3.24 MiB |
| 1 | crashpad | workingSetBytes | 13.00 MiB | 12.70 MiB | 18.43 MiB | 18.43 MiB | 18.43 MiB |
| 1 | crashpad | cpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 1 | crashpad | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 1 | crashpad | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 1 | gpu-process | privateBytes | 92.47 MiB | 92.35 MiB | 92.57 MiB | 97.14 MiB | 100.54 MiB |
| 1 | gpu-process | workingSetBytes | 92.38 MiB | 92.23 MiB | 92.92 MiB | 92.92 MiB | 100.01 MiB |
| 1 | gpu-process | cpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 1 | gpu-process | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 1 | gpu-process | gpuDedicatedBytes | 39.32 MiB | 39.32 MiB | 39.32 MiB | 39.32 MiB | 39.32 MiB |
| 1 | renderer-hub | privateBytes | 58.92 MiB | 59.26 MiB | 70.54 MiB | 71.80 MiB | 71.80 MiB |
| 1 | renderer-hub | workingSetBytes | 101.19 MiB | 101.74 MiB | 112.97 MiB | 114.09 MiB | 114.15 MiB |
| 1 | renderer-hub | cpuPct | 0.017 | 0.000 | 0.000 | 1.000 | 1.000 |
| 1 | renderer-hub | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 1 | renderer-hub | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 1 | game | frameTimeMs | 12.327 ms | 10.568 ms | 20.693 ms | 28.238 ms | 74.893 ms |
| 1 | game | dropped | 0.000 % | 0.000 % | 0.000 % | 0.000 % | 0.000 % |
| 2 | crashpad | privateBytes | 2.84 MiB | 2.84 MiB | 3.24 MiB | 3.24 MiB | 3.24 MiB |
| 2 | crashpad | workingSetBytes | 13.10 MiB | 12.82 MiB | 18.54 MiB | 18.54 MiB | 18.54 MiB |
| 2 | crashpad | cpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 2 | crashpad | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 2 | crashpad | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 2 | utility | privateBytes | 21.05 MiB | 20.99 MiB | 21.34 MiB | 21.38 MiB | 21.38 MiB |
| 2 | utility | workingSetBytes | 56.25 MiB | 56.13 MiB | 57.32 MiB | 57.41 MiB | 57.41 MiB |
| 2 | utility | cpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 2 | utility | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 2 | utility | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 2 | browser | privateBytes | 37.45 MiB | 37.39 MiB | 37.75 MiB | 38.52 MiB | 38.52 MiB |
| 2 | browser | workingSetBytes | 120.68 MiB | 120.63 MiB | 121.66 MiB | 122.41 MiB | 122.41 MiB |
| 2 | browser | cpuPct | 0.017 | 0.000 | 0.000 | 1.000 | 1.000 |
| 2 | browser | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 2 | browser | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 2 | renderer-hub | privateBytes | 59.75 MiB | 60.41 MiB | 72.11 MiB | 72.61 MiB | 72.61 MiB |
| 2 | renderer-hub | workingSetBytes | 102.18 MiB | 102.80 MiB | 114.81 MiB | 115.26 MiB | 115.26 MiB |
| 2 | renderer-hub | cpuPct | 0.011 | 0.000 | 0.000 | 1.000 | 1.000 |
| 2 | renderer-hub | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 2 | renderer-hub | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 2 | go-host | privateBytes | 73.73 MiB | 71.02 MiB | 84.70 MiB | 138.54 MiB | 140.44 MiB |
| 2 | go-host | workingSetBytes | 67.19 MiB | 64.45 MiB | 78.36 MiB | 131.66 MiB | 133.67 MiB |
| 2 | go-host | cpuPct | 1.639 | 2.000 | 2.000 | 2.000 | 7.000 |
| 2 | go-host | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 2 | go-host | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 2 | gpu-process | privateBytes | 92.76 MiB | 92.73 MiB | 92.86 MiB | 92.93 MiB | 92.93 MiB |
| 2 | gpu-process | workingSetBytes | 92.72 MiB | 92.54 MiB | 93.13 MiB | 93.24 MiB | 93.24 MiB |
| 2 | gpu-process | cpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 2 | gpu-process | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 2 | gpu-process | gpuDedicatedBytes | 39.32 MiB | 39.32 MiB | 39.32 MiB | 39.32 MiB | 39.32 MiB |
| 2 | game | frameTimeMs | 14.509 ms | 12.618 ms | 24.897 ms | 37.740 ms | 102.184 ms |
| 2 | game | dropped | 0.000 % | 0.000 % | 0.000 % | 0.000 % | 0.000 % |
| 3 | crashpad | privateBytes | 2.85 MiB | 2.83 MiB | 3.27 MiB | 3.27 MiB | 3.27 MiB |
| 3 | crashpad | workingSetBytes | 13.10 MiB | 12.81 MiB | 18.53 MiB | 18.53 MiB | 18.53 MiB |
| 3 | crashpad | cpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 3 | crashpad | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 3 | crashpad | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 3 | gpu-process | privateBytes | 92.54 MiB | 92.53 MiB | 92.58 MiB | 92.58 MiB | 97.08 MiB |
| 3 | gpu-process | workingSetBytes | 92.54 MiB | 92.51 MiB | 92.73 MiB | 92.73 MiB | 92.73 MiB |
| 3 | gpu-process | cpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 3 | gpu-process | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 3 | gpu-process | gpuDedicatedBytes | 39.32 MiB | 39.32 MiB | 39.32 MiB | 39.32 MiB | 39.32 MiB |
| 3 | utility | privateBytes | 20.99 MiB | 20.96 MiB | 21.10 MiB | 21.26 MiB | 21.34 MiB |
| 3 | utility | workingSetBytes | 55.94 MiB | 56.10 MiB | 56.40 MiB | 56.40 MiB | 56.40 MiB |
| 3 | utility | cpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 3 | utility | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 3 | utility | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 3 | renderer-hub | privateBytes | 53.62 MiB | 54.14 MiB | 59.52 MiB | 60.34 MiB | 61.09 MiB |
| 3 | renderer-hub | workingSetBytes | 96.91 MiB | 97.69 MiB | 102.88 MiB | 103.91 MiB | 104.60 MiB |
| 3 | renderer-hub | cpuPct | 0.006 | 0.000 | 0.000 | 0.000 | 1.000 |
| 3 | renderer-hub | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 3 | renderer-hub | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 3 | go-host | privateBytes | 73.65 MiB | 70.91 MiB | 88.73 MiB | 100.80 MiB | 135.94 MiB |
| 3 | go-host | workingSetBytes | 67.67 MiB | 65.16 MiB | 82.66 MiB | 95.00 MiB | 128.52 MiB |
| 3 | go-host | cpuPct | 1.706 | 2.000 | 3.000 | 4.000 | 6.000 |
| 3 | go-host | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 3 | go-host | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 3 | browser | privateBytes | 37.78 MiB | 37.53 MiB | 38.55 MiB | 38.55 MiB | 38.55 MiB |
| 3 | browser | workingSetBytes | 123.88 MiB | 123.93 MiB | 124.49 MiB | 124.49 MiB | 124.50 MiB |
| 3 | browser | cpuPct | 0.056 | 0.000 | 0.000 | 1.000 | 2.000 |
| 3 | browser | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 3 | browser | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 3 | game | frameTimeMs | 13.423 ms | 11.658 ms | 22.699 ms | 29.735 ms | 60.852 ms |
| 3 | game | dropped | 0.000 % | 0.000 % | 0.000 % | 0.000 % | 0.000 % |

## Frames perdidos

| Corrida | Perdidos | Frames totales | Porcentaje |
|---:|---:|---:|---:|
| 1 | 0 | 14598 | 0.000 % |
| 2 | 0 | 12403 | 0.000 % |
| 3 | 0 | 13406 | 0.000 % |

## Repetibilidad entre corridas

| Condición | Rol | Métrica | N | Media | Desviación | Ruido | Gate |
|---|---|---|---:|---:|---:|---:|:---:|
| A0 | go-host | privateBytes | 3 | 72.67 MiB | 1.77 MiB | 2.43 % | ✓ |
| A0 | go-host | workingSetBytes | 3 | 66.39 MiB | 1.82 MiB | 2.73 % | ✓ |
| A0 | go-host | cpuPct | 3 | 1.733 | 0.111 | 6.40 % | ✗ |
| A0 | go-host | gpuPct | 3 | 0.000 | 0.000 | 0.00 % | ✓ |
| A0 | go-host | gpuDedicatedBytes | 3 | 0.00 MiB | 0.00 MiB | 0.00 % | ✓ |
| A0 | utility | privateBytes | 3 | 21.18 MiB | 0.27 MiB | 1.29 % | ✓ |
| A0 | utility | workingSetBytes | 3 | 56.49 MiB | 0.71 MiB | 1.25 % | ✓ |
| A0 | utility | cpuPct | 3 | 0.000 | 0.000 | 0.00 % | ✓ |
| A0 | utility | gpuPct | 3 | 0.000 | 0.000 | 0.00 % | ✓ |
| A0 | utility | gpuDedicatedBytes | 3 | 0.00 MiB | 0.00 MiB | 0.00 % | ✓ |
| A0 | browser | privateBytes | 3 | 37.82 MiB | 0.40 MiB | 1.06 % | ✓ |
| A0 | browser | workingSetBytes | 3 | 121.63 MiB | 1.95 MiB | 1.60 % | ✓ |
| A0 | browser | cpuPct | 3 | 0.039 | 0.020 | 51.51 % | ✗ |
| A0 | browser | gpuPct | 3 | 0.000 | 0.000 | 0.00 % | ✓ |
| A0 | browser | gpuDedicatedBytes | 3 | 0.00 MiB | 0.00 MiB | 0.00 % | ✓ |
| A0 | crashpad | privateBytes | 3 | 2.84 MiB | 0.01 MiB | 0.39 % | ✓ |
| A0 | crashpad | workingSetBytes | 3 | 13.06 MiB | 0.06 MiB | 0.44 % | ✓ |
| A0 | crashpad | cpuPct | 3 | 0.000 | 0.000 | 0.00 % | ✓ |
| A0 | crashpad | gpuPct | 3 | 0.000 | 0.000 | 0.00 % | ✓ |
| A0 | crashpad | gpuDedicatedBytes | 3 | 0.00 MiB | 0.00 MiB | 0.00 % | ✓ |
| A0 | gpu-process | privateBytes | 3 | 92.59 MiB | 0.15 MiB | 0.16 % | ✓ |
| A0 | gpu-process | workingSetBytes | 3 | 92.55 MiB | 0.17 MiB | 0.18 % | ✓ |
| A0 | gpu-process | cpuPct | 3 | 0.000 | 0.000 | 0.00 % | ✓ |
| A0 | gpu-process | gpuPct | 3 | 0.000 | 0.000 | 0.00 % | ✓ |
| A0 | gpu-process | gpuDedicatedBytes | 3 | 39.32 MiB | 0.00 MiB | 0.00 % | ✓ |
| A0 | renderer-hub | privateBytes | 3 | 57.43 MiB | 3.33 MiB | 5.79 % | ✗ |
| A0 | renderer-hub | workingSetBytes | 3 | 100.09 MiB | 2.80 MiB | 2.80 % | ✓ |
| A0 | renderer-hub | cpuPct | 3 | 0.011 | 0.006 | 50.00 % | ✗ |
| A0 | renderer-hub | gpuPct | 3 | 0.000 | 0.000 | 0.00 % | ✓ |
| A0 | renderer-hub | gpuDedicatedBytes | 3 | 0.00 MiB | 0.00 MiB | 0.00 % | ✓ |
| A0 | game | frameTimeMs | 3 | 13.420 ms | 1.091 ms | 8.13 % | ✗ |
| A0 | game | dropped | 3 | 0.000 % | 0.000 % | 0.00 % | ✓ |
