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

## Arranque antes de la interfaz y recogida completa

El modo Deferred recibe -RootInfoFile, que escribe el controlador después de
arrancar la interfaz. Primero registra Win32_ProcessStartTrace y activa una
sesión PresentMon con nombre único. CAPTURA-LISTA.json solo aparece tras
confirmar la sesión ETW propia mediante ControlTrace QUERY; entonces el
controlador puede lanzar la interfaz. Nunca se detiene una captura ajena.
La consulta verifica pérdidas ETW; PID reutilizado o desaparición temprana del
proceso anulan la muestra. No se guardan líneas de comandos ni credenciales.
El hash del PE se comprueba DESPUÉS de muestrear para no calentar su caché
ni añadir lectura/CPU al arranque medido.

RootInfoFile contiene process_id, created_utc, start_qpc, image_name e
image_sha256; se publica atómicamente por el controlador. NoiseExclusionsFile
contiene únicamente una lista process_id/created_utc de núcleo/carga propios.
La interfaz permanece viva hasta terminar el muestreador. El análisis recorta
el intervalo real de 60 s del replay principal, separado del calentamiento.

Aguante usa -Aguante -Seconds 14400: no inicia PresentMon ni acumula trazas de
fotos; conserva salud y memoria cada diez segundos. No equivale todavía al
guion completo de operaciones de la pieza 10.

## GPU, ruido y temperaturas

Contadores de proceso con PDH_FMT_NOCAP100 (0x8000, SDK pdh.h) para conservar
CPU multicore; se divide por procesadores lógicos antes de aplicar >2 % de
ruido externo. Once tests de agregación pasan: GPU por motor físico más
ocupado, suma de PIDs de familia dentro de ese motor, memoria dedicada de
familia, unidades QPC, descartados, ruido, identidades y rechazo de huecos.
No se suman motores paralelos para inventar un porcentaje GPU superior al real.
La suma de Dedicated Usage por PID puede contar recursos compartidos varias
veces; se declara como suma de familia, no VRAM física exclusiva. Criterio de
[Microsoft DirectX](https://devblogs.microsoft.com/directx/gpus-in-the-task-manager/).

Temperatura GPU y umbral térmico del driver mediante D3DKMT_ADAPTER_PERFDATA
(62) y PERFDATACAPS (63); unidades deci-Celsius, del SDK 10.0.26100.0.
Se consultan adaptadores sin crear un dispositivo D3D y se cierran los handles
propios. Fuentes oficiales: [EnumAdapters2](https://learn.microsoft.com/en-us/windows-hardware/drivers/ddi/d3dkmthk/nf-d3dkmthk-d3dkmtenumadapters2),
[PERFDATACAPS](https://learn.microsoft.com/en-us/windows-hardware/drivers/ddi/d3dkmthk/ns-d3dkmthk-_d3dkmt_adapter_perfdatacaps).
En servidor solo se compilaron los tres tipos C# y se comprobaron tamaños ABI;
no se instanciaron contadores, adaptadores, ETW ni PresentMon.

CPU no dispone aquí de un sensor fiable sin driver añadido: se registra
unknown y cpu_temperature_verified=false. Requiere confirmación física/manual;
no se inventa temperatura ni se declara comprobación térmica completa.
Soporte de contadores, sesiones ETW, driver, parentesco y los nuevos modos
sigue sin ejecutar hasta el PC. Falta integrar estos datos con la campaña.

## Cancelaciones y evidencia incompleta

Si falla una muestra se conservan procesos, contadores, temperaturas y eventos
de creación ya recogidos, además de salida y errores de PresentMon. Al cerrar
se termina únicamente el PresentMon propio y su sesión ETW de nombre GUID
generado por el muestreador. No se usa stop_existing_session ni se detienen
capturas ajenas. Un fallo de limpieza deja INVALIDA y su explicación.
Sintaxis de PowerShell y compilación de tipos C# verificadas sin llamadas ETW.
El camino real de cancelación sigue pendiente del PC.

La familia distingue la fecha aproximada del evento WMI de la fecha exacta
CIM/GetProcessTimes. Puede conservar un padre transitorio y luego refinar
la fecha de su hijo sin inventar una reutilización de PID. Todas las fechas
se comparan en UTC. test_familia.ps1 verifica ese caso, zonas horarias y una
reutilización real con datos sintéticos, sin WMI ni procesos reales.
