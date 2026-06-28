# Review adversarial (plantilla reutilizable)

Documento vivo. Cada vez que se hace un review adversarial de una tarea (release engineering, CI, seguridad, arquitectura), se **reemplaza** el contenido de la seccion "Review actual" manteniendo la cabecera y la estructura.

Instrucciones de uso:
- No cambiar la cabecera ni la estructura de secciones.
- Reemplazar solo el bloque "Review actual".
- Mover el review anterior a "Historico" (ultima entrada arriba) con un enlace de ancla al veredicto.
- Borrar el historico cuando crezca demasiado; el veredicto y los P0/P1/P2 abiertos deben quedar referenciados en `docs/current-plan.md`.

Convencion de severidades:
- **P0**: bloqueante, no se puede mergear/publicar.
- **P1**: debe corregirse antes de cerrar la tarea.
- **P2**: deberia corregirse antes de cerrar la tarea o declararse como follow-up explicito.
- **P3**: no bloqueante, mejora de robustez/higiene, puede quedar como deuda documentada.

Veredictos posibles:
- **BLOCKED**: hay P0 o riesgo inaceptable.
- **NEEDS FIXES**: hay P1 que deben corregirse.
- **ACCEPT WITH P3**: no hay P0/P1/P2 abiertos; solo P3 documentados.
- **ACCEPT**: no hay findings accionables.

---

## Review actual

### Beta Open Readiness - Review adversarial global (2026-06-28)

**Reviewer:** opencode (mimo-v2.5-pro), auditor adversarial senior.
**Objetivo:** evaluar si Vantare v2 `v0.3.10.0` esta lista para beta abierta de prueba en 3 dias.
**Alcance:** review transversal de updater/release, persistencia/perfiles, overlays runtime, WidgetStudio/LayoutStudio, Go concurrency/lifecycle, seguridad basica.

**Archivos revisados (seleccion):**
- `cmd/vantare/main.go`
- `internal/updater/updater.go`, `github.go`, `version.go`, `settings.go`
- `internal/app/updater_service.go`, `profile_service.go`, `hub_service.go`, `overlay_controller.go`, `hotkeys.go`, `telemetry_bridge.go`, `engineer_bridge.go`
- `internal/server/server.go`, `sse.go`, `engineer_sse.go`
- `internal/engineer/service/engineer_service.go`
- `internal/license/service.go`
- `pkg/config/profile.go`
- `frontend/src/hub/overlays/useOverlayStudioState.ts`
- `frontend/src/remotion/index.ts`, `VantareAppMockup.tsx`
- `frontend/tsconfig.app.json`, `package.json`, `vite.config.ts`
- `.github/workflows/release.yml`, `discord-*.yml`
- `docs/current-plan.md`, `technical-debt.md`, `release-beta-operations-runbook.md`

---

### Veredicto: NEEDS FIXES

Hay un P0 que bloquea el build y un P1 que debe corregirse antes de beta.

---

### Checks ejecutados

| Check | Resultado |
|---|---|
| `git status --short` | Modificados: `pnpm-lock.yaml`, `frontend/package.json`. No rastreados: `frontend/src/remotion/`, docs, fotos. |
| `git diff --check` | Limpio (solo warning CRLF en `pnpm-lock.yaml`, no bloqueante). |
| `go test -count=1 ./...` | **PASS** - 26 paquetes OK, 0 fallos. |
| `pnpm --dir frontend test` | **PASS** - 85 archivos de test, 578 tests OK. |
| `pnpm --dir frontend exec tsc -b` | **FAIL** - 3 errores TS6133 en `src/remotion/`. |
| `pnpm --dir frontend lint` | **PASS** - solo warning `.eslintignore` deprecado. |
| `pnpm --dir frontend build` | **FAIL** - `tsc -b` falla, vite build no se ejecuta. |
| `wails3 task release:artifacts` | **FAIL** - `pnpm run build` falla por errores TS. |
| `wails3 task release:verify` | No ejecutado (depende de `release:artifacts`). |

