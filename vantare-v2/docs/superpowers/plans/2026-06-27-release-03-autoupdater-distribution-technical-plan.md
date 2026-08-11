> **Plan status: historical**
> Snapshot conservado como evidencia. No autoriza ejecución. Las referencias a
> `docs/current-plan.md`, `develop`, `refactor`, ramas, bases o siguientes
> acciones son históricas y quedan sustituidas por Linear y Git.

# Release 03 - Autoupdater y Distribucion - Plan Tecnico

> **Origen:** orquestacion senior del 2026-06-27. Documento ejecutable por workers. No implementa codigo: prepara Release 03.
> **Predecesor obligatorio:** `docs/superpowers/plans/2026-06-26-release-03-autoupdater-distribution.md` (plan estrategico). Este documento es el miniplan tecnico derivado que ese plan pedia.

---

## 0. Condicion previa obligatoria

**Release 02 debe estar congelada antes de implementar Release 03.**

Estado real al 2026-06-27:

- Release 02 Mini-Plan A/B/C estan commiteados (ultimo commit `2a69bc5 feat: add release auth licensing foundation`).
- Webhook entitlement mapping implementado con tests.
- Pendiente: **gate manual** de OAuth/Stripe real y validacion del flujo OAuth en builds empaquetadas de Wails.

Regla: **no mezclar implementacion de Release 03 con el gate manual de Release 02.** Antes de iniciar R03.A-R03.H, una de estas dos condiciones debe cumplirse:

1. Release 02 esta taggeada (`vX.X.X.X`) y el gate manual OAuth/Stripe se valido en build empaquetada; o
2. Release 02 se declara explicitamente **congelada** por Isaac (cambios en rama separada o Working Tree limpio sin touch de auth/licensing) y R03 avanza sin tocar `internal/license/`, `frontend/src/hub/auth/`, `frontend/src/lib/supabase-auth.ts`, ni el schema/Supabase/Stripe.

Si hay cambios sin commitear de Release 02 en el Working Tree al empezar R03, el worker debe parar y reportar (Stop condition de AGENTS.md).

---

## 1. Inventario tecnico actual (build/distribucion/updater)

### 1.1 Sistema de build

- **Stack:** Go + Wails v3 + React/TypeScript. Frontend con pnpm/Vite.
- **Build orchestration:** `Taskfile.yml` (raiz `vantare-v2/`) con includes a `build/Taskfile.yml` (comun) y `build/windows/Taskfile.yml`.
- **Build Windows nativo:** `build/windows/Taskfile.yml` task `build:native`:
  - `go mod tidy` + `build:frontend` (pnpm) + `generate:icons` + `generate:syso`.
  - `go build -tags production -trimpath -buildvcs=false -ldflags="-w -s -H windowsgui"` a `bin/vantare.exe`.
  - `CGO_ENABLED=0` por defecto (cross-compile nativo). Docker cross solo si `CGO_ENABLED=1` en no-Windows.
- **Dev build:** `wails3 dev -config ./build/config.yml -port 9245`.
- **No existe workflow de CI** que genere artefactos. El build es 100% local/manual.

### 1.2 Artefactos generados ahora

- `bin/vantare.exe` — ejecutable Windows amd64.
- `bin/vantare-amd64-installer.exe` — instalador NSIS (generado por `create:nsis:installer`).
- **No existe** portable `.zip` automatizado en el Taskfile.
- **No existe** generacion automatica de checksum `.sha256`.
- **No existe** publicacion automatica a GitHub Releases.

### 1.3 Versionado — fuentes y desincronizacion

Existen **cuatro** fuentes de version, desincronizadas:

| Ubicacion | Valor actual | Tipo |
|---|---|---|
| `cmd/vantare/main.go:34` | `var version = "v0.3.10.0"` | string literal hardcodeada, sin ldflags |
| `build/config.yml:14` | `version: "0.3.10.0"` | metadata Wails |
| `build/windows/info.json` | `0.1.1` (ProductVersion, FileDescription "Pre-alpha v0.1.1-prealpha") | metadatos exe Windows |
| `build/windows/nsis/project.nsi:25` | `INFO_PRODUCTVERSION "0.2.12"` | version del instalador NSIS |

**No hay inyeccion por ldflags.** La version del binario se cambia editando `main.go` a mano. `build/config.yml` se actualiza manualmente. `info.json` y `project.nsi` llevan anclados en versiones viejas desde hace muchas releases.

