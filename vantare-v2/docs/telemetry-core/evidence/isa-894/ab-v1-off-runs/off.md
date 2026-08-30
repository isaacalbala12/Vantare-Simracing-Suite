# Huella mínima · A1 V1 OFF

Corridas: `a1-20260830-052101.csv`, `a1-20260830-052816.csv`, `a1-20260830-053543.csv`. Ruido = desviación muestral / media; hacen falta al menos 3 corridas y el gate falla por encima de 5 %.

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
| 1 | renderer-hub | privateBytes | 54.60 MiB | 54.57 MiB | 61.32 MiB | 61.38 MiB | 61.38 MiB |
| 1 | renderer-hub | workingSetBytes | 96.75 MiB | 96.89 MiB | 103.60 MiB | 103.93 MiB | 103.93 MiB |
| 1 | renderer-hub | cpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 1 | renderer-hub | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 1 | renderer-hub | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 1 | utility | privateBytes | 22.20 MiB | 22.23 MiB | 23.39 MiB | 23.77 MiB | 23.77 MiB |
| 1 | utility | workingSetBytes | 57.00 MiB | 57.75 MiB | 58.94 MiB | 59.91 MiB | 59.91 MiB |
| 1 | utility | cpuPct | 0.014 | 0.000 | 0.000 | 1.000 | 1.000 |
| 1 | utility | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 1 | utility | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 1 | go-host | privateBytes | 71.65 MiB | 71.40 MiB | 73.14 MiB | 74.16 MiB | 74.16 MiB |
| 1 | go-host | workingSetBytes | 67.12 MiB | 66.99 MiB | 68.80 MiB | 69.82 MiB | 69.82 MiB |
| 1 | go-host | cpuPct | 1.595 | 2.000 | 2.000 | 4.000 | 4.000 |
| 1 | go-host | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 1 | go-host | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 1 | gpu-process | privateBytes | 141.04 MiB | 136.96 MiB | 153.11 MiB | 182.59 MiB | 182.59 MiB |
| 1 | gpu-process | workingSetBytes | 98.33 MiB | 98.11 MiB | 98.79 MiB | 106.32 MiB | 106.32 MiB |
| 1 | gpu-process | cpuPct | 0.122 | 0.000 | 1.000 | 1.000 | 1.000 |
| 1 | gpu-process | gpuPct | 0.011 | 0.008 | 0.021 | 0.027 | 0.027 |
| 1 | gpu-process | gpuDedicatedBytes | 98.06 MiB | 95.20 MiB | 103.20 MiB | 116.70 MiB | 116.70 MiB |
| 1 | crashpad | privateBytes | 2.89 MiB | 2.91 MiB | 3.22 MiB | 3.23 MiB | 3.23 MiB |
| 1 | crashpad | workingSetBytes | 13.63 MiB | 12.84 MiB | 18.55 MiB | 18.56 MiB | 18.56 MiB |
| 1 | crashpad | cpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 1 | crashpad | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 1 | crashpad | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 1 | renderer-unassigned | privateBytes | 110.92 MiB | 118.50 MiB | 129.84 MiB | 131.18 MiB | 131.18 MiB |
| 1 | renderer-unassigned | workingSetBytes | 156.39 MiB | 164.77 MiB | 175.12 MiB | 176.10 MiB | 176.10 MiB |
| 1 | renderer-unassigned | cpuPct | 1.419 | 1.000 | 2.000 | 4.000 | 4.000 |
| 1 | renderer-unassigned | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 1 | renderer-unassigned | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 1 | browser | privateBytes | 45.20 MiB | 45.07 MiB | 46.80 MiB | 48.29 MiB | 48.29 MiB |
| 1 | browser | workingSetBytes | 127.45 MiB | 127.59 MiB | 129.63 MiB | 131.32 MiB | 131.32 MiB |
| 1 | browser | cpuPct | 1.054 | 1.000 | 1.000 | 3.000 | 3.000 |
| 1 | browser | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 1 | browser | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 1 | game | frameTimeMs | 13.230 ms | 11.797 ms | 21.530 ms | 27.616 ms | 132.568 ms |
| 1 | game | dropped | 0.000 % | 0.000 % | 0.000 % | 0.000 % | 0.000 % |
| 2 | utility | privateBytes | 22.31 MiB | 22.44 MiB | 23.56 MiB | 23.56 MiB | 23.56 MiB |
| 2 | utility | workingSetBytes | 57.13 MiB | 57.91 MiB | 59.06 MiB | 59.06 MiB | 59.06 MiB |
| 2 | utility | cpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 2 | utility | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 2 | utility | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 2 | browser | privateBytes | 45.90 MiB | 45.97 MiB | 47.48 MiB | 47.50 MiB | 47.50 MiB |
| 2 | browser | workingSetBytes | 130.61 MiB | 130.90 MiB | 132.82 MiB | 132.84 MiB | 132.84 MiB |
| 2 | browser | cpuPct | 1.056 | 1.000 | 1.000 | 5.000 | 5.000 |
| 2 | browser | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 2 | browser | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 2 | renderer-hub | privateBytes | 55.39 MiB | 55.41 MiB | 61.38 MiB | 62.20 MiB | 62.20 MiB |
| 2 | renderer-hub | workingSetBytes | 97.69 MiB | 97.97 MiB | 103.73 MiB | 104.59 MiB | 104.59 MiB |
| 2 | renderer-hub | cpuPct | 0.028 | 0.000 | 0.000 | 1.000 | 1.000 |
| 2 | renderer-hub | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 2 | renderer-hub | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 2 | renderer-unassigned | privateBytes | 111.72 MiB | 119.72 MiB | 126.59 MiB | 127.27 MiB | 127.27 MiB |
| 2 | renderer-unassigned | workingSetBytes | 157.04 MiB | 165.43 MiB | 172.10 MiB | 173.26 MiB | 173.26 MiB |
| 2 | renderer-unassigned | cpuPct | 1.634 | 2.000 | 2.000 | 7.000 | 7.000 |
| 2 | renderer-unassigned | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 2 | renderer-unassigned | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 2 | gpu-process | privateBytes | 142.68 MiB | 139.26 MiB | 153.73 MiB | 191.33 MiB | 191.33 MiB |
| 2 | gpu-process | workingSetBytes | 100.64 MiB | 100.21 MiB | 107.80 MiB | 108.21 MiB | 108.21 MiB |
| 2 | gpu-process | cpuPct | 0.169 | 0.000 | 1.000 | 1.000 | 1.000 |
| 2 | gpu-process | gpuPct | 0.014 | 0.013 | 0.027 | 0.040 | 0.040 |
| 2 | gpu-process | gpuDedicatedBytes | 98.97 MiB | 95.48 MiB | 103.48 MiB | 116.98 MiB | 116.98 MiB |
| 2 | go-host | privateBytes | 69.99 MiB | 69.97 MiB | 71.16 MiB | 72.30 MiB | 72.30 MiB |
| 2 | go-host | workingSetBytes | 64.77 MiB | 64.76 MiB | 65.90 MiB | 66.78 MiB | 66.78 MiB |
| 2 | go-host | cpuPct | 1.704 | 2.000 | 2.000 | 8.000 | 8.000 |
| 2 | go-host | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 2 | go-host | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 2 | crashpad | privateBytes | 2.90 MiB | 2.91 MiB | 3.23 MiB | 3.23 MiB | 3.23 MiB |
| 2 | crashpad | workingSetBytes | 13.54 MiB | 12.82 MiB | 18.55 MiB | 18.55 MiB | 18.55 MiB |
| 2 | crashpad | cpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 2 | crashpad | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 2 | crashpad | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 2 | game | frameTimeMs | 15.915 ms | 14.767 ms | 25.188 ms | 32.333 ms | 58.974 ms |
| 2 | game | dropped | 0.000 % | 0.000 % | 0.000 % | 0.000 % | 0.000 % |
| 3 | utility | privateBytes | 23.23 MiB | 23.25 MiB | 24.41 MiB | 24.41 MiB | 24.41 MiB |
| 3 | utility | workingSetBytes | 57.03 MiB | 57.78 MiB | 58.97 MiB | 58.97 MiB | 58.97 MiB |
| 3 | utility | cpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 3 | utility | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 3 | utility | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 3 | crashpad | privateBytes | 2.90 MiB | 2.92 MiB | 3.23 MiB | 3.23 MiB | 3.23 MiB |
| 3 | crashpad | workingSetBytes | 13.52 MiB | 12.84 MiB | 18.56 MiB | 18.56 MiB | 18.56 MiB |
| 3 | crashpad | cpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 3 | crashpad | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 3 | crashpad | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 3 | browser | privateBytes | 44.99 MiB | 44.90 MiB | 46.64 MiB | 46.67 MiB | 46.67 MiB |
| 3 | browser | workingSetBytes | 127.25 MiB | 127.45 MiB | 129.45 MiB | 129.48 MiB | 129.48 MiB |
| 3 | browser | cpuPct | 1.027 | 1.000 | 1.000 | 3.000 | 3.000 |
| 3 | browser | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 3 | browser | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 3 | gpu-process | privateBytes | 140.32 MiB | 136.86 MiB | 152.94 MiB | 183.31 MiB | 183.31 MiB |
| 3 | gpu-process | workingSetBytes | 98.52 MiB | 98.22 MiB | 98.54 MiB | 106.36 MiB | 106.36 MiB |
| 3 | gpu-process | cpuPct | 0.068 | 0.000 | 1.000 | 2.000 | 2.000 |
| 3 | gpu-process | gpuPct | 0.014 | 0.013 | 0.028 | 0.044 | 0.044 |
| 3 | gpu-process | gpuDedicatedBytes | 97.16 MiB | 95.20 MiB | 103.20 MiB | 108.70 MiB | 108.70 MiB |
| 3 | go-host | privateBytes | 70.67 MiB | 70.55 MiB | 72.00 MiB | 76.92 MiB | 76.92 MiB |
| 3 | go-host | workingSetBytes | 64.74 MiB | 64.54 MiB | 66.15 MiB | 71.05 MiB | 71.05 MiB |
| 3 | go-host | cpuPct | 1.527 | 1.000 | 2.000 | 6.000 | 6.000 |
| 3 | go-host | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 3 | go-host | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 3 | renderer-unassigned | privateBytes | 102.74 MiB | 106.94 MiB | 114.07 MiB | 116.30 MiB | 116.30 MiB |
| 3 | renderer-unassigned | workingSetBytes | 148.22 MiB | 152.64 MiB | 159.90 MiB | 161.53 MiB | 161.53 MiB |
| 3 | renderer-unassigned | cpuPct | 1.392 | 1.000 | 2.000 | 5.000 | 5.000 |
| 3 | renderer-unassigned | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 3 | renderer-unassigned | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 3 | renderer-hub | privateBytes | 54.72 MiB | 54.84 MiB | 61.48 MiB | 61.55 MiB | 61.55 MiB |
| 3 | renderer-hub | workingSetBytes | 96.89 MiB | 97.05 MiB | 103.68 MiB | 104.08 MiB | 104.08 MiB |
| 3 | renderer-hub | cpuPct | 0.027 | 0.000 | 0.000 | 1.000 | 1.000 |
| 3 | renderer-hub | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 3 | renderer-hub | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 3 | game | frameTimeMs | 13.267 ms | 11.908 ms | 21.137 ms | 27.993 ms | 74.263 ms |
| 3 | game | dropped | 0.000 % | 0.000 % | 0.000 % | 0.000 % | 0.000 % |

