# Plan actual

Ultima actualizacion: 2026-06-29. Release v0.1.0.2 publicado: commit 626b66d, tag v0.1.0.2. Assets verificados (3/3 checksums OK). Smoke local del asset publicado: PASS.

Nota post-release (2026-06-29):
- Para smoke local usar `bin\vantare.exe` generado por `release:artifacts` o el asset descargado desde GitHub Release.
- No usar `vantare.exe` en raiz ni portables antiguos.
- Supabase Go se inyecta con `tools/generate_supabase_config.ps1` generando temporalmente `cmd/vantare/supabase_build.go`, no con ldflags.

## P0 Free plan bloqueado tras Google OAuth — Fix A+B+C (2026-06-29)

Causa raiz real: el binario Go de la release build no tenia `VANTARE_SUPABASE_URL`/`VANTARE_SUPABASE_ANON_KEY` en runtime. CI solo inyectaba `VITE_SUPABASE_*` al frontend (Vite build time). Cuando llegaba el token OAuth, `LicenseService` no tenia client Supabase, cae a `fromCacheOnFailure` y devolvia `expired` (sin cache) → Paywall bloqueaba al usuario Free.

Fix aplicado (3 partes):

**Fix A — Defensa (Go + Frontend):**
- Nuevo estado `StateUnconfigured` en `internal/license/types.go` y `errors.go` (`ErrUnconfigured`).
- `service.go`: cuando no hay client Supabase y no hay cache usable, devuelve `StateUnconfigured` (no `StateExpired`). `fromCacheOnFailure` ahora recibe flag `unconfigured` para distinguir "Supabase caído" (expired) de "Supabase no configurado" (unconfigured).
- `plan.go`: `ClassifyStatus` mapea `StateUnconfigured` → `PlanStatusUnconfigured`. `BuildSummary` no lo trata como `blocked`.
- Frontend `license-types.ts`: nuevo estado `"unconfigured"` en `LicenseState`.
- Frontend `plan.ts`: nuevo `PlanStatus` `"unconfigured"`, `classifyStatus` y `buildSummary` actualizados.
- Frontend `HubApp.tsx` (activo y `pages/`): `LicenseGate` muestra `UnconfiguredScreen` (mensaje accionable, no Paywall) cuando `state === "unconfigured"`.
- Nuevo componente `frontend/src/hub/auth/UnconfiguredScreen.tsx`.
- `LicenseBanner.tsx`: acepta `unconfigured` en `getMessage`.
- Anti-regresion en `frontend/src/lib/license.tsx`: `LicenseProvider` nunca sobrescribe un estado autenticado con `anonymous` (previene race condition donde `LicenseBridge` pisaba el resultado del OAuth callback).
- `LicenseBridge` en `HubApp.tsx` (activo y `pages/`): ya no llama `refresh()` cuando no hay sesion en el WebView (evita pisar el resultado del OAuth callback con `anonymous`).

**Fix B — Raiz (Build + CI):**
- `cmd/vantare/main.go`: nuevas vars `supabaseURL`/`supabaseAnonKey` que se inyectan en tiempo de compilación mediante `tools/generate_supabase_config.ps1`. Ese script lee `VANTARE_SUPABASE_URL`/`VANTARE_SUPABASE_ANON_KEY` del entorno de build, las codifica en base64 y genera temporalmente `cmd/vantare/supabase_build.go` con un `init()` que asigna las vars. Si las env vars no existen, el script no genera el archivo y el binario arranca sin config Supabase (modo offline-grace). Las env vars runtime (`VANTARE_SUPABASE_URL`/`VANTARE_SUPABASE_ANON_KEY`) siguen teniendo precedencia para dev/overrides. Nota: los comentarios en `main.go` mencionan ldflags como mecanismo alternativo, pero el build actual usa code generation.
- `build/windows/Taskfile.yml`: `build:native` ejecuta `tools/generate_supabase_config.ps1` antes de `go build`, generando `cmd/vantare/supabase_build.go` con las vars Supabase en base64 si las env vars están presentes. El archivo se elimina después del build. `BUILD_FLAGS` inyecta solo `version` via ldflags.
- `Taskfile.yml` (raiz): expone `VANTARE_SUPABASE_URL`/`VANTARE_SUPABASE_ANON_KEY` como vars del task (default vacio para dev local).
- `.github/workflows/release.yml`: mapea `secrets.VITE_SUPABASE_URL` → `VANTARE_SUPABASE_URL` y `secrets.VITE_SUPABASE_ANON_KEY` → `VANTARE_SUPABASE_ANON_KEY` como env vars del job `build`, para que `generate_supabase_config.ps1` las reciba y genere `supabase_build.go`.

**Fix C — Limpieza:**
- `cmd/vantare/main.go`: eliminada la doble emision de `license:changed` en el handler `license:validate` (`Validate()` ya emite internamente via `EmitChanged`).

Archivos modificados (16):
- `internal/license/types.go`, `internal/license/errors.go`, `internal/license/service.go`, `internal/license/plan.go`, `internal/license/plan_test.go`, `internal/license/service_test.go`
- `cmd/vantare/main.go`
- `frontend/src/lib/license-types.ts`, `frontend/src/lib/license.tsx`, `frontend/src/lib/plan.ts`, `frontend/src/lib/plan.test.ts`
- `frontend/src/hub/HubApp.tsx`, `frontend/src/hub/HubApp.test.tsx`, `frontend/src/hub/pages/HubApp.tsx`
- `frontend/src/hub/auth/UnconfiguredScreen.tsx` (nuevo), `frontend/src/hub/auth/LicenseBanner.tsx`
- `build/windows/Taskfile.yml`, `Taskfile.yml`
- `.github/workflows/release.yml`

Tests:
- Go: `./internal/license/...` y `./cmd/vantare/...` ok.
- Frontend: 89 files, 699 tests pasados.
- `tsc -b`, `vite build`, `eslint`, `git diff --check`: ok.

Verificacion manual pendiente: ejecutar `bin/vantare.exe` generado con `supabase_build.go` embebido (via `generate_supabase_config.ps1`) → Google OAuth → entra al Hub como Free. Usuario `expired`/`device-limit` sigue bloqueado. Usuario sin config Supabase ve `UnconfiguredScreen` (no Paywall).

Riesgos restantes: smoke manual en build empaquetada Wails con OAuth real. La anon key de Supabase es publica pero se inyecta via env vars de CI que alimentan `generate_supabase_config.ps1` (no hardcodeada en codigo). Binarios stale en el repo pueden confundir el smoke local; usar siempre `bin/vantare.exe` generado por `release:artifacts`.

Nota operativa (2026-06-29): binarios `vantare.exe` fuera de `bin/` (raiz del repo, `release-package/portable-*`) pueden estar stale y producir `UnconfiguredScreen` al ejecutarse por error. Siempre usar `bin/vantare.exe` para smoke local. Los binarios stale deben renombrarse a `.exe.stale` para evitar confusión.

## P0 onboarding/paywall v0.1.0.2 — Free deja de bloquear (2026-06-29)

Causa raiz: tras Google OAuth, un usuario sin suscripcion llegaba al frontend con estado `authenticated-no-entitlement` (definido en `internal/license/service.go` `fromSupabase`). Ese estado se mapeaba a `blocked` en `classifyStatus` (frontend `plan.ts` y backend `plan.go`), y `LicenseGate` en `HubApp.tsx`/`pages/HubApp.tsx`/`OnboardingFlow.tsx` lo mandaba a `PaywallScreen`. Resultado: el usuario logueado veia `FREE · BLOQUEADO` y no podia entrar al Hub aunque la beta publica debe permitir plan gratuito.

Comportamiento nuevo:
- `authenticated-no-entitlement` ahora se mapea a `free` (no `blocked`) en `classifyStatus` (frontend y Go).
- `LicenseGate` solo bloquea con PaywallScreen si `expired` o `device-limit`. El estado `authenticated-no-entitlement` cae al Hub con banner.
- `OnboardingFlow`: un usuario Free avanza al step recommended en vez de quedarse en paywall.
- `PaywallScreen`: nueva prop opcional `onContinueFree`. La tarjeta Free muestra boton habilitado "Continuar gratis" cuando el status es `free`; sigue mostrando "Plan actual" deshabilitado cuando el status es `blocked` (expired/device-limit). Bajo el estado, cuando es Free, aparece "Acceso básico activo" (`data-testid="paywall-free-note"`).
- Solo bloquean: licencia `expired`/`banned` (device-limit), sin sesion (`anonymous`), error real de validacion, o feature premium especifica.

Archivos modificados (12):
- `frontend/src/lib/plan.ts`, `frontend/src/lib/plan.test.ts`
- `frontend/src/hub/HubApp.tsx`, `frontend/src/hub/HubApp.test.tsx`
- `frontend/src/hub/pages/HubApp.tsx`, `frontend/src/hub/pages/HubPage.test.tsx`
- `frontend/src/hub/onboarding/OnboardingFlow.tsx`, `frontend/src/hub/onboarding/OnboardingFlow.test.tsx`
- `frontend/src/hub/auth/PaywallScreen.tsx`, `frontend/src/hub/auth/PaywallScreen.test.tsx`
- `internal/license/plan.go`, `internal/license/plan_test.go`

Tests:
- Frontend: 89 files, 694 tests pasados.
- Go `./internal/license/...` y `./cmd/vantare/...`: ok.
- `tsc -b`, `vite build`, `eslint`, `git diff --check`: ok (warning preexistente de chunk size y `.eslintignore`).

Verificacion manual: Google login -> estado `authenticated-no-entitlement` -> entra al Hub con banner de Free. En Ajustes/Cuenta el plan muestra "Free" y estado "Sin suscripcion". Si se abre PaywallScreen (p. ej. desde un flujo futuro de upgrade), la tarjeta Free muestra "Continuar gratis".

Riesgos restantes: el flujo real en build empaquetada Wails requiere smoke manual de OAuth -> Hub. No se agrego persistencia explicita de "plan Free elegido" porque Free es fallback automatico cuando no hay entitlements; no hay backend que setear.

## P2 BetaWelcome — persistencia segura (2026-06-29)

Causa: `frontend/src/hub/HubApp.tsx` `handleBetaWelcomeClose` emitia `Events.Emit('settings:save', { betaWelcomeCompleted: true })`. El handler `settings:save` de `cmd/vantare/main.go` decodifica el payload como `app.AppSettings` y llama a `settingsSvc.Save(&s)`. `Save()` valida `DeltaMode` (rechaza `""` con `invalid delta mode`) y, con un payload parcial, sobrescribiria `deltaMode`, `cpuSampling`, `hotkeys` y `activeOverlayProfileId` con sus zero values. Ademas de fallar validacion, pisaria ajustes existentes.

Fix:
- `frontend/src/hub/HubApp.tsx`: nuevo `settingsRef` que guarda el ultimo payload recibido en el evento `settings`. Al cerrar BetaWelcome se emite `settings:save` con `{ ...base, betaWelcomeCompleted: true }` (objeto completo) en vez del payload parcial. Guarda defensiva `if (base)` antes de emitir: si no hay settings cargados, no se hace la emision (BetaWelcome solo se muestra cuando `settingsLoaded` es true, asi que en practica siempre hay base completa).
- Backend Go no se toco (no hay bug nuevo en `SettingsService`; el handler ya trabaja con `AppSettings` y eso es contrato).

Tests en `frontend/src/hub/HubApp.test.tsx`:
- "emits settings:save with the full settings payload when welcome is closed" — mock con `deltaMode`, `cpuSampling`, `hotkeys` y `activeOverlayProfileId`; verifica que el payload emitido conserva todos los campos y agrega `betaWelcomeCompleted: true`.
- "does not erase activeOverlayProfileId when closing BetaWelcome" — caso explicito: `activeOverlayProfileId` no vacio (`"profile-active-must-survive"`) debe sobrevivir.
- Mantenidos: `betaWelcomeCompleted=false` muestra BetaWelcome, `betaWelcomeCompleted=true` no lo muestra.

Archivos:
- `frontend/src/hub/HubApp.tsx` (settingsRef + payload completo al cerrar).
- `frontend/src/hub/HubApp.test.tsx` (2 tests modificados/anadidos).

