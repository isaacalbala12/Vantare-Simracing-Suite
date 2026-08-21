# ISA-719 / F5 — carril experimental de voz de entrada

Fecha del corte: 2026-08-21. Destino: PR draft a `nightly`; nunca release.

## Resultado honesto

F5 deja el carril completo detrás de `-engineer-voice-input`, desactivado por
defecto y compuesto antes de `EngineerService.Start`. El contrato, PTT real,
ventana máxima, proceso hijo, router, salida `radio.v1`, health y teardown son
ejecutables con motores inyectables y tienen regresiones normales y `-race`.

El backend real **no está operativo en este equipo ni se incluye en el
binario**: no existe aquí un capturador WASAPI aprobado y tampoco están
instalados `whisper-server.exe` ni el modelo Whisper fijado. El hijo que se
distribuye en este corte responde readiness con `available:false`, termina y
el padre publica `voiceInput.state=unavailable`. No escucha el micrófono, no
transcribe y no finge una capability.

Por tanto:

- corre de verdad: flag/default OFF, composición pre-Start, PTT Windows F24,
  protocolo/ownership PID+nonce sobre pipes privados, prioridad baja del hijo,
  límite de captura de 5 s, cancelación, join/kill acotado, router determinista
  query-only, presentación registrable y health agregado;
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

Cada petición es serial, acotada a 64 KiB y ligada al nonce. Ante timeout,
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
5 s. Hotplug, pérdida de foco, cancelación y shutdown conservan la semántica
fail-closed de `engineer.ptt.v1`.

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
cache-only. Spotter P0 puede cancelarlos; Spotter, familias, radio e ingesta no
esperan nunca al host de voz.

## Privacidad y health

Audio, transcripción y estado de diálogo son memoria-only. No se escriben a
disco, no se incluyen en logs y no aparecen en health. `/api/engineer/health`
añade únicamente:

- `experimental`, `enabled` y estado agregado `disabled`, `unavailable`,
  `idle`, `capturing`, `transcribing` o `error`;
- contadores de capturas PTT/wake, transcripciones, consultas, acciones
  rechazadas y errores.

El flag no habilita recording ni diagnóstico de texto. La política dura es
cero archivos de audio y cero transcripciones persistidas.

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
quedar proceso hijo. Sin el flag debe mostrar `state=disabled` y no arrancar
ningún helper.
