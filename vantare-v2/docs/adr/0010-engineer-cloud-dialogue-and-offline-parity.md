# ADR 0010 — Engineer: diálogo cloud con autoridad determinista y paridad offline

## Estado y alcance

Propuesto; precisión contractual pendiente de aprobación de Isaac.
Revisado el 2026-09-20. Las decisiones base acordadas se enumeran en §0 de la
spec: este ADR no atribuye aprobación a los mecanismos añadidos en revisión.
No acredita implementación, proveedor operativo, gate humano, promoción ni
publicación. La [spec normativa](../specs/2026-09-19-crewchief-lmu-parity-design.md)
define conductas, límites, pruebas y cierre por feature, empezando por Timings.

## Contexto

El rework de agosto autorizó una base simple con audio precacheado y sin
paridad completa. ENG-15 aportó diálogo determinista confirmable mediante
puertos seguros. La nueva experiencia exige equivalencia observable con
CrewChief para LMU, comprensión de lenguaje libre y variación natural online,
con funcionalidad offline y un carril crítico que nunca espera a la nube.

La diferencia entre esas decisiones debe quedar explícita: un modelo que
interpreta una pregunta no adquiere por ello autoridad sobre telemetría,
hechos o acciones. Tampoco la existencia de interfaces/fakes demuestra voz
real ni permite superar gates humanos.

## Decisión

1. Telemetry Core y su proyección son la única fuente de hechos de carrera.
   El código propio fija relaciones, cifras, calidad, freshness, prioridad,
   silencios, capacidades y acciones permitidas. No se crea otro reader LMU.
2. STT local entrega texto efímero. El LLM cloud propone herramientas tipadas
   autorizadas por turno; un dispatcher determinista valida esquema, slots,
   precondiciones, lifecycle y permisos. El modelo no accede a Core, stores,
   SQL, archivos ni red arbitraria mediante herramientas.
3. El código crea un FactBundle inmutable con cláusulas factuales completas,
   orden parcial permitido, IDs y hash. El LLM organiza la respuesta útil con
   introducciones, transiciones y contextualización de vocabulario abierto;
   no elige una lista/gramática de variantes ni se limita a una coletilla
   social. Puede ordenar bloques independientes autorizados, sin alterar ni
   parafrasear sus hechos. El ensamblador valida referencias/orden e inserta
   las cláusulas canónicas completas entre los segmentos admitidos. Esquema,
   vínculo con revisión y hechos/efectos se validan determinísticamente; la
   admisión semántica del discurso es un filtro falible, nunca prueba universal de
   ausencia de afirmaciones o implicaturas impropias. §6.2.1 fija límites,
   prohibiciones, corpus, métricas, invalidación y riesgo residual que debe
   aceptarse explícitamente antes del gate online. Rechazo, incertidumbre o
   timeout retiran el discurso y conservan la respuesta en orden canónico.
   Ni un segundo modelo ni el discurso adquieren autoridad de hechos o acciones.
4. Spotter, banderas y alarmas críticas usan el carril local. El resto puede
   preparar voz dinámica fuera del turno de radio; P0 conserva preempción.
   Si P0 ya ocupa el único slot, no se interrumpe, atenúa ni mezcla: la recepción
   se confirma visualmente en <=150 ms y emite un único ACK audible en la primera
   oportunidad posterior, tras revalidar el turno. Esa demora se registra como
   `blocked_by_p0` en una cohorte separada; no pausa deadlines ni autoriza audio
   obsoleto. Esta resolución de `DEC-FEEDBACK-P0-001` fue acordada por Isaac el
   2026-09-20.
   Un solo ganador vigente entre online y fallback y un terminal por JobID.
   Recomponer crea revisión/hash nuevos sin renovar el job ni sus deadlines;
   invalida plan, discurso y audio anteriores y sólo compone pendientes locales.
   Cada bloque factual se revalida antes de oírse; started de la introducción
   no autoriza una respuesta completa stale. Entregas parciales no se repiten
   ni habilitan readback. Límites, cancelación y P0 rigen ambos caminos.
5. No existe LLM local. Offline conserva todas las capacidades semánticas
   mediante STT local, router con formas canónicas y PhrasePack completo en
   es/en/it/pt-BR. Pierde variedad de interpretación/redacción, no consultas,
   cifras, identidad inequívoca ni controles. Nombre literal e identidad
   funcional no son automáticamente equivalentes: ambos modos comparten
   fragmentos propios locales; DEV-NAME-001 registra una eventual sustitución
   de nombre por posición/dorsal como desviación pendiente, no paridad. Sin
   cobertura literal demostrada o desviación aprobada no se cierra ese caso.
   Sin modelo/pack real no hay PASS offline, aunque siga la salida visual.