Checks:
- `pnpm --dir frontend test -- HubApp BetaWelcome`: 23/23 OK (3 files).
- `pnpm --dir frontend test`: 729/729 OK (94 files, +2 tests vs baseline).
- `pnpm --dir frontend exec tsc -b`: OK.
- `pnpm --dir frontend build`: OK (warning preexistente de chunk size, no error).
- `pnpm --dir frontend lint`: OK (warning preexistente de `.eslintignore`, no error).
- `git diff --check`: OK (whitespace limpio en archivos tocados).
- Go: no se toco (`internal/app/...`, `cmd/vantare/...` intactos); `gofmt`/`go test` no aplicaron.

Riesgos restantes: ninguno nuevo. Verificacion manual recomendada: cerrar BetaWelcome con un perfil activo guardado, reabrir la app y confirmar que el perfil sigue activo y BetaWelcome no reaparece.

## Estado operativo principal

La app se encuentra en la linea publica de beta **`v0.1.x`**.

- `v0.1.0.0`: primera beta publica publicada en GitHub Releases.
- `v0.1.0.1`: hotfix para compilar la build de release con variables de entorno de Supabase.
- `v0.1.0.2`: hotfix P0/P1 — Supabase backend configurado en Go build (via `generate_supabase_config.ps1`), estado `UnconfiguredScreen` para builds mal configuradas, y plan Free desbloqueado tras Google OAuth (`authenticated-no-entitlement` → `free` en vez de `blocked`). Verificacion manual completa: login Google -> Hub Free, overlays recomendados, flujo basico correcto.

Las builds `v0.3.*` quedan como historico interno no anunciado y no deben usarse en Discord, docs publicos ni nuevos tags de beta.

### Que incluye esta beta

- **Overlays Studio**: editor completo de widgets (Relative, Standings, Pedals, Delta, Ingeniero), perfiles recomendados, layout con drag/resize, preview aislada con ancho intrinseco.
- **Ingeniero**: modulo integrado con historial, notificaciones y widget de overlay. Funciona en modo simulacion/replay; el adaptador live LMU queda para fase EN6.
- **Telemetria live LMU**: fuente compartida live/mock/demo con fallback automatico a datos sinteticos si LMU no esta disponible.
- **Widget Delta**: delta best live nativo de LMU conTarget/Lap.
- **Login obligatorio**: acceso bloqueado por cuenta, con Google OAuth como minimo para la beta publica.
- **Licencias basicas online**: gating free / paid / suite, con gracia offline corta.
- **Hotkeys globales**: toggle overlay, perfiles anterior/siguiente y modo edicion in-place (`Ctrl+Shift+E`). Personalizables desde Ajustes.
- **Autoupdater**: descarga e instalacion verificada de nuevas versiones desde GitHub Releases.
- **OBS local**: servidor interno en `http://127.0.0.1:39261/overlay?profile=...` con soporte SSE para telemetria e Ingeniero.
- **Perfiles recomendados**: `Clean Overlay` y `Le Mans Ultimate - Basic` incluidos como punto de partida.
- **Presets de widgets**: guardar, aplicar y compartir configuraciones visuales de widgets (widget-presets).
- **Galeria de disenos oficiales de widgets**: disenos oficiales aplicables desde WidgetStudio sin modificar posicion/tamano.
- **Instalador NSIS y portable zip**: ambos con checksums SHA256 sidecar.

### Que NO incluye (post-beta o fases posteriores)

- Audio/voces TTS del Ingeniero (solo visual).
- Widget Pedals completo con calibracion (maqueta estetica inicial).
- Soporte multisimulador estable (iRacing, Assetto Corsa, rFactor 2). Solo LMU en Windows es soporte principal en esta beta.
- Linux/Proton estable. Entra en la serie `0.1.x` como investigacion experimental.
- Doble PC/LAN automatizado para OBS (configuracion manual posible).
- Portal completo de usuario, gestion avanzada de pagos, facturas y self-service de licencias. El login/gating basico si entra.
- Community layouts, marketplace, cloud sync completo, companion app y plugin system.
- Ingeniero live con LMU real (EN6 aparcado hasta validacion live).
- Reordenacion de columnas en widgets (modo tester oculto disponible via secuencia `V A N T A R E`).
- Firma de codigo Authenticode (ver Known Issues -> SmartScreen).
- Instalador propio completo. Entra en `0.1.x` como **Vantare Setup Launcher** que orquesta NSIS, no como sustituto total inicial.

### Estado de widgets

| Widget | Estado | Notas |
|--------|--------|-------|
| Relative | `stable` | Columnas configurables, filtros, variantes schema v2 |
| Standings | `stable` | Columnas configurables, filtros, variantes schema v2, selector mock |
| Delta | `stable` | Delta best live nativo LMU, Target/Lap |
| Pedals | `tester` | Maqueta compacta CLT/BRK/THR, colores editables desde WidgetStudio |
| Ingeniero (notifications) | `tester` | Widget de notificaciones del spotter, funcionando en modo simulacion |
| Track Map | `experimental` | En desarrollo, no disponible para testers |
| Input Telemetry/Trace | `experimental` | En desarrollo, no disponible para testers |

### Actualizaciones y distribucion

- **No se crea una GitHub Release por cada commit.** Solo se publica cuando hay un tag `v*` que cumple el checklist del runbook.
- **Autoupdater:** la app busca actualizaciones en GitHub Releases. Descarga el instalador, verifica SHA256 y lo ejecuta.
- **Distribucion manual:** los testers pueden descargar installer o portable zip desde `#beta-downloads` en Discord, con checksums SHA256 publicados para verificacion.
- **Updater:** el flujo `InstallVerifiedCtx` descarga el installer y verifica checksum contra el sidecar `.sha256`. Si el checksum no existe (releases historicas), cae a descarga sin verificacion (comportamiento documentado y aceptado).
- **Supabase en release builds:** `VANTARE_SUPABASE_URL` y `VANTARE_SUPABASE_ANON_KEY` deben existir como GitHub Actions secrets y estar disponibles como env vars durante el build. El script `tools/generate_supabase_config.ps1` las lee y genera temporalmente `cmd/vantare/supabase_build.go` con `init()` base64, que se compila en el binario y se elimina después. Si faltan, el binario arranca sin config Supabase (modo offline-grace, pantalla `UnconfiguredScreen`).

Fuente operativa principal:

- `docs/release-roadmap-execution-index.md`
- `docs/superpowers/plans/2026-06-26-release-*.md`

Los roadmaps anteriores (`docs/master-feature-plan.md` y `docs/roadmap-execution-board.md`) se mantienen como contexto/historial, pero no deben contradecir el indice de release.

Siguiente trabajo recomendado:

1. HUB-01 — Pulir Hub/onboarding para beta: revisar primer recorrido de tester nuevo (login, Free, plan, perfil recomendado, abrir overlay, OBS, updater).
2. DISCORD-01 — Limpiar mensajes beta progress y referencias historicas en Discord.
3. Smoke manual de beta completo: installer/portable, login, perfiles recomendados, overlay fullscreen, `Ctrl+Shift+E`, galeria de disenos, OBS local y updater.
4. Por planear en `v0.1.x`: Linux/Proton experimental, Vantare Setup Launcher, LMU race countdown, launcher de simuladores, nuevos overlays, Hub rework, disenos oficiales adicionales, hardening de auth/licencias y revision global post-beta.

Regla de orquestacion: el agente principal no edita codigo salvo necesidad estricta; genera prompts, revisa reportes y actualiza documentacion. Workers implementan. GLM revisa P0/P1/P2 y cualquier cambio de Go debe exigir las skills de Go indicadas en `docs/release-roadmap-execution-index.md`.

Auditorias globales de calidad:
- Primera auditoria global: al cerrar `Release 03` completo, antes de avanzar fuerte en `Release 04`. Debe revisar auth/licencias, webhooks, versionado, build/package/updater, seguridad, persistencia local, tests complacientes y deuda P3 acumulada.
- Segunda auditoria global: `Release 15`, obligatoria antes de aceptar la release candidate final.
- Entre esos puntos, usar reviews por feature/bloque salvo que aparezca un P0/P1/P2 transversal.

Decisiones de release ya cerradas:

- Stripe directo + Supabase + login obligatorio.
- Licencia online con gracia de 24h y 1 PC activo.
- Assetto Corsa e iRacing entran en release como simuladores.
- Assetto Corsa Lua/CSP Overlay Pack es producto separado.
- Autoupdater entra en release.
- OBS LAN/doble PC entra en release.
- Track Map e Input Telemetry/Trace entran en release con estado `stable`/`tester`/`experimental` segun datos.
- Community layouts/marketplace, cloud sync completo, companion app y plugin system quedan post-release.

## Roadmap operativo de la serie 0.1.x

La serie `0.1.x` no es solo hotfixes: es la linea de beta publica temprana. El cuarto segmento sigue reservado para hotfixes (`0.1.0.1`, `0.1.0.2`). El tercer segmento agrupa mejoras visibles (`0.1.1.0`, `0.1.2.0`).

| Version objetivo | Estado | Alcance |
|------------------|--------|---------|
| `0.1.0.x` | Activo | Hotfixes criticos de login, Supabase backend/frontend, licencias, updater, overlay fullscreen, crash o bloqueo de uso. |
| `0.1.x` | Por planear | Linux/Proton experimental. |
| `0.1.x` | Por planear | Vantare Setup Launcher v1: instalador propio ligero que verifica SHA256 y lanza NSIS por debajo. |
| `0.1.x` | Por planear | LMU race countdown beta: import manual/asistido por IA del calendario semanal publicado en Discord y notificacion overlay sobre el simulador con avisos de tiempo restante. |
| `0.1.x` | Por planear | Launcher de simuladores: abrir LMU desde Vantare y agrupar apps asociadas por simulador (overlays, Ingeniero, calendario, presets, configuracion). |
| `0.1.x` | Por planear | Nuevos overlays publicos, mejoras de Hub, mas disenos oficiales, pulido de OBS, hardening de licencias y primeras correcciones de rendimiento. |

Regla: salvo hotfixes de `0.1.0.x`, todo lo anterior queda **por planear**. No se implementa ni se promete como version concreta sin miniplan, review y smoke manual.

### Vantare Setup Launcher v1

Estado: por planear en `0.1.x`. Mejora la experiencia de testers y reduce confusion con SmartScreen/descargas, pero no se implementa hasta cerrar el hotfix actual de login/licencias y crear miniplan propio.

Scope inicial:
- Windows only.
- UI propia de Vantare.
- Verifica SHA256 antes de ejecutar el instalador.
- Lanza NSIS por debajo; no sustituye todavia su instalacion/desinstalacion/rollback.
- Muestra version, canal, notas breves, aviso SmartScreen y enlaces a known issues.
- Puede ofrecer descarga de portable zip, pero no necesita gestionar updates complejos.

No scope inicial:
- No firma Authenticode.
- No instalacion por componentes.
- No login/licencia dentro del instalador, salvo que se planifique explicitamente despues.
- No reemplazar todo NSIS desde cero.

### Linux/Proton experimental

Estado: por planear en `0.1.x`, como soporte experimental. No se implementa hasta cerrar el hotfix actual de login/licencias y crear miniplan propio.

Caminos a validar:
1. Ejecutar `vantare.exe` via Proton junto a LMU via Proton.
2. Crear build Linux nativa y comprobar UI/overlays.
3. Investigar si la shared memory/telemetria de LMU expuesta dentro de Proton es accesible desde app Linux nativa o si requiere proxy/bridge.

Contrato publico: "experimental". No prometer soporte estable hasta verificar:
- app arranca;
- overlay transparente/click-through funciona en X11/Wayland o se documenta la limitacion;
- LMU live entrega datos reales;
- updater/distribucion Linux tiene formato claro.

### LMU race countdown beta

Estado: por planear en `0.1.x`. Aporta valor inmediato a pilotos y streamers, pero no se implementa hasta cerrar el hotfix actual de login/licencias y crear miniplan propio.

Scope inicial:
- Import manual/asistido por IA del calendario semanal de LMU publicado en Discord.
- Formato local estructurado con eventos, serie, circuito, hora de carrera, hora de practica si aplica, duracion y zona horaria.
- Validacion basica de formato y zona horaria antes de guardar.
- Notificacion overlay por encima del simulador con avisos configurables: por ejemplo 30, 15, 10, 5 y 2 minutos antes de carrera.
- Estado claro en UI: proxima carrera, fuente del calendario, ultima actualizacion y eventos de la semana.
- Overlay click-through salvo interacciones de configuracion dentro de la app.