### 1.4 Empaquetado Wails

- NSIS funcional en `build/windows/nsis/project.nsi`:
  - Install scope `user` (`$LOCALAPPDATA\Programs\Vantare Overlays`).
  - Cierre graceful de `vantare.exe` (`CloseVantareGracefully`: taskkill, espera 5s, force).
  - **Backup + rollback:** renombra `vantare.exe` → `vantare.exe.bak` antes de extraer; si falla la extraccion o el exe nuevo no se valida (`FileOpen` + `FileSeek` > 1024 bytes), restaura `.bak` y aborta con mensaje claro.
  - Atajo escritorio + menú inicio. Desinstalador limpia `$AppData\vantare.exe` (Webview2) e `$INSTDIR`.
  - Asset esperado por el updater: `vantare-amd64-installer.exe`.
- MSIX: task existe (`create:msix:package`) pero requiere cert/config adicional; no se usa.
- Firma de codigo: tasks `sign` y `sign:installer` existen pero `SIGN_CERTIFICATE`/`SIGN_THUMBPRINT` estan vacios. **Sin firma → SmartScreen advierte.**

### 1.5 Workflows GitHub Actions

Ubicados en el **raiz del repo Git** (`Vantare-Overlays/.github/workflows/`), no en `vantare-v2/`. Solo Discord:

| Workflow | Trigger | Funcion |
|---|---|---|
| `discord-release.yml` | push tag `v*` o manual | Lee seccion `## vX.X.X.X` de `vantare-v2/docs/changelog.md` y la publica en Discord |
| `discord-build-available.yml` | manual (`workflow_dispatch`) | Publica version + download_url + sha256 opcional |
| `discord-beta-progress.yml` | al tocar `current-plan.md`/`roadmap-execution-board.md` | Progreso beta |
| `discord-known-issues.yml` | al tocar `tester-known-issues.md` | Known issues |

**No hay workflow de build/release.** La publicacion a GitHub Releases es manual (subir artefactos a mano o via `gh release create`).

### 1.6 Publicacion a Discord actual

- `discord-release.yml` es automatico por tag `v*`. Depende de coincidencia exacta tag ↔ header `## vX.X.X.X` en `docs/changelog.md`.
- `discord-build-available.yml` es manual y requiere `version` + `download_url` (+ `sha256` opcional).
- Secretos: `DISCORD_RELEASE_WEBHOOK_URL`, `DISCORD_BUILD_WEBHOOK_URL`, `DISCORD_WEBHOOK_URL` (fallback). Si faltan, el workflow falla con mensaje claro.

### 1.7 Autoupdater — estado real (ya existe implementacion considerable)

**Ya hay un updater funcional** en Go + frontend, no es greenfield:

Go:
- `internal/updater/updater.go` — `Updater` con `Check`, `ListAvailable`, `Install`, `InstallVerified` (download + verify SHA256 + launch installer), `downloadFile` con progress, `verifyChecksum`, `fetchChecksum`.
- `internal/updater/github.go` — `Release`/`Asset`, `ListReleases` contra `https://api.github.com/repos/isaacalbala12/Vantare-Overlays/releases`. `FindInstaller` busca `vantare-amd64-installer.exe`. `FindChecksumAsset` busca `vantare-amd64-installer.exe.sha256`.
- `internal/updater/version.go` — `ParseVersion` + `Compare`. **Parser de 3 campos (Major.Minor.Patch)**; el 4º digito cae al `Suffix`. Funciona por accidente porque el 4º digito suele ser 0, pero contradice el formato `X.X.X.X` documentado.
- `internal/updater/settings.go` — `Settings{Channel, IgnoreVersion}`, channels `stable`/`prerelease`, persistencia JSON en `updater-settings.json`.
- `internal/app/updater_service.go` — `UpdaterService` expuesto a Wails.
- `cmd/vantare/main.go`:
  - Registro del servicio + handlers de eventos `updater:check`, `updater:install`, `updater:install:verified`, `updater:ignore`, `updater:settings:get/save`.
  - **Check silencioso en startup** (goroutine con `time.Sleep(5s)` + `CheckUpdates` + emit `updater:notify`).
  - `installerURL(release)` devuelve URL del installer o HTMLURL.
  - Broadcast `app:version` para UI.