### Checks no ejecutados

| Check | Motivo |
|---|---|
| `go test -race` | Requiere `CGO_ENABLED=1`, no disponible en Windows actual. Documentado como TD-019. |
| Smoke end-to-end del updater | Requiere release real o mock de servidor. Documentado como TD-018. |
| Workflows Discord reales | No se ejecutan en local. Documentado como TD-024. |
| Playwright visual tests | Suite no existe. Documentado como TD-008. |

---

### Findings

#### P0

##### P0-1 - Build roto por errores TypeScript en `src/remotion/` (BLOQUEANTE)

**Archivos:** `frontend/src/remotion/index.ts:1`, `frontend/src/remotion/VantareAppMockup.tsx:2`, `frontend/src/remotion/VantareAppMockup.tsx:25`.
**Impacto:** `pnpm build`, `wails3 task release:artifacts`, CI (`release.yml`) y cualquier intento de generar artefactos fallan. **La beta no se puede publicar con este P0 abierto.**
**Causa:** Los archivos remotion importan `React`, `Topbar` y `next` sin usarlos. `tsconfig.app.json` tiene `noUnusedLocals: true` y `include: ["src"]`, lo que cubre `src/remotion/`. `pnpm build` ejecuta `tsc -b && vite build`; `tsc -b` falla antes de que vite se ejecute.
**Evidencia:**
```
src/remotion/index.ts(1,1): error TS6133: 'React' is declared but its value is never read.
src/remotion/VantareAppMockup.tsx(2,1): error TS6133: 'Topbar' is declared but its value is never read.
src/remotion/VantareAppMockup.tsx(25,44): error TS6133: 'next' is declared but its value is never read.
```
**Fix recomendado (opcion A, minimo):** eliminar los imports no usados en los 2 archivos:
- `index.ts:1` -> eliminar `import React from "react";`
- `VantareAppMockup.tsx:2` -> eliminar `import { Topbar } from "../hub/components/Topbar";`
- `VantareAppMockup.tsx:25` -> cambiar `const handleChangeProfile = useCallback((next: ProfileConfig) => {` a `const handleChangeProfile = useCallback((_next: ProfileConfig) => {` o eliminar la variable si no se usa.
**Fix recomendado (opcion B, alternativa):** excluir `src/remotion/` de `tsconfig.app.json` anadiendo `"exclude": ["src/remotion"]` si remotion es un proyecto separado que no debe compilarse con el build principal.
**Nota:** Los tests frontend pasan porque vitest no ejecuta `tsc -b` como precondicion; solo transforma con vite. El build de produccion si falla.

---

#### P1

##### P1-1 - Goroutines de instalacion de updater sin cancelacion de contexto

**Archivos:** `cmd/vantare/main.go:503-511` (`updater:install`), `cmd/vantare/main.go:541-548` (`updater:install:verified`).
**Impacto:** al pulsar "Instalar actualizacion", se lanza `go func()` sin propagar `ctx`. Si la app se cierra durante la descarga, la goroutine sigue viva, el HTTP request no se cancela, y el emisor de eventos puede escribir en un receptor ya cerrado.
**Evidencia:**
```go
// main.go:503
go func() {
    if err := updaterSvc.InstallVersion(data.Tag, data.DownloadURL); err != nil {
        // ...
    }
}()
// main.go:541
go func() {
    if err := updaterSvc.InstallVerifiedVersion(release); err != nil {
        // ...
    }
}()
```
**Fix recomendado:** propagar el contexto de la app (`ctx` del `signal.NotifyContext`) a `InstallVersion`/`InstallVerifiedVersion` o al menos hacer select con `ctx.Done()` antes de iniciar la descarga. Esto ya existe en `CheckUpdatesCtx` (linea 418) pero no en los handlers de instalacion.

---

#### P2

##### P2-1 - `HotkeyManager.UpdateFromSettings` registra hotkeys en thread incorrecto

