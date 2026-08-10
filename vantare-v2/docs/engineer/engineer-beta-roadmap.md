# Engineer Beta — mapa técnico histórico ENG-12 a ENG-29

## Estado y uso

> **Documento histórico no ejecutable.** Conserva el diseño técnico y la
> descomposición concebidos el 2026-08-02. Linear posee alcance, dependencias,
> plan, siguiente acción, rama esperada y base esperada. Git demuestra raíz,
> worktree, rama real, HEAD, dirty state y ancestry. Una issue vigente debe
> enlazar cualquier plan que se vaya a ejecutar.

- Fecha: 2026-08-02.
- Snapshot documental observado: ISA-182 / ENG-11 aceptada.
- Proyecto Linear: `Engineer & Spotter — LMU Race Companion`.
- Parent: ISA-123 / ENG-01.
- Este documento y `docs/vantare-program/handoffs/engineer-spotter.md`
  aportan contexto técnico; no gobiernan trabajo restante.

## Resultado de producto

Engineer Beta acompaña al piloto en directo. Spotter se limita a seguridad,
proximidad y tráfico inmediato. Ambos consumen exclusivamente Telemetry Core,
funcionan offline, callan ante datos missing/stale y nunca inventan un hecho.

La Beta objetivo incluye:

- Spotter LMU real de baja latencia y multiclase.
- Engineer de carrera real: sesión, control, rivales, fuel, Virtual Energy,
  neumáticos, daños, pits, penalizaciones demostrables, ritmo y motivación.
- Español, inglés, italiano y portugués brasileño.
- PTT mediante teclado, volante, gamepad, button box e HID.
- Wake words `Ingeniero`, `Engineer`, `Ingegnere` y `Engenheiro`.
- Consultas y acciones con diálogo/confirmación deterministas.
- TTS/STT offline, dispositivos, hot-plug, ducking y fallback visual.
- Personalidades Profesional, Cercano, Exigente y Custom.
- Pit Manager con confirmación, envío transaccional y readback.
- Strategy Planner y Overlays mediante contratos versionados.
- Diagnóstico, replays, soak LMU y gate Beta auditable.

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
9. Kokoro dinámico sigue NO-GO. Ningún agente puede reinterpretar ENG-09.
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
| 12 | ISA-183 | Catálogo de comandos, intents y protocolo de corpus humano | ISA-182 | **Primer corte ejecutable** |
| 13 | ISA-184 | Gate humano command intent, FAR/FRR y wake word | ISA-183 + personas reales | Bloqueo externo real |
| 14 | ISA-185 | PTT teclado/volante/gamepad/HID | ISA-183 | Autónomo tras ENG-12 |
| 15 | ISA-186 | Router determinista, diálogo y confirmaciones | ISA-183 | Autónomo tras ENG-12 |
| 16 | ISA-187 | Audio offline, dispositivos, hot-plug y ducking | ISA-182 | Ejecutable en paralelo |
| 17 | ISA-188 | Personalidades y frecuencia declarativas | ISA-183 | Autónomo tras ENG-12 |
| 18 | ISA-189 | Spotter LMU Beta, multiclase y latencia | ISA-182 | Ejecutable en paralelo |
| 19 | ISA-190 | Monitores Engineer Beta y consultas reales | ISA-189 | Autónomo; capability-gated |
| 20 | ISA-191 | Voice-host STT productivo condicionado | ISA-184/185/186 | Bloqueado hasta gate humano |
| 21 | ISA-192 | Wake word traducido y privacidad | ISA-184/191 | Bloqueado hasta FAR/FRR real |
| 22 | ISA-193 | Gate técnico TTS offline, cuatro idiomas | ISA-182 | Ejecutable en paralelo; percepción pendiente |
| 23 | ISA-194 | Integración TTS/voice packs/fallback | ISA-187/193 | Feature-gated; escucha en ENG-29 |
| 24 | ISA-195 | Centro de control, permisos y Ajustes | ISA-185/187/188/189/190 | Puede representar STT/wake disabled |
| 25 | ISA-196 | Pit Manager LMU transaccional + readback | ISA-186/190 | Gate LMU seguro posterior |
| 26 | ISA-197 | Strategy Planner + Overlays versionados | ISA-186/190/196 + contrato Strategy | Bloqueo externo acotado |
| 27 | ISA-198 | Diagnóstico, replays y ledger de paridad | ISA-189..197 aplicables | Cierre funcional auditable |
| 28 | ISA-199 | Soak LMU real, rendimiento y recuperación | ISA-198 | Requiere entorno LMU autorizado |
| 29 | ISA-200 | Gate Engineer Beta, idiomas y packaging | ISA-184/199 | Gate humano/técnico final |

