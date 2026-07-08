# Hallazgos Bloqueantes (P0 / P1)

Todos verificados contra el código REAL. Se marcan como NUEVO (no en docs previos) o YA DOCUMENTADO (vigente en código).

---

## 🔴 P0 — Rendimiento / Bug funcional (runtime en vivo)

### ENG-NOTIF-SSE — Las notificaciones del Ingeniero NO llegan al overlay en vivo
- **Categoría:** PERF + BUG funcional
- **Archivos:** `frontend/src/overlay/widgets/EngineerNotificationsWidget.tsx:77`, `frontend/src/overlay/ObsOverlayApp.tsx:157`, `frontend/src/overlay/CompositeApp.tsx:177`
- **Evidencia:** `EngineerNotificationsWidget` tiene `useEffect(..., [telemetryMode, explicitTransport, props])`. El `props` se crea **inline en cada render de 30Hz**:
  ```tsx
  props={{ ...enrichWidgetPropsWithVariant(profile, w), __engineerTransport: "sse" }}
  ```
  Como la referencia de `props` cambia en cada tick, el `useEffect` se re-ejecuta 30 veces/seg, cerrando y reabriendo el `EventSource("/engineer/stream")` continuamente. El SSE nunca completa el handshake.
- **Impacto:** en OBS/overlay en vivo, las alertas del spotter (Ingeniero) **no se entregan**. La feature Ingeniero queda rota en runtime aunque su lógica de expiración sea correcta.
- **Severidad:** P0 para el runtime en vivo (bloquea la promesa "Ingeniero funciona en modo live" del changelog `v0.1.0.0`).
- **Estado:** NUEVO (no en `overlay-performance-audit.md` ni TD).
- **Fix sugerido:** extraer `__engineerTransport` a una constante estable (o memoizar `props` con `useMemo` por `widget.id`+`profile` estable), y que el `useEffect` dependa solo de `transport` y `telemetryMode`, no del objeto `props` entero.

### SSE-RENDER-30HZ — Re-render de React raíz a 30Hz satura reconciliación
- **Categoría:** PERF
- **Archivos:** `frontend/src/overlay/ObsOverlayApp.tsx`, `frontend/src/overlay/CompositeApp.tsx`
- **Evidencia:** en cada tick de telemetría se hace `applyTelemetryUpdate(...)` + `setTelemetryKey((k) => k + 1)`, lo que re-renderiza todo el árbol de widgets desde la raíz a 30Hz. Los widgets bypassean React en el pintado (usa `useRef` + `setHTMLIfChanged`), pero los hijos se evalúan como funciones en cada tick.
- **Impacto:** CPU de reconciliación innecesaria; empeora con muchos widgets y en OBS (Chromium + parseo JSON).
- **Severidad:** P1 (importante; no crashea pero castiga el stream en vivo).
- **Estado:** YA DOCUMENTADO (PERF-H1 / TD-006). Sigue vigente.

### ENRICH-PER-TICK — Normalización de variantes en cada render/tick
- **Categoría:** PERF
- **Archivos:** `frontend/src/overlay/ObsOverlayApp.tsx:155-159`, `frontend/src/overlay/WidgetHost.tsx:14` → `widget-base-size.ts:56`
- **Evidencia:** `enrichWidgetPropsWithVariant` se llama **dos veces por widget por render** (inline props + base size). Cada llamada ejecuta `withDefaultWidgetVariants(profile)` que itera todos los widgets y normaliza todas las variantes (O(n²)). A 30Hz con 9 widgets ≈ 54 llamadas/seg de trabajo O(n²).
- **Impacto:** GC pressure y CPU dominante en el path de 30Hz.
- **Severidad:** P1 (importante).
- **Estado:** YA DOCUMENTADO (PERF-H2 / TD-007). Sigue vigente.

---

## 🟠 P1 — Bugs / Seguridad graves

### ONBOARD-UNCONFIGURED — Pantalla BLANCA en onboarding si estado `unconfigured`
- **Categoría:** BUG
- **Archivos:** `frontend/src/hub/onboarding/OnboardingFlow.tsx:116-122`
- **Evidencia:** `AuthStage` maneja `anonymous`→Login y `expired`/`device-limit`→Paywall, pero para `unconfigured` cae a `return null`. `OnboardingFlow` monta su propio `LicenseProvider`+`AuthStage`, **bypasseando** el `LicenseGate` de `HubApp` que sí maneja `unconfigured`.
- **Impacto:** un usuario en un build mal configurado (o flujo de onboarding) ve pantalla en blanco en vez de `UnconfiguredScreen`.
- **Severidad:** P1 (crash de UX en un flujo secundario).
- **Estado:** YA DOCUMENTADO (TD-046). Sigue abierto.