No scope inicial:
- No scraping automatico de Discord.
- No bot de Discord ni permisos del servidor LMU.
- No sincronizacion cloud del calendario.
- No prometer exactitud oficial si el calendario fue importado manualmente.
- No mezclarlo con el widget Ingeniero hasta que el flujo de countdown sea estable.

Contrato publico: "experimental/beta". El flujo recomendado para beta es copiar el mensaje semanal de Discord, transformarlo con un modelo a JSON validado e importarlo en la app.

### Launcher de simuladores

Estado: por planear en `0.1.x`.

Idea: Vantare puede evolucionar hacia un mini launcher de simuladores y aplicaciones asociadas. El primer corte seria LMU-only:
- detectar/guardar ruta de LMU o lanzarlo via Steam URI;
- abrir el simulador desde el Hub;
- asociar acciones por simulador: abrir overlay activo, abrir Ingeniero, abrir calendario LMU, abrir OBS setup, aplicar perfiles recomendados;
- mostrar estado simple: instalado/no configurado, ultima ruta usada y acciones rapidas.

No scope inicial:
- No reemplazar Steam.
- No gestionar mods.
- No automatizar login de simuladores.
- No lanzar multiples simuladores hasta tener adapter contract.
- No mezclarlo con el hotfix actual de login/licencias.

Contrato: por planear. Requiere inventario de lanzamiento LMU/Steam, UX del Hub y riesgos de permisos antes de implementacion.

## Estado actual

## Beta urgente adelantada desde roadmap futuro

Decision operativa (2026-06-28):

- Todo lo que bloquee una beta usable para testers se adelanta aunque estuviera previsto en `Release 04+`.
- La razon debe quedar documentada en este plan para distinguir **scope urgente de beta** de rework estructural de release oficial.
- El alcance debe seguir siendo pequeno: arreglar el flujo necesario para que testers puedan usar la app, no abrir un redisenyo general.

Items adelantados:

1. **Overlay edit mode in-place por hotkey** — adelantado desde `Release 04 - Preview avanzada y LayoutStudio profesional`.
   - Motivo: los testers necesitan poder ajustar posicion/tamano mientras ven el overlay real, no solo dentro del canvas de la app.
   - Estado: implementado y revisado con P3 documentados en `docs/technical-debt.md`.
   - Contrato vivo: `ModeRacing` y `ModeEdit` del overlay desktop Wails son fullscreen con `layoutOrigin={0,0}`; no se usa shrink-wrap en ese camino.

2. **Fix fullscreen del overlay desktop** — estabilizacion urgente de beta.
   - Motivo: el refactor de edit mode reintrodujo una caja parcial/shrink-wrap en runtime desktop, rompiendo el uso basico del overlay.
   - Estado: fix implementado por worker y review `ACCEPT WITH P3`; P3 registrados como TD-037/038/039.
   - Verificacion manual obligatoria antes de distribuir: abrir overlay normal, confirmar fullscreen click-through, entrar/salir con `Ctrl+Shift+E`, confirmar que no queda caja parcial.

3. **Dev server estable para iteracion** — estabilizacion de tooling urgente.
   - Motivo: `wails3 task dev` podia abrir WebView con HTTP 502 porque Vite escuchaba en `localhost`/IPv6 mientras Wails proxyeaba contra `127.0.0.1`.
   - Estado: `Taskfile.yml` y `build/Taskfile.yml` fijan `VITE_HOST=127.0.0.1` por defecto; se puede overridear con `WAILS_VITE_HOST`.
   - Verificacion: log de Wails debe mostrar `vite "--host" "127.0.0.1" "--port" "9245"` y `Connected to frontend dev server`.

4. **Perfil activo de overlay** — adelantado desde UX futura de perfiles.
   - Motivo: las hotkeys (`Ctrl+Shift+V`, `Ctrl+Shift+E`) necesitan una fuente de verdad clara; hoy no hay boton visible para marcar que perfil usaran las macros.
   - Estado: implementado (2026-06-28). Plan en `docs/superpowers/plans/2026-06-28-active-overlay-profile.md`.
   - Criterio de beta: `Mis perfiles` debe permitir `Activar` un perfil y mostrar badge `Activo`; hotkeys y `Abrir overlay` deben usar ese perfil activo.
   - Cambios:
     - `AppSettings.ActiveOverlayProfileID` (`omitempty`) persistido en `app-settings.json`.
     - `HubService.SetActiveProfile(idOrFile)` resuelve path, carga perfil, persiste id, emite eventos.
     - `HubService.ResolveProfilePath(idOrFile)` exportado para startup.
     - `HubService.DeleteProfile` limpia `ActiveOverlayProfileID` si se borra el perfil activo.
     - `main.go` carga perfil activo al arrancar; handler `hub:set-active` detiene overlay antes de cambiar; handler `overlay:start-active` abre el perfil activo.
     - `OwnProfilesView`: badge "Activo", boton "Activar", boton global "Abrir overlay" en header.
     - `LayoutStudio`: banner amarillo si el perfil editado no es el activo.
     - `SettingsPage`: OBS URL usa `activeOverlayProfileId` de settings con fallback.
   - Tests: 590 frontend OK; Go tests OK; tsc, build, lint, gofmt, git diff --check OK.
   - Verificacion manual pendiente (checklist en plan).

Fix P0 residual overlayRunning (Overlay Edit Mode) cerrado (2026-06-28):
- Cierre externo de ventana (Alt+F4 / WindowClosing) limpia `overlayRunning=false` y resetea el perfil a racing mode mediante el closure `stopOverlay` en `cmd/vantare/main.go`, con guard para evitar doble reset cuando el path normal ya limpio el flag.
- Errores de `StartOverlay` (handler `overlay:start`) y `StartActiveOverlay` (hotkey Ctrl+Shift+E / `handleToggleEditMode`) sincronizan `overlayRunning=false` cuando no queda ventana, evitando flag `true` colgante sin ventana.
- `resetOverlayDisplayMode` no intenta aplicar modo sobre ventana inexistente: solo aplica al perfil y emite `overlay:edit-mode-changed` cuando `CurrentWindow() != nil`.
- Si `ApplyProfileMode` falla, no se emite `overlay:edit-mode-changed` (evita que el frontend renderice chrome de edicion sobre una ventana que sigue click-through).
- Tests anadidos en `cmd/vantare/main_test.go`: cierre externo limpia flag y resetea modo, guard evita doble reset, fallo de `StartActiveOverlay` sincroniza flag, fallo de `ApplyProfileMode` no emite evento, y `resetOverlayDisplayMode` sin ventana no toca referencia nil.
- Checks: `gofmt` OK; `go test ./cmd/vantare/... ./internal/app/... ./internal/window/...` OK; `go test ./...` OK; `go vet` OK; `git diff --check` OK.
- Veredicto final del review: `ACCEPT WITH P3` (P3 no bloqueantes documentados: profile queda en ModeEdit si ApplyProfileMode falla — se autocorrige en siguiente toggle/stop; sin test directo del handler `overlay:start` por estar inline en `main()`).

R03.B - Build artifacts / release packaging completado (2026-06-27):
- Documento operativo nuevo: `docs/release-artifacts.md` (artefactos oficiales, comandos, verificacion, gap de firma de codigo).
- Nueva tarea canonica de pipeline: `wails3 task release:artifacts` (alias de `windows:package:all` y `package:all`). Encadena `version:sync` -> `windows:build` -> instalador NSIS -> portable zip -> SHA256 sidecars -> verify de version.
- Tareas auxiliares: `windows:release:portable`, `windows:release:checksums`, `windows:release:verify`, `windows:release:clean` (todas expuestas tambien en raiz).
- Scripts nuevos en `tools/` (PowerShell 5.1+, sin dependencias externas):
  - `tools/build_nsis.ps1`: resuelve el NSIS real (evita el shim de wails3 que falla con 0x2) y construye el instalador.
  - `tools/release_artifacts.ps1`: portable zip (con `configs/*.json` y tester README), SHA256 via `certutil.exe` (siempre disponible en Windows), verificacion de version embebida (UTF-8 en `.exe`, UTF-16 LE en NSIS installer resource).
- Runbook actualizado: `docs/release-beta-operations-runbook.md` seccion 4 ahora apunta a `release:artifacts` como flujo canonico y elimina el `Get-FileHash` manual.
- Verificacion end-to-end ejecutada en este host: pipeline produce `bin/vantare-amd64-installer.exe` (6.86 MB), `bin/vantare-portable-amd64.zip` (5.07 MB), `bin/vantare.exe` (12.98 MB) y sus 3 checksums SHA256. `verify` confirma que `v0.3.10.0` esta embebido en `vantare.exe` y `0.3.10.0` en el recurso de version PE del installer.
- Stale `bin/temp-wails-proj-amd64-installer.exe` del 15/06 eliminado por `release:clean`.
- Lo que queda pendiente: firma de codigo Authenticode (R03.H documenta la decision; la implementacion queda para R15/RC publica antes del release publico). CI de release (R03.C) completado.

R03.C - GitHub Actions release build completado (2026-06-27):
- Creado workflow `.github/workflows/release.yml` en la raiz real del repo Git (`Vantare-Overlays/`).
- Triggers: push de tag `v*` (crea release automaticamente) y `workflow_dispatch` (build manual; release opcional y solo permitida sobre un tag).
- Runner Windows: instala Go `1.25.0`, pnpm `10`, Node `22`, NSIS `3.12.0` via Chocolatey y Wails v3 CLI `v3.0.0-alpha.98-tui` via `go install` (todo pinned).
- Gate de tests/lint (P2-1 del review adversarial, corregido 2026-06-27): el job `build` ejecuta `go test ./...`, `pnpm install`, `pnpm test` y `pnpm lint` desde `vantare-v2/` y `vantare-v2/frontend/` antes de `wails3 task release:clean`/`release:artifacts`. Si cualquier gate falla, no se generan artefactos ni se publica release. No se duplica `pnpm build` (ya corre indirectamente via `wails3 task release:artifacts`).
- Ejecuta en `vantare-v2/`: `wails3 task release:clean`, `wails3 task release:artifacts`, `wails3 task release:verify`.
- Verifica estrictamente que existan los 6 archivos oficiales (3 artefactos + 3 checksums) antes de continuar.
- Subida de artifacts de GitHub Actions y, en tags `v*`, creacion de GitHub Release con `gh release create` subiendo los 6 archivos oficiales.
- Permisos minimos: `contents: read` por defecto; solo el job `release` usa `contents: write`. No se imprimen secretos; no se modifica `VERSION` en CI.
- Documentacion actualizada: `docs/release-artifacts.md` (seccion 4.1 de CI) y `docs/release-beta-operations-runbook.md` (seccion 4 con flujo local y flujo CI). Review adversarial en `docs/adversarial-review.md` con P2-1 cerrado.
- Checks: `git diff --check` limpio; validacion YAML OK; `go test ./...` OK (cached); `pnpm --dir frontend test` 568 tests OK; `pnpm --dir frontend lint` OK (solo warning de `.eslintignore` deprecado, no error).
- P3 restantes del review (no bloqueantes): P3-1 manejo de release ya existente, P3-2 globo `bin/*` en `gh release create`, P3-3 verificacion de version de NSIS instalada, P3-4 nota de `SHA256SUMS.txt` en `release-artifacts.md`. Recomendado aplicar P3-1/P3-2 antes de release publica estable.

