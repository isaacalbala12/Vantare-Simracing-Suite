# Engineer Beta — roadmap canónico ENG-12 a ENG-29

## Estado y autoridad

- Fecha: 2026-08-10; reconciliado por ISA-313 / ENG-R01.
- Base de ejecución: `origin/nightly@7e39104a7e876b4c396a41403023ba6030b88a08`.
- ENG-01..ENG-12, ENG-14 y ENG-15 ya están integrados en Nightly mediante
  PR #96. Las referencias posteriores a ENG-12 como primer corte son historia.
- Proyecto Linear: `Engineer & Spotter — LMU Race Companion`.
- Parent: ISA-123 / ENG-01.
- Este documento y `docs/vantare-program/handoffs/engineer-spotter.md`
  gobiernan el trabajo restante.
- ISA-313 solo planifica. No implementa producto, no promociona y no cambia
  ningún gate técnico o humano a GO.

## Resultado de producto

Engineer Beta acompaña al piloto en directo. Spotter se limita a seguridad,
proximidad y tráfico inmediato. Ambos consumen exclusivamente Telemetry Core,
funcionan offline, callan ante datos missing/stale y nunca inventan un hecho.

La Beta objetivo incluye:

- Spotter LMU real de baja latencia y multiclase.
- Engineer de carrera real: sesión, control, rivales, fuel, Virtual Energy,
  neumáticos, daños, pits, penalizaciones demostrables, ritmo y motivación.
- Español e inglés en la primera etapa; italiano y portugués brasileño en la
  etapa multilingüe final.
- PTT mediante teclado, volante, gamepad, button box e HID.
- Wake words `Ingeniero`, `Engineer`, `Ingegnere` y `Engenheiro`.
- Consultas y acciones con diálogo/confirmación deterministas.
- TTS/STT offline, dispositivos, hot-plug, ducking y fallback visual.
- Personalidades Profesional, Cercano, Exigente y Custom.
- Pit Manager con confirmación, envío transaccional y readback.
- Strategy Planner y Overlays mediante contratos versionados.
- Diagnóstico, replays, soak LMU y gate Beta auditable.
- Todas las familias planificadas salvo cambio de piloto en la primera Beta.

## Límites no negociables

1. Telemetry Core es la única fuente. No se crea otro reader LMU.
2. Código propio decide hecho, intent, slots, número, prioridad y acción.
3. Ningún LLM participa en hechos o acciones críticas. Un LLM futuro solo
   podría reformular texto no crítico después de que el código decida todo.
4. CrewChief/DRE son referencias funcionales clean-room. No se copian código,
   frases, gramáticas, audios, nombres internos, UI o assets.
5. Spotter siempre puede preemptar Engineer, Strategy, motivación o voz.
6. Micrófono y transcripciones son memory-only por defecto. Cero recording.
7. Una acción mutable exige propuesta, repetición, confirmación, ejecución y
   resultado. Strategy y Pit Manager nunca cambian silenciosamente.
8. Whisper `base` sigue condicionado. Command intent, FAR/FRR y wake word
   siguen NO-GO hasta corpus humano consentido real.
9. Kokoro es la dirección TTS elegida, pero ENG-09 sigue siendo evidencia
   NO-GO del stack medido. Solo ENG-22 puede cambiar ese resultado con G2P y
   licencias permisivos, rendimiento, packaging y escucha humana nuevos.
10. Fixtures sintéticas prueban contratos/lifecycle, nunca percepción humana.
11. Toda función sin capability fiable permanece unavailable/disabled.
12. El flujo es rama de issue -> review -> aprobación inicial de Isaac ->
    `nightly` -> feedback/correcciones -> `testers` -> aprobación -> `master`.

## Arquitectura objetivo

```text
Telemetry Core
    |
    v
Engineer projection -> monitors/Spotter -> policy/scheduler -> presentation
                                                 |                 |
                                                 |                 +-> visual/radio/subtitles
                                                 v
                                          delivery/audio

Input devices -> PTT/wake -> STT host -> deterministic intent/dialogue
                                             |              |
                                             |              +-> read-only queries
                                             |              +-> confirmed action ports
                                             v
                                          no direct stores

Confirmed action ports -> Pit Manager transaction -> LMU readback
                       -> Strategy proposal/commit -> Overlay snapshot
```

Las fronteras comparten contratos versionados. Ningún módulo importa la
persistencia privada o la UI interna de otro. Spotter, ingesta y scheduler
nunca esperan STT/TTS.

## Milestones Linear