## Frames perdidos

| Corrida | Perdidos | Frames totales | Porcentaje |
|---:|---:|---:|---:|
| 1 | 0 | 13603 | 0.000 % |
| 2 | 0 | 11307 | 0.000 % |
| 3 | 0 | 13564 | 0.000 % |

## Repetibilidad entre corridas

| Condición | Rol | Métrica | N | Media | Desviación | Ruido | Gate |
|---|---|---|---:|---:|---:|---:|:---:|
| A1 V1 OFF | renderer-hub | privateBytes | 3 | 54.90 MiB | 0.42 MiB | 0.77 % | ✓ |
| A1 V1 OFF | renderer-hub | workingSetBytes | 3 | 97.11 MiB | 0.51 MiB | 0.52 % | ✓ |
| A1 V1 OFF | renderer-hub | cpuPct | 3 | 0.018 | 0.016 | 86.66 % | ✗ |
| A1 V1 OFF | renderer-hub | gpuPct | 3 | 0.000 | 0.000 | 0.00 % | ✓ |
| A1 V1 OFF | renderer-hub | gpuDedicatedBytes | 3 | 0.00 MiB | 0.00 MiB | 0.00 % | ✓ |
| A1 V1 OFF | utility | privateBytes | 3 | 22.58 MiB | 0.57 MiB | 2.50 % | ✓ |
| A1 V1 OFF | utility | workingSetBytes | 3 | 57.05 MiB | 0.06 MiB | 0.11 % | ✓ |
| A1 V1 OFF | utility | cpuPct | 3 | 0.005 | 0.008 | 173.21 % | ✗ |
| A1 V1 OFF | utility | gpuPct | 3 | 0.000 | 0.000 | 0.00 % | ✓ |
| A1 V1 OFF | utility | gpuDedicatedBytes | 3 | 0.00 MiB | 0.00 MiB | 0.00 % | ✓ |
| A1 V1 OFF | go-host | privateBytes | 3 | 70.77 MiB | 0.84 MiB | 1.18 % | ✓ |
| A1 V1 OFF | go-host | workingSetBytes | 3 | 65.55 MiB | 1.37 MiB | 2.08 % | ✓ |
| A1 V1 OFF | go-host | cpuPct | 3 | 1.609 | 0.089 | 5.56 % | ✗ |
| A1 V1 OFF | go-host | gpuPct | 3 | 0.000 | 0.000 | 0.00 % | ✓ |
| A1 V1 OFF | go-host | gpuDedicatedBytes | 3 | 0.00 MiB | 0.00 MiB | 0.00 % | ✓ |
| A1 V1 OFF | gpu-process | privateBytes | 3 | 141.35 MiB | 1.21 MiB | 0.86 % | ✓ |
| A1 V1 OFF | gpu-process | workingSetBytes | 3 | 99.17 MiB | 1.28 MiB | 1.29 % | ✓ |
| A1 V1 OFF | gpu-process | cpuPct | 3 | 0.119 | 0.051 | 42.51 % | ✗ |
| A1 V1 OFF | gpu-process | gpuPct | 3 | 0.013 | 0.002 | 14.56 % | ✗ |
| A1 V1 OFF | gpu-process | gpuDedicatedBytes | 3 | 98.06 MiB | 0.90 MiB | 0.92 % | ✓ |
| A1 V1 OFF | crashpad | privateBytes | 3 | 2.90 MiB | 0.00 MiB | 0.09 % | ✓ |
| A1 V1 OFF | crashpad | workingSetBytes | 3 | 13.56 MiB | 0.06 MiB | 0.43 % | ✓ |
| A1 V1 OFF | crashpad | cpuPct | 3 | 0.000 | 0.000 | 0.00 % | ✓ |
| A1 V1 OFF | crashpad | gpuPct | 3 | 0.000 | 0.000 | 0.00 % | ✓ |
| A1 V1 OFF | crashpad | gpuDedicatedBytes | 3 | 0.00 MiB | 0.00 MiB | 0.00 % | ✓ |
| A1 V1 OFF | renderer-unassigned | privateBytes | 3 | 108.46 MiB | 4.97 MiB | 4.58 % | ✓ |
| A1 V1 OFF | renderer-unassigned | workingSetBytes | 3 | 153.88 MiB | 4.92 MiB | 3.20 % | ✓ |
| A1 V1 OFF | renderer-unassigned | cpuPct | 3 | 1.482 | 0.133 | 8.95 % | ✗ |
| A1 V1 OFF | renderer-unassigned | gpuPct | 3 | 0.000 | 0.000 | 0.00 % | ✓ |
| A1 V1 OFF | renderer-unassigned | gpuDedicatedBytes | 3 | 0.00 MiB | 0.00 MiB | 0.00 % | ✓ |
| A1 V1 OFF | browser | privateBytes | 3 | 45.37 MiB | 0.48 MiB | 1.05 % | ✓ |
| A1 V1 OFF | browser | workingSetBytes | 3 | 128.44 MiB | 1.89 MiB | 1.47 % | ✓ |
| A1 V1 OFF | browser | cpuPct | 3 | 1.046 | 0.016 | 1.56 % | ✓ |
| A1 V1 OFF | browser | gpuPct | 3 | 0.000 | 0.000 | 0.00 % | ✓ |
| A1 V1 OFF | browser | gpuDedicatedBytes | 3 | 0.00 MiB | 0.00 MiB | 0.00 % | ✓ |
| A1 V1 OFF | game | frameTimeMs | 3 | 14.137 ms | 1.540 ms | 10.89 % | ✗ |
| A1 V1 OFF | game | dropped | 3 | 0.000 % | 0.000 % | 0.00 % | ✓ |
