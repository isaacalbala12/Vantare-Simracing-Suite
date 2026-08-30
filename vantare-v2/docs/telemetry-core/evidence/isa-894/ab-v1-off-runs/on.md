# Huella mínima · A1 V1 ON

Corridas: `a1-20260830-021541.csv`, `a1-20260830-023225.csv`, `a1-20260830-025304.csv`. Ruido = desviación muestral / media; hacen falta al menos 3 corridas y el gate falla por encima de 5 %.

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
| 1 | gpu-process | privateBytes | 149.89 MiB | 144.68 MiB | 165.93 MiB | 187.47 MiB | 188.30 MiB |
| 1 | gpu-process | workingSetBytes | 104.92 MiB | 103.90 MiB | 112.13 MiB | 113.56 MiB | 113.62 MiB |
| 1 | gpu-process | cpuPct | 0.183 | 0.000 | 1.000 | 1.000 | 1.000 |
| 1 | gpu-process | gpuPct | 0.028 | 0.019 | 0.046 | 0.652 | 0.685 |
| 1 | gpu-process | gpuDedicatedBytes | 101.68 MiB | 98.48 MiB | 107.73 MiB | 131.23 MiB | 131.23 MiB |
| 1 | browser | privateBytes | 47.09 MiB | 47.63 MiB | 49.32 MiB | 49.71 MiB | 49.75 MiB |
| 1 | browser | workingSetBytes | 129.71 MiB | 130.50 MiB | 132.57 MiB | 132.72 MiB | 132.98 MiB |
| 1 | browser | cpuPct | 0.956 | 1.000 | 1.000 | 2.000 | 5.000 |
| 1 | browser | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 1 | browser | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 1 | crashpad | privateBytes | 2.90 MiB | 2.88 MiB | 3.40 MiB | 3.42 MiB | 3.44 MiB |
| 1 | crashpad | workingSetBytes | 13.80 MiB | 13.33 MiB | 19.12 MiB | 19.18 MiB | 19.18 MiB |
| 1 | crashpad | cpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 1 | crashpad | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 1 | crashpad | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 1 | renderer-unassigned | privateBytes | 161.33 MiB | 158.66 MiB | 212.24 MiB | 249.88 MiB | 250.68 MiB |
| 1 | renderer-unassigned | workingSetBytes | 205.78 MiB | 203.04 MiB | 255.89 MiB | 292.46 MiB | 292.68 MiB |
| 1 | renderer-unassigned | cpuPct | 2.450 | 2.000 | 3.000 | 4.000 | 11.000 |
| 1 | renderer-unassigned | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 1 | renderer-unassigned | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 1 | utility | privateBytes | 23.73 MiB | 23.69 MiB | 25.82 MiB | 25.86 MiB | 25.86 MiB |
| 1 | utility | workingSetBytes | 60.85 MiB | 60.73 MiB | 63.18 MiB | 63.20 MiB | 63.20 MiB |
| 1 | utility | cpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 1 | utility | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 1 | utility | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 1 | renderer-hub | privateBytes | 64.51 MiB | 64.75 MiB | 77.75 MiB | 79.31 MiB | 79.32 MiB |
| 1 | renderer-hub | workingSetBytes | 105.89 MiB | 106.37 MiB | 119.34 MiB | 120.80 MiB | 120.86 MiB |
| 1 | renderer-hub | cpuPct | 0.017 | 0.000 | 0.000 | 1.000 | 1.000 |
| 1 | renderer-hub | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 1 | renderer-hub | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 1 | go-host | privateBytes | 73.58 MiB | 72.36 MiB | 78.95 MiB | 92.32 MiB | 95.32 MiB |
| 1 | go-host | workingSetBytes | 68.94 MiB | 67.91 MiB | 74.58 MiB | 88.03 MiB | 90.89 MiB |
| 1 | go-host | cpuPct | 2.411 | 2.000 | 3.000 | 4.000 | 10.000 |
| 1 | go-host | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 1 | go-host | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 1 | game | frameTimeMs | 18.771 ms | 18.733 ms | 27.263 ms | 33.912 ms | 69.051 ms |
| 1 | game | dropped | 0.000 % | 0.000 % | 0.000 % | 0.000 % | 0.000 % |
| 2 | browser | privateBytes | 46.66 MiB | 46.07 MiB | 48.86 MiB | 49.16 MiB | 49.47 MiB |
| 2 | browser | workingSetBytes | 132.17 MiB | 131.71 MiB | 134.99 MiB | 135.27 MiB | 135.54 MiB |
| 2 | browser | cpuPct | 0.944 | 1.000 | 1.000 | 2.000 | 3.000 |
| 2 | browser | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 2 | browser | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 2 | renderer-hub | privateBytes | 63.71 MiB | 64.00 MiB | 77.46 MiB | 78.77 MiB | 79.02 MiB |
| 2 | renderer-hub | workingSetBytes | 106.17 MiB | 106.65 MiB | 120.25 MiB | 121.42 MiB | 121.59 MiB |
| 2 | renderer-hub | cpuPct | 0.022 | 0.000 | 0.000 | 1.000 | 1.000 |
| 2 | renderer-hub | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 2 | renderer-hub | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 2 | utility | privateBytes | 23.08 MiB | 22.36 MiB | 25.20 MiB | 25.20 MiB | 25.20 MiB |
| 2 | utility | workingSetBytes | 58.34 MiB | 57.83 MiB | 60.86 MiB | 60.87 MiB | 60.87 MiB |
| 2 | utility | cpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 2 | utility | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 2 | utility | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 2 | crashpad | privateBytes | 2.84 MiB | 2.82 MiB | 3.22 MiB | 3.22 MiB | 3.22 MiB |
| 2 | crashpad | workingSetBytes | 13.10 MiB | 12.83 MiB | 18.55 MiB | 18.55 MiB | 18.55 MiB |
| 2 | crashpad | cpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 2 | crashpad | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 2 | crashpad | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 2 | gpu-process | privateBytes | 140.38 MiB | 136.16 MiB | 152.27 MiB | 177.29 MiB | 182.82 MiB |
| 2 | gpu-process | workingSetBytes | 101.80 MiB | 101.42 MiB | 108.65 MiB | 109.52 MiB | 109.52 MiB |
| 2 | gpu-process | cpuPct | 0.172 | 0.000 | 1.000 | 1.000 | 1.000 |
| 2 | gpu-process | gpuPct | 0.019 | 0.014 | 0.042 | 0.208 | 0.228 |
| 2 | gpu-process | gpuDedicatedBytes | 95.84 MiB | 93.42 MiB | 102.92 MiB | 111.92 MiB | 116.42 MiB |
| 2 | go-host | privateBytes | 72.59 MiB | 72.13 MiB | 75.16 MiB | 83.39 MiB | 119.82 MiB |
| 2 | go-host | workingSetBytes | 67.61 MiB | 67.16 MiB | 70.23 MiB | 78.36 MiB | 113.59 MiB |
| 2 | go-host | cpuPct | 2.439 | 2.000 | 3.000 | 3.000 | 11.000 |
| 2 | go-host | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 2 | go-host | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 2 | renderer-unassigned | privateBytes | 150.51 MiB | 144.95 MiB | 212.45 MiB | 235.64 MiB | 241.33 MiB |
| 2 | renderer-unassigned | workingSetBytes | 195.88 MiB | 190.45 MiB | 257.34 MiB | 278.64 MiB | 285.32 MiB |
| 2 | renderer-unassigned | cpuPct | 2.461 | 2.000 | 3.000 | 4.000 | 8.000 |
| 2 | renderer-unassigned | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 2 | renderer-unassigned | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 2 | game | frameTimeMs | 17.555 ms | 16.598 ms | 27.138 ms | 37.793 ms | 362.543 ms |
| 2 | game | dropped | 0.000 % | 0.000 % | 0.000 % | 0.000 % | 0.000 % |
| 3 | renderer-unassigned | privateBytes | 158.80 MiB | 162.37 MiB | 205.23 MiB | 228.54 MiB | 232.37 MiB |
| 3 | renderer-unassigned | workingSetBytes | 203.79 MiB | 208.27 MiB | 249.14 MiB | 271.86 MiB | 276.27 MiB |
| 3 | renderer-unassigned | cpuPct | 2.500 | 2.000 | 3.000 | 4.000 | 8.000 |
| 3 | renderer-unassigned | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 3 | renderer-unassigned | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 3 | gpu-process | privateBytes | 142.34 MiB | 138.17 MiB | 158.04 MiB | 178.53 MiB | 182.34 MiB |
| 3 | gpu-process | workingSetBytes | 99.05 MiB | 98.57 MiB | 105.93 MiB | 107.65 MiB | 107.89 MiB |
| 3 | gpu-process | cpuPct | 0.083 | 0.000 | 1.000 | 1.000 | 1.000 |
| 3 | gpu-process | gpuPct | 0.019 | 0.014 | 0.035 | 0.217 | 0.252 |
| 3 | gpu-process | gpuDedicatedBytes | 98.79 MiB | 96.20 MiB | 104.20 MiB | 116.70 MiB | 127.70 MiB |
| 3 | renderer-hub | privateBytes | 63.88 MiB | 64.54 MiB | 75.71 MiB | 76.30 MiB | 76.55 MiB |
| 3 | renderer-hub | workingSetBytes | 106.49 MiB | 107.10 MiB | 118.68 MiB | 119.23 MiB | 119.42 MiB |
| 3 | renderer-hub | cpuPct | 0.022 | 0.000 | 0.000 | 1.000 | 1.000 |
| 3 | renderer-hub | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 3 | renderer-hub | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 3 | browser | privateBytes | 46.89 MiB | 47.31 MiB | 49.03 MiB | 49.14 MiB | 49.77 MiB |
| 3 | browser | workingSetBytes | 131.31 MiB | 131.87 MiB | 134.05 MiB | 134.17 MiB | 134.73 MiB |
| 3 | browser | cpuPct | 0.972 | 1.000 | 1.000 | 2.000 | 3.000 |
| 3 | browser | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 3 | browser | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 3 | utility | privateBytes | 23.27 MiB | 23.54 MiB | 25.40 MiB | 25.40 MiB | 25.40 MiB |
| 3 | utility | workingSetBytes | 58.98 MiB | 59.70 MiB | 61.77 MiB | 61.77 MiB | 61.77 MiB |
| 3 | utility | cpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 3 | utility | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 3 | utility | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 3 | go-host | privateBytes | 72.83 MiB | 72.56 MiB | 76.39 MiB | 78.89 MiB | 79.93 MiB |
| 3 | go-host | workingSetBytes | 67.27 MiB | 66.95 MiB | 70.80 MiB | 72.96 MiB | 73.87 MiB |
| 3 | go-host | cpuPct | 2.411 | 2.000 | 3.000 | 4.000 | 7.000 |
| 3 | go-host | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 3 | go-host | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 3 | crashpad | privateBytes | 2.84 MiB | 2.82 MiB | 3.22 MiB | 3.22 MiB | 3.22 MiB |
| 3 | crashpad | workingSetBytes | 13.14 MiB | 12.82 MiB | 18.55 MiB | 18.55 MiB | 18.55 MiB |
| 3 | crashpad | cpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 3 | crashpad | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 3 | crashpad | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 3 | game | frameTimeMs | 14.596 ms | 13.020 ms | 23.852 ms | 30.917 ms | 355.601 ms |
| 3 | game | dropped | 0.000 % | 0.000 % | 0.000 % | 0.000 % | 0.000 % |

