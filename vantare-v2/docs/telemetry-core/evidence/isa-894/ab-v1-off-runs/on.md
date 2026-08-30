# Huella mínima · A1 V1 ON

Corridas: `a1-20260830-051723.csv`, `a1-20260830-052436.csv`, `a1-20260830-053201.csv`. Ruido = desviación muestral / media; hacen falta al menos 3 corridas y el gate falla por encima de 5 %.

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
| 1 | utility | privateBytes | 21.91 MiB | 22.03 MiB | 22.27 MiB | 22.31 MiB | 22.31 MiB |
| 1 | utility | workingSetBytes | 56.64 MiB | 57.13 MiB | 57.73 MiB | 57.73 MiB | 57.73 MiB |
| 1 | utility | cpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 1 | utility | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 1 | utility | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 1 | gpu-process | privateBytes | 141.57 MiB | 137.25 MiB | 145.45 MiB | 190.59 MiB | 190.59 MiB |
| 1 | gpu-process | workingSetBytes | 99.57 MiB | 99.31 MiB | 100.05 MiB | 107.36 MiB | 107.36 MiB |
| 1 | gpu-process | cpuPct | 0.096 | 0.000 | 1.000 | 1.000 | 1.000 |
| 1 | gpu-process | gpuPct | 0.008 | 0.007 | 0.015 | 0.016 | 0.016 |
| 1 | gpu-process | gpuDedicatedBytes | 98.01 MiB | 95.20 MiB | 102.20 MiB | 117.95 MiB | 117.95 MiB |
| 1 | renderer-unassigned | privateBytes | 141.61 MiB | 141.67 MiB | 179.88 MiB | 226.58 MiB | 226.58 MiB |
| 1 | renderer-unassigned | workingSetBytes | 186.13 MiB | 186.57 MiB | 222.65 MiB | 268.86 MiB | 268.86 MiB |
| 1 | renderer-unassigned | cpuPct | 2.548 | 2.000 | 3.000 | 10.000 | 10.000 |
| 1 | renderer-unassigned | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 1 | renderer-unassigned | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 1 | go-host | privateBytes | 72.88 MiB | 72.70 MiB | 75.54 MiB | 79.44 MiB | 79.44 MiB |
| 1 | go-host | workingSetBytes | 68.45 MiB | 68.31 MiB | 70.79 MiB | 74.59 MiB | 74.59 MiB |
| 1 | go-host | cpuPct | 2.671 | 3.000 | 3.000 | 9.000 | 9.000 |
| 1 | go-host | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 1 | go-host | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 1 | renderer-hub | privateBytes | 54.48 MiB | 54.54 MiB | 61.39 MiB | 61.45 MiB | 61.45 MiB |
| 1 | renderer-hub | workingSetBytes | 96.71 MiB | 96.98 MiB | 103.48 MiB | 103.86 MiB | 103.86 MiB |
| 1 | renderer-hub | cpuPct | 0.014 | 0.000 | 0.000 | 1.000 | 1.000 |
| 1 | renderer-hub | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 1 | renderer-hub | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 1 | browser | privateBytes | 45.12 MiB | 45.12 MiB | 45.82 MiB | 46.01 MiB | 46.01 MiB |
| 1 | browser | workingSetBytes | 128.91 MiB | 129.13 MiB | 130.32 MiB | 130.34 MiB | 130.34 MiB |
| 1 | browser | cpuPct | 1.000 | 1.000 | 1.000 | 3.000 | 3.000 |
| 1 | browser | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 1 | browser | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 1 | crashpad | privateBytes | 2.91 MiB | 2.92 MiB | 3.27 MiB | 3.28 MiB | 3.28 MiB |
| 1 | crashpad | workingSetBytes | 13.57 MiB | 12.83 MiB | 18.59 MiB | 18.59 MiB | 18.59 MiB |
| 1 | crashpad | cpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 1 | crashpad | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 1 | crashpad | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 1 | game | frameTimeMs | 14.545 ms | 13.117 ms | 23.204 ms | 30.956 ms | 137.824 ms |
| 1 | game | dropped | 0.000 % | 0.000 % | 0.000 % | 0.000 % | 0.000 % |
| 2 | renderer-unassigned | privateBytes | 130.35 MiB | 129.46 MiB | 139.61 MiB | 141.50 MiB | 141.50 MiB |
| 2 | renderer-unassigned | workingSetBytes | 175.36 MiB | 174.17 MiB | 185.21 MiB | 186.95 MiB | 186.95 MiB |
| 2 | renderer-unassigned | cpuPct | 2.529 | 2.000 | 3.000 | 9.000 | 9.000 |
| 2 | renderer-unassigned | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 2 | renderer-unassigned | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 2 | go-host | privateBytes | 73.30 MiB | 72.52 MiB | 77.60 MiB | 86.68 MiB | 86.68 MiB |
| 2 | go-host | workingSetBytes | 68.18 MiB | 67.64 MiB | 72.43 MiB | 80.98 MiB | 80.98 MiB |
| 2 | go-host | cpuPct | 2.500 | 2.000 | 3.000 | 8.000 | 8.000 |
| 2 | go-host | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 2 | go-host | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 2 | browser | privateBytes | 45.25 MiB | 45.16 MiB | 45.77 MiB | 46.36 MiB | 46.36 MiB |
| 2 | browser | workingSetBytes | 128.93 MiB | 129.10 MiB | 130.11 MiB | 130.71 MiB | 130.71 MiB |
| 2 | browser | cpuPct | 1.000 | 1.000 | 2.000 | 3.000 | 3.000 |
| 2 | browser | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 2 | browser | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 2 | crashpad | privateBytes | 2.91 MiB | 2.91 MiB | 3.23 MiB | 3.24 MiB | 3.24 MiB |
| 2 | crashpad | workingSetBytes | 13.62 MiB | 12.84 MiB | 18.57 MiB | 18.58 MiB | 18.58 MiB |
| 2 | crashpad | cpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 2 | crashpad | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 2 | crashpad | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 2 | gpu-process | privateBytes | 143.68 MiB | 138.94 MiB | 176.04 MiB | 182.75 MiB | 182.75 MiB |
| 2 | gpu-process | workingSetBytes | 98.71 MiB | 98.70 MiB | 98.86 MiB | 106.31 MiB | 106.31 MiB |
| 2 | gpu-process | cpuPct | 0.186 | 0.000 | 1.000 | 1.000 | 1.000 |
| 2 | gpu-process | gpuPct | 0.016 | 0.013 | 0.033 | 0.103 | 0.103 |
| 2 | gpu-process | gpuDedicatedBytes | 99.67 MiB | 95.20 MiB | 104.95 MiB | 138.70 MiB | 138.70 MiB |
| 2 | utility | privateBytes | 21.97 MiB | 21.86 MiB | 22.34 MiB | 22.35 MiB | 22.35 MiB |
| 2 | utility | workingSetBytes | 56.67 MiB | 57.20 MiB | 57.78 MiB | 57.83 MiB | 57.83 MiB |
| 2 | utility | cpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 2 | utility | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 2 | utility | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 2 | renderer-hub | privateBytes | 54.14 MiB | 53.99 MiB | 60.69 MiB | 60.94 MiB | 60.94 MiB |
| 2 | renderer-hub | workingSetBytes | 96.32 MiB | 96.62 MiB | 103.09 MiB | 103.30 MiB | 103.30 MiB |
| 2 | renderer-hub | cpuPct | 0.014 | 0.000 | 0.000 | 1.000 | 1.000 |
| 2 | renderer-hub | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 2 | renderer-hub | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 2 | game | frameTimeMs | 17.255 ms | 17.028 ms | 26.914 ms | 35.007 ms | 102.781 ms |
| 2 | game | dropped | 0.000 % | 0.000 % | 0.000 % | 0.000 % | 0.000 % |
| 3 | browser | privateBytes | 44.94 MiB | 45.15 MiB | 45.55 MiB | 46.07 MiB | 46.07 MiB |
| 3 | browser | workingSetBytes | 127.25 MiB | 127.75 MiB | 128.51 MiB | 128.77 MiB | 128.77 MiB |
| 3 | browser | cpuPct | 1.000 | 1.000 | 1.000 | 3.000 | 3.000 |
| 3 | browser | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 3 | browser | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 3 | go-host | privateBytes | 72.32 MiB | 72.23 MiB | 73.87 MiB | 74.91 MiB | 74.91 MiB |
| 3 | go-host | workingSetBytes | 66.60 MiB | 66.61 MiB | 67.91 MiB | 68.88 MiB | 68.88 MiB |
| 3 | go-host | cpuPct | 2.767 | 3.000 | 3.000 | 10.000 | 10.000 |
| 3 | go-host | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 3 | go-host | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 3 | gpu-process | privateBytes | 140.72 MiB | 136.77 MiB | 152.91 MiB | 182.40 MiB | 182.40 MiB |
| 3 | gpu-process | workingSetBytes | 98.25 MiB | 98.17 MiB | 98.36 MiB | 106.05 MiB | 106.05 MiB |
| 3 | gpu-process | cpuPct | 0.068 | 0.000 | 1.000 | 1.000 | 1.000 |
| 3 | gpu-process | gpuPct | 0.014 | 0.014 | 0.022 | 0.041 | 0.041 |
| 3 | gpu-process | gpuDedicatedBytes | 98.15 MiB | 95.20 MiB | 103.20 MiB | 116.70 MiB | 116.70 MiB |
| 3 | utility | privateBytes | 22.02 MiB | 22.27 MiB | 22.37 MiB | 22.37 MiB | 22.37 MiB |
| 3 | utility | workingSetBytes | 56.82 MiB | 57.80 MiB | 57.84 MiB | 57.87 MiB | 57.87 MiB |
| 3 | utility | cpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 3 | utility | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 3 | utility | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 3 | crashpad | privateBytes | 2.90 MiB | 2.91 MiB | 3.24 MiB | 3.25 MiB | 3.25 MiB |
| 3 | crashpad | workingSetBytes | 13.59 MiB | 12.86 MiB | 18.59 MiB | 18.61 MiB | 18.61 MiB |
| 3 | crashpad | cpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 3 | crashpad | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 3 | crashpad | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 3 | renderer-hub | privateBytes | 54.88 MiB | 55.09 MiB | 61.54 MiB | 61.61 MiB | 61.61 MiB |
| 3 | renderer-hub | workingSetBytes | 97.18 MiB | 97.70 MiB | 103.78 MiB | 104.04 MiB | 104.04 MiB |
| 3 | renderer-hub | cpuPct | 0.014 | 0.000 | 0.000 | 1.000 | 1.000 |
| 3 | renderer-hub | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 3 | renderer-hub | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 3 | renderer-unassigned | privateBytes | 146.07 MiB | 144.81 MiB | 182.75 MiB | 221.15 MiB | 221.15 MiB |
| 3 | renderer-unassigned | workingSetBytes | 190.85 MiB | 190.31 MiB | 226.16 MiB | 263.49 MiB | 263.49 MiB |
| 3 | renderer-unassigned | cpuPct | 2.411 | 2.000 | 3.000 | 12.000 | 12.000 |
| 3 | renderer-unassigned | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 3 | renderer-unassigned | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 3 | game | frameTimeMs | 13.986 ms | 12.751 ms | 22.165 ms | 27.733 ms | 157.526 ms |
| 3 | game | dropped | 0.000 % | 0.000 % | 0.000 % | 0.000 % | 0.000 % |