R03.D - Updater runtime hardening: correcciones de review R03.D aplicadas (2026-06-28):
- Nota: el plan tecnico asigna R03.D a "Discord release notification"; el presente trabajo atiende la peticion de endurecer el updater runtime (overlap logico con R03.E del plan tecnico).
- Findings corregidos:
  - P1-1: `UpdaterService.CheckUpdatesCtx(ctx)` propaga el contexto real; la goroutine de startup en `cmd/vantare/main.go` usa `CheckUpdatesCtx(ctx)` y comprueba `ctx.Err()` antes de emitir `updater:notify`.
  - P2-1: `VANTARE_RELEASES_URL` se valida con `net/url`; solo se aceptan esquemas `http`/`https` y host no vacio; `updater.New` devuelve error claro si la URL es invalida; `main.go` registra el updater solo si la inicializacion es valida.
  - P2-2: `UpdaterService` protege lectura/escritura de settings con `sync.Mutex`, evitando condiciones de carrera en `checkUpdates`, `SaveSettings` e `IgnoreVersion`; anadido test de concurrencia.
  - P2-3: `docs/adversarial-review.md` y `docs/technical-debt.md` actualizados con veredicto coherente `ACCEPT WITH P3` y P2/P3 heredados fuera de alcance documentados.
  - P3 opcional: `InstallVerifiedCtx` elimina el installer descargado si `verifyChecksum` falla; test de regresion anadido.
- Tests anadidos/actualizados: `TestReleasesURLDefaultsToGitHub`, `TestReleasesURLOverrideValid`, `TestReleasesURLRejectsInvalidScheme`, `TestReleasesURLRejectsEmptyHost`, `TestNewRejectsInvalidReleasesURL`, `TestUpdaterServiceContextCancellation`, `TestUpdaterServiceConcurrentChecksAndIgnore`, `TestInstallVerifiedHashMismatch` (verifica limpieza); tests existentes adaptados a `New` con error y a contexto en `downloadFile`/`verifyChecksum`.
- Checks: `gofmt` OK; `go test ./internal/updater/... ./internal/app/...` OK; `go test ./...` OK; `go vet ./internal/updater/... ./internal/app/...` OK; `git diff --check` limpio.
- Verificacion manual pendiente: smoke test end-to-end descargando un release real.
- Riesgo residual: `go test -race` no ejecutado en este host porque requiere CGO_ENABLED=1 (no disponible en el entorno Windows actual).

R03.G - Smoke real tras R03.F completado (2026-06-28):
- Smoke ejecutado contra los 4 frentes: A local (`wails3 task release:artifacts` produce los 6 archivos oficiales y `release:verify` confirma version embebida), B CI build sin release (`workflow_dispatch` sin `create_release`, valida gates + artefactos sin tocar GitHub Releases), C Discord minimo (`workflow_dispatch` sobre `discord-release.yml` con tag valido contra webhook de pruebas), D updater contra prerelease real (`v0.3.10.0-smoke-tag` publicado como prerelease y consumido por el binario para verificar `CheckUpdatesCtx` + `InstallVerifiedCtx`).
- Hallazgos del smoke que motivan R03.H:
  1. Push del tag `v0.3.10.0-smoke-tag` disparo `discord-beta-progress.yml` y `discord-known-issues.yml` por su filtro de `paths`, generando mensajes colaterales no relacionados con el release.
  2. Re-correr `release.yml` contra un tag cuya release ya existe falla con exit code distinto de 0 (`gh release create` aborta porque la release ya existe), obligando a intervencion manual.
  3. Las GitHub Releases historicas (anteriores a R03.B) no incluyen `*.sha256` sidecar; el `InstallVerified` del updater no puede validar checksum contra esas releases.
  4. Firma de codigo (Authenticode/certificado) sigue pendiente: bloquea release publico, no bloquea beta privada.

R03.H - Cierre de Release 03 tras smoke + decision firma de codigo (2026-06-28):
- Workflows modificados: `.github/workflows/discord-beta-progress.yml`, `.github/workflows/discord-known-issues.yml`, `.github/workflows/release.yml`.
- Tag-guard en Discord no-release: ambos workflows saltan el envio cuando `github.ref_type == 'tag'` (job-level `if` + step explicativo con `::notice::`). Push normal a `master` y `workflow_dispatch` siguen funcionando.
- `release.yml` idempotente: el job `release` ahora detecta si la GitHub Release ya existe. Si existe, hace `gh release edit --notes-file` + `gh release upload --clobber` por cada uno de los 6 assets oficiales. Si no existe, crea la release enumerando los 6 assets explicitamente (sin glob amplio). El `create` deja de fallar en re-runs sobre tags ya publicados.
- TD-003 (GitHub Release idempotente) y TD-004 (publicacion explicita de assets) cerrados. TD-005 (NSIS version pin) y TD-002 (verificacion de checksums sidecar) siguen abiertos para R03+.
- Decision de firma de codigo documentada:
  - Beta privada: se distribuye sin firma (Authenticode ausente). Windows SmartScreen mostrara el aviso habitual; los testers ya lo conocen y el `discord-build-available.yml` lo recuerda en el mensaje.
  - Releases historicas sin `.sha256`: `InstallVerified` no es compatible contra ellas; el updater cae al flujo sin verificacion si el asset checksum falta (degradacion documentada, no rompe el update).
  - Release publico (R15 o equivalente): requiere certificado Authenticode valido y pipeline de firma integrado en `release.yml` antes del `gh release upload` o del paso NSIS. TD nuevo (TD-027) registra el gap.
- Politica explicita: no se crea una GitHub Release por cada commit. Solo cuando hay un tag `v*` legitimo que cumple el checklist del runbook.
- Checks: `git diff --check` limpio; YAML de los 3 workflows valido; dry-run estatico del bloque bash (ambas ramas `create` y `upload --clobber`) verificado; no se ejecutaron workflows reales ni se envio Discord.
- Riesgos restantes: ejecutar un smoke real en GitHub Actions con webhooks de Discord para validar la combinacion tag-guard + release idempotente (TD-024); validar `gh release upload --clobber` en un re-run real antes del primer tag publico (cubierto por TD-003 cerrado pero pendiente de verificacion real).

R03.E - Discord release notification hardening completado (2026-06-28):
- Workflows modificados (sin crear nuevos): `.github/workflows/discord-release.yml`, `.github/workflows/discord-build-available.yml`, `.github/workflows/discord-beta-progress.yml`, `.github/workflows/discord-known-issues.yml`.
- Idempotencia por re-run: todos los workflows detectan `github.run_attempt > 1` y se saltan el envio a Discord con `::warning::`, evitando mensajes duplicados en re-runs manuales.
- Manejo de errores HTTP mejorado: distincion de 403 (fallo inmediato con mensaje claro) y 429 (un reintento con backoff basado en header `Retry-After` o 5s por defecto); validacion de payload JSON con roundtrip `json.dumps`/`json.loads` antes de enviar.
- `discord-build-available.yml`: input opcional `release_tag` para extraer automaticamente `download_url` y `sha256` de la GitHub Release (asset `vantare-amd64-installer.exe` y su `.sha256`). Los inputs manuales (`download_url`, `sha256`) pasan a opcionales y pueden anular los valores extraidos.
- Permisos minimos explicitados: `permissions: contents: read` en los cuatro workflows de Discord.
- Runbook actualizado: `docs/release-beta-operations-runbook.md` seccion 3 con comandos `gh workflow run` para los 4 workflows, ejemplo de `release_tag` y procedimiento de re-run seguro; seccion 5.D con tabla de troubleshooting especifico de Discord.
- Review adversarial en `docs/adversarial-review.md` con veredicto `ACCEPT WITH P3` y P3 documentados.
- Deuda tecnica actualizada: TD-003 (release idempotente) sigue abierto porque no se modifico `release.yml`; TD-004 y TD-005 siguen abiertos porque no se tocaron en este alcance. Se anaden TD-024/025/026 para los P3 de R03.E.
- Checks: `git diff --check` limpio; validacion YAML OK; dry-run de scripts Python embebidos OK (logica de envio a Discord probada contra servidor local sin secretos reales).
- Verificacion manual pendiente: ejecutar los workflows reales en GitHub Actions con webhooks de Discord.

R03.B - P2 follow-ups completados (2026-06-27):
- `tools/release_artifacts.ps1` `Test-ArtifactVersion`: reescrita la lectura con `[System.IO.File]::OpenRead` + `Stream.Read` acotado a 16 MiB (no `ReadAllBytes`). El handle se libera en `finally` aunque la lectura devuelva menos bytes de los pedidos. Logica UTF-8 / UTF-16 y mensajes de exito/mismatch intactos.
- `tools/release_artifacts.ps1` `Invoke-CleanStale`: `$RepoRoot` y `$BinDir` se canonicalizan con `[System.IO.Path]::GetFullPath`. Se rechaza (throw) cualquier `$BinDir` que no sea `<RepoRoot>\bin` ni un subdirectorio de `<RepoRoot>\bin`. Confirmado en prueba negativa con `-BinDir configs` y prueba positiva con `-BinDir bin/subdir-test`. `release:clean` no puede borrar fuera de `bin/`.
- `build/windows/Taskfile.yml` `release:checksums`: anadida precondicion `[ -f "{{.BIN_DIR}}/vantare.exe" ]` con mensaje claro apuntando a `windows:package:all`. Validado en prueba negativa (moviendo `vantare.exe` y restaurandolo).
- P3 trivial aplicado en el mismo bloque: la descripcion de `release:checksums` ya no menciona `Get-FileHash` sino `certutil.exe` (alineado con el script).
- P3 trivial en `docs/release-artifacts.md` seccion 2: la precondicion de `makensis` ahora enumera explicitamente las tres fuentes aceptadas (PATH, ruta estandar, ruta alternativa en `%ProgramFiles(x86)%\NSIS\Bin`).
- Checks verdes: `git diff --check` limpio, `wails3 task release:clean`, `release:artifacts`, `release:verify`, `release:checksums`, expand del portable zip confirma estructura `vantare.exe + configs/*.json + docs/README.txt`, `go test ./...` cached OK.
- P3 fuera de alcance (queda para decision posterior): `version:sync` dirty detection.

R03.A - Version source of truth completado (2026-06-27):
- Creado archivo `VERSION` en la raíz como única fuente de verdad para la versión de la suite (`0.3.10.0`).
- Creado script `build/sync_version.go` que lee de `VERSION` y sincroniza la versión de forma consistente en `cmd/vantare/main.go`, `build/config.yml`, `build/windows/info.json` y `build/windows/nsis/project.nsi`.
- Modificada la tarea `build:native` de Windows y la raíz del `Taskfile.yml` para depender de la tarea de sincronización `version:sync` e inyectar la versión de compilación en Go mediante `-ldflags`.
- Adaptado el parser de versión de `internal/updater/version.go` para admitir el formato de versión de 4 dígitos `X.X.X.X` (Major.Minor.Patch.Build) y mantener compatibilidad absoluta con versiones legacy de 3 dígitos, respaldado por una batería de pruebas table-driven.
- Corregida la plantilla NSIS `project.nsi` para remover el `.0` redundante en `VIProductVersion`/`VIFileVersion` y permitir un versionado nativo de 4 dígitos directo.

Vantare v2 se documenta desde ahora como una suite local para sim racing, no solo como una app de overlays. Los modulos internos actuales son:
- `Overlays Studio`: perfiles, widgets, layouts, overlay desktop y OBS.
- `Ingeniero`: spotter/ingeniero determinista, historial y notificaciones.
- `Telemetria`: fuente compartida live/mock/demo.
- `Setup`: configuracion local.

Documento base: `docs/vantare-suite-architecture.md`.

P3 - Pedals compact render completado (2026-06-25):
- Implementado el nuevo `PedalsWidget` compacto basado en el diseño aprobado por GLM: Mock V4 broadcast minimal.
- Rediseñado a 3 barras verticales (`CLT`, `BRK`, `THR`), fondo transparente por defecto y track de barra `#0a0a0a` fijo.
- Eliminados del widget pedals heredado: marcha, velocidad, volante animado ficticio, canvas de historial gráfico, `BAKED_PANEL_BG`, `HISTORY_SIZE`.
- Creado helper puro `pedals-format.ts` para clamping estricto en el rango `0..100` y fallbacks seguros ante valores negativos, `NaN`, `Infinity`, `undefined` y nulos (con tests table-driven).
- Modificados los defaults del style catalog a la paleta de Mock V4: embrague `#3aa6c8`, freno `#e63946`, acelerador `#34d399` y fondo `transparent`.
- Actualizado el widget pedals en perfiles default y recomendados (`example-racing.json` y `recommended-profiles.ts`) al tamaño base recomendado de `90x100`.
- No se modificó `widget-base-size.ts`, schema, backend en Go, ni otros widgets (`Relative`/`Standings`/`Delta`/`Engineer`).
- Cobertura total de tests y checks pasados con éxito: 445 tests frontend, build, lint y `git diff --check` OK.

