# ISA-186 / ENG-15 — router determinista y diálogo confirmable

## Resultado y límite

ENG-15 convierte el resultado textual validado por `engineer.commands.v1` en
un turno canónico `engineer.dialogue.v1`. Resuelve consultas de solo lectura y
gestiona propuestas mutables mediante `propuesta -> readback -> confirmación ->
resultado`.

Este corte **no** conecta STT, TTS, wake word, micrófono, Pit Manager, Strategy,
LMU ni ningún efecto de producto. Los tests usan un puerto falso. ENG-25/26
deberán aportar puertos seguros e idempotentes antes de ejecutar una acción
real.

## Autoridades

- ENG-12 sigue siendo la única autoridad sobre intents, frases, slots,
  precondiciones y términos de confirmar/cancelar.
- El router posee una copia privada del catálogo y no acepta mutaciones del
  llamador después de construirse.
- Los puertos son la única frontera para obtener datos o proponer una acción.
- El código decide intent, hecho, cifras, prioridad y acción. Ningún LLM forma
  parte de esta ruta.

## Flujo de consulta

1. Se valida contexto, reloj y lifecycle.
2. El harness textual identifica un único intent canónico.
3. `QueryPort.ResolveQuery` recibe intent, slots, precondiciones, lifecycle y
   tiempo del turno.
4. Solo un resultado `fresh`, con evidencia vigente, lifecycle exacto,
   `response_key` esperado y valores acotados, puede salir como respuesta.
5. `missing`, `stale`, error, cancelación o respuesta inválida terminan en
   `unavailable`/`cancelled`, sin valor inventado.

## Flujo de acción

1. Una frase mutable solo llama a `ActionPort.ProposeAction`; proponer no puede
   ejecutar ni reservar un efecto irreversible.
2. La propuesta declara ID opaco, intent exacto y evidencia fresca.
3. El router devuelve una clave de readback y abre una propuesta pendiente con
   deadline acotado por el timeout del diálogo y por la freshness.
4. Solo un término de confirmación del mismo locale puede llegar a
   `ApplyAction`. Cancelar rechaza la propuesta.
5. La acción confirmada conserva proposal ID, intent, slots, precondiciones,
   evidencia, lifecycle y tiempo de confirmación.
6. El puerto de aplicación debe revalidar la evidencia justo antes del efecto.
   `stale`, rechazo, indisponibilidad o resultado inválido fallan cerrados.
7. Una propuesta se consume antes de llamar al puerto; dos confirmaciones
   concurrentes no pueden aplicar dos veces desde el router.

Todo puerto real futuro debe usar `ProposalID` como clave idempotente. Si una
aplicación ya fue confirmada/committed dentro del puerto, este debe devolver el
resultado final aunque el contexto se cancele después: ocultar un commit como
cancelado permitiría un reintento duplicado.

## Lifecycle y cancelación

`DialogueLifecycle` identifica:

- sesión;
- piloto;
- fuente;
- epoch.

Cambiar cualquiera de esos valores cancela la propuesta pendiente. También la
cancelan:

- cambio de locale;
- rollback del reloj;
- timeout o evidencia caducada;
- contexto cancelado;
- dos respuestas de diálogo no comprendidas.

Tras dos fallos consecutivos se devuelve el fallback `ptt_or_ui`; no se intenta
adivinar la orden. ENG-14 podrá usar PTT, pero no cambia este contrato.

## Concurrencia

El router serializa cada conversación con un lock único y pequeño. Esto da una
propiedad simple: un turno termina antes de que el siguiente pueda consumir o
reemplazar su estado. Los puertos deben ser acotados, respetar `context.Context`
y no volver a llamar al mismo router; una implementación reentrante produciría
un bloqueo y viola el contrato. Si un puerto necesita I/O largo, debe resolverlo
fuera de la ruta crítica o con su propio timeout.

Esta decisión evita una máquina distribuida prematura. Puede revisarse con
evidencia de latencia real, manteniendo la exclusión de double-submit y la
idempotencia.

## Datos y privacidad

- `Turn` limita a 16 valores y 256 bytes por valor.
- Slots y valores se copian en cada frontera para evitar mutación compartida.
- Los valores son efímeros y pueden contener datos necesarios para responder,
  como el nombre de un rival. No deben enviarse a logs, Linear, diagnósticos o
  replay sin pasar antes por la sanitización del consumidor.
- El replay versionado de ENG-15 solo contiene fixtures sintéticas sin PII.
- No se persisten transcripciones, nombres, acciones ni estado de diálogo.

## Replay determinista

`RunReplay` procesa una lista acotada de turnos y devuelve un informe canónico.
El golden cubre:

- consulta en español;
- propuesta y confirmación en inglés;
- consulta en italiano;
- unknown en portugués brasileño.

El runner no añade reloj real, aleatoriedad, I/O ni efectos. Sirve como base
para replays de ENG-18/19 sin convertir fixtures en evidencia humana.

## Estados seguros principales

| Condición | Resultado |
|---|---|
| consulta fresca y válida | `query_answered` |
| missing/stale | `unavailable` sin valores |
| frase unknown/ambigua | fail-closed; segundo fallo usa PTT/UI |
| acción reconocida | `action_proposed`, nunca aplicada aún |
| confirmación válida | un único `ApplyAction` |
| cancelación/rechazo | `action_rejected` |
| timeout/cambio de lifecycle/locale | propuesta eliminada |
| evidencia cambia antes de aplicar | `unavailable/evidence_stale` |
| resultado de puerto inválido | `unavailable/invalid_port_result` |

## Pruebas de aceptación

- 14 consultas y 6 acciones en `es`, `en`, `it` y `pt-BR`.
- Unknown y ambigüedad sin tocar puertos.
- Missing/stale/expired/lifecycle incorrecto sin inventar valores.
- Readback y confirmación obligatoria para toda acción.
- Timeout, cancelación, rechazo, cambio de lifecycle/locale y rollback.
- Cancelación de contexto antes y durante puertos de solo lectura/propuesta.
- Evidencia revalidada dentro del puerto justo antes de aplicar.
- Double-submit concurrente con una sola aplicación.
- Valores sobredimensionados rechazados.
- Replay idéntico y golden versionado.

## Lo que sigue NO-GO

- STT productivo y command readiness hasta ENG-13 con corpus humano consentido.
- Wake word hasta FAR/FRR humano.
- Cualquier efecto Pit/Strategy hasta ENG-25/26.
- Cualquier aplicación al juego sin interfaz demostrada, confirmación,
  idempotencia y verificación del resultado.
- Un LLM en intent, números, hechos, confirmaciones o acciones críticas.
