# ISA-996 — LMU HUD Full / Off, exploración tras reinicio

2026-09-06. Trabajo directo, sin subagentes. Comparación priorizada por Isaac
antes de continuar optimizaciones. No modifica producto ni acredita ahorro
de Vantare, FPS o cumplimiento del objetivo inferior al 2%.

## Protocolo ejecutado

- LMU v1.4130, PID8680 continuo; Vantare cerrado durante todas las capturas.
- La Sarthe, Isotta Fraschini #11, práctica 6h, parrilla configurada
  22HY+16P2+23GT3, coche parado en boxes. Sin vueltas ni datos sintéticos.
- HUD Enabled Full / Off desde menú principal; escala Normal, gráficos y
  espejos sin cambiar. Full restaurado y comprobado en cockpit al terminar.
- 60 segundos por captura, 29 muestras cada una; estabilización previa.
- Orden real: Full1, salida/recarga Off, Off1, Off2, salida/recarga Full,
  Full2, Full3. No son tres parejas independientes ni un A/B aleatorizado.
- Collector local `C:/tmp/isa996-hud-capture.ps1`: CPU por delta de tiempo de
  proceso / 16 procesadores lógicos; memoria de proceso y contadores Windows
  GPU Engine / GPU Process Memory. PID/arranque verificados, guardia rechaza
  Vantare en condición juego solo. CSV conservados, ninguna captura fallida
  reinterpretada como éxito. GPU válida en todas las muestras observadas.
- Agregación independiente pondera cada muestra por intervalo dentro de cada
  captura; tabla global es media de las medias de captura.

## CPU y GPU por captura

| Captura | CPU máquina % | GPU 3D suma % |
|---|---:|---:|
| Full1 | 19,36853 | 57,74975 |
| Off1 | 18,63744 | 57,12715 |
| Off2 | 20,17960 | 56,05800 |
| Full2 | 19,38623 | 60,99979 |
| Full3 | 20,28747 | 61,72066 |

## Resumen descriptivo, no efecto causal probado

| Métrica del proceso LMU | Full (3 capturas) | Off (2 capturas) |
|---|---:|---:|
| CPU máquina media | 19,68% | 19,41% |
| RAM residente / working set | 14,50 GiB | 14,78 GiB |
| Residente / RAM física instalada | 45,41% | 46,29% |
| Memoria privada comprometida | 25,19 GiB | 25,22 GiB |
| GPU 3D suma media | 60,16% | 56,59% |
| Memoria GPU dedicada atribuida al proceso | 9,60 GiB | 9,62 GiB |

RAM física detectada: 34281668608 bytes. El porcentaje residente no es memoria
privada exclusiva; el commit privado no equivale a RAM física ocupada. GPU es
la suma de motores 3D atribuida al PID, no el porcentaje global de Task Manager.
No hay captura PresentMon de frametimes en esta serie.

**Veredicto: ahorro CPU/RAM no confirmado.** La diferencia descriptiva CPU
es sólo -0,27 puntos; Off1/Off2 varían 1,54 puntos. La GPU observada es menor
en Off, pero también cambia entre Full1 y Full2/3. Recargas, tráfico de IA,
evolución temporal, calentamiento y presión de memoria son factores de
confusión. No afirmar que el HUD causa toda la diferencia ni que Vantare
supera al HUD nativo. La primera Full pertenece a otra sesión y no se oculta.

## Evidencia y estado

Crudos locales: `C:/tmp/isa996-hud-full-{1,2,3}.csv` y
`C:/tmp/isa996-hud-off-{1,2}.csv`. El smoke de menú
`C:/tmp/isa996-hud-tooling-smoke.csv` queda excluido.

HUD Full restaurado; sin medidas activas. No cambios de código, builds,
tests de producto, commits, push, PR ni promoción en esta comparación.
Rama `vantareapp/isa-996-cierre-rendimiento`, HEAD
`1c835bc031df17d2b33c0ab6a95e474e80404358`, cambios anteriores preservados.
Siguiente: continuar atribución de Vantare dentro de la arquitectura aprobada;
envío incremental por secciones sigue pendiente de aprobación explícita.