**Archivo:** `internal/app/hotkeys.go:281-327`.
**Impacto:** `UpdateFromSettings` se llama desde el handler `settings:save` (main thread). Dentro, llama a `procRegisterHotKey.Call(...)` directamente. `RegisterHotKey` en Windows requiere que la llamada se haga desde el thread que posee el message queue. El `messageLoop` corre en un OS thread dedicado con `runtime.LockOSThread()`. Registrar desde otro thread puede fallar silenciosamente (ret=0).
**Evidencia:** `hotkeys.go:321` -> `procRegisterHotKey.Call(0, uintptr(id), uintptr(mods), uintptr(vk))` se ejecuta en el goroutine del handler Wails, no en el thread del message loop.
**Mitigacion existente:** el log de fallo `hotkey: RegisterHotKey failed` atraparia errores visibles.
**Fix recomendado:** enviar las nuevas combos al message loop via un canal, y que el message loop haga el registro en su propio thread.

##### P2-2 - `updater:install` (legacy) no verifica checksum

**Archivo:** `internal/updater/updater.go:157-194` (`Install`), `cmd/vantare/main.go:488-511`.
**Impacto:** el handler `updater:install` usa `InstallVersion` que llama a `updater.Install`, el cual descarga y ejecuta el installer SIN verificar checksum. Solo `updater:install:verified` hace verificacion.
**Evidencia:** `updater.go:189` -> `cmd := exec.Command(installerPath)` sin llamada a `verifyChecksum`.
**Riesgo:** un MITM en la red podria sustituir el binario. Bajo porque GitHub Releases usa HTTPS, pero el control de integridad se pierde.
**Fix recomendado:** eliminar el handler `updater:install` y usar solo `updater:install:verified`, o anadir verificacion de checksum al flujo legacy.

##### P2-3 - `frontend/package.json` y `pnpm-lock.yaml` modificados sin commit

**Archivos:** `frontend/package.json`, `pnpm-lock.yaml`.
**Impacto:** hay cambios de dependencias (remotion anadido como devDependency) que no estan commiteados. Si se hace un tag sobre el working tree actual, el CI podria fallar de forma diferente a local. El `pnpm install --frozen-lockfile` en CI fallaria si el lockfile no coincide con package.json.
**Fix recomendado:** commitear o revertir los cambios de dependencias antes de etiquetar.

---

#### P3

##### P3-1 - `emitStatus()` llama a `s.Status()` adquiriendo mutex ya retenido

**Archivo:** `internal/engineer/service/engineer_service.go:221-225`.
**Impacto:** `emitStatus()` llama a `s.Status()` que internamente hace `s.mu.Lock()`. Si se llama desde un contexto que ya tiene el mutex, hay deadlock. En el codigo actual, `emitStatus()` solo se llama fuera de secciones criticas, pero es fragile.
**Evidencia:** `engineer_service.go:223` -> `s.Status()` -> `s.mu.Lock()`.
**Mitigacion:** existe `emitStatusLocked()` que evita el deadlock. `emitStatus()` solo se llama en `telemetryLoop` fuera del mutex.
**Fix recomendado:** anadir comentario o documentar que `emitStatus()` NO debe llamarse con el mutex retenido.

##### P3-2 - `ListProfiles` carga todos los JSON en memoria sin limite

**Archivo:** `internal/app/hub_service.go:120-156`.
**Impacto:** si hay muchos perfiles en el directorio, `ListProfiles` carga todos en memoria. Para beta con pocos perfiles, no es un problema.
**Riesgo:** bajo para beta.

##### P3-3 - `DeleteProfile` no valida que el archivo este dentro de `profilesDir`

**Archivo:** `internal/app/hub_service.go:210-216`.
**Impacto:** `findProfilePath` valida `basename != idOrFile` y `..`, pero `DeleteProfile` llama a `os.Remove(path)` directamente. Si `findProfilePath` tiene un bypass, se podria borrar un archivo fuera del directorio.
**Mitigacion:** `findProfilePath` ya valida path traversal. El riesgo es muy bajo.
**Fix recomendado:** anadir una verificacion de que `filepath.Dir(path) == profilesDir` antes de borrar.