6. ENG-15 conserva la autoridad sobre propuestas, readback, confirmación,
   evidencia, lifecycle, cancelación e idempotencia. El readback obligatorio
   es canónico y debe entregarse antes de habilitar confirmación de esa
   ProposalID/revisión. Sólo entrada nueva del piloto puede confirmar;
   ningún tool call puede hacerlo. El puerto revalida antes del efecto,
   reconcilia commits con respuesta perdida y verifica estado final antes
   de anunciar éxito. Puertos reales no demostrados siguen disabled.
7. La activación cloud explícita por sesión muestra proveedor y datos; sin
   ella se usa offline. Se envían sólo texto sanitizado y hechos mínimos,
   sin audio, nombres personales, telemetría cruda, rutas o credenciales.
   Los nombres audibles se componen con fragmentos locales y no se suprimen
   silenciosamente para conceder paridad; rige DEV-NAME-001 de la spec.
   No se admite entrenamiento ni retención remota fuera del procesamiento
   efímero; SDK/trazas/cachés no pueden persistir contenido de sesión. Se preserva
   el [contrato de privacidad de producto](../vantare-program/product-contract.md).

Los presupuestos aprobados permanecen: feedback máximo 150 ms, objetivo
interactivo 1,5 s, timeout generativo interactivo 2,5 s y automático 750 ms.
Su alcance y medición están en §6.6 de la spec; un timeout no es un PASS del
objetivo. Replay determinista y evidencia audible/LMU siguen separados.
DEC-FEEDBACK-P0-001 preserva el feedback audible <=150 ms cuando el carril está
libre y, bajo P0, exige ACK visual <=150 ms más audio en la primera oportunidad.
La cohorte `blocked_by_p0` demuestra por separado no solapamiento, vigencia y
entrega sin convertir la contención crítica en un fallo ordinario del SLO.

## Precedencia propuesta y garantías conservadas

La dirección de producto y la frontera cloud se apoyan en las decisiones base
acordadas. Las precisiones de este ADR y sus gates siguen propuestas; su
aprobación no puede inferirse de los avisos de supersesión ni de un commit.

- [Rework](../engineer/rework-spec.md): la supersesión propuesta comprende
  el objetivo sin paridad, la regla de un archivo por familia y la exclusión
  de TTS dinámico/nombres. Se conserva el bus único, ACK, TTL, P0, proyección
  canónica y lo ya demostrado. Kokoro dinámico no queda aprobado por este ADR.
- [ENG-15](../engineer/dialogue-router-isa-186.md): se amplía la frontera de
  interpretación con propuestas cloud validadas; no se reemplaza su router
  seguro ni se relajan confirmación, evidencia o idempotencia. Se añade el
  vínculo con entrega efectiva del readback. El contrato textual histórico
  no demuestra por sí solo ese nuevo vínculo audible.
- [Roadmap histórico](../engineer/engineer-beta-roadmap.md): no gobierna el
  nuevo orden de cierre. Sus gates humanos aún pendientes de STT, command
  readiness, wake FAR/FRR, percepción y acciones reales continúan vigentes.

## Alternativas y consecuencias

Dar al LLM telemetría cruda o permitir que texto libre determine efectos no
permite demostrar los invariantes y se descarta. Limitar toda interacción a
frases exactas preserva offline, pero no satisface la comprensión online
aprobada; se mantiene sólo como camino de recuperación funcional.

Restringir el LLM a escoger variantes finitas tampoco cumple la decisión de
generar formulaciones abiertas. La separación factual/discursiva permite esa
variación sin ceder autoridad; no promete que un filtro de lenguaje arbitrario
sea infalible. El modo canónico es recuperación, no sustituto del gate online.

La solución requiere packs instalables, herramientas y ensamblado versionados,
lifecycle de trabajos y gates negativos de proveedor. Se crea esa
infraestructura dentro de Timings, con conducta verificable, sin abrir
una plataforma previa. La selección concreta de proveedor/modelo necesita
demostrar los contratos; no cambia la autoridad del dominio ni el perímetro.

## Verificación

La spec §6–§9 exige hechos canónicos inmutables, discurso abierto no enumerado,
evaluación explícita de fallos de su filtro, identidad literal frente a
funcional, pruebas de inversión/omisión semántica, prompt injection,
tool calls inválidos, cold start offline, cuatro locales, readback interrumpido,
double-submit/commit perdido, callbacks tardíos, saturación, P0, cancelación,
Stop sin residuos y ausencia de PII/envíos sin activación. Cada resultado se
vincula a SHA/configuración/modelo/pack y se invalida cuando éstos cambian.
