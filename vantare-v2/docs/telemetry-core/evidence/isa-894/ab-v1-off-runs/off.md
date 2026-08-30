# Huella mínima · A1 V1 OFF

Corridas: `a1-20260830-022420.csv`, `a1-20260830-024456.csv`, `a1-20260830-030115.csv`. Ruido = desviación muestral / media; hacen falta al menos 3 corridas y el gate falla por encima de 5 %.

## Recuperación de sesiones ETW

No se detectaron sesiones huérfanas `VantareHuella-*`.

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
| 1 | renderer-unassigned | privateBytes | 112.01 MiB | 114.95 MiB | 131.16 MiB | 135.11 MiB | 137.39 MiB |
| 1 | renderer-unassigned | workingSetBytes | 158.38 MiB | 161.49 MiB | 178.44 MiB | 181.64 MiB | 183.57 MiB |
| 1 | renderer-unassigned | cpuPct | 1.483 | 1.000 | 2.000 | 3.000 | 6.000 |
| 1 | renderer-unassigned | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 1 | renderer-unassigned | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 1 | utility | privateBytes | 23.39 MiB | 23.53 MiB | 24.92 MiB | 25.32 MiB | 25.32 MiB |
| 1 | utility | workingSetBytes | 58.66 MiB | 59.05 MiB | 60.50 MiB | 61.01 MiB | 61.01 MiB |
| 1 | utility | cpuPct | 0.006 | 0.000 | 0.000 | 0.000 | 1.000 |
| 1 | utility | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 1 | utility | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 1 | renderer-hub | privateBytes | 65.25 MiB | 65.52 MiB | 78.37 MiB | 79.66 MiB | 79.66 MiB |
| 1 | renderer-hub | workingSetBytes | 107.80 MiB | 108.34 MiB | 121.04 MiB | 122.36 MiB | 122.54 MiB |
| 1 | renderer-hub | cpuPct | 0.033 | 0.000 | 0.000 | 1.000 | 1.000 |
| 1 | renderer-hub | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 1 | renderer-hub | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 1 | go-host | privateBytes | 72.03 MiB | 71.82 MiB | 75.66 MiB | 81.91 MiB | 82.36 MiB |
| 1 | go-host | workingSetBytes | 66.81 MiB | 66.51 MiB | 70.93 MiB | 76.89 MiB | 77.57 MiB |
| 1 | go-host | cpuPct | 1.667 | 2.000 | 2.000 | 3.000 | 6.000 |
| 1 | go-host | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 1 | go-host | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 1 | browser | privateBytes | 46.91 MiB | 46.93 MiB | 49.42 MiB | 50.02 MiB | 50.05 MiB |
| 1 | browser | workingSetBytes | 129.73 MiB | 129.82 MiB | 132.58 MiB | 133.18 MiB | 133.20 MiB |
| 1 | browser | cpuPct | 0.972 | 1.000 | 1.000 | 2.000 | 5.000 |
| 1 | browser | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 1 | browser | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 1 | crashpad | privateBytes | 2.83 MiB | 2.80 MiB | 3.21 MiB | 3.21 MiB | 3.22 MiB |
| 1 | crashpad | workingSetBytes | 13.14 MiB | 12.84 MiB | 18.55 MiB | 18.55 MiB | 18.55 MiB |
| 1 | crashpad | cpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 1 | crashpad | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 1 | crashpad | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 1 | gpu-process | privateBytes | 142.23 MiB | 138.68 MiB | 158.92 MiB | 179.02 MiB | 183.52 MiB |
| 1 | gpu-process | workingSetBytes | 100.61 MiB | 100.03 MiB | 101.22 MiB | 109.40 MiB | 109.54 MiB |
| 1 | gpu-process | cpuPct | 0.167 | 0.000 | 1.000 | 1.000 | 1.000 |
| 1 | gpu-process | gpuPct | 0.023 | 0.019 | 0.036 | 0.208 | 0.849 |
| 1 | gpu-process | gpuDedicatedBytes | 98.73 MiB | 96.48 MiB | 106.23 MiB | 127.98 MiB | 127.98 MiB |
| 1 | game | frameTimeMs | 18.582 ms | 18.356 ms | 27.315 ms | 33.135 ms | 99.377 ms |
| 1 | game | dropped | 0.000 % | 0.000 % | 0.000 % | 0.000 % | 0.000 % |
| 2 | gpu-process | privateBytes | 145.62 MiB | 140.56 MiB | 170.87 MiB | 178.88 MiB | 182.80 MiB |
| 2 | gpu-process | workingSetBytes | 101.17 MiB | 100.52 MiB | 108.73 MiB | 109.48 MiB | 109.57 MiB |
| 2 | gpu-process | cpuPct | 0.106 | 0.000 | 1.000 | 1.000 | 1.000 |
| 2 | gpu-process | gpuPct | 0.022 | 0.015 | 0.033 | 0.120 | 0.724 |
| 2 | gpu-process | gpuDedicatedBytes | 100.68 MiB | 96.20 MiB | 113.20 MiB | 127.70 MiB | 127.70 MiB |
| 2 | go-host | privateBytes | 73.17 MiB | 72.93 MiB | 75.87 MiB | 77.92 MiB | 78.94 MiB |
| 2 | go-host | workingSetBytes | 67.36 MiB | 67.20 MiB | 70.03 MiB | 72.04 MiB | 72.98 MiB |
| 2 | go-host | cpuPct | 1.611 | 2.000 | 2.000 | 3.000 | 7.000 |
| 2 | go-host | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 2 | go-host | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 2 | crashpad | privateBytes | 2.85 MiB | 2.83 MiB | 3.23 MiB | 3.23 MiB | 3.23 MiB |
| 2 | crashpad | workingSetBytes | 13.17 MiB | 12.82 MiB | 18.55 MiB | 18.55 MiB | 18.56 MiB |
| 2 | crashpad | cpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 2 | crashpad | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 2 | crashpad | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 2 | utility | privateBytes | 23.21 MiB | 23.30 MiB | 24.74 MiB | 25.19 MiB | 25.19 MiB |
| 2 | utility | workingSetBytes | 58.48 MiB | 58.83 MiB | 60.34 MiB | 60.85 MiB | 60.85 MiB |
| 2 | utility | cpuPct | 0.006 | 0.000 | 0.000 | 0.000 | 1.000 |
| 2 | utility | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 2 | utility | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 2 | browser | privateBytes | 46.74 MiB | 46.61 MiB | 49.45 MiB | 49.99 MiB | 50.00 MiB |
| 2 | browser | workingSetBytes | 131.20 MiB | 131.20 MiB | 134.30 MiB | 134.76 MiB | 134.77 MiB |
| 2 | browser | cpuPct | 0.989 | 1.000 | 1.000 | 2.000 | 4.000 |
| 2 | browser | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 2 | browser | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 2 | renderer-unassigned | privateBytes | 130.37 MiB | 134.13 MiB | 145.20 MiB | 148.52 MiB | 148.55 MiB |
| 2 | renderer-unassigned | workingSetBytes | 176.68 MiB | 180.90 MiB | 191.97 MiB | 194.80 MiB | 194.86 MiB |
| 2 | renderer-unassigned | cpuPct | 1.528 | 1.000 | 2.000 | 3.000 | 6.000 |
| 2 | renderer-unassigned | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 2 | renderer-unassigned | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 2 | renderer-hub | privateBytes | 64.29 MiB | 64.90 MiB | 78.59 MiB | 79.38 MiB | 79.65 MiB |
| 2 | renderer-hub | workingSetBytes | 106.82 MiB | 107.41 MiB | 121.17 MiB | 122.06 MiB | 122.33 MiB |
| 2 | renderer-hub | cpuPct | 0.033 | 0.000 | 0.000 | 1.000 | 1.000 |
| 2 | renderer-hub | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 2 | renderer-hub | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 2 | game | frameTimeMs | 13.690 ms | 11.993 ms | 22.587 ms | 29.536 ms | 412.629 ms |
| 2 | game | dropped | 0.000 % | 0.000 % | 0.000 % | 0.000 % | 0.000 % |
| 3 | renderer-hub | privateBytes | 67.55 MiB | 67.59 MiB | 82.25 MiB | 82.42 MiB | 82.56 MiB |
| 3 | renderer-hub | workingSetBytes | 109.98 MiB | 110.19 MiB | 124.63 MiB | 125.02 MiB | 125.21 MiB |
| 3 | renderer-hub | cpuPct | 0.011 | 0.000 | 0.000 | 1.000 | 1.000 |
| 3 | renderer-hub | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 3 | renderer-hub | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 3 | browser | privateBytes | 46.62 MiB | 46.44 MiB | 49.91 MiB | 49.94 MiB | 49.95 MiB |
| 3 | browser | workingSetBytes | 129.71 MiB | 129.59 MiB | 133.58 MiB | 133.65 MiB | 133.65 MiB |
| 3 | browser | cpuPct | 1.011 | 1.000 | 1.000 | 2.000 | 4.000 |
| 3 | browser | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 3 | browser | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 3 | renderer-unassigned | privateBytes | 109.93 MiB | 112.18 MiB | 124.18 MiB | 126.14 MiB | 128.78 MiB |
| 3 | renderer-unassigned | workingSetBytes | 156.37 MiB | 158.34 MiB | 171.43 MiB | 173.39 MiB | 175.31 MiB |
| 3 | renderer-unassigned | cpuPct | 1.506 | 1.000 | 2.000 | 2.000 | 6.000 |
| 3 | renderer-unassigned | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 3 | renderer-unassigned | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 3 | utility | privateBytes | 23.24 MiB | 23.29 MiB | 24.77 MiB | 25.47 MiB | 25.47 MiB |
| 3 | utility | workingSetBytes | 58.67 MiB | 58.82 MiB | 61.14 MiB | 61.69 MiB | 61.69 MiB |
| 3 | utility | cpuPct | 0.011 | 0.000 | 0.000 | 1.000 | 1.000 |
| 3 | utility | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 3 | utility | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 3 | crashpad | privateBytes | 2.85 MiB | 2.82 MiB | 3.23 MiB | 3.23 MiB | 3.23 MiB |
| 3 | crashpad | workingSetBytes | 13.16 MiB | 12.84 MiB | 18.55 MiB | 18.55 MiB | 18.55 MiB |
| 3 | crashpad | cpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 3 | crashpad | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 3 | crashpad | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 3 | gpu-process | privateBytes | 143.93 MiB | 144.52 MiB | 155.80 MiB | 178.93 MiB | 182.45 MiB |
| 3 | gpu-process | workingSetBytes | 99.04 MiB | 98.21 MiB | 106.07 MiB | 107.80 MiB | 107.92 MiB |
| 3 | gpu-process | cpuPct | 0.111 | 0.000 | 1.000 | 1.000 | 1.000 |
| 3 | gpu-process | gpuPct | 0.021 | 0.014 | 0.036 | 0.113 | 0.734 |
| 3 | gpu-process | gpuDedicatedBytes | 100.19 MiB | 96.20 MiB | 105.95 MiB | 127.70 MiB | 127.70 MiB |
| 3 | go-host | privateBytes | 72.80 MiB | 72.68 MiB | 74.78 MiB | 78.12 MiB | 79.54 MiB |
| 3 | go-host | workingSetBytes | 67.69 MiB | 67.54 MiB | 69.90 MiB | 72.95 MiB | 74.08 MiB |
| 3 | go-host | cpuPct | 1.694 | 2.000 | 2.000 | 3.000 | 6.000 |
| 3 | go-host | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 3 | go-host | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 3 | game | frameTimeMs | 15.138 ms | 13.620 ms | 24.305 ms | 33.774 ms | 299.000 ms |
| 3 | game | dropped | 0.000 % | 0.000 % | 0.000 % | 0.000 % | 0.000 % |