Frontend:
- `frontend/src/hub/components/UpdateBanner.tsx` — banner topbar con "Descargar" (abre navegador externo) y "Saltar" (emit `updater:ignore`).
- `frontend/src/hub/pages/SettingsPage.tsx` — UI completa: settings canal, check, lista de releases, instalar verificado, ignorar, progress, error.
- `frontend/src/hub/HubApp.tsx` + `pages/HubApp.tsx` — escuchan `app:version`.

Tests:
- `internal/updater/updater_test.go`, `github_test.go`, `version_test.go`, `settings_test.go`.
- `frontend/src/hub/components/UpdateBanner.test.tsx`, `frontend/src/hub/pages/SettingsPage.test.tsx`.

### 1.8 Rollback actual

- NSIS: backup `.bak` + restore en fallo de extraccion (a nivel instalador).
- App: no hay downgrade in-app. `IgnoreVersion` solo silencia notificaciones.
- Tag mal etiquetado: runbook documenta borrado/re-tag (no reutilizar tags).

### 1.9 Compatibilidad con builds anteriores

- Configs: `configsDir()` detecta portable (configs junto al exe), dev (CWD) o instalado (`%AppData%/Vantare/configs`). Migracion de configs embebidos solo si no existen.
- WebView2 user-data folder versionado (`webview_v0.3.10.0`) para evitar cache cross-release.
- Profiles: schema v2 con espejo legacy; no migracion silenciosa.

---

## 2. Riesgos

### P0 — bloqueantes para release reproducible

- **R-P0-1: Version desincronizada en 4 lugares y sin ldflags.** `main.go` hardcodea la version; `info.json` (0.1.1) y `project.nsi` (0.2.12) anclados en versiones viejas. Builds no reproducibles sin tocar codigo. Metadatos del exe/installer mienten la version real.
- **R-P0-2: No existe CI de build/release.** Publicacion 100% manual: error-propensa, no reproducible, sin trazabilidad automatica de artefactos, sin checksums publicados salvo manual.
- **R-P0-3: Sin firma de codigo.** Autoupdater que lanza un installer sin verificar firma es vector de supply-chain. SHA256 mitiga integridad pero no autenticidad. Para beta privada es aceptable con aviso SmartScreen; para release estable publico NO.

### P1 — importantes

- **R-P1-1: Version parser de 3 campos vs esquema X.X.X.X.** `version.go` ignora el 4º digito (cae a suffix). Funciona por accidente hoy; cualquier versionado serio con 4 digitos se rompe. Contradice `docs/versioning-and-release-gates.md`.
- **R-P1-2: URL repo hardcodeada** `isaacalbala12/Vantare-Overlays` en `internal/updater/github.go`. Si cambia el repo/owner, updater se rompe silenciosamente.
- **R-P1-3: Goroutine de startup sin context/cancelacion.** `time.Sleep(5s)` bloqueante; si la app cierra antes, goroutine suelta. Anti-patron Go (AGENTS.md exige cancelacion en goroutines).
- **R-P1-4: Sin cache/rate-limit del manifest.** Cada check golpea GitHub API anonima (60 req/h). Si muchos testers abren la app a la vez, rate-limit. No hay `If-Modified-Since`/ETag.
- **R-P1-5: Sin manifest firmado separado.** Confia en GitHub API + HTTPS. Aceptable beta; insuficiente release estable.
- **R-P1-6: Changelog 100% manual.** Discord release depende de coincidencia exacta tag ↔ header; error tipografico rompe la publicacion.

### P2 — menores

- **R-P2-1: UX de update fragmentada.** `UpdateBanner` abre navegador externo; `SettingsPage` tiene install verificado in-app. Dos caminos inconsistentes.
- **R-P2-2: No hay portable `.zip` automatizado** en Taskfile. Portable se arma a mano.
- **R-P2-3: `info.json`/`project.nsi` con metadatos viejos** (0.1.1 / 0.2.12) generan exe/installer con version incorrecta en propiedades de Windows.
- **R-P2-4: No hay generacion automatica de `.sha256`** como asset de release. El updater lo busca (`FindChecksumAsset`) pero nadie lo publica hoy.

### P3 — cosméticos

- **R-P3-1:** `discord-build-available.yml` apunta known issues a `blob/main/vantare-v2/docs/...` (rama `main` vs `master` real).
- **R-P3-2:** `UpdateBanner` no muestra release notes, solo tag + boton descargar.

