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

## Pieza 5: anfitrión real en las dos variantes GPUI

La opción de compilación medir-latencia añade únicamente el mosaico de
1/4/10 Relative Vantare en una ventana por monitor, usando el anfitrión real.
CLI del PC: --medicion-relative 10 --fuente pipe:NOMBRE --control-stdin.
Las tres variantes B conservan demanda 33 ms y los nueve archivos de fuentes
idénticos por SHA256: fuentes-comunes.json. Solo cambia el dibujo en Rune.
Fuera de la feature no se activa el mosaico ni el registrador nuevo.

B-GPUI fuente d15993da376ec4d818faeff4e68e025455d17664, base nightly
b71e65cbf87b138ea5b3dbaf471f7797fc9c0bc9: Release opt3/lto=false/cgu16/debug0,
-j 2, por cola; final incremental 3m03s; 16.547.840 bytes, SHA256
e430259e15cecd9df6354eee0fc690b2b98a9fad21c3ccf1b019272c54b3ea8f.
El primer build de preparación tardó 8m30s y no llevaba el sent definitivo;
no se presenta como binario del kit. Las esperas de cola se registran aparte.

B-fast se conserva sobre su base exacta, sin traer al PR la divergencia
histórica de más de mil archivos. fast/medir-fast.patch contiene todos los
cambios de código necesarios; fast/README.md documenta fuente y binario.
Verificado con índice Git aislado: aplicar el parche a la base fast produce
exactamente todo native del SHA compilado, sin tocar los checkouts.

Los dos ejecutables compilan en Windows y su procedencia está dentro del PE.
No se ha ejecutado GPUI en el servidor. Tests de interfaz, clippy Windows,
paridad gráfica, segundo monitor, DPI, OBS y latencia hasta pantalla siguen
pendientes de CI/PC. El kit está incompleto. Ningún merge ni release.
