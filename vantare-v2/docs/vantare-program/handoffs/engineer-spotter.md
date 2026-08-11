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

- Issue activa: ISA-327 / ENG-S1 — replanning técnico de S1 Spotter
  (autoridades y baseline confiable). In Progress en Linear.
- Rama de ISA-327:
  `vantareapp/isa-327-eng-s1-spotter-autoridades-y-baseline-confiable`.
- Base apilada de este corte: productiva `origin/nightly@8880a8800e07e2af21fe5ff37a714578bf8fcd00`
  y padre documental ISA-313 `7ac6b4b9a5adf964fdb14d5e6d80ffa90a548eca`.
- Nivel real: rama de issue. No hay push, PR, CI ni integración en Nightly,
  Testers o Master; no existe release de este corte. El corte documental se
  apila sobre el cierre ISA-313 sin fingir promoción.
- Cierre remoto previo auditado en `b2519a25`: PR #196 `OPEN` + `DRAFT`, base
  `nightly`, merge state `CLEAN`; sin merge ni promoción. Checks de ese cierre:
  `Validate promotion path` `SUCCESS`, `Validate Vantare blocking gates`
  `SUCCESS` y GitGuardian `SUCCESS`.
- Cierre funcional documental de Corte B ISA-313: rango local
  `90a0905e0f7198623c80c2b6f8f3c63945abae82..ebc0dfb533ffcb41b680ad51d1ef79ecac478695`.
  Reviews del cierre funcional: spec `ACCEPT`, quality `READY`, navegación
  fresh `PASS` y Opus `READY`. El finding normativo de S7 y la duplicación de
  evidencia quedaron corregidos en `ebc0dfb`.
- P3 aceptado conscientemente: no se renombra el paquete legacy porque sus
  banners y el router mitigan la colisión; moverlo exige issue y alcance aparte.
- Este commit B solo registra evidencia y estado; su SHA se reporta al cierre y
  no forma parte del rango funcional anterior.

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
- ISA-327 replanifica S1 en tres cortes secuenciales A/B/C (máquina, entrada,
  salida/aceptación) dentro del [plan Spotter](../../engineer/phases/spotter/plan.md).
  No se negocian los invariantes objetivo que S1 debe cumplir (reset solo
  Spotter, cancelación por familia, sensibilidad única, service/oracle
  coherentes, filtro solo Spotter, audio-only no-success con reason, test
  acumulativo sobre EngineerService); hoy no se cumplen (cancelación global y
  sensibilidad Normal hardcodeada) y S1 los hace cumplir.

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
  producto ni inicia S1.
- ISA-327 está `In Progress` y replanifica S1 (cortes A/B/C). La implementación
  no ha comenzado hasta aprobar su microplan.
- ISA-187 / ENG-16 e ISA-189 / ENG-18 siguen en Backlog y bloqueadas por
  ISA-313; S4/ISA-187, S2/ISA-189 e ISA-314 quedan diferidos expresamente hasta
  cerrar S1.
- ISA-314 conserva separado el bug de promesa falsa de guardado.
- Las issues de voz, Pit, Strategy y gate Beta mantienen sus dependencias; este
  corte no las mueve ni declara GO.

## Siguiente acción

Aprobar el [microplan de S1](../../engineer/phases/spotter/plan.md) (cortes
A/B/C). Solo entonces un worker subagente inicia el corte A sobre la Nightly
vigente verificada. No iniciar S2 ni fases posteriores por anticipado.
