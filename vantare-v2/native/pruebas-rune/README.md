# Reproductor y marcas comunes · VANTA-141 / #2213 (piezas 2+3)

`medir-latencia` es opt-in en profiling/ipc/runtime/ui. Sin ella no hay
registro nuevo ni espera de suscriptor. El renderer llama un no-op que se
elimina fuera de medición. No se modifica el DTO ni se cambia el pintado.

El núcleo registra cada publicación; el suscriptor distingue la decodificación
de la entrega al consumidor, después de la casilla latest-wins. El canvas identifica la foto realmente
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

Las compilaciones de medición se realizan en el Mac con el guardián de espacio
y un único target `~/target-isa-2213-rune`, sin depuración pesada.
El núcleo debe llevar `--features medir-latencia`; el contador tiene workspace
independiente. No lanzar los overlays en el servidor, ni siquiera para consultar
procedencia. `python -m unittest discover -s native/pruebas-rune -p test_latencia.py`
verifica formato, pérdidas, reloj hasta pantalla y rechazo de cruces ambiguos.

No hay evidencia de pantalla ni medición comparativa en estos tests sintéticos.

## Cadencia real: corrección acordada con Isaac

El Relative conserva su demanda de 33 ms en GPUI, fast y Rune. `origin` marca
cada publicación interna; `sent` marca únicamente una foto escrita por completo
en el pipe; `received` se registra al entregarla al consumidor del Subscriber.
La ronda se anula si las identidades de `sent` y `received` difieren. Las
omisiones deliberadas por cadencia no son pérdidas de transporte. Todo envío
debe corresponder a una publicación de origen, que se conserva para la latencia.

El contador usa esa misma demanda por defecto. `--cada-foto` solicita todas
solo como prueba de estrés separada: sus resultados nunca se mezclan con la
campaña principal. El resultado anterior de 3.840/3.840 corresponde a ese modo
sin limitación, no a la nueva campaña con la cadencia real.