## Frames perdidos

| Corrida | Perdidos | Frames totales | Porcentaje |
|---:|---:|---:|---:|
| 1 | 0 | 9586 | 0.000 % |
| 2 | 0 | 10250 | 0.000 % |
| 3 | 0 | 12320 | 0.000 % |

## Repetibilidad entre corridas

| Condición | Rol | Métrica | N | Media | Desviación | Ruido | Gate |
|---|---|---|---:|---:|---:|---:|:---:|
| A1 V1 ON | gpu-process | privateBytes | 3 | 144.20 MiB | 5.02 MiB | 3.48 % | ✓ |
| A1 V1 ON | gpu-process | workingSetBytes | 3 | 101.92 MiB | 2.94 MiB | 2.88 % | ✓ |
| A1 V1 ON | gpu-process | cpuPct | 3 | 0.146 | 0.055 | 37.46 % | ✗ |
| A1 V1 ON | gpu-process | gpuPct | 3 | 0.022 | 0.005 | 22.59 % | ✗ |
| A1 V1 ON | gpu-process | gpuDedicatedBytes | 3 | 98.77 MiB | 2.92 MiB | 2.96 % | ✓ |
| A1 V1 ON | browser | privateBytes | 3 | 46.88 MiB | 0.21 MiB | 0.46 % | ✓ |
| A1 V1 ON | browser | workingSetBytes | 3 | 131.06 MiB | 1.25 MiB | 0.95 % | ✓ |
| A1 V1 ON | browser | cpuPct | 3 | 0.957 | 0.014 | 1.46 % | ✓ |
| A1 V1 ON | browser | gpuPct | 3 | 0.000 | 0.000 | 0.00 % | ✓ |
| A1 V1 ON | browser | gpuDedicatedBytes | 3 | 0.00 MiB | 0.00 MiB | 0.00 % | ✓ |
| A1 V1 ON | crashpad | privateBytes | 3 | 2.86 MiB | 0.04 MiB | 1.35 % | ✓ |
| A1 V1 ON | crashpad | workingSetBytes | 3 | 13.35 MiB | 0.39 MiB | 2.96 % | ✓ |
| A1 V1 ON | crashpad | cpuPct | 3 | 0.000 | 0.000 | 0.00 % | ✓ |
| A1 V1 ON | crashpad | gpuPct | 3 | 0.000 | 0.000 | 0.00 % | ✓ |
| A1 V1 ON | crashpad | gpuDedicatedBytes | 3 | 0.00 MiB | 0.00 MiB | 0.00 % | ✓ |
| A1 V1 ON | renderer-unassigned | privateBytes | 3 | 156.88 MiB | 5.66 MiB | 3.61 % | ✓ |
| A1 V1 ON | renderer-unassigned | workingSetBytes | 3 | 201.82 MiB | 5.23 MiB | 2.59 % | ✓ |
| A1 V1 ON | renderer-unassigned | cpuPct | 3 | 2.470 | 0.026 | 1.06 % | ✓ |
| A1 V1 ON | renderer-unassigned | gpuPct | 3 | 0.000 | 0.000 | 0.00 % | ✓ |
| A1 V1 ON | renderer-unassigned | gpuDedicatedBytes | 3 | 0.00 MiB | 0.00 MiB | 0.00 % | ✓ |
| A1 V1 ON | utility | privateBytes | 3 | 23.36 MiB | 0.33 MiB | 1.42 % | ✓ |
| A1 V1 ON | utility | workingSetBytes | 3 | 59.39 MiB | 1.31 MiB | 2.20 % | ✓ |
| A1 V1 ON | utility | cpuPct | 3 | 0.000 | 0.000 | 0.00 % | ✓ |
| A1 V1 ON | utility | gpuPct | 3 | 0.000 | 0.000 | 0.00 % | ✓ |
| A1 V1 ON | utility | gpuDedicatedBytes | 3 | 0.00 MiB | 0.00 MiB | 0.00 % | ✓ |
| A1 V1 ON | renderer-hub | privateBytes | 3 | 64.03 MiB | 0.42 MiB | 0.66 % | ✓ |
| A1 V1 ON | renderer-hub | workingSetBytes | 3 | 106.18 MiB | 0.30 MiB | 0.28 % | ✓ |
| A1 V1 ON | renderer-hub | cpuPct | 3 | 0.020 | 0.003 | 15.75 % | ✗ |
| A1 V1 ON | renderer-hub | gpuPct | 3 | 0.000 | 0.000 | 0.00 % | ✓ |
| A1 V1 ON | renderer-hub | gpuDedicatedBytes | 3 | 0.00 MiB | 0.00 MiB | 0.00 % | ✓ |
| A1 V1 ON | go-host | privateBytes | 3 | 73.00 MiB | 0.51 MiB | 0.70 % | ✓ |
| A1 V1 ON | go-host | workingSetBytes | 3 | 67.94 MiB | 0.88 MiB | 1.30 % | ✓ |
| A1 V1 ON | go-host | cpuPct | 3 | 2.420 | 0.016 | 0.66 % | ✓ |
| A1 V1 ON | go-host | gpuPct | 3 | 0.000 | 0.000 | 0.00 % | ✓ |
| A1 V1 ON | go-host | gpuDedicatedBytes | 3 | 0.00 MiB | 0.00 MiB | 0.00 % | ✓ |
| A1 V1 ON | game | frameTimeMs | 3 | 16.974 ms | 2.147 ms | 12.65 % | ✗ |
| A1 V1 ON | game | dropped | 3 | 0.000 % | 0.000 % | 0.00 % | ✓ |