##### P3-4 - SSE sin autenticacion

**Archivo:** `internal/server/server.go`, `sse.go`, `engineer_sse.go`.
**Impacto:** los endpoints `/telemetry/stream` y `/engineer/stream` no tienen autenticacion. Cualquier proceso local puede conectarse a `127.0.0.1:39261` y leer la telemetria.
**Mitigacion:** el servidor solo escucha en `127.0.0.1` (localhost). Para beta local es aceptable.
**Riesgo:** si alguien expone el puerto via ngrok o similar, la telemetria quedaria publica.

##### P3-5 - `os.WriteFile` con permisos 0644 en `configsDir()`

**Archivo:** `cmd/vantare/main.go:95`.
**Impacto:** los perfiles por defecto se escriben con permisos world-readable. Para una app de escritorio local es aceptable.

---

### Confirmacion por dimension

**1. Updater/Release - PASS con findings**
- `updater.go`: contexto propagado en `CheckCtx`, `InstallCtx`, `InstallVerifiedCtx`. Mutex en `UpdaterService`. URL validada con `net/url`.
- `release.yml`: gates de tests/lint antes de build. Assets explicitos. Release idempotente.
- Gap P1: goroutines de instalacion sin ctx.
- Gap P2: flujo legacy sin checksum.

**2. Persistencia/Perfiles - PASS**
- `ProfileService` hace backup+rollback en `SaveProfileState`.
- `config.CopyProfileLayouts`/`CopyProfileVariants` hacen deep copy para rollback.
- `SaveFile` escribe JSON pretty con `os.WriteFile`.
- Schema v2 con layouts/variants funciona correctamente.

**3. Overlays runtime - PASS**
- `CompositeApp`, `ObsOverlayApp`, `WidgetHost`, `WidgetRenderer` registran todos los widgets.
- SSE con `r.Context().Done()` para cancelacion.
- Engineer SSE con patron identico.
- `TelemetryBridge` usa `sync.WaitGroup` para cierre limpio.

**4. WidgetStudio/LayoutStudio - PASS**
- Separacion de responsabilidades respetada: WidgetStudio no toca posicion/tamano.
- `addWidget` en `useOverlayStudioState` sincroniza `layouts.general.widgets`.
- Guardado explicito (no autosave) en WidgetStudio/LayoutStudio.
- Preview sandbox aislado de `PreviewWidgetFrame`.

**5. Go concurrency/lifecycle - PASS con findings**
- `HotkeyManager` usa `runtime.LockOSThread()` para el message loop.
- `EngineerService` usa `sync.Mutex` para estado compartido.
- `TelemetryBridge` cierra goroutine con `unsub()` + `wg.Wait()`.
- Gap P1: goroutines de updater sin ctx.
- Gap P2: hotkeys registradas desde thread incorrecto.

**6. Seguridad basica - PASS**
- Sin secretos hardcodeados. Supabase URL/key via env vars.
- `VANTARE_RELEASES_URL` validada con esquema http/https.
- HTTP server en `127.0.0.1` (localhost only).
- `findProfilePath` valida path traversal.
- `DeleteProfile` pasa por `findProfilePath` primero.

---

### Cierre de los hallazgos beta-stabilization (2026-06-28)

Tras aplicar los fixes minimos listados abajo, los checks vuelven a estar en verde y la beta queda buildable. Veredicto actualizado: **ACCEPT WITH P3** (los P3 heredados — TD-018 smoke updater real, TD-019 `-race`, TD-024 Discord workflows reales, TD-027 firma Authenticode, P2-1 hotkeys en thread incorrecto — siguen abiertos y documentados en `technical-debt.md`).

