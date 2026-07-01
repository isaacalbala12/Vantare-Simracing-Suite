# Deuda tecnica

Documento vivo para centralizar deuda tecnica aceptada, P2/P3 diferidos y follow-ups de reviews.

## Reglas

- Todo P0/P1 debe corregirse antes de cerrar la tarea afectada.
- Todo P2 debe corregirse antes de cerrar la tarea o quedar listado aqui con owner, release objetivo y motivo.
- Todo P3 puede quedar aqui si no bloquea el avance, pero debe tener una decision clara: ignorar, agrupar, corregir en release concreta o revisar en auditoria global.
- No usar este documento como sustituto de tests o reviews. Solo registra deuda aceptada.
- Al cerrar una deuda, moverla a "Cerrado" con fecha y commit si existe.

## Formato

```md
### TD-000 - Titulo corto

- Severidad: P2/P3
- Area: release/frontend/go/docs/preview/licensing/updater/ci
- Origen: review/tarea/documento
- Estado: abierto/en progreso/cerrado
- Release objetivo: R03/R04/R15/post-release
- Motivo para diferir:
- Fix esperado:
- Riesgo si se ignora:
```

## Abierto

### TD-050 - HUB-05 P3 visual/UX cleanup

- Severidad: P3
- Area: frontend/hub
- Origen: evidencia final HUB-05 v5.2 Shell, Dashboard y Launcher (2026-06-30)
- Estado: abierto
- Release objetivo: `0.1.x` UI/cableado o auditoria global post-Hub
- Motivo para diferir: HUB-05 prioriza que el primer corte visual funcione sin fake data y sin tocar Go/overlays/auth. Los puntos restantes son limpieza de UX/test/dead code, no bloquean el uso.
- Fix esperado:
  - decidir si `Launcher` debe aparecer simultaneamente en topbar, sidebar y dock, o consolidar entradas tras ver uso real;
  - conectar el modo Lite a las primitivas v5.2 o documentar explicitamente que Lite solo afecta zonas legacy;
  - sustituir el `top: 58px` fijo del dock por token/CSS var compartido con la topbar;
  - definir el spec multi-sim/associated apps del Launcher antes de ampliar placeholders;
  - migrar tests de disabled a matcher semantico cuando el setup de testing lo permita;
  - eliminar o reconectar `EmptyNextRace.tsx` y `EmptyActivity.tsx` si quedan sin consumidores tras CALENDAR-02.
- Cierre parcial 2026-07-01 (HUB-05-B): casts `as Section` y `id: string` en `HubApp.tsx` sustituidos por `isSection` + `setSection` tipado; `Topbar.activeSection: Section` y `onNavigate: (id: Section) => void`; import muerto y reexport `EMPTY_CALENDAR_FOR_TESTS` eliminados de `NextRaceCard.tsx`; test complaciente `screen.queryByText(/sin carreras registradas/i)` de `DashboardPage.test.tsx` quitado (queda solo `data-testid="last-activity-card"`). Siguen abiertos: entrada triple Launcher, Lite mode en primitivas v5.2, dock top hardcoded, spec multi-sim/associated apps, tests de disabled a matcher semantico, limpieza legacy `EmptyNextRace`/`EmptyActivity`.
- Riesgo si se ignora: duplicidad visual menor, deuda de mantenimiento y posible confusion futura al extender Launcher/Calendar, pero sin bloqueo funcional inmediato.

### TD-043 - Supabase RPC get_account_entitlements sin migracion SQL

- Severidad: P3
- Area: licensing/supabase
- Origen: diagnostico P0 Free plan bloqueado (2026-06-29)
- Estado: abierto
- Release objetivo: `0.1.x` antes de activar pagos reales o antes de release publico (R15 o equivalente)
- Motivo para diferir: el fix A+B+C aplicado hace que el binario Go reciba la config de Supabase via `generate_supabase_config.ps1` (genera `supabase_build.go` con `init()` base64) y que el estado `unconfigured` no bloquee al usuario. La función RPC `get_account_entitlements` debe existir en el proyecto Supabase para que la validación real funcione. Si no existe, `FetchAccount` devuelve error y, con `s.client != nil`, el estado cae a `authenticated-no-entitlement` (Free, NO `unconfigured`), lo cual es seguro y permite al usuario entrar al Hub. El estado `unconfigured` solo se devuelve cuando NO hay client Supabase configurado (`s.client == nil`).
- Fix esperado: crear migracion SQL con `get_account_entitlements` y `reset_active_device` en el proyecto Supabase, o documentar los pasos manuales en el dashboard. La funcion debe devolver `{user_id, email, entitlements, active_device, expires_at}`.
- Riesgo si se ignora: los usuarios Free entran al Hub (correcto, estado `authenticated-no-entitlement`), pero los usuarios pagados no reciben sus entitlements reales (siempre caen a `authenticated-no-entitlement` o a cache grace si existe cache válida).
- Razon de severidad: no bloquea `v0.1.0.2` porque el objetivo inmediato es Google OAuth -> Free -> Hub. Con `s.client != nil`, el fallo RPC cae a Free (no bloqueo). Sube a P2 antes de activar cobros/entitlements reales.

### TD-044 - Sesion Supabase no persiste en WebView tras OAuth externo

