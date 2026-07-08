# Hallazgos Menores (P3) y Deuda Conocida

No bloquean el lanzamiento. Confirmados en código actual donde aplica.

---

## FRONTEND — Deuda de UX / i18n / tests

### TD-045 — Gaps de test en `UnconfiguredScreen` / `LicenseGate` unconfigured
- **Estado:** abierto, YA DOCUMENTADO.

### TD-048 — `betaWelcomeCompleted` legacy sin `betaUserRole` no reabre modal
- **Archivos:** `frontend/src/hub/HubApp.tsx:136` (`setShowBetaWelcome(!completed)` en cada evento `settings`).
- **Evidencia:** builds previos a HUB-04 persistieron `betaWelcomeCompleted:true` sin rol; el modal no se reabre.
- **Estado:** abierto, YA DOCUMENTADO.

### TD-047 — `ActiveOverlayCard` no consulta estado inicial de overlay
- **Archivos:** `frontend/src/hub/components/ActiveOverlayCard.tsx`
- **Evidencia:** escucha `overlay:status` pero no emite `overlay:status:get` al montar; si se monta tras el último emit, muestra "Abrir overlay" aunque ya está abierto.
- **Estado:** abierto, YA DOCUMENTADO.

### TD-011/012/013/016/017 — Tests / schema / UX menor
- **Estado:** abiertos, YA DOCUMENTADO (regresión Ctrl+S, aria-pressed, `columns:[]` ambiguo, densidad visual, paleta mock).

### TD-036 — `engineer-notifications` sin frame editable en edit mode
- **Archivos:** `frontend/src/overlay/WidgetEditFrame.tsx`, `shared-widget-map`
- **Evidencia:** aparece como caja vacía editable en edit mode.
- **Estado:** abierto, YA DOCUMENTADO.

### TD-040 — Test `TestHubServiceSetActiveProfileStopsRunningOverlay` con nombre contrario al contrato
- **Estado:** abierto, YA DOCUMENTADO.

### TD-042 — Vitest imprime `ECONNREFUSED :3000` con exit 0
- **Archivos:** suite frontend
- **Evidencia:** ruido post-resumen; no bloquea pero puede ocultar errores reales.
- **Estado:** abierto, YA DOCUMENTADO.

---

## GO — Deuda / dead code

### HOTKEY-DEADCODE — `nameToAction` map nunca se puebla
- **Archivos:** `internal/app/hotkeys.go:288-297`
- **Evidencia:** `UpdateFromSettings` crea `nameToAction` y lo descarta con `_ = nameToAction`. Dead code de un refactor. El test `TestHotkeyManagerUpdateFromSettingsKeepsToggleEditMode` confirma que `toggleEditMode` NO se pierde (usa `actionMap` del parámetro).
- **Severidad:** P3 (cleanup).
- **Estado:** NUEVO (no funcional, solo limpieza).

### TD-019 — Falta `go test -race` del lifecycle del updater
- **Estado:** abierto, YA DOCUMENTADO (requiere CGO).

### TD-032/033/034 — Overlay edit mode concurrencia/rollback/test
- **Estado:** abiertos, YA DOCUMENTADO.

### TD-037/038/039 — `applyShrinkWrap` / `WindowLocalPos` sin consumidor productivo
- **Estado:** abiertos, YA DOCUMENTADO.

---

## PERF — Menores

### TD-010 — Múltiples rAF concurrentes sin centralizar
- **Estado:** abierto P3, YA DOCUMENTADO (PERF-H3).

### TD-008 — Harness visual/browser con Playwright ausente
- **Estado:** abierto P3, YA DOCUMENTADO.

---

## SEC — Menores

### TD-028 — Releases históricas sin `.sha256` no compatibles con `InstallVerified`
- **Estado:** abierto P3, YA DOCUMENTADO.

### TD-002 — Checksums sidecar no verificados en CI
- **Estado:** abierto P3, YA DOCUMENTADO.

### TD-005 — Versión NSIS no estricta en CI
- **Estado:** abierto P3, YA DOCUMENTADO.
