# Fase 0 · Medición de topología y referencia (2026-09-29)

Plan: `docs/superpowers/plans/2026-09-29-arquitectura-rust-nativa.md` (fase 0). Issue #1421.

## Condiciones

- Equipo: Ryzen 7 3700X (16 hilos), RX 7800 XT, 1920×1080 a 120 Hz, Windows 11.
- LMU en pista, en primer plano. Adaptador LMU **en vivo**.
- 4 widgets (Standings, radar, pedales y un segundo Standings), una ventana por
  monitor, build release de `vantare-v2/native` en `11d7ad5a`.
- Banco `scripts/bench/huella-medir.ps1`, 90 s tras 5 s de calentamiento, 1 Hz,
  **una sola pasada** por configuración. CSV y resúmenes en `C:\tmp\fase0\medidas`
  (no versionados).
- CPU en % de la máquina × 16 = % de un núcleo.

## Resultados

| Configuración | Memoria privada | Working set | CPU (% de un núcleo) | GPU del proceso | GPU dedicada |
|---|---:|---:|---:|---:|---:|
| **B**: `vantare-core` + `vantare-overlays` | 107 MiB | 81 MiB | ~12 % | 0,41 % | 89 MiB |
| A: `vantare-inproc` (un proceso) | 133 MiB | 123 MiB | ~10 % | 0,45 % | 89 MiB |
| Referencia Wails (`huella-minima-baseline-2026-08-29.md`, A1) | 555 MiB | — | ~114 % (Go host incluido) | 0,4 % (GPU process) | ~101 MiB |

`dwm.exe` fue igual en A y B (GPU 1,5–1,6 %); su CPU no se mide sin consola elevada.

## Decisiones

1. **Topología B.** A ahorra ~2 puntos de un núcleo pero usa más memoria, y la
   diferencia no justifica perder el aislamiento de fallos (criterio de la ADR 0099
   §3). `vantare-inproc` se retira del código.
2. **Una ventana por monitor** (decisión de Isaac; con 22 widgets quietos, 22
   ventanas costaban el doble de CPU que una por los avisos de pintado por refresco).

## Límites

- Una sola pasada, sin ruido A/A: sirve para decidir entre A y B y para ver el
  orden de magnitud frente a Wails, no como presupuesto final.
- **Frame time del juego no medido:** PresentMon necesita consola elevada para
  seguir a LMU (sin ella no produjo frames). Queda para la campaña con consola
  elevada antes del candidato (fase 7) o cuando se repita el banco.
- La referencia Wails es de agosto, con el diseño Endurance y 3 widgets; la pasada
  Wails con Eficiencia no pudo correr porque el perfil del banco no tenía sesión
  iniciada (preflight de licencia por CDP). El margen (≈5× memoria, ≈9× CPU) es
  mucho mayor que esas diferencias.
