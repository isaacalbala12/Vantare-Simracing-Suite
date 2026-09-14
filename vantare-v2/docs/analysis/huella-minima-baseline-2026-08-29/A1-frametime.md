# Huella mínima · A1

Corridas: `a1-20260828-235705.csv`, `a1-20260829-020136.csv`, `a1-20260829-021809.csv`. Ruido = desviación muestral / media; hacen falta al menos 3 corridas y el gate falla por encima de 5 %.

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
| 1 | go-host | privateBytes | 80.45 MiB | 74.60 MiB | 114.39 MiB | 149.62 MiB | 151.04 MiB |
| 1 | go-host | workingSetBytes | 75.15 MiB | 69.47 MiB | 108.57 MiB | 143.54 MiB | 144.00 MiB |
| 1 | go-host | cpuPct | 2.639 | 3.000 | 4.000 | 5.000 | 12.000 |
| 1 | go-host | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 1 | go-host | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 1 | crashpad | privateBytes | 2.84 MiB | 2.82 MiB | 3.23 MiB | 3.23 MiB | 3.23 MiB |
| 1 | crashpad | workingSetBytes | 13.01 MiB | 12.72 MiB | 18.45 MiB | 18.45 MiB | 18.45 MiB |
| 1 | crashpad | cpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 1 | crashpad | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 1 | crashpad | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 1 | utility | privateBytes | 22.30 MiB | 21.84 MiB | 23.36 MiB | 24.02 MiB | 24.02 MiB |
| 1 | utility | workingSetBytes | 57.34 MiB | 56.96 MiB | 58.88 MiB | 59.46 MiB | 59.46 MiB |
| 1 | utility | cpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 1 | utility | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 1 | utility | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 1 | gpu-process | privateBytes | 156.58 MiB | 154.29 MiB | 174.24 MiB | 177.34 MiB | 184.88 MiB |
| 1 | gpu-process | workingSetBytes | 122.60 MiB | 122.83 MiB | 130.36 MiB | 131.45 MiB | 131.49 MiB |
| 1 | gpu-process | cpuPct | 0.522 | 0.000 | 2.000 | 2.000 | 2.000 |
| 1 | gpu-process | gpuPct | 0.378 | 0.042 | 2.010 | 2.731 | 2.962 |
| 1 | gpu-process | gpuDedicatedBytes | 97.92 MiB | 97.82 MiB | 109.57 MiB | 109.57 MiB | 109.57 MiB |
| 1 | renderer-hub | privateBytes | 60.56 MiB | 58.46 MiB | 74.31 MiB | 75.31 MiB | 75.31 MiB |
| 1 | renderer-hub | workingSetBytes | 102.55 MiB | 100.51 MiB | 116.11 MiB | 116.99 MiB | 117.24 MiB |
| 1 | renderer-hub | cpuPct | 0.033 | 0.000 | 0.000 | 1.000 | 1.000 |
| 1 | renderer-hub | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 1 | renderer-hub | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 1 | renderer-unassigned | privateBytes | 172.47 MiB | 170.71 MiB | 223.87 MiB | 248.71 MiB | 269.82 MiB |
| 1 | renderer-unassigned | workingSetBytes | 217.77 MiB | 216.92 MiB | 266.48 MiB | 290.09 MiB | 309.80 MiB |
| 1 | renderer-unassigned | cpuPct | 2.461 | 3.000 | 4.000 | 5.000 | 10.000 |
| 1 | renderer-unassigned | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 1 | renderer-unassigned | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 1 | browser | privateBytes | 45.52 MiB | 45.11 MiB | 47.37 MiB | 47.98 MiB | 47.99 MiB |
| 1 | browser | workingSetBytes | 129.98 MiB | 129.51 MiB | 132.20 MiB | 132.80 MiB | 132.82 MiB |
| 1 | browser | cpuPct | 0.750 | 1.000 | 1.000 | 1.000 | 3.000 |
| 1 | browser | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 1 | browser | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 1 | game | frameTimeMs | 17.575 ms | 17.409 ms | 24.896 ms | 30.960 ms | 83.234 ms |
| 1 | game | dropped | 0.000 % | 0.000 % | 0.000 % | 0.000 % | 0.000 % |
| 2 | gpu-process | privateBytes | 170.30 MiB | 168.00 MiB | 185.20 MiB | 188.34 MiB | 188.54 MiB |
| 2 | gpu-process | workingSetBytes | 113.39 MiB | 112.55 MiB | 121.02 MiB | 121.94 MiB | 122.84 MiB |
| 2 | gpu-process | cpuPct | 0.494 | 0.000 | 1.000 | 2.000 | 4.000 |
| 2 | gpu-process | gpuPct | 0.334 | 0.082 | 1.342 | 1.966 | 2.128 |
| 2 | gpu-process | gpuDedicatedBytes | 116.41 MiB | 115.82 MiB | 123.82 MiB | 127.82 MiB | 127.82 MiB |
| 2 | utility | privateBytes | 22.93 MiB | 22.25 MiB | 25.09 MiB | 25.12 MiB | 25.12 MiB |
| 2 | utility | workingSetBytes | 58.12 MiB | 57.64 MiB | 60.72 MiB | 60.73 MiB | 60.73 MiB |
| 2 | utility | cpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 2 | utility | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 2 | utility | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 2 | renderer-unassigned | privateBytes | 179.78 MiB | 178.73 MiB | 233.12 MiB | 262.90 MiB | 263.08 MiB |
| 2 | renderer-unassigned | workingSetBytes | 224.91 MiB | 225.11 MiB | 275.43 MiB | 302.68 MiB | 304.46 MiB |
| 2 | renderer-unassigned | cpuPct | 3.011 | 3.000 | 4.000 | 5.000 | 13.000 |
| 2 | renderer-unassigned | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 2 | renderer-unassigned | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 2 | go-host | privateBytes | 74.43 MiB | 74.16 MiB | 77.18 MiB | 81.36 MiB | 82.04 MiB |
| 2 | go-host | workingSetBytes | 69.38 MiB | 68.95 MiB | 72.46 MiB | 76.57 MiB | 77.48 MiB |
| 2 | go-host | cpuPct | 3.156 | 3.000 | 4.000 | 5.000 | 12.000 |
| 2 | go-host | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 2 | go-host | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 2 | browser | privateBytes | 46.55 MiB | 45.95 MiB | 48.88 MiB | 48.96 MiB | 49.50 MiB |
| 2 | browser | workingSetBytes | 129.52 MiB | 129.08 MiB | 132.37 MiB | 132.46 MiB | 132.93 MiB |
| 2 | browser | cpuPct | 0.928 | 1.000 | 1.000 | 2.000 | 4.000 |
| 2 | browser | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 2 | browser | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 2 | renderer-hub | privateBytes | 62.83 MiB | 63.13 MiB | 76.87 MiB | 77.94 MiB | 78.19 MiB |
| 2 | renderer-hub | workingSetBytes | 105.30 MiB | 105.65 MiB | 119.44 MiB | 120.49 MiB | 120.68 MiB |
| 2 | renderer-hub | cpuPct | 0.017 | 0.000 | 0.000 | 1.000 | 1.000 |
| 2 | renderer-hub | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 2 | renderer-hub | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 2 | crashpad | privateBytes | 2.90 MiB | 2.86 MiB | 3.46 MiB | 3.49 MiB | 3.49 MiB |
| 2 | crashpad | workingSetBytes | 13.78 MiB | 13.30 MiB | 19.10 MiB | 19.18 MiB | 19.18 MiB |
| 2 | crashpad | cpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 2 | crashpad | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 2 | crashpad | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 2 | game | frameTimeMs | 14.425 ms | 12.486 ms | 24.981 ms | 32.706 ms | 90.002 ms |
| 2 | game | dropped | 0.000 % | 0.000 % | 0.000 % | 0.000 % | 0.000 % |
| 3 | utility | privateBytes | 20.99 MiB | 21.38 MiB | 21.62 MiB | 21.62 MiB | 21.62 MiB |
| 3 | utility | workingSetBytes | 54.83 MiB | 56.67 MiB | 56.86 MiB | 56.86 MiB | 56.86 MiB |
| 3 | utility | cpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 3 | utility | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 3 | utility | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 3 | gpu-process | privateBytes | 177.10 MiB | 179.09 MiB | 191.29 MiB | 197.61 MiB | 197.61 MiB |
| 3 | gpu-process | workingSetBytes | 116.21 MiB | 114.09 MiB | 122.44 MiB | 124.95 MiB | 124.95 MiB |
| 3 | gpu-process | cpuPct | 0.500 | 0.000 | 2.000 | 5.000 | 5.000 |
| 3 | gpu-process | gpuPct | 0.338 | 0.043 | 1.512 | 3.900 | 3.900 |
| 3 | gpu-process | gpuDedicatedBytes | 111.75 MiB | 115.82 MiB | 127.57 MiB | 127.57 MiB | 127.57 MiB |
| 3 | browser | privateBytes | 43.22 MiB | 44.15 MiB | 44.75 MiB | 45.00 MiB | 45.00 MiB |
| 3 | browser | workingSetBytes | 124.44 MiB | 126.58 MiB | 127.40 MiB | 127.85 MiB | 127.85 MiB |
| 3 | browser | cpuPct | 0.066 | 0.000 | 0.000 | 2.000 | 2.000 |
| 3 | browser | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 3 | browser | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 3 | renderer-unassigned | privateBytes | 139.56 MiB | 139.74 MiB | 151.57 MiB | 156.30 MiB | 156.30 MiB |
| 3 | renderer-unassigned | workingSetBytes | 187.42 MiB | 187.17 MiB | 197.89 MiB | 203.02 MiB | 203.02 MiB |
| 3 | renderer-unassigned | cpuPct | 1.379 | 1.000 | 2.000 | 11.000 | 11.000 |
| 3 | renderer-unassigned | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 3 | renderer-unassigned | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 3 | crashpad | privateBytes | 3.02 MiB | 2.91 MiB | 3.27 MiB | 6.47 MiB | 6.47 MiB |
| 3 | crashpad | workingSetBytes | 13.41 MiB | 12.82 MiB | 18.55 MiB | 18.55 MiB | 18.55 MiB |
| 3 | crashpad | cpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 3 | crashpad | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 3 | crashpad | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 3 | go-host | privateBytes | 96.10 MiB | 87.29 MiB | 137.39 MiB | 237.35 MiB | 237.35 MiB |
| 3 | go-host | workingSetBytes | 90.09 MiB | 81.60 MiB | 131.75 MiB | 228.80 MiB | 228.80 MiB |
| 3 | go-host | cpuPct | 1.190 | 1.000 | 2.000 | 11.000 | 11.000 |
| 3 | go-host | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 3 | go-host | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 3 | renderer-hub | privateBytes | 47.86 MiB | 48.52 MiB | 49.36 MiB | 49.36 MiB | 49.36 MiB |
| 3 | renderer-hub | workingSetBytes | 90.12 MiB | 90.53 MiB | 91.76 MiB | 91.76 MiB | 91.76 MiB |
| 3 | renderer-hub | cpuPct | 0.017 | 0.000 | 0.000 | 1.000 | 1.000 |
| 3 | renderer-hub | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 3 | renderer-hub | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 3 | game | frameTimeMs | 32.043 ms | 25.886 ms | 69.809 ms | 111.155 ms | 262.187 ms |
| 3 | game | dropped | 0.000 % | 0.000 % | 0.000 % | 0.000 % | 0.000 % |