## Frames perdidos

| Corrida | Perdidos | Frames totales | Porcentaje |
|---:|---:|---:|---:|
| 1 | 0 | 12372 | 0.000 % |
| 2 | 0 | 10429 | 0.000 % |
| 3 | 0 | 12866 | 0.000 % |

## Repetibilidad entre corridas

| Condición | Rol | Métrica | N | Media | Desviación | Ruido | Gate |
|---|---|---|---:|---:|---:|---:|:---:|
| A1 V1 ON | utility | privateBytes | 3 | 21.97 MiB | 0.05 MiB | 0.24 % | ✓ |
| A1 V1 ON | utility | workingSetBytes | 3 | 56.71 MiB | 0.10 MiB | 0.17 % | ✓ |
| A1 V1 ON | utility | cpuPct | 3 | 0.000 | 0.000 | 0.00 % | ✓ |
| A1 V1 ON | utility | gpuPct | 3 | 0.000 | 0.000 | 0.00 % | ✓ |
| A1 V1 ON | utility | gpuDedicatedBytes | 3 | 0.00 MiB | 0.00 MiB | 0.00 % | ✓ |
| A1 V1 ON | gpu-process | privateBytes | 3 | 141.99 MiB | 1.52 MiB | 1.07 % | ✓ |
| A1 V1 ON | gpu-process | workingSetBytes | 3 | 98.85 MiB | 0.67 MiB | 0.68 % | ✓ |
| A1 V1 ON | gpu-process | cpuPct | 3 | 0.117 | 0.061 | 52.54 % | ✗ |
| A1 V1 ON | gpu-process | gpuPct | 3 | 0.013 | 0.004 | 34.50 % | ✗ |
| A1 V1 ON | gpu-process | gpuDedicatedBytes | 3 | 98.61 MiB | 0.92 MiB | 0.94 % | ✓ |
| A1 V1 ON | renderer-unassigned | privateBytes | 3 | 139.34 MiB | 8.10 MiB | 5.82 % | ✗ |
| A1 V1 ON | renderer-unassigned | workingSetBytes | 3 | 184.11 MiB | 7.94 MiB | 4.31 % | ✓ |
| A1 V1 ON | renderer-unassigned | cpuPct | 3 | 2.496 | 0.074 | 2.97 % | ✓ |
| A1 V1 ON | renderer-unassigned | gpuPct | 3 | 0.000 | 0.000 | 0.00 % | ✓ |
| A1 V1 ON | renderer-unassigned | gpuDedicatedBytes | 3 | 0.00 MiB | 0.00 MiB | 0.00 % | ✓ |
| A1 V1 ON | go-host | privateBytes | 3 | 72.83 MiB | 0.50 MiB | 0.68 % | ✓ |
| A1 V1 ON | go-host | workingSetBytes | 3 | 67.74 MiB | 1.00 MiB | 1.48 % | ✓ |
| A1 V1 ON | go-host | cpuPct | 3 | 2.646 | 0.135 | 5.11 % | ✗ |
| A1 V1 ON | go-host | gpuPct | 3 | 0.000 | 0.000 | 0.00 % | ✓ |
| A1 V1 ON | go-host | gpuDedicatedBytes | 3 | 0.00 MiB | 0.00 MiB | 0.00 % | ✓ |
| A1 V1 ON | renderer-hub | privateBytes | 3 | 54.50 MiB | 0.37 MiB | 0.68 % | ✓ |
| A1 V1 ON | renderer-hub | workingSetBytes | 3 | 96.74 MiB | 0.43 MiB | 0.44 % | ✓ |
| A1 V1 ON | renderer-hub | cpuPct | 3 | 0.014 | 0.000 | 2.44 % | ✓ |
| A1 V1 ON | renderer-hub | gpuPct | 3 | 0.000 | 0.000 | 0.00 % | ✓ |
| A1 V1 ON | renderer-hub | gpuDedicatedBytes | 3 | 0.00 MiB | 0.00 MiB | 0.00 % | ✓ |
| A1 V1 ON | browser | privateBytes | 3 | 45.11 MiB | 0.16 MiB | 0.34 % | ✓ |
| A1 V1 ON | browser | workingSetBytes | 3 | 128.36 MiB | 0.96 MiB | 0.75 % | ✓ |
| A1 V1 ON | browser | cpuPct | 3 | 1.000 | 0.000 | 0.00 % | ✓ |
| A1 V1 ON | browser | gpuPct | 3 | 0.000 | 0.000 | 0.00 % | ✓ |
| A1 V1 ON | browser | gpuDedicatedBytes | 3 | 0.00 MiB | 0.00 MiB | 0.00 % | ✓ |
| A1 V1 ON | crashpad | privateBytes | 3 | 2.91 MiB | 0.01 MiB | 0.23 % | ✓ |
| A1 V1 ON | crashpad | workingSetBytes | 3 | 13.59 MiB | 0.02 MiB | 0.18 % | ✓ |
| A1 V1 ON | crashpad | cpuPct | 3 | 0.000 | 0.000 | 0.00 % | ✓ |
| A1 V1 ON | crashpad | gpuPct | 3 | 0.000 | 0.000 | 0.00 % | ✓ |
| A1 V1 ON | crashpad | gpuDedicatedBytes | 3 | 0.00 MiB | 0.00 MiB | 0.00 % | ✓ |
| A1 V1 ON | game | frameTimeMs | 3 | 15.262 ms | 1.748 ms | 11.46 % | ✗ |
| A1 V1 ON | game | dropped | 3 | 0.000 % | 0.000 % | 0.00 % | ✓ |