- Severidad: P3
- Area: auth/frontend
- Origen: diagnostico P0 Free plan bloqueado (2026-06-29)
- Estado: cerrado (AUTH-03, 2026-07-01)
- Release objetivo: `0.1.x` despues del cierre de UI v5.2 (`AUTH-03`)
- Motivo para diferir: el OAuth ocurre en el navegador externo. Los tokens de Supabase se almacenan en el navegador, no en el WebView2 de Wails. En el proximo reinicio, `getSession()` devuelve null y el usuario debe reautenticarse. El fix anti-regresion en `LicenseProvider` previene el bloqueo inmediato, pero no resuelve la persistencia.
- Fix esperado: tras el OAuth callback exitoso, llamar `supabase.auth.setSession({access_token, refresh_token})` en el WebView para persistir la sesion en localStorage del WebView2. Requiere que el callback HTTP envie tambien el `refresh_token` (no solo `access_token`). El callback actual aun no entrega `refresh_token`; sin ese campo, `setSession` no funciona correctamente y no se puede cerrar este TD.
- Riesgo si se ignora: el usuario debe reautenticarse con Google en cada reinicio de la app. No bloquea el uso, pero es friccion UX.
- Decision 2026-07-01: no mezclar con HUB-05/UI. Se ejecutara como `AUTH-03` despues del pase visual/tokens del Hub, para no cruzar cambios de auth con rework visual.
- Razon de severidad: no bloquea `v0.1.0.2` porque el login funciona durante la sesion actual. Sube a P2 si se decide exigir persistencia de sesion para testers antes de la siguiente publicacion.
- Cierre: AUTH-03 implementado. Callback HTTP extrae `access_token` + `refresh_token` del fragment de Supabase. Backend reenvia ambos a `license:validate` y emite `auth:session`. Frontend llama `supabase.auth.setSession()` para persistir en localStorage del WebView2. `LicenseProvider` en mount llama `getSession()` y si hay sesion persistida, la pasa a `license:validate` para validacion automatica sin re-login. Tests: 849/849 PASS, tsc/build/lint OK.

### TD-045 - Test gaps en UnconfiguredScreen, LicenseGate unconfigured y anti-regresion

- Severidad: P3
- Area: frontend/testing
- Origen: review P0 Fix A+B+C (2026-06-29)
- Estado: abierto
- Release objetivo: R04 o auditoria global
- Motivo para diferir: los tests existentes cubren el flujo observable primario (classifyStatus, buildSummary, LicenseBridge no refresh). Los gaps son: sin test de renderizado de `UnconfiguredScreen`, sin caso en `HubApp.test.tsx` para `unconfigured` → `UnconfiguredScreen`, sin test unitario del guard anti-regresion en `LicenseProvider`. El guard es una defensa belt-and-suspenders simple (un condicional en `setResult`); el fix principal es `LicenseBridge` no llamando `refresh()`.
- Fix esperado: añadir test de renderizado de `UnconfiguredScreen`, caso en `HubApp.test.tsx` con estado `unconfigured`, y test del guard en `license.test.tsx` simulando eventos Wails.
- Riesgo si se ignora: regresion futura en el guard anti-regresion o en la pantalla `UnconfiguredScreen` no detectada automaticamente.

### TD-046 - OnboardingFlow.AuthStage no maneja unconfigured

- Severidad: P3
- Area: frontend/onboarding
- Origen: review P0 Fix A+B+C (2026-06-29)
- Estado: abierto
- Release objetivo: R04 o auditoria global
- Motivo para diferir: `OnboardingFlow` es un flujo secundario (no es el camino principal de la app; el primary flow es `HubApp.tsx` → `LicenseGate`). En `AuthStage`, el estado `unconfigured` cae a `return null`, dejando la pantalla en blanco en vez de mostrar `UnconfiguredScreen`.
- Fix esperado: añadir `if (result.state === "unconfigured") return <UnconfiguredScreen />` en `AuthStage` y en el check de `OnboardingSteps` (que actualmente lista `active/grace/authenticated-no-entitlement` para skip).
- Riesgo si se ignora: si se usa `OnboardingFlow` en un build sin config Supabase, el usuario ve pantalla en blanco en vez de mensaje accionable.

### TD-047 - Dashboard no puede consultar estado inicial del overlay activo

- Severidad: P3
- Area: frontend/hub
- Origen: HUB-02 ActiveOverlayCard review (2026-06-30)
- Estado: abierto
- Release objetivo: `0.1.x` cleanup o auditoria global post-beta
- Motivo para diferir: `ActiveOverlayCard` escucha `overlay:status`, pero no existe un evento/query tipo `overlay:status:get` para pedir el estado actual al montar. Si el card se monta despues de que el backend ya emitio el ultimo `overlay:status`, puede mostrar "Abrir overlay" aunque el overlay ya este abierto hasta que llegue otro cambio de estado. No bloquea porque `overlay:start-active` ya tiene defensas backend y el flujo principal sigue funcionando.
- Fix esperado: anadir un handler Go `overlay:status:get` que emita el estado actual del `OverlayController`/perfil activo, o hacer que `HubService` exponga una consulta idempotente de estado. `ActiveOverlayCard` deberia emitir esa query al montar y cubrirlo con test.
- Riesgo si se ignora: estado visual inicial potencialmente desincronizado en el Dashboard, especialmente si el usuario vuelve al Hub tras abrir/cerrar overlays desde otra pantalla.

### TD-048 - Legacy betaWelcomeCompleted sin betaUserRole no reabre modal

- Severidad: P3
- Area: frontend/onboarding
- Origen: HUB-04 role-aware BetaWelcome (2026-06-30)
- Estado: abierto
- Release objetivo: `0.1.x cleanup` o auditoria global
- Motivo para diferir: builds previos a HUB-04 persistieron `betaWelcomeCompleted: true` sin `betaUserRole`. El modal actual no se reabre en ese caso porque `showBetaWelcome` solo evalua `betaWelcomeCompleted`. El P3 documentado asume que es un estado heredado marginal y el impacto es que el usuario no ve el nuevo selector de rol, pero puede usar la app normalmente.
- Fix esperado: si `betaWelcomeCompleted === true` y falta `betaUserRole`, reabrir BetaWelcome una vez para capturar el rol, o aplicar migración explícita de settings para asignar un rol por defecto (p.ej. `intermediate`) a esos usuarios legacy.
- Riesgo si se ignora: usuarios que completaron BetaWelcome antes de HUB-04 nunca ven el selector de rol ni el copy adaptado. No bloquea el uso de la app.

