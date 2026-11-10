# Comparación A/A y A/B · VANTA-139

Estado: método en preparación. No hay una mejora de motor aceptada. La campaña
Release de `5104c1bbf` es diagnóstico provisional; la referencia final se compila
y mide desde el SHA que se fusione de #2001, conservando ese SHA y ambos hashes
de ejecutable. El recolector tiene su propio `collector_sha`; no se mezclan.

## Diseño

`measure-overlay-ab.ps1` recibe `-A`, `-B`, `-Core`, `-Recording`, `-Out`,
`-Widgets`, `-Phases`, `-RenderLoad` y `-ReplaySpeed`. Primero ejecuta A/A: ambas etiquetas
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
Al terminar A/A guarda `aa-noise.json`; si el límite del 2,5 % no se cumple,
no inicia A/B. Se conservan los resultados fallidos para investigar la causa.
Antes de empezar comprueba ambos binarios y las capacidades de carga solicitadas.

Con intervalos iguales, la razón por ronda es `sqrt(B1*B2/(A1*A2))`. El
analizador usa los tiempos de inicio reales para interpolar log(A) hasta el
punto medio de B1/B2; así compensa una deriva multiplicativa lineal incluso
con pausas desiguales. Interrupciones o deriva no lineal siguen siendo
limitaciones. Se publican las razones individuales,
mediana, rango, CV entre razones y CV de las cuatro observaciones de cada ronda.
La separación del ruido A/A es necesaria; no sustituye los gates visual y VRR.
Se informa además un intervalo bootstrap del 95 % para la mediana A/B,
remuestreando rondas completas con semilla fija. Es exploratorio: no demuestra
independencia temporal ni corrige cambios no lineales de condiciones.

Ejemplo desde `vantare-v2`, con ejecutables Release instrumentados y hashes
conservados, una carpeta nueva por configuración y campaña:

```powershell
pwsh -NoProfile -File native/scripts/measure-overlay-ab.ps1 -A D:/evidence/A/overlay-replay.exe -B D:/evidence/B/overlay-replay.exe -Core D:/evidence/core/vantare-core.exe -Recording testdata/rust-port/lmu47-high-rate-60s.tar.gz -Out D:/evidence/ab-w4-speed4 -Widgets 4 -ReplaySpeed 4 -Rounds 8 -Phases
```

Repetir a velocidad 1 y 4, con 1, 4 y 22 widgets, con y sin `-Phases`.
La comprobación A/A se hace antes de cada configuración A/B; no reutilizar
un suelo de ruido de otra carga, velocidad o momento de la máquina.

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
Get-Counter y guardia WMI de la cola; incluye la espera de muestreo en tiempo
de pared. `frequency.csv` conserva frecuencia, porcentaje de rendimiento y
límite de rendimiento, con su estado de validez. Las zonas térmicas se guardan
sin convertir ni asumir que son sensores del paquete CPU. No incluye el
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

`-RenderLoad` invalida todos los widgets en cada oportunidad de dibujo. La
cadencia ya no la fija la llegada de telemetría; Windows conserva su pulso de
presentación. No se promete render sin límite de Hz físicos. Las notificaciones
de carga se registran aparte de las provocadas por fotos. La condición de
caracterización es que un widget quieto, que no presenta en la ventana estable
normal, sí repinte continuamente al activar la carga.

Con fases, los binarios nuevos usan consultas D3D11 de timestamp/disjoint alrededor
de los comandos de render, antes de Present. Ocho juegos de consultas limitan
memoria y trabajo pendiente. Se lee S_OK explícitamente, se respeta S_FALSE,
se usa DONOTFLUSH, y nunca se espera a la GPU. Los resultados tardíos conservan
el QPC del frame original. Un intervalo disjoint invalida la pasada; una cola
llena registra muestras omitidas. Las últimas consultas sin resolver al salir
no se inventan. Se publican cantidad, cobertura y tiempos individuales.

Este tiempo GPU excluye Present, DWM y pantalla física. Los contadores de GPU
por segundo se conservan como contexto. PresentMon, WPA y xperf no están en
PATH ni en la carpeta habitual del Windows Performance Toolkit. Para correlación
ETW con frames físicos haría falta PresentMon o ese toolkit; no se instala nada.
La línea base exacta acc6619b1 carece de estas consultas. Su binario se mide
sin ellas y se publica como tal; A/B usa el mismo añadido diagnóstico en ambos
motores, con el SHA real de cada build y acc6619b1 como ancestro de producto.

VRR sigue sin comprobar. El estado `null` bloquea aceptar un motor, aunque
mejore CPU. DWM/GPU del servidor remoto a 59 Hz son solo contexto. Hace falta
la prueba local de Isaac en su PC de juego, autorizada por el orquestador,
con juego sin bordes, monitor VRR, y comparación sin overlays / visibles /
ocultos / restaurados. No se ejecuta remotamente por esta tarea.

## Procedencia de la compilación

Antes de cada build instrumentado fijar `$env:VANTARE_MEASUREMENT_SOURCE_SHA = (git rev-parse HEAD).Trim()` y compilar por `compilar.ps1`. Este valor fuerza reevaluar el build script al reutilizar un target entre worktrees; el helper lo compara con Git y falla si no coincide. No reemplaza el SHA real. Tras compilar, comprobar `--measurement-info` contra el SHA esperado y el estado limpio antes de congelar el ejecutable. La caracterización detectó un binario con capacidades nuevas y metadatos acc6619b1 reutilizados: se rechazó, no es evidencia de rendimiento.

Regresión de caché reproducible: con target D: configurado y fuente limpia, ejecutar `pwsh -NoProfile -File native/scripts/test-measurement-provenance.ps1 -Out D:/VantareServer/evidence/isa-1996/provenance-NEW`. Compila correctamente, exige el fallo con SHA deliberadamente incorrecto sobre el mismo target y restaura la compilación correcta. Conserva los tres logs y ambos metadatos.
