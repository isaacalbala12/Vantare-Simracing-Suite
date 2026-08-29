# Huella mínima · HubMin

Corridas: `hubmin-20260829-004704.csv`, `hubmin-20260829-011742.csv`, `hubmin-20260829-013305.csv`. Ruido = desviación muestral / media; hacen falta al menos 3 corridas y el gate falla por encima de 5 %.

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
| 1 | gpu-process | privateBytes | 171.82 MiB | 169.82 MiB | 186.32 MiB | 190.62 MiB | 216.42 MiB |
| 1 | gpu-process | workingSetBytes | 111.91 MiB | 111.23 MiB | 119.22 MiB | 120.83 MiB | 120.96 MiB |
| 1 | gpu-process | cpuPct | 0.478 | 0.000 | 1.000 | 2.000 | 2.000 |
| 1 | gpu-process | gpuPct | 0.376 | 0.082 | 1.512 | 3.046 | 4.051 |
| 1 | gpu-process | gpuDedicatedBytes | 118.35 MiB | 117.82 MiB | 125.82 MiB | 125.82 MiB | 129.57 MiB |
| 1 | renderer-unassigned | privateBytes | 185.77 MiB | 184.94 MiB | 238.03 MiB | 272.06 MiB | 280.99 MiB |
| 1 | renderer-unassigned | workingSetBytes | 230.63 MiB | 230.90 MiB | 279.89 MiB | 312.43 MiB | 320.94 MiB |
| 1 | renderer-unassigned | cpuPct | 2.961 | 3.000 | 4.000 | 5.000 | 10.000 |
| 1 | renderer-unassigned | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 1 | renderer-unassigned | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 1 | utility | privateBytes | 23.03 MiB | 23.26 MiB | 25.22 MiB | 25.23 MiB | 25.23 MiB |
| 1 | utility | workingSetBytes | 58.29 MiB | 58.54 MiB | 61.27 MiB | 61.28 MiB | 61.28 MiB |
| 1 | utility | cpuPct | 0.006 | 0.000 | 0.000 | 0.000 | 1.000 |
| 1 | utility | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 1 | utility | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 1 | browser | privateBytes | 46.68 MiB | 47.03 MiB | 48.86 MiB | 49.48 MiB | 49.48 MiB |
| 1 | browser | workingSetBytes | 129.36 MiB | 129.79 MiB | 132.20 MiB | 132.76 MiB | 132.76 MiB |
| 1 | browser | cpuPct | 0.972 | 1.000 | 1.000 | 1.000 | 4.000 |
| 1 | browser | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 1 | browser | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 1 | go-host | privateBytes | 74.52 MiB | 74.48 MiB | 76.40 MiB | 79.11 MiB | 79.61 MiB |
| 1 | go-host | workingSetBytes | 69.37 MiB | 69.29 MiB | 71.27 MiB | 74.07 MiB | 74.77 MiB |
| 1 | go-host | cpuPct | 3.156 | 3.000 | 4.000 | 5.000 | 11.000 |
| 1 | go-host | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 1 | go-host | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 1 | renderer-hub | privateBytes | 61.62 MiB | 60.74 MiB | 75.43 MiB | 76.68 MiB | 77.19 MiB |
| 1 | renderer-hub | workingSetBytes | 104.02 MiB | 103.25 MiB | 118.12 MiB | 119.26 MiB | 119.72 MiB |
| 1 | renderer-hub | cpuPct | 0.017 | 0.000 | 0.000 | 1.000 | 1.000 |
| 1 | renderer-hub | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 1 | renderer-hub | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 1 | crashpad | privateBytes | 2.87 MiB | 2.88 MiB | 3.27 MiB | 3.27 MiB | 3.27 MiB |
| 1 | crashpad | workingSetBytes | 13.13 MiB | 12.83 MiB | 18.56 MiB | 18.56 MiB | 18.56 MiB |
| 1 | crashpad | cpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 1 | crashpad | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 1 | crashpad | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 2 | go-host | privateBytes | 74.21 MiB | 74.05 MiB | 76.23 MiB | 79.07 MiB | 79.85 MiB |
| 2 | go-host | workingSetBytes | 70.08 MiB | 69.91 MiB | 72.32 MiB | 75.13 MiB | 75.47 MiB |
| 2 | go-host | cpuPct | 3.022 | 3.000 | 4.000 | 4.000 | 8.000 |
| 2 | go-host | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 2 | go-host | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 2 | gpu-process | privateBytes | 166.33 MiB | 165.96 MiB | 174.44 MiB | 189.77 MiB | 198.12 MiB |
| 2 | gpu-process | workingSetBytes | 107.70 MiB | 107.53 MiB | 110.24 MiB | 116.54 MiB | 117.02 MiB |
| 2 | gpu-process | cpuPct | 0.506 | 0.000 | 1.000 | 1.000 | 2.000 |
| 2 | gpu-process | gpuPct | 0.339 | 0.075 | 1.332 | 2.067 | 3.553 |
| 2 | gpu-process | gpuDedicatedBytes | 115.45 MiB | 115.82 MiB | 115.82 MiB | 123.82 MiB | 123.82 MiB |
| 2 | utility | privateBytes | 23.03 MiB | 23.37 MiB | 24.54 MiB | 25.16 MiB | 25.16 MiB |
| 2 | utility | workingSetBytes | 58.02 MiB | 58.62 MiB | 60.02 MiB | 60.59 MiB | 60.59 MiB |
| 2 | utility | cpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 2 | utility | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 2 | utility | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 2 | crashpad | privateBytes | 2.87 MiB | 2.88 MiB | 3.26 MiB | 3.26 MiB | 3.26 MiB |
| 2 | crashpad | workingSetBytes | 13.12 MiB | 12.82 MiB | 18.54 MiB | 18.54 MiB | 18.54 MiB |
| 2 | crashpad | cpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 2 | crashpad | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 2 | crashpad | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 2 | browser | privateBytes | 46.59 MiB | 47.05 MiB | 48.80 MiB | 48.81 MiB | 49.41 MiB |
| 2 | browser | workingSetBytes | 130.68 MiB | 131.29 MiB | 133.49 MiB | 133.50 MiB | 133.98 MiB |
| 2 | browser | cpuPct | 0.967 | 1.000 | 1.000 | 1.000 | 2.000 |
| 2 | browser | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 2 | browser | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 2 | renderer-hub | privateBytes | 62.64 MiB | 62.61 MiB | 77.35 MiB | 78.44 MiB | 78.66 MiB |
| 2 | renderer-hub | workingSetBytes | 104.94 MiB | 104.96 MiB | 119.75 MiB | 120.84 MiB | 121.08 MiB |
| 2 | renderer-hub | cpuPct | 0.017 | 0.000 | 0.000 | 1.000 | 1.000 |
| 2 | renderer-hub | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 2 | renderer-hub | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 2 | renderer-unassigned | privateBytes | 185.97 MiB | 183.86 MiB | 244.97 MiB | 267.98 MiB | 272.58 MiB |
| 2 | renderer-unassigned | workingSetBytes | 230.96 MiB | 229.91 MiB | 286.70 MiB | 309.29 MiB | 312.66 MiB |
| 2 | renderer-unassigned | cpuPct | 2.950 | 3.000 | 4.000 | 5.000 | 8.000 |
| 2 | renderer-unassigned | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 2 | renderer-unassigned | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 3 | crashpad | privateBytes | 2.86 MiB | 2.86 MiB | 3.27 MiB | 3.27 MiB | 3.27 MiB |
| 3 | crashpad | workingSetBytes | 13.12 MiB | 12.82 MiB | 18.55 MiB | 18.55 MiB | 18.55 MiB |
| 3 | crashpad | cpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 3 | crashpad | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 3 | crashpad | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 3 | utility | privateBytes | 22.92 MiB | 23.30 MiB | 24.47 MiB | 25.09 MiB | 25.09 MiB |
| 3 | utility | workingSetBytes | 57.95 MiB | 58.59 MiB | 60.00 MiB | 60.56 MiB | 60.56 MiB |
| 3 | utility | cpuPct | 0.011 | 0.000 | 0.000 | 1.000 | 1.000 |
| 3 | utility | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 3 | utility | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 3 | go-host | privateBytes | 73.70 MiB | 73.59 MiB | 75.28 MiB | 77.56 MiB | 78.29 MiB |
| 3 | go-host | workingSetBytes | 69.82 MiB | 69.72 MiB | 71.54 MiB | 73.55 MiB | 74.70 MiB |
| 3 | go-host | cpuPct | 3.033 | 3.000 | 4.000 | 5.000 | 11.000 |
| 3 | go-host | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 3 | go-host | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 3 | renderer-unassigned | privateBytes | 184.16 MiB | 185.72 MiB | 238.06 MiB | 273.17 MiB | 274.06 MiB |
| 3 | renderer-unassigned | workingSetBytes | 229.11 MiB | 231.46 MiB | 280.09 MiB | 313.45 MiB | 313.75 MiB |
| 3 | renderer-unassigned | cpuPct | 2.911 | 3.000 | 4.000 | 5.000 | 8.000 |
| 3 | renderer-unassigned | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 3 | renderer-unassigned | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 3 | browser | privateBytes | 46.37 MiB | 46.24 MiB | 48.71 MiB | 49.33 MiB | 49.33 MiB |
| 3 | browser | workingSetBytes | 129.01 MiB | 128.95 MiB | 131.87 MiB | 132.42 MiB | 132.42 MiB |
| 3 | browser | cpuPct | 0.950 | 1.000 | 1.000 | 2.000 | 4.000 |
| 3 | browser | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 3 | browser | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 3 | renderer-hub | privateBytes | 64.84 MiB | 65.02 MiB | 79.32 MiB | 80.39 MiB | 80.64 MiB |
| 3 | renderer-hub | workingSetBytes | 107.22 MiB | 107.50 MiB | 121.93 MiB | 122.90 MiB | 123.12 MiB |
| 3 | renderer-hub | cpuPct | 0.011 | 0.000 | 0.000 | 1.000 | 1.000 |
| 3 | renderer-hub | gpuPct | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 3 | renderer-hub | gpuDedicatedBytes | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| 3 | gpu-process | privateBytes | 162.33 MiB | 160.72 MiB | 173.81 MiB | 181.05 MiB | 201.20 MiB |
| 3 | gpu-process | workingSetBytes | 106.66 MiB | 106.14 MiB | 111.04 MiB | 116.90 MiB | 117.17 MiB |
| 3 | gpu-process | cpuPct | 0.433 | 0.000 | 1.000 | 1.000 | 2.000 |
| 3 | gpu-process | gpuPct | 0.341 | 0.070 | 1.384 | 2.509 | 3.273 |
| 3 | gpu-process | gpuDedicatedBytes | 112.47 MiB | 111.82 MiB | 115.82 MiB | 119.82 MiB | 119.82 MiB |