---

## 3. Decision recomendada

**Hibrido por fases.** El autoupdater ya existe y funciona (check + download + verify SHA256 + launch installer + NSIS con backup/rollback). No reescribir. Consolidar y endurecer:

- **No hacer autoupdater "completo" ahora** (reemplazo en caliente, differential updates, bin patching). El modelo "download installer + verify SHA256 + NSIS maneja cierre/backup/rollback + relanzar" es razonable para beta y beta publica de pago inicial.
- **Update checker + descarga manual** NO es suficiente porque ya hay install verificado in-app; seria un paso atras.
- **Firma de codigo** debe esperar a decision de Isaac / Release 14-15. Mientras tanto, aviso SmartScreen documentado (runbook ya lo hace).

Razon: el coste de un autoupdater completo (firma, reemplazo en caliente, differential) es alto y la firma requiere certificado EV/personal que es decision de producto. Consolidar lo existente entrega valor real en R03 sin bloquearse por firma.

---

## 4. Miniplan Release 03 — segmentado

Cada segmento es un miniplan acotado. Ejecutar en orden salvo decision explicita. Cada segmento cierra con: inventario, implementacion por worker, review GLM adversarial, fixes P0/P1/P2, checks automaticos, verificacion manual si toca UI/runtime, update documental, commit/push/tag si es checkpoint funcional.

### R03.A — Version source of truth

- **Objetivo:** Una unica fuente de version inyectada por ldflags en build time; sincronizar `main.go`, `build/config.yml`, `build/windows/info.json`, `build/windows/nsis/project.nsi`.
- **Archivos probables:**
  - `cmd/vantare/main.go` — reemplazar `var version = "v0.3.10.0"` por `var version = ""` poblado por ldflags `-X main.version=...` con fallback a dev string.
  - `build/windows/Taskfile.yml` — inyectar ldflags con version desde una var/env (`APP_VERSION`).
  - `Taskfile.yml` (raiz) — exponer `APP_VERSION` con default leido de `build/config.yml` o un `VERSION` file.
  - `build/config.yml` — mantener `info.version` como fuente humana.
  - `build/windows/info.json` — sincronizar `ProductVersion`/`FileDescription`/`Comments`.
  - `build/windows/nsis/project.nsi` — sincronizar `INFO_PRODUCTVERSION`.
  - Opcional: `internal/version/version.go` paquete para centralizar (consumidor unico: `main.go` + `updater`).
- **Archivos prohibidos:** `internal/license/**`, `frontend/src/hub/auth/**`, `frontend/src/lib/supabase-auth.ts`, `supabase/**`, `internal/telemetry/**`, `pkg/config/**`, `frontend/src/overlay/**`, `internal/engineer/**`, `.github/workflows/**` (tocan R03.C/D), `build/windows/nsis/project.nsi` logica de cierre/backup (solo version).
- **Tests/checks:** `go test ./internal/updater/... ./internal/app`, `go build` con version inyectada y verificar binario reporta version correcta (test que lea ldflags), `pnpm --dir frontend test`, `pnpm --dir frontend build`, `pnpm --dir frontend lint`, `gofmt`, `git diff --check`.
- **Riesgos:** cambiar ldflags puede romper dev build (`wails3 dev`). Verificar dev mode funciona con fallback. No introducir `internal/version` si no hace falta (evitar paquete de un consumidor).
- **Requiere GLM review:** SI (P0, toca build reproducible).
- **Verificacion manual:** `wails3 task build`, inspeccionar propiedades del exe (Windows muestra ProductVersion), abrir app y confirmar version visible en Hub.
- **Stop conditions:** si tocar ldflags rompe `wails3 dev` y no hay fallback limpio; si `info.json`/`project.nsi` requieren regenerar assets con `wails3 update build-assets` y eso muta otros metadatos no previstos.

### R03.B — Build artifacts reproducibles

- **Objetivo:** Taskfile genera installer + portable zip + checksum `.sha256` de cada artefacto, deterministicos.
- **Archivos probables:**
  - `build/windows/Taskfile.yml` — nuevo task `package:all` que encadene `create:nsis:installer` + portable zip + `sha256sum`.
  - `Taskfile.yml` (raiz) — task `release:artifacts` que orqueste.
  - Opcional: `tools/sha256sum.ps1` o script Go pequeño si `sha256sum` no esta en Windows (usar `Get-FileHash` via task o `certutil`).