### TD-009 - Inicio de sesión con Google OAuth bloqueado en WebView2

- Severidad: P1
- Area: frontend/licensing/auth
- Origen: review manual visual Login/Auth v0.1.0.1
- Estado: cerrado (v0.1.0.2)
- Release objetivo: R03.X / R04 (hotfix v0.1.0.2 necesario)
- Motivo para diferir: Ninguno para beta pública, ya que bloquea el login con Google OAuth (obligatorio) debido a que Google bloquea la autenticación OAuth dentro de WebViews integrados y la app no abre el navegador externo para completarlo.
- Fix esperado: Modificar `signInWithOAuth` en frontend para abrir la URL de autorización de Supabase en el navegador externo del sistema (mediante Wails `Browser.OpenURL`) e implementar Deep Linking en el backend de Go para redirigir la sesión de vuelta a la aplicación.
- Riesgo si se ignora: Cualquier usuario final de la beta pública que intente registrarse o loguearse con Google quedará permanentemente bloqueado en una pantalla blanca.
- Cierre: OAuth externo con navegador del sistema + callback/local flow implementado y verificado en v0.1.0.2. Google login funcional en builds empaquetadas.

### TD-002 - Verificacion de checksums sidecar

- Severidad: P3
- Area: release
- Origen: review R03.B/R03.C
- Estado: abierto
- Release objetivo: R03.D/R03.E o antes de release publico
- Motivo para diferir: el pipeline canonico recalcula los checksums en cada `release:artifacts`; no bloquea beta privada.
- Fix esperado: anadir tarea `release:checksums:verify` que lea los `.sha256` y compare contra los artefactos actuales.
- Riesgo si se ignora: flujos manuales parciales podrian dejar checksums stale sin aviso.

### TD-003 - GitHub Release idempotente

- Severidad: P3
- Area: ci/release
- Origen: review R03.C
- Estado: cerrado (R03.H)
- Release objetivo: R03.H (cumplido)
- Motivo para diferir: un re-run sobre una release ya creada falla de forma visible, no corrompe artefactos.
- Fix aplicado: `release.yml` ahora detecta la existencia con `gh release view <tag>`. Si la release existe, hace `gh release edit --title --notes-file` + `gh release upload --clobber` por cada uno de los 6 assets. Si no existe, `gh release create` con los 6 assets enumerados. Re-runs sobre un tag ya publicado pasan a verde sin intervencion manual. Aviso: si el upload con `--clobber` falla, los assets originales se pierden (documentado en el workflow).
- Cierre: 2026-06-28, commit pendiente del worker R03.H.

### TD-004 - Publicacion explicita de assets de release

- Severidad: P3
- Area: ci/release
- Origen: review R03.C
- Estado: cerrado (R03.H)
- Release objetivo: R03.H (cumplido)
- Motivo para diferir: el artifact actual contiene exactamente los 6 archivos oficiales.
- Fix aplicado: `release.yml` ahora enumera explicitamente los 6 assets oficiales (3 artefactos + 3 checksums) tanto en `gh release create` como en `gh release upload --clobber`. No se usa glob amplio (`bin/*`). Verificacion previa falla rapido con `::error::` si falta alguno.
- Cierre: 2026-06-28, commit pendiente del worker R03.H.

### TD-005 - Verificacion estricta de version NSIS en CI

- Severidad: P3
- Area: ci/release
- Origen: review R03.C
- Estado: abierto
- Release objetivo: R03.E o antes de release publico
- Motivo para diferir: Chocolatey instala version pinned y el wrapper localiza `makensis`; riesgo bajo.
- Fix esperado: ejecutar `makensis /VERSION` y fallar si no coincide con la version esperada.
- Riesgo si se ignora: drift de version en `windows-latest` podria cambiar salida del instalador.

### TD-006 - Re-renderizado completo de React a 30Hz desde raiz (PERF-H1)

- Severidad: P2
- Area: frontend/performance
- Origen: auditoria `docs/overlay-performance-audit.md`
- Estado: abierto
- Release objetivo: R04 o pre-release polish
- Motivo para diferir: la app funciona porque los widgets usan `useRef` + escritura directa DOM; el impacto es CPU de reconciliacion, no funcional. No bloquea beta.
- Fix esperado: desacoplar la suscripcion rapida de telemetria de React; usar hook que escuche solo cambios de visibilidad discretos en vez de re-renderizar desde `ObsOverlayApp`/`CompositeApp` en cada tick.
- Riesgo si se ignora: sobrecarga de CPU en escenas con muchos widgets activos simultaneamente.

### TD-007 - Normalizacion de variantes en cada render/tick (PERF-H2)

- Severidad: P2
- Area: frontend/performance
- Origen: auditoria `docs/overlay-performance-audit.md` + current-plan hallazgos P3 #2
- Estado: abierto
- Release objetivo: R04 o pre-release polish
- Motivo para diferir: el impacto es GC pressure por objetos temporales; no bloquea funcionalidad ni beta.
- Fix esperado: pre-calcular y memoizar variantes enriquecidas al cargar/guardar el perfil, no en cada render de `ObsOverlayApp`/`CompositeApp`.
- Riesgo si se ignora: saturacion del GC con perfiles de muchos widgets, especialmente en OBS (rendimiento reducido).

