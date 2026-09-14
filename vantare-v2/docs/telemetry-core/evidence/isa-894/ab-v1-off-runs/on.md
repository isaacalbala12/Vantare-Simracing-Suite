# Huella mínima · V1_ON

Corridas: `a1-20260830-180429.csv`, `a1-20260830-181229.csv`, `a1-20260830-181942.csv`. Ruido = desviación muestral / media; hacen falta al menos 3 corridas y el gate falla por encima de 5 %.

## Recuperación de sesiones ETW

No se detectaron sesiones huérfanas `VantareHuella-*`.

## WebView2 del sistema permitidos

No invalidan la corrida porque cada perfil tiene browser y GPU process propios.

| Corrida | Procesos | Perfiles `--user-data-dir` |
|---:|---:|---|
| 1 | 6 | `%LOCALAPPDATA%\Packages\MicrosoftWindows.Client.CBS_cw5n1h2txyewy\LocalState\EBWebView` |
| 2 | 6 | `%LOCALAPPDATA%\Packages\MicrosoftWindows.Client.CBS_cw5n1h2txyewy\LocalState\EBWebView` |
| 3 | 6 | `%LOCALAPPDATA%\Packages\MicrosoftWindows.Client.CBS_cw5n1h2txyewy\LocalState\EBWebView` |

## Resumen por corrida