- **Archivos prohibidos:** mismo set que R03.A + workflows CI (R03.C).
- **Tests/checks:** ejecutar `task release:artifacts` y verificar que genera `bin/vantare-amd64-installer.exe`, `bin/vantare-amd64-installer.exe.sha256`, `bin/vantare-portable-amd64.zip`, `bin/vantare-portable-amd64.zip.sha256`. Verificar que dos builds seguidas con mismo commit+flags producen mismo checksum (reproducible) o al menos mismo contenido funcional.
- **Riesgos:** portable zip debe incluir `configs/` (tester-build-instructions lo exige). No firmar aqui (firma es R03.H/decision). No meter el zip dentro del installer.
- **Requiere GLM review:** SI (P0, build es base de todo R03).
- **Verificacion manual:** extraer portable zip en maquina limpia y arrancar `vantare.exe` (debe encontrar `configs/`).
- **Stop conditions:** si la reproducibilidad falla por timestamps embebidos (Wails syso, Go buildvcs); si portable zip no incluye configs; si `Get-FileHash` no disponible en CI runner.

### R03.C — GitHub Release publishing (CI)

- **Objetivo:** Workflow GitHub Actions que en tag `v*` build artefactos, genera checksums, crea GitHub Release y sube assets. Mantiene los 4 workflows Discord existentes.
- **Archivos probables:**
  - `.github/workflows/release.yml` (NUEVO, en raiz repo `Vantare-Overlays/`) — trigger `push tags v*`, windows runner, checkout, setup Go + pnpm + Wails CLI + NSIS (`makensis`), `task release:artifacts`, `gh release create` subiendo installer + portable + checksums + body del changelog section.
- **Archivos prohibidos:** workflows Discord existentes (no romper), codigo Go/frontend, auth/licensing, telemetry, widgets.
- **Tests/checks:** workflow corre en tag de prueba (puede hacerse en rama con tag temporal y borrando). Validar que `gh release` sube assets con nombres exactos que el updater espera: `vantare-amd64-installer.exe` y `vantare-amd64-installer.exe.sha256`.
- **Riesgos:** runner Windows con Wails v3 + NSIS setup no trivial; cache de modulos Go y pnpm para no tardar 20min. Secretos: ninguno nuevo (GitHub token implicito). No publicar builds rotas: gate de tests antes de release.
- **Requiere GLM review:** SI (P0, CI es irreversible si tag mal etiquetado).
- **Verificacion manual:** crear tag `v0.3.11.0-beta.1` (pre-release) en un commit limpio, pushear, verificar que el workflow crea release con assets, luego borrar tag+release si es prueba.
- **Stop conditions:** si Wails v3 no instala limpio en runner windows-latest; si `makensis` no preinstalado y no hay action confiable; si el workflow se dispara tambien en tags que no deben (filtrar `v*` no `v*-*` si conviene).

### R03.D — Discord release notification

- **Objetivo:** Asegurar que la publicacion automatica a Discord siga funcionando y cubrir el gap de `discord-build-available` (que hoy es manual). Opcional: hacer que el workflow de R03.C dispare `discord-build-available` con la URL real del asset subido.
- **Archivos probables:**
  - `.github/workflows/release.yml` (de R03.C) — al final, llamar al webhook build-available via `gh workflow run` o un job `needs:` que postee con `version`, `download_url` (asset installer), `sha256` (leido del `.sha256` subido).
  - `docs/release-beta-operations-runbook.md` — actualizar flujo para reflejar que build-available ahora es automatico.
- **Archivos prohibidos:** los 4 workflows Discord existentes (no editarlos, solo consumirlos/encadenarlos), codigo Go.
- **Tests/checks:** workflow corre; mensaje llega a Discord; si falla webhook, no bloquea la creacion del release (job separado `if: always()` o `continue-on-error`).
- **Riesgos:** rate limit Discord; mensaje > 2000 chars (ya se splitea en workflows existentes). No exponer secrets en logs.
- **Requiere GLM review:** NO (P2, CI docs/encadenamiento). SI si se modifica un workflow Discord existente (prohibido por alcance).
- **Verificacion manual:** pushear tag pre-release y verificar mensaje en canal Discord.
- **Stop conditions:** si encadenar workflows via `workflow_dispatch` requiere permisos `actions: write` y el token por defecto no basta.

