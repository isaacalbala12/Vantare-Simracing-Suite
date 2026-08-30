# Huella mínima · V1_OFF

Corridas: `a1-20260830-180813.csv`, `a1-20260830-181605.csv`, `a1-20260830-182322.csv`. Ruido = desviación muestral / media; hacen falta al menos 3 corridas y el gate falla por encima de 5 %.

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
| 1 | utility | privateBytes | 22.73 MiB | 22.77 MiB | 23.91 MiB | 23.91 MiB | 23.91 MiB |
| 1 | utility | workingSetBytes | 61.01 MiB | 61.43 MiB | 62.59 MiB | 62.59 MiB | 62.59 MiB |
| 1 | utility | cpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 1 | utility | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 1 | utility | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 1 | gpu-process | privateBytes | 141.39 MiB | 137.46 MiB | 147.09 MiB | 191.55 MiB | 191.55 MiB |
| 1 | gpu-process | workingSetBytes | 98.95 MiB | 98.86 MiB | 99.27 MiB | 106.09 MiB | 106.09 MiB |
| 1 | gpu-process | cpuPct | 0.068 | 0.000 | 1.000 | 1.000 | 1.000 |
| 1 | gpu-process | gpuPct | 0.009 | 0.007 | 0.027 | 0.048 | 0.048 |
| 1 | gpu-process | gpuDedicatedBytes | 98.05 MiB | 95.48 MiB | 103.48 MiB | 127.23 MiB | 127.23 MiB |
| 1 | go-host | privateBytes | 71.19 MiB | 71.02 MiB | 72.78 MiB | 74.22 MiB | 74.22 MiB |
| 1 | go-host | workingSetBytes | 65.10 MiB | 64.93 MiB | 66.67 MiB | 68.17 MiB | 68.17 MiB |
| 1 | go-host | cpuPct | 1.689 | 2.000 | 2.000 | 6.000 | 6.000 |
| 1 | go-host | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 1 | go-host | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 1 | browser | privateBytes | 45.16 MiB | 45.08 MiB | 46.79 MiB | 46.80 MiB | 46.80 MiB |
| 1 | browser | workingSetBytes | 127.51 MiB | 128.01 MiB | 129.64 MiB | 129.64 MiB | 129.64 MiB |
| 1 | browser | cpuPct | 1.000 | 1.000 | 1.000 | 3.000 | 3.000 |
| 1 | browser | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 1 | browser | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 1 | renderer-hub | privateBytes | 56.24 MiB | 55.82 MiB | 62.63 MiB | 63.13 MiB | 63.13 MiB |
| 1 | renderer-hub | workingSetBytes | 99.07 MiB | 98.98 MiB | 105.75 MiB | 106.20 MiB | 106.20 MiB |
| 1 | renderer-hub | cpuPct | 0.014 | 0.000 | 0.000 | 1.000 | 1.000 |
| 1 | renderer-hub | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 1 | renderer-hub | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 1 | crashpad | privateBytes | 2.88 MiB | 2.89 MiB | 3.22 MiB | 3.22 MiB | 3.22 MiB |
| 1 | crashpad | workingSetBytes | 13.46 MiB | 12.74 MiB | 18.48 MiB | 18.48 MiB | 18.48 MiB |
| 1 | crashpad | cpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 1 | crashpad | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 1 | crashpad | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 1 | renderer-unassigned | privateBytes | 100.65 MiB | 108.01 MiB | 119.59 MiB | 121.43 MiB | 121.43 MiB |
| 1 | renderer-unassigned | workingSetBytes | 144.02 MiB | 151.41 MiB | 163.49 MiB | 164.63 MiB | 164.63 MiB |
| 1 | renderer-unassigned | cpuPct | 1.149 | 1.000 | 2.000 | 4.000 | 4.000 |
| 1 | renderer-unassigned | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 1 | renderer-unassigned | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 1 | game | frameTimeMs | 10.966 ms | 9.517 ms | 18.336 ms | 27.281 ms | 64.913 ms |
| 1 | game | dropped | 0.000 % | 0.000 % | 0.000 % | 0.000 % | 0.000 % |
| 2 | browser | privateBytes | 44.81 MiB | 44.72 MiB | 46.51 MiB | 46.52 MiB | 46.52 MiB |
| 2 | browser | workingSetBytes | 127.02 MiB | 127.07 MiB | 129.16 MiB | 129.17 MiB | 129.17 MiB |
| 2 | browser | cpuPct | 1.000 | 1.000 | 1.000 | 2.000 | 2.000 |
| 2 | browser | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 2 | browser | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 2 | renderer-unassigned | privateBytes | 101.24 MiB | 108.99 MiB | 120.29 MiB | 122.36 MiB | 122.36 MiB |
| 2 | renderer-unassigned | workingSetBytes | 144.95 MiB | 153.59 MiB | 163.99 MiB | 166.68 MiB | 166.68 MiB |
| 2 | renderer-unassigned | cpuPct | 1.243 | 1.000 | 2.000 | 4.000 | 4.000 |
| 2 | renderer-unassigned | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 2 | renderer-unassigned | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 2 | utility | privateBytes | 22.51 MiB | 22.51 MiB | 23.65 MiB | 23.65 MiB | 23.65 MiB |
| 2 | utility | workingSetBytes | 60.32 MiB | 60.56 MiB | 61.73 MiB | 61.73 MiB | 61.73 MiB |
| 2 | utility | cpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 2 | utility | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 2 | utility | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 2 | crashpad | privateBytes | 2.91 MiB | 2.93 MiB | 3.23 MiB | 3.23 MiB | 3.23 MiB |
| 2 | crashpad | workingSetBytes | 13.54 MiB | 12.75 MiB | 18.48 MiB | 18.48 MiB | 18.48 MiB |
| 2 | crashpad | cpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 2 | crashpad | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 2 | crashpad | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 2 | gpu-process | privateBytes | 144.06 MiB | 144.53 MiB | 154.04 MiB | 183.79 MiB | 183.79 MiB |
| 2 | gpu-process | workingSetBytes | 102.19 MiB | 101.88 MiB | 102.39 MiB | 110.23 MiB | 110.23 MiB |
| 2 | gpu-process | cpuPct | 0.135 | 0.000 | 1.000 | 2.000 | 2.000 |
| 2 | gpu-process | gpuPct | 0.010 | 0.007 | 0.031 | 0.034 | 0.034 |
| 2 | gpu-process | gpuDedicatedBytes | 98.60 MiB | 100.23 MiB | 102.48 MiB | 114.98 MiB | 114.98 MiB |
| 2 | renderer-hub | privateBytes | 56.23 MiB | 55.54 MiB | 62.89 MiB | 63.41 MiB | 63.41 MiB |
| 2 | renderer-hub | workingSetBytes | 98.95 MiB | 98.59 MiB | 105.71 MiB | 106.37 MiB | 106.37 MiB |
| 2 | renderer-hub | cpuPct | 0.014 | 0.000 | 0.000 | 1.000 | 1.000 |
| 2 | renderer-hub | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 2 | renderer-hub | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 2 | go-host | privateBytes | 70.47 MiB | 70.32 MiB | 72.38 MiB | 73.23 MiB | 73.23 MiB |
| 2 | go-host | workingSetBytes | 64.99 MiB | 64.78 MiB | 66.77 MiB | 67.78 MiB | 67.78 MiB |
| 2 | go-host | cpuPct | 1.743 | 2.000 | 2.000 | 5.000 | 5.000 |
| 2 | go-host | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 2 | go-host | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 2 | game | frameTimeMs | 10.802 ms | 9.203 ms | 18.312 ms | 25.992 ms | 91.368 ms |
| 2 | game | dropped | 0.000 % | 0.000 % | 0.000 % | 0.000 % | 0.000 % |
| 3 | utility | privateBytes | 22.55 MiB | 22.56 MiB | 23.70 MiB | 23.70 MiB | 23.70 MiB |
| 3 | utility | workingSetBytes | 60.60 MiB | 60.80 MiB | 61.97 MiB | 61.97 MiB | 61.97 MiB |
| 3 | utility | cpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 3 | utility | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 3 | utility | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 3 | browser | privateBytes | 45.41 MiB | 45.38 MiB | 47.06 MiB | 47.08 MiB | 47.08 MiB |
| 3 | browser | workingSetBytes | 127.31 MiB | 127.40 MiB | 129.40 MiB | 129.42 MiB | 129.42 MiB |
| 3 | browser | cpuPct | 1.014 | 1.000 | 1.000 | 3.000 | 3.000 |
| 3 | browser | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 3 | browser | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 3 | gpu-process | privateBytes | 190.19 MiB | 186.32 MiB | 206.33 MiB | 234.12 MiB | 234.12 MiB |
| 3 | gpu-process | workingSetBytes | 109.16 MiB | 107.41 MiB | 116.28 MiB | 116.31 MiB | 116.31 MiB |
| 3 | gpu-process | cpuPct | 0.176 | 0.000 | 1.000 | 1.000 | 1.000 |
| 3 | gpu-process | gpuPct | 0.109 | 0.108 | 0.155 | 0.175 | 0.175 |
| 3 | gpu-process | gpuDedicatedBytes | 140.32 MiB | 139.30 MiB | 149.30 MiB | 159.30 MiB | 159.30 MiB |
| 3 | go-host | privateBytes | 71.43 MiB | 71.12 MiB | 74.00 MiB | 76.15 MiB | 76.15 MiB |
| 3 | go-host | workingSetBytes | 65.56 MiB | 65.36 MiB | 67.64 MiB | 70.54 MiB | 70.54 MiB |
| 3 | go-host | cpuPct | 1.689 | 2.000 | 2.000 | 5.000 | 5.000 |
| 3 | go-host | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 3 | go-host | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 3 | renderer-unassigned | privateBytes | 87.04 MiB | 83.37 MiB | 112.07 MiB | 113.71 MiB | 113.71 MiB |
| 3 | renderer-unassigned | workingSetBytes | 131.47 MiB | 128.67 MiB | 155.77 MiB | 158.38 MiB | 158.38 MiB |
| 3 | renderer-unassigned | cpuPct | 1.176 | 1.000 | 2.000 | 4.000 | 4.000 |
| 3 | renderer-unassigned | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 3 | renderer-unassigned | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 3 | crashpad | privateBytes | 2.89 MiB | 2.90 MiB | 3.21 MiB | 3.21 MiB | 3.21 MiB |
| 3 | crashpad | workingSetBytes | 13.46 MiB | 12.74 MiB | 18.46 MiB | 18.46 MiB | 18.46 MiB |
| 3 | crashpad | cpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 3 | crashpad | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 3 | crashpad | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 3 | renderer-hub | privateBytes | 75.12 MiB | 74.62 MiB | 80.89 MiB | 81.83 MiB | 81.83 MiB |
| 3 | renderer-hub | workingSetBytes | 122.09 MiB | 122.17 MiB | 127.07 MiB | 128.49 MiB | 128.49 MiB |
| 3 | renderer-hub | cpuPct | 0.068 | 0.000 | 1.000 | 1.000 | 1.000 |
| 3 | renderer-hub | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 3 | renderer-hub | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 3 | game | frameTimeMs | 11.105 ms | 9.565 ms | 18.700 ms | 26.898 ms | 67.031 ms |
| 3 | game | dropped | 0.000 % | 0.000 % | 0.000 % | 0.000 % | 0.000 % |

