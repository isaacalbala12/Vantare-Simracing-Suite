# Reproductor y marcas comunes · VANTA-141 / #2213 (piezas 2+3)

`medir-latencia` es opt-in en profiling/ipc/runtime/ui. Sin ella no hay
registro nuevo ni espera de suscriptor. El renderer llama un no-op que se
elimina fuera de medición. No se modifica el DTO ni se cambia el pintado.

El núcleo registra cada publicación; el suscriptor registra cada foto válida
antes de la casilla latest-wins. El canvas identifica la foto realmente
pintada y el backend GPUI toma QPC justo antes de Present. Esa marca NO es
latencia hasta pantalla: el cruce requiere el CSV original de PresentMon.
Rune usará el mismo registrador, activado por la misma feature.

Cada proceso abre un archivo nuevo con `VANTARE_LATENCY_FILE` y lo escribe
solo al cerrar. Máximo 131.072 registros; desbordamiento o ausencia de pie
anulan la ronda. No activar la traza durante las 4 h de aguante: la campaña
larga usa el muestreador de memoria y salud sin acumular fotos en RAM.

El contador no enlaza Rune/GPUI. Arranca el núcleo real con stdin controlado,
una raíz de datos nueva y `VANTARE_REPLAY_WAIT_SUBSCRIBER=1`: la reproducción
no comienza hasta negociar demanda. El núcleo conserva los tiempos del
corpus. Tras 65 s cierra stdin y concede 30 s de cierre; compara todas las
identidades emitidas y recibidas. Cualquier pérdida anula la ejecución,
aunque los contadores o la última secuencia coincidan.

Compilar por `native/scripts/compilar.ps1`, usando targets en D: y -j 2.
El núcleo debe llevar `--features medir-latencia`; el contador tiene workspace
independiente. No lanzar los overlays en el servidor, ni siquiera para consultar
procedencia. `python -m unittest discover -s native/pruebas-rune -p test_latencia.py`
verifica formato, pérdidas, reloj hasta pantalla y rechazo de cruces ambiguos.

No hay evidencia de pantalla ni medición comparativa en estos tests sintéticos.