P4 - Pedals configuración visual básica completado (2026-06-26):
- Creado helper puro `pedals-settings.ts` para leer y normalizar la apariencia de pedals con defaults seguros, incluyendo tests table-driven y test de sincronía con style-catalog.
- Creada sección dedicada `PedalsSettingsSection` en Overlays Studio para editar visualmente el color de acelerador (throttle), freno (brake) y embrague (clutch).
- Implementado toggle de "Fondo transparente" que guarda `"transparent"` en `backgroundColor`, y un color picker de fondo personalizado visible solo cuando el toggle está desactivado.
- Integrada la sección en `WidgetSettingsPanel` de forma segura (retorna null para otros widgets), preservando la separación de responsabilidades y la inmutabilidad de los perfiles.
- Cobertura total de tests para el helper, la sección de UI, y test de integración en el panel de ajustes pasados con éxito.

P5 - Adición de widgets en LayoutStudio completado (2026-06-26):
- Creado helper puro `widget-factory.ts` con todos los tipos de widgets soportados, Hz e intervalos óptimos de refresco y dimensiones recomendadas (incluyendo pedals en `90x100` y `30` Hz, standings en `340x420` y `15` Hz, etc.).
- El helper genera IDs únicos de forma determinista ante colisiones en el perfil (ej. `pedals`, `pedals-2`, `pedals-3`).
- Extendido el hook moderno `useOverlayStudioState.ts` con la función `addWidget(type)` que añade el widget a `profile.widgets`, lo selecciona automáticamente, lo marca como dirty y mantiene sincronizado de forma reactiva `layouts.general.widgets` (schema v2) si está definido.
- Modificado `StudioWidgetList.tsx` para admitir de forma opcional la prop `onAddWidget`. Si se suministra, muestra un botón "+ Añadir widget" con un formulario denso, oscuro y mono tipo UI2; si no se suministra (como en `WidgetStudio.tsx`), se oculta protegiendo la separación de responsabilidades.
- Conectado el flujo de adición de widgets en `LayoutStudio.tsx` y `OverlaysStudioPage.tsx`.
- Cobertura total de tests automatizados agregados (para el factory, el hook de estado, la lista de widgets y el lienzo de edición); suite completa de frontend de 476 tests en verde.
- Tipo, lint, build y checks de git en verde al 100%.

EN3-EN5 - UI Ingeniero + Bus de notificaciones + Widget de overlays completado:
- Creada la nueva sección de `Ingeniero` en el Hub para gestionar el estado, spotter, sensibilidad, y ver el historial de mensajes de forma reactiva.
- Implementado el bus de notificaciones de Ingeniero que alimenta en tiempo real a Wails (Hub/Desktop) y a OBS a través de un nuevo stream SSE (`/engineer/stream`).
- Creado el widget `engineer-notifications` y registrado en el pipeline de renderizado de `WidgetRenderer`, `CompositeApp`, `ObsOverlayApp` y `WidgetList`.
- Validadas las reglas de negocio: el widget es invisible en runtime cuando no hay notificaciones activas, muestra un placeholder premium en modo edición, e ignora/oculta mensajes expirados basándose en `expiresAt`.
- Tests automatizados (400/400 de frontend y todos los de Go) y checks de linter, compilación y formato en verde al 100%.
- Review GLM de fixes EN0-EN5: ACCEPT WITH P3. No quedan P0/P1/P2 conocidos.
- EN6 (`Ingeniero` con LMU live real) queda preparado a nivel de analisis en `docs/engineer-live-lmu-adapter-analysis.md`, pero aparcado hasta que pueda validarse con datos live.

A8 - Checklist alpha privada completado:
- Auditoria integral de preparacion para alpha privada: PASS.
- 18/18 areas evaluadas como PASS para alpha privada automatizada.
- Checklist versionado en `docs/alpha-private-checklist.md`.
- Queda pendiente smoke manual antes de distribuir a testers cercanos.
- Completada la preparación de `B1 - Build compartible e instrucciones` con inventario de build, verificación de empaquetado y la creación de la guía para testers (`docs/tester-build-instructions.md`).


PREVIEW2 - WidgetStudio intrinsic width contract:
- Corregido el espacio vacio a la derecha en la preview aislada de `WidgetStudio`.
- Los widgets configurables (`relative`, `standings`) usan ancho intrinseco en el sandbox de `WidgetStudio`, envolviendo el contenido real, sea menor o mayor que `position.w`.
- `position.h` sigue usandose para la altura en modo fill.
- `WidgetRenderer` propaga un contexto interno runtime `__previewFillHost` a los widgets; no se persiste en schema.
- `LayoutStudio` y overlays runtime siguen usando `position.w/h` como contrato de layout; sin cambios.
- Bug log actualizado: `docs/widget-preview-bug-log.md` (entrada 8).
- Plan ejecutado: `docs/superpowers/plans/2026-06-23-preview2-widgetstudio-intrinsic-width.md`.

Vantare v2 es una suite local para sim racing construida con Go/Wails y React/TypeScript.

Version publica actual de runtime/build: `v0.1.0.2`.
Ultimo checkpoint de roadmap confirmado: hotfix `v0.1.0.2` publicado y verificado: Google OAuth externo, Supabase backend configurado en Go build, despliegue CI completo, assets publicados (3/3 checksums OK), smoke PASS.

Base de schema v2 para perfiles preparada:
- `schemaVersion: 2` permite layouts por sesion y variantes de widgets.
- `layouts.general.widgets` existe como layout obligatorio en perfiles v2.
- `widgets` se mantiene como espejo de compatibilidad durante la transicion.
- Los perfiles legacy sin `schemaVersion` siguen cargando sin migracion silenciosa.

Primer corte configurable de `Relative` preparado:
- Existe catalogo frontend para metricas/columnas del `Relative` inicial.
- `bestLap` y `lastLap` se modelan como columnas opcionales persistentes en variantes schema v2.
- `WidgetStudio` puede activar/desactivar esas columnas sin tocar posicion ni tamano.
- Preview, overlay desktop y OBS leen la variante referenciada por cada widget.

Formatos iniciales de columnas de `Relative` preparados (Task 6):
- El nombre de piloto ya no se recorta automaticamente al activar columnas opcionales.
- El recorte de nombre es una opcion explicita de la variante.
- `bestLap` y `lastLap` soportan formato completo/compacto, decimales, ancho, color y alineacion.
- La preview aislada de `WidgetStudio` usa el ancho intrinseco del `Relative` cuando las columnas requieren mas espacio.
- Verificacion manual aprobada: las columnas se activan, se guardan, se expanden sin recortar y mantienen alineacion por filas.

Filtros iniciales de `Relative` preparados:
- `rangeAhead` y `rangeBehind` son configurables desde `WidgetStudio`.
- El filtro de clase permite mostrar todas las clases o solo la misma clase del jugador.
- El coche del jugador puede mostrarse u ocultarse.
- Los filtros se guardan en `variant.filters`.
- Los perfiles legacy con `props.rangeAhead` y `props.rangeBehind` siguen funcionando.

Catalogo inicial de `Standings` preparado (S2):
- `frontend/src/overlay/widgets/standings-catalog.ts` define metricas y columnas sin UI ni render.
- Columnas default estables: `position`, `driverNumber`, `driverName`, `gap` habilitadas; `vehicleClass`, `currentLap`, `interval`, `bestLap`, `lastLap` deshabilitadas.
- Metrica `playerHighlight` disponible como stable no-columna para futuro resaltado.
- Metricas `pitInfo`, `distance` y `deltaLapTime` quedan como `tester` sin habilitar por defecto.
- No se incluyen multiclass ni metricas no confirmadas en el primer corte.
- Tests focalizados pasan; TypeScript pasa.

Variantes y persistencia frontend de `Standings` preparadas (S3, aprobada por GLM):
- `withDefaultWidgetVariants`, `toggleStandingsColumn`, `enrichWidgetPropsWithVariant` y `normalizeStandingsVariant` soportan `widget.type === "standings"`.
- Standings reusa el sistema de variantes schema v2 ya usado por `Relative`.
- Legacy sin `variantId`/`variants`/`schemaVersion` se normaliza a `variant-${widget.id}-default` con columnas default.
- `normalizeStandingsVariant` preserva overrides de usuario (width, format, style) y descarta columnas desconocidas.
- Idempotencia por identidad garantizada (con `deepEqual`) tanto para Relative como Standings.
- `enrichWidgetPropsWithVariant` no fuerza `templateId` para tipos no relative/standings (queda undefined si el variant no lo define).
- 37 tests focalizados pasan; suite completa 267/267; tsc y build OK.
- No se toco renderer, UI, backend, schema ni configs.

Render configurable de `Standings` en preview/desktop/OBS preparado (S4, aprobada por GLM):
- `StandingsWidget` lee `props.variant.columns` y renderiza solo columnas habilitadas en orden de catálogo.
- `standings-format.ts` aporta helpers puros: width/color/align, truncado de nombre, formato de tiempo de vuelta (full/compact, decimals 0-3), ancho intrinseco.
- Sin variant, cae a `createDefaultStandingsColumns()` (legacy identico a antes).
- `playerHighlight` nunca se renderiza como columna (es metrica no-columna).
- Pit label, tire badge y FASTEST quedan como decoraciones de fila en el area de gap.
- Brand cell standalone restaurado como decoracion (no columna): la marca de equipo es visible aunque `driverNumber` este deshabilitado.
- Fingerprint actualizado para incluir config de columnas (re-renderiza al cambiar variant).
- Tests: 36 nuevos/ajustados (standings-format + StandingsWidget); suite completa 293/293; tsc, build, lint y git diff --check OK.
- `.gitattributes` preparado para normalizar line endings al pasar por git; `git diff --check` no reporta errores bloqueantes, aunque pueden aparecer warnings CRLF en archivos ya modificados en working copy.
- No se toco UI (`hub/**`), `WidgetRenderer`, `PreviewScaler`, `WidgetSandboxPreview`, `PreviewWidgetFrame`, backend, schema ni configs.
- Validacion manual detecto una ambiguedad visual: en practice/qualy, la columna default `gap` muestra tiempos de vuelta por comportamiento legacy y puede parecer `bestLap`.
- S4.5 fue aprobada por GLM con P3: la preview de `Standings` permite elegir escenarios mock `Practica`, `Qualy` y `Carrera`, default `Carrera`, sin persistir en perfil/layout/config.

La Fase A de `Overlays Studio` se encuentra completada:
- La navegacion visible unifica `Overlays` y `Preview` bajo `Overlays Studio`.
- `Overlays Studio` sustituye la antigua entrada visible a `Preview` como flujo principal de edicion.
- `WidgetStudio` permite editar aspecto/comportamiento de widgets.
- `LayoutStudio` contiene la edicion de layout, colocacion y tamano.
- `Widgets` no expone posicion/tamano/eliminar (responsabilidad exclusiva de `LayoutStudio`).

Fase A2 de Overlays Studio completada:
- Home convertida en cuatro paneles grandes clicables: `Widgets`, `Mis perfiles`, `Recomendados por Vantare`, `Comunidad`.
- Cada panel es un `button` con aria-label, hover/focus states y toda la tarjeta como target de click.
- `Widgets` panel abre el editor de widgets existente.
- `Mis perfiles` abre una subpantalla propia con perfiles y previews reales renderizadas.
- `Recomendados por Vantare` abre una subpantalla propia con previews reales y guardado como perfil propio.
- `Comunidad` abre una pantalla dedicada de `Proximamente`.
- Todas las subpantallas usan `← Volver a Overlays Studio`.
- `ProfilePreview` reutiliza `PreviewWidgetFrame` existente para renderizar widgets reales en miniatura de forma responsive.
- Backend `hub:list` ahora incluye `Profile` completo en cada `ProfileEntry` para permitir previews de perfiles propios.

