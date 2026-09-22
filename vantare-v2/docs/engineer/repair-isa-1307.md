# Reparación de audio Windows — VAN-739 / GitHub #1307

Estado: candidato implementado; validación posterior en curso.
Tarea: https://app.notion.com/p/3e3e51695c6581faa188fb4a1e8ca5eb
Base: nightly@1101f73579ddaa8798b7d9948bae8b4e2a77d850.
Rama: `vantareapp/isa-1307-audio-event-repair`.

## Ciclo y contrato

1. Plan y comparación con CrewChief predeterminado antes de editar producto.
2. Desarrollo mínimo del player existente y regresiones Windows.
3. Volver a las mismas fuentes, revisar el diff de forma independiente y
   separar la evidencia de eventos del gate de escucha real.

CrewChief fijado: `4c3865e09a347d4c806c0bc0cd66aae335fbc610`, repositorio
primario https://gitlab.com/mr_belowski/CrewChiefV4. No se copia código ni assets.
`Properties/Settings.settings:1004–1006,1523–1525` define `use_naudio=true`
y `naudio_output_interface_listprop=WAVEOUT`. `Audio/NAudioOut.cs:13–18,58–70`
selecciona WaveOut y propaga PlaybackStopped. `Audio/Sounds.cs:2112–2193`
reproduce y espera ese evento; `2207–2214` calcula un timeout con margen,
no una pausa obligatoria. `2227–2231` libera la espera en el callback.

| Caso | Vantare antes | Contrato de reparación |
| --- | --- | --- |
| Medio listo | Espera fija de 200 ms antes de Play | Play al recibir MediaOpened |
| Fin normal | Espera ceil(duración + 0,5 s) | Éxito exclusivamente tras MediaEnded |
| Duración desconocida | Espera 3 s y da éxito | No estima el fin; espera evento o límite |
| Fallo asíncrono | Sin handler de MediaFailed | Error y cierre, sin éxito inventado |
| Sin evento terminal | Puede dar éxito por tiempo | Timeout de 8 s del contexto; nunca éxito |
| Cancelación / Stop | Termina el proceso hijo | Conservar terminación y espera del hijo |

Se mantiene PowerShell/WPF, el formato MP3, la caché y la interfaz Player.
Los handlers deben registrarse antes de Open. Un DispatcherFrame procesa los
eventos en el mismo hilo STA; no usar un bucle de sondeo ni una espera dormida
que impida entregar callbacks. Cerrar en finally incluso ante fallos síncronos.
La salida por cierre del dispatcher sin MediaEnded tampoco es éxito.