### R03.E — Update check endpoint/manifest hardening

- **Objetivo:** Endurecer el update checker existente: context/cancelacion, cache con `If-Modified-Since`/ETag, rate-limit local, repo URL configurable por env/build, alinear version parser con esquema `X.X.X.X` (4 campos).
- **Archivos probables:**
  - `internal/updater/updater.go` — `Check` con `context.Context`, `http.NewRequestWithContext`, cache de last-check en settings, throttle (no checkear mas de cada N minutos).
  - `internal/updater/github.go` — `releasesURL` configurable via `UpdaterOption` o env `VANTARE_RELEASES_URL` con default actual; mantener constante para tests.
  - `internal/updater/version.go` — extender `Version` a 4 campos (`Major.Minor.Patch.Build`), actualizar `ParseVersion` y `Compare` con TDD. Mantener compat: tags de 3 campos siguen funcionando.
  - `internal/updater/settings.go` — añadir `LastCheckAt time.Time` y `CacheEtag`/`CacheLastModified`.
  - `internal/app/updater_service.go` — pasar context desde main.
  - `cmd/vantare/main.go` — la goroutine de startup usa `ctx` (el `signal.NotifyContext` ya existe) en vez de `time.Sleep` suelto; usar `time.AfterFunc` o `ctx` con select.
- **Archivos prohibidos:** `internal/license/**`, auth/frontend, telemetry, widgets, NSIS logica, workflows Discord.
- **Tests/checks:** `go test ./internal/updater/... ./internal/app` (TDD version 4 campos; tests de cache hit/304; test de context cancelado; test de rate-limit; test de URL configurable), `gofmt`, `go vet`.
- **Riesgos:** cambiar `Version` a 4 campos puede romper `Compare` si no se hace con TDD. No perder compat con tags `v0.3.10.0` existentes (4º campo 0). No meter goroutine nueva sin cancelacion.
- **Requiere GLM review:** SI (P1, toca Go concurrente + parser que usa el updater en runtime).
- **Verificacion manual:** apuntar `VANTARE_RELEASES_URL` a un repo de prueba con releases fake; verificar check devuelve update-available sin crash; verificar segundo check en menos de N minutos usa cache.
- **Stop conditions:** si GitHub API no soporta `If-Modified-Sin-` para endpoints de releases publica (si devuelve 200 siempre, cache inutil pero inofensivo); si cambiar parser rompe tests existentes mas alla de los ajustados.

### R03.F — In-app update UI unificada

- **Objetivo:** UX consistente: `UpdateBanner` ofrece "Ver detalles" que abre el modal de `SettingsPage` (o unifica en un solo modal); "Descargar e instalar" usa `updater:install:verified` (descarga + checksum + launch) en vez de abrir navegador; mostrar release notes.
- **Archivos probables:**
  - `frontend/src/hub/components/UpdateBanner.tsx` — boton "Instalar" emite `updater:install:verified` con release; boton "Ver" abre modal de notas; mantener "Saltar".
  - `frontend/src/hub/components/UpdateModal.tsx` (NUEVO, opcional) — modal con notas + acciones, reutilizable por banner y settings.
  - `frontend/src/hub/pages/SettingsPage.tsx` — reutilizar logica de install/progress/error; exponer release notes.
  - `frontend/src/hub/HubApp.tsx` / `pages/HubApp.tsx` — wiring del modal.
- **Archivos prohibidos:** backend Go (toca R03.E), auth/licensing, telemetry, widgets, NSIS.
- **Tests/checks:** `pnpm --dir frontend test` (UpdateBanner, SettingsPage, UpdateModal nuevo), `pnpm --dir frontend build`, `pnpm --dir frontend lint`, `tsc -b`.
- **Riesgos:** no interrumpir overlay runtime durante carrera salvo update obligatorio (decision del plan original: notificacion, no silent). No abrir modal modal sobre modal. Progres bar durante descarga. Error de checksum debe mostrar mensaje accionable y limpiar descarga parcial.
- **Requiere GLM review:** SI si se crea nuevo componente/modal; NO si solo se ajusta banner existente (P2).
- **Verificacion manual:** con un manifest fake mas nuevo, verificar banner aparece, "Instalar" descarga (en build local apuntando a release de prueba) y lanza installer; "Saltar" silencia; reabrir app re-silencia si version ignorada.
- **Stop conditions:** si Wails events no permiten emitir payloads complejos (release completo) — ya lo hacen hoy (`updater:install:verified` recibe `Release`), verificar antes.

