# Plan de 2 Días — Lanzamiento Beta Free

Si se decide lanzar la beta free (`v0.1.0.x`), este es el plan acotado. Ordenado por prioridad. Cada ítem: archivo(s), severidad, y si es nuevo o ya documentado.

## Día 1 — Bloqueantes (P0 + P1 de código)

### 1. P0 — ENG-NOTIF-SSE (notificaciones Ingeniero no llegan)
- **Archivos:** `frontend/src/overlay/widgets/EngineerNotificationsWidget.tsx:77`, `frontend/src/overlay/ObsOverlayApp.tsx:155-159`, `frontend/src/overlay/CompositeApp.tsx:177`
- **Fix:** memoizar el `props` del widget (o extraer `__engineerTransport` a constante estable) y que el `useEffect` dependa solo de `transport` + `telemetryMode`, no del objeto `props` entero.
- **Test:** añadir test que verifique que el `EventSource` no se recrea en ticks sucesivos (spy `EventSource` o contador de conexiones).
- **Est:** NUEVO.

### 2. P1 — ONBOARD-UNCONFIGURED (pantalla blanca en onboarding)
- **Archivos:** `frontend/src/hub/onboarding/OnboardingFlow.tsx:116-122`
- **Fix:** añadir `if (result.state === "unconfigured") return <UnconfiguredScreen />;` y en `OnboardingSteps` incluir `unconfigured` en la lista de skip/redirect.
- **Est:** YA DOC (TD-046).

### 3. P1 — WIDGETSTUDIO-DESIGN-GATE (selector sin `canApply`)
- **Archivos:** `frontend/src/hub/overlays/WidgetStudio.tsx:112-133`, `widget-design-gallery.ts:525`
- **Fix:** en el `onChange` del `<select>`, comprobar `canApplyWidget(selectedWidget.type, access)` antes de `applyOfficialDesignToProfile`; si no aplica, no cambiar y mostrar aviso. O pasar el `canApply` al helper.
- **Test:** regresión — Free no puede aplicar diseño Pro desde el selector superior.
- **Est:** NUEVO.

### 4. P1 — HUB-NO-SECTION-GATE (secciones premium sin gate)
- **Archivos:** `frontend/src/hub/HubApp.tsx:200-218`
- **Fix:** envolver `{section === "engineer" ...}` / `{section === "telemetry" ...}` en `canUseFeature(access, "engineer")` / `"telemetry"` (o `AccessGate`). El Topbar ya oculta navegación; el render debe respetarlo.
- **Est:** NUEVO.

### 5. P1 — WIDGET-CAST-UNSAFE (cast `as OverlayStatus`)
- **Archivos:** `OverlaysStudioPage.tsx:72`, `ActiveOverlayCard.tsx:58`, `PreviewPage.tsx:95`
- **Fix:** validar la forma de `event.data` (guard `if (data && typeof data === "object" && "running" in data)`) antes de `setOverlayStatus`.
- **Est:** NUEVO.

### 6. P1 — SETTINGS-ACTIVEID-RACE (`settings:save` limpia activeOverlayProfileId)
- **Archivos:** `frontend/src/hub/pages/SettingsPage.tsx:252-268`, `internal/app/settings_service.go`
- **Fix (frontend):** `handleSave*` debe mergear sobre el último `appSettings` recibido del evento `settings` (no sobre `DEFAULT_APP_SETTINGS`). **Fix (Go):** `SettingsService.Save` debe preservar `ActiveOverlayProfileID` si el payload no lo incluye.
- **Est:** YA DOC (TD-041).

### 7. P1 — I18N-AUTH-GAP (login/paywall en español)
- **Archivos:** `LoginScreen.tsx`, `PaywallScreen.tsx`, `UnconfiguredScreen.tsx`
- **Fix:** migrar copy a `t()` usando los 4 diccionarios (es/en/pt/it). Es trabajo de I18N-03b.
- **Est:** YA DOC (I18N-03b). Si no da tiempo, al menos traducir LoginScreen (primera pantalla).

## Día 2 — Medianos de seguridad/local + verificación

### 8. P2 — SSE-NO-LIMIT (DoS local)
- **Archivos:** `internal/server/sse.go`, `engineer_sse.go`
- **Fix:** añadir un semáforo/contador de conexiones concurrentes (p.ej. `sync.Map` de clientes + cap N) y/o aplicar el `rateLimiter` existente también a SSE.
- **Est:** NUEVO.

### 9. P2 — SSE-NO-AUTH
- **Archivos:** `sse.go`, `engineer_sse.go`
- **Fix:** exigir un bearer token corto o nonce en la query del SSE cuando el bind no es loopback; para loopback, aceptar sin token pero documentar.
- **Est:** NUEVO. (Puede posponerse a post-beta si el bind por defecto es 127.0.0.1 y no se expone LAN.)

### 10. P2 — NONCE-PANIC
- **Archivos:** `internal/server/server.go:39-40`
- **Fix:** `Generate()` retorna `(string, error)` en vez de `panic`.
- **Est:** NUEVO.

### 11. P1 — HUB-PROFILE-RACE + SETTINGS-SAVE-BYPASS (concurrencia/validación)
- **Archivos:** `profile_service.go`, `hub_service.go`, `settings_service.go`, `launcher.go`
- **Fix:** añadir `sync.RWMutex` a `ProfileService`/`HubService`; validar `LauncherApps` en `SettingsService.Save` (reusar la validación de `launcher:configure`).
- **Est:** NUEVO. (Puede ser Día 2 si hay tiempo; si no, documentar como known issue de beta.)

### 12. Verificación final
- `go test ./...`, `go vet`, `pnpm --dir frontend test`, `pnpm --dir frontend build`, `pnpm --dir frontend lint`, `git diff --check`.
- Smoke manual con `bin/vantare.exe`: arranque, login Google OAuth → Hub Free, overlay live (telemetría + notificaciones Ingeniero tras fix #1), settings no limpia perfil activo.

## Fuera de alcance de los 2 días (deuda conocida)
- Pagos reales (migración SQL, checkout, deploy EF, registro) — ver `05-veredicto-y-monetizacion.md`.
- PERF-H1/H2 (re-render 30Hz, enrich por tick) — optimización de rendimiento, no bloquea beta free.
- Firma de código (TD-027) — para release estable v1.0.
- i18n completo de todas las pantallas (I18N-03) — progresivo por feature.
- P3 varios (TD-045/047/048/036/etc.) — cleanup post-beta.

## Checks de salida (definition of done)
- [ ] P0 (ENG-NOTIF-SSE) corregido y testeado.
- [ ] P1 de código (4,5,6,11,12,14) corregidos.
- [ ] `go test ./...` + `pnpm test` + `build` + `lint` en verde.
- [ ] Smoke manual: login → Hub Free → overlay live con notificaciones.
- [ ] Changelog/known issues actualizados (sin prometer pagos).
- [ ] Commit/push/tag `v0.1.0.3` (o el siguiente parche) según `versioning-and-release-gates.md`.