Documentación primaria de la API:
[MediaOpened](https://learn.microsoft.com/en-us/dotnet/api/system.windows.media.mediaplayer.mediaopened),
[MediaEnded](https://learn.microsoft.com/en-us/dotnet/api/system.windows.media.mediaplayer.mediaended),
[MediaFailed](https://learn.microsoft.com/en-us/dotnet/api/system.windows.media.mediaplayer.mediafailed),
[Dispatcher.PushFrame](https://learn.microsoft.com/en-us/dotnet/api/system.windows.threading.dispatcher.pushframe).

## Alcance y verificación

Producto: `internal/engineer/audio/player_windows.go`. Pruebas Windows del
script en un proceso PowerShell real, dispatcher WPF real y fuente de eventos
sintética; además fichero inexistente con MediaPlayer real y contexto cancelado.
El doble verifica orden, éxito/error, ausencia de fin por duración y cierre;
no demuestra decodificación, salida de audio ni primer sonido. Sin dependencias.

Focal/race/vet, compilación cruzada Windows y suite global Go aplicable; CI
Windows debe ejecutar las regresiones. Antes de corregir producto se publica
el candidato de pruebas para registrar el fallo real de la base en Windows.
Después se repiten las mismas pruebas y el contraste con la referencia.
Calidad y contrato de roadmap: única entrada `milestones:engineer-radio-spotter`,
en cuatro idiomas, JSON generado desde la base; sin cambios de política.

## Límites

Lanzar PowerShell por clip conserva un coste sin medir. Quitar esperas no
acredita p95 <150 ms ni paridad integral. ACK started sigue ocurriendo antes
de PlayContext y no representa el primer sonido. No se toca esa semántica,
el bus, las familias ni los candidatos Fuel/Timings #1300 y Spotter #1304.
T0–T8 conserva sus gates. No integración ni promoción.

Manual posterior en Windows/LMU: escuchar secuencias de clips cortos y largos,
verificar ausencia de cortes o silencios añadidos, provocar prioridad Spotter
durante Engineer y cancelar/resetear la sesión. Medir desde decisión hasta
primer sonido con una captura real antes de aceptar el objetivo acústico.

## Revisión previa independiente

El reviewer confirma la comparación y el diseño mínimo. Los delegates
PowerShell tienen ámbito local: el resultado debe vivir en un objeto compartido
por referencia. Se fija estado de error inicial, éxito solo en MediaEnded,
handlers antes de Open, STA explícito y cierre en finally.

Se incorpora una corrección del mismo helper de ruta: PowerShell reconoce
comillas simples ASCII y U+2018–U+201B. Deben duplicarse para que rutas como
`d’Angelo.mp3` permanezcan literales; codificar todo el comando no escapa su
contenido. Se verificará el valor recibido, incluidos Unicode y caracteres
con significado en PowerShell. Fuente primaria:
[CharTraits.cs](https://github.com/PowerShell/PowerShell/blob/master/src/System.Management.Automation/engine/parser/CharTraits.cs).

El primer candidato `0d363777` conserva producto idéntico a la base. Las nuevas
pruebas Windows compilan; los 40 paquetes focales macOS y calidad local pasan.
Estos checks locales no ejecutan el script Windows. La prueba previa real se
espera del run 35737417800 de la PR draft1308.

## Fallo previo demostrado en Windows

Run [35737417800](https://github.com/isaacalbala12/Vantare-Simracing-Suite/actions/runs/35737417800),
HEAD `0d3637771ec3531b531c20773deba480bc0c413a`, producto sin modificar.
`TestPlayerRejectsMissingMedia` falla porque el player real informa éxito con
un MP3 inexistente (5,31 s en ese runner; no es una medición de altavoz).
El control de fin normal sintético devuelve error y solo llega a `open`;
las seis secuencias no reciben eventos ni cierran correctamente.
La salida de PowerShell incluye progreso CLIXML en stderr: el test posterior
separa ese canal de la traza, sin eliminar ni ocultar errores del proceso.

## Desarrollo y contraste posterior

Se conserva el player y su contrato Go. El script registra los tres eventos
antes de Open, mantiene resultado compartido por referencia con error por
defecto y bombea DispatcherFrame en STA. MediaOpened llama Play; únicamente
MediaEnded autoriza éxito. MediaFailed, excepciones y cierre inesperado del
Dispatcher fallan. Close se ejecuta en finally. No hay NaturalDuration,
redondeo, duración inventada ni Start-Sleep. El timeout de ocho segundos y
Stop siguen terminando y recogiendo el proceso mediante el contrato existente.

La fuente CrewChief fijada se relee tras el cambio: el criterio de terminación
coincide con una señal de fin, y la espera máxima es solo protección ante
falta de señal. No se equiparan los backends ni sus latencias acústicas.

Las regresiones se endurecen tras la revisión: tipo real del delegate
MediaFailed, scope de setup separado, valor esperado de ruta codificado de
forma independiente y error de Close. El fixture rechaza consultar duración
y el harness rechaza invocar Start-Sleep; eso protege contra las dos esperas
retiradas, no mide un percentil. El script y Dispatcher son reales; la fuente
de eventos es sintética. Otro fixture ejecutable prueba PlayContext real con
cancelación, Stop y timeout mientras el proceso está vivo, verificando que se
recoge y se retira de current. No depende de un dispositivo de audio.

Compilación y vet Windows cruzados PASS. Revisión independiente PASS acotado
sobre 8fe2016e más el ajuste posterior de Stop. Ese test ahora exige retorno
antes de tres segundos y un error de salida del hijo; no puede pasar gracias
al timeout de ocho segundos. El producto no cambió después de esa revisión.

Validación local: 40 paquetes focales PASS; race y vet en audio, service y radio
PASS; gofmt/diff-check, calidad (cero NEW, política intacta), contrato roadmap
vivo y fragmento PASS. Dependencias y assets frontend reutilizados de la misma
base nightly1101; no hay cambios frontend.

La suite global macOS no es verde: 118 paquetes PASS y fallos en ejecutable
Windows, Launcher, Server, Recording SQLite y un fixture voiceinput. Los
primeros cuatro ya estaban reproducidos en la base (registro del corte
anterior sobre el mismo1101). El fallo adicional se investiga y se reproduce
independientemente sobre la base sin modificar: 6 fallos/50, frente a4/50 en
el candidato. El helper escribe JSON y después PASS; la lectura estricta
rechaza ambas líneas cuando llegan juntas. Se registra como pendiente en
Notion y no se relaja el protocolo ni se modifica voz en esta entrega.

El CI Windows requerido, su SHA y el estado operativo final se conservan en
[VAN-739](https://app.notion.com/p/3e3e51695c6581faa188fb4a1e8ca5eb) y la
[PR1308](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1308).
No confundir la compilación cruzada con esos tests ejecutados en Windows.