### TD-008 - Harness visual/browser con Playwright ausente

- Severidad: P3
- Area: frontend/testing
- Origen: current-plan hallazgos P3 #4 + widget-preview-bug-log.md
- Estado: abierto
- Release objetivo: R04 o primera auditoria global (post-R03)
- Motivo para diferir: JSDOM cubre logica, no layout visual real. No bloquea desarrollo actual.
- Fix esperado: crear suite de tests visuales con Playwright que detecte regresiones de centrado, clipping y cajas invisibles en previews.
- Riesgo si se ignora: regresiones visuales de preview solo detectables mediante verificacion manual prolongada.

### TD-049 - `mockSessionScenario` propagado a widgets no-standings

- Severidad: P3
- Area: frontend/widgets
- Origen: current-plan hallazgos P3 #7
- Estado: abierto
- Release objetivo: R03/R04
- Motivo para diferir: sin impacto funcional; solo `Standings` consume el escenario.
- Fix esperado: acotar `mockSessionScenario` al widget que lo necesita en lugar de propagarlo a todos.
- Riesgo si se ignora: confusion en futuros widgets que podrian depender erroneamente de este contexto compartido.

### TD-010 - Multiples bucles rAF concurrentes sin centralizar (PERF-H3)

- Severidad: P3
- Area: frontend/performance
- Origen: auditoria `docs/overlay-performance-audit.md`
- Estado: abierto
- Release objetivo: R04
- Motivo para diferir: cada widget gestiona su propio rAF con cancelacion correcta; funcionalmente correcto.
- Fix esperado: centralizar bucles de dibujado en un unico rAF global compartido por layout (Unified Paint Loop).
- Riesgo si se ignora: desalineacion de fotogramas entre widgets y mayor numero de contextos rAF del necesario.

### TD-011 - Test de regresion Ctrl+S con autosave:false ausente

- Severidad: P3
- Area: frontend/testing
- Origen: current-plan hallazgos P3 #8 (S4.6)
- Estado: abierto
- Release objetivo: post-release / auditoria global
- Motivo para diferir: el handler no cambio y GLM no lo considera bloqueante.
- Fix esperado: anadir test que verifique que Ctrl+S no persiste cuando `autosave:false`.
- Riesgo si se ignora: una regresion futura en el shortcut podria persistir cambios no deseados sin cobertura de test.

### TD-012 - Selector mock usa clase CSS en vez de aria-pressed

- Severidad: P3
- Area: frontend/testing
- Origen: current-plan hallazgos P3 #5 (S4.5)
- Estado: abierto
- Release objetivo: R03/R04
- Motivo para diferir: el selector funciona correctamente; el test pasa. Mejora de robustez de testing.
- Fix esperado: cambiar test de `className` a `aria-pressed` para alinearse con el enfoque accesible del rework UI/S5.
- Riesgo si se ignora: tests fragiles ante cambios de estilos CSS.

### TD-013 - `columns: []` se normaliza a defaults ambiguo

- Severidad: P3
- Area: frontend/schema
- Origen: current-plan hallazgos P3 #1
- Estado: abierto
- Release objetivo: post-release / schema v3
- Motivo para diferir: funciona porque el codigo trata `[]` como "usar defaults". Sin quejas funcionales.
- Fix esperado: definir comportamiento explicito para array vacio (p.ej. error de schema o default explicto) en lugar de normalizacion silenciosa.
- Riesgo si se ignora: ambiguedad para futuros cortes de schema o migraciones.

### TD-014 - `version:sync` dirty detection ausente

- Severidad: P3
- Area: release
- Origen: R03.B completado, current-plan linea 75
- Estado: abierto
- Release objetivo: R03.D/E
- Motivo para diferir: ejecutar `version:sync` sobre un working tree sucio podria sobrescribir cambios no commiteados.
- Fix esperado: anadir precondicion en `version:sync` que detecte cambios sin commit y advierta/falle antes de sincronizar.
- Riesgo si se ignora: un developer podria perder cambios locales al ejecutar `release:artifacts` sin commitear primero.

### TD-015 - Auth/licencias requieren review de seguridad real

- Severidad: P2
- Area: security/auth
- Origen: `docs/release-documentation-audit-2026-06-26.md`
- Estado: abierto
- Release objetivo: R02 final o R14/R15 antes de release publico
- Motivo para diferir: el flujo basico funciona con Supabase; la beta privada no expone datos sensibles reales.
- Fix esperado: ejecutar threat model, validacion de webhooks Stripe idempotentes, device binding y reset flow, storage de tokens, revocation y grace period, logs sin secretos/PII, tests de concurrencia y reintentos.
- Riesgo si se ignora: brecha de seguridad, perdida de licencias, tokens expuestos o device binding vulnerable en produccion.

### TD-016 - Densidad visual con bestLap/lastLap en widgets pequenos

- Severidad: P3
- Area: frontend/ux
- Origen: current-plan hallazgos P3 #3
- Estado: abierto
- Release objetivo: post-release / auditoria global
- Motivo para diferir: parcialmente mitigado con ancho intrinseco y recorte de nombre explicito.
- Fix esperado: definir comportamiento de overflow o escalado cuando columnas opcionales no caben en el widget.
- Riesgo si se ignora: widgets visualmente apretados si el usuario activa todas las columnas en espacio reducido.

### TD-017 - Selector mock usa paleta neutral en vez de UI consistente

