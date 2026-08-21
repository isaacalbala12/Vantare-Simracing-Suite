# ISA-719 / F5 — carril experimental de voz de entrada

Fecha del corte: 2026-08-21. Destino: PR draft a `nightly`; nunca release.

## Resultado honesto

F5 deja el carril completo detrás de `-engineer-voice-input`, desactivado por
defecto. Solo con el flag se compone antes de `EngineerService.Start`; OFF no
construye reader, host, router, catálogo ni detector y health omite la sección.
El contrato, PTT real,
ventana máxima, proceso hijo, router, salida `radio.v1`, health y teardown son
ejecutables con motores inyectables y tienen regresiones normales y `-race`.

El backend real **no está operativo en este equipo ni se incluye en el
binario**: no existe aquí un capturador WASAPI aprobado y tampoco están
instalados `whisper-server.exe` ni el modelo Whisper fijado. El hijo que se
distribuye en este corte responde readiness con `available:false`, termina y
el padre publica `voiceInput.state=unavailable`. El poller del reader Windows
sí arranca y sigue sondeando F24 sin esperar al helper; como no hay capturador,
una pulsación falla cerrada y no abre audio. No escucha el micrófono, no
transcribe y no finge una capability. La prueba automática demuestra la
composición y el polling, no una pulsación física en este equipo.

Por tanto:

- corre de verdad: flag/default OFF sin superficie residual; composición ON
  pre-Start; reader Windows F24 sondeado aunque el host esté unavailable;
  detector de conflictos contra hotkeys configuradas; protocolo/ownership
  PID+nonce sobre pipes privados; prioridad baja, readiness/teardown acotados,
  límite de captura de 5 s, deadline STT, router determinista query-only,
  presentación registrable con payload cerrado por intent y health agregado;
- queda demostrado con fakes: captura PTT y wake, transcripción efímera,
  consulta fresca, rechazo de acción y entrega visual por el radio bus;
- queda pendiente: backend hijo WASAPI, integración de `whisper.cpp`/modelo
  verificados, `QueryPort` canónico para las 14 consultas y detector acústico
  entrenado. Hasta entonces el runtime real falla cerrado como unavailable.

## Diseño del proceso hijo

`ProcessHost` es la única autoridad del helper. Genera un nonce aleatorio de
128 bits, arranca el mismo ejecutable en modo hijo oculto y de prioridad
`BELOW_NORMAL_PRIORITY_CLASS`, y verifica protocolo, PID exacto, nonce y
capability en una readiness JSON acotada. La comunicación usa stdin/stdout
heredados, no abre puerto ni acepta clientes externos. Las operaciones
versionadas son `begin`, `finish`, `cancel` y `shutdown`.

Cada petición es serial, acotada a 64 KiB y ligada al nonce. Readiness tiene
un deadline propio de 3 s; `Finish`/STT, uno de 10 s como máximo. El arranque
del host ocurre en una goroutine poseída por el runtime: el poller PTT y el
resto de la app arrancan sin esperarlo. Ante timeout,
salida inválida, PID/nonce incorrecto o capability ausente, el padre cierra
pipes, termina/recolecta el hijo y elimina el nonce. Shutdown cancela primero
el runtime, detiene el host y une poller/procesamiento; un hijo que no coopera
recibe kill acotado. El test de subprocess comprueba que no queda ownership
después de `Stop`.

El backend futuro debe implementar WASAPI y Whisper dentro de ese hijo. PCM y
texto no pueden volver al padre salvo el texto final de una ventana cerrada;
no puede crear WAV, temporales, recording, logs de audio ni logs de texto.

## PTT, wake y diálogo

El flag usa los readers productivos de `internal/engineer/ptt`. La binding
experimental inicial es teclado global `keyboard-0` / `f24`: press ejecuta
`Begin`, release ejecuta `Finish`, y un timer cierra cualquier ventana a los
5 s. Antes de construir reader/host se compara F24 mediante
`ptt.FindBindingConflicts` con hotkeys globales y de perfiles cargadas; un
conflicto deja el carril `unavailable` y genera diagnóstico agregado/log sin
crear esos recursos. El timeout inyecta la misma transición release hacia
`processing`, de modo que una liberación física posterior no puede dejar el
controller ocupado. Hotplug, pérdida de foco, cancelación y shutdown conservan
la semántica fail-closed de `engineer.ptt.v1`.

