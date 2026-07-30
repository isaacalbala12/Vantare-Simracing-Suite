# Arquitectura y contratos propuestos

Estado: **Proposed; requiere review técnico y ADR antes de implementar**. La
ejecución posterior continúa por ramas de issue; este documento no autoriza
promoción a `nightly`.

## Flujo

```text
Telemetry Core
  └─ EngineerProjection + CapabilityManifest
       ├─ reglas puras Spotter/Engineer/Pit/Voice
       └─ CandidateMessage / CandidateIntent
            └─ Policy: freshness + validity + TTL + cooldown + dedupe
                 └─ Scheduler de dos carriles, acotado
                      └─ AudioOwner cancelable
                           ├─ dispositivo
                           ├─ evento playback.started / ended
                           └─ Radio Crystal + subtítulos + historial
```

Ningún renderer, overlay o comando lee persistencia, Wails/SSE, LMU, permisos o
posición directamente. Recibe ViewModels puros.

## EngineerProjection

Una snapshot no basta para todo. La proyección expone:

- **latest-wins** para estado actual;
- hechos ordenados con `epoch`, `sequence`, `eventTime` y `observedAt`;
- `CapabilityManifest` por señal/operación;
- presencia separada del valor;
- edad/frescura calculada contra reloj monotónico;
- procedencia y versión de esquema;
- identidad de sesión/run/piloto/coche.

Reglas:

1. Un cero legítimo conserva `present=true`.
2. Ausencia, unsupported y stale son estados distintos.
3. Un cambio de identidad abre nuevo epoch y cancela estado derivado anterior.
4. Deltas/gaps no se inventan si Core no los entrega o no puede derivarlos con
   unidades y reloj demostrados.
5. El consumidor no accede al driver LMU ni reinterpreta buffers.

## Envelope de mensaje

```text
Message {
  id, decisionId, epoch, sequence
  eventTime, decidedAt, deadline
  role, priority, interruptPolicy
  cooldownKey, dedupeKey
  requiredSignalVersions, validityPredicate
  payloadType, payload
  templateId, locale, voiceProfile
}
```

Estados:

```text
candidate -> eligible -> queued -> started -> completed
                   \-> suppressed | expired | cancelled | failed
```

El subtítulo se publica en `started`, no en `queued`. El historial guarda el
resultado y la razón de supresión/cancelación, nunca audio del micrófono.

## Prioridad y supresión

| Prioridad | Ejemplos | Política |
|---|---|---|
| P0 Danger/Spotter | coche lateral, peligro inmediato | preempt; nunca espera a TTS; cancela cualquier carril inferior |
| P1 Critical | bandera, daño crítico, combustible cero, pit/voice confirm | puede interrumpir P2/P3; TTL corto y validez al dequeue |
| P2 Engineer | combustible, neumáticos, rival, stint | espera ventana segura; se suprime si pierde utilidad |
| P3 Advisory | rendimiento, motivación | primero en descartarse; nunca retrasa carrera |

El scheduler es acotado y no crea una goroutine por mensaje. Revalida al
encolar, antes de iniciar y durante interrupciones. Combina dedupe, cooldown y
coalescing por dominio. Si Core queda stale/desconectado, cancela mensajes
Engineer y deja de generar hechos; un diagnóstico de conexión puede mostrarse
fuera de una situación crítica.

## Presupuesto de latencia

Objetivo contractual: p95 menor de 150 ms desde decisión estable hasta inicio
real de audio P0.

Presupuesto inicial para diseñar y medir, no resultado observado:

| Tramo | Presupuesto |
|---|---:|
| regla/decisión | 30 ms |
| policy/scheduler | 10 ms |
| audio crítico ya preparado | 60 ms |
| dispositivo→callback de inicio | 50 ms |