## Frames perdidos

| Corrida | Perdidos | Frames totales | Porcentaje |
|---:|---:|---:|---:|
| 1 | 0 | 16410 | 0.000 % |
| 2 | 0 | 16661 | 0.000 % |
| 3 | 0 | 16206 | 0.000 % |

## Repetibilidad entre corridas

| Condición | Rol | Métrica | N | Media | Desviación | Ruido | Gate |
|---|---|---|---:|---:|---:|---:|:---:|
| V1_OFF | utility | privateBytes | 3 | 22.60 MiB | 0.12 MiB | 0.53 % | ✓ |
| V1_OFF | utility | workingSetBytes | 3 | 60.64 MiB | 0.35 MiB | 0.57 % | ✓ |
| V1_OFF | utility | cpuPct | 3 | 0.000 | 0.000 | 0.00 % | ✓ |
| V1_OFF | utility | gpuPct | 3 | 0.000 | 0.000 | 0.00 % | ✓ |
| V1_OFF | utility | gpuDedicatedBytes | 3 | 0.00 MiB | 0.00 MiB | 0.00 % | ✓ |
| V1_OFF | gpu-process | privateBytes | 3 | 158.55 MiB | 27.44 MiB | 17.30 % | ✗ |
| V1_OFF | gpu-process | workingSetBytes | 3 | 103.43 MiB | 5.22 MiB | 5.04 % | ✗ |
| V1_OFF | gpu-process | cpuPct | 3 | 0.126 | 0.055 | 43.30 % | ✗ |
| V1_OFF | gpu-process | gpuPct | 3 | 0.043 | 0.057 | 134.91 % | ✗ |
| V1_OFF | gpu-process | gpuDedicatedBytes | 3 | 112.32 MiB | 24.25 MiB | 21.59 % | ✗ |
| V1_OFF | go-host | privateBytes | 3 | 71.03 MiB | 0.50 MiB | 0.70 % | ✓ |
| V1_OFF | go-host | workingSetBytes | 3 | 65.22 MiB | 0.30 MiB | 0.46 % | ✓ |
| V1_OFF | go-host | cpuPct | 3 | 1.707 | 0.031 | 1.83 % | ✓ |
| V1_OFF | go-host | gpuPct | 3 | 0.000 | 0.000 | 0.00 % | ✓ |
| V1_OFF | go-host | gpuDedicatedBytes | 3 | 0.00 MiB | 0.00 MiB | 0.00 % | ✓ |
| V1_OFF | browser | privateBytes | 3 | 45.13 MiB | 0.30 MiB | 0.66 % | ✓ |
| V1_OFF | browser | workingSetBytes | 3 | 127.28 MiB | 0.25 MiB | 0.19 % | ✓ |
| V1_OFF | browser | cpuPct | 3 | 1.005 | 0.008 | 0.78 % | ✓ |
| V1_OFF | browser | gpuPct | 3 | 0.000 | 0.000 | 0.00 % | ✓ |
| V1_OFF | browser | gpuDedicatedBytes | 3 | 0.00 MiB | 0.00 MiB | 0.00 % | ✓ |
| V1_OFF | renderer-hub | privateBytes | 3 | 62.53 MiB | 10.90 MiB | 17.43 % | ✗ |
| V1_OFF | renderer-hub | workingSetBytes | 3 | 106.70 MiB | 13.33 MiB | 12.49 % | ✗ |
| V1_OFF | renderer-hub | cpuPct | 3 | 0.032 | 0.031 | 98.97 % | ✗ |
| V1_OFF | renderer-hub | gpuPct | 3 | 0.000 | 0.000 | 0.00 % | ✓ |
| V1_OFF | renderer-hub | gpuDedicatedBytes | 3 | 0.00 MiB | 0.00 MiB | 0.00 % | ✓ |
| V1_OFF | crashpad | privateBytes | 3 | 2.89 MiB | 0.01 MiB | 0.43 % | ✓ |
| V1_OFF | crashpad | workingSetBytes | 3 | 13.49 MiB | 0.05 MiB | 0.34 % | ✓ |
| V1_OFF | crashpad | cpuPct | 3 | 0.000 | 0.000 | 0.00 % | ✓ |
| V1_OFF | crashpad | gpuPct | 3 | 0.000 | 0.000 | 0.00 % | ✓ |
| V1_OFF | crashpad | gpuDedicatedBytes | 3 | 0.00 MiB | 0.00 MiB | 0.00 % | ✓ |
| V1_OFF | renderer-unassigned | privateBytes | 3 | 96.31 MiB | 8.04 MiB | 8.34 % | ✗ |
| V1_OFF | renderer-unassigned | workingSetBytes | 3 | 140.15 MiB | 7.53 MiB | 5.37 % | ✗ |
| V1_OFF | renderer-unassigned | cpuPct | 3 | 1.189 | 0.049 | 4.10 % | ✓ |
| V1_OFF | renderer-unassigned | gpuPct | 3 | 0.000 | 0.000 | 0.00 % | ✓ |
| V1_OFF | renderer-unassigned | gpuDedicatedBytes | 3 | 0.00 MiB | 0.00 MiB | 0.00 % | ✓ |
| V1_OFF | game | frameTimeMs | 3 | 10.957 ms | 0.152 ms | 1.38 % | ✓ |
| V1_OFF | game | dropped | 3 | 0.000 % | 0.000 % | 0.00 % | ✓ |