Cada issue contiene objetivo, contexto, incluye/no incluye, criterios de
aceptación, restricciones, tests, entrega y resumen público. Las relaciones
`blockedBy` de Linear son autoridad para el orden operacional.

## DAG y trabajo autónomo

Después de ENG-12, el proyecto no debe detenerse esperando ENG-13. Puede
continuar con todos los cortes objetivos no bloqueados:

```text
ENG-11
  +-> ENG-12 -> ENG-13 (personas reales) -> ENG-20 -> ENG-21
  |         +-> ENG-14 --+
  |         +-> ENG-15 --+-> Pit/Strategy/dialogue
  |         +-> ENG-17 --+
  +-> ENG-16 -> ENG-23
  +-> ENG-18 -> ENG-19 -> ENG-24/25/26
  +-> ENG-22 -> ENG-23

ENG-18..26 + voice gates -> ENG-27 -> ENG-28 -> ENG-29
```

### Ruta prevista en el snapshot

1. ENG-12.
2. Sin esperar corpus humano: ENG-14, ENG-15, ENG-16, ENG-17, ENG-18,
   ENG-19 y ENG-22 según bases aceptadas y worktrees aislados.
3. ENG-24 y la parte determinista de ENG-25 pueden avanzar cuando sus
   dependencias estén aceptadas.
4. ENG-13 permanece NO-GO hasta voces humanas. No bloquea esos cortes.
5. ENG-20/21 no se implementan productivamente antes de ENG-13.

## Gates humanos y externos

| Gate | Evidencia necesaria | Qué bloquea |
|---|---|---|
| Corpus humano de comandos | Consentimiento, cuatro locales, diversidad definida, negativos/near-miss, intent/slot accuracy | STT productivo ENG-20 |
| FAR/FRR wake word | Positivos y negativos humanos por locale/ruido | Wake ENG-21 |
| Escucha TTS | Pronunciación, naturalidad, números/unidades, personalidad en cuatro locales | Activación Beta en ENG-29; no bloquea tooling/integración disabled |
| LMU Pit readback | Interfaz/estado final demostrable y entorno autorizado | Acción real ENG-25 |
| Contrato Strategy | Plan ID/version, proposal, commit y snapshot estables | ENG-26 |
| LMU real | Sesión completa, grid/multiclase/pits/reconnect | ENG-28/29 |

Si falta un gate, el corte termina `NO-GO`, `INCONCLUSIVE` o disabled. Nunca se
bajan umbrales, se regenera evidencia o se sustituye humano por sintético.

## Contrato histórico de ejecución por issue

Estas reglas describen el proceso previsto en el snapshot. No seleccionan una
issue, rama, base ni plan actuales.

1. Verificar base exacta y worktree limpio.
2. Leer AGENTS, la issue completa, `docs/README.md`, el handoff y este roadmap.
3. Declarar preflight: alcance, archivos, contratos, tests y stop conditions.
4. Crear regresiones/caracterización antes de cambiar comportamiento.
5. Implementar el cambio correcto más sencillo; sin capas especulativas.
6. Ejecutar focal, integración, global, race/bench/visual cuando aplique.
7. Review independiente P0/P1/P2/P3 y corregir todos los razonables.
8. Actualizar Linear y, si cambia la continuidad técnica, el handoff con
   evidencia y una recomendación técnica no autorizante.
9. Commit, push, PR draft apilada y Linear `In Review`.
10. No promoción. Isaac aprueba una implementación inicial antes de `nightly`.

## Definition of Done de Engineer Beta

- Spotter supera replays y escenarios LMU reales sin false clears aceptados.
- Engineer solo comunica hechos respaldados y calla ante missing/stale.
- Cuatro idiomas cumplen la matriz declarada; cualquier función sin gate queda
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

## Recomendación técnica registrada en el snapshot

El snapshot proponía ISA-183 / ENG-12 como corte de contratos, catálogo,
protocolo y harness, sin voces humanas ni STT/PTT/audio productivo. Antes de
retomarlo hay que consultar Linear y verificar en Git la rama, base y SHA
vigentes.
