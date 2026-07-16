# Workflow de Agentes — Vantare Ingeniero Go

> **Estado:** activo desde 2026-06-27.
> **Adaptado de:** Vantare Ingeniero Go original
> (`docs/agent-workflow.md`).
> **Contexto:** los agentes LLM operan este paquete. El usuario dirige
> los prompts, revisa los resúmenes y valida manualmente; no inspecciona
> diffs grandes de código.

## 1. Ciclo de trabajo

```
plan → worker → review → decisión
```

## 2. Roles

### 2.1 Orquestador

- Inspecciona el estado del repo (`git status --short`).
- Define una tarea pequeña con objetivo, alcance, archivos esperados,
  archivos prohibidos.
- Escribe prompt para worker y prompt para reviewer.
- Protege el proyecto contra rewrites amplios.
- Mantiene `current-plan.md` actualizado.
- **Antes de aprobar cualquier feature de paridad CrewChief, exige la
  mini-auditoría específica (ver §4).**

### 2.2 Worker

- Lee `AGENTS.md` (raíz del worktree) y los docs relevantes antes de
  editar.
- Inspecciona `git status --short` antes de tocar archivos.
- Toca **solo** archivos esperados.
- Mantiene el diff pequeño.
- Añade tests si cambia comportamiento.
- Ejecuta checks enfocados (`go test ./internal/<pkg> -v`,
  `gofmt -w`, `go vet ./...`).
- Para si la tarea crece fuera de alcance y reporta.

### 2.3 Reviewer

- No edita código. Solo revisa.
- Busca bugs, cambios de comportamiento, tests ausentes, salida de
  alcance, dependencias nuevas, violaciones de arquitectura.
- Comprueba si el usuario no programador puede verificar el resultado
  con los pasos de `manual-verification.md`.
- Para spotter: verifica geometría CrewChief, convención de signos y
  separación detección/messaging.
- Para audio/runtime: verifica que no puedan sonar mensajes stale.
- **Si una feature afirma paridad CrewChief sin mini-auditoría visible
  en el prompt, la rechaza (ver §4).**

## 3. Flujo estándar

1. Orquestador crea tarea pequeña.
2. Usuario aprueba o corrige el prompt.
3. Worker ejecuta la tarea.
4. Worker reporta archivos, comandos y checks manuales.
5. Reviewer audita el diff.
6. Orquestador recomienda aceptar, corregir, dividir o revertir.
7. Usuario hace un commit pequeño y coherente.
8. Si cambia el estado, se actualizan los docs relevantes
   (`current-plan.md`, `spotter-bug-log.md`, `INDEX.md` § 5 si toca
   estado real).

## 4. Regla de paridad CrewChief por feature (no negociable)

> **Origen:** `README.md` § 3, `vantare-go-master-plan.md` § 3.

Antes de implementar cualquier feature cuyo objetivo sea paridad con
CrewChief, el orquestador debe crear o adjuntar una **mini-auditoría
específica** de esa feature contra el repositorio fuente:

```
https://gitlab.com/mr_belowski/CrewChiefV4
```

La mini-auditoría es **obligatoria** aunque ya exista una auditoría
general (`architecture/crewchief-parity-audit.md`) o una matriz
amplia (`architecture/crewchief-parity.md`). Estas sirven de insumo
pero **no** de permiso.

### 4.1 Contenido obligatorio de la mini-auditoría

Cada mini-auditoría debe responder, como mínimo:

1. **Archivos y funciones CrewChief** que gobiernan la feature, con
   ruta exacta (ej. `Events/MulticlassWarnings.cs`).
2. **Constantes, cooldowns, gates y prioridades** que usa CC, con valor
   exacto y línea en el archivo fuente.
3. **Campos de telemetría** necesarios y de qué buffer salen
   (`mLastHistoryMessage`, `mFuel`, etc.).
4. **Comportamiento actual en Vantare** (paquete, archivo, función) y
   con qué tests se sostiene.
5. **Gap exacto** que se va a implementar ahora.
6. **Fuera de alcance explícito** para esta mini-tarea.
7. **Estado final** de la feature en la matriz: `CONFIRMADO`,
   `PARCIAL`, `NO_VERIFICADO`, `GAP` o `NO_IMPLEMENTADO`. Solo el
   orquestador puede aceptar `CONFIRMADO` tras ver evidencia live.

### 4.2 Cuándo NO se puede usar la mini-auditoría

Si el repo CC no está disponible, si la feature es ambigua, o si el
alcance de la mini-tarea no permite citar archivos concretos:

- El estado es `NO_VERIFICADO`.
- La implementación queda **bloqueada** salvo decisión explícita del
  usuario (que pasa a ser **decisión de producto no-paridad**, no
  paridad con CC).
- En la matriz LMU-01..48 el campo refleja `NO_VERIFICADO`.

### 4.3 Lo que NO sustituye la mini-auditoría

- Resúmenes o matrices amplias que solo digan "como CrewChief" o "gap".
- Memoria del modelo.
- Comentarios genéricos tipo "consistente con el comportamiento de CC".
- Cualquier doc marcado como `HISTÓRICO` en `INDEX.md` § 4.
- Claims `MATCH` sin evidencia de código + tests + (cuando aplique)
  captura live.