## Frames perdidos

| Corrida | Perdidos | Frames totales | Porcentaje |
|---:|---:|---:|---:|
| 1 | 0 | 9684 | 0.000 % |
| 2 | 0 | 13145 | 0.000 % |
| 3 | 0 | 11888 | 0.000 % |

## Repetibilidad entre corridas

| Condición | Rol | Métrica | N | Media | Desviación | Ruido | Gate |
|---|---|---|---:|---:|---:|---:|:---:|
| A1 V1 OFF | renderer-unassigned | privateBytes | 3 | 117.44 MiB | 11.25 MiB | 9.58 % | ✗ |
| A1 V1 OFF | renderer-unassigned | workingSetBytes | 3 | 163.81 MiB | 11.19 MiB | 6.83 % | ✗ |
| A1 V1 OFF | renderer-unassigned | cpuPct | 3 | 1.506 | 0.022 | 1.48 % | ✓ |
| A1 V1 OFF | renderer-unassigned | gpuPct | 3 | 0.000 | 0.000 | 0.00 % | ✓ |
| A1 V1 OFF | renderer-unassigned | gpuDedicatedBytes | 3 | 0.00 MiB | 0.00 MiB | 0.00 % | ✓ |
| A1 V1 OFF | utility | privateBytes | 3 | 23.28 MiB | 0.09 MiB | 0.41 % | ✓ |
| A1 V1 OFF | utility | workingSetBytes | 3 | 58.60 MiB | 0.10 MiB | 0.18 % | ✓ |
| A1 V1 OFF | utility | cpuPct | 3 | 0.007 | 0.003 | 43.30 % | ✗ |
| A1 V1 OFF | utility | gpuPct | 3 | 0.000 | 0.000 | 0.00 % | ✓ |
| A1 V1 OFF | utility | gpuDedicatedBytes | 3 | 0.00 MiB | 0.00 MiB | 0.00 % | ✓ |
| A1 V1 OFF | renderer-hub | privateBytes | 3 | 65.70 MiB | 1.68 MiB | 2.55 % | ✓ |
| A1 V1 OFF | renderer-hub | workingSetBytes | 3 | 108.20 MiB | 1.62 MiB | 1.50 % | ✓ |
| A1 V1 OFF | renderer-hub | cpuPct | 3 | 0.026 | 0.013 | 49.49 % | ✗ |
| A1 V1 OFF | renderer-hub | gpuPct | 3 | 0.000 | 0.000 | 0.00 % | ✓ |
| A1 V1 OFF | renderer-hub | gpuDedicatedBytes | 3 | 0.00 MiB | 0.00 MiB | 0.00 % | ✓ |
| A1 V1 OFF | go-host | privateBytes | 3 | 72.67 MiB | 0.58 MiB | 0.80 % | ✓ |
| A1 V1 OFF | go-host | workingSetBytes | 3 | 67.29 MiB | 0.45 MiB | 0.66 % | ✓ |
| A1 V1 OFF | go-host | cpuPct | 3 | 1.657 | 0.042 | 2.56 % | ✓ |
| A1 V1 OFF | go-host | gpuPct | 3 | 0.000 | 0.000 | 0.00 % | ✓ |
| A1 V1 OFF | go-host | gpuDedicatedBytes | 3 | 0.00 MiB | 0.00 MiB | 0.00 % | ✓ |
| A1 V1 OFF | browser | privateBytes | 3 | 46.76 MiB | 0.15 MiB | 0.31 % | ✓ |
| A1 V1 OFF | browser | workingSetBytes | 3 | 130.22 MiB | 0.85 MiB | 0.65 % | ✓ |
| A1 V1 OFF | browser | cpuPct | 3 | 0.991 | 0.020 | 1.97 % | ✓ |
| A1 V1 OFF | browser | gpuPct | 3 | 0.000 | 0.000 | 0.00 % | ✓ |
| A1 V1 OFF | browser | gpuDedicatedBytes | 3 | 0.00 MiB | 0.00 MiB | 0.00 % | ✓ |
| A1 V1 OFF | crashpad | privateBytes | 3 | 2.84 MiB | 0.01 MiB | 0.46 % | ✓ |
| A1 V1 OFF | crashpad | workingSetBytes | 3 | 13.16 MiB | 0.01 MiB | 0.10 % | ✓ |
| A1 V1 OFF | crashpad | cpuPct | 3 | 0.000 | 0.000 | 0.00 % | ✓ |
| A1 V1 OFF | crashpad | gpuPct | 3 | 0.000 | 0.000 | 0.00 % | ✓ |
| A1 V1 OFF | crashpad | gpuDedicatedBytes | 3 | 0.00 MiB | 0.00 MiB | 0.00 % | ✓ |
| A1 V1 OFF | gpu-process | privateBytes | 3 | 143.92 MiB | 1.69 MiB | 1.18 % | ✓ |
| A1 V1 OFF | gpu-process | workingSetBytes | 3 | 100.27 MiB | 1.11 MiB | 1.10 % | ✓ |
| A1 V1 OFF | gpu-process | cpuPct | 3 | 0.128 | 0.034 | 26.45 % | ✗ |
| A1 V1 OFF | gpu-process | gpuPct | 3 | 0.022 | 0.001 | 5.23 % | ✗ |
| A1 V1 OFF | gpu-process | gpuDedicatedBytes | 3 | 99.87 MiB | 1.01 MiB | 1.01 % | ✓ |
| A1 V1 OFF | game | frameTimeMs | 3 | 15.803 ms | 2.513 ms | 15.90 % | ✗ |
| A1 V1 OFF | game | dropped | 3 | 0.000 % | 0.000 % | 0.00 % | ✓ |