La métrica termina en callback real del dispositivo, no al llamar `Play`.
Registrar histograma por idioma/dispositivo, reconexiones, underruns,
preempciones y deadlines fallidos. El gate solo pasa con sesiones y hardware
objetivo; el presupuesto puede redistribuirse, pero no el total.

## Audio

- Un único `AudioOwner` serializa reproducción y controla cancelación.
- P0 usa un banco Vantare pre-renderizado y precargado por idioma/voz.
- TTS dinámico solo prepara P2/P3 o respuestas no críticas; nunca bloquea P0.
- Al cambiar dispositivo, el owner invalida handles, cancela de forma
  observable y recupera sin duplicar audio.
- La UI consume `playback.started/ended/cancelled`.
- Un fallo de TTS no degrada a texto inventado ni a cloud.

## PTT, STT y wake word

```text
input edge -> debounce -> capture volatile -> VAD -> STT local
           -> exact localized intent -> policy -> response/action
```

- Entradas: teclado, wheel, gamepad, button box y HID mediante el contrato común.
- No se guarda audio. Solo buffer circular volátil mínimo para la activación.
- Los intents son enums tipados con slots permitidos; no prefix matching libre.
- Las frases y traducciones son propiedad de Vantare.
- Una acción sensible requiere confirmación explícita y contexto fresco.

Wake:

1. modelo KWS autorizado para el idioma;
2. VAD y confirmación STT de la palabra exacta
   Ingeniero/Engineer/Ingegnere/Engenheiro;
3. debounce, hysteresis y refractory period;
4. feedback visible/sonoro no ambiguo;
5. tras activaciones fallidas repetidas, ofrecer PTT, no ampliar umbrales
   silenciosamente.

Los gates por idioma incluyen FAR/hora, FRR, ruido de cockpit, voz cercana,
altavoces reproduciendo radio, acentos objetivo y recuperación. Los umbrales se
fijarán antes de implementar cuando exista un corpus propio autorizado.

## Pit Manager

```text
Draft
  -> Explained
  -> AwaitingConfirmation
  -> Confirmed
  -> SendingOnce
  -> Verifying
  -> Applied
          \-> FailedClosed
```

Contrato de transacción:

- ligado a session/run/driver/car/epoch;
- nonce e idempotency key;
- estado deseado y estado observado esperado;
- lista de capabilities requeridas;
- TTL y deadline;
- resumen humano exacto en idioma;
- confirmación PTT/UI explícita;
- una sola escritura;
- readback hasta deadline;
- `Applied` solo si coincide;
- cambio de epoch, stale, mismatch, timeout, unsupported o error → `FailedClosed`;
- abortar obliga a preparar otra transacción.

Dry-run es `Simulated`, nunca `Applied`. La URL, redirects, loopback, deadlines y
versiones de API se validan antes de habilitar escritura.

## Estrategia

Engineer puede proponer un cambio acompañado de evidencia y supuestos.
Strategy Planner no modifica la estrategia hasta recibir aceptación explícita.
Aceptar una estrategia no confirma automáticamente una escritura de pit: son
dos decisiones distintas y auditables.

## Personalidad y localización

Professional, Cercano, Exigente y Custom pueden variar:

- plantilla, voz, prosodia y frecuencia dentro de límites;
- longitud de explicaciones no críticas;
- saludo o motivación.

No pueden variar hechos, prioridad, seguridad, TTL, validez, confirmaciones ni
acciones. Custom es declarativo y acotado. No se usan mensajes aleatorios en la
ruta crítica.

## Contrato de UI

La página Engineer muestra:

- conexión real, fuente, edad y capacidades;
- PTT/wake/audio device e idioma;
- carriles y último resultado de policy;
- timeline sanitizada;
- diagnóstico exportable sin secretos ni audio.

Radio Crystal es compacto: prioridad/color, speaker, subtítulo exacto, fuente y
frescura, estado PTT/wake. Todo escenario sintético debe llevar la etiqueta
persistente `REFERENCE SCENARIO`; nunca usa el badge «Connected».