| Milestone | Issues | Resultado |
|---|---|---|
| ENG-A — Contratos, input y comportamiento real | ENG-12..19 | Catálogo/corpus, PTT, diálogo, audio, personalidades, Spotter y monitores |
| ENG-B — Voz offline condicionada | ENG-20..23 | STT/wake/TTS detrás de gates reales |
| ENG-C — Producto e integraciones | ENG-24..27 | UI, Pit, Strategy/Overlays, diagnóstico |
| ENG-D — Soak y gate Beta | ENG-28..29 | LMU real, packaging y decisión Beta |

## Microcortes

| Orden | Linear | Corte | Bloqueado por | Estado/gate |
|---:|---|---|---|---|
| 12 | ISA-183 | Catálogo de comandos, intents y protocolo de corpus humano | ISA-182 | **Nightly** |
| 13 | ISA-184 | Gate humano command intent, FAR/FRR y wake word | ISA-183 + personas reales | Bloqueo externo real |
| 14 | ISA-185 | PTT teclado/volante/gamepad/HID | ISA-183 | **Nightly**; falta wiring/UI/persistencia |
| 15 | ISA-186 | Router determinista, diálogo y confirmaciones | ISA-183 | **Nightly**; sin efectos productivos |
| 16 | ISA-187 | Audio offline, dispositivos, hot-plug y ducking | ISA-182 | **Siguiente vertical** con ENG-18 |
| 17 | ISA-188 | Personalidades y frecuencia declarativas | ISA-183 | Autónomo tras ENG-12 |
| 18 | ISA-189 | Spotter LMU Beta, multiclase y latencia | ISA-182 | **Siguiente vertical** con ENG-16 y visual |
| 19 | ISA-190 | Monitores Engineer Beta y consultas reales | ISA-189 | Después de Spotter; sin cambio de piloto |
| 20 | ISA-191 | Voice-host STT productivo condicionado | ISA-184/185/186 | Bloqueado hasta gate humano |
| 21 | ISA-192 | Wake word traducido y privacidad | ISA-184/191 | Bloqueado hasta FAR/FRR real |
| 22 | ISA-193 | Gate técnico Kokoro offline | ISA-182 | En paralelo; G2P/licencia/rendimiento condicionan |
| 23 | ISA-194 | Integración TTS/voice packs/fallback | ISA-187/193 | Feature-gated; escucha en ENG-29 |
| 24 | ISA-195 | Centro de control, permisos y Ajustes | ISA-185/187/188/189/190 | Puede representar STT/wake disabled |
| 25 | ISA-196 | Pit Manager LMU transaccional + readback | ISA-186/190 | Gate LMU seguro posterior |
| 26 | ISA-197 | Strategy Planner + Overlays versionados | ISA-186/190/196 + contrato Strategy | Después de cerrar Spotter/audio/monitores/control/Pit |
| 27 | ISA-198 | Diagnóstico, replays y ledger de paridad | ISA-189..197 aplicables | Cierre funcional auditable |
| 28 | ISA-199 | Soak LMU real, rendimiento y recuperación | ISA-198 | Requiere entorno LMU autorizado |
| 29 | ISA-200 | Gate Engineer Beta, idiomas y packaging | ISA-184/199 | Gate humano/técnico final |

Cada issue contiene objetivo, contexto, incluye/no incluye, criterios de
aceptación, restricciones, tests, entrega y resumen público. Las relaciones
`blockedBy` de Linear son autoridad para el orden operacional.

## DAG y orden acordado

El proyecto no se detiene esperando ENG-13. La prioridad de producto es una
vertical observable y comprobable, no completar números de issue en orden:

```text
Nightly: ENG-01..12 + ENG-14/15 + visual ENG-08
  |
  +-> Fase 1: ENG-16 audio + ENG-18 Spotter + radio/subtítulos/overlay
  |              +-> ENG-19 monitores (todo salvo cambio de piloto)
  |              +-> ENG-24 control y persistencia
  |              +-> ENG-25 Pit transaccional y readback
  |
  +-> Fase voz paralela: ENG-22 Kokoro condicionado -> ENG-23
  |                     ENG-13 humano -> ENG-20 STT -> ENG-21 wake
  |
  +-> Después de cerrar las bases: ENG-26 Strategy/Overlays avanzados
                                      |
                           ENG-27 -> ENG-28 -> ENG-29
```

### Ruta inmediata

1. Resolver ISA-314 para que la UI no prometa persistencia inexistente.
2. Ejecutar ENG-16 y ENG-18 como una vertical coordinada. Aunque conserven
   ramas/issues separadas, ambos prueban audio y salida visual del mismo evento.
