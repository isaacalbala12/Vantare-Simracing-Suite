# Reparación de audio Windows — VAN-739 / GitHub #1307

Estado: plan y contraste previo; implementación y evidencia pendientes.
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
reproduce y espera ese evento; `2205–2211` calcula un timeout con margen,
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