## Frames perdidos

| Corrida | Perdidos | Frames totales | Porcentaje |
|---:|---:|---:|---:|
| 1 | 0 | 10240 | 0.000 % |
| 2 | 0 | 12475 | 0.000 % |
| 3 | 0 | 5614 | 0.000 % |

## Repetibilidad entre corridas

| Condición | Rol | Métrica | N | Media | Desviación | Ruido | Gate |
|---|---|---|---:|---:|---:|---:|:---:|
| A1 | go-host | privateBytes | 3 | 83.66 MiB | 11.19 MiB | 13.37 % | ✗ |
| A1 | go-host | workingSetBytes | 3 | 78.21 MiB | 10.69 MiB | 13.67 % | ✗ |
| A1 | go-host | cpuPct | 3 | 2.328 | 1.019 | 43.78 % | ✗ |
| A1 | go-host | gpuPct | 3 | 0.000 | 0.000 | 0.00 % | ✓ |
| A1 | go-host | gpuDedicatedBytes | 3 | 0.00 MiB | 0.00 MiB | 0.00 % | ✓ |
| A1 | crashpad | privateBytes | 3 | 2.92 MiB | 0.09 MiB | 3.20 % | ✓ |
| A1 | crashpad | workingSetBytes | 3 | 13.40 MiB | 0.38 MiB | 2.86 % | ✓ |
| A1 | crashpad | cpuPct | 3 | 0.000 | 0.000 | 0.00 % | ✓ |
| A1 | crashpad | gpuPct | 3 | 0.000 | 0.000 | 0.00 % | ✓ |
| A1 | crashpad | gpuDedicatedBytes | 3 | 0.00 MiB | 0.00 MiB | 0.00 % | ✓ |
| A1 | utility | privateBytes | 3 | 22.07 MiB | 0.99 MiB | 4.47 % | ✓ |
| A1 | utility | workingSetBytes | 3 | 56.76 MiB | 1.72 MiB | 3.03 % | ✓ |
| A1 | utility | cpuPct | 3 | 0.000 | 0.000 | 0.00 % | ✓ |
| A1 | utility | gpuPct | 3 | 0.000 | 0.000 | 0.00 % | ✓ |
| A1 | utility | gpuDedicatedBytes | 3 | 0.00 MiB | 0.00 MiB | 0.00 % | ✓ |
| A1 | gpu-process | privateBytes | 3 | 167.99 MiB | 10.45 MiB | 6.22 % | ✗ |
| A1 | gpu-process | workingSetBytes | 3 | 117.40 MiB | 4.72 MiB | 4.02 % | ✓ |
| A1 | gpu-process | cpuPct | 3 | 0.506 | 0.015 | 2.91 % | ✓ |
| A1 | gpu-process | gpuPct | 3 | 0.350 | 0.025 | 7.01 % | ✗ |
| A1 | gpu-process | gpuDedicatedBytes | 3 | 108.69 MiB | 9.62 MiB | 8.85 % | ✗ |
| A1 | renderer-hub | privateBytes | 3 | 57.08 MiB | 8.07 MiB | 14.14 % | ✗ |
| A1 | renderer-hub | workingSetBytes | 3 | 99.32 MiB | 8.09 MiB | 8.14 % | ✗ |
| A1 | renderer-hub | cpuPct | 3 | 0.022 | 0.009 | 42.21 % | ✗ |
| A1 | renderer-hub | gpuPct | 3 | 0.000 | 0.000 | 0.00 % | ✓ |
| A1 | renderer-hub | gpuDedicatedBytes | 3 | 0.00 MiB | 0.00 MiB | 0.00 % | ✓ |
| A1 | renderer-unassigned | privateBytes | 3 | 163.94 MiB | 21.42 MiB | 13.07 % | ✗ |
| A1 | renderer-unassigned | workingSetBytes | 3 | 210.03 MiB | 19.91 MiB | 9.48 % | ✗ |
| A1 | renderer-unassigned | cpuPct | 3 | 2.284 | 0.830 | 36.35 % | ✗ |
| A1 | renderer-unassigned | gpuPct | 3 | 0.000 | 0.000 | 0.00 % | ✓ |
| A1 | renderer-unassigned | gpuDedicatedBytes | 3 | 0.00 MiB | 0.00 MiB | 0.00 % | ✓ |
| A1 | browser | privateBytes | 3 | 45.10 MiB | 1.70 MiB | 3.77 % | ✓ |
| A1 | browser | workingSetBytes | 3 | 127.98 MiB | 3.07 MiB | 2.40 % | ✓ |
| A1 | browser | cpuPct | 3 | 0.581 | 0.455 | 78.34 % | ✗ |
| A1 | browser | gpuPct | 3 | 0.000 | 0.000 | 0.00 % | ✓ |
| A1 | browser | gpuDedicatedBytes | 3 | 0.00 MiB | 0.00 MiB | 0.00 % | ✓ |
| A1 | game | frameTimeMs | 3 | 21.348 ms | 9.396 ms | 44.01 % | ✗ |
| A1 | game | dropped | 3 | 0.000 % | 0.000 % | 0.00 % | ✓ |