Fase B de Overlays Studio (Widget Previews) estabilizada:
- `WidgetPreviewPanel` ya no usa `PreviewWidgetFrame`.
- `WidgetStudio` usa una preview aislada basada en `WidgetRenderer`, `PreviewScaler` y `WidgetSandboxPreview`.
- `PreviewWidgetFrame` queda reservado para layout/profile previews.
- `Relative` compacto fue validado manualmente: sin clipping, sin espacio vacio derecho y centrado en el checkerboard.
- Los hallazgos y antipatrones quedan documentados en `docs/widget-preview-bug-log.md`.
- Plan ejecutado: `docs/superpowers/plans/2026-06-22-widget-sandbox-preview-architecture.md`.

Controles live restaurados dentro de Overlays Studio:
- `Mis perfiles` muestra `Abrir overlay` / `Detener overlay` por perfil.
- `LayoutStudio` muestra `Abrir overlay` / `Detener overlay` para el perfil activo.
- `WidgetStudio` no muestra controles live de forma intencionada.
- El inicio y parada reutilizan los eventos Wails existentes: `overlay:start`, `overlay:stop`, `overlay:status`.
- `Abrir overlay` se deshabilita mientras el layout tiene cambios sin guardar o se está guardando.

## Correcciones P1-P3 del review de auth/license (2026-06-27)

Implementadas sobre el trabajo de Release 02 Mini-Plan C:

- `frontend/src/lib/supabase-auth.ts`:
  - Valida `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` al construir el cliente.
  - Devuelve mensaje de error accionable cuando faltan las env vars en lugar de un reject opaco.
  - Lee `VITE_OAUTH_REDIRECT_URL` para el `redirectTo` de OAuth (default `http://localhost:34115/#/auth/callback`).
  - Expone `resetSupabaseClient()` solo para tests.
- `frontend/src/main.tsx`:
  - Añade ruta `/#/auth/callback` con `OAuthCallbackHandler` que extrae `access_token` y emite `license:validate`.
- `frontend/src/hub/auth/LoginScreen.tsx` + `frontend/src/hub/pages/HubApp.tsx`:
  - `onLoggedIn` ahora recibe el `access_token` y emite `license:validate` en lugar de hacer `window.location.reload()`.
- `frontend/src/hub/auth/PaywallScreen.tsx`:
  - Elimina `console.log` con PII; muestra mensaje "Pago en línea próximamente".
- `internal/license/service.go`:
  - Elimina el wrapper privado `emitChanged` trivial; usa `EmitChanged` directamente.
  - Actualiza comentario de `WithEmitter` para reflejar que es helper de tests.
- `cmd/vantare/main.go`:
  - Loguea `license: supabase env vars missing, running in offline-grace mode` cuando faltan ambas env vars.
- Tests:
  - Actualizados `supabase-auth.test.ts`, `LoginScreen.test.tsx`, `PaywallScreen.test.tsx`.
  - Añadido `HubApp.bridge.test.tsx` con happy path de `LicenseBridge`.
  - Añadido `TestResetDeviceRequiresClient` en Go.
- Riesgo residual documentado: el flujo OAuth requiere validación real en builds empaquetados (Wails) porque el redirect y el callback dependen de la URL configurada y del navegador/SO del usuario.

Checks ejecutados y verdes: `go test ./...`, `pnpm --dir frontend test` (564 tests), `pnpm --dir frontend build`, `pnpm --dir frontend lint`, `git diff --check` (solo warning CRLF no bloqueante en `main.tsx`).

## Objetivo actual

Release 02 Mini-Plan C cerrado con correcciones P1-P3 del review. Webhook entitlement mapping (P2-4) implementado con mapping `price_id -> product_key[]`, manejo de cancelación/revocación, upserts idempotentes y tests. Queda pendiente el gate manual, además de validar el flujo OAuth en builds empaquetadas de Wails.

Trabajo recomendado a continuación:

1. Cerrar commit de las correcciones P1-P3.
2. Continuar con el siguiente mini-plan operativo del indice de release (`docs/release-roadmap-execution-index.md`).

Checkpoint funcional `v0.3.9.1` cerrado:

- `WidgetStudio` visual rework validado manualmente.
- PREVIEW2 validado manualmente: `Relative` y `Standings` se ajustan al ancho intrinseco en la preview aislada sin espacio vacio a la derecha.
- `LayoutStudio` drag/resize/save estabilizado.
- `Relative` y `Standings` redimensionan proporcionalmente en `LayoutStudio`, runtime desktop y OBS.
- Los frames visuales se normalizan desde el primer render para perfiles legacy deformados, sin mutar ni guardar automaticamente.
- Recomendados de Vantare pueden guardarse como copia propia editable.
- `SaveProfileAsOwnCopy` genera IDs unicos, convierte a schema v2 y no muta el perfil de entrada.
- Version runtime/build actualizada a `v0.3.9.1`.
- No se haran mas reworks visuales completos hasta cerrar la mayoria de features core.

Checkpoint funcional `v0.3.9.2` cerrado:

- A6+A7 mock/live/demo UX ejecutado como lote rapido.
- El flujo source-state queda documentado en `docs/mock-live-demo-ux.md`.
- El chip global de fuente de telemetria en Topbar tiene `title` y `aria-label`.
- El selector mock de `Standings` se valida por `aria-pressed`.
- Changelog publico y publicacion automatica a Discord por tags `v*` preparados.
- Version runtime/build actualizada a `v0.3.9.2`.

Checkpoint funcional `v0.3.10.0` preparado para cierre:

- B1 build compartible e instrucciones para testers completado.
- B2 known issues y protocolo de feedback completado.
- B3 OBS setup local documentado y B3.1 corregido para usar perfiles reales en la URL de Ajustes.
- B4 hotkeys basicas endurecidas en Windows con stub multiplataforma.
- B5 inventario Delta best live completado.
- B6 Delta best live implementado: backend prioriza `DeltaBest` nativo de LMU, fusion acepta deltas negativos, `DeltaWidget` muestra `Target` y `Lap` desde telemetria.
- Reviews GLM de B4/B6 aceptadas sin P0/P1/P2.
- Ingeniero queda integrado como modulo de suite, con EN6 live LMU aparcado hasta validacion real.
- Queda pendiente verificacion manual prolongada de Delta live con LMU.

Trabajo posterior al checkpoint `v0.3.10.0`:

1. `A8 - Checklist alpha privada` completado con PASS;
2. `B1 - Build compartible e instrucciones` completado con la guía del tester;
3. `B2 - Known issues y canal feedback` completado con la definición de canales de Discord y plantilla de bug report;
4. `B3 - OBS setup local sencillo` completado con la guía de OBS local;
5. `B4 - Hotkeys basicas` completado;
6. `B5 - Delta best live inventario` completado;
7. `B6 - Delta best live implementacion` completado a nivel automatico y pendiente de prueba live prolongada;
8. mantener EN6 aparcado hasta poder validar LMU live;
9. no iniciar nuevos reworks visuales completos hasta cerrar mas features core.
10. `P1 - Pedals inventario datos/diseño actual` completado.
11. `P2 - Pedals nuevo diseño pequeño` completado como plan visual aprobado.
12. `P3 - Pedals compact render` completado con el nuevo render compacto `CLT`/`BRK`/`THR`.
13. `P4 - Pedals configuracion visual basica` completado con la sección dedicada en WidgetStudio y color pickers.
14. `P5 - Adición de widgets en LayoutStudio` completado y commiteado (commit `3db203a`): widget-factory, addWidget en useOverlayStudioState, botón `+ Añadir widget` en StudioWidgetList, PedalsSettingsSection y pedals-settings helper.
15. Aprobado para beta testers: `P6 - Widget Preset Gallery` (Galería de presets de widgets), planificada justo después de `P5` y antes del smoke test de la fase (ahora `P7`).

Release 01 - Task 1 (Recommended profiles audit + rename) completado (2026-06-26, commit `3db203a`):
- Reemplazados los 3 perfiles recomendados antiguos (Racing Básico, Streamer Clean, Minimal Telemetry) por 2 oficiales: `Clean Overlay` y `Le Mans Ultimate - Basic`.
- `configs/custom-hfg.json`: renombrados id/name a `vantare-clean-overlay`/`Clean Overlay`. Filename físico conservado para no romper `embed.go`/`main.go`. Positions originales preservadas.
- `configs/custom-1.json`: nuevo config (no embebido), renombrados id/name a `vantare-lmu-basic`/`Le Mans Ultimate - Basic`.
- `recommended-profiles.ts`: ambos perfiles en schema v2 con `layouts.general.widgets`. Clean Overlay conserva `variant-relative-default`; LMU Basic incluye pedals deshabilitado.
- Tests reales añadidos: ids/nombres exactos, widgets por perfil, schemaVersion 2, layouts.general, variantId, inmutabilidad del clone.
- Review adversarial GLM (2 ciclos): NEEDS FIXES → ACCEPT WITH P3. P1 (positions sin autorizar, diff mezclado no reportado) y P2 (tests débiles, test P5 en diff, schema inconsistente) resueltos. P3 no bloqueantes documentados (custom-1.json huérfano, pedals enabled:false, id≠filename).
- Checks: 480 tests frontend OK, build OK, lint OK, `go test ./pkg/config ./internal/app` OK, `git diff --check` OK.
- Verificación manual pendiente: abrir app, confirmar 2 perfiles en Recomendados, guardar copias, abrir en LayoutStudio.

Release 01 - Task 4 (Widget Preset Implementation) completado (2026-06-26):
- Creado `PresetService` en Go para persistir presets a `{cfgDir}/widget-presets.json`.
- Implementado generador nativo de UUID v4 con `crypto/rand` sin dependencias adicionales.
- Registrado `PresetService` en Wails y conectado su ciclo de vida y handlers en `main.go`.
- Creado helper puro `widget-presets.ts` para extraer y aplicar configuraciones estéticas e internas de un widget sin tocar propiedades de diseño ni runtime.
- Creado `widget-presets-store.ts` para conectar reactivamente la UI con los eventos de Wails.
- Creado componente UI `WidgetPresetSection.tsx` en `WidgetSettingsPanel` con controles oscuros densos para guardar, aplicar, renombrar y eliminar presets.
- Corregidos 75/75 archivos de pruebas unitarias de frontend e integración (incluyendo mocks de Wails para JSDOM).
- Review GLM fixes P1: resueltos los 4 P1 (race condition en `listPresets` vía correlation ID, errores silenciosos del backend, variantes huérfanas al aplicar preset, aliasing por referencia compartida).
- Minifix P3 del orquestador: añadido timeout de 10s en `listPresets` con reject controlado; handlers Go ahora emiten error también con payload `nil`; tests añadidos.
- Review GLM minifix: ACCEPT (ningún P0/P1/P2 nuevo; 3 P3 residuales menores documentados).
- Checks: Go tests OK, frontend tests OK (504 tests), frontend build y lint OK, git diff check OK (salvo warning CRLF en `pnpm-workspace.yaml` de otro agente).
- Siguiente operativo: commit de Release 01 Task 4 o smoke manual, según decisión de Isaac.




Ultimo miniplan completado y aprobado por GLM:
- `docs/superpowers/plans/2026-06-22-s4-standings-render-configurable.md`
  - Renderer de `Standings` configurable por variantes (enabled/width/format/style).
  - Helpers puros en `standings-format.ts`; brand cell restaurado como decoracion.
  - Tests TDD pasando; suite completa 293/293 verde; tsc, build, lint y diff --check OK.
  - Sin cambios en UI, backend, schema ni configs.
  - Review GLM: ACCEPT WITH P3 FOLLOW-UPS; P3 resueltos por el orquestador (alineamiento con relative-format, test carry-over corregido, brand cell restaurado, test de posicion reforzado, line endings normalizados).

Miniplan implementado tecnicamente:
- `docs/superpowers/plans/2026-06-22-widget-sandbox-preview-architecture.md`
  - `WidgetRenderer` extraido y reutilizable; `PreviewWidgetFrame` reducido a chrome de layout.
  - `PreviewScaler` creado como componente generico sin logica de widgets.
  - `WidgetSandboxPreview` creado como sandbox aislado para `WidgetStudio`.
  - `WidgetPreviewPanel` ahora delega en `WidgetSandboxPreview` y deja de usar `PreviewWidgetFrame`.
  - `position.x/y` se ignoran en el sandbox; `position.w/h` no se modifican.
  - Ajustes P1 de review corregidos: compact mode mide altura/ancho real sin conservar `position.h/w` como minimo visual, y `WidgetRenderer` llena el host por defecto.
  - Validacion manual aprobada: Relative compacto queda centrado, sin espacio vacio derecho y con columnas alineadas.
  - Bug log: `docs/widget-preview-bug-log.md`.