- Severidad: P3
- Area: frontend/ux
- Origen: current-plan hallazgos P3 #6 (S4.5)
- Estado: abierto
- Release objetivo: R03/R04
- Motivo para diferir: el rework UI/S5 aplicara la paleta consistente; hasta entonces es funcional.
- Fix esperado: alinear el selector mock con la paleta del rework UI (estilo oscuro/denso del `WidgetStudio`).
- Riesgo si se ignora: incoherencia visual temporal entre el selector mock y el resto de la UI.

### TD-018 - Smoke test end-to-end del updater

- Severidad: P3
- Area: updater/testing
- Origen: cierre R03.D
- Estado: abierto
- Release objetivo: antes de declarar Release 03 completo
- Motivo para diferir: requiere un tag pre-release real o un mock de servidor de release; no bloquea el cierre del runtime.
- Fix esperado: validar descarga e instalacion (o intento de instalacion controlado) desde una Release real o un servidor de staging.
- Riesgo si se ignora: un bug de integracion real entre el updater y GitHub Releases solo se detectaria en produccion.

### TD-019 - Validacion con `go test -race` del lifecycle del updater

- Severidad: P3
- Area: updater/testing
- Origen: cierre R03.D
- Estado: abierto
- Release objetivo: R03.D/E o auditoria global
- Motivo para diferir: el entorno Windows actual no tiene CGO habilitado (`-race` requiere `CGO_ENABLED=1`).
- Fix esperado: ejecutar `go test -race ./internal/updater/... ./internal/app/...` en un entorno con CGO (Linux/macOS o Windows con toolchain adecuada).
- Riesgo si se ignora: posibles condiciones de carrera no detectadas en la goroutine de startup y el service.

### TD-020 - UX de update fragmentada

- Severidad: P2
- Area: frontend/ux
- Origen: review R03.D (fuera de alcance R03.D-updater)
- Estado: abierto
- Release objetivo: R03.F
- Motivo para diferir: requiere unificar el flujo de `UpdateBanner` y `SettingsPage`; no se toco frontend en esta tarea.
- Fix esperado: decidir un unico camino de update (instalacion verificada in-app) y actualizar `UpdateBanner` para usarlo.
- Riesgo si se ignora: usuarios confundidos por dos caminos para actualizar.

### TD-021 - Sin consumo de portable zip desde el updater

- Severidad: P2
- Area: updater/ux
- Origen: review R03.D (fuera de alcance R03.D-updater)
- Estado: abierto
- Release objetivo: R03.E/F
- Motivo para diferir: requiere decision de UX sobre selector de artifact; no bloquea el flujo de installer verificado.
- Fix esperado: anadir selector de artifact (installer vs portable zip) o descarga directa del portable zip en `SettingsPage`.
- Riesgo si se ignora: usuarios que prefieren portable no pueden actualizar desde la app.

### TD-022 - `UpdateBanner` no muestra release notes

- Severidad: P3
- Area: frontend/ux
- Origen: review R03.D (fuera de alcance R03.D-updater)
- Estado: abierto
- Release objetivo: R03.F
- Motivo para diferir: mejora de UX no bloqueante; se abordara si se unifica la UI de update.
- Fix esperado: mostrar un resumen del cuerpo del release en el banner o en un modal.
- Riesgo si se ignora: menor contexto para el usuario al decidir actualizar.

### TD-023 - `Info.IsDowngrade` duplica logica de UI

- Severidad: P3
- Area: frontend/go
- Origen: review R03.D (fuera de alcance R03.D-updater)
- Estado: abierto
- Release objetivo: R03.F o auditoria global
- Motivo para diferir: duplicacion leve de logica; no impacta funcionalidad.
- Fix esperado: usar unica fuente de verdad para el flag de downgrade (backend o frontend, no ambos).
- Riesgo si se ignora: inconsistencia menor si la logica diverge en el futuro.

### TD-024 - Validacion real de workflows Discord en GitHub Actions

- Severidad: P3
- Area: ci/discord
- Origen: cierre R03.E
- Estado: abierto
- Release objetivo: antes de declarar Release 03 completo
- Motivo para diferir: el entorno local no permite ejecutar workflows reales de GitHub Actions ni enviar webhooks reales a Discord.
- Fix esperado: ejecutar `discord-release.yml`, `discord-build-available.yml` (con `release_tag`), `discord-beta-progress.yml` y `discord-known-issues.yml` en GitHub Actions con webhooks de Discord configurados; verificar que no haya duplicados y que 403/429 se manejen correctamente.
- Riesgo si se ignora: un error en la logica de envio o extraccion de assets solo se detectaria en produccion.

### TD-025 - Dependencia de `gh` CLI en `discord-build-available.yml`

- Severidad: P3
- Area: ci/discord
- Origen: cierre R03.E
- Estado: abierto
- Release objetivo: R03.E o R03.F
- Motivo para diferir: `gh` viene pre-instalado en `ubuntu-latest` y el fallback manual (`download_url` + `sha256`) sigue funcionando si `gh` falla.
- Fix esperado: opcionalmente reemplazar `gh release view` por llamadas directas a la API REST de GitHub con `curl` + `GITHUB_TOKEN` para reducir dependencias.
- Riesgo si se ignora: si `gh` deja de estar disponible o cambia su salida JSON, el modo automatico de `release_tag` fallara.

### TD-026 - Idempotencia de Discord no cubre dispatch repetido desde cero

- Severidad: P3
- Area: ci/discord
- Origen: cierre R03.E
- Estado: abierto
- Release objetivo: post-release / auditoria global
- Motivo para diferir: la idempotencia actual usa `github.run_attempt`, que solo cubre re-runs del mismo workflow run. No evita que un operador dispare el mismo workflow dos veces con los mismos inputs.
- Fix esperado: anadir un mecanismo de deduplicacion basado en contenido (p. ej. buscar el mensaje reciente via Discord bot API o guardar un marker file/hash).
- Riesgo si se ignora: mensajes duplicados si un operador dispara manualmente varias veces seguidas.