3. Completar ENG-19 con todas las familias Beta salvo cambio de piloto; toda
   señal no demostrable queda unavailable, no simulada.
4. Integrar ENG-24 y ENG-25: ajustes persistentes y roundtrip, hardware real y
   escrituras LMU controladas con confirmación/readback/fail-closed.
5. En paralelo, ENG-22 intenta hacer viable Kokoro. ENG-23 solo lo cablea si el
   gate pasa; de lo contrario el fallback visual continúa siendo producto.
6. ENG-13 permanece NO-GO hasta corpus humano. ENG-20/21 no se habilitan antes.
7. Iniciar ENG-26 solo tras cerrar Spotter, audio, monitores, control y Pit.
8. ENG-27..29 verifican el conjunto, soak LMU y packaging. Cada corte anterior
   ya debe aportar replays, visuales y diagnóstico focal; no se difiere toda la
   evidencia al final.

## Gates humanos y externos

| Gate | Evidencia necesaria | Qué bloquea |
|---|---|---|
| Corpus humano de comandos | Consentimiento y diversidad; ES/EN primero, IT/PT-BR después; negativos/near-miss e intent/slot accuracy | STT productivo ENG-20 |
| FAR/FRR wake word | Positivos y negativos humanos por locale/ruido; activación por locale | Wake ENG-21 |
| Kokoro técnico y escucha TTS | G2P/licencias permisivos, rendimiento, packaging, pronunciación, números/unidades y personalidad; ES/EN primero | ENG-23 y activación por locale; no bloquea fallback visual |
| LMU Pit readback | Interfaz/estado final demostrable y entorno autorizado | Acción real ENG-25 |
| Contrato Strategy | Plan ID/version, proposal, commit y snapshot estables | ENG-26 |
| LMU real | Sesión completa, grid/multiclase/pits/reconnect | ENG-28/29 |

Si falta un gate, el corte termina `NO-GO`, `INCONCLUSIVE` o disabled. Nunca se
bajan umbrales, se regenera evidencia o se sustituye humano por sintético.

## Contrato de ejecución por issue

1. Verificar base exacta y worktree limpio.
2. Leer AGENTS, current-plan, handoff, este roadmap y la issue completa.
3. Declarar preflight: alcance, archivos, contratos, tests y stop conditions.
4. Crear regresiones/caracterización antes de cambiar comportamiento.
5. Implementar el cambio correcto más sencillo; sin capas especulativas.
6. Ejecutar focal, integración, global, race/bench/visual cuando aplique.
7. Review independiente P0/P1/P2/P3 y corregir todos los razonables.
8. Actualizar handoff/current-plan con evidencia y próxima acción exacta.
9. Commit, push, PR draft apilada y Linear `In Review`.
10. No promoción. Isaac aprueba una implementación inicial antes de `nightly`.

## Definition of Done de Engineer Beta

- Spotter supera replays y escenarios LMU reales sin false clears aceptados.
- Engineer solo comunica hechos respaldados y calla ante missing/stale.
- Español e inglés cumplen primero su matriz declarada; el gate final exige
  también italiano y portugués brasileño. Cualquier función sin gate queda
  deshabilitada explícitamente.
- PTT funciona en dispositivos objetivo; wake word solo donde FAR/FRR pase.
- STT/TTS son offline, cancelables, acotados y no bloquean el hot path.
- Personalidad no cambia verdad, prioridad o seguridad.
- Pit Manager confirma y verifica mediante readback o falla cerrado.
- Strategy/Overlays comparten una versión aceptada del plan.
- Diagnóstico explica emitido/descartado/cancelado sin PII/audio/raw.
- Soak conjunto no deja procesos, puertos, handles, goroutines o mensajes
  caducados y preserva Spotter bajo presión.
- Installer/update/rollback/licencias/Windows 10/11 pasan.
- Review técnica sin findings razonables y checklist humano explícito.
- No existe promoción automática a `nightly`, `testers` o `master`.

## Próxima acción exacta

Tras aceptar ISA-313, ejecutar ISA-314 como bugfix pequeño. Después iniciar
ISA-187 / ENG-16 desde la `nightly` remota más reciente y coordinar sus
criterios de aceptación con ISA-189 / ENG-18 y la salida visual ENG-08 ya
integrada. No se inicia ENG-26 hasta cerrar Spotter, audio, monitores, control
y Pit. Cada rama se revisa y requiere aprobación antes de promoverse.
