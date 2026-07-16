# TC-01B — Baseline dinámico del runtime actual

## Identidad de la ejecución

- Fecha local: 2026-07-14, Europe/Madrid.
- Rama: vantareapp/isa-24-tc-01b-caracterizacion-dinamica-antes-del-merge.
- Antecedente apilado ISA-23: bb1eeafd1f7dd299fd41387f889a88acce15059e.
- Base funcional refactor: 9712d993fa0099beeaac6616899b30b3c4261bae.
- Donante Engineer: 91cf7e9323bd53edbf1d554d2d32f3f4fd748c82.
- Worktree: C:\Users\isaac\emdash\worktrees\vantare-v2\isa-24-runtime-baseline.
- Binario de diagnóstico: go build -o %TEMP%\vantare-isa24.exe ./cmd/vantare; salida fuera del repositorio.
- Configuración: copia temporal de configs; no se escribieron perfiles ni configuración en el worktree.

No se añadió instrumentación permanente. Las fuentes de evidencia fueron logs existentes, puertos loopback, SSE, estado de procesos y lectura del wiring Wails ya commiteado.

## Resultado comparado

| Observación | LMU apagado | LMU encendido en menú |
|---|---|---|
| Proceso/REST LMU | Sin proceso; puerto 6397 cerrado | Le Mans Ultimate.exe activo; 127.0.0.1:6397 escuchando |
| Source declarada | kind=mock, name=Mock telemetry, live=false, available=true | kind=lmu, name=Le Mans Ultimate, live=true, available=true |
| LMU_Data en logs | 0 attaches exitosos; 1 aviso de indisponibilidad | 1 attach exitoso; 0 avisos de indisponibilidad |
| REST local | standings y sessionInfo rechazaron conexión | sessionInfo: HTTP 200 vacío; standings: EOF |
| SSE telemetría | HTTP 200; datos mock de Spa, TestDriver y 10 vehículos con connected=true | HTTP 200; connected=true, sessionState=menu, 0 vehículos |
| Engineer | enabled=true, connected=true, source=simulator | Permanece en el pipeline simulator separado |
| Cierre | Proceso y puerto cerraron por WM_CLOSE; warning de hotkeys | Mismo resultado y mismo warning |

## LMU apagado

Antes de arrancar Vantare no había proceso LMU ni listener en 6397. El inicio registró:

~~~text
LMU: live source not yet available: open LMU_Data: The system cannot find the file specified. (is Le Mans Ultimate running?) (will retry on read)
live LMU source opened
LMU REST standings error: ... connection actively refused
LMU REST sessionInfo error: ... connection actively refused
telemetry source: kind=mock name=Mock telemetry live=false available=true
~~~

El mensaje “live LMU source opened” describe la creación del wrapper recuperable, no un attach a LMU_Data: no apareció ningún “LMU: live source attached”.

### Wails y SSE

GET /telemetry/stream respondió eventos telemetry a alta frecuencia. El primer payload observado contenía:

- seq=1142;
- snapshot.connected=true;
- circuito Spa;
- piloto TestDriver;
- 10 vehículos;
- sessionEpoch=1;
- sessionState=session.

Esto demuestra que la ausencia de LMU cae en datos ficticios que se presentan como conectados. Es un baseline, no una fuente real observada.

TelemetryBridge emite por Wails telemetry:update usando UpdateWire con seq, snapshot y diff; SSE usa WireFromUpdate, el mismo contrato Go. No existe un observador externo para capturar dinámicamente el evento Wails real sin instrumentación. Se abrió ISA-87 para ese harness; no se implementa en ISA-24.

### Engineer y sintéticos

EngineerService se construye antes del servidor con enabled=true, connected=true, source=simulator y ScenarioLeftBasic. GET /engineer/stream abrió la conexión, pero no entregó bytes durante 3 segundos porque el escenario había terminado antes de la suscripción.

La rama todavía no tiene GET /api/engineer/health; ese endpoint forma parte de la resolución aprobada MC-2 para ISA-25.

## LMU encendido

Se inició la instalación local oficial de Steam, appId 2399420, y se esperó hasta observar proceso y REST. No se inició una sesión de pista; la captura corresponde al menú.

### Source, shared memory y REST

El runtime registró exactamente una vez:

~~~text
LMU: live source attached
telemetry source: kind=lmu name=Le Mans Ultimate live=true available=true
~~~

No apareció un segundo attach. sessionInfo respondió HTTP 200 con cuerpo vacío. Durante aproximadamente 82 segundos se registraron 16 errores “LMU REST standings error: EOF”, separados por el quiet period de unos 5 segundos. El código configura el poll a 250 ms, pero los logs no cuentan cada request.

### SSE live

El primer evento resumido fue:

~~~text
event: telemetry
seq=1256
connected=true
trackName=""
playerName=""
vehicles=0
sessionState=menu
sessionEpoch=1
~~~

No se persistieron bytes raw ni datos personales. El juego estaba en menú.

### Engineer

Encender LMU no cambia el source Engineer. El servicio continúa en simulator y /engineer/stream no emitió un evento dentro de la ventana de 3 segundos. No existe conexión productiva Engineer → LMU en este SHA.

## Lifecycle y shutdown

En ambas ejecuciones:

- el proceso Vantare recibió WM_CLOSE;
- el proceso terminó;
- el puerto HTTP, 39271 o 39272, dejó de escuchar;
- se registró “hotkey: message loop did not stop within 2s; continuing shutdown”;
- WebView2 registró “Failed to unregister class Chrome_WidgetWin_0. Error = 1412”.

Antes del cierre se observaron 23 threads/641 handles con LMU apagado y 22 threads/635 handles con LMU encendido. Al terminar no quedaron puertos ni procesos Vantare, pero la observabilidad actual no permite demostrar que cada goroutine/handle interno cerró limpiamente antes del exit. ISA-87 cubre ese harness.

LMU se cerró mediante su ventana principal al terminar. El proceso y el listener 6397 desaparecieron, restaurando el estado inicial.

## Riesgos y decisiones para los siguientes cortes

- Mock productivo: LMU apagado publica una sesión ficticia como connected=true.
- Engineer sintético: reporta connected=true con source=simulator independientemente de LMU.
- REST en menú: standings devuelve EOF repetidamente.
- Wails no observable externamente: el contrato coincide por código con SSE, pero falta captura dinámica. Seguimiento: ISA-87.
- Shutdown no limpio demostrado: proceso/puerto terminan, pero el loop de hotkeys supera 2 segundos. Seguimiento: ISA-87.
- Sin sesión de pista: posición, rivales, geometría y datos Engineer reales no quedan validados por esta captura de menú.

Ningún hallazgo autoriza a activar un segundo reader, introducir un fallback nuevo ni avanzar el merge de ISA-25.
