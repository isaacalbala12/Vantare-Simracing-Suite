# Vantare Ingeniero Go — Paquete de Documentación

> **Estado:** v1.
> **Última revisión:** 2026-06-27.
> **Worktree canónico:** `C:\Users\isaac\Desktop\Vantare-Overlays\vantare-v2-engineer`.
> **Submódulo de código:** `vantare-v2/` dentro del worktree.
>
> Este paquete es el **único punto de escritura de docs del Ingeniero**.
> El Ingeniero no toca widgets, layouts ni nada que no sea documentación
> del ingeniero.

## 1. Contexto de la reescritura

Vantare Ingeniero Go es la **reescritura en Go** del producto Vantare
Ingeniero Python v0.7 (publicado 2026-06-15). Go da monolito simple,
estático, idiomático y fácil de mantener con asistencia de LLM. El
producto en sí, los flujos críticos y la paridad con CrewChief no
cambian: se traducen a Go conservando lo que ya funciona.

El usuario dirige los trabajos con agentes LLM. Los docs deben ser lo
suficientemente explícitos para que el agente no tenga que pedir
aclaración sobre reglas no negociables.

## 2. Reglas heredadas no negociables

Estas reglas vienen del Python v0.7. Si un plan o feature las contradice,
gana la regla. Origen: `vantare-go-master-plan.md` § 3.

1. **La IA nunca decide datos críticos.** LLM solo redacta sobre
   `facts` deterministas. fuel, damage, gaps, flags, posiciones, tiempos
   son hechos extraídos de telemetría/estrategia. La IA no inventa
   cifras. Ver `voice-contract.md` § "PTT Engineer Facts-Only Contract".
2. **Spotter y suite del ingeniero evalúan a 20 Hz** sobre el mismo
   `TelemetryFrame`. Nada a 0.5 Hz batch. La arquitectura es
   **monolítica**, una app, sin daemon, sin bus interno.
3. **Detección ≠ messaging.** Geometría pura, histéresis, transición de
   estado, delay de mensaje, expiración y prioridad de cola son capas
   separadas en paquetes distintos. Ver
   `architecture/0001-prealpha-architecture.md`.
4. **Defaults Locked.** Cada módulo publica una tabla de constantes
   verificadas en pista real. No se debaten en cada cambio. Ver
   `vantare-go-master-plan.md` § 5. Cambiar una default requiere PR
   separado y evidencia live.
5. **i18n + NumberProcessing.** Soporte ES (default) y EN con formateo
   de números/tiempos local. Sin frameworks i18n pesados.
6. **Sin overlays in-game en Vantare.** Regla heredada del Python. La
   capa visual de telemetría vive en una app aparte; Vantare solo voz,
   spotter, ingeniero.
7. **Tests antes que código.** Cualquier cambio de comportamiento lleva
   test que falla antes y pasa después. Tests de spotter y suite CC son
   la fuente de verdad de paridad con CrewChief.
8. **Sin daemon, sin bus, sin microservicios locales** hasta que una
   necesidad real lo justifique.
9. **Wails UI solo capa de presentación.** Toda lógica de carrera vive
   en Go. La UI invoca bindings, muestra estado, configura opciones.
10. **Solo LMU en prealpha y alpha temprana.** AC/AC EVO entran en 1.0.

## 3. Regla CrewChief por feature

Esta regla es **no negociable** y se hereda del plan maestro. Antes de
implementar cualquier feature que reclame paridad con CrewChiefV4:

1. **Mini-auditoría específica contra el repo fuente.** No basta la
   auditoría general de `architecture/crewchief-parity-audit.md` ni la
   matriz amplia de `architecture/crewchief-parity.md`. Cada feature
   requiere una mini-auditoría que cite:
   - Archivos y funciones de CrewChief que gobiernan la feature.
   - Constantes, cooldowns, gates y prioridades exactas en CC.
   - Campos de telemetría necesarios y de qué buffer salen.
   - Comportamiento actual en Go (paquete, archivo, función).
   - Gap exacto frente al Go actual.
   - Tests esperados.
2. **Si no se puede confirmar en fuente**, el estado de la feature es
   `NO_VERIFICADO` y la implementación queda bloqueada o se marca como
   decisión de producto no-paridad.
3. **No se permite implementar como "como CrewChief"** usando solo
   memoria, resumen general o matriz amplia. Sin evidencia concreta por
   archivo, no se escribe código.
4. **Auditorías generales (NIVEL 5 en `INDEX.md`) son insumo, no
   permiso.** Pueden inspirar la mini-auditoría pero no la sustituyen.

## 4. Estados válidos para features CrewChief

En cualquier matriz o tabla de paridad se usan SOLO estos estados:

- `CONFIRMADO`: existe evidencia en código + tests + (cuando aplique)
  captura live. Es el único estado que admite claim fuerte.
- `PARCIAL`: parte implementada y testeada; el resto está
  explícitamente listado como gap con archivo y función objetivo.