## Repetibilidad entre corridas

| Condición | Rol | Métrica | N | Media | Desviación | Ruido | Gate |
|---|---|---|---:|---:|---:|---:|:---:|
| HubMin | gpu-process | privateBytes | 3 | 166.82 MiB | 4.76 MiB | 2.86 % | ✓ |
| HubMin | gpu-process | workingSetBytes | 3 | 108.76 MiB | 2.78 MiB | 2.56 % | ✓ |
| HubMin | gpu-process | cpuPct | 3 | 0.472 | 0.036 | 7.71 % | ✗ |
| HubMin | gpu-process | gpuPct | 3 | 0.352 | 0.021 | 5.92 % | ✗ |
| HubMin | gpu-process | gpuDedicatedBytes | 3 | 115.42 MiB | 2.94 MiB | 2.55 % | ✓ |
| HubMin | renderer-unassigned | privateBytes | 3 | 185.30 MiB | 0.99 MiB | 0.54 % | ✓ |
| HubMin | renderer-unassigned | workingSetBytes | 3 | 230.23 MiB | 0.99 MiB | 0.43 % | ✓ |
| HubMin | renderer-unassigned | cpuPct | 3 | 2.941 | 0.026 | 0.89 % | ✓ |
| HubMin | renderer-unassigned | gpuPct | 3 | 0.000 | 0.000 | 0.00 % | ✓ |
| HubMin | renderer-unassigned | gpuDedicatedBytes | 3 | 0.00 MiB | 0.00 MiB | 0.00 % | ✓ |
| HubMin | utility | privateBytes | 3 | 23.00 MiB | 0.06 MiB | 0.28 % | ✓ |
| HubMin | utility | workingSetBytes | 3 | 58.09 MiB | 0.18 MiB | 0.30 % | ✓ |
| HubMin | utility | cpuPct | 3 | 0.006 | 0.006 | 100.00 % | ✗ |
| HubMin | utility | gpuPct | 3 | 0.000 | 0.000 | 0.00 % | ✓ |
| HubMin | utility | gpuDedicatedBytes | 3 | 0.00 MiB | 0.00 MiB | 0.00 % | ✓ |
| HubMin | browser | privateBytes | 3 | 46.55 MiB | 0.16 MiB | 0.34 % | ✓ |
| HubMin | browser | workingSetBytes | 3 | 129.68 MiB | 0.88 MiB | 0.68 % | ✓ |
| HubMin | browser | cpuPct | 3 | 0.963 | 0.012 | 1.20 % | ✓ |
| HubMin | browser | gpuPct | 3 | 0.000 | 0.000 | 0.00 % | ✓ |
| HubMin | browser | gpuDedicatedBytes | 3 | 0.00 MiB | 0.00 MiB | 0.00 % | ✓ |
| HubMin | go-host | privateBytes | 3 | 74.14 MiB | 0.41 MiB | 0.56 % | ✓ |
| HubMin | go-host | workingSetBytes | 3 | 69.76 MiB | 0.36 MiB | 0.51 % | ✓ |
| HubMin | go-host | cpuPct | 3 | 3.070 | 0.074 | 2.41 % | ✓ |
| HubMin | go-host | gpuPct | 3 | 0.000 | 0.000 | 0.00 % | ✓ |
| HubMin | go-host | gpuDedicatedBytes | 3 | 0.00 MiB | 0.00 MiB | 0.00 % | ✓ |
| HubMin | renderer-hub | privateBytes | 3 | 63.03 MiB | 1.65 MiB | 2.61 % | ✓ |
| HubMin | renderer-hub | workingSetBytes | 3 | 105.39 MiB | 1.65 MiB | 1.56 % | ✓ |
| HubMin | renderer-hub | cpuPct | 3 | 0.015 | 0.003 | 21.65 % | ✗ |
| HubMin | renderer-hub | gpuPct | 3 | 0.000 | 0.000 | 0.00 % | ✓ |
| HubMin | renderer-hub | gpuDedicatedBytes | 3 | 0.00 MiB | 0.00 MiB | 0.00 % | ✓ |
| HubMin | crashpad | privateBytes | 3 | 2.87 MiB | 0.00 MiB | 0.16 % | ✓ |
| HubMin | crashpad | workingSetBytes | 3 | 13.13 MiB | 0.01 MiB | 0.05 % | ✓ |
| HubMin | crashpad | cpuPct | 3 | 0.000 | 0.000 | 0.00 % | ✓ |
| HubMin | crashpad | gpuPct | 3 | 0.000 | 0.000 | 0.00 % | ✓ |
| HubMin | crashpad | gpuDedicatedBytes | 3 | 0.00 MiB | 0.00 MiB | 0.00 % | ✓ |