UI de `Standings` en `WidgetStudio` preparada (S5):
- Controles de columnas opcionales y formatos conectados a variantes schema v2.
- Defaults de UI leidos desde el catalogo de `Standings`.
- Inputs numericos con clamp en UI.
- Sin controles de posicion/tamano/eliminar.
- Checks reportados por worker: suite frontend completa, TypeScript, build, lint y `git diff --check` en verde.
- P3 iniciales revisados y corregidos salvo refactors compartidos fuera de alcance.

S6 - Standings verificacion completa y docs ejecutada (2026-06-23):
- Worker: Deepseek V4 Flash.
- Todos los checks automaticos pasaron (322 tests frontend, tsc, build, lint, Go tests, `git diff --check` sin errores; warnings CRLF no bloqueantes en working copy).
- Checklist manual creada en `docs/standings-manual-verification.md`.
- Review GLM: `ACCEPT WITH P3`; se corrigieron los P2 documentales antes de avanzar a UI1.
- Release/tag publicado: `v0.3.6.1`.

UI1 - Analisis visual de `WidgetStudio` completado (2026-06-23):
- Worker: Minimax M3.
- Documento creado: `docs/overlays-studio-visual-analysis-ui1.md`.
- Alcance: solo `WidgetStudio`, no Home, `LayoutStudio`, perfiles, recomendados, comunidad ni navegacion global.
- No se toco codigo, tests, configs, schema ni backend.
- Checkpoint documental: sin tag/version propia; se agrupara bajo la siguiente version funcional.

UI2 - WidgetStudio Visual Rework ejecutado (2026-06-23):
- Worker: Minimax M3.
- Cambios solo en `WidgetStudio`, `WidgetSettingsPanel`, `StudioWidgetList`, `RelativeSettingsSection`, `StandingsSettingsSection` y componentes locales nuevos `studio-controls.tsx`.
- Cabecera global minima (back, titulo, estado con dot rojo, Guardar); widget metadata movida al sticky header del panel derecho.
- Secciones Relative/Standings reordenadas y compactadas; controles en filas densas con tipografia mono y label oculto de cabecera de seccion.
- Lista de widgets compacta con tabs pill, busqueda con icono y dot rojo de seleccion.
- Selector mock `Práctica` / `Qualy` / `Carrera` reestilizado como segmented control con `aria-pressed`.
- Tests focales y de pagina actualizados a los nuevos textos; anadidos tests para sticky header y studio-controls.
- Sin cambios en LayoutStudio, backend, schema, configs, build config ni versionado.
- Checks: 328/328 tests frontend, `tsc -b`, `pnpm build`, `pnpm lint` y `git diff --check` sin errores (warnings CRLF conocidos no bloqueantes).
- Verificacion manual: aprobada por el usuario tras PREVIEW2.

PREVIEW2 - `WidgetStudio Intrinsic Width` completado (2026-06-23):
- Documento: `docs/superpowers/plans/2026-06-23-preview2-widgetstudio-intrinsic-width.md`.
- Alcance: corregir el espacio vacio derecho en la preview de `WidgetStudio` haciendo que `Relative` y `Standings` usen ancho intrinseco en sandbox.
- Decision: `WidgetStudio` no edita tamano, por lo tanto la preview debe envolver el contenido; `LayoutStudio` y overlay runtime siguen usando `position.w/h`.
- Review GLM: `NEEDS FIXES` inicial por altura fill de `Relative`; P2 corregido.
- Verificacion manual: aprobada por el usuario; `Relative` y `Standings` se ajustan correctamente sin espacio vacio derecho.
- Version objetivo: `v0.3.9.0`.

UI2 - Miniplan `WidgetStudio Visual Rework` creado (2026-06-23):
- Documento: `docs/superpowers/plans/2026-06-23-ui2-widgetstudio-visual-rework.md`.
- Alcance: rework visual de `WidgetStudio` con densidad alta tipo RaceLabs y margen creativo para el worker UI/UX.
- Estado: ejecutado y validado como parte de `v0.3.9.0`.

A4+A5 - Recomendado -> copia editable implementado (2026-06-25):
- Inventario: el flujo `OverlaysStudioPage` ya emitía `hub:save-own-copy`; `HubService.SaveProfileAsOwnCopy` persistía copias pero fallaba con duplicados y no convertía a schema v2.
- Cambios:
  - `frontend/src/hub/overlays/recommended-profiles.ts`: `cloneRecommendedProfile` guarda metadata `source` (`kind: recommended`, `profileId` y `name` originales) y elimina cualquier identidad de solo lectura.
  - `frontend/src/hub/pages/OverlaysStudioPage.tsx`: el prompt de copia usa `${nombre} (copia)` por defecto para diferenciar la copia.
  - `internal/app/hub_service.go`: `SaveProfileAsOwnCopy` genera un id de archivo único ante colisiones, convierte el perfil a schema v2 si aplica (layouts/variants) y persiste el perfil completo.
- Tests añadidos/ajustados en `recommended-profiles.test.ts`, `OverlaysStudioPage.test.tsx` e `internal/app/hub_service_test.go` (copia, id único, conversión v2, preservación de layouts/variants, error paths).
- Checks pasados: 358 tests frontend, `tsc -b`, `pnpm build`, `pnpm lint`, `go test ./pkg/config ./internal/app`, `git diff --check` sin errores bloqueantes (warnings CRLF conocidos).
- Review y verificacion manual aprobadas; A5 queda cerrado en `v0.3.9.1`.

### Reconexión live-first aprobada para overlays

- Al pulsar `Abrir overlay`, la app intenta reconectar con LMU antes de abrir la ventana.
- Si LMU no está disponible, el overlay sigue abriendo con datos mock como fallback visual.
- `-live=false` queda como modo explícito de desarrollo/testing.
- La barra superior muestra el estado de la fuente (`LMU conectado`, `Esperando LMU` o `Mock`).

## Proximas tareas pequenas

1. `A6+A7 - Mock/live/demo UX: inventario + fixes`: ejecutado (2026-06-25).
   - Inventario: flujo source-state correcto; Topbar muestra `LMU conectado` / `Esperando LMU` / `Mock` / `Fuente pendiente`.
   - WidgetStudio mock scenario selector es preview-only y no marca dirty (verificado por test existente).
   - Fixes aplicados:
     - Topbar source chip: añadidos `title` y `aria-label`.
     - Creado `Topbar.test.tsx` con 7 tests de source status.
     - Tests de mock scenario: cambiados de className a `aria-pressed`.
   - Documento de hallazgos: `docs/mock-live-demo-ux.md`.
   - No se tocó telemetría, preview/layout, schema, backend Go ni configs.
2. `A8 - Checklist alpha privada`: ejecutado y documentado en `docs/alpha-private-checklist.md`.
3. `B1 - Build compartible e instrucciones`: completado.
4. `B2 - Known issues y canal feedback`: completado.
5. `B3 - OBS setup local sencillo`: completado.
6. `B4 - Hotkeys basicas`: Fase B4.1 (Hardening de atajos, stubs multiplataforma y documentación para testers) completada y validada mediante tests. Listo para siguientes fases de UX.
7. `B5 - Delta best live inventario`: completado. Viabilidad YES, detectado bug crítico de fusión de Go.
8. `B6 - Delta best live implementacion`: completado. Backend y frontend listos; queda smoke manual live con LMU para recopilar feedback real.
9. mantener EN6 aparcado hasta poder validar LMU live.
10. No iniciar mas reworks visuales completos hasta cerrar la mayoria de features core.
11. `P1 - Pedals inventario datos/diseño actual` completado.
12. `P3 - Pedals compact render` completado.
13. `P4 - Pedals configuracion visual basica` completado.
14. Siguiente operativo: `P5 - Recomendados beta pulidos`.
15. Aprobado para beta testers: `P6 - Widget Preset Gallery` (Galería de presets de widgets), programada antes del smoke test (ahora `P7`).
16. Ejecutar REL1/Discord release al pushear el tag funcional.
17. Plan creado / pendiente de review: `Overlay edit mode in-place por hotkey (Ctrl+Shift+E)` — ver `docs/superpowers/plans/2026-06-28-overlay-in-place-edit-mode-hotkey.md`. PLAN ONLY, sin tocar codigo de producto. Opcion recomendada B (modo in-place dentro de `CompositeApp` reutilizando `profile:set-mode` + `WidgetEditFrame`).




## Beta stabilization closure (2026-06-28)

Bloque de estabilizacion que desemboco en la beta publica `v0.1.0.0` tras abandonar la linea interna `v0.3.*`. Atiende los findings del review adversarial global sin añadir features fuera del alcance de beta.

- **Remotion fuera de beta**: el proyecto Remotion (`frontend/src/remotion/`, `frontend/remotion.config.ts`, scripts `dev:video`/`render:video`/`still:video` en `frontend/package.json`, deps `@remotion/*` en `pnpm-lock.yaml`) es un trabajo paralelo del usuario, no parte de Vantare. Se stasheó con mensaje `pre-beta-remotion-work` (incluye tracked + untracked) para sacarlo del working tree de la beta. No se commitea nada de Remotion en esta tanda. Restaurar con `git stash pop` (o `git stash apply 'stash@{0}'`) cuando retomes ese proyecto.
- **P1 updater ctx**: las goroutines lanzadas en los handlers `updater:install:verified` (y el legacy, ya desactivado) en `cmd/vantare/main.go` ahora propagan el `ctx` de `signal.NotifyContext` a `InstallVerifiedVersionCtx`. Si la app se cierra (SIGINT/SIGTERM) durante la descarga, el `http.Request` queda cancelado y la goroutine termina en lugar de quedarse viva escribiendo eventos en un emisor cerrado. Cobertura añadida en `TestUpdaterServiceInstallVerifiedVersionCtxRespectsCancellation`.
- **P2 handler legacy `updater:install`**: el handler Wails para `updater:install` se reemplaza por un rechazo explícito (`emitUpdaterError("legacy updater:install is disabled; use updater:install:verified")`). El frontend nunca emite el evento legacy (`UpdateBanner.test.tsx` y `SettingsPage.test.tsx` ya lo verificaban como test de regresión). El método Go `UpdaterService.InstallVersion` se elimina también, eliminando la posibilidad de bypass desde la UI hacia el servicio Wails registrado.
- **Checks**: `go test ./cmd/... ./internal/... ./pkg/...` verde, `git diff --check` limpio, `gofmt` y `go vet` limpios sobre los archivos modificados.
- **Riesgos restantes**: heredados del review adversarial global y ya documentados en `docs/technical-debt.md` (TD-019 `-race`, TD-024 workflows Discord reales, etc.). El P1-2 (hotkeys en thread incorrecto) y los P3 quedan fuera de alcance explícito de esta tanda.

## Riesgos actuales