El placeholder `KeywordDetector` solo reconoce de forma exacta y normalizada
`Ingeniero`, `Engineer`, `Ingegnere` y `Engenheiro` en eventos sintéticos del
host fake. **No es un detector acústico**, no se ejecuta sobre micrófono real y
no aporta FAR/FRR. Sustituirlo exige modelo permisivo entrenado y gate humano.

El texto efímero entra en `engineer.dialogue.v1`. Las consultas usan un
`QueryPort` inyectable y solo un resultado fresh puede publicarse. El
`ActionPort` de F5 devuelve siempre `ErrActionsDisabled`; el router sí reconoce
la intención, pero no propone ni aplica efectos. El resultado del router —no
la transcripción— se transforma en uno de tres intents registrables:

- `voice.query_answered`;
- `voice.unavailable`;
- `voice.action_disabled`.

Los tres atraviesan el `radio.v1` compartido con prioridad P2, UI y audio
cache-only. La frontera de publicación tiene una allowlist de claves por cada
intent de consulta y descarta toda clave no declarada; en particular nunca
reenvía slots pronunciados como `driver_name`, `car_number` o `target`.
Spotter P0 puede cancelarlos; Spotter, familias, radio e ingesta no esperan
nunca al host de voz.

## Privacidad y health

Audio, transcripción y estado de diálogo son memoria-only. No se escriben a
disco, no se incluyen en logs y no aparecen en health. Con el flag ON,
`/api/engineer/health` añade únicamente:

- `experimental`, `enabled` y estado agregado `unavailable`, `idle`,
  `capturing`, `transcribing` o `error`;
- contadores de capturas PTT/wake, transcripciones, consultas, acciones
  rechazadas y errores.

El flag no habilita recording ni diagnóstico de texto. La política dura es
cero archivos de audio y cero transcripciones persistidas.

El proceso minimiza la retención y pone a cero los buffers mutables de
protocolo y transcripción al terminar cada uso; el backend WASAPI futuro deberá
hacer lo mismo con todos sus buffers PCM. Esto reduce exposición ordinaria,
pero no constituye una garantía frente a un volcado completo del proceso:
Windows Error Reporting/LocalDumps, un depurador o un dump configurado por el
usuario operan fuera del control de Vantare y pueden capturar memoria antes del
borrado. Las copias internas inmutables que pueda crear el runtime de Go
tampoco permiten prometer un borrado físico verificable. El contrato
memory-only significa que Vantare no persiste, registra ni transmite ese
contenido fuera de la ruta efímera; no afirma poder impedir dumps del sistema.

## Gate pendiente y NO-GO

ENG-13 sigue **NO-GO**. F5 no autoriza beta pública, testers ni release de voz
de entrada. Para sustituir los fakes hacen falta, como mínimo:

1. backend WASAPI memoria-only con prueba física y teardown repetido;
2. artefactos Whisper verificados y empaquetados, sin descarga silenciosa;
3. `QueryPort` canónico fresh por intent, sin segunda lectura LMU;
4. wake word acústico permisivo entrenado con corpus sintético trazable;
5. FAR/FRR e intent accuracy humanos por locale, micrófono y ruido LMU;
6. soak Wails/LMU demostrando que Spotter/radio no degradan.

Hasta cerrar esos puntos, este carril sirve únicamente para desarrollar y
probar la integración en una rama/nightly autorizada.

## Verificación

```powershell
go test ./internal/engineer/voiceinput ./internal/engineer/service -count=1
go test -race ./internal/engineer/voiceinput ./internal/engineer/service -count=1
go vet ./internal/engineer/voiceinput ./internal/engineer/service
```

Con el binario actual, arrancar con `-engineer-voice-input` debe dejar
`voiceInput.experimental=true`, `enabled=true` y `state=unavailable`; no debe
quedar proceso hijo, pero el reader F24 permanece sondeado. Sin el flag, health
no debe contener `voiceInput` y no deben construirse reader, helper, router,
catálogo ni detector.