### TD-027 - Firma de codigo (Authenticode/certificado) ausente

- Severidad: P2
- Area: release/security
- Origen: smoke R03.G + cierre R03.H
- Estado: abierto
- Release objetivo: obligatorio antes de release publico (R15 RC o equivalente); NO bloquea beta privada
- Motivo para diferir: la beta privada distribuye binarios sin firmar y los testers ya estan informados del aviso de Windows SmartScreen. Es un trade-off explicito y aceptado para acelerar feedback de testers.
- Fix esperado:
  1. Adquirir un certificado de firma de codigo (Authenticode) valido para Vantare (EV o standard code signing segun presupuesto y requisitos de SmartScreen reputation).
  2. Provisionar el certificado y su contrasena como secretos en GitHub Actions (no commitear nada).
  3. Integrar el paso de firma en `release.yml` despues de `wails3 task release:artifacts` y antes de `gh release upload`, tanto para `vantare.exe` como para `vantare-amd64-installer.exe` (instalador NSIS tambien debe estar firmado para SmartScreen).
  4. Documentar en `docs/release-beta-operations-runbook.md` la politica de firma y renovacion del certificado.
  5. Verificar manualmente que el binario firmado pasa el chequeo de SmartScreen sin el aviso de "App desconocida".
- Riesgo si se ignora en beta privada: los testers ven el aviso habitual de SmartScreen ("More info" -> "Run anyway"). Aceptado.
- Riesgo si se ignora en release publico: distribucion hostil (los usuarios finales no pueden ejecutar el binario sin pasos manuales), reputacion de SmartScreen dañada, posible bloqueo por antivirus.

### TD-028 - Releases historicas sin `.sha256` no compatibles con InstallVerified

- Severidad: P3
- Area: updater/release
- Origen: smoke R03.G
- Estado: abierto
- Release objetivo: post-release / auditoria global
- Motivo para diferir: las GitHub Releases publicadas antes de R03.B no incluyen el sidecar `*.sha256`. El updater detecta el checksum ausente y cae al flujo de descarga sin verificacion, que es degradacion aceptable para los tags legacy pero debe documentarse.
- Fix esperado:
  1. Confirmar la lista exacta de tags historicos sin `.sha256` (etiquetas publicadas antes de la disponibilidad del pipeline `release:artifacts`).
  2. Definir politica: o se re-publican retroactivamente con sus checksums (manualmente), o se documenta explicitamente en `discord-build-available.yml` y en el runbook que esos tags no son actualizables con verificacion.
  3. Considerar un fallback en `UpdaterService.InstallVerifiedCtx` que muestre un aviso claro al usuario cuando el checksum falta en la release.
- Riesgo si se ignora: testers que vengan de una release historica pueden actualizar a una moderna sin verificacion, abriendo la puerta a un MITM contra el endpoint de releases si el canal se ve comprometido (baja probabilidad porque GitHub Releases va sobre HTTPS, pero el control de integridad se pierde).

### TD-001 - Gate de tests en workflow de release

- Cerrado: 2026-06-27
- Cierre: corregido en R03.C antes del commit.

### TD-029 - Goroutines de install sin cancelacion de contexto (P1 review beta)

- Severidad: P1
- Area: updater/go
- Origen: review adversarial global "Beta Open Readiness" (2026-06-28)
- Estado: cerrado (beta stabilization 2026-06-28)
- Release objetivo: beta `v0.3.10.0`
- Motivo para diferir: handlers `updater:install` y `updater:install:verified` lanzaban `go func()` con `context.Background()` implicito; la app podia cerrarse durante una descarga dejando la goroutine viva y escribiendo en un emisor Wails ya cerrado.
- Fix aplicado:
  - Nuevo `UpdaterService.InstallVerifiedVersionCtx(ctx, release)` en `internal/app/updater_service.go` que reenvia el contexto a `updater.InstallVerifiedCtx`.
  - El handler `updater:install:verified` en `cmd/vantare/main.go` propaga el `ctx` de `signal.NotifyContext` y comprueba `ctx.Err()` antes de emitir el error.
  - Test de regresion `TestUpdaterServiceInstallVerifiedVersionCtxRespectsCancellation` cubre la cancelacion.
- Cierre: 2026-06-28, sin commit todavia (bloque beta stabilization).

### TD-030 - Handler legacy `updater:install` sin checksum accesible desde UI (P2 review beta)

- Severidad: P2
- Area: updater/security
- Origen: review adversarial global "Beta Open Readiness" (2026-06-28)
- Estado: cerrado (beta stabilization 2026-06-28)
- Release objetivo: beta `v0.3.10.0`
- Motivo para diferir: el handler Wails `updater:install` ejecutaba `Updater.Install` (legacy) sin verificar SHA256. El frontend nunca emite ese evento (tests `UpdateBanner.test.tsx` y `SettingsPage.test.tsx` lo verifican), pero quedaba accesible.
- Fix aplicado:
  - `cmd/vantare/main.go`: handler `updater:install` reemplazado por rechazo explicito (`emitUpdaterError("legacy updater:install is disabled; use updater:install:verified")`).
  - `internal/app/updater_service.go`: metodos `InstallVersion` y `InstallVersionCtx` eliminados; ya no existe camino de instalacion sin verificacion desde el servicio Wails registrado.
  - Solo el camino verificado (`updater:install:verified` -> `InstallVerifiedVersionCtx` -> `updater.InstallVerifiedCtx`) puede iniciar un instalador.