### 4.4 Stop condition automático

Si el orquestador recibe un prompt de feature CrewChief sin
mini-auditoría, **no aprueba** la tarea y devuelve el prompt al worker
para que la adjunte o solicite su creación.

## 5. Plantilla de tarea

Cada tarea debe definir:

- Objetivo (una frase).
- Alcance (qué sí cambia).
- Archivos esperados.
- Archivos prohibidos.
- Criterios de aceptación.
- Comandos de verificación.
- Verificación manual.
- Notas de rollback.
- Para features CrewChief: **mini-auditoría fuente con rutas exactas
  de CrewChiefV4 y estado `CONFIRMADO` / `NO_VERIFICADO`** (§ 4).

Ejemplo:

```
Objetivo: añadir ActiveSides a Classify sin tocar el comportamiento
existente.

Alcance:
- internal/engineer/spotter/types.go (nuevo tipo ActiveSides)
- internal/engineer/spotter/geometry.go (ClassifyWithActiveSides)
- internal/engineer/spotter/geometry_test.go (tests nuevos)

Archivos prohibidos:
- bindings Wails generados
- frontend/*
- go.mod

Criterios de aceptación:
- Classify(frame, sensitivity) sigue funcionando idéntico.
- ClassifyWithActiveSides(frame, sensitivity, active) acepta active.
- Tests nuevos pasan.
- gofmt limpio.

Verificación:
go test ./internal/engineer/spotter -v
gofmt -l internal/engineer/spotter/

Rollback:
git restore -- internal/engineer/spotter/ si los tests fallan en master.
```

## 6. Niveles de riesgo

**Riesgo bajo:**

- Documentación.
- Tests aislados.
- Helpers sin tocar runtime.

**Riesgo medio:**

- Comportamiento del spotter.
- Runtime/audio queue.
- UI Wails de control.
- Defaults Locked (requiere actualizar plan maestro).

**Riesgo alto:**

- Bindings Wails generados.
- Dependencias nuevas.
- Concurrencia (goroutines, mutex).
- Persistencia (FuelUsageStore, voice clone).
- Parser de telemetría live.
- Cambios de arquitectura.
- Suite CC (alpha 1+).
- Voice contract (VC-*).

Las tareas de riesgo alto deben dividirse en sub-tareas más pequeñas.

## 7. Reglas duras

- No tocar `go.mod` ni `frontend/package.json` sin aprobación explícita.
- No cambiar defaults locked sin actualizar plan maestro y tests
  asociados.
- No reescribir tipos `telemetry.Frame`, `spotter.Zone`,
  `audio.Message` sin migración completa.
- No añadir segundo binario, daemon, IPC o bus interno.
- No introducir IA en capas deterministas del spotter o suite.
- **No implementar feature CrewChief sin mini-auditoría específica.**

## 8. Documentos a leer antes de codear

1. [`INDEX.md`](INDEX.md) — mapa canónico y estado real.
2. [`current-plan.md`](current-plan.md) — estado actual.
3. [`vantare-go-master-plan.md`](vantare-go-master-plan.md) — reglas y
   defaults.
4. [`architecture/0001-prealpha-architecture.md`](architecture/0001-prealpha-architecture.md) —
   forma del monolito.
5. Doc del subsistema a tocar
   (`spotter/`, `engineer/`, `audio/`, `telemetry/`, etc.).
6. [`testing/spotter-bug-log.md`](testing/spotter-bug-log.md) si tocas
   spotter.
7. [`voice-contract.md`](voice-contract.md) si tocas audio/TTS.

## 9. Stop conditions

Para y pide revisión si:

- Necesitas tocar muchos más archivos de los previstos.
- Necesitas una dependencia nueva.
- Necesitas cambiar arquitectura.
- Los tests fallan por una causa que no entiendes.
- Encuentras cambios previos que chocan con tu tarea.
- No sabes cómo verificar el resultado.
- Hay contradicciones entre documentos.
- La tarea invoca paridad CrewChief pero no incluye mini-auditoría
  específica contra `CrewChiefV4` (§ 4).
- El estado real de `INDEX.md` § 5 contradice un claim del prompt.

## 10. Plantillas de prompt

- Worker: ver `prompts/worker-template.md` (pendiente de crear; ver
  `INDEX.md` § "Pendientes").
- Reviewer: ver `prompts/reviewer-template.md` (pendiente de crear).

## 11. Cómo auditar el código durante una revisión

Antes de aprobar cualquier cambio:

1. `git status --short` y `git diff --stat` en el worktree.
2. Verificar que los archivos modificados están en "Archivos esperados"
   de la tarea.
3. Si la tarea toca feature CrewChief, abrir el archivo citado en la
   mini-auditoría y comparar línea por línea los valores
   (constantes, gates).
4. Si la tarea añade un nuevo path `internal/...`, verificar que el
   directorio existe antes de aprobar.
5. Si la tarea modifica `vantare-go-master-plan.md` § 5 (Defaults
   Locked), exigir evidencia live en el prompt antes de aceptar.
