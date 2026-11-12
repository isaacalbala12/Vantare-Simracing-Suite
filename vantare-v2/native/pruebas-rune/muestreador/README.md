# VANTA-141 · piezas 6+7

Estado: fuentes preparadas; no es todavía un kit ejecutable completo.

`Contadores.cs` usa PDH con nombres ingleses para que la lectura no dependa del
idioma de Windows. Se conservan los valores y estados originales por motor de
GPU, memoria dedicada, CPU del sistema, frecuencia y límite de rendimiento.
No se inventa una temperatura cuando no hay un sensor disponible.

`MUESTREAR.ps1` guarda ciclos, tiempo de CPU, memoria privada y working set de
la familia del proceso. Distingue identidades por PID y fecha de creación;
no guarda líneas de comandos, nombres de usuario ni credenciales. PresentMon
2.6.0 se verifica por SHA-256 antes de abrirlo. Se captura su CSV sin quitar
fotogramas descartados. Los resultados incompletos se conservan con INVALIDA.
La agregación pura inicial está en `agregar.py`: valida las unidades QPC de
PresentMon 2.6, separa cadenas y suma CPU y memoria de la familia declarada.
Siete pruebas sintéticas pasan; falta integrar los resultados con las rondas.

Los nombres y unidades de PresentMon se consultan en su documentación oficial
[v2.6.0](https://github.com/GameTechDev/PresentMon/blob/v2.6.0/README-ConsoleApplication.md).
`CPUStartQPC` son ticks; las duraciones como `MsCPUBusy` y `DisplayLatency`
son milisegundos. La latencia hasta pantalla se cruza con las fotos del núcleo;
una marca de envío a Present por sí sola no demuestra visibilidad.

La carga `../carga/carga.cpp` solo se compila en el servidor. En el PC abre una
ventana sin bordes en el monitor principal y exige que su frecuencia coincida
con `--hz`. Usa D3D11 hardware, sin alternativa WARP. Calibra diez segundos
para aproximarse al 70 % del periodo de refresco en trabajo GPU; congela el
coste y comprueba su mediana entre los segundos 12 y 14. Un coste fuera del
margen 56–84 % invalida la carga. La escena y su coste quedan fijos después
de calibrar. Las rondas con carga deben esperar esos catorce segundos antes
del calentamiento de overlays y medir exactamente el mismo tramo temporal.

La compilación C# y el parseo PowerShell se verifican sin instanciar contadores.
No se ha ejecutado PresentMon ni la carga en el servidor. El funcionamiento
real de GPU, relojes, pantalla y contadores queda para el PC de juego.

Pendientes antes del kit: iniciar PresentMon antes del proceso medido para
capturar su primer Present; ruido de otros procesos por encima del 2 %;
comprobación térmica verificable y normalización completa de contadores GPU.
Estos pendientes no se dan por cubiertos por las pruebas sintéticas.
