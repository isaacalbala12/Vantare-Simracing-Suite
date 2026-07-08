# Hallazgos Medianos (P2)

Corregir antes del release público de pago. Verificados contra código real.

---

## PERF — Widgets con `setInterval` en vez de `startFrameBudgetLoop`

### BROADCAST-SETINTERVAL
- **Archivos:** `frontend/src/overlay/widgets/BroadcastTowerWidget.tsx:45-53`
- **Evidencia:** usa `setInterval(() => {...}, 1000/updateHz)` para el paint loop. No respeta `document.hidden` → sigue disparando a 15Hz en background; no alinea con vsync.
- **Impacto:** CPU innecesaria en background (OBS source oculto, tab oculta); jank potencial.
- **Severidad:** P2.
- **Estado:** NUEVO (los demás widgets usan `startFrameBudgetLoop` correctamente).

### MULTICLASS-SET-INTERVAL
- **Archivos:** `frontend/src/overlay/widgets/MulticlassRelativeWidget.tsx:54-61`
- **Evidencia:** mismo patrón `setInterval` que BroadcastTowerWidget; no respeta `document.hidden`.
- **Impacto:** igual que arriba.
- **Severidad:** P2.
- **Estado:** NUEVO.

---

## PERF — Go: allocs por tick sin pooling

### DIFF-ALLOC
- **Archivos:** `internal/telemetry/diff/diff.go:23-28`, `diffPlayer:66-68`, `diffSession:84-86`, `vehiclesChanged:186`
- **Evidencia:** `Compute()` alloca `map[string]any{}` en cada llamada + maps anidados por player/session; `vehiclesChanged` alloca `make(map[int32]...)` por llamada.
- **Impacto:** GC pressure a 30Hz (top-level + nested + vehicles). Con 50 vehículos, `vehiclesChanged` alloca mapa de 50 entradas por llamada.
- **Severidad:** P2.
- **Estado:** NUEVO (detalle de PERF-H2 / TD-007 en Go side).

### FILTER-ALLOC
- **Archivos:** `internal/telemetry/pipeline/filter.go:168` (60Hz read) + `diff.go:186` (30Hz emit)
- **Evidencia:** `vehiclesChanged()` alloca `make(map[int32]models.VehicleScoring, len(pv))` en cada llamada. Combinado read(60Hz)+emit(30Hz) ≈ 90 allocs/seg solo para comparación de vehículos.
- **Impacto:** GC pressure evitable.
- **Severidad:** P2.
- **Estado:** NUEVO.

---

## PERF — Concurrencia de rAF (ya documentado)

### RAF-CONCURRENT
- **Archivos:** `frontend/src/overlay/widgets/*` (cada widget su propio rAF)
- **Evidencia:** 6+ widgets → 6+ `requestAnimationFrame` concurrentes. Cleanup correcto vía `cancelAnimationFrame`.
- **Impacto:** desalineación de fotogramas entre widgets; más contextos rAF de los necesarios.
- **Severidad:** P3→P2 (según TD-010 es P3; lo dejo en P3 para no inflar).
- **Estado:** YA DOCUMENTADO (PERF-H3 / TD-010).

---

## SEC — Bind `0.0.0.0` permitido parcialmente

### VALIDATE-ADDR-0000
- **Archivos:** `internal/server/server.go:113-133`, `cmd/vantare/main.go:221` (`-http` flag default `127.0.0.1:39261`)
- **Evidencia:** `ValidateAddr` rechaza host vacío y no-loopback, pero **NO rechaza explícitamente `0.0.0.0`** (lo parsea como IP y `IsLoopback()` da false → lo rechaza). Es decir: `0.0.0.0` SÍ queda bloqueado por `IsLoopback()==false`. ✅ Confirmado: el bind a `0.0.0.0` está bloqueado en startup. El riesgo real es que el flag `-http` permite al usuario poner cualquier IP no-loopback y `ValidateAddr` lo bloquea — bien. PERO la recomendación de `local-security-privacy-audit.md` §Bloqueos (2) de poner un **toggle en UI con warning** NO está implementada: el usuario debe usar el flag de consola oscuro.
- **Impacto:** la exposición LAN requiere flag manual (no por defecto, bien), pero falta el consentimiento UI exigido por la auditoría de seguridad.
- **Severidad:** P2 (gap de cumplimiento de la auditoría de seguridad local).
- **Estado:** YA DOCUMENTADO (local-security-privacy-audit.md §2.2). Pendiente.

---

## BUG — `ProfileService.SaveProfile` sin rollback atómico

### PROFILE-SAVE-RACE
- **Archivos:** `internal/app/profile_service.go:74-86` vs `SaveProfileState:84-108`
- **Evidencia:** `SaveProfile` escribe a disco con `config.SaveFile` y luego `s.profile = p`. Si un crash ocurre tras `SaveFile` pero antes de la asignación, el estado en memoria queda obsoleto; con lecturas concurrentes (sin mutex, ver P1 HUB-PROFILE-RACE) ven estado inconsistente. `SaveProfileState` sí hace backup+rollback correcto.
- **Impacto:** race de datos combinado con el P1 de mutex.
- **Severidad:** P2.
- **Estado:** NUEVO (detalle del P1 de concurrencia).

---

## SEC — `nonceStore.Generate()` puede panic fuera de main

### NONCE-PANIC
- **Archivos:** `internal/server/server.go:39-40`
- **Evidencia:** `Generate()` hace `panic("crypto/rand: "+err.Error())` si `crypto/rand.Read` falla. El panic propaga y crashea todo el proceso (incluido el overlay de carrera en vivo), violando la convención del repo (el resto retorna errores).
- **Impacto:** un fallo rarísimo de entropía tumba la app completa.
- **Severidad:** P2 (defense-in-depth; raro pero viola convención y `AGENTS.md` "no uses panic").
- **Estado:** NUEVO.

---

## BUG — UX de updater fragmentada

### UPDATER-UX
- **Archivos:** `frontend/src/hub/components/UpdateBanner.tsx`, `SettingsPage.tsx` (TD-020/021/022)
- **Evidencia:** dos caminos para actualizar (`UpdateBanner` y `SettingsPage`), el portable zip no se consume desde el updater, y el banner no muestra release notes.
- **Impacto:** usuarios confundidos; quienes prefieren portable no pueden actualizar desde la app.
- **Severidad:** P2.
- **Estado:** YA DOCUMENTADO (TD-020/021/022).

---

## SEC — Firma de código ausente

### CODESIGN
- **Archivos:** pipeline de release (`release.yml`, `tools/build_nsis.ps1`)
- **Evidencia:** ejecutables sin firma Authenticode. SmartScreen muestra aviso.
- **Impacto:** fricción alta para usuarios finales; reputación SmartScreen dañada en release público.
- **Severidad:** P2 (bloquea release estable v1.0; NO bloquea beta privada).
- **Estado:** YA DOCUMENTADO (TD-027).

---

## SEC — `TD-015` review de seguridad real pendiente

- **Archivos:** toda la capa auth/licencias
- **Evidencia:** el flujo básico funciona con Supabase, pero falta threat model, webhook idempotente end-to-end, device binding/reset auditado, storage de tokens, revocation/grace, logs sin secretos/PII, concurrencia/reintentos.
- **Severidad:** P2 (release público de pago).
- **Estado:** YA DOCUMENTADO (TD-015).
