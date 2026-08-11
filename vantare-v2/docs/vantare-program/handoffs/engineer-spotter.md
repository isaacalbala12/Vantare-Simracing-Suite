# Handoff vivo — Engineer/Spotter

Estado verificado: 2026-08-12. Este documento conserva solo el presente; Git y
Linear preservan la historia.

## Resultado

Engineer acompaña al piloto en directo y Spotter cubre seguridad, proximidad y
tráfico. Ambos consumen Telemetry Core, funcionan offline y fallan cerrados
ante datos no demostrables. La primera Beta es ES/EN y excluye cambio de piloto.

Vantare replica o mejora capacidades observables de CrewChief con contratos,
contenido y evidencia propios; no copia su arquitectura, código, constantes,
frases, sonidos, assets ni estructura.

## Autoridad

1. `AGENTS.md`, `docs/current-plan.md` y el expediente canónico.
2. Linear para alcance, dependencias, rama y estado.
3. Este handoff y el [router Engineer](../../engineer/README.md).
4. [Plan Spotter](../../engineer/phases/spotter/plan.md),
   [aceptación](../../engineer/phases/spotter/acceptance.md), contratos, código,
   tests y evidencia aplicables.

El [brief clean-room sanitizado](../research/engineer/crewchief-clean-room-brief-2026-08-10.md)
es la única salida competitiva para implementers. Los índices y dossiers de
research quedan fuera de su context pack.

## Estado Git, PR y CI

- Issue activa: ISA-313 / ENG-R01, Fase 5 — arquitectura documental Engineer.
- Rama: `vantareapp/isa-313-eng-r01-reconciliar-nightly-y-replanificar-spotter`.
- Nightly integrada y verificada: `8880a8800e07e2af21fe5ff37a714578bf8fcd00`.
- Base/HEAD local al entrar en Corte B:
  `90a0905e0f7198623c80c2b6f8f3c63945abae82`.
- Cierre remoto auditado en `b2519a25`: PR #196 `OPEN` + `DRAFT`, base
  `nightly`, merge state `CLEAN`; sin merge ni promoción.
- Checks de ese cierre: `Validate promotion path` `SUCCESS`,
  `Validate Vantare blocking gates` `SUCCESS` y GitGuardian `SUCCESS`.
- Cierre funcional documental de Corte B: rango local
  `90a0905e0f7198623c80c2b6f8f3c63945abae82..ebc0dfb533ffcb41b680ad51d1ef79ecac478695`.
- Reviews del cierre funcional: spec `ACCEPT`, quality `READY`, navegación
  fresh `PASS` y Opus `READY`. El finding normativo de S7 y la duplicación de
  evidencia quedaron corregidos en `ebc0dfb`.
- P3 aceptado conscientemente: no se renombra el paquete legacy porque sus
  banners y el router mitigan la colisión; moverlo exige issue y alcance aparte.
- Este commit B solo registra evidencia y estado; su SHA se reporta al cierre y
  no forma parte del rango funcional anterior.
- Nivel real: rama de issue. No está integrada en Nightly, Testers o Master y
  no existe release de este corte.

## Capacidades demostradas

- ENG-01..ENG-12, ENG-14 y ENG-15 están integradas en Nightly.
- Existe la vertical Telemetry Core -> decisión/policy -> presentación ->
  transporte visual, con radio y subtítulos compartidos.
- Existen policy/scheduler deterministas, preempción Spotter, presentación
  multilingüe, PTT y diálogo confirmable sin efectos reales.
- La ruta de audio actual es cache-only y cancelable; el tooling de host de voz
  sigue test-only.

## Pendiente o condicionado

- Audio audible ES/EN distribuible, dispositivo/hot-plug y evidencia humana.
- Núcleo lateral completo, multiclase, lifecycle/FCY/peligros y plausibilidad.
- Paridad LMU extremo a extremo entre decisión, audio y visuales.
- Kokoro legal, empaquetable y perceptualmente aceptado; no hay síntesis en hot
  path ni segundo motor TTS.
- STT/wake word condicionados por corpus y gates humanos.
- Pit Manager con confirmación, ejecución, readback y fallo cerrado.

## Decisiones vigentes

- Arquitectura simple: Telemetría -> estado Spotter -> mensaje -> audio Kokoro
  preparado/cacheado + visual compartido.
- Timings, tempo, cadencia, debounce, clears, cooldowns, audio, dispositivo y
  sincronía visual forman parte de la feature y de su aceptación.
- `WidgetVisualHost` es la única frontera visual compartida.
- Cada subfase se replantea al entrar y amplía la misma aceptación manual + IA.
- Engineer/Spotter se implementa mediante workers subagentes; sus reportes son
  respuestas estructuradas, no documentación nueva.

## Riesgos

- **P0:** Pit Manager no tiene transacción/readback demostrados; permanece sin
  efectos productivos.
- **P1:** enable de Spotter comparte autoridad con runtime; sensibilidad,
  calidad por rival, secuencias, salida `audio-only`, same-side, ghost y
  plausibilidad conservan deudas del baseline.
- **P1:** no existe aceptación LMU real completa ni audio distribuible; ACK o
  replay sintético no demuestran audibilidad.
- **P1:** licencias y cadena G2P/voz/pack pueden impedir distribución Kokoro.
- **P2:** documentación snapshot conserva estados antiguos; los banners y el
  router evitan usarla como estado operativo.
- **P3:** parámetros y tests heredados necesitan rederivación clean-room al
  tocar su subfase.

## Issues y bloqueos

- Isaac aceptó humanamente ISA-313 Fase 5 el 2026-08-12. La aceptación no cambia
  producto ni inicia S1; S1 no ha comenzado.
- ISA-187 / ENG-16 e ISA-189 / ENG-18 siguen en Backlog y bloqueadas por
  ISA-313; no equivalen todavía a la issue ejecutable de S1.
- ISA-314 conserva separado el bug de promesa falsa de guardado.
- Las issues de voz, Pit, Strategy y gate Beta mantienen sus dependencias; este
  corte no las mueve ni declara GO.

## Siguiente acción

Asignar o crear la issue y rama propias de S1, verificar la Nightly vigente y
replanificar S1 concretamente desde
[plan.md](../../engineer/phases/spotter/plan.md) y
[acceptance.md](../../engineer/phases/spotter/acceptance.md) antes de editar
runtime. No iniciar S2 ni fases posteriores por anticipado.
