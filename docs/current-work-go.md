# Current Work — Vantare Ingeniero Go

> **Estado:** v1.
> **Última revisión:** 2026-06-27.
> **Worktree canónico:** `C:\Users\isaac\Desktop\Vantare-Overlays\vantare-v2-engineer`.
> **Submódulo de código:** `vantare-v2/` dentro del worktree.
>
> **Autoridad vigente:**
> [`master-plan-go.md`](master-plan-go.md) (segmentación global) +
> [`vantare-go-master-plan.md`](engineer/vantare-go-master-plan.md)
> (reglas, defaults y matriz de paridad).

Este documento refleja **lo que se está haciendo ahora mismo**. No es
histórico: para eso están el plan maestro y
[`current-plan.md`](engineer/current-plan.md) del paquete `engineer/`.

## 1. Plan general activo

**G0 — Prealpha (0.0.x): Spotter MVP.**

Justificación: el plan maestro exige cerrar prealpha con spotter LMU
validado en pista antes de empezar alpha 1. La sección 2 es el camino
crítico. Todo lo demás queda en standby hasta que el gate de prealpha
se cumpla.

> **Aviso 2026-06-27:** el worktree tiene cambios sin commit
> (~400 líneas en `internal/{engineer,server,app}/`) que el plan
> maestro y el gate prealpha aún no reflejan. Antes de aprobar
> nuevas tareas, el orquestador debe auditar esos cambios y
> reconciliar con `current-plan.md` § 2.2.

## 2. Miniplan activo

El miniplan activo se describe en
[`current-plan.md`](engineer/current-plan.md) § 6 "Próximas 5 tareas
pequeñas". Resumen (orden recomendado):

1. Crear `cmd/spotter-debug` con export JSONL real (sustituye la
   referencia rota a `cmd/lmu-debug -jsonl`).
2. Implementar gate `minSpotterSpeedMPS=10.0` en `Classify`.
3. Implementar `ValidityRule` + `Runtime.IsMessageStillValid`.
4. Crear fixtures de replay persistentes bajo
   `internal/engineer/replay/testdata/`.
5. Integrar `Player.Play` en `queueLoop`.

Cada tarea exige mini-auditoría específica contra
`https://gitlab.com/mr_belowski/CrewChiefV4` (ver
[`agent-workflow.md`](engineer/agent-workflow.md) § 4 y
[`README.md`](engineer/README.md) § 3).

## 3. Próximas 5 tareas pequeñas (concreto)

Ver [`current-plan.md`](engineer/current-plan.md) § 6 para detalle
completo (objetivo, alcance, archivos esperados/prohibidos, criterios
de aceptación, verificación, rollback, mini-auditoría CC por feature).

Resumen en una línea por tarea:

1. `cmd/spotter-debug` con JSONL real (sustituye `-jsonl`).
2. Gate `minSpotterSpeedMPS=10.0` (CC `NoisyCartesianCoordinateSpotter.cs:56`).
3. `ValidityRule` + `IsMessageStillValid` (CC `AbstractEvent.cs`).
4. Fixtures replay persistentes (left-basic, right-basic, three-wide,
   all-clear).
5. Integrar `Player.Play` en `queueLoop` (CC `AudioPlayer.cs:2055`).

## 4. Riesgos activos

Origen: `engineer/current-plan.md` § 7, filtrados a lo que toca al
miniplan activo.

- **Cambios sin commit sin auditar.** El worktree tiene nuevos
  archivos (`internal/engineer/lmu/`, `OverlaysLiveAdapter`,
  `/api/engineer/health`) que no están en HEAD. Cualquier plan
  construido sobre el HEAD sin ver estos cambios quedará obsoleto al
  fusionarse.
- **Confianza live del spotter** aún depende de trazas reales LMU.
  Las tareas 1-3 del miniplan cierran parcialmente este riesgo, pero
  la captura real sigue requiriendo sesión manual.
- **Mensajes audio stale** pueden producir `clear` incorrecto si se
  reproducen tarde. Las tareas 3 y 5 cubren esto.
- **Agentes sobreajustando tests por intuición** si saltan los docs
  de CrewChief. Mitigado por la regla CC reforzada en
  `engineer/agent-workflow.md` § 4 y `engineer/README.md` § 3
  (mini-auditoría obligatoria por feature).
- **Bindings Wails regenerados** pueden distraer del foco prealpha.
  No se commitean (regla del plan maestro).