| Corrida | Rol | Métrica | Media | p50 | p95 | p99 | Máximo |
|---:|---|---|---:|---:|---:|---:|---:|
| 1 | gpu-process | privateBytes | 141.69 MiB | 138.20 MiB | 152.62 MiB | 184.57 MiB | 184.57 MiB |
| 1 | gpu-process | workingSetBytes | 101.35 MiB | 100.98 MiB | 102.25 MiB | 108.55 MiB | 108.55 MiB |
| 1 | gpu-process | cpuPct | 0.041 | 0.000 | 0.000 | 1.000 | 1.000 |
| 1 | gpu-process | gpuPct | 0.009 | 0.007 | 0.028 | 0.034 | 0.034 |
| 1 | gpu-process | gpuDedicatedBytes | 96.84 MiB | 94.48 MiB | 102.92 MiB | 107.98 MiB | 107.98 MiB |
| 1 | renderer-unassigned | privateBytes | 137.12 MiB | 131.46 MiB | 189.96 MiB | 220.94 MiB | 220.94 MiB |
| 1 | renderer-unassigned | workingSetBytes | 181.32 MiB | 175.90 MiB | 234.02 MiB | 263.00 MiB | 263.00 MiB |
| 1 | renderer-unassigned | cpuPct | 2.274 | 2.000 | 3.000 | 7.000 | 7.000 |
| 1 | renderer-unassigned | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 1 | renderer-unassigned | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 1 | utility | privateBytes | 22.27 MiB | 22.47 MiB | 22.55 MiB | 22.65 MiB | 22.65 MiB |
| 1 | utility | workingSetBytes | 60.04 MiB | 60.47 MiB | 60.50 MiB | 60.50 MiB | 60.50 MiB |
| 1 | utility | cpuPct | 0.014 | 0.000 | 0.000 | 1.000 | 1.000 |
| 1 | utility | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 1 | utility | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 1 | go-host | privateBytes | 72.34 MiB | 72.09 MiB | 75.27 MiB | 79.67 MiB | 79.67 MiB |
| 1 | go-host | workingSetBytes | 66.09 MiB | 65.80 MiB | 69.22 MiB | 73.61 MiB | 73.61 MiB |
| 1 | go-host | cpuPct | 2.521 | 2.000 | 3.000 | 9.000 | 9.000 |
| 1 | go-host | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 1 | go-host | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 1 | renderer-hub | privateBytes | 57.64 MiB | 57.32 MiB | 63.75 MiB | 64.32 MiB | 64.32 MiB |
| 1 | renderer-hub | workingSetBytes | 100.23 MiB | 100.15 MiB | 106.66 MiB | 107.17 MiB | 107.17 MiB |
| 1 | renderer-hub | cpuPct | 0.014 | 0.000 | 0.000 | 1.000 | 1.000 |
| 1 | renderer-hub | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 1 | renderer-hub | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 1 | browser | privateBytes | 44.87 MiB | 45.11 MiB | 45.46 MiB | 45.75 MiB | 45.75 MiB |
| 1 | browser | workingSetBytes | 127.20 MiB | 127.61 MiB | 128.33 MiB | 128.60 MiB | 128.60 MiB |
| 1 | browser | cpuPct | 1.000 | 1.000 | 1.000 | 3.000 | 3.000 |
| 1 | browser | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 1 | browser | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 1 | crashpad | privateBytes | 2.87 MiB | 2.88 MiB | 3.20 MiB | 3.20 MiB | 3.20 MiB |
| 1 | crashpad | workingSetBytes | 13.46 MiB | 12.72 MiB | 18.46 MiB | 18.46 MiB | 18.46 MiB |
| 1 | crashpad | cpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 1 | crashpad | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 1 | crashpad | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 1 | game | frameTimeMs | 11.579 ms | 10.096 ms | 19.284 ms | 28.287 ms | 78.389 ms |
| 1 | game | dropped | 0.000 % | 0.000 % | 0.000 % | 0.000 % | 0.000 % |
| 2 | browser | privateBytes | 44.97 MiB | 45.04 MiB | 45.61 MiB | 45.88 MiB | 45.88 MiB |
| 2 | browser | workingSetBytes | 127.34 MiB | 127.50 MiB | 128.55 MiB | 128.82 MiB | 128.82 MiB |
| 2 | browser | cpuPct | 0.918 | 1.000 | 1.000 | 3.000 | 3.000 |
| 2 | browser | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 2 | browser | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 2 | renderer-unassigned | privateBytes | 129.18 MiB | 128.16 MiB | 142.30 MiB | 145.60 MiB | 145.60 MiB |
| 2 | renderer-unassigned | workingSetBytes | 173.98 MiB | 173.96 MiB | 186.82 MiB | 189.48 MiB | 189.48 MiB |
| 2 | renderer-unassigned | cpuPct | 2.192 | 2.000 | 3.000 | 7.000 | 7.000 |
| 2 | renderer-unassigned | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 2 | renderer-unassigned | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 2 | renderer-hub | privateBytes | 56.13 MiB | 55.85 MiB | 62.62 MiB | 63.19 MiB | 63.19 MiB |
| 2 | renderer-hub | workingSetBytes | 98.91 MiB | 98.86 MiB | 105.61 MiB | 106.04 MiB | 106.04 MiB |
| 2 | renderer-hub | cpuPct | 0.014 | 0.000 | 0.000 | 1.000 | 1.000 |
| 2 | renderer-hub | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 2 | renderer-hub | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 2 | utility | privateBytes | 22.19 MiB | 22.40 MiB | 22.50 MiB | 22.58 MiB | 22.58 MiB |
| 2 | utility | workingSetBytes | 60.01 MiB | 60.45 MiB | 60.50 MiB | 60.52 MiB | 60.52 MiB |
| 2 | utility | cpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 2 | utility | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 2 | utility | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 2 | crashpad | privateBytes | 2.91 MiB | 2.92 MiB | 3.24 MiB | 3.24 MiB | 3.24 MiB |
| 2 | crashpad | workingSetBytes | 13.48 MiB | 12.74 MiB | 18.46 MiB | 18.46 MiB | 18.46 MiB |
| 2 | crashpad | cpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 2 | crashpad | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 2 | crashpad | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 2 | go-host | privateBytes | 72.65 MiB | 72.30 MiB | 75.81 MiB | 78.96 MiB | 78.96 MiB |
| 2 | go-host | workingSetBytes | 66.72 MiB | 66.34 MiB | 69.63 MiB | 72.80 MiB | 72.80 MiB |
| 2 | go-host | cpuPct | 2.685 | 3.000 | 4.000 | 8.000 | 8.000 |
| 2 | go-host | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 2 | go-host | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 2 | gpu-process | privateBytes | 139.28 MiB | 137.80 MiB | 152.54 MiB | 184.58 MiB | 184.58 MiB |
| 2 | gpu-process | workingSetBytes | 100.39 MiB | 100.18 MiB | 100.48 MiB | 108.14 MiB | 108.14 MiB |
| 2 | gpu-process | cpuPct | 0.082 | 0.000 | 1.000 | 1.000 | 1.000 |
| 2 | gpu-process | gpuPct | 0.009 | 0.007 | 0.026 | 0.046 | 0.046 |
| 2 | gpu-process | gpuDedicatedBytes | 95.52 MiB | 94.23 MiB | 102.23 MiB | 116.98 MiB | 116.98 MiB |
| 2 | game | frameTimeMs | 11.185 ms | 9.706 ms | 18.436 ms | 28.140 ms | 100.084 ms |
| 2 | game | dropped | 0.000 % | 0.000 % | 0.000 % | 0.000 % | 0.000 % |
| 3 | gpu-process | privateBytes | 186.07 MiB | 184.03 MiB | 204.42 MiB | 232.36 MiB | 232.36 MiB |
| 3 | gpu-process | workingSetBytes | 106.94 MiB | 106.73 MiB | 106.91 MiB | 115.04 MiB | 115.04 MiB |
| 3 | gpu-process | cpuPct | 0.123 | 0.000 | 1.000 | 1.000 | 1.000 |
| 3 | gpu-process | gpuPct | 0.113 | 0.107 | 0.130 | 0.537 | 0.537 |
| 3 | gpu-process | gpuDedicatedBytes | 138.29 MiB | 138.02 MiB | 147.02 MiB | 157.02 MiB | 157.02 MiB |
| 3 | go-host | privateBytes | 73.55 MiB | 73.36 MiB | 75.07 MiB | 79.66 MiB | 79.66 MiB |
| 3 | go-host | workingSetBytes | 67.00 MiB | 66.89 MiB | 68.39 MiB | 73.16 MiB | 73.16 MiB |
| 3 | go-host | cpuPct | 2.671 | 3.000 | 3.000 | 7.000 | 7.000 |
| 3 | go-host | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 3 | go-host | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 3 | renderer-hub | privateBytes | 73.81 MiB | 73.60 MiB | 78.60 MiB | 79.29 MiB | 79.29 MiB |
| 3 | renderer-hub | workingSetBytes | 122.08 MiB | 122.34 MiB | 127.57 MiB | 127.80 MiB | 127.80 MiB |
| 3 | renderer-hub | cpuPct | 0.096 | 0.000 | 1.000 | 1.000 | 1.000 |
| 3 | renderer-hub | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 3 | renderer-hub | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 3 | crashpad | privateBytes | 2.90 MiB | 2.89 MiB | 3.22 MiB | 3.23 MiB | 3.23 MiB |
| 3 | crashpad | workingSetBytes | 13.59 MiB | 12.74 MiB | 18.48 MiB | 18.49 MiB | 18.49 MiB |
| 3 | crashpad | cpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 3 | crashpad | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 3 | crashpad | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 3 | browser | privateBytes | 44.80 MiB | 45.01 MiB | 45.44 MiB | 45.84 MiB | 45.84 MiB |
| 3 | browser | workingSetBytes | 127.16 MiB | 127.52 MiB | 128.34 MiB | 128.73 MiB | 128.73 MiB |
| 3 | browser | cpuPct | 0.986 | 1.000 | 1.000 | 3.000 | 3.000 |
| 3 | browser | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 3 | browser | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 3 | renderer-unassigned | privateBytes | 137.80 MiB | 131.58 MiB | 168.73 MiB | 206.87 MiB | 206.87 MiB |
| 3 | renderer-unassigned | workingSetBytes | 182.27 MiB | 176.19 MiB | 212.75 MiB | 249.19 MiB | 249.19 MiB |
| 3 | renderer-unassigned | cpuPct | 2.301 | 2.000 | 3.000 | 8.000 | 8.000 |
| 3 | renderer-unassigned | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 3 | renderer-unassigned | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 3 | utility | privateBytes | 22.38 MiB | 22.57 MiB | 22.68 MiB | 22.68 MiB | 22.68 MiB |
| 3 | utility | workingSetBytes | 60.46 MiB | 60.84 MiB | 60.89 MiB | 60.89 MiB | 60.89 MiB |
| 3 | utility | cpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 3 | utility | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 3 | utility | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 3 | game | frameTimeMs | 11.198 ms | 9.672 ms | 18.855 ms | 25.882 ms | 73.188 ms |
| 3 | game | dropped | 0.000 % | 0.000 % | 0.000 % | 0.000 % | 0.000 % |