### HUB-NO-SECTION-GATE — Secciones premium renderizan sin AccessGate por código
- **Categoría:** BUG / SEC (defense-in-depth)
- **Archivos:** `frontend/src/hub/HubApp.tsx:200-218`
- **Evidencia:** `HubShell` renderiza `{section === "engineer" && <EngineerPage />}` y `{section === "telemetry" && <TelemetryPage />}` sin `canUseFeature`. El Topbar oculta la navegación para Free, pero el estado `section` es libremente seteable.
- **Impacto:** un usuario Free que alcance `engineer`/`telemetry` (vía deep state o bug de navegación) ve el contenido completo. No es bypass de pagos (no desbloquea live), pero rompe el contrato de gating por sección.
- **Severidad:** P1 (inconsistencia de gating; el acceso real al live lo controla el runtime/licencia, así que no es bypass de cobro, pero es un hueco de UI).
- **Estado:** NUEVO (no en TD).

### WIDGETSTUDIO-DESIGN-GATE — Selector superior de diseño NO verifica `canApply`
- **Categoría:** BUG / SEC (inconsistencia de gating de negocio)
- **Archivos:** `frontend/src/hub/overlays/WidgetStudio.tsx:112-133` (selector) vs `frontend/src/hub/overlays/WidgetSettingsPanel.tsx:134-137` (panel derecho sí lo verifica)
- **Evidencia:** el `<select>` de diseño llama `onChangeProfile(applyOfficialDesignToProfile(...))` **sin comprobar `canApplyWidget`**. `applyOfficialDesignToProfile` (`widget-design-gallery.ts:525`) tampoco verifica gating. Solo el panel derecho (`handleApplyOfficialDesign`) lo bloquea.
- **Impacto:** un usuario Free puede cambiar el diseño visual de un widget Pro (relative, broadcast-tower, multiclass-relative) desde el selector superior sin restricción. Es inconsistencia de negocio (el acceso al live lo sigue controlando el runtime), pero debilita el gating visible.
- **Severidad:** P1 (inconsistencia de gating; debe ser coherente con el panel derecho).
- **Estado:** NUEVO (no en TD; el endurecimiento WIDGET-STUDIO-07 P1/P2 sólo cubrió el panel derecho).

### SSE-NO-AUTH — Endpoints SSE sin autenticación
- **Categoría:** SEC
- **Archivos:** `internal/server/sse.go:14-22`, `internal/server/engineer_sse.go`
- **Evidencia:** ambos handlers aceptan cualquier GET sin token. El default bind es `127.0.0.1:39261` y `ValidateAddr` rechaza no-loopback, pero cualquier proceso local (o malware en sesión) puede leer el stream completo de telemetría/ingeniero.
- **Impacto:** fuga de telemetría de carrera a procesos locales no autorizados. Riesgo bajo en LAN doméstica, pero es superficie innecesaria.
- **Severidad:** P1 (seguridad local).
- **Estado:** NUEVO (no documentado como finding de seguridad; los docs lo tratan como "design choice OBS").

### SSE-NO-LIMIT — SSE sin límite de conexiones (DoS local)
- **Categoría:** SEC / PERF
- **Archivos:** `internal/server/sse.go:1-53`, `internal/server/server.go` (rateLimiter solo en `/auth/token`)
- **Evidencia:** `handleSSE`/`handleEngineerSSE` no trackean ni capan conexiones concurrentes. Cada cliente llama `svc.Subscribe()` (append a `subs` slice). El `rateLimiter` (10/min) **solo está cableado a POST /auth/token**, no a SSE. Con N conexiones, `flushEmit` itera todos los subs a 30Hz → O(N) por tick.
- **Impacto:** un proceso local malicioso (o un OBS mal configurado) abre miles de SSE y agota CPU/memoria del PC de juego.
- **Severidad:** P1 (DoS local).
- **Estado:** NUEVO (confirma y actualiza el riesgo de `local-security-privacy-audit.md` §C, que no mencionaba límite).

### HUB-PROFILE-RACE — `ProfileService`/`HubService` sin mutex (race concurrency)
- **Categoría:** BUG (data integrity) / SEC (defense-in-depth)
- **Archivos:** `internal/app/profile_service.go:17-23`, `internal/app/hub_service.go:103-115`, `internal/app/hotkeys.go` (`go action()`)
- **Evidencia:** ni `ProfileService` ni `HubService` tienen `sync.Mutex`. Son accedidos desde (1) goroutines de eventos Wails, (2) goroutines de hotkeys vía `go action()` (bypassea la serialización de Wails), y (3) goroutines HTTP del server. Un `toggle-edit-mode` hotkey concurrente con un `profile:save` Wails puede mutar `s.profile` y llamar `SaveFile` sobre la misma ruta a la vez. `SaveProfileState` hace backup-mutate-save-rollback que **no es atómico entre goroutines**.
- **Impacto:** corrupción de perfil o pérdida de settings bajo concurrencia real.
- **Severidad:** P1 (race de integridad de datos).
- **Estado:** NUEVO (no en TD; los TD de concurrencia eran sobre updater/install, ya cerrados).

