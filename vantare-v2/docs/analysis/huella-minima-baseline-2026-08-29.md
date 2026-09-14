# Huella mínima · Baseline F0 (2026-08-29)

Spec: `docs/superpowers/specs/2026-08-28-huella-minima-niveles-rendimiento-spec.md` §8 y §12. Banco: `scripts/bench/huella.ps1` (PR #929). Issue #924 (T0.4).

## Condiciones de la medida

| Campo | Valor |
|---|---|
| SHA medido | `nightly@f2e73d3a` (build `bin/vantare-baseline.exe`, sin `-tags production`, CDP 9247); incluye #937, anterior a #936 |
| Hardware | Ryzen 7 (16 hilos lógicos), RX 7800 XT, 1920×1080@120, Windows 11 26200 |
| Juego | LMU 1.4130 · Race Weekend WEC 2026 · Spa-Francorchamps · práctica abierta 6 h · 12 HY + 13 P2 + 12 GT3 = **37 coches** · día seco · jugador en garaje (el juego vuelve solo al menú de garaje; escena estable = garaje con la IA rodando) |
| Perfil | `testdata/bench/huella-endurance-3.json` (standings, relative, delta · Endurance) |
| Protocolo | 180 s por corrida, 1 Hz, 3 repeticiones por condición, higiene limpia (solo WebView2 del shell de Windows, registrados; sin `-Forzar`) |
| Ruido | memoria ≤ 5 % en todas las filas; CPU de valores pequeños (< 0,05 %) con ruido alto por cuantización, irrelevante |

## RAM privada (MiB, media de 3 corridas)

| Condición | Total | Go host | Browser | GPU process | Renderer hub | Renderer overlay | Utility | Crashpad |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| **A0** hub visible, sin overlay | **287,3** | 72,8 | 38,4 | 92,9 | 59,1 | — | 21,3 | 2,8 |
| **A1** overlay activo | **555,2** | 76,8 | 46,6 | 163,2 | 62,7 | 180,4 | 22,8 | 2,8 |
| **HubVisible** overlay + hub en primer plano | 562,8 | 74,4 | 46,7 | 168,5 | 63,2 | 184,1 | 23,0 | 2,9 |
| **HubMin** overlay + hub minimizado | **561,7** | 74,1 | 46,5 | 166,8 | 63,0 | 185,3 | 23,0 | 2,9 |

El renderer del overlay aparece como `renderer-unassigned` en los CSV: defecto de atribución del banco, corregido en la rama `isa-924-atribucion-renderer-overlay`.

## CPU (% de la máquina, 16 hilos; media de 3 corridas)

| Condición | Go host | Browser | GPU process | Renderer overlay | Renderer hub | Total ≈ | cores ≈ |
|---|---:|---:|---:|---:|---:|---:|---:|
| A0 | 1,68 | 0,03 | 0,00 | — | 0,01 | 1,7 | 0,27 |
| A1 | 2,90 | 0,89 | 0,51 | 2,81 | 0,02 | **7,1** | **1,14** |
| HubVisible | 3,14 | 0,94 | 0,46 | 2,92 | 0,01 | 7,5 | 1,20 |
| HubMin | 3,07 | 0,96 | 0,47 | 2,94 | 0,01 | 7,5 | 1,19 |

GPU Engine del GPU process: 0,35–0,38 % en A1/HubVisible/HubMin. Memoria GPU dedicada del GPU process ≈ 101 MiB.

## Frametime del juego (PresentMon, `Le Mans Ultimate.exe`)

| Corrida | n frames | media | p50 | p95 | p99 |
|---|---:|---:|---:|---:|---:|
| A0 #1 | 14.598 | 12,33 | 10,57 | 20,69 | 28,24 |
| A0 #2 | 12.403 | 14,51 | 12,62 | 24,90 | 37,74 |
| A0 #3 | 13.406 | 13,42 | 11,66 | 22,70 | 29,74 |
| A1 #1 | 10.240 | 17,57 | 17,41 | 24,91 | 30,96 |
| A1 #2 | 12.475 | 14,42 | 12,49 | 24,98 | 32,71 |
| A1 #3 | 5.614 | 32,04 | 25,89 | 69,81 | 111,16 |

**No concluyente.** A1 #3 está contaminada (otra build de Vantare arrancó durante la corrida: solo 90 s de frames). Con las dos A1 limpias (17,6 y 14,4 ms) frente a A0 (12,3–14,5 ms) la diferencia queda dentro del ruido de la escena (la IA rueda y la carga del juego cambia; ruido A0 = 8 % > 5 %). El coste del overlay en frametime está entre ~0 y ~4 ms y este protocolo no lo resuelve. Frames perdidos: 0 en todas las corridas válidas.

## Conclusiones

1. **El overlay cuesta +268 MiB privados** (renderer 180 + GPU process +70 + browser +8 + Go +4) y **≈0,9 cores** (Go +0,2, renderer 0,45, browser 0,14, GPU process 0,08).
2. **Minimizar el hub no ahorra nada** (561,7 vs 562,8 MiB): confirma D10 y fija el objetivo de #940 (gate 12.2: ≥ 30 % menos RAM privada con hub minimizado en nivel 3 → ≤ 393 MiB).
3. **La GPU no es el problema** en esta máquina (0,4 %).
4. **Go host = 77 MiB / 0,46 cores con overlay**: segundo consumidor de CPU tras el renderer; la retirada de V1 (#894) es el siguiente ahorro grande (pull dual 1,3–1,8 ms → 17 µs, según #912).
5. **Frametime del juego: pendiente de un protocolo mejor** (A0/A1 intercalados en la misma escena, sin IA o con repetición; iGPU y VR).

## Incidencias del protocolo (para el banco)

- Corridas encadenadas sin esperar a que muera `vantare-*.exe`: la higiene aborta (correcto); el bucle debe esperar (`Get-Process vantare*`).
- Radeon Software mantiene un `PresentMon-x64.exe -session_name RSXTraceSession` permanente: no esperar a que desaparezca PresentMon.
- Sesiones ETW `VantareHuella-*` huérfanas de corridas abortadas dejan a PresentMon sin frames (Started/Stopped sin CSV): parar con `logman stop <sesión> -ets`; el banco debe limpiar en `finally` y al arrancar (en `isa-924-atribucion-renderer-overlay`).
- Dos builds de Vantare midiendo a la vez se contaminan mutuamente: un solo medidor por máquina.

## Ficheros

Resúmenes por condición en `docs/analysis/huella-minima-baseline-2026-08-29/` (`A0|A1|HubVisible|HubMin.md|json`, `A0|A1-frametime.*`). CSV crudos (1 Hz por proceso + PresentMon) conservados fuera del repo en `C:\tmp\vantare-baseline\vantare-v2\results\` (≈35 MB).
