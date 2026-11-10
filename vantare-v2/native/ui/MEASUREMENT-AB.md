# Comparación A/A y A/B · VANTA-139

Estado: método en preparación. No hay una mejora de motor aceptada. La campaña
Release de `5104c1bbf` es diagnóstico provisional; la referencia final se compila
y mide desde el SHA que se fusione de #2001, conservando ese SHA y ambos hashes
de ejecutable. El recolector tiene su propio `collector_sha`; no se mezclan.

## Diseño

`measure-overlay-ab.ps1` recibe `-A`, `-B`, `-Core`, `-Recording`, `-Out`,
`-Widgets`, `-Phases` y `-ReplaySpeed`. Primero ejecuta A/A: ambas etiquetas
usan exactamente A. Después ejecuta A/B. Cada ronda contiene A, B, B, A en
procesos nuevos, con el mismo núcleo y corpus. Una observación inválida detiene
la campaña; no se sustituye silenciosamente por otra favorable.

Se empieza con ocho rondas por experimento: 32 observaciones A/A y otras 32 A/B
por configuración. Son ocho unidades pareadas independientes, no miles de
frames tratados como repeticiones. Es un mínimo exploratorio, sin promesa de
potencia estadística. Si el máximo desvío logarítmico A/A supera 2,5 %, no se
acepta una diferencia del 5 %. Hay que corregir las condiciones y repetir una
campaña completa, publicando también la fallida; aumentar N por sí solo no
elimina sesgo. El script admite hasta 24 rondas.

La razón por ronda es `sqrt(B1*B2/(A1*A2))`. Cancela una deriva multiplicativa
lineal en el tiempo cuando las cuatro observaciones están espaciadas igual.
Las duraciones y pausas reales quedan en el manifiesto: interrupciones o deriva
no lineal siguen siendo limitaciones. Se publican las razones individuales,
mediana, rango, CV entre razones y CV de las cuatro observaciones de cada ronda.
La separación del ruido A/A es necesaria; no sustituye los gates visual y VRR.

## Deriva observada

En la campaña provisional, 4 widgets sin fases pasó de 123,639 a 130,351
millones de ticks/s entre rondas 1 y 5; las fotos recibidas fueron 2646 y 2672.
El working set fue 45,57 y 45,59 MiB. Cada pasada abrió un proceso nuevo y el
buffer tiene capacidad fija: no hay evidencia de crecimiento acumulativo del
buffer entre pasadas. La carga total media subió de 0,62 a 0,96 %, pero esto
no identifica la causa. No se registró temperatura ni frecuencia efectiva por
intervalo: no se puede atribuir retrospectivamente a temperatura o caché.
ABBA compensa la componente lineal; A/A debe demostrar si el residuo permite
comparar un 5 %. Hasta entonces, las cifras no deciden ningún motor.

## Qué se mide

La memoria de referencia es **working set**. La memoria privada se conserva
como diagnóstico: incluye unos 137 MiB reservados por la traza de dos millones
de eventos. Comparar privada como memoria del producto sería engañoso.

En este servidor, los ciclos consultados son ticks de TSC, aproximadamente
3,49 GHz, no instrucciones ni tiempo de CPU convertido. La frecuencia nominal
WMI no describe turbo o limitación térmica. Se conserva el plan de energía;
no se cambia globalmente en una máquina compartida. Una comparación solo es
válida bajo el mismo plan y con A/A suficiente. No convertir a núcleos o ms.

`sampler.csv` conserva ticks del proceso recolector y duración de cada iteración
Get-Counter; incluye la espera de muestreo en tiempo de pared. No incluye el
coste indirecto de los proveedores WMI/PDH en otros procesos. Por tanto, este
dato caracteriza coste directo, y todavía se necesita un control pareado para
cuantificar perturbación del sistema.

`-ReplaySpeed 4` usa la aceleración que ya admite el núcleo, conserva los mismos
sucesos y alinea la ventana por posición del corpus. La duración real baja;
no equivale a una prueba sin límite de render. Los Hz, p99 entre presents y
latencias de la reproducción a velocidad 1 dependen de la cadencia de entrada;
no demuestran que un motor renderice más rápido. Las fases CPU de pintado y
envío D3D se deben comparar por llamada, separadas de decode, IPC y proyección.
Los presents incluyen HWND para calcular intervalos dentro de cada ventana.

## GPU y puerta de aceptación

En PATH está WPR del sistema; no están PresentMon, WPA ni xperf. Los contadores
de GPU actuales miden ocupación por segundo, **no tiempo GPU de cada frame**.
No se inventa esa métrica. Para obtenerla con ETW hace falta un PresentMon
compatible que exponga GPUTime y correlación de frames, o herramientas de
análisis ETW del Windows Performance Toolkit. No se ha instalado nada.

VRR sigue sin comprobar. El estado `null` bloquea aceptar un motor, aunque
mejore CPU. DWM/GPU del servidor remoto a 59 Hz son solo contexto. Hace falta
la prueba local de Isaac en su PC de juego, autorizada por el orquestador,
con juego sin bordes, monitor VRR, y comparación sin overlays / visibles /
ocultos / restaurados. No se ejecuta remotamente por esta tarea.