- Cierre: 2026-06-28, sin commit todavia (bloque beta stabilization).

### TD-031 - Trabajo Remotion mezclado en working tree de beta

- Severidad: P0 (rompia build)
- Area: frontend/build
- Origen: review adversarial global "Beta Open Readiness" (2026-06-28)
- Estado: cerrado (beta stabilization 2026-06-28)
- Release objetivo: beta `v0.3.10.0`
- Motivo para diferir: el usuario mantiene un proyecto paralelo Remotion dentro del mismo worktree; los archivos (`frontend/src/remotion/`, `frontend/remotion.config.ts`, scripts en `frontend/package.json`, deps en `pnpm-lock.yaml`) no forman parte de Vantare y provocaban 3 errores `TS6133` en `tsc -b`, rompiendo `pnpm build`, `wails3 task release:artifacts` y CI.
- Fix aplicado:
  - Stash con mensaje `pre-beta-remotion-work` (tracked + untracked) capturado en `git stash list` como `stash@{0}`. Contiene los 13 archivos de Remotion y los ~1900 lineas netas de `pnpm-lock.yaml`.
  - No se commitea nada de Remotion en esta tanda.
  - Para restaurar el trabajo Remotion del usuario: `git stash apply 'stash@{0}'`.
- Cierre: 2026-06-28, sin commit todavia (bloque beta stabilization).

### TD-032 - Overlay edit mode: rollback si ApplyProfileMode falla

- Severidad: P3
- Area: overlay/go
- Origen: review final overlay edit mode in-place (2026-06-28)
- Estado: abierto
- Release objetivo: auditoria global post-HUB1 / R04
- Motivo para diferir: el flujo normal no deberia fallar porque `wailsOverlayWindow.ApplyProfileMode` solo falla con `mgr == nil` o `profile == nil`; el caso queda cubierto por tests como no-emision de `overlay:edit-mode-changed`.
- Fix esperado: si `applyDisplayModeToWindow` falla despues de `SetDisplayMode(ModeEdit)`, restaurar el modo previo en memoria o mover la mutacion de `DisplayMode` despues de aplicar correctamente el modo a la ventana.
- Riesgo si se ignora: inconsistencia temporal entre profile en `ModeEdit` y ventana aun en passthrough/racing si aparece un error inesperado al aplicar el modo.

### TD-033 - Overlay edit mode: aplicar modo a ventana bajo lock del controller

- Severidad: P3
- Area: overlay/go/concurrency
- Origen: review final overlay edit mode in-place (2026-06-28)
- Estado: abierto
- Release objetivo: auditoria global post-HUB1 / R04
- Motivo para diferir: el riesgo es un TOCTOU menor entre `CurrentWindow()` y `ApplyProfileMode`; no se ha observado en flujo normal y resolverlo ahora implicaba refactorizar `OverlayController`.
- Fix esperado: anadir un metodo tipo `ApplyModeToCurrentWindow(profile)` en `OverlayController` que obtenga la ventana y aplique el modo bajo una seccion critica controlada, evitando referencias stale tras `Stop()`.
- Riesgo si se ignora: un cierre concurrente podria invalidar la ventana entre la consulta y la aplicacion de modo, produciendo errores no deterministas o logs espurios.

### TD-034 - Overlay edit mode: test directo del handler inline `overlay:start`

- Severidad: P3
- Area: overlay/testing
- Origen: review final overlay edit mode in-place (2026-06-28)
- Estado: abierto
- Release objetivo: auditoria global post-HUB1 / R04
- Motivo para diferir: el handler esta registrado inline en `main.go`; la logica paralela de error en `handleToggleEditMode` si esta cubierta por tests.
- Fix esperado: extraer la logica de `overlay:start` a un helper testeable o anadir un harness que pueda invocar el handler y verificar que errores de `StartOverlay` sincronizan `overlayRunning=false`.
- Riesgo si se ignora: futuras modificaciones del handler podrian reintroducir `overlayRunning=true` sin ventana y no quedar cubiertas por tests unitarios.

### TD-035 - Overlay edit mode: resize libre no conserva ratio en Relative/Standings + deformación al entrar en edit mode

- Severidad: P3 → P0 (corregido en beta stabilization 2026-06-28)
- Area: overlay/frontend/ux
- Origen: review overlay edit mode in-place (2026-06-28)
- Estado: cerrado
- Release objetivo: R04 → resuelto en beta stabilization
- Motivo para diferir: corregido con fix en WidgetEditFrame.
- Fix aplicado (2 partes):
  1. **Deformación al entrar en edit mode**: WidgetEditFrame usaba `widget.position` raw sin normalizar, mientras WidgetHost (racing) normaliza con `normalizeWidgetVisualRect` y escala con `transform: scale()`. Fix: añadir `normalizeWidgetVisualRect` + `scale` como WidgetHost para que la apariencia visual sea idéntica entre modos.
  2. **Resize sin ratio lock**: `handleResizeStart` modificaba w/h libremente. Fix: usar `resizeWithRatio` con `baseAspect` calculado desde `getWidgetBaseSize`, misma lógica que `PreviewWidgetFrame`.
- Tests: regresión para relative/standings (ratio preservado), delta (ratio fijo), drag, render.
- Cierre: 2026-06-28

### TD-036 - Overlay edit mode: widgets no incluidos en shared-widget-map