### R03.G — Installer/portable hardening

- **Objetivo:** NSIS y portable robustos: metadatos de version correctos (viene de R03.A), portable zip incluye configs y README tester, uninstaller limpio, instalador no rompe configs de usuario (`%AppData%/Vantare/configs`).
- **Archivos probables:**
  - `build/windows/nsis/project.nsi` — solo la linea de version (R03.A) y, si procede, asegurar que NO borra `$INSTDIR\configs` si el usuario puso configs custom junto al exe portable (hoy el uninstall hace `RMDir /r $INSTDIR` — revisar si eso borra configs del usuario en modo portable instalado).
  - `build/windows/info.json` — version (R03.A).
  - `build/windows/Taskfile.yml` — task portable zip que incluya `configs/*.json` embebidos + `vantare.exe` + copia de `docs/tester-build-instructions.md` como `README.txt`.
  - `Taskfile.yml` raiz — orquestar.
- **Archivos prohibidos:** logica de cierre/backup del NSIS (funciona, no tocar), auth/licensing, telemetry, widgets.
- **Tests/checks:** instalar sobre instalacion previa y verificar backup/rollback sigue funcionando; desinstalar y verificar no borra configs de usuario en `%AppData%/Vantare`; portable zip en maquina limpia arranca y ve configs.
- **Riesgos:** `RMDir /r $INSTDIR` en modo `user`-scope puede borrar configs que el usuario copio en `$LOCALAPPDATA\Programs\Vantare Overlays\configs` — auditar. No firmar aqui.
- **Requiere GLM review:** SI si se toca logica de uninstall/files; NO si solo version + zip (P2).
- **Verificacion manual:** instalar build vieja, instalar build nueva encima, verificar actualizacion; desinstalar y verificar configs persisten en `%AppData%`.
- **Stop conditions:** si cambiar `RMDir` rompe limpieza esperada; si portable zip necesita configs que no estan en `configs/` embebidos.

### R03.H — Release gate / manual checklist

- **Objetivo:** Checklist documental de cierre de R03: gate manual de que todo R03.A-G paso, verificacion end-to-end de update flow con manifest real, documentacion viva actualizada.
- **Archivos probables:**
  - `docs/release-03-acceptance-checklist.md` (NUEVO) — checklist manual.
  - `docs/current-plan.md` — actualizar estado R03.
  - `docs/versioning-and-release-gates.md` — actualizar si cambia el esquema de version o gates.
  - `docs/release-beta-operations-runbook.md` — actualizar flujo de publicacion (build-available automatico si R03.D lo hizo).
  - `docs/changelog.md` — entrada de la version de cierre de R03.
- **Archivos prohibidos:** codigo Go/frontend (esto es documental), auth/licensing, telemetry.
- **Tests/checks:** `git diff --check`, revision manual de que cada item de la checklist esta verificado.
- **Riesgos:** cerrar R03 sin haber validado end-to-end con un tag pre-release real.
- **Requiere GLM review:** NO (documental).
- **Verificacion manual:** ejecutar toda la checklist; publicar un tag `v0.3.11.0-beta.1` real (pre-release) y verificar: CI build → release con assets → Discord release anuncia → app vieja detecta update → instalar verifica checksum → NSIS actualiza → app nueva arranca con version correcta.
- **Stop conditions:** si la verificacion end-to-end falla en cualquier paso, NO cerrar R03; reabrir el segmento correspondiente.

---

## 5. Rollback plan

### Rollback de implementacion (antes de tag)

- Cada segmento R03.A-R03.G se commitea por separado. Si un segmento rompe build/tests, `git revert <commit>` del segmento sin tocar los demas.
- Si R03.A (version source) rompe dev build y no hay fallback: revertir y mantener version hardcodeada hasta decidir.
- Si R03.C (CI) publica una build rota: borrar el tag + release (runbook seccion 5.C), corregir, re-tag.

### Rollback de release publicada

- **No reutilizar tags.** Si una build publicada tiene bug critico: patch bump (`v0.3.11.0` → `v0.3.11.1`), nuevo tag, nueva release.
- **NSIS ya tiene rollback integrado** (`vantare.exe.bak`): si el nuevo exe no se extrae o valida, restaura el anterior. Mantener esta logica intocada (R03.G no la modifica).
- **Updater no hace downgrade automatico.** Si un usuario instala una version mala, debe desinstalar o instalar encima una version anterior manualmente. Documentar en runbook si conviene.