- **Gate manual de OAuth en producción Wails**: El flujo de redirección OAuth de Supabase no se puede validar de forma automatizada sin un entorno Supabase real y un empaquetado de producción de Wails. Al compilar para producción, se debe asegurar que `VITE_OAUTH_REDIRECT_URL` esté configurado a una URL externa válida (o deep link registrado) que redirija la sesión de vuelta a la app local, ya que en builds empaquetadas Wails el protocolo `http://wails.localhost` o similar no puede recibir redirecciones OAuth directas desde navegadores externos sin mediación.
- Hay cambios abiertos en git de otros agentes; no mezclar tareas nuevas con ellos sin revisar.
- El README principal puede estar desactualizado respecto a `Overlays Studio`.
- Parte de la documentacion historica vive fuera de `vantare-v2`.
- Los agentes pueden confundir `Widgets` con `LayoutStudio`; mantener separacion estricta.
- Modificar `PreviewWidgetFrame` puede impactar a los mini-previews de perfiles creados en la Fase A2 si no se maneja bien la propiedad de "aislamiento" o "escala".
- La preview aislada de `WidgetStudio` ya esta separada de `PreviewWidgetFrame`; mantener esta separacion y consultar `docs/widget-preview-bug-log.md` antes de tocarla.
- Bugs importantes ya cerrados viven en `docs/resolved-bugs.md`; consultarlo antes de reabrir trabajo de preview, guardado o variantes legacy.
- La app ya tiene el flujo principal de edicion, el plan maestro vive en `docs/master-feature-plan.md` y el tablero orquestable vive en `docs/roadmap-execution-board.md`.
- Hallazgos P3 pendientes de resolver (documentados para follow-up):
  1. `columns: []` se normaliza a defaults, lo cual es ambiguo para futuros cortes.
  2. `enrichWidgetPropsWithVariant` normaliza variantes en cada render/tick (impacto menor de rendimiento).
  3. Densidad visual si se activan `bestLap` y `lastLap` en widgets muy pequeños (parcialmente mitigado al usar ancho intrínseco y recorte de nombre explícito).
  4. Queda pendiente crear un harness visual/browser con Playwright para detectar regresiones visuales que JSDOM no cubre.
  5. P3 S4.5: un test usa clase CSS para comprobar estado activo del selector mock; preferir `aria-pressed` en un futuro rework.
  6. P3 S4.5: el selector mock usa paleta neutral; conviene alinearlo con el rework UI/S5.
  7. P3 S4.5: `mockSessionScenario` se propaga a todos los widgets aunque solo `Standings` lo consume; sin impacto funcional.
  8. P3 S4.6: falta test de regresion para Ctrl+S con `autosave:false`; el handler no cambio y GLM no lo considera bloqueante.

## Overlay edit mode in-place por hotkey (2026-06-28)

Implementado el modo de edicion in-place activable con `Ctrl+Shift+E`:

- Backend/Wails:
  - Hotkey por defecto `toggleEditMode = ctrl+shift+e` en `DefaultAppSettings`.
  - Handler `handleToggleEditMode` en `cmd/vantare/main.go`: togglea entre `ModeRacing` y `ModeEdit` sobre el overlay abierto; si no hay overlay abierto, abre el perfil activo y entra directamente en edit mode.
  - Evento FE<->Go `overlay:toggle-edit-mode` y evento Go->FE `overlay:edit-mode-changed`.
  - `rebuildHotkeys()` incluye `toggleEditMode` en el `actionMap` (cierre del finding P0-NEW del review adversarial).
  - Reset a `ModeRacing` al detener/cerrar el overlay (`overlay:stop`) y al abrir un overlay nuevo (`overlay:start`).
  - `ProfileService.EmitLoaded` retorna `layoutOrigin = {0,0}` en `ModeEdit` (fullscreen) para que las coordenadas de los widgets no se desplacen.
  - **Fix P0 (mouse passthrough real):** `OverlayWindow` expone `ApplyProfileMode`; `wailsOverlayWindow` conserva su `window.Manager` y aplica `ModeRacing`/`ModeEdit` en la ventana Wails real. `handleToggleEditMode` y `resetOverlayDisplayMode` aplican el modo a la ventana actual tras mutar el perfil, garantizando passthrough ON en racing y OFF en edit mode.
  - **Fix P1 (streaming/estado):** `handleToggleEditMode` usa `overlayRunning.Store(newStatus.Running)`; si `StartActiveOverlay` no crea ventana desktop (streaming), no entra en edit mode.
  - **Fix P1 (arranque siempre en racing):** tanto `overlay:start`, `overlay:stop` como el hotkey `toggleOverlay` llaman `resetOverlayDisplayMode` tras detener o iniciar la ventana, evitando que un perfil persistido en `ModeEdit` arranque en edit mode.
- Frontend:
  - `CompositeApp` escucha `overlay:edit-mode-changed` y deriva `editMode` de `windowMode` en `profile:loaded`.
  - En edit mode renderiza `WidgetEditFrame` (drag/resize) en lugar de `WidgetHost`.
  - Mitigacion del finding P1-NEW: en edit mode `layout:saved` ya no emite `profile:request`, evitando el flash/re-render completo tras cada autosave.
  - Indicadores visuales `EDIT MODE` y hint de salida.
  - Autosave en `layout:save` al soltar drag/resize.
  - **P2:** `WidgetEditFrame` recibe variantes del perfil via `enrichWidgetPropsWithVariant`, alineando el render en edit mode con el runtime.
- Tests:
  - Go: `TestDefaultAppSettingsIncludesToggleEditMode`, `TestParseHotkeyComboCtrlShiftE`, `TestHotkeyManagerUpdateFromSettingsKeepsToggleEditMode`, `TestProfileServiceEmitLoadedEditModeOriginZero`, `TestBuildHotkeyActionMapIncludesToggleEditMode`, `TestHandleToggleEditModeTogglesDisplayMode`, `TestHandleToggleEditModeOpensOverlayWhenNotRunning`, `TestHandleToggleEditModeRespectsRunningStatusForStreaming`, `TestResetOverlayDisplayModeResetsToRacing`, `TestNewOverlayWindowAppliesProfileMode`.
  - Frontend: tests de CompositeApp para entrar/salir de edit mode, indicador, toggle por evento, no `profile:request` en `layout:saved` durante edit mode, y emision de `layout:save` tras drag.
- Documentacion:
  - `docs/tester-build-instructions.md` actualizado con la hotkey `Ctrl+Shift+E`.
- Riesgos residuales:
  - `WidgetEditFrame` no conserva ratio de aspecto al redimensionar (igual que el flujo legacy `/overlay/edit`); aceptado para demo pre-stream.
  - El chrome de edicion es visible si se edita mientras se hace stream; aceptado para demo.
  - Si `engineer-notifications` esta activo, en edit mode aparece como frame vacio porque `WIDGET_COMPONENTS` no lo incluye (heredado del flujo legacy).

## Fix P0 residual overlayRunning (2026-06-28)

Cierre del P0 residual detectado en el review final del fix P0 de Overlay Edit Mode (`overlayRunning` podia quedar `true` sin ventana):

- **Fix A (cierre externo):** `wailsOverlayFactory.stopOverlay` (callback de `WindowClosing`) ahora, tras `overlayController.Stop()`, si `overlayRunning.Load()` es true, llama `resetOverlayDisplayMode` y hace `overlayRunning.Store(false)`. El guard evita doble reset cuando el stop ya fue procesado por la via normal.
- **Fix B (error de `overlay:start`):** el handler `overlay:start` ahora usa `status.Running` (no `true` fijo) tras `hubSvc.StartOverlay` exitoso, y en error hace `overlayRunning.Store(false)` si `!status.Running`.
- **Fix C (error de `StartActiveOverlay` desde edit hotkey):** `handleToggleEditMode` ahora, si `StartActiveOverlay` falla, hace `overlayRunning.Store(false)` cuando `!newStatus.Running` y no emite `overlay:edit-mode-changed`.
- **Fix D (P3 log noise):** `resetOverlayDisplayMode` ahora solo aplica el modo a la ventana si `overlayController.CurrentWindow() != nil`. Sigue forzando el profile a racing aunque no haya ventana.
- Tests Go anadidos en `cmd/vantare/main_test.go`: cierre externo limpia flag y resetea modo; cierre con flag ya false no emite eventos; fallo de `StartActiveOverlay` desde edit hotkey limpia flag y no emite edit-mode-changed; `ApplyProfileMode` fallido no emite edit-mode-changed; `resetOverlayDisplayMode` sin ventana no toca ventana y resetea modo.
- P1 residual documentado (no bloqueante): race menor entre `CurrentWindow()` y `ApplyProfileMode` fuera del lock del controller; queda para un futuro `ApplyModeToCurrentWindow` bajo lock.
- Checks: `gofmt`, `go test ./cmd/vantare/... ./internal/app/... ./internal/window/...`, `go test ./...`, `go vet ./cmd/vantare/... ./internal/app/... ./internal/window/...`, `git diff --check` — todos OK.

## Auth/Licencias - Login bloqueante y gating free/paid/suite (2026-06-29)

Bloque de auth/licencias para beta publica `v0.1.0.0`. Implementa login obligatorio con Google OAuth, gating basico de licencia free/paid/suite, gracia offline de 24h y logout que devuelve al gate.

- **Login bloqueante efectivo**: `HubApp.tsx` envuelve el shell con `LicenseProvider + LicenseBridge + LicenseGate`. Sin sesion valida, se renderiza `LoginScreen`.
- **Google OAuth como minimo obligatorio**: boton principal `Continuar con Google` con email/password y Discord como accesos secundarios.
- **Planes free/paid/suite**: helper `internal/license/plan.go` + espejo TS `frontend/src/lib/plan.ts`. `AccountSettings.tsx` muestra tarjeta Plan y Estado. `PaywallScreen.tsx` pinta los cuatro planes con Suite como recomendado.
- **Logout devuelve al gate**: `signOut()` + refresh; el gate recibe `anonymous` y renderiza `LoginScreen`.
- **Gracia offline 24h**: si el servidor no responde, el cache local mantiene entitlements por 24h desde la ultima validacion exitosa.
- **Tests**: tests actualizados para LoginScreen, PaywallScreen, HubApp; nuevos tests para plan.go y plan.ts.
- **Docs**: docs/stripe-integration-plan.md y docs/supabase-schema-release.md actualizados.
- **Archivos**: HubApp.tsx, LoginScreen.tsx, PaywallScreen.tsx, paywall-plans.ts, AccountSettings.tsx, plan.ts, plan.go y sus tests.

### Riesgos residuales
- El flujo OAuth requiere validacion real en builds empaquetados Wails (redirect URL).
- Sin portal de pagos embebido en la app (se hace desde portal externo, webhook listo).

## Galeria de disenos oficiales - Beta v0.1.0.0 (2026-06-29)

Cierre del P3-2 de `docs/adversarial-review.md`: la galeria de disenos oficiales de widgets queda **incluida** en la beta publica `v0.1.0.0` tras el `ACCEPT WITH P3` del Worker C.

- **Catalogo oficial de solo lectura**: helper puro `frontend/src/hub/widgets/widget-design-gallery.ts` con 8 disenos oficiales (2 por cada widget type: `Relative`, `Standings`, `Delta`, `Pedals`). IDs estables en codigo (sin UUID); nombres y descripciones claras para usuario beta.
- **Aplicacion sin tocar `position`**: `applyOfficialDesign` reusa `applyPreset` (spread preserva `position` por contrato) y genera un `variantId` determinista (`official-<designId>-<widgetId>`). El widget cambia apariencia y variante; layout intacto.
- **Sin marketplace, sin cloud sync, sin sharing remoto**: fuera de beta por contrato.
- **Contrato de responsabilidades intacto**: `WidgetStudio` (donde vive la galeria) no expone position/tamano/eliminar. `LayoutStudio` no se ha tocado.
- **Convivencia con presets de usuario**: los presets oficiales son solo lectura; los presets de usuario siguen persistiendo en `PresetService` Go y funcionan como antes.
- **Tests**: 73 nuevos. Suite total: 666 tests frontend OK.
- **Docs publicos actualizados**: changelog, build instructions, known issues y feedback process reflejan la inclusion.
- **Plan ejecutado**: `docs/superpowers/plans/2026-06-29-widget-design-gallery-beta.md`.

### Riesgos residuales
- Sin preview miniatura renderizada del widget con el diseno aplicado (solo nombre + descripcion textual).
- Sin estado 'activo/inactivo' del diseno aplicado: cualquier cambio libre del usuario sobreescribe el ultimo diseno oficial aplicado.
- No hay marketplace, cloud sync ni compartir disenos entre usuarios (por contrato de beta).

## Decisiones pendientes

- Si los planes externos deben copiarse, moverse o archivarse dentro de `vantare-v2/docs`.
- Si la antigua ruta/pagina `Preview` debe eliminarse definitivamente o mantenerse como compatibilidad interna.
- Que decision ejecutar primero del plan maestro: separar/verificar responsabilidades, inventario de `Standings`, `LayoutStudio` drag/resize, mock/live/demo o rework UI.
- Cuando crear un harness visual/browser para previews con Playwright tras estabilizar `WidgetSandboxPreview`.

## No cambiar sin aprobacion

- Stack principal Go + Wails + React/TypeScript.
- Separacion `Widgets` vs `LayoutStudio`.
- Configuracion de build/package.
- Dependencias.
- Formato de perfiles JSON.
- Arquitectura de telemetria LMU.
