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

### R03.D - Updater runtime hardening (2026-06-28, review final)

**Reviewer:** worker senior de Go / release engineering.
**Tarea revisada:** R03.D - revisar y endurecer el updater runtime para consumir correctamente los GitHub Releases generados por R03.C.
**Nota de alcance:** el plan tecnico `docs/superpowers/plans/2026-06-27-release-03-autoupdater-distribution-technical-plan.md` asigna R03.D a "Discord release notification". El presente trabajo atiende la peticion explicita del usuario de endurecer el updater runtime; se trata como sub-tarea R03.D-updater con overlap logico con R03.E del plan tecnico.

**Archivos revisados:**
- `internal/updater/updater.go`
- `internal/updater/github.go`
- `internal/updater/version.go`
- `internal/updater/settings.go`
- `internal/updater/updater_test.go`
- `internal/updater/github_test.go`
- `internal/app/updater_service.go`
- `internal/app/updater_service_test.go`
- `cmd/vantare/main.go`
- `docs/current-plan.md`
- `docs/technical-debt.md`

### Veredicto: ACCEPT WITH P3 (ningun P0/P1/P2 abierto en el alcance R03.D-updater)

Los findings P1-1, P2-1, P2-2 y P2-3 de la revision anterior han sido corregidos. No quedan P0/P1/P2 abiertos del alcance del runtime del updater. Los P2/P3 heredados de UX y alcance (UX fragmentada, consumo de portable zip, release notes en banner, bandera `IsDowngrade`) se documentan en `docs/technical-debt.md` y deben abordarse en R03.E/R03.F segun el plan tecnico; no bloquean R03.D.

### Checks ejecutados
- `git status --short` → cambios sin commit identificados (trabajo ajeno de releases previos; no se mezclo con este cambio).
- `gofmt` sobre `internal/updater/*.go`, `internal/updater/*_test.go`, `internal/app/updater_service.go`, `internal/app/updater_service_test.go`, `cmd/vantare/main.go`.
- `go test ./internal/updater/... ./internal/app/...` → OK.
- `go test ./...` → OK (todos los paquetes en verde).
- `go vet ./internal/updater/... ./internal/app/...` → OK.
- `git diff --check` → limpio.
- Lectura estatica completa de los archivos del updater, service, main.go y tests.

### Checks no ejecutados
- `pnpm --dir frontend test` / `pnpm --dir frontend build` / `pnpm --dir frontend lint`: no se toco frontend en esta sesion.
- `go test -race ./internal/updater/... ./internal/app/...`: el entorno Windows actual no tiene CGO habilitado (`-race` requiere `CGO_ENABLED=1`).
- Ejecucion real del workflow `.github/workflows/release.yml` en GitHub Actions (requiere push de tag o `workflow_dispatch`).
- Descarga/instalacion real de un release contra GitHub (requiere tag pre-release real).

### Findings

#### P0
Ninguno.

#### P1

##### P1-1 - Startup updater check no cancela HTTP en curso (CORREGIDO)
**Archivos:** `cmd/vantare/main.go`, `internal/app/updater_service.go`.
**Fix:** Se añadio `UpdaterService.CheckUpdatesCtx(ctx context.Context)` y `CheckUpdatesManualCtx(ctx)`; los wrappers `CheckUpdates()` / `CheckUpdatesManual()` se mantienen para compatibilidad. La goroutine de startup en `main.go` llama a `CheckUpdatesCtx(ctx)`, comprueba `ctx.Err()` antes de emitir `updater:notify` y evita emitir si el contexto esta cancelado.
**Tests:** `TestUpdaterServiceContextCancellation`.

#### P2

##### P2-1 - `VANTARE_RELEASES_URL` no valida esquema (CORREGIDO)
**Archivo:** `internal/updater/github.go`.
**Fix:** `releasesURL()` parsea la env var con `net/url`, acepta solo `http`/`https`, rechaza host vacio y devuelve error claro si la URL es invalida; si la env var esta vacia usa el fallback oficial. `updater.New` propaga el error; `NewUpdaterService` tambien devuelve error; `cmd/vantare/main.go` registra el updater solo si la inicializacion es valida y loguea un error claro si no.
**Tests:** `TestReleasesURLDefaultsToGitHub`, `TestReleasesURLOverrideValid`, `TestReleasesURLRejectsInvalidScheme`, `TestReleasesURLRejectsEmptyHost`, `TestNewRejectsInvalidReleasesURL`.

##### P2-2 - Race/read-modify-write en `UpdaterService.checkUpdates` (CORREGIDO)
**Archivo:** `internal/app/updater_service.go`.
**Fix:** Se añadio `sync.Mutex` a `UpdaterService`. Los metodos `checkUpdates`, `SaveSettings`, `GetSettings` e `IgnoreVersion` estan protegidos. Se separaron helpers internos (`loadSettings`, `saveSettings`) para evitar deadlocks. La seccion critica cubre la secuencia completa de lectura-modificacion-escritura de settings.
**Tests:** `TestUpdaterServiceConcurrentChecksAndIgnore`.