### Rollback de manifest/updater

- Si el update checker roto notifica falsamente: `IgnoreVersion` silencia; arreglar manifest/release siguiente.
- Si la URL del repo cambia: `VANTARE_RELEASES_URL` env (R03.E) permite repuntar sin rebuild.

---

## 6. Separacion de responsabilidades (auditoria P2 del release-doc audit)

R03 debe mantener separados:

- **Documentacion:** `docs/**` (checklists, runbook, changelog, plan).
- **CI:** `.github/workflows/**` (repo raiz). No tocar workflows Discord existentes salvo encadenar.
- **Build:** `Taskfile.yml`, `build/**`. No mezclar con runtime.
- **App runtime (Go):** `internal/updater/**`, `internal/app/updater_service.go`, `cmd/vantare/main.go`. No mezclar con auth/licensing (`internal/license/**`).
- **App runtime (Frontend):** `frontend/src/hub/components/UpdateBanner.tsx`, `frontend/src/hub/pages/SettingsPage.tsx`. No tocar `frontend/src/overlay/**` (widgets) ni auth.

Cada segmento del miniplan indica archivos prohibidos para reforzar esto.

---

## 7. Orden recomendado y paralelizacion

Orden estricto:

1. R03.A (version) — bloquea R03.B/C/G.
2. R03.B (artefactos) — bloquea R03.C.
3. R03.C (CI release) — bloquea R03.D end-to-end.
4. R03.D (Discord) — puede paralelizarse con R03.E (no comparten archivos: CI vs Go runtime).
5. R03.E (updater hardening Go) — puede paralelizarse con R03.D y con R03.F prep, pero R03.F depende de R03.E para context/4-campos.
6. R03.F (UI) — despues de R03.E.
7. R03.G (installer/portable) — despues de R03.A y R03.B; puede paralelizarse con R03.C/D/E.
8. R03.H (gate) — al final, despues de todo verificado.

No paralelizar segmentos que toquen `cmd/vantare/main.go` a la vez (R03.A y R03.E lo tocan).

---

## 8. Acceptance criteria de Release 03

- Version unica inyectada por ldflags; `main.go`, `config.yml`, `info.json`, `project.nsi` sincronizados.
- `task release:artifacts` genera installer + portable + checksums reproducibles.
- Workflow CI crea GitHub Release con assets nombrados exactamente como el updater espera.
- Discord recibe anuncio automatico al tag (ya funciona) + build-available automatico.
- Update checker usa context, cache, rate-limit, URL configurable; parser de 4 campos.
- UI de update unificada; "Instalar" descarga+verifica+lleva a NSIS sin abrir navegador.
- NSIS y portable robustos; configs de usuario no se borran en update.
- Release 02 (auth/licensing) intacta: no se tocaron sus archivos.
- Checklist R03.H verificada end-to-end con tag pre-release real.

---

## 9. Worker prompt base (para cada segmento)

```markdown
Actua como worker senior de Vantare Simracing Suite.

Lee obligatoriamente:
- AGENTS.md
- docs/current-plan.md
- docs/release-roadmap-execution-index.md
- docs/feature-architecture-map.md
- docs/superpowers/plans/2026-06-27-release-03-autoupdater-distribution-technical-plan.md
- docs/superpowers/plans/2026-06-26-release-03-autoupdater-distribution.md (plan predecesor)
- docs/versioning-and-release-gates.md
- el segmento R03.X asignado

Condicion previa: confirma que Release 02 esta congelada o taggeada antes de tocar codigo. Si hay cambios sin commitear de Release 02, para y reporta.

Si tocas Go, usa las skills: golang-error-handling, golang-testing, golang-code-style, golang-safety, golang-concurrency y golang-context si hay goroutines/lifecycle/cancelacion.

Reglas:
- no commits ni staging;
- no dependencias nuevas sin aprobacion;
- no tocar archivos fuera del alcance del segmento (revisa 'Archivos prohibidos');
- TDD para cambios de comportamiento (especialmente R03.E parser de 4 campos);
- reporta en espanol: archivos, checks, riesgos, verificacion manual.
- no firmar codigo (firma queda para decision de Isaac / Release 14-15).
```