- `NO_VERIFICADO`: no se ha encontrado la evidencia suficiente en el
  repo fuente CC o en código Vantare. La implementación está
  bloqueada.
- `GAP`: existe CC, no existe Vantare, no se ha iniciado trabajo.
- `NO_IMPLEMENTADO`: existe CC, no existe Vantare, el trabajo está
  conscientemente diferido a una fase posterior explícita.
- `HISTÓRICO`: la fuente existe pero su valor es antecedente, no spec.

Se prohíbe usar `MATCH` salvo que haya evidencia fuerte y `OK` para
algo que no se haya verificado en código.

## 5. Cómo se divide este paquete (estado real)

```
docs/engineer/
├── README.md                 este archivo
├── INDEX.md                  mapa canónico + estado real por archivo
├── current-plan.md           estado actual, próxima tarea, riesgos
├── vantare-go-master-plan.md reglas, defaults locked, matriz LMU-01..48
├── voice-contract.md         contrato normativo voz/TTS (matriz VC-*)
├── domain-model.md           vocabulario canónico
├── agent-workflow.md         roles orquestador / worker / reviewer
├── go-review-checklist.md    checklist de revisión Go
├── manual-verification.md    pasos de verificación para usuario no-programador
├── operations.md             runbook del repo
├── testing-strategy.md       estrategia y orden de tests
├── CHANGELOG.md              bitácora del paquete de docs
├── architecture/
│   ├── 0001-prealpha-architecture.md   monolito 20 Hz, separación capas
│   ├── crewchief-parity.md             matriz LMU-01..48 canónica
│   ├── crewchief-parity-audit.md       auditoría 2026-06-27 (EVIDENCIA)
│   ├── crewchief-parity-report.md      informe previo (HISTÓRICO)
│   ├── spotter-geometry-findings.md    convención X/Z CrewChief confirmada
│   └── tts.md                          TTS, cache, pre-cache (HISTÓRICO/ASPIRACIONAL)
├── product/
│   └── prealpha-next-steps.md  prioridades inmediatas prealpha
└── testing/
    ├── lmu-telemetry.md      offsets LMU, parser y gates
    ├── spotter-bug-log.md    bugs conocidos y corregidos (heredado de Python)
    └── prealpha-gate.md      criterios medibles para cerrar prealpha
```

> **Nota de estado real:** los directorios `internal/tts`, `internal/sim`,
> `internal/config`, `internal/persistence`, `internal/cli` y
> `internal/engineer/modules` **no existen** en el worktree actual.
> Los docs que los describen están marcados como
> HISTÓRICO/ASPIRACIONAL en `INDEX.md`. No implementar código contra
> esos paths sin crear el paquete antes.

## 6. Orden de lectura recomendado

| Rol | Lectura |
|-----|---------|
| Worker (antes de codear) | `INDEX.md` → `current-plan.md` → `vantare-go-master-plan.md` § 3, 5, 12, 13 → `architecture/0001-prealpha-architecture.md` → doc del subsistema tocado → `agent-workflow.md` |
| Reviewer (antes de auditar) | `go-review-checklist.md` → `voice-contract.md` → diff → `INDEX.md` § 5 (estado real) → `testing/spotter-bug-log.md` |
| Orquestador (planificar) | `current-plan.md` → `vantare-go-master-plan.md` → `product/prealpha-next-steps.md` → `architecture/crewchief-parity.md` § matriz LMU-01..48 → `architecture/crewchief-parity-audit.md` (como insumo) |
| Usuario no-programador (verificar) | `manual-verification.md` → `operations.md` |

## 7. Cómo se actualiza

- Toca solo los archivos dentro de `docs/engineer/`.
- Después de cualquier tarea que cambie estado, actualiza `current-plan.md`.
- Después de cualquier decisión de producto, actualiza
  `vantare-go-master-plan.md` § 5 (Defaults Locked) y aporta
  evidencia live.
- Después de cualquier bug de spotter o suite, actualiza
  `testing/spotter-bug-log.md`.
- No mezcles docs de Ingeniero con docs de widgets ni de otro subsistema.
- Después de cualquier cambio de estado real del código Go
  (módulo implementado, package creado), actualiza `INDEX.md` § 5 con
  la evidencia (path concreto, función o tipo).

## 8. Estado del paquete

- [x] Reglas heredadas y árbol fijados
- [x] Plan maestro con módulos CC y defaults locked (con correcciones
  2026-06-27: defaults contradictorios marcados)
- [x] Voice contract con matriz VC-* (sin auditar en este pase)
- [x] CrewChief parity matrix LMU-01..48 (reformulada con estados reales)
- [x] Spotter bug log heredado (sin auditar en este pase)
- [x] Prealpha gate con criterios medibles (corregido: `-jsonl` eliminado)
- [x] Regla CC reforzada en `agent-workflow.md` y `README.md`