- **Kokoro no instalado.** Edge TTS es el único provider funcional.
  Kokoro queda como stub hasta que se decida instalarlo. Además,
  `internal/tts/` no existe aún (ver `engineer/current-plan.md` § 2.3).
- **`npm test` en frontend es placeholder.** No bloquea el miniplan
  activo.

## 5. Gates pendientes

Gates para cerrar G0 (prealpha). Detalle completo en
[`testing/prealpha-gate.md`](engineer/testing/prealpha-gate.md) y matriz
LMU-01..48 en
[`vantare-go-master-plan.md`](engineer/vantare-go-master-plan.md) § 13.

- [ ] Geometría CrewChief X/Z confirmada en pista real (LMU-01,
      LMU-02, LMU-03).
- [ ] Replay JSONL con fixtures left/right/three-wide/all-clear
      (LMU-37 parcial).
- [ ] `cmd/spotter-debug` (NO `cmd/lmu-debug -jsonl`) exportando
      por oponente `alignedX/alignedZ/side/inOverlap/rejectReason`.
- [ ] Captura side-by-side real LMU ≥1 minuto.
- [ ] `verify-prealpha.ps1` pasa.
- [ ] Sin mensajes stale en tests.
- [ ] Speed gate `minSpotterSpeedMPS` implementado.
- [ ] `ValidityRule` + `IsMessageStillValid` implementados.
- [ ] `Player.Play` integrado en `queueLoop`.
- [ ] Spotter audible y consistente en ≥3 circuitos.

Cuando todos los gates estén verdes, G0 se cierra y se promociona a
G1 (alpha 1).

## 6. Decisiones pendientes

- Si elevar el miniplan activo a `docs/superpowers/plans/` con prompt
  de worker y reviewer, o mantenerlo inline en
  `current-plan.md` § 6.
- Si solicitar a Isaac una captura LMU real (no automatizable desde
  el agente).
- Cuándo instalar Kokoro para validar el provider local (y crear
  antes `internal/tts/`).
- Cómo auditar y mergear los cambios sin commit del worktree.

## 7. Cómo actualizar este documento

Después de cualquier tarea que cambie el estado del proyecto:

1. Actualizar la sección 3 (próximas 5 tareas): marcar hechas y añadir
   las nuevas.
2. Actualizar la sección 4 (riesgos): cerrar los resueltos, añadir
   nuevos.
3. Actualizar la sección 5 (gates): marcar verdes cuando proceda.
4. Si el miniplan activo cambia de naturaleza, mover el contenido a un
   miniplan formal en `docs/superpowers/plans/` y dejar aquí solo el
   puntero.
5. No reescribir este doc desde cero en cada tarea: solo edición
   quirúrgica.
6. Si cambia el estado real del código Go, actualizar también
   [`INDEX.md`](engineer/INDEX.md) § 5.

## 8. Conexión con otros documentos

| Documento | Relación |
|---|---|
| [`master-plan-go.md`](master-plan-go.md) | Segmentación global; este doc se posiciona dentro. |
| [`vantare-go-master-plan.md`](engineer/vantare-go-master-plan.md) | Reglas, defaults y matriz de paridad. |
| [`current-plan.md`](engineer/current-plan.md) | Estado del paquete `engineer/`. Este doc se centra en la siguiente tarea concreta. |
| [`architecture/0001-prealpha-architecture.md`](engineer/architecture/0001-prealpha-architecture.md) | Forma técnica del monolito. |
| [`testing/prealpha-gate.md`](engineer/testing/prealpha-gate.md) | Criterios detallados de cierre de G0. |
| [`testing/spotter-bug-log.md`](engineer/testing/spotter-bug-log.md) | Bugs activos del spotter. |
| [`voice-contract.md`](engineer/voice-contract.md) | Contrato de voz. Aplica a G0 en cola de audio + TTS. |
| [`agent-workflow.md`](engineer/agent-workflow.md) | Roles, plantilla de tarea, regla CC. |
| [`README.md`](engineer/README.md) | Visión del paquete y regla CC reforzada. |
| [`INDEX.md`](engineer/INDEX.md) | Mapa canónico y estado real por archivo. |

## 9. Reglas operativas

- Cambios pequeños y concretos.
- No tocar `go.mod` ni `frontend/package.json`.
- No cambiar defaults locked.
- No añadir binarios, daemon ni IPC.
- No introducir IA en spotter o suite.
- No implementar ninguna feature de paridad CrewChief sin
  mini-auditoría específica de esa feature contra
  `https://gitlab.com/mr_belowski/CrewChiefV4`.
- Si una tarea pide más scope del previsto, parar y reportar.
