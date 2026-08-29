# Huella mínima · HubVisible

Corridas: `hubvisible-20260829-003922.csv`, `hubvisible-20260829-010955.csv`, `hubvisible-20260829-012526.csv`. Ruido = desviación muestral / media; hacen falta al menos 3 corridas y el gate falla por encima de 5 %.

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
| 1 | renderer-hub | privateBytes | 64.43 MiB | 64.68 MiB | 78.39 MiB | 79.71 MiB | 79.96 MiB |
| 1 | renderer-hub | workingSetBytes | 106.85 MiB | 107.14 MiB | 121.14 MiB | 122.29 MiB | 122.47 MiB |
| 1 | renderer-hub | cpuPct | 0.011 | 0.000 | 0.000 | 1.000 | 1.000 |
| 1 | renderer-hub | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 1 | renderer-hub | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 1 | utility | privateBytes | 22.99 MiB | 22.36 MiB | 24.57 MiB | 24.84 MiB | 25.19 MiB |
| 1 | utility | workingSetBytes | 58.01 MiB | 57.58 MiB | 60.10 MiB | 60.21 MiB | 60.65 MiB |
| 1 | utility | cpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 1 | utility | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 1 | utility | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 1 | browser | privateBytes | 47.25 MiB | 46.76 MiB | 49.50 MiB | 49.50 MiB | 50.11 MiB |
| 1 | browser | workingSetBytes | 132.65 MiB | 132.37 MiB | 135.50 MiB | 135.57 MiB | 136.05 MiB |
| 1 | browser | cpuPct | 0.956 | 1.000 | 1.000 | 1.000 | 3.000 |
| 1 | browser | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 1 | browser | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 1 | gpu-process | privateBytes | 167.34 MiB | 166.03 MiB | 179.64 MiB | 183.00 MiB | 183.20 MiB |
| 1 | gpu-process | workingSetBytes | 109.79 MiB | 109.43 MiB | 112.09 MiB | 118.49 MiB | 118.54 MiB |
| 1 | gpu-process | cpuPct | 0.489 | 0.000 | 1.000 | 2.000 | 3.000 |
| 1 | gpu-process | gpuPct | 0.371 | 0.061 | 1.618 | 2.322 | 2.667 |
| 1 | gpu-process | gpuDedicatedBytes | 116.40 MiB | 115.82 MiB | 123.82 MiB | 127.82 MiB | 127.82 MiB |
| 1 | go-host | privateBytes | 75.51 MiB | 75.36 MiB | 77.66 MiB | 79.73 MiB | 87.23 MiB |
| 1 | go-host | workingSetBytes | 69.36 MiB | 69.28 MiB | 71.51 MiB | 73.96 MiB | 80.43 MiB |
| 1 | go-host | cpuPct | 3.250 | 3.000 | 4.000 | 5.000 | 12.000 |
| 1 | go-host | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 1 | go-host | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 1 | renderer-unassigned | privateBytes | 178.06 MiB | 176.95 MiB | 230.58 MiB | 250.25 MiB | 261.95 MiB |
| 1 | renderer-unassigned | workingSetBytes | 223.82 MiB | 222.42 MiB | 274.95 MiB | 292.08 MiB | 304.09 MiB |
| 1 | renderer-unassigned | cpuPct | 2.939 | 3.000 | 4.000 | 5.000 | 14.000 |
| 1 | renderer-unassigned | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 1 | renderer-unassigned | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 1 | crashpad | privateBytes | 2.86 MiB | 2.85 MiB | 3.25 MiB | 3.25 MiB | 3.26 MiB |
| 1 | crashpad | workingSetBytes | 13.17 MiB | 12.83 MiB | 18.54 MiB | 18.54 MiB | 18.55 MiB |
| 1 | crashpad | cpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 1 | crashpad | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 1 | crashpad | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 2 | renderer-hub | privateBytes | 62.57 MiB | 62.91 MiB | 77.07 MiB | 77.82 MiB | 78.94 MiB |
| 2 | renderer-hub | workingSetBytes | 104.61 MiB | 104.85 MiB | 119.37 MiB | 120.14 MiB | 120.87 MiB |
| 2 | renderer-hub | cpuPct | 0.011 | 0.000 | 0.000 | 1.000 | 1.000 |
| 2 | renderer-hub | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 2 | renderer-hub | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 2 | gpu-process | privateBytes | 168.36 MiB | 167.07 MiB | 179.04 MiB | 184.82 MiB | 197.06 MiB |
| 2 | gpu-process | workingSetBytes | 107.12 MiB | 106.61 MiB | 110.50 MiB | 115.58 MiB | 115.60 MiB |
| 2 | gpu-process | cpuPct | 0.450 | 0.000 | 1.000 | 2.000 | 2.000 |
| 2 | gpu-process | gpuPct | 0.371 | 0.072 | 1.578 | 2.759 | 3.039 |
| 2 | gpu-process | gpuDedicatedBytes | 118.20 MiB | 117.82 MiB | 117.82 MiB | 129.82 MiB | 129.82 MiB |
| 2 | crashpad | privateBytes | 2.86 MiB | 2.88 MiB | 3.25 MiB | 3.25 MiB | 3.25 MiB |
| 2 | crashpad | workingSetBytes | 13.15 MiB | 12.82 MiB | 18.54 MiB | 18.54 MiB | 18.54 MiB |
| 2 | crashpad | cpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 2 | crashpad | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 2 | crashpad | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 2 | renderer-unassigned | privateBytes | 190.55 MiB | 188.60 MiB | 247.49 MiB | 271.14 MiB | 272.16 MiB |
| 2 | renderer-unassigned | workingSetBytes | 235.13 MiB | 233.52 MiB | 288.98 MiB | 311.89 MiB | 313.27 MiB |
| 2 | renderer-unassigned | cpuPct | 2.878 | 3.000 | 4.000 | 5.000 | 10.000 |
| 2 | renderer-unassigned | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 2 | renderer-unassigned | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 2 | utility | privateBytes | 22.99 MiB | 23.32 MiB | 24.51 MiB | 25.13 MiB | 25.13 MiB |
| 2 | utility | workingSetBytes | 58.02 MiB | 58.62 MiB | 60.04 MiB | 60.60 MiB | 60.60 MiB |
| 2 | utility | cpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 2 | utility | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 2 | utility | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 2 | go-host | privateBytes | 74.16 MiB | 74.11 MiB | 76.03 MiB | 77.18 MiB | 79.00 MiB |
| 2 | go-host | workingSetBytes | 69.96 MiB | 69.94 MiB | 71.86 MiB | 73.29 MiB | 74.93 MiB |
| 2 | go-host | cpuPct | 3.061 | 3.000 | 4.000 | 5.000 | 10.000 |
| 2 | go-host | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 2 | go-host | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 2 | browser | privateBytes | 46.37 MiB | 46.80 MiB | 48.65 MiB | 48.69 MiB | 49.42 MiB |
| 2 | browser | workingSetBytes | 128.98 MiB | 129.53 MiB | 131.79 MiB | 131.83 MiB | 132.52 MiB |
| 2 | browser | cpuPct | 0.972 | 1.000 | 1.000 | 1.000 | 3.000 |
| 2 | browser | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 2 | browser | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 3 | go-host | privateBytes | 73.49 MiB | 73.30 MiB | 75.03 MiB | 76.80 MiB | 79.05 MiB |
| 3 | go-host | workingSetBytes | 69.62 MiB | 69.47 MiB | 71.35 MiB | 72.91 MiB | 75.45 MiB |
| 3 | go-host | cpuPct | 3.094 | 3.000 | 4.000 | 4.000 | 8.000 |
| 3 | go-host | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 3 | go-host | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 3 | browser | privateBytes | 46.61 MiB | 47.05 MiB | 48.82 MiB | 48.83 MiB | 48.83 MiB |
| 3 | browser | workingSetBytes | 129.30 MiB | 129.91 MiB | 132.11 MiB | 132.11 MiB | 132.11 MiB |
| 3 | browser | cpuPct | 0.900 | 1.000 | 1.000 | 1.000 | 2.000 |
| 3 | browser | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 3 | browser | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 3 | crashpad | privateBytes | 2.84 MiB | 2.84 MiB | 3.26 MiB | 3.26 MiB | 3.26 MiB |
| 3 | crashpad | workingSetBytes | 13.11 MiB | 12.81 MiB | 18.55 MiB | 18.55 MiB | 18.55 MiB |
| 3 | crashpad | cpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 3 | crashpad | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 3 | crashpad | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 3 | renderer-unassigned | privateBytes | 183.68 MiB | 181.71 MiB | 241.26 MiB | 263.00 MiB | 276.11 MiB |
| 3 | renderer-unassigned | workingSetBytes | 228.68 MiB | 227.78 MiB | 283.76 MiB | 303.07 MiB | 316.90 MiB |
| 3 | renderer-unassigned | cpuPct | 2.939 | 3.000 | 4.000 | 5.000 | 10.000 |
| 3 | renderer-unassigned | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 3 | renderer-unassigned | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 3 | renderer-hub | privateBytes | 62.59 MiB | 62.75 MiB | 76.96 MiB | 77.78 MiB | 78.03 MiB |
| 3 | renderer-hub | workingSetBytes | 104.93 MiB | 105.18 MiB | 119.52 MiB | 120.46 MiB | 120.65 MiB |
| 3 | renderer-hub | cpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 3 | renderer-hub | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 3 | renderer-hub | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 3 | utility | privateBytes | 23.09 MiB | 23.46 MiB | 24.66 MiB | 25.28 MiB | 25.28 MiB |
| 3 | utility | workingSetBytes | 58.65 MiB | 59.36 MiB | 60.79 MiB | 61.35 MiB | 61.35 MiB |
| 3 | utility | cpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 3 | utility | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 3 | utility | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 3 | gpu-process | privateBytes | 169.84 MiB | 168.93 MiB | 172.28 MiB | 188.08 MiB | 199.59 MiB |
| 3 | gpu-process | workingSetBytes | 109.05 MiB | 108.85 MiB | 112.16 MiB | 119.35 MiB | 119.40 MiB |
| 3 | gpu-process | cpuPct | 0.450 | 0.000 | 1.000 | 2.000 | 2.000 |
| 3 | gpu-process | gpuPct | 0.354 | 0.064 | 1.640 | 2.813 | 2.976 |
| 3 | gpu-process | gpuDedicatedBytes | 117.98 MiB | 117.82 MiB | 117.82 MiB | 125.82 MiB | 125.82 MiB |