## Frames perdidos

| Corrida | Perdidos | Frames totales | Porcentaje |
|---:|---:|---:|---:|
| 1 | 0 | 15539 | 0.000 % |
| 2 | 0 | 16091 | 0.000 % |
| 3 | 0 | 16070 | 0.000 % |

## Repetibilidad entre corridas

| Condición | Rol | Métrica | N | Media | Desviación | Ruido | Gate |
|---|---|---|---:|---:|---:|---:|:---:|
| V1_ON | gpu-process | privateBytes | 3 | 155.68 MiB | 26.34 MiB | 16.92 % | ✗ |
| V1_ON | gpu-process | workingSetBytes | 3 | 102.89 MiB | 3.54 MiB | 3.44 % | ✓ |
| V1_ON | gpu-process | cpuPct | 3 | 0.082 | 0.041 | 50.00 % | ✗ |
| V1_ON | gpu-process | gpuPct | 3 | 0.044 | 0.060 | 136.95 % | ✗ |
| V1_ON | gpu-process | gpuDedicatedBytes | 3 | 110.21 MiB | 24.32 MiB | 22.07 % | ✗ |
| V1_ON | renderer-unassigned | privateBytes | 3 | 134.70 MiB | 4.80 MiB | 3.56 % | ✓ |
| V1_ON | renderer-unassigned | workingSetBytes | 3 | 179.19 MiB | 4.54 MiB | 2.53 % | ✓ |
| V1_ON | renderer-unassigned | cpuPct | 3 | 2.256 | 0.057 | 2.53 % | ✓ |
| V1_ON | renderer-unassigned | gpuPct | 3 | 0.000 | 0.000 | 0.00 % | ✓ |
| V1_ON | renderer-unassigned | gpuDedicatedBytes | 3 | 0.00 MiB | 0.00 MiB | 0.00 % | ✓ |
| V1_ON | utility | privateBytes | 3 | 22.28 MiB | 0.10 MiB | 0.43 % | ✓ |
| V1_ON | utility | workingSetBytes | 3 | 60.17 MiB | 0.25 MiB | 0.42 % | ✓ |
| V1_ON | utility | cpuPct | 3 | 0.005 | 0.008 | 173.21 % | ✗ |
| V1_ON | utility | gpuPct | 3 | 0.000 | 0.000 | 0.00 % | ✓ |
| V1_ON | utility | gpuDedicatedBytes | 3 | 0.00 MiB | 0.00 MiB | 0.00 % | ✓ |
| V1_ON | go-host | privateBytes | 3 | 72.85 MiB | 0.63 MiB | 0.86 % | ✓ |
| V1_ON | go-host | workingSetBytes | 3 | 66.60 MiB | 0.47 MiB | 0.70 % | ✓ |
| V1_ON | go-host | cpuPct | 3 | 2.626 | 0.091 | 3.47 % | ✓ |
| V1_ON | go-host | gpuPct | 3 | 0.000 | 0.000 | 0.00 % | ✓ |
| V1_ON | go-host | gpuDedicatedBytes | 3 | 0.00 MiB | 0.00 MiB | 0.00 % | ✓ |
| V1_ON | renderer-hub | privateBytes | 3 | 62.52 MiB | 9.80 MiB | 15.68 % | ✗ |
| V1_ON | renderer-hub | workingSetBytes | 3 | 107.07 MiB | 13.01 MiB | 12.15 % | ✗ |
| V1_ON | renderer-hub | cpuPct | 3 | 0.041 | 0.047 | 115.47 % | ✗ |
| V1_ON | renderer-hub | gpuPct | 3 | 0.000 | 0.000 | 0.00 % | ✓ |
| V1_ON | renderer-hub | gpuDedicatedBytes | 3 | 0.00 MiB | 0.00 MiB | 0.00 % | ✓ |
| V1_ON | browser | privateBytes | 3 | 44.88 MiB | 0.08 MiB | 0.18 % | ✓ |
| V1_ON | browser | workingSetBytes | 3 | 127.23 MiB | 0.09 MiB | 0.07 % | ✓ |
| V1_ON | browser | cpuPct | 3 | 0.968 | 0.044 | 4.55 % | ✓ |
| V1_ON | browser | gpuPct | 3 | 0.000 | 0.000 | 0.00 % | ✓ |
| V1_ON | browser | gpuDedicatedBytes | 3 | 0.00 MiB | 0.00 MiB | 0.00 % | ✓ |
| V1_ON | crashpad | privateBytes | 3 | 2.89 MiB | 0.02 MiB | 0.79 % | ✓ |
| V1_ON | crashpad | workingSetBytes | 3 | 13.51 MiB | 0.07 MiB | 0.53 % | ✓ |
| V1_ON | crashpad | cpuPct | 3 | 0.000 | 0.000 | 0.00 % | ✓ |
| V1_ON | crashpad | gpuPct | 3 | 0.000 | 0.000 | 0.00 % | ✓ |
| V1_ON | crashpad | gpuDedicatedBytes | 3 | 0.00 MiB | 0.00 MiB | 0.00 % | ✓ |
| V1_ON | game | frameTimeMs | 3 | 11.321 ms | 0.224 ms | 1.98 % | ✓ |
| V1_ON | game | dropped | 3 | 0.000 % | 0.000 % | 0.00 % | ✓ |