##### P2-3 - Veredicto documental incoherente (CORREGIDO)
**Archivos:** `docs/adversarial-review.md`, `docs/technical-debt.md`, `docs/current-plan.md`.
**Fix:** Se actualizo `docs/adversarial-review.md` a `ACCEPT WITH P3` sin P0/P1/P2 abiertos en el alcance R03.D-updater. Los P2/P3 heredados de UX/alcance se movieron/confirmaron en `docs/technical-debt.md` con release objetivo R03.E/F y explicacion de que no bloquean R03.D. `docs/current-plan.md` refleja el nuevo estado.

#### P3

##### P3 opcional - Limpiar installer descargado si `verifyChecksum` falla (CORREGIDO)
**Archivo:** `internal/updater/updater.go`.
**Fix:** `InstallVerifiedCtx` elimina el installer descargado cuando `verifyChecksum` devuelve error, evitando dejar un binario no verificado en disco.
**Tests:** `TestInstallVerifiedHashMismatch` verifica que el archivo no queda tras un hash mismatch.

### Confirmacion por dimension

**1. Cancelacion de HTTP en startup - PASS**
- La goroutine de startup usa `CheckUpdatesCtx(ctx)` con el contexto global de la app.
- Se comprueba `ctx.Err()` antes de emitir; no se envian eventos tras el cierre.

**2. Validacion de URL de releases - PASS**
- Solo `http`/`https` con host no vacio son aceptados.
- URL invalida se surface como error claro en startup y no registra un updater roto.

**3. Concurrencia en settings - PASS**
- Mutex protege toda la secuencia read-modify-write.
- Test de concurrencia con checks manuales/automaticos e `IgnoreVersion` concurrentes pasa.

**4. Descarga y verificacion - PASS**
- Context propagado a toda la cadena HTTP.
- Limpieza de archivo parcial preservada.
- Checksum obligatorio para installer oficial.
- Installer no verificado se elimina tras fallo de checksum.

**5. Manejo de errores - PASS**
- Rate limit distinguido.
- URL mal configurada no se oculta.
- Release sin checksum se rechaza en `InstallVerified`.

**6. Tests - PASS con cobertura ampliada**
- Se anadieron tests de contexto, validacion de URL, concurrencia y limpieza de installer.
- Suite completa pasa.

### Riesgos restantes
1. **UX fragmentada (heredado, P2):** los usuarios tienen dos caminos para actualizar; puede causar confusion. Se resuelve en R03.F. Documentado en `docs/technical-debt.md`.
2. **Sin consumo de portable zip desde el updater (heredado, P2):** requiere decision de UX. Documentado en `docs/technical-debt.md`.
3. **`UpdateBanner` no muestra release notes (heredado, P3):** se abordara en R03.F si se unifica UX. Documentado en `docs/technical-debt.md`.
4. **`Info.IsDowngrade` duplica logica de UI (heredado, P3):** no es bloqueante. Documentado en `docs/technical-debt.md`.
5. **Sin prueba end-to-end real:** no se valido descarga/instalacion desde una Release real. Recomendado antes de declarar Release 03 completo. Documentado en `docs/technical-debt.md`.
6. **Sin `go test -race`:** no ejecutado por falta de CGO en el entorno Windows actual; el cambio toca goroutines/lifecycle. Documentado en `docs/technical-debt.md`.

### Conclusion
R03.D-updater puede considerarse cerrado a nivel runtime. No quedan P0/P1/P2 abiertos en el alcance de esta sub-tarea. Los P2/P3 restantes son de UX/alcance y estan documentados para R03.E/R03.F. Recomendado ejecutar un smoke test end-to-end con un tag pre-release real antes de declarar Release 03 completo.

---

## Historico

### R03.D - Updater runtime hardening (2026-06-28, P1/P2 de segunda pasada abiertos)
**Veredicto:** segunda revision del runtime del updater encontro P1-1 (startup check sin cancelar HTTP), P2-1 (URL sin validar esquema), P2-2 (race en settings) y P2-3 (veredicto documental incoherente). Sustituida por la review final del 2026-06-28 (ver `## Review actual`), que cierra P1-1, P2-1, P2-2 y P2-3. Los P2/P3 heredados de UX/portable zip se mantuvieron fuera de alcance para R03.E/F.

### R03.D - Updater runtime hardening (2026-06-27, P1 activos)
**Veredicto:** review inicial con P1 activos (URL hardcodeada, goroutine sin context, sin cache/rate-limit, checksum no obligatorio). Resuelto en el cierre del worker senior Go/updater/runtime; los P1 fueron subsumidos en los P1/P2 de la segunda pasada (2026-06-28).

### R03.C - GitHub Actions release build (2026-06-27)
**Veredicto:** [ACCEPT WITH P3](#review-actual). P2-1 (gate de tests ausente) corregido el 2026-06-27 anadiendo 4 steps de gate al job `build` antes de `Build release artifacts`: `go test ./...`, `pnpm install`, `pnpm test`, `pnpm lint`. Quedan tres P3 de robustez no bloqueantes (P3-1 release idempotente, P3-2 glob amplio en `gh release create`, P3-3 verificacion de version NSIS, P3-4 nota doc de `SHA256SUMS.txt`).