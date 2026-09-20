# ADR 0010 — Engineer: diálogo cloud con autoridad determinista y paridad offline

## Estado y alcance

Decisión de diseño aprobada para el programa de paridad Engineer LMU;
precisión contractual incorporada tras revisión adversarial el 2026-09-20.
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
3. El LLM propone un plan de enunciado con variación natural. La realización
   usa una gramática propia por locale con slots vinculados a hechos; un
   validador determinista reconstruye el texto y rechaza semántica añadida,
   omitida o invertida. Texto libre no verificable nunca sale a TTS/widget;
   se sustituye por composición canónica. Un segundo LLM no es juez de hechos.
4. Spotter, banderas y alarmas críticas usan el carril local. El resto puede
   preparar voz dinámica fuera del turno de radio; P0 conserva preempción.
   Un solo JobID/revisión puede ganar entre online y fallback. Deadlines,
   límites, cancelación y revalidación al comenzar audio rigen ambos caminos.
5. No existe LLM local. Offline conserva todas las capacidades semánticas
   mediante STT local, router con formas canónicas y PhrasePack completo en
   es/en/it/pt-BR. Pierde variedad de interpretación/redacción, no consultas,
   cifras, identidad inequívoca ni controles. Sin modelo/pack real no hay
   PASS offline, aunque siga disponible una degradación visual.
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
   No se admite entrenamiento ni retención remota fuera del procesamiento
   efímero; SDK/trazas/cachés no pueden persistir contenido de sesión. Se preserva
   el [contrato de privacidad de producto](../vantare-program/product-contract.md).

Los presupuestos aprobados permanecen: feedback máximo 150 ms, objetivo
interactivo 1,5 s, timeout generativo interactivo 2,5 s y automático 750 ms.
Su alcance y medición están en §6.6 de la spec; un timeout no es un PASS del
objetivo. Replay determinista y evidencia audible/LMU siguen separados.

## Relación con contratos anteriores

- [Rework](../engineer/rework-spec.md): quedan sustituidos para este programa
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

La solución requiere packs instalables, herramientas y realización semántica
versionadas, lifecycle de trabajos y gates negativos de proveedor. Se crea
esa infraestructura dentro de Timings, con conducta verificable, sin abrir
una plataforma previa. La selección concreta de proveedor/modelo necesita
demostrar los contratos; no cambia la autoridad del dominio ni el perímetro.

## Verificación

La spec §6–§9 exige pruebas de inversión/omisión semántica, prompt injection,
tool calls inválidos, cold start offline, cuatro locales, readback interrumpido,
double-submit/commit perdido, callbacks tardíos, saturación, P0, cancelación,
Stop sin residuos y ausencia de PII/envíos sin activación. Cada resultado se
vincula a SHA/configuración/modelo/pack y se invalida cuando éstos cambian.