## Repetibilidad entre corridas

| Condición | Rol | Métrica | N | Media | Desviación | Ruido | Gate |
|---|---|---|---:|---:|---:|---:|:---:|
| HubVisible | renderer-hub | privateBytes | 3 | 63.19 MiB | 1.07 MiB | 1.69 % | ✓ |
| HubVisible | renderer-hub | workingSetBytes | 3 | 105.46 MiB | 1.21 MiB | 1.15 % | ✓ |
| HubVisible | renderer-hub | cpuPct | 3 | 0.007 | 0.006 | 86.60 % | ✗ |
| HubVisible | renderer-hub | gpuPct | 3 | 0.000 | 0.000 | 0.00 % | ✓ |
| HubVisible | renderer-hub | gpuDedicatedBytes | 3 | 0.00 MiB | 0.00 MiB | 0.00 % | ✓ |
| HubVisible | utility | privateBytes | 3 | 23.02 MiB | 0.06 MiB | 0.25 % | ✓ |
| HubVisible | utility | workingSetBytes | 3 | 58.23 MiB | 0.37 MiB | 0.63 % | ✓ |
| HubVisible | utility | cpuPct | 3 | 0.000 | 0.000 | 0.00 % | ✓ |
| HubVisible | utility | gpuPct | 3 | 0.000 | 0.000 | 0.00 % | ✓ |
| HubVisible | utility | gpuDedicatedBytes | 3 | 0.00 MiB | 0.00 MiB | 0.00 % | ✓ |
| HubVisible | browser | privateBytes | 3 | 46.74 MiB | 0.45 MiB | 0.97 % | ✓ |
| HubVisible | browser | workingSetBytes | 3 | 130.31 MiB | 2.03 MiB | 1.56 % | ✓ |
| HubVisible | browser | cpuPct | 3 | 0.943 | 0.038 | 4.01 % | ✓ |
| HubVisible | browser | gpuPct | 3 | 0.000 | 0.000 | 0.00 % | ✓ |
| HubVisible | browser | gpuDedicatedBytes | 3 | 0.00 MiB | 0.00 MiB | 0.00 % | ✓ |
| HubVisible | gpu-process | privateBytes | 3 | 168.51 MiB | 1.26 MiB | 0.75 % | ✓ |
| HubVisible | gpu-process | workingSetBytes | 3 | 108.65 MiB | 1.38 MiB | 1.27 % | ✓ |
| HubVisible | gpu-process | cpuPct | 3 | 0.463 | 0.022 | 4.85 % | ✓ |
| HubVisible | gpu-process | gpuPct | 3 | 0.365 | 0.010 | 2.66 % | ✓ |
| HubVisible | gpu-process | gpuDedicatedBytes | 3 | 117.53 MiB | 0.98 MiB | 0.84 % | ✓ |
| HubVisible | go-host | privateBytes | 3 | 74.39 MiB | 1.03 MiB | 1.38 % | ✓ |
| HubVisible | go-host | workingSetBytes | 3 | 69.65 MiB | 0.30 MiB | 0.43 % | ✓ |
| HubVisible | go-host | cpuPct | 3 | 3.135 | 0.101 | 3.22 % | ✓ |
| HubVisible | go-host | gpuPct | 3 | 0.000 | 0.000 | 0.00 % | ✓ |
| HubVisible | go-host | gpuDedicatedBytes | 3 | 0.00 MiB | 0.00 MiB | 0.00 % | ✓ |
| HubVisible | renderer-unassigned | privateBytes | 3 | 184.10 MiB | 6.25 MiB | 3.40 % | ✓ |
| HubVisible | renderer-unassigned | workingSetBytes | 3 | 229.21 MiB | 5.67 MiB | 2.48 % | ✓ |
| HubVisible | renderer-unassigned | cpuPct | 3 | 2.919 | 0.035 | 1.21 % | ✓ |
| HubVisible | renderer-unassigned | gpuPct | 3 | 0.000 | 0.000 | 0.00 % | ✓ |
| HubVisible | renderer-unassigned | gpuDedicatedBytes | 3 | 0.00 MiB | 0.00 MiB | 0.00 % | ✓ |
| HubVisible | crashpad | privateBytes | 3 | 2.86 MiB | 0.01 MiB | 0.36 % | ✓ |
| HubVisible | crashpad | workingSetBytes | 3 | 13.14 MiB | 0.03 MiB | 0.25 % | ✓ |
| HubVisible | crashpad | cpuPct | 3 | 0.000 | 0.000 | 0.00 % | ✓ |
| HubVisible | crashpad | gpuPct | 3 | 0.000 | 0.000 | 0.00 % | ✓ |
| HubVisible | crashpad | gpuDedicatedBytes | 3 | 0.00 MiB | 0.00 MiB | 0.00 % | ✓ |