- Severidad: P3
- Area: overlay/frontend/widgets
- Origen: review overlay edit mode in-place (2026-06-28)
- Estado: abierto
- Release objetivo: R04 o auditoria global
- Motivo para diferir: no rompe la app; el caso mas relevante es `engineer-notifications`, que puede aparecer como frame editable vacio en edit mode.
- Fix esperado: unificar el mapa de componentes usado por `CompositeApp`, `WidgetEditFrame` y `WidgetRenderer`, o anadir `engineer-notifications` a `shared-widget-map` con transporte desactivado/seguro para edit mode.
- Riesgo si se ignora: algunos widgets se pueden mover/redimensionar como caja, pero no se renderizan visualmente dentro del chrome de edicion.

### TD-037 - `applyShrinkWrap` queda sin consumidor productivo tras fullscreen racing/edit

- Severidad: P3
- Area: overlay/window
- Origen: review final fix fullscreen desktop overlay (2026-06-28)
- Estado: abierto
- Release objetivo: auditoria global post-stream / R04
- Motivo para diferir: el fix correcto para el stream fue mantener `ModeRacing` y `ModeEdit` fullscreen. Tras ese cambio, `internal/window/manager.go` conserva `applyShrinkWrap`, pero el review no detecto ningun camino productivo que lo invoque.
- Fix esperado: decidir si `applyShrinkWrap` sigue siendo utilidad real para algun modo futuro/shrink-wrap desktop y documentarlo en el codigo, o eliminarlo junto con tests muertos si ya no tiene consumidor.
- Riesgo si se ignora: confusion futura; un worker podria reutilizar `applyShrinkWrap` en racing/edit y reintroducir el bug de caja parcial.

### TD-038 - Plan historico de overlay edit mode menciona racing shrink-wrap

- Severidad: P3
- Area: docs/plans
- Origen: review final fix fullscreen desktop overlay (2026-06-28)
- Estado: abierto
- Release objetivo: auditoria documental post-stream
- Motivo para diferir: `docs/superpowers/plans/2026-06-28-overlay-in-place-edit-mode-hotkey.md` es un plan historico, no el contrato vivo. El contrato vivo ya esta corregido en `docs/widget-rendering-preview-contract.md` y `docs/widget-preview-bug-log.md`.
- Fix esperado: anadir una nota de superseded/correccion en el plan historico indicando que `ModeRacing` ya no usa shrink-wrap y debe devolver origen cero en desktop Wails.
- Riesgo si se ignora: un worker que lea solo el plan historico puede aplicar la decision antigua y reintroducir la regresion.

### TD-039 - `WindowLocalPos` sin consumidor productivo claro

- Severidad: P3
- Area: overlay/window
- Origen: review final fix fullscreen desktop overlay (2026-06-28)
- Estado: abierto
- Release objetivo: auditoria global post-stream / R04
- Motivo para diferir: el helper es inofensivo y ahora delega en `LayoutOrigin`, que devuelve origen cero para racing/edit. No bloquea el stream ni el fix fullscreen.
- Fix esperado: buscar consumidores reales; si no existen, eliminarlo. Si se mantiene para un futuro modo shrink-wrap, documentar el contrato y anadir test que diferencie fullscreen vs shrink-wrap.
- Riesgo si se ignora: superficie de API interna confusa y propensa a maluso en futuros cambios de coordenadas.

### TD-040 - Test de perfil activo con nombre contrario al contrato real

- Severidad: P3
- Area: app/testing
- Origen: review perfil activo de overlay (2026-06-28)
- Estado: abierto
- Release objetivo: cleanup beta / R04
- Motivo para diferir: no bloquea el flujo real; `cmd/vantare/main.go` detiene el overlay antes de activar otro perfil. El problema esta en el test `TestHubServiceSetActiveProfileStopsRunningOverlay`, cuyo nombre sugiere que `HubService.SetActiveProfile` detiene el overlay, pero el test y el servicio no hacen eso.
- Fix esperado: renombrar el test para reflejar que `SetActiveProfile` solo carga/persiste el perfil, y anadir/extraer un test del handler `hub:set-active` si se quiere cubrir explicitamente el stop del runtime.
- Riesgo si se ignora: futuros workers pueden creer que el stop vive en `HubService` y duplicar o romper responsabilidades.

### TD-041 - `settings:save` puede limpiar `activeOverlayProfileId` si recibe settings legacy incompletos

- Severidad: P3
- Area: app/settings
- Origen: review perfil activo de overlay (2026-06-28)
- Estado: abierto
- Release objetivo: cleanup beta / R04
- Motivo para diferir: el flujo actual de `SettingsPage` hace `settings:get` antes de permitir guardados normales, por lo que conserva `activeOverlayProfileId`. El riesgo queda limitado a pantallas legacy o eventos manuales que envien un objeto settings incompleto.
- Fix esperado: hacer que `SettingsService.Save` preserve `ActiveOverlayProfileID` cuando el payload no lo incluya explicitamente, o dividir los comandos de guardado por dominio (`settings:save-hotkeys`, `settings:save-delta`, etc.).
- Riesgo si se ignora: una pantalla antigua podria borrar el perfil activo y hacer que las hotkeys vuelvan al perfil cargado/fallback.

### TD-042 - Vitest imprime `ECONNREFUSED :3000` con exit code 0

- Severidad: P3
- Area: frontend/testing
- Origen: checks de perfil activo de overlay (2026-06-28)
- Estado: abierto
- Release objetivo: cleanup beta / R04
- Motivo para diferir: la suite pasa (`590/590`) y el proceso termina con exit code 0, pero los logs muestran varios `AggregateError ECONNREFUSED ::1/127.0.0.1:3000` despues del resumen.
- Fix esperado: localizar el test/componente que intenta conectar con `localhost:3000` sin mock adecuado y sustituirlo por mock del transporte/runtime.
- Riesgo si se ignora: ruido en CI y posibilidad de ocultar errores reales de red en futuras regresiones.