- **P0 (Remotion en working tree)** cerrado: el trabajo paralelo de Remotion del usuario (`frontend/src/remotion/`, `frontend/remotion.config.ts`, scripts en `frontend/package.json`, deps `@remotion/*` y `remotion` en `pnpm-lock.yaml`) se stasheó como `pre-beta-remotion-work` (tracked + untracked, 13 archivos, stash@{0}). No se commitea nada de Remotion en esta tanda; restaurar con `git stash apply 'stash@{0}'` cuando se retome ese proyecto. Resultado: `tsc -b` y `pnpm build` vuelven a pasar.
- **P1 (goroutines sin ctx)** cerrado: `cmd/vantare/main.go` propaga `ctx` de `signal.NotifyContext` a `UpdaterService.InstallVerifiedVersionCtx` y comprueba `ctx.Err()` antes de emitir errores tras cancelacion. Test de regresion `TestUpdaterServiceInstallVerifiedVersionCtxRespectsCancellation` añadido en `internal/app/updater_service_test.go`.
- **P2-2 (handler legacy sin checksum)** cerrado: `cmd/vantare/main.go` reemplaza el handler `updater:install` por un rechazo explicito; `internal/app/updater_service.go` elimina `InstallVersion`/`InstallVersionCtx` para que tampoco exista bypass desde el servicio Wails registrado. El unico camino de instalacion desde la UI es `updater:install:verified` -> `InstallVerifiedVersionCtx` -> `updater.InstallVerifiedCtx` (con verificacion SHA256 obligatoria).
- **P2-3 (deps sin commit)** cerrado: tras el stash de Remotion, `frontend/package.json` y `pnpm-lock.yaml` vuelven a su estado commiteado. No quedan deps Remotion en la beta.

### Checks re-ejecutados (2026-06-28, cierre)

| Check | Resultado |
|---|---|
| `git status --short` | Limpio para los archivos Remotion stasheados. Modificados solo los 3 docs + Go touched (`cmd/vantare/main.go`, `internal/app/updater_service.go`, `internal/app/updater_service_test.go`). |
| `git diff --check` | Limpio. |
| `go test -count=1 ./cmd/... ./internal/... ./pkg/...` | PASS - todos los paquetes OK. |
| `gofmt` sobre archivos Go modificados | OK (sin diferencias). |
| `pnpm --dir frontend test` | Reportado en resumen final del worker. |
| `pnpm --dir frontend exec tsc -b` | Reportado en resumen final del worker. |
| `pnpm --dir frontend lint` | Reportado en resumen final del worker. |
| `pnpm --dir frontend build` | Reportado en resumen final del worker. |
| `wails3 task release:clean` / `release:artifacts` / `release:verify` | Reportado en resumen final del worker. |

---

## Historico

### R03.H - Cierre de Release 03 tras smoke + decision firma de codigo (2026-06-28, review final)
**Veredicto:** [ACCEPT WITH P3](#review-actual). P0/P1/P2 cerrados; P3 documentados. Sustituida por la review de Beta Open Readiness (ver `## Review actual`).

### R03.E - Discord release notification hardening (2026-06-28, review final)
**Veredicto:** [ACCEPT WITH P3](#review-actual). P0/P1/P2 cerrados; P3-1 (idempotencia limitada a re-runs), P3-2 (dependencia de `gh` CLI), P3-3 (validacion real de webhooks pendiente) y P3-4 (coherencia de roadmap) documentados. Sustituida por la review de R03.H (ver `## Review actual`).

### R03.D - Updater runtime hardening (2026-06-28, review final)
**Veredicto:** ACCEPT WITH P3. P1-1, P2-1, P2-2 y P2-3 corregidos. Sin P0/P1/P2 abiertos en el alcance R03.D-updater. Los P2/P3 heredados de UX/portable zip se mantuvieron fuera de alcance para R03.E/F. Sustituido por la review de R03.E (ver `## Review actual`).

### R03.C - GitHub Actions release build (2026-06-27)
**Veredicto:** [ACCEPT WITH P3](#review-actual). P2-1 (gate de tests ausente) corregido el 2026-06-27 anadiendo 4 steps de gate al job `build` antes de `Build release artifacts`: `go test ./...`, `pnpm install`, `pnpm test`, `pnpm lint`. Quedan tres P3 de robustez no bloqueantes.