### SETTINGS-SAVE-BYPASS — `settings:save` no valida `LauncherApps` (path traversal de ejecución)
- **Categoría:** SEC
- **Archivos:** `internal/app/settings_service.go:225-237` (Save solo valida DeltaMode/HotkeyCombo) vs `cmd/vantare/main.go:774-803`, `internal/app/launcher/launcher.go:185-189`
- **Evidencia:** `settings:save` deserializa un `AppSettings` completo y lo persiste. `Save()` NO valida `LauncherApps` (ExecutablePath/Args/LaunchMethod). `launcher:configure` sí valida `fileExists()`, pero `settings:save` lo bypassa. Un evento `settings:save` craftedo escribe una ruta ejecutable arbitraria en `app-settings.json`; un `launcher:launch` posterior la ejecuta.
- **Impacto:** limitado porque Wails IPC es local-only (el atacante ya controla el WebView), pero viola defense-in-depth y es inconsistente con `launcher:configure`.
- **Severidad:** P1 (seguridad local / inconsistencia de validación).
- **Estado:** NUEVO (no en TD).

### SETTINGS-ACTIVEID-RACE — `settings:save` puede limpiar `activeOverlayProfileId`
- **Categoría:** BUG
- **Archivos:** `frontend/src/hub/pages/SettingsPage.tsx:252-268`, `frontend/src/hub/HubApp.tsx:166-171`
- **Evidencia:** `SettingsPageInner` inicializa `appSettings` a `DEFAULT_APP_SETTINGS` (sin `activeOverlayProfileId`). Si el usuario guarda (hotkeys/delta) antes de que llegue el evento `settings`, el `settings:save` emitido no incluye `activeOverlayProfileId`. El backend persiste sin ese campo → desconecta el perfil overlay activo. (El doc TD-041 ya lo señalaba para pantallas legacy; el flujo real de `SettingsPage` sigue expuesto.)
- **Severidad:** P1 (pérdida de estado de perfil activo).
- **Estado:** YA DOCUMENTADO (TD-041). Sigue abierto.

### I18N-AUTH-GAP — Login/Paywall en español hardcodeado
- **Categoría:** BUG (i18n) — crítico para launch multilenguaje
- **Archivos:** `frontend/src/hub/auth/LoginScreen.tsx:1-50`, `PaywallScreen.tsx`, `UnconfiguredScreen.tsx`
- **Evidencia:** toda la copy de auth/paywall está en español literal sin `t()`. La app soporta es/en/pt/it con `LanguageSelector`, pero estas pantallas (lo PRIMERO que ve un usuario nuevo) bypassan i18n.
- **Impacto:** un usuario no hispanohablante ve solo español en el flujo de login/paywall.
- **Severidad:** P1 (UX multilenguaje; es el primer contacto).
- **Estado:** YA DOCUMENTADO (I18N-03b / TD en stripe-audit §3 #8). Sigue pendiente.

### I18N-FALLBACK-MASK — `translate()` devuelve la KEY y enmascara huecos
- **Categoría:** BUG (i18n)
- **Archivos:** `frontend/src/i18n/i18n.ts`
- **Evidencia:** el fallback de `translate()` devuelve la key si falta la traducción. Esto oculta strings sin traducir (se ven como `studio.save` en vez de copy visible), dificultando detectar regresiones a español literal.
- **Severidad:** P1 (enmascara deuda i18n).
- **Estado:** YA DOCUMENTADO (I18N-ROADMAP §riesgos).

### WIDGET-CAST-UNSAFE — Cast `as OverlayStatus` sin validación en IPC
- **Categoría:** BUG
- **Archivos:** `frontend/src/hub/pages/OverlaysStudioPage.tsx:72`, `ActiveOverlayCard.tsx:58`, `PreviewPage.tsx:95`
- **Evidencia:** `setOverlayStatus(event.data as OverlayStatus)` sin validar forma. Si el backend emite un evento `overlay:status` parcial/nulo, los consumidores operan sobre datos corruptos.
- **Severidad:** P1 (corrupción de estado silenciosa en el boundary Wails).
- **Estado:** NUEVO (no en TD).
