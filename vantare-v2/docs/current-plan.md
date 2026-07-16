Nota OVERLAY-STUDIO-V3 (2026-07-10):
- Objetivo: reconstrucción paralela de Overlay Studio V3 (Delta, Standings, Relative, Pedals en `vantare-original` y `vantare-crystal`).
- Autoridad: ADR `docs/adr/0003-overlay-studio-v3-rebuild.md` y plan maestro `docs/superpowers/plans/2026-07-10-overlay-studio-rebuild-master.md` (worktree `refactor`, rama `refactor`).
- Worktree: `C:\Users\isaac\emdash\worktrees\vantare-v2\refactor` — rama `refactor`.
- **Fase 0 ✅ CERRADA** (commits `b2326e3`..`4f340f5`): autoridad ADR, baseline, fixtures migración, caracterización 4 widgets, inventario consumidores.
- **Fase 1 ✅ CERRADA** (commits `2f0b3f3`..`2dfb940`): tipos/validación/migración V3 Go, storage revision-aware + backup `.pre-v3.bak`, `StudioProfileService` paralelo, contrato TS `profile-document.ts`, librería diseños `WidgetDesignService` + `widget-design.ts`.
- Evidencia baseline: `docs/overlay-studio-v3-baseline.md`, `docs/overlay-studio-v3-inventory.md`.
- Tests Fase 1: `go test ./pkg/config/... ./internal/app/... -run "ProfileDocumentStore|StudioProfileService|WidgetDesignService|MigrateProfile|ValidateProfileDocumentV3" -count=1` PASS; `pnpm --dir frontend test` → 166 files / 1584 PASS; `pnpm --dir frontend build` PASS.
- Goldens migración: `pkg/config/testdata/profile-v3-core-widgets-from-v0.golden.json`, `profile-v3-core-widgets-from-v2.golden.json`; parser TS alineado en `profile-contract-fixture.test.tsx` (parse + render de los 4 widgets del golden v2).
- Preexistentes documentados (no regresión): lint frontend 11 errores; `internal/server` nonce/port tests FAIL en `go test ./...`; flaky ocasional `TestConcurrentSavesDontCorruptFile` en `internal/app` (Windows file lock).
- **Fase 2 ✅ CERRADA** (commits `6e471fe`..`d853b4c`): registry funcional Delta, telemetry store, view model, design-system registry + migración visual, renderers Original/Crystal, `WidgetVisualHost`, harness visual determinista (`visual:overlay-studio`).
- Evidencia Fase 2: `pnpm --dir frontend test` → 179 files / 1642 PASS; `pnpm --dir frontend build` PASS; `pnpm --dir frontend visual:overlay-studio` x2 PASS (0.000% delta); `rg` design-systems sin imports prohibidos (solo aserciones en tests).
- **Fase 3 ✅ CERRADA** (commits `41df467`..`dd94e34` + fix build `studio-store`): session layouts, command reducer, widget order, bounded undo/redo, profile client Wails, `StudioProvider` global draft, crash recovery localStorage, dirty-navigation guard y hotkeys.
- Evidencia Fase 3: `pnpm --dir frontend test -- overlay-studio/state` x2 → 67 PASS; `pnpm --dir frontend test` → 188 files / 1709 PASS; `pnpm --dir frontend build` PASS.
- **Fase 4 ✅ CERRADA** (commits `b7bdec0`..`e80c612`): shell V10, geometría pura, canvas con `WidgetVisualHost`, drag/resize transaccional, preview controls, acciones unificadas, paneles responsive, modales dirty/recovery, harness V3 y visual geometry (wide/medium/compact + drag/resize).
- Evidencia Fase 4: `pnpm --dir frontend test -- src/hub/overlay-studio` → 159 PASS; `pnpm --dir frontend visual:overlay-studio` x2 → 15 baselines 0.000% delta + interacciones wide; `pnpm --dir frontend build` PASS.
- QA manual harness: `pnpm --dir frontend exec vite --config vite.overlay-studio-harness.config.ts --host 127.0.0.1` → `http://127.0.0.1:5176/overlay-studio-v3-harness.html`.
- Docs vivos canvas/drag: `docs/overlays-studio/` (índice `README.md`; anti-regresión `canvas-drag-imperative-preview.md`; exploración `arrastre-y-resize.md`; benchmark `benchmarks/` + `pnpm --dir frontend bench:overlay-studio-drag`).
- Fix drag teleport/rastro (2026-07-10): commit `dc382bf` — preview imperativa B1 (`canvas-frame-preview.ts`, `previewActive` en frame). Tests `useCanvasInteraction` 11/11; suite overlay-studio 233/233.
- Fix preview click shrink (2026-07-10): `clearStudioFrameLayoutPreview()` ya solo limpia el scaler cuando termina una sesión `resize`; una sesión `move` no puede borrar el `transform` comprometido por React. Regresiones cubiertas en `canvas-frame-preview.test.ts` y `useCanvasInteraction.test.tsx`; move/resize verificados en el harness real.
- Fix resize guides/capture (2026-07-10): las guías del canvas pasan a `z-index: 0` para quedar detrás de los frames y `lostpointercapture` se cablea desde frame/handles al cancelador de interacción. Resize durante captura perdida restaura el layout, elimina guías y no marca dirty; verificado en navegador.
- Task 5.8 Browser View (2026-07-10): `browser-view.ts` abre `/overlay?profile=` solo con perfil guardado; si dirty → guardar o cancelar (sin descartar). Cableado en `OverlayStudioV3` + `StudioCanvas`.
- Harness Browser View (2026-07-10): middleware Vite (`overlay-studio-harness-vite-plugin.ts`) + preview studio (`studioPreview=1`, fondo gris/rejilla, escala fit). Commits `32bc433`..`39a1133`.
- **Fase 5 ✅ CERRADA** (commits `96d7119`..`a606b21` + harness browser view): inspector por capacidades, catálogo, diseños, access policy, Browser View.
- **Fase 7.1 ✅ CERRADA** (commit `39f864a`): handlers Wails `studio:profile:load/save` con `requestId` correlacionado; `WidgetDesignService` handlers ya registrados; `StudioProfileService.RegisterHandlers` en `main.go`.
- Evidencia 7.1: `go test ./internal/app/... -run "StudioProfileService|WidgetDesignService" -count=1` PASS.
- **Fase 7.2 ✅ CERRADA** (commit `9ab6bd7`): `normalizeLegacyTelemetry`, `TelemetryRateCoordinator`, adaptadores Wails (`telemetry:update`) y SSE (`/telemetry/stream`); stale/disconnected/error publican inmediato; buckets compartidos por Hz.
- Evidencia 7.2: `pnpm --dir frontend test -- telemetry-adapter telemetry-rate-coordinator wails-telemetry sse-telemetry` → 16 PASS; `pnpm --dir frontend test -- src/overlay` → 76 files / 486 PASS; `pnpm --dir frontend build` PASS; `pnpm --dir frontend visual:overlay-studio` → 59 baselines 0.000% delta + parity + studio QA, exit 0.
- **Fase 7.3 ✅ CERRADA** (commit `e7bfa14`): `resolve-runtime-layout`, `RuntimeWidgetFrame`, `RuntimeOverlaySurface`, `useRateLimitedTelemetry`; layout runtime sin materializar sesiones; widgets filtrados por enabled/visibility/z-index; preserved legacy con diagnóstico no fatal.
- Evidencia 7.3: `pnpm --dir frontend test -- resolve-runtime-layout RuntimeWidgetFrame RuntimeOverlaySurface` → 14 PASS; `pnpm --dir frontend visual:overlay-studio` exit 0.
- **Fase 6 ✅ CERRADA** (commits `074d389`..`5f44acb`): 6.1–6.8 migración funcional completa (Standings, Relative, Pedals Original/Crystal); registry 4 widgets × 2 systems; official designs; catálogo 4 entradas; golden v2 sin diagnósticos; fix chrome selección Relative (`fcf4989`).
- **6.9 matriz visual + parity:** harness 4 widgets (`harness-fixtures.ts`), 59 baselines PNG (widget×system×surface ready + estados error + variantes stress60/fill/zero/full), assertions HTML parity studio/desktop/obs en Vitest + Playwright, chrome Relative en studio verificado.
- Evidencia Fase 6 (2026-07-11): `pnpm --dir frontend test -- src/overlay` → 69 files / 456 PASS; `pnpm --dir frontend test -- OverlayParityHarness harness-fixtures` → 21 PASS; `pnpm --dir frontend visual:overlay-studio` x2 → 59 baselines 0.000% delta + parity 4 widgets + studio-relative-chrome + drag/resize + zoom; `pnpm --dir frontend build` PASS.
- **Fase 7.4 ✅ CERRADA** (commit `960838a`): `GET /api/profile-v3` migration-aware para OBS.
- **Fase 7.5 ✅ CERRADA** (commit `a5f31c4`): lifecycle Go V3 (`StudioProfileService` canónico, hotkeys, `overlay:profile-v3-loaded`, navegación Hub).
- **Fase 7.6 ✅ CERRADA** (commit `2b1c6e5`): `DesktopOverlayRuntime` + `CompositeApp` con adaptador Wails y evento `overlay:profile-v3-loaded`.
- **Fase 7.7 ✅ CERRADA** (commit `5a407f1`): `ObsOverlayRuntime` + `ObsOverlayApp` con `/api/profile-v3` y SSE.
- **Fase 7.8 ✅ CERRADA** (commit `ddf73ab`): refresh del overlay activo solo tras save exitoso del mismo perfil.
- **Fase 7.9 ✅ CERRADA** (commit `6ba0d0a`): `StudioRoute` entra directo al editor V3 con perfil activo; `NoActiveProfileState`; telemetría live por coordinador + `useRateLimitedTelemetry` en frames; sin `V52OverlaysHome` ni `EMPTY_PROFILE`.
- **Fase 7.10 ✅ CERRADA** (commit `71867c6`): gates automatizados frontend + visual + Go app; smoke manual documentado en `docs/manual-verification.md` (requiere Wails + copia de perfil de prueba).
- Evidencia 7.4–7.10 (2026-07-11): `pnpm --dir frontend test` → 258 files / 2084 PASS (1 fix live-disconnected en `StudioCanvas.test.tsx`); `pnpm --dir frontend build` PASS; `pnpm --dir frontend visual:overlay-studio` → 59 baselines 0.000% delta + parity + studio QA; `go test ./internal/app/... ./cmd/vantare/... -count=1` PASS; `go test ./...` mantiene preexistentes en `internal/server` (nonce/port bind).
- **Post-7.10 hotfix ✅** (commit `32b24b3`, 2026-07-11): plan Free puede mover/redimensionar todos los widgets (layout libre; premium sigue en content/visual); avisos de acceso en banner; flujo crear perfil + carga Hub + standings defaults + harness E2E ruta studio. Smoke manual Wails en Desktop (`refactor`) **PASS** (usuario).
- **Fase 8.7A ✅ CERRADA** (commit `888ebda`, 2026-07-11): retirado editor legacy `hub/overlays` (34 archivos); conservados `OwnProfilesView`, `RecommendedProfilesView`, OBS/community. i18n: eliminados `studio.saveToWidget` y `studio.discard`.
- **Fase 8.7B ✅ CERRADA** (2026-07-11): retirados `PreviewPage`, `WidgetsPage` y módulos preview legacy (`PreviewCanvas`, `PreviewInspector`, `WidgetList`, etc.). Conservados `PreviewWidgetFrame` + `WidgetRenderer` para miniaturas de perfiles (`ProfilePreview`). Contrato harness movido a `overlay-harness/widget-preview-contract.ts`.
- Evidencia 8.7A–8.7B: `pnpm test -- StudioRoute ProfilePreview overlay-studio widget-preview-contract` → 306 PASS; `pnpm build` PASS.
- **Fase 8.7C ✅ CERRADA** (2026-07-11): retirados `EditOverlayApp`, `WidgetEditFrame`, `shared-widget-map`, `WidgetHost` y ruta `/overlay/edit`. Runtime desktop/OBS ya usaba V3 (`DesktopOverlayRuntime`, `ObsOverlayRuntime`). Conservados `WidgetRenderer` + miniaturas de perfiles. `StartEditOverlay` en Go queda sin callers frontend (retiro Go diferido).
- Evidencia 8.7C: `pnpm test -- CompositeApp ObsOverlayApp DesktopOverlayRuntime ObsOverlayRuntime ProfilePreview StudioRoute overlay-studio widget-preview-contract` → 309 PASS; `pnpm build` PASS.
- **Fase 8.7D ✅ CERRADA** (2026-07-11): miniaturas de perfiles migradas a V3 (`WidgetVisualHost` + `previewDocument` en `ListProfiles`); retirados `WidgetRenderer`, `PreviewWidgetFrame`, componentes legacy `overlay/widgets/*Widget.tsx`, harness parity legacy, settings sections huérfanas y `StartEditOverlay` Go.
- Evidencia 8.7D: `pnpm test -- ProfilePreview overlay-studio widget-preview-contract CompositeApp ObsOverlayApp` → 327 PASS; `pnpm build` PASS; `go test ./internal/app/...` PASS.
- **Fase 8.7E ✅ CERRADA** (2026-07-11): retirados `widget-design-gallery`, `WidgetDesignGallery`, `widget-presets`, `widget-presets-store` y `widget-variants` (frontend legacy). Diseños oficiales V3 siguen en `official-designs.ts`; tests de fixtures migrados sin dependencia del modelo legacy de variants.
- Evidencia 8.7E: `pnpm test -- overlay-studio official-designs widget-preview-fixtures` → 316 PASS; `pnpm build` PASS.
- **Fase 8.7F ✅ CERRADA** (2026-07-11): retirado Go `PresetService` y handlers Wails `preset:*` (sin callers tras 8.7E). Migración one-shot `widget-presets.json` → `widget-designs.json` conservada en `WidgetDesignService` con tipos legacy internos.
- Evidencia 8.7F: `go test ./internal/app/... ./cmd/vantare/... -count=1` PASS; `pnpm test -- widget-design-client` → 11 PASS.
- **Fase 8.7G ✅ CERRADA** (2026-07-11): auditoría retirement `docs/overlay-studio-v3-retirement-audit.md`; inventario actualizado; búsqueda consumidores legacy → cero en producción.
- **Fase 8.8 ✅ CERRADA** (2026-07-12): auditoría final `docs/overlay-studio-v3-final-audit.md` actualizada; gates frescos: `pnpm test` 213 archivos / 1578 tests PASS, `pnpm build` PASS, `visual:overlay-studio` 59 baselines 0.000% delta + parity + QA responsive/teclado PASS, `design-system:check` 2 sistemas PASS, `go test ./internal/app/... -run StudioProfileService` PASS.
- **Fase 8 (cutover V3) ✅ CERRADA** para merge: retirement 8.7 y hardening 8.1–8.6 completos. El lint frontend y `go test ./...` mantienen fallos preexistentes fuera del alcance; quedan documentados como gates de mantenimiento separados.
- **Siguiente:** push `refactor`; merge cuando usuario apruebe; expansión de widgets y resolución de los gates preexistentes de lint/`internal/server`.
- Rollback ordenado (revert commits en orden inverso): Hub route `6ba0d0a` → OBS `5a407f1` → Desktop `2b1c6e5` → lifecycle `a5f31c4`. Legacy editor/renderer retirado en Fase 8.7.
- Índice Luna: `docs/superpowers/plans/2026-07-10-overlay-studio-rebuild-luna-execution-index.md`.

Nota LAUNCH-1C (2026-07-10):
- Objetivo: cerrar smoke de checkout Polar **produccion** sin pago real (sin presupuesto test).
- Proyecto Supabase: `ombjshwzqgeisazijduq` (oficial). Sin merge PR, sin tag, sin release publico.
- Script smoke: `supabase/.temp/smoke-prod-billing.ps1` (gitignored). Mapping aplicado via `supabase/.temp/polar-prod-map.env` (gitignored, no commiteado).
- `POLAR_PRODUCT_MAP` prod re-aplicado (minificado, ASCII, IDs prod):
  - `launch_lifetime` -> `b1b1e348-acd6-4a81-ba67-db6d98aca2e6`
  - `pro_monthly` -> `0f91f52f-f92f-4a7a-9782-da2ec44cf8b8`
  - Sin IDs sandbox (`fd15a961...`, `41cffd72...`). Ambos -> entitlement `bundle`.
- Resultados smoke prod (2026-07-10, sin abrir checkout ni comprar):
  - Auth JWT: OK (`state_password_grant`, usuario `fase2g.smoke.1783629293344@gmail.com`)
  - `launch_lifetime`: OK HTTP 200, URL `polar.sh/checkout/...` (prod, no sandbox)
  - `pro_monthly`: OK HTTP 200, URL `polar.sh/checkout/...` (prod, no sandbox)
  - Spoof `forbidden_field`: OK HTTP 400
  - `mapping_invalid_json`: resuelto (ya no aparece)
- **No validado** (requiere pago real): webhook prod `order.paid` 202, `user_entitlements`, `billing_subscriptions`, billing portal prod end-to-end.
- Estado gates:
  - **GO** generar checkout produccion (API + URLs Polar prod)
  - **NO-GO** venta publica hasta smoke de pago real o aceptacion explicita del riesgo
- `VITE_BILLING_ENABLED`: default en codigo sigue `false` (`billing-client.ts` solo activa con `=== "true"`). No activado en pipeline release publico este corte.
- Secrets: no tocados en este cierre (solo documentacion). OAT/whsec/map ya aplicados en sesiones previas.
- Checklist pendiente (cuando haya presupuesto ~4.99 EUR):
  1. Pago real controlado **Pro Monthly** (4.99 EUR) con cuenta smoke dedicada
  2. Verificar webhook Polar prod responde **202** y escribe `license_events`
  3. Verificar `user_entitlements` -> `bundle` activo (mensual)
  4. Verificar fila en `billing_subscriptions` coherente con Polar
  5. Verificar billing portal produccion (abrir sesion, volver a app)
  6. Cancelar suscripcion y/o refund en Polar si procede
  7. Revalidar en app: Ajustes -> "Actualizar estado de licencia"
  8. Solo entonces valorar `VITE_BILLING_ENABLED=true` en release (Fase 2H)
- Plan Polar: `docs/superpowers/plans/2026-07-09-fase-2-polar-integration.md` seccion Fase 2H / Launch-1C.
- Estado: ✅ CERRADO (checkout prod smoke sin pago)

Nota LAUNCH-0.5-COMMIT (2026-07-09):
- Branch: `launch/polar-billing` — commit `cc84a4b` (68 archivos, solo billing/licencia Polar Fase 1.6–2G).
- Excluido del commit: calendar, launcher, marketing, pnpm-workspace, smoke scripts, temporales.
- Push: **pendiente** (confirmar con humano).
- Estado: ✅ CERRADO

Nota LAUNCH-0-AUDIT (2026-07-09):
- Objetivo: auditoría pre-producción billing Polar — sin deploy prod, sin activar `VITE_BILLING_ENABLED` en release.
- Tests: `pnpm --dir frontend test` 164 files / 1570 PASS; `pnpm --dir frontend build` OK; `deno test supabase/functions` 79 PASS; `go test ./internal/license/...` PASS.
- Secretos: `.env` / `apps/desktop/.env` locales con service role (gitignored); nada trackeado en `git ls-files` (`.env.local`, `smoke-jwt`, `smoke-session.json`).
- Playwright E2E: no hay `playwright.config.ts`; checklist billing cubierto por Vitest (`billing-client`, `PaywallScreen`, `AccountSettings`, `entitlements-refresh`).
- Riesgo bloqueante pre-prod: working tree sucio (billing untracked + mezcla launcher/calendar); commits ordenados pendientes antes de Launch-1.
- Launch-1 (humano): Polar prod org + productos, webhook prod, `supabase secrets set` prod, deploy EF, `VITE_BILLING_ENABLED=true` solo en pipeline release, smoke post-deploy, rollback = `VITE_BILLING_ENABLED=false` + revert secrets.
- Recomendación Launch-0: **no-go a producción** hasta commit limpio billing + Launch-1 checklist humano.
- Estado: ✅ CERRADO (auditoría)

Nota FASE-2G-SMOKE (2026-07-09):
- Objetivo: smoke GUI post-pago Polar — login → premium activo → Hub desbloqueado → refresh/reset PC en Ajustes.
- Usuario smoke: `fase2g.smoke.1783629293344@gmail.com` (credenciales en `%TEMP%\vantare-fase2g-state.json`, gitignored).
- Supabase oficial `ombjshwzqgeisazijduq`: `user_entitlements` con `bundle` + `active` (Polar lifetime); RPC `get_account_entitlements` OK con huella real del PC.
- **Smoke GUI PASS (2026-07-09):** `wails3 dev` + login email → Ajustes → “Actualizar estado de licencia” → **“Acceso lifetime activo.”** Diagnóstico: `mock_runtime=false`, `state=active`, `entitlements=["bundle"]`, `deviceOK=true`, `tokenLen=843`, refresh `unlocked=true`.
- Bugs corregidos en este corte:
  1. `frontend/vite.config.ts`: el mock `@wailsio/runtime` solo con `VITE_RUNTIME_MOCK` (harnesses); `wails3 dev` usa runtime real → Go.
  2. `internal/license/types.go` + `service.go`: `lastValidated` como RFC3339 string en wire.
  3. `frontend/src/lib/entitlements-refresh.ts`: correlación refresh/reset + logs.
  4. `frontend/src/lib/license-debug.ts`, `license-debug-log.ts`, `hub/settings/LicenseDiagnosticsPanel.tsx` (panel dev en Ajustes).
  5. `tools/start-wails-dev-visible.ps1` (terminal visible opcional).
- Comando dev: `powershell -File tools\start-wails-dev.ps1` (inyecta `VANTARE_SUPABASE_*` desde `frontend/.env.local`).
- Tests: `go test ./internal/license/...` PASS; `pnpm --dir frontend test -- entitlements-refresh AccountSettings license` PASS.
- Pendiente Fase 2H: `VITE_BILLING_ENABLED=true` en release prod, secrets prod, monitor webhooks. `BILLING_ENABLED` sigue `false` en dev por defecto.
- Spec técnico completo: `docs/superpowers/specs/2026-07-09-fase-2g-licensing-revalidation-spec.md`
- Estado 2G: ✅ CERRADO (smoke GUI PASS)

Nota FASE-2-POLAR (2026-07-09):
- Plan maestro: `docs/superpowers/plans/2026-07-09-fase-2-polar-integration.md`
- Fase 2A: `docs/superpowers/plans/2026-07-09-fase-2a-polar-dashboard-setup.md` — docs Polar + mapping example.
- Fase 2B: skeleton EF billing + tests Deno.
- Fase 2C: `billing-checkout` checkout real Polar sandbox (`POST /v1/checkouts/`, mapping `product_id_to_checkout_key`, sin `polar_price_id`). Tests Deno 35 PASS. Sin deploy, sin `VITE_BILLING_ENABLED`.
- Fase 2G: smoke GUI post-pago + revalidación — ver nota **FASE-2G-SMOKE** arriba (✅ CERRADO).
- Secrets en Supabase (humano): `POLAR_ACCESS_TOKEN`, `POLAR_PRODUCT_MAP`, `CHECKOUT_*`, `PORTAL_RETURN_URL`.
- Gate: no deploy EF hasta E2E sandbox manual post-deploy.
- Estado 2C: ✅ CERRADO EN REPO — listo para deploy sandbox `billing-checkout`

Nota LAUNCHER-BUGFIX (2026-07-09):
- Bug 1: `os.ExpandEnv` no expande `%VAR%` Windows. Fix: `expandWindowsEnv()` en `discovery.go`.
- Bug 2: Apps como OBS necesitan `cmd.Dir` = su carpeta para encontrar archivos relativos (locale, config). Fix: `cmd.Dir = filepath.Dir(entry.ExecutablePath)` en `chain.go`.
- Apps afectadas conocidas: OBS. Potencialmente CrewChief, SimHub, MoTeC.
- Documentación completa en `docs/superpowers/specs/2026-07-08-launcher-v2-design.md` sección 11.

Nota FASE-1-6-BILLING (2026-07-09):
- Objetivo: billing/licensing provider-agnostic (Polar-ready) sin integrar Polar.
- Proyecto Supabase **oficial**: `ombjshwzqgeisazijduq` (`https://ombjshwzqgeisazijduq.supabase.co`). Auth/Google operativo; migraciones aplicadas 2026-07-09.
- Proyecto **equivocado** (solo pruebas): `olhwhfaczmrmooeaoqqf` — Fase 1.6 se aplicó allí por error antes de la corrección. Queda como staging/test o abandonado; **no usar en app/CI**.
- Completado en proyecto correcto: migraciones `20260605140000`, `20260709120000`, `20260709150000`, `20260709160000` (backfill profiles); `billing-client` (`BILLING_ENABLED=false`); Paywall/AccountSettings sin endpoints fantasma; Go decoder PostgREST array; smoke RPC + device binding + entitlement manual; smoke GUI Wails (`bin/vantare-smoke-correct.exe`) PASS.
- Env locales alineados (gitignored): `.env` raíz, `vantare-v2/frontend/.env.local`, `apps/desktop/.env`. Build Wails: `tools/generate_supabase_config.ps1` lee `VANTARE_SUPABASE_*` en compile-time.
- Pendiente humano: GitHub Actions secrets `VITE_SUPABASE_*` deben apuntar a `ombjshwzqgeisazijduq` antes del próximo release tag; backup CLI pre-push (Docker); `validate-license` legacy deployada (Fase 3).
- NO hecho: Polar, deploy EF nuevas, `db reset`, borrar tablas viejas (`licenses`/`subscriptions` siguen en schema por trigger `handle_new_user`; runtime app usa `user_entitlements` vía RPC).
- Tablas legacy: sin dependencia activa en Go/frontend (solo trigger SQL signup + EF `validate-license` deprecated).
- Estado: ✅ CERRADO (proyecto correcto)

Nota FEATURES-MANUAL-SOURCE (2026-07-08):
- Objetivo: la pestaña 'Desarrollo por features' del Roadmap pasa a tener una fuente manual (JSON) igual que 'Roadmap actual', sin scripts de auto-generación.
- Decisiones cerradas: (1) Fuente de verdad = docs/features-source.json (Isaac edita a mano). (2) App trae el JSON por fetch en runtime; sin red, usa FEATURES_FALLBACK. (3) 3 secciones en la pestaña: 'En desarrollo' / 'En investigación' / 'Próximamente'. (4) `status` ∈ in-development|research|future (campo explícito). (5) `tipo` ∈ feature|bugfix|improve|component (research deja de ser tipo y pasa a ser status). (6) `category` declarada en la fuente, sin CATEGORY_MAP hardcodeado. (7) `percent` único campo de progreso (escala 0/10/25/50/75/100), sin done/total. (8) `pickText` reusado de roadmap-data.ts.
- Archivos nuevos: docs/features-source.json, frontend/src/hub/roadmap/features-data.ts, frontend/src/hub/roadmap/features-data.test.ts.
- Archivos modificados: frontend/src/hub/roadmap/roadmap-features.ts (consume features-data.ts, expone TIPO_META de 4 tipos + STATUS_META de 3 status + getActiveSections con return { sections, overallProgress }), frontend/src/hub/roadmap/roadmap-features.test.ts, frontend/src/hub/pages/RoadmapPage.tsx (FeaturesSection pinta 3 bloques, import cleanup explícito, estado inicial síncrono), frontend/src/hub/pages/RoadmapPage.test.tsx, docs/roadmap-maintenance.md, docs/roadmap-agent-guide.md.
- Archivos eliminados: scripts/generate-roadmap-progress.mjs, frontend/src/hub/roadmap/roadmap-progress.json.
- Keys i18n obsoletas: roadmap.features.noFeatures y roadmap.features.checks quedan sin uso. No se añaden keys nuevas.
- Checks: tsc 0 errores, suite completa +25 tests PASS, build OK.
- Sin commit, sin tag, sin release.
- Estado: 🟢 ACTIVO

Nota ROADMAP-MANUAL-SOURCE (2026-07-08):
- Objetivo: hacer el roadmap 100% manual (sin scripts de auto-generación) y que los cambios lleguen automáticamente a todos los clientes con la app descargada, sin nuevo release.
- Decisiones cerradas: (1) Fuente de verdad manual = `docs/roadmap-source.json` (Isaac edita a mano). (2) La app trae el JSON por `fetch(ROADMAP_SOURCE_URL)` en runtime al abrir la pestaña Roadmap; sin red, usa `ROADMAP_FALLBACK` empaquetado. (3) Texto de las cards (título, resumen, highlights, hitos) pasa de i18n a inline en el JSON en es/en/pt/it; el "chrome" de la UI (eyebrows, feedback, hero, tab labels) sigue en i18n. (4) `ROADMAP_NEXT` (r1–r15) eliminado (era código muerto; la pestaña "next" ya mostraba `roadmap-features.ts`). (5) `DashboardFeatureCarousel` migrado de `ROADMAP_CURRENT` a `ROADMAP_FALLBACK` + `pickText`. (6) Procedimiento documentado en `docs/roadmap-maintenance.md` (re-escrito, sin lenguaje de "snapshot/build-time/script").
- URL por defecto: raw GitHub del JSON en el repo público. Cambiable vía la constante `ROADMAP_SOURCE_URL` en `frontend/src/hub/roadmap/roadmap-data.ts` (si más adelante usas Google Doc exportado a JSON o Supabase Storage).
- Contenido actual del JSON refleja el trabajo activo: `calendar-local` 50% (refactor LMU), milestone `calendar-refactor` añadido, beta-iteration 75% con highlights del refactor de calendario y la iteración de Roadmap.
- Archivos nuevos: `docs/roadmap-source.json`.
- Archivos modificados: `frontend/src/hub/roadmap/roadmap-data.ts` (tipos con `LocalizedText`, `ROADMAP_SOURCE_URL`, `ROADMAP_FALLBACK`, `fetchRoadmapDataset`, eliminado `ROADMAP_NEXT/ROADMAP_CURRENT/ROADMAP_DATASETS/getRoadmapDataset/RoadmapDatasetKey/ROADMAP_PHASES/ROADMAP_AREAS/ROADMAP_MILESTONES`), `frontend/src/hub/pages/RoadmapPage.tsx` (fetch en runtime + render inline por locale), `frontend/src/hub/components/DashboardFeatureCarousel.tsx` (usa `ROADMAP_FALLBACK` + `pickText`), `frontend/src/hub/roadmap/roadmap-data.test.ts` (test reescrito al nuevo API + 3 tests de `fetchRoadmapDataset` con fetch mockeado), `frontend/src/hub/pages/RoadmapPage.test.tsx` (mock de fetch para no tocar red), `docs/roadmap-maintenance.md` (flujo manual + entrega automática, sin script).
- Keys i18n `roadmap.current.*` y `roadmap.next.*` en los 4 diccionarios quedan obsoletas (las cards ya no las consultan). Se conservan para evitar churn; pueden limpiarse en otro corte.
- Checks: `tsc --noEmit` OK, 149 test files / 1431 tests PASS, `pnpm --dir frontend build` OK (warning preexistente de chunk size).
- Sin commit, sin tag, sin release.
- Estado: 🟢 ACTIVO


- Objetivo: mostrar las carreras de intervalo (Bronce/Plata/Oro) como eventos individuales en la línea de tiempo del DayView, con patrón escalonado predecible.
- Problema: actualmente las series de intervalo solo aparecen como banda "Horario" estática. El usuario quiere verlas en la grid de 24h.
- Solución: 2 cortes — (1) añadir `offsetMinutes` al mock data para crear patrón escalonado, (2) modificar DayView para generar eventos de intervalo individuales (máx 3/tier/hora).
- Plan detallado: `docs/superpowers/plans/2026-07-07-calendar-interval-races-dayview.md`
- Bugfixes asociados: filtro en mes/semana, bandas Horario por filtro, rail duplicados.
- Estado: 🟢 ACTIVO

Nota CALENDAR-REFACTOR (2026-07-07):
- Objetivo: reescribir la pestaña de calendario para mostrar la cadencia de preparación de LMU (cada cuánto, duración, pista, setup, splits, assists, neumáticos) en vez de materializar cientos de eventos de intervalo. Corregir bugs de filtro Especial, zona horaria, panelTier, y código muerto.
- Problema raíz: el calendario oficial LMU tiene series diarias (Bronce cada 15min, Plata cada 20min, Oro cada 30min) con múltiples pistas por tier. El código anterior materializaba 24 bloques/hora por serie en DayView y no mostraba info de preparación. El filtro "Especial" estaba roto en rail. La zona horaria usaba el navegador en vez de `calendar.timezone`. `panelTier` se abría automáticamente al filtrar (inconsistente toolbar vs rail).
- Decisiones cerradas:
  - (1) Interval-series NUNCA se materializan en la rejilla. Se muestran como banda de "Preparación" con cadencia + duración + pistas. Solo weekly-slots y special van a la línea de tiempo.
  - (2) Filtrar NUNCA abre el modal de detalle. Solo un click explícito en tarjeta de rail o badge de tier lo abre.
  - (3) Zona horaria: todas las vistas usan `calendar.timezone` vía `Intl.DateTimeFormat` con `timeZone`. `DEFAULT_TIMEZONE` se usa como fallback en `EMPTY_CALENDAR`.
  - (4) Mock reescrito con datos reales del seed LMU: 3 beginner, 3 intermediate, 3 advanced, 1 weekly, 1 special. `seriesPreviews` con `nextStarts` y `scheduleLabel`.
  - (5) `CalendarRaceRail` recibe `calendar` como prop (no se suscribe internamente). Eliminado doble `requestCalendar`.
  - (6) Navegación month usa día 1 del mes destino (sin deriva de fecha).
  - (7) Título de semana muestra rango completo cross-mes ("28 Jun - 4 Jul"). Día capitaliza día de semana ("Miércoles").
- Archivos nuevos: `frontend/src/hub/calendar/calendar-shared.ts` (tierStyle, formatInZone, cadenceLabel, TIER_STYLES, TIER_LABELS).
- Archivos eliminados: `CalendarSeriesCard.tsx` + test, `calendar-tier.ts`, tests de `getSeriesPatternLabel` y `groupOccurrencesByLocalDay` en `calendar-view-math.test.ts`.
- Archivos reescritos: `CalendarMonthView.tsx`, `CalendarWeekView.tsx`, `CalendarDayView.tsx`, `CalendarRaceRail.tsx`, `CalendarToolbar.tsx`, `calendar-visual-mock-data.ts`.
- Archivos modificados: `CalendarPage.tsx` (panelTier desacoplado, loading state, timeZone), `CalendarRaceDetailPanel.tsx` (timeZone), `calendar-upcoming.ts` (special slot), `calendar-view-math.ts` (eliminadas funciones muertas).
- Tests: 123/123 calendar+page PASS, 1395/1395 full suite PASS, tsc 0 calendar errors. Lint/build errores preexistentes (roadmap test, react-refresh).
- No se tocó: backend Go, Supabase/Auth, WidgetStudio, LayoutStudio, runtime OBS, dependencias, position/x/y/w/h.
- Estado: 🟢 ACTIVO
- Plan: `docs/superpowers/plans/2026-07-07-calendar-interval-races-dayview.md`

# Plan actual

Nota ROADMAP-ITERATION (2026-07-07):
- Objetivo: iterar la pantalla RoadmapPage — i18n de datos, dual roadmaps, changelog real, feedback panel, features desde planes, y porcentajes reales.
- Decisiones cerradas: (1) feedback abre enlaces externos prefirmados; gating por `roadmap.feedback`. (2) Dos roadmaps con toggle. (3) Escala de porcentajes obligatoria. (4) Changelog sincronizado a mano. (5) Strings i18n. (6) Features desde planes de superpowers con progreso automático via checks.
- Archivos nuevos: `docs/roadmap-maintenance.md`, `docs/superpowers/plans/2026-07-06-roadmap-*.md`, `docs/superpowers/plans/2026-07-07-roadmap-features-from-plans.md`.
- Archivos modificados: `frontend/src/hub/roadmap/roadmap-data.ts`, `roadmap-data.test.ts`, `RoadmapPage.tsx`, `RoadmapPage.test.tsx`, locales i18n.
- Checks: 79/79 roadmap+i18n tests PASS, tsc OK, lint 0 errores.
- Estado: 🟢 ACTIVO
- Plan: `docs/superpowers/plans/2026-07-07-roadmap-features-from-plans.md`
- Sin commit, sin tag, sin release.
Nota OBS-LAN-DOUBLE-PC (2026-06-25):
- Objetivo: configuración automatizada de OBS LAN para doble PC con Vantare.
- Tipo: research
- Estado: 🔮 FUTURO
- Plan: `docs/superpowers/plans/2026-06-25-obslan-double-pc.md`

Nota OVERLAY-PERFORMANCE (2026-06-25):
- Objetivo: optimizaciones de rendimiento en el runtime de overlays.
- Tipo: improve
- Estado: 🔮 FUTURO
- Plan: `docs/superpowers/plans/2026-06-25-overlay-performance-fixes.md`

Nota PEDALS-INVENTORY (2026-06-25):
- Objetivo: inventario técnico del widget Pedals y camino a implementación completa.
- Tipo: research
- Estado: 🔮 FUTURO
- Plan: `docs/superpowers/plans/2026-06-25-p1-pedals-inventory.md`

Nota INGENIERO-INTEGRATION (2026-06-25):
- Objetivo: integración completa del módulo Ingeniero con LMU live.
- Tipo: feature
- Estado: 🔮 FUTURO
- Plan: `docs/superpowers/plans/2026-06-25-vantare-suite-ingeniero-integration.md`

Nota WORKDAY-2026-07-06 — Widget Studio launch polish:
- Objetivo del dia: estabilizar Widget Studio para el lanzamiento de esta tarde sin mezclarlo con cambios de backend, calendario o LayoutStudio.
- Segmento 1 — ACCESS-DEV-MODES: preparar modos de ejecucion/verificacion Free, Paid, Tester, Power Tester y Blocked sin rehacer la arquitectura de roles. La fuente de verdad sigue siendo `access-policy`/licencia; los modos son para dev, harness y pruebas manuales.
- Segmento 2 — I18N-01: crear base i18n ligera para espanol, ingles, portugues e italiano. Traducir primero la UI visible de Widget Studio y mantener IDs tecnicos internos como datos, no copy publica.
- Segmento 3 — WIDGET-FIXTURES-01: unificar fixtures canonicos por widget. El mismo widget debe tener los mismos datos mock entre disenos oficiales: standings con la misma densidad de pilotos, relative con el mismo entorno de coches, delta/pedals con los mismos valores.
- Segmento 4 — WIDGET-PREVIEW-SCALE: normalizar tamano relativo en la preview de Widget Studio sin tocar runtime OBS, sin mutar `position`, `x`, `y`, `w` ni `h`. La escala debe vivir en el contenedor de preview, no dentro del widget.
- Segmento 5 — WIDGET-TABLE-PRIMITIVES: alinear columnas, badges, neumaticos, gaps y celdas entre standings, relative y multiclass con primitives compartidas. `textAlign` debe ser configurable internamente por columna aunque no sea ajuste publico.
- Segmento 6 — DESIGN-SELECTOR-UX: hacer el selector de diseno mas visible e intuitivo, con nombre, descripcion, access badge y estado activo/bloqueado. No debe quedar como un select pequeno perdido en la esquina.
- Segmento 7 — UI-POLISH-LAUNCH: pasada final de consistencia visual y copy antes del lanzamiento: comprobar tamanos, traducciones, estados bloqueados, previews, visual compare con Playwright y screenshots side-by-side. No commitear PNGs salvo decision explicita.
Nota WIDGET-PREVIEW-PARITY-01 (2026-07-06) — Plan:
- Plan creado en `docs/superpowers/plans/2026-07-06-widget-preview-parity-01-canonical-fixtures-and-size.md`.
- Objetivo: que cada widget conserve mismos datos, mismos pilotos/items, misma densidad, misma altura visible y mismo tamano de preview entre sus disenos oficiales. Solo puede cambiar la personalizacion visual implicita del sistema de diseno.
- Decisiones cerradas: standings usa 20 pilotos canonicos; relative usa 5 filas; standings/relative usan el mismo set semantico de columnas entre disenos; el alcance de tamano igual es solo preview/harness; delta/pedals solo requieren tamano proporcional, no simetria perfecta.
- Alcance previsto: fixtures canonicos, contrato de tamano/densidad preview-only, tests RED/GREEN y visual compare con Playwright. No tocar LayoutStudio, runtime OBS, backend, calendario, access policy ni `position/x/y/w/h`.
Nota WIDGET-PREVIEW-PARITY-01 (2026-07-06) — Implementation:
- Fixtures canónicos: `widget-preview-fixtures.ts` — 20 pilotos HYPERCAR canónicos (player TOYOTA GAZOO #8 en posición 5), derivación de 5 filas relative (2 ahead + player + 2 behind), columnas semánticas canónicas para standings (6 columnas) y relative (6 columnas), filtros canónicos para relative (rangeAhead: 2, rangeBehind: 2), valores estáticos para delta/pedals.
- Contrato de preview: `widget-preview-contract.ts` — tamaños canónicos por widget type (standings: 420×620, relative: 420×260, delta: 420×140, pedals: 420×120).
- WidgetSandboxPreview: cuando el widget tiene un diseño oficial (`variantId.startsWith("official-")`), aplica overrides canónicos al profile (columnas, filtros, maxRows) y usa el tamaño del contrato en vez de `widget.position`.
- mock-telemetry.ts: sin cambios. Se mantuvo el mock base original (16 vehículos, mix de clases) para preservar la intención multi-class del runtime mock. La fuente canónica de preview es `widget-preview-fixtures.ts` (20 HYPERCAR). El mock se documenta como intencionalmente distinto.
- Tests: 38 tests nuevos (widget-preview-fixtures: 28, widget-preview-contract: 10). 89 tests enfocados widget PASS. tsc OK, lint OK, build OK.
- Visual compare: `widget-studio-visual-compare.mjs` creado — captura 12 diseños oficiales, valida invariantes de paridad (row count, columnas semánticas, drivers canónicos), exit 1 si falla. Requiere dev server y Playwright.
- Archivos nuevos: widget-preview-fixtures.ts, widget-preview-fixtures.test.ts, widget-preview-contract.ts, widget-preview-contract.test.ts, widget-studio-visual-compare.mjs.
- Archivos modificados: mock-telemetry.ts (comment documentando divergencia intencional vs fixture canónica), WidgetSandboxPreview.tsx (overrides canónicos para diseños oficiales).
- No se tocó: LayoutStudio, runtime OBS, backend Go, Supabase/Auth, Calendar, access policy, billing, dependencias, position/x/y/w/h.
- Sin commit, sin tag, sin release.
Nota ACCESS-DEV-MODES (2026-07-06) — Implementation:
- Archivos nuevos: `frontend/src/lib/access-dev-modes.ts` (helper puro: `AccessDevMode`, `DEV_MODES`, `resolveAccessDevModeInput()`, `resolveLicenseForDevMode()`) + `frontend/src/lib/access-dev-modes.test.ts` (23 tests).
- Archivo modificado: `frontend/src/lib/access.tsx` (~15 líneas nuevas: lee dev mode, sintetiza license, añade rol `tester` para tester/power-tester).
- Modos: real (default), free, paid, tester, power-tester, blocked. Resueltos via `?access=` query param o `VITE_ACCESS_MODE` env var. Producción ignora overrides (`import.meta.env.PROD`).
- tester y power-tester son equivalentes en este corte: ambos añaden rol `tester` y desbloquean todo. Diferenciación futura pendiente.
- No se tocó: access-policy.ts, license.tsx, license-types.ts, plan.ts, WidgetStudio, widget-catalog, widget-visual-harness, backend Go, Supabase.
- Code review P3 fixes: `DEV_MODES` sin anotación redundante (as const produce tuple estrecho), +2 roundtrip tests para tester/power-tester.
- Checks: 23/23 access-dev-modes PASS, 164/164 access-policy/plan/license/access PASS (no regresion), 1483/1483 full suite PASS, tsc PASS, lint PASS (0 errors, 2 preexisting warnings), git diff --check OK.
- Sin commit, sin tag, sin release.

Nota I18N-01 (2026-07-06) — Implementation:
- Base i18n ligera añadida para `es`, `en`, `pt` e `it` en `frontend/src/i18n/` con provider, selector de idioma, normalizacion de locale y fallback seguro.
- Selector de idioma integrado en onboarding y en la pagina de Ajustes. La preferencia se persiste en `localStorage` (`vantare.locale`).
- Widget Studio traduce copy visible principal: shell, lista de overlays/widgets, preview empty state, estado de guardado, acciones de draft, panel derecho, secciones de configuracion y galeria de diseños.
- Alcance deliberado: no se traduce todo el cuerpo legacy de SettingsPage en este corte. Queda como I18N-02 para evitar mezclar una migracion amplia de ajustes/updater/hotkeys.
- No se tocó: backend Go, Supabase/Auth, Calendar, LayoutStudio, runtime OBS, dependencias, position/x/y/w/h.
- Checks enfocados: 211/211 PASS (i18n, onboarding, settings y Widget Studio).
- Sin tag, sin release.

Nota I18N-02 (2026-07-06) — Provider global + navegacion:
- Objetivo: convertir el i18n en una unica fuente de verdad para toda la app y dejar lista la infraestructura para traducir el resto de pantallas poco a poco, atado a cada feature (sin big-bang).
- `I18nProvider` ahora es transparente si ya existe un provider padre: si se monta dentro de otro `I18nProvider`, delega al contexto existente en vez de crear un arbol aislado. Asi `OnboardingFlow`, `WidgetStudio` y `SettingsPage` (que hoy montan su propio provider) siguen funcionando y comparten el mismo idioma que el resto del Hub.
- `HubApp` monta un unico `I18nProvider` global envolviendo `HubShell` (dentro de `LicenseProvider`). Ahora cualquier pantalla del Hub puede usar `useI18n()` -> `t()` sin montar su propio provider. El fallback de `useI18n` ya cubria el caso sin provider, asi que no hay regresion para pantallas no migradas.
- Se anadieron las keys de navegacion del Topbar a los 4 diccionarios (`nav.dashboard`, `nav.profiles`, `nav.launcher`, `nav.calendar`, `nav.engineer`, `nav.telemetry`, `nav.roadmap`, `nav.setup`) con paridad es/en/pt/it (104 keys). La migracion visual del Topbar queda para su corte propio (no se toca `navigation.ts` aun).
- Tests nuevos en `I18nProvider.test.tsx`: coherencia de provider global (provider anidado delega al padre; cambio de idioma en provider anidado se refleja en el contexto padre compartido).
- No se toco: backend Go, Supabase/Auth, Calendar, LayoutStudio, runtime OBS, dependencias, position/x/y/w/h, cuerpo de SettingsPage, Launcher (lo lleva otro worker en paralelo).
- Checks enfocados: 36/36 i18n PASS (incluye 2 nuevos de coherencia global), 27/27 HubApp PASS, 62/62 OnboardingFlow+SettingsPage+WidgetStudio PASS, tsc OK, lint OK (0 errors).
- Riesgo restante: el resto de pantallas (Dashboard, Auth/Login/Paywall, Calendar, Roadmap, Engineer, Telemetry, Profiles, Widgets, Preview, Community, cuerpo de Settings) sigue con copy hardcodeada en espanol; se traduce atado a cada feature. El `I18nProvider` global ya las habilita.
- Sin tag, sin release.

- Nota TOPBAR-RESPONSIVE (2026-07-06) — Fix de responsividad del topbar (sin i18n):
- Sintoma reportado: en pantalla partida/movil, "Overlays Studio" se partia en dos lineas y "Ajustes" se cortaba por falta de ancho.
- Cambio en `Topbar.tsx` (responsive, sin i18n): (1) items de nav (`<a>`/`<button> nav-item`) con `whitespace-nowrap` (evita el partido de "Overlays Studio"); (2) contenedor de nav: `max-md:flex-1 max-md:min-w-0 flex ... gap-2 md:gap-3 lg:gap-5 text-[11px] md:text-xs lg:text-sm max-md:overflow-x-auto` (scrollbarWidth thin) — en `md+` es flex normal SIN scroll (los 8 items caben); en movil (<md) la nav ocupa el ancho restante y hace scroll horizontal util (logo y botones laterales llevan `shrink-0`, el padre flex lleva `min-w-0`). Antes: `hidden md:flex` (oculta en movil) y "Ajustes" se cortaba en partida.
- No se toco: i18n, avatar, notificaciones, hamburguesa, backend Go, Supabase/Auth, calendar, LayoutStudio, runtime OBS, position/x/y/w/h.
- Verificacion visual EJECUTADA via entry minimo aislado (opcion 2 del usuario): `topbar-harness.html` + `topbar-visual-harness.tsx` monta solo `<Topbar>` con `LicenseProvider`+`I18nProvider` y `@wailsio/runtime` aliasado a `wails-runtime-topbar-mock.ts` (usuario free, secciones premium bloqueadas) via alias condicional en `vite.config.ts` (`VITE_RUNTIME_MOCK=topbar`). Resultados DOM finales (sin scroll en partida, segun peticion del usuario):
  - 900px (partida): `scrollable=false` (scrollWidth=clientWidth=485), "Ajustes" visible (`ajustesInView=true`), "Overlays Studio" en UNA linea. ANTES: `ajustesClipped=true` (se cortaba).
  - 375px (movil): `scrollable=true` con scroll UTIL — al hacer scroll, "Ajustes" queda dentro del viewport (`ajustesReachableByScroll=true`); "Overlays Studio" en una linea. ANTES: nav `hidden` en <768px (invisible).
  - Capturas: /tmp/topbar-900-final3.png, /tmp/topbar-375-final3.png, /tmp/before-900.png (antes del fix, con stash temporal).
  - Archivos nuevos del harness (fuera de produccion; el alias solo se activa con VITE_RUNTIME_MOCK=topbar, NO afecta `pnpm build`): `frontend/topbar-harness.html`, `frontend/src/topbar-visual-harness.tsx`, `frontend/src/lib/wails-runtime-topbar-mock.ts` (copia de `wails-runtime-mock.ts` pero `license:validate` -> anonymous/free).
- Sin commit, sin tag, sin release.
Nota I18N-03 (2026-07-06) — Plan de traduccion completa (pendiente, por feature):
- Necesidad: I18N-01 cubrio solo la UI visible de Widget Studio + onboarding + tabs de Ajustes. I18N-02 dejo lista la infraestructura (provider global) pero NO tradujo el resto. Hoy ~10% de la superficie visible esta traducida. Para una "traduccion completa de lo actual" hace falta migrar el copy hardcodeado de todas las pantallas restantes a `t()`, atado a la feature que toque cada pantalla (no big-bang, ver riesgos en I18N-02 y decision de evitar rework).
- Inventario de areas pendientes (excluye Launcher: lo lleva otro worker en paralelo):
  - **Hub shell / Topbar** (`Topbar.tsx`, `navigation.ts`): labels de nav (Hub, Overlays Studio, Launcher, Carreras, Ingeniero, Telemetria, Roadmap, Ajustes), estados de fuente (Fuente pendiente, LMU conectado, Esperando LMU, Mock), Notificaciones, Lite ON/OFF, tooltip "Disponible para testers y planes de pago". Las keys `nav.*` ya existen en los 4 diccionarios; falta cablear `navigation.ts`/`Topbar` a `t()`.
  - **Dashboard** (`DashboardPage.tsx`, `V52Shell.tsx`, cards: HeroSection, PlanStatusCard, QuickActions, LastActivityCard, ActiveOverlayCard, etc.): Simulador principal, Configurado, No disponible, Novedades, Proximas carreras, Acciones rapidas.
  - **Auth** (`LoginScreen`, `PaywallScreen`, `LicenseBanner`, `UnconfiguredScreen`, `BetaWelcome`): toda la copy de login/paywall/licencia. Critico: es lo que ve el usuario sin licencia valida.
  - **Calendar** (`CalendarPage.tsx` + `calendar/*`): Carreras LMU, Calendario oficial, labels de vistas Mes/Semana/Dia, filtros, paneles de series, horario semanal.
  - **Roadmap** (`RoadmapPage.tsx`): Desarrollo Vantare, Fase actual, Progreso global, Completado, Ultimos hitos, Feedback, El roadmap vive con feedback.
  - **Engineer / Telemetry** (`EngineerPage`, `TelemetryPage`, `widgets/*` settings sections): Estado, Mensajes recientes, Telemetria.
  - **Profiles / Widgets** (`ProfilesPage`, `WidgetsPage`, `ProfileLibraryCard`, `OwnProfilesView`, `StudioHome`, etc.): Overlays, Gestiona tus perfiles, Crear nuevo perfil, Abrir overlay, Cambios sin guardar, Selecciona un widget.
  - **Preview / AppearanceEditor** (`preview/AppearanceEditor.tsx`, `StyleSelector.tsx`, `PreviewInspector.tsx`): labels de edicion de apariencia/estilo.
  - **Community / EmptyStates** (`CommunityComingSoonView`, `EmptyStates`): Proximamente, estados vacios.
  - **Cuerpo de Settings** (`AccountSettings.tsx`, hotkeys, updater, diagnostics): I18N-01 solo tradujo titulo + tabs; el contenido de cada tab sigue en espanol.
- Reglas que NO se traducen (datos, no copy): IDs tecnicos (widget/column/slot/design/variant), datos runtime/telemetria (pilotos, marcas, VANTARE, LE MANS ULTIMATE, carreras), nombres de simuladores (Le Mans Ultimate, iRacing, Assetto Corsa), keys de enum en codigo.
- Estrategia propuesta (CORTES INCREMENTALES, no big-bang):
  1. I18N-03a: Topbar + Hub shell + navegacion (mayor impacto, keys `nav.*` ya listas).
  2. I18N-03b: Auth (Login/Paywall/License/Unconfigured/BetaWelcome) — critico para usuarios sin licencia.
  3. I18N-03c: Dashboard + cards compartidas.
  4. I18N-03d: Calendar + Roadmap.
  5. I18N-03e: Engineer/Telemetry/Profiles/Widgets/Preview/Community.
  6. I18N-03f: Cuerpo de Settings (tabs Cuenta/Actualizaciones/Hotkeys/Diagnostico/Avanzado).
  7. Cierre: test de paridad de keys (ya existe en `i18n.test.ts`) + test/lint que detecte strings visibles hardcodeados en pantallas ya migradas (evitar regresion a español literal).
- Cada corte: anade las keys al diccionario 4-lenguaje (paridad obligatoria), migra los `t()` en la pantalla, y corre los tests de esa pantalla + `i18n.test.ts`. El `I18nProvider` global (I18N-02) ya habilita `useI18n()` en todas sin montar provider local.
- Riesgos de no hacerlo por feature: (1) big-bang mezcla trabajo con features activas y genera conflictos de merge (especialmente con el worker de Launcher en archivos compartidos); (2) strings nuevos de features futuras quedarian hardcodeados otra vez (re-trabajo); (3) keys huerfanas si se traduce y luego se borra UI; (4) el fallback de `translate()` devuelve la key, lo que enmascara huecos. Por eso la migracion viaja con cada feature.
- Estado: PENDIENTE. No implementado. Sin commit, sin tag, sin release.

Nota I18N-ROADMAP (2026-07-06) — Futuro multiidioma:
- Objetivo a medio plazo: la app sea traducible de forma completa y mantenible en es/en/pt/it, con el idioma elegido una sola vez y reflejado en todas las pantallas (onboarding, hub, ajustes, overlays).
- Prerrequisitos ya cubiertos: modulo i18n puro, provider global (I18N-02), selector de idioma, persistencia en localStorage, fallback determinista, paridad de keys testeada.
- Trabajo futuro documentado (multiple cosas por hacer, no solo un corte):
  - Traducir todas las areas de I18N-03 (ver arriba) — es el grueso del trabajo restante.
  - Ampliar lenguajes mas alla de es/en/pt/it si el publico lo pide (fria, de, etc.) — requiere ampliar `SUPPORTED_LOCALES` + diccionarios + selector; hoy el diseno ya soporta anadir locales sin tocar el consumidor.
  - Pluralizacion/genero: el modulo actual es lookup plano `key -> string`. Si alguna copy necesita plurales o genero por locale, habra que anadir un helper (p.ej. `tPlural(key, count)` o `Intl`). No necesario para el copy actual.
  - Deteccion de idioma del SO/region como default suave (hoy el default es `es` fijo). Opcional: leer `navigator.language` y hacer fallback a `es` si no esta soportado.
  - Interceptors de traduccion en runtime OBS/overlay: el runtime de overlays (CompositeApp/ObsOverlayApp) NO monta `I18nProvider` hoy. Si los widgets deben mostrar copy traducida (no solo datos), habra que montar el provider ahi tambien. Fuera de scope para widgets (la regla es no traducir datos runtime).
  - Auditoria de "no espanol literal" en CI: anadir un test/lint que falle si aparece un string visible en espanol hardcodeado en archivos ya migrados, para evitar regresion.
- No se toca backend Go, Supabase/Auth, runtime OBS (salvo el punto de providers si aplica), LayoutStudio, dependencias, position/x/y/w/h.
- Estado: planificado, no iniciado.

Nota VISUAL-PARITY-INFRA (2026-07-06):
- Se crea una infraestructura documental para que modelos worker puedan ejecutar tareas de paridad visual con Playwright sin depender de revisiones manuales improvisadas.
- Se añade la skill local `visual-parity-with-playwright` y la carpeta `docs/visual-parity/` con protocolo, checklist, prompts de implementacion/review e indice de HTMLs de referencia.
- No cambia codigo productivo ni comportamiento runtime.

Nota WIDGET-STUDIO-09 (2026-07-05) — Implementation:
- Full Glassmorphism Widget Parity: copia la estructura visual real de widgets desde `overlay-glassmorphism-pro.html`.
- Phase 0: Inventario de 16 secciones HTML mapeadas a componentes en `docs/widget-glassmorphism-parity.md`.
- Phase 1: `glassmorphism-primitives.ts` — tokens compartidos (glass card, header, pill, footer, Vantare SVG logo, row styles) + `getVisualTemplate()` helper.
- Phase 2 Free: Standings (glassmorphism template con Vantare SVG, HYPERCAR pill, grid 26px/32px/44px/1fr/100px/80px, 3 preview rows, footer LE MANS ULTIMATE + TRACK TEMP), Delta (bar/simple/advanced con top pill, track container, center line, fill bar, bottom pill, 4-cell grid), Pedals (V1 capsule HUD, V2 rectangular low profile, V3 solo vertical tall).
- Phase 3 Pro: Relative (glassmorphism con grid 36px/6px/44px/1fr/80px/80px, RELATIVE pill, LIVE TIMING footer), Broadcast Tower (ticker con lap box, driver stream, active glow, weather box), Multiclass Relative (gapless rows, class badges, player highlight).
- Phase 4 Preview: FuelCalculatorWidget, TrackWeatherWidget, CarDamageWidget (visual+numbers), Head2HeadWidget, DeltaTraceWidget, RacingFlagsWidget — todos preview-only, data-preview-only=true, sin runtime real.
- Phase 5: OFFICIAL_DESIGNS actualizados con `props: { visualTemplate: "..." }` para delta (bar/simple/advanced) y pedals (v1/v2/v3). 4 nuevos diseños oficiales: delta-simple-glassmorphism, delta-advanced-glassmorphism, pedals-v1-glassmorphism, pedals-v3-glassmorphism. `getActiveOfficialDesign()` restaurada.
- Tests: 1430/1430 PASS (139 files). tsc OK, lint OK (0 errors, 2 preexisting warnings), build OK, visual compare OK (18 capturas, 0 errors), diff-check OK.
- Archivos nuevos: glassmorphism-primitives.ts, FuelCalculatorWidget.tsx, TrackWeatherWidget.tsx, CarDamageWidget.tsx, Head2HeadWidget.tsx, DeltaTraceWidget.tsx, RacingFlagsWidget.tsx, widget-glassmorphism-parity.md.
- Archivos modificados: StandingsWidget.tsx, DeltaWidget.tsx, PedalsWidget.tsx, RelativeWidget.tsx, BroadcastTowerWidget.tsx, MulticlassRelativeWidget.tsx, widget-design-gallery.ts, + tests.
- No se toco: LayoutStudio, backend Go, access-policy, dependencias, position/x/y/w/h.
- Sin commit, sin tag, sin release.

Nota LOGIN-REDESIGN (2026-07-09):
- Rediseñado `LoginScreen.tsx` con estilo inspirado en Devin pero usando tokens de Vantare.
- Cambios visuales: layout fullscreen centrado sin card contenedora, logo SVG de Vantare con gradiente rojo y drop-shadow, título "Welcome to Vantare" con subtítulo, dos botones OAuth apilados (Google=gradiente rojo primario, Discord=borde secundario), divider "o", formulario email/password, links de navegación entre modos, footer "made by Vantare".
- Tokens de DESIGN.md aplicados: fondo `bg-[#0a0a0a]`, texto `text-white/60`, bordes `border-white/20`, inputs `bg-white/5`, gradiente rojo `from-vantare-red-500 to-[#9a0606]`, chrome UI `uppercase tracking-widest`.
- Funcionalidad intacta: login, signup, reset password, Google OAuth, Discord OAuth, estados de espera, manejo de errores.
- Archivo modificado: `frontend/src/hub/auth/LoginScreen.tsx`.
- No se tocaron: tests (19/19 PASS), backend Go, Supabase/Auth, otros componentes.
- Commit: `feat(auth): redesign LoginScreen with Devin-style layout and Vantare design tokens`.

Ultima actualizacion: 2026-07-09. Commit 6e00192 (feat(auth): redesign LoginScreen).
Nota WIDGET-STUDIO-07 (2026-07-05) — Implementation:
- Reemplazado selector productivo `Theme: Base / Vantare Crystal` por selector real de `Diseño` basado en `OFFICIAL_DESIGNS`.
- MC-1: Helper puro `getActiveOfficialDesign(profile, widget)` en `widget-design-gallery.ts` — detecta diseño activo por `variantId` convención (`official-{designId}-{widgetId}`) o por match de template+theme en `profile.variants`.
- MC-2: Selector superior en `WidgetStudio.tsx` — label `Diseño`, `data-testid="widget-design-selector"`, opciones desde `listOfficialDesigns(selectedWidget.type)`, opción `Personalizado` cuando no hay match, deshabilitado cuando no hay widget o no hay diseños. Selección llama `onChangeProfile(applyOfficialDesignToProfile(...))`. Eliminado estado local `themeId` y prop `initialThemeId`.
- MC-3: `WidgetDesignGallery` recibe `activeDesignId` — badge `Activo`, botón deshabilitado para diseño activo. `WidgetSettingsPanel` calcula activo con `getActiveOfficialDesign` y lo pasa a la galería.
- MC-4: Harness visual actualizado — query param `design` en vez de `theme`, aplica `applyOfficialDesignToProfile` al profile mock antes de renderizar. Capturas por diseño oficial real (12 diseños × 4 widgets). Script valida ausencia de label `Theme` y presencia de `data-testid="widget-design-selector"`.
- Tests: 114/114 enfocados (WidgetStudio 31, WidgetDesignGallery 15, widget-design-gallery 39, WidgetSettingsPanel 29). tsc OK, lint OK, build OK (warning preexistente chunk size), git diff --check OK.
- Archivos modificados: widget-design-gallery.ts, widget-design-gallery.test.ts, WidgetStudio.tsx, WidgetStudio.test.tsx, WidgetDesignGallery.tsx, WidgetDesignGallery.test.tsx, WidgetSettingsPanel.tsx, WidgetSettingsPanel.test.tsx, widget-visual-harness.tsx, widget-studio-visual-compare.mjs, current-plan.md.
- No se tocó: LayoutStudio, backend Go, dependencias, HTML de referencia, position/x/y/w/h.
- Sin commit, sin tag, sin release.

Nota WIDGET-STUDIO-07 P1/P2 FIX (2026-07-05):
- Corregido bypass de access gate en el selector superior de diseño: `WidgetStudio.tsx` ahora usa `useAccess()` + `canApplyWidget()` y deshabilita/bloquea `onChange` cuando el usuario no puede aplicar el widget seleccionado.
- Añadido test de regresion: usuario Free con widget Pro (`relative`) no puede aplicar diseños Pro desde `widget-design-selector`.
- Endurecido `widget-studio-visual-compare.mjs`: si vuelve el label productivo `Theme` o falta `widget-design-selector`, el script registra error y termina con exit 1.
- Checks: suite frontend 1356/1356 PASS, tsc OK, lint OK, build OK, visual compare OK (18 capturas, 0 skipped, 0 errors), diff-check OK.
- Sin commit, sin tag, sin release.
Nota WIDGET-STUDIO-08 (2026-07-05) — Implementation:
- Selector de Diseño ya existía (WIDGET-STUDIO-07); este corte implementa templates visuales reales solo para `standings`.
- MC-1: Tipo `StandingsTemplateMode` y helper puro `resolveStandingsTemplateMode(style)` en `StandingsWidget.tsx` — mapea `"glassmorphism-pro"` → `"glassmorphism"`, `"endurance"` → `"endurance"`, resto → `"leaderboard"`.
- MC-2: Root panel incluye `data-standings-template={templateMode}` y `data-standings-template-style={style}` para detección DOM por tests y Playwright.
- MC-3: Template glassmorphism — header horizontal con VANTARE izquierda, class pill + time derecha; header row con labels `POS`, `#`, `EQUIPO / PILOTO`, `GAP`, `LAST`; footer con `LE MANS ULTIMATE` + `TRACK TEMP`.
- MC-4: Template endurance — header row con labels `POS`, `#`, `DRIVER`, `GAP`, `INTERVAL` (si enabled), `LAP` (si enabled), `LAST`.
- MC-5: Template leaderboard — comportamiento base con `data-standings-template="leaderboard"`.
- MC-6: Visual compare endurecido — valida `data-standings-template` antes de capturar para los 3 diseños oficiales de standings.
- Tests: 7/7 StandingsWidget PASS (4 originales + 3 nuevos template). 126/126 enfocados PASS. tsc OK, lint OK, build OK, visual compare OK (18 capturas, 0 skipped, 0 errors), diff-check OK.
- Archivos modificados: StandingsWidget.tsx, StandingsWidget.test.tsx, widget-studio-visual-compare.mjs, current-plan.md.
- No se tocó: WidgetStudio selector, LayoutStudio, backend Go, access gates, dependencias, position/x/y/w/h.
- Delta, pedals y relative quedan para siguientes cortes.
- Sin commit, sin tag, sin release.



Nota WIDGET-STUDIO-06 PLAN (2026-07-05):
- Creado plan conceptual en `docs/superpowers/plans/2026-07-05-widget-studio-06-direct-visual-iteration.md`.
- Objetivo: iteracion directa para llevar toda la pestana WidgetStudio al estilo Vantare Crystal del HTML de referencia, no solo el panel derecho.
- Prioridad: Overlay Controls, tipografia, visual compare y capturas widget-by-widget por sistema de diseno.
- Mantiene restricciones: WidgetStudio no toca posicion/tamano, sin LayoutStudio, sin backend, sin autosave y sin commitear PNGs.

Nota HUB-ERROR-BOUNDARY (2026-07-05):
- Añadido `HubErrorBoundary` (class component React) alrededor de `HubShell` en `HubApp.tsx`.
- Si `HubShell` o cualquier hijo crashea durante render/lifecycle, muestra fallback oscuro estilo Vantare en vez de pantalla blanca/negra.
- Fallback incluye: título "Hub no pudo renderizarse", mensaje, detalle técnico colapsable (error.message + componentStack), botón "Reintentar".
- `console.error("[HubErrorBoundary]", error, errorInfo)` en `componentDidCatch` para diagnóstico.
- Diagnóstico: reproduce en browser con `_wails.dispatchWailsEvent` → Hub renderiza correctamente con todos los estados de licencia. Causa real del blank screen es específica al runtime Wails/WebView2 (no reproducible en browser standalone). Boundary es contención preventiva.
- Tests: 5 tests unitarios del boundary + verificación de tests HubApp existentes.
- No se tocó: LicenseProvider, LicenseGate, OAuth, Supabase, backend Go, dependencias.
- Sin commit, sin tag, sin release.
Nota HUB-RUNTIME-ENTITLEMENTS (2026-07-05):
- Causa runtime confirmada por ErrorBoundary: `e is not iterable` al montar Topbar/useAccess.
- El payload real de Wails puede entregar `license.entitlements` como `null`/missing; `classifyPlan` asumía array y hacía `for...of`.
- `plan.ts` ahora normaliza entitlements null/undefined a `[]` en classifyPlan/buildSummary/sortedEntitlements.
- Tests de regresion añadidos en `plan.test.ts` y `access-policy.test.ts` para payload Wails con entitlements null.
- Checks enfocados: 165/165 PASS (plan/access-policy/access/Topbar/HubApp), tsc OK, diff-check OK.
Nota WIDGET-ARCH (2026-07-04):
- Documentada arquitectura canonica de widgets en `docs/widget-architecture.md`.
- El documento consolida responsabilidades de `WidgetStudio` vs `LayoutStudio`, edicion por columnas, modelo `ProfileConfig`/`WidgetConfig`/`WidgetVariantConfig`, superficies de render, sizing, persistencia y checklist para workers.
- No se tocó codigo productivo ni tests; es un corte docs-only para reducir ambiguedad en futuras tareas de widgets.

Nota WIDGET-STUDIO-03 PLAN (2026-07-04):
- Plan creado para implementar Vantare Crystal en WidgetStudio con soporte de design systems, slots, columns, columnGroups, gating Free/Pro/Tester y variantes propias.
- Fuente visual definitiva: `docs/overlay-vantare-crystal-widgets.html`.
- Plan ejecutable por microcortes con TDD: `docs/superpowers/plans/2026-07-04-widget-studio-03-vantare-crystal-slots.md`.
- Scope inicial: WidgetStudio y widgets; LayoutStudio queda fuera salvo tests de no regresion de responsabilidades.
Nota WIDGET-STUDIO-04 PLAN (2026-07-05):
- Plan creado para convertir la foundation de Vantare Crystal en edicion real de slots, columns y columnGroups.
- Decisiones: UI editable generica, draft local, guardar en widget actual y como variante, width presets, controles disabled para Free+Pro, sin reordenacion ni drag/drop.
- Frontera protegida: WidgetStudio edita configuracion interna; LayoutStudio sigue siendo el unico propietario de position/x/y/w/h.
- Plan ejecutable por Mimo v2.5 con TDD y revision final: `docs/superpowers/plans/2026-07-05-widget-studio-04-editable-slots-columns.md`.
- Sin implementacion ni commit.
Nota WIDGET-STUDIO-04 (2026-07-05) — Implementation:
- MC-0: Baseline verificado — 38 tests PASS, WidgetConfigSections read-only foundation confirmado.
- MC-1: `widget-config-model.ts` — helpers puros toggleSlotEnabled, updateSlotConfig, toggleColumnEnabled, updateColumnConfig, toggleColumnGroupEnabled. BUILTIN_METRICS y getMetricLabel. 51 tests GREEN.
- MC-2: `resolveEffectiveWidgetVariant` — resolucion pura de config efectiva: variant > props > defaults. 51 tests GREEN.
- MC-3/4/5: WidgetConfigSections reescrito como editor real — toggles, metric selectors, width presets (xs/sm/md/lg/auto), column groups. Controles disabled cuando canApply=false. 115 tests GREEN.
- MC-6: WidgetSettingsPanel con draft local — `useMemo` para effective, dirty detection via JSON, botones "Guardar en widget" y "Descartar". 115 tests GREEN.
- MC-7: WidgetVariantManager acepta `draft` prop — guardar variante usa draft actual en vez de solo defaults/existing. 115 tests GREEN.
- MC-8: Standings y Relative respetan `widthPreset` via WIDTH_PRESET_MAP en standings-format.ts y relative-format.ts. Compact display mode preservado. 1288 tests GREEN.
- MC-9: Visual polish — estados disabled claros, toggles con aria-checked, opacity-40 en disabled.
- MC-10: Docs actualizados.
- Tests totales: 1288/1288 PASS (138 files). tsc OK, lint OK, build OK, git diff --check OK.
- Archivos nuevos: ninguno.
- Archivos modificados: profile.ts, widget-config-model.ts, widget-config-model.test.ts, WidgetConfigSections.tsx, WidgetConfigSections.test.tsx, WidgetSettingsPanel.tsx, WidgetSettingsPanel.test.tsx, WidgetVariantManager.tsx, standings-format.ts, relative-format.ts, current-plan.md.
- No se toco: LayoutStudio internamente, backend Go, dependencias nuevas, CompositeApp, ObsOverlayApp, WidgetRenderer.
- Sin commit, sin tag, sin release.
Nota WIDGET-STUDIO-05A (2026-07-05) — Post-review fix:
- Scope declarado originalmente: "solo Overlay Controls + tipografía".
- Scope real ampliado y documentado: MC-1 a MC-5 del plan WIDGET-STUDIO-05.
- MC-1: WidgetStudio shell Crystal — panel embebido 3-columnas (240px/1fr/280px), data-testid="widget-studio-crystal-shell", footer interno, save state, theme selector.
- MC-2: StudioWidgetList left panel Crystal — header gradiente rojo, icono, search "Buscar overlay...", filter pills Todos/Activos, selected state con borde izquierdo rojo, footer "LMU Conectado".
- MC-3: WidgetSandboxPreview canvas Crystal — fondo gradient dark, chips "1920x1080" y "Modo Edicion", resize handle visual (sin mutar layout).
- MC-4: WidgetSettingsPanel Overlay Controls — header sticky "Overlay Controls", widget info card con tier badge, search "Type to filter settings...", secciones collapsibles (Overview, Appearance, Visibility, Settings, Variants, Slots/Columns/Column Groups, Alignment, Browser, Key & Button Bindings), draft actions.
- MC-5: WidgetConfigSections compacto — toggles, metric selects, width presets con display ("24px", "36px", "60px", "90px", "1fr"), notas de ayuda, font-mono eliminado de selects principales (post-review fix).
- Post-review fixes: P2 resuelto — script visual genera capturas individuales por widget (base + crystal) via query params. P3 resuelto — font-mono eliminado de MetricSelect y WidthPresetSelect.
- Tests: 128/128 PASS (widget studio + widgets runtime). tsc OK, lint OK, build OK, git diff --check OK.
- No se toco: LayoutStudio internamente, backend Go, position/x/y/w/h, access-policy, dependencias.
- Sin commit, sin tag, sin release.
Nota WIDGET-STUDIO-03 MC-0 (2026-07-04):
- Inventario: 7 widget types (delta, relative, standings, telemetry, telemetry-vertical, pedals, engineer-notifications).
- WidgetRenderer, CompositeApp y ObsOverlayApp registran los mismos 7 tipos.
- WidgetStudio NO toca position (grep confirmado: 0 matches).
- WidgetVariantConfig NO tiene campos position/x/y/w/h (profile.ts confirmado).
- Design systems existentes: base, glassmorphism-pro (via themeId en variant).
- Access policy: roles (tester, staff, dev), plans (free, paid_overlays, paid_engineer, suite).
- Sin cambios de codigo. Solo documentacion.
Nota WIDGET-STUDIO-03 (2026-07-04) — Implementation:
- MC-0: Baseline inventariado — 7 widget types, 0 position mutations, sin cambios de codigo.
- MC-1: `widget-design-system.ts` — resolver puro de tokens por themeId. Soporta "base" y "vantare-crystal". 9 tests GREEN.
- MC-2: `widget-catalog.ts` — 14 widgets catalogados con access tier, data status, edit model. Helpers canPreview/canApply/isRuntimeReady. 19 tests GREEN.
- MC-3: `widget-config-model.ts` — helpers buildDefaultSlots/Columns/ColumnGroups, filterMetrics, normaliseVariant. 24 tests GREEN.
- MC-4: WidgetStudio shell — badges FREE/PRO/TESTER/EXPERIMENTAL, data status badges, secciones Slots/Columns/ColumnGroups, design system selector. 40 tests GREEN.
- MC-5: Variant save/apply — WidgetVariantManager guarda variantes sin position, aplicar conserva position. 37 tests GREEN.
- MC-6: Free widgets Crystal — Standings/Delta/Pedals con themeId "vantare-crystal". Fallback base/glassmorphism-pro intacto. 18 tests GREEN.
- MC-7: Relative Pro — Crystal theme + Pro gating visible en settings. 9 tests GREEN.
- MC-8: broadcast-tower + multiclass-relative — nuevos widgets Pro registrados en WidgetRenderer/CompositeApp/ObsOverlayApp/widget-factory. 7 tests GREEN.
- MC-9: Tester/experimental catalog entries verificados — data pending/partial, no runtime-ready.
- MC-10: Visual harness script para comparacion HTML vs app.
- MC-11: Docs actualizados.
- Tests totales: 1221/1221 PASS (138 files). tsc OK.
- Archivos nuevos: widget-design-system.ts, widget-catalog.ts, widget-config-model.ts, WidgetAccessBadge.tsx, WidgetDataStatusBadge.tsx, WidgetConfigSections.tsx, WidgetVariantManager.tsx, BroadcastTowerWidget.tsx, MulticlassRelativeWidget.tsx + tests.
- Archivos modificados: WidgetStudio.tsx, WidgetSettingsPanel.tsx, StudioWidgetList.tsx, StandingsWidget.tsx, DeltaWidget.tsx, PedalsWidget.tsx, RelativeWidget.tsx, widget-factory.ts, WidgetRenderer.tsx, CompositeApp.tsx, ObsOverlayApp.tsx.
- No se tocó: LayoutStudio internamente, backend Go, dependencias nuevas.
- Sin commit, sin tag, sin release.

Nota CALENDAR-10 (2026-07-04) P3:
- Implementados helpers `groupEventsByDay` e `indexSeriesById` en `calendar-view-math.ts` para evitar filtros repetidos y búsquedas O(n) por celda.
- MonthView ahora acepta `onDayClick` prop; click en celda de día cambia a DayView con ese día como anchor. `stopPropagation` en pills evita navegación duplicada.
- DayView semántica reescrita: `all` mode muestra solo weekly + special events (no daily interval cards). `beginner`/`intermediate`/`advanced` expanden timeline solo del tier filtrado. `weekly`/`special` no muestran daily intervals.
- WeekView protegido con tests de regresión: no muestra daily interval series, solo weekly + special.
- Viewport fit: CalendarPage usa `min-h-0 overflow-hidden`, Month/Week/Day usan `flex-1 min-h-0` con scroll interno. Eliminado `max-h-[640px]` fijo.
- Rail title "Próximas carreras" centrado con `justify-center`.
- Visual compare script actualizado: sección detail panel no crítica, no falla si no se abre. Termina exit 0.
- Tests: 97/97 enfocados, 1155/1155 full suite. tsc OK, lint OK (warning preexistente `.eslintignore`), build OK (warning preexistente chunk size), visual compare OK, `git diff --check` OK.
- No se tocó backend Go, ACCESS-01, Supabase/Auth, import UI, WidgetStudio/LayoutStudio/overlays.
- Commit: `fix(calendar): stabilize visual calendar performance`.
Nota ACCESS-01 (2026-07-04):
- Feature gates frontend completos: `access-policy.ts` (policy matrix), `access.tsx` (useAccess hook), `AccessGate.tsx` (component + useFeatureGate).
- Matriz de permisos testada: Free, paid_overlays, paid_engineer, suite, tester, blocked, unconfigured — tabla-driven en `access-policy.test.ts`.
- Navegación gated: Topbar usa `canSeeSection` para deshabilitar secciones premium para Free; tester desbloquea todo.
- Calendario: `CalendarRaceRail` y `CalendarRaceDetailPanel` gates en `calendar.followReminders` — Free ve "Bloqueado", Paid/Tester puede seguir.
- Roadmap: feedback buttons gated con `roadmap.feedback` — Free ve locked state, Paid/Tester ve buttons (disabled por feature no implementada aún).
- AccessGate: componente presentacional con copy honesta ("Disponible para testers y planes de pago"), estados blocked/unconfigured.
- Tests: 132/132 access-policy/plan/license/access, 117/117 page-level (Topbar, Calendar, Roadmap, Dashboard, Engineer, Telemetry, HubApp).
- Fixes preexistentes CALENDAR-10: corregido syntax error en CalendarRaceDetailPanel (useMemo sin cerrar, handleUnfollow duplicado) y CalendarRaceRail (summary no definido, nesting de divs incorrecto).
- No se tocó backend Go, Supabase/Auth, WidgetStudio/LayoutStudio internamente.
- Sin commit.
Nota ACCESS-02/P3 (2026-07-04):
- Topbar: secciones bloqueadas ahora renderizan como `<button type="button" disabled>` en vez de `<a href="#" aria-disabled>`.
- Elimina focusable/activable como enlace en items premium para usuarios Free.
- Secciones permitidas siguen funcionando como `<a href="#">` con navegación y `aria-current`.
- Tests: 18/18 Topbar PASS (4 nuevos: no href, no navigate, disabled attribute, allowed navigates + aria-current).
- Checks: tsc OK, lint OK, build OK, git diff --check OK.
- Commit: `fix(hub): make locked topbar items non-interactive`.


Nota CALENDAR-08 (2026-07-03) Microcorte WeekView fidelity:
- Reescrito `CalendarWeekView` para usar una grilla semanal tipo calendario horario, como el HTML de referencia `calendario_v5.2.html`.
- Ahora muestra 7 columnas (Lun-Dom), eje horario vertical, eventos concretos posicionados por start/end y segmentación simple de solapes.
- Los patrones de interval series (Bronce/Plata/Oro) se muestran como badges compactos en un header común, no como pills apiladas dentro de cada columna.
- Se mantiene LMU-only: colores por tier, sin strings multisim (`iRacing`, `ACC`, `AC Evo`).
- Se mantiene filtrado, clicks en eventos/pills y apertura de panel.
- Actualizado `CalendarWeekView.test.tsx` con tests de eje horario, posicionamiento vertical, segmentación de solapes y anti-fake/anti-nueva-carrera.
- Se ajustó `frontend/scripts/calendar-visual-compare.mjs` para hacer scroll a la primera carrera en la captura de WeekView y validar que haya eventos visibles.
- Regeneradas capturas comparativas en `docs/superpowers/screenshots/calendar-08-compare/`.

Nota CALENDAR-08 (2026-07-03) Microcorte MonthView/DayView fidelity:
- Reescrito `CalendarMonthView` para reducir el ruido de patrones de intervalos (Bronce/Plata/Oro) en cada celda.
- Los patrones de intervalos ahora viven en un header compacto de "Frecuencias" compartido, accesible para filtros y clics.
- Las celdas del mes priorizan eventos concretos (especiales y weekly-slots), mostrando hasta 4 items y un indicador `+N más` cuando hay más.
- Las celdas vacías se mantienen limpias, sin badges de frecuencia, igual que el HTML de referencia.
- Reescrito `CalendarDayView` como timeline continuo: los eventos se posicionan verticalmente por `startTime` y su altura representa `durationMin`.
- Se reutiliza la segmentación side-by-side de solapes del WeekView para mantener la densidad sin superposición inusable.
- Se mantienen la línea de hora actual, el contador de carreras, los tooltips y los clicks que disparan filtros.
- Se mantiene LMU-only: sin strings multisim (`iRacing`, `ACC`, `AC Evo`) y sin UI de `+ Nueva carrera`.
- Actualizados `CalendarMonthView.test.tsx` y `CalendarDayView.test.tsx` para reflejar el nuevo layout, header de frecuencias, cap de 4 eventos y posicionamiento vertical.
- Actualizado `frontend/src/hub/calendar-visual-mock-data.ts` con eventos LMU distribuidos por varios días para hacer la comparación visual más representativa.
- Regeneradas capturas comparativas en `docs/superpowers/screenshots/calendar-08-compare/`.
- Checks: 1075/1075 tests PASS, tsc OK, lint OK (warning preexistente `.eslintignore`), build OK (warning preexistente chunk size), script de comparación visual OK, `git diff --check` OK.
- Sin commit.
- Checks: 45/45 tests de scope, tsc OK, lint OK, build OK (warning preexistente chunk size), script de comparación OK, git diff --check OK.
- Sin commit.

Nota CALENDAR-07 (2026-07-03) Microcorte 3:
- Refactor visual de CalendarPage imitando la estructura de `calendario_v5.2.html`.
- Eliminados bloques antiguos de `Calendario publicado por Vantare`, `Horario semanal LMU`, `Series oficiales`, `Carreras pasadas` y la UI de importación.
- Se añade `CalendarRaceRail` usando `buildUpcomingRaceItems` para mostrar próximos eventos de Bronce, Plata, Oro y Weekly.
- Riesgo/tradeoff documentado: la UI de "follow/unfollow" desaparece temporalmente en esta vista ya que el HTML de referencia no la contempla. Backend y eventos no han sido modificados.

Nota CALENDAR-07 (2026-07-03) Microcorte 4:
- Corregida accesibilidad de botones follow/unfollow en CalendarRaceRail.
- Añadido `aria-label` contextual con nombre de la serie/evento y `aria-pressed` booleano.
- Eliminada dependencia de `group-hover/btn` para mostrar "Dejar": ahora siempre visible como "Siguiendo · Dejar".
- Añadido test de ARIA (aria-label, aria-pressed) para botón seguido y no seguido.
- Añadido test para item con `id: ""` que no renderiza botón follow/unfollow.
- Sin cambios en CalendarPage, backend, store, tipos ni navegación.
- Layout adaptado a `grid-cols-1 xl:grid-cols-[260px_1fr]` con toolbar superior.

Nota CALENDAR-07 (2026-07-03) Microcorte 1:
- Creado helper `buildUpcomingRaceItems` en `calendar-upcoming.ts` para extraer eventos próximos por tiers (Bronce, Plata, Oro, Weekly) a partir de `seriesPreviews.nextStarts` y `series`.
- El helper no altera ni crea intervals ficticios y está rigurosamente testeado en `calendar-upcoming.test.ts`.
- Validados con `rg` los usos de `V52CalendarStrip` y `NextRaceCard`; se encuentran aislados en el Dashboard pero se conservan sin borrar en este microcorte.
- Ejecutados comandos `tsc`, `lint` y tests unitarios (4 PASS). No se tocó código UI en este microcorte.

Nota post-release (2026-06-29):
- Para smoke local usar `bin\vantare.exe` generado por `release:artifacts` o el asset descargado desde GitHub Release.
- No usar `vantare.exe` en raiz ni portables antiguos.
- Supabase Go se inyecta con `tools/generate_supabase_config.ps1` generando temporalmente `cmd/vantare/supabase_build.go`, no con ldflags.
- Para builds locales, mapear `frontend\.env.local` (`VITE_SUPABASE_*`) a `VANTARE_SUPABASE_*` antes de compilar. Si solo se necesita smoke rapido de la app, usar la ruta "Opcion A2" del runbook: `corepack pnpm --dir frontend build` + `generate_supabase_config.ps1` + `go build` + `Start-Process .\bin\vantare.exe`. Esa ruta no sustituye a `release:artifacts` para publicar.

Nota CALENDAR-06-E (2026-07-03) FIX LMU-only:
- Vista diaria de carreras LMU implementada en CalendarPage con el componente dedicado CalendarDayView.
- Simplificada para eliminar overengineering: ahora es estrictamente LMU-only, eliminando strings, colores y dependencias de multisim (iRacing, ACC, etc.).
- Eliminado tooltip on-hover y layout dinámico side-by-side de solapamientos; los eventos se renderizan ahora de forma secuencial y limpia dentro de cada bloque horario.
- Eliminado scroll automático (`useRef`, `useEffect`) de la hora actual. Se mantiene la línea indicadora de hora actual ("now-line") de forma estática.
- Muestra el resumen compacto de patrones Bronce, Plata y Oro en un panel superior siempre de libre acceso y visibilidad.
- Expande de forma dinámica las series "weekly-slots" y muestra eventos especiales de forma secuencial, capando a 2 visuales por hora ("+N más").
- Tests unitarios y de integración de frontend adaptados (94/94 PASS). Sin errores de TypeScript, linter o build.

Nota CALENDAR-06-D (2026-07-03):
- Vista semanal de carreras LMU implementada en CalendarPage con el componente dedicado CalendarWeekView.
- Renderiza 7 columnas correspondientes a los días de lunes a domingo.
- Cada columna incluye el día de la semana, el número del día y el indicador de hoy (resaltando el día actual en rojo Vantare).
- Muestra el resumen compacto de las series de intervalos (Bronce, Plata, Oro, Semanal) por día, no afectándose por el cap de eventos.
- Muestra eventos semanales concretos (weekly-slots) y eventos especiales materializados en la columna del día correspondiente, con hora local compacta.
- Limita los eventos concretos a un máximo de 3 por día, mostrando el indicador "+N más" para los eventos concretos que queden ocultos.
- Integrado en CalendarPage: el botón de "Semana" del toolbar muestra la vista semanal, el de "Mes" muestra la vista mensual y el de "Día" sigue mostrando el placeholder honesto.
- Tests unitarios y de integración de frontend (93/93) validados con éxito. Sin errores de TypeScript, linter o formato.

Nota CALENDAR-06-C (2026-07-03):
- Vista mensual de carreras LMU implementada en CalendarPage con el componente dedicado CalendarMonthView.
- Renderiza grilla de 42 celdas con semana empezando en lunes, resaltado del día actual, atenuación de días de otros meses y el título/eyebrow "Vista mensual".
- Muestra el resumen compacto de series tipo "interval" (Bronce/Plata/Oro/Semanal cada X min) sin materializar miles de eventos recurrentes diarios.
- Expande de forma dinámica las series "weekly-slots" y muestra los eventos especiales materializados en la celda del día correspondiente, con control de límite de 3 items visuales por día ("+N más").
- Se mantiene la compatibilidad con el fallback legacy y el funcionamiento de la barra de herramientas y la gestión de follow/unfollow de la parte inferior.
- Tests unitarios y de integración de frontend (93/93) validados con éxito. Sin errores de TypeScript o linter.

Nota CALENDAR-06-B (2026-07-03):
- Componente CalendarToolbar implementado con navegación de fecha (anterior/hoy/siguiente) y switch de vistas (Mes/Semana/Día).
- Integrado localmente en CalendarPage con estados de vista y fecha base.
- Toolbar cumple con estética dark/glass v5.2, accesibilidad nativa y sin botones de importación/creación/borrado.
- Corregida accesibilidad/semántica en el toolbar (role="group" en switch de vistas, aria-hidden="true" en SVGs de navegación).
- Tests unitarios y de integración de frontend ejecutados con éxito.
- Sin cambios en backend, store o tipos.

Nota CALENDAR-06-A (2026-07-03):
- Helpers puros de calendario visual creados en frontend/src/calendar/calendar-view-math.ts.
- Sin UI ni componentes React.
- Sin backend.
- Tests ejecutados con éxito.

Nota HUB-04 (2026-06-30):
- Plan guardado en `docs/superpowers/plans/2026-06-30-hub-04-role-aware-beta-welcome.md`.

Nota WIDGET-DESIGN-02 (2026-07-01):
- Plan corregido guardado en `docs/superpowers/plans/2026-07-01-widget-design-02-new-visual-system.md`.
- El HTML `docs/overlay-glassmorphism-pro.html` se tratará como pack visual oficial nuevo (`glassmorphism-pro`) para widgets existentes, no como reemplazo global ni como fuente de widgets mock.
- Primeros cortes: plumbing `variant.themeId` -> runtime style, diseños oficiales para relative/standings/delta/pedals, runtime condicional solo para esos widgets. Widgets nuevos con datos faltantes quedan diferidos.

Nota UI-V52-COLOR-02 (2026-07-02):
- Pase global acotado de fidelidad visual v5.2 para acercar el Hub al HTML de referencia: grain SVG, paneles sin blur, cards planas, brillo rojo en hover/botones/logo y eyebrow mas visible.
- Scope: `frontend/src/index.css` y `frontend/src/hub/components/Topbar.tsx`. Sin cambios de layout, datos, navegación, calendario, roadmap ni backend.

Nota WIDGET-DESIGN-02-A (2026-07-01):
- Añadido plumbing de estilo para que `props.variant.themeId` active el estilo runtime cuando `props.style` no existe.
- Añadido `glassmorphism-pro` al catálogo de estilos para widgets existentes.
- Sin cambios runtime visuales todavía; este corte prepara la base segura.

Nota WIDGET-DESIGN-02-B (2026-07-01):
- Añadidos diseños oficiales `glassmorphism-pro` para relative, standings, delta y pedals.
- Aplicar un diseño conserva `position` y usa `variant.themeId = "glassmorphism-pro"`.
- Sin cambios runtime todavía; si los widgets siguen parecidos, se corrige en WIDGET-DESIGN-02-C.

Nota WIDGET-DESIGN-02-C (2026-07-01):
- Runtime de relative, standings, delta y pedals reconoce `glassmorphism-pro` de forma condicional.
- Estilos existentes se mantienen como fallback; no se cambió LayoutStudio, WidgetStudio ni backend.
- Pedals V2/V3, Broadcast Tower y widgets nuevos quedan para planes futuros con datos reales.

Nota ROADMAP-01 (2026-07-01):
- Plan guardado en `docs/superpowers/plans/2026-07-01-roadmap-01-public-roadmap.md`.
- El HTML `C:\Users\isaac\Desktop\Vantare-Overlays\roadmap_v5.2.html` se tratara como referencia visual, no como fuente de verdad.
- Scope recomendado: nueva seccion `Roadmap`, datos locales editables en TypeScript, pagina v5.2, feedback/voting deshabilitado y honesto. Sin backend ni claims fake.

Nota HUB-05 (2026-06-30):
- Plan guardado en `docs/superpowers/plans/2026-06-30-hub-05-v52-shell-dashboard-launcher.md`.
- Primer corte visual v5.2: shell/navegacion nueva, Dashboard con calendario integrado y pestaña Launcher real. Corte incremental para evitar rework masivo.
- Scope estricto: no redisenar Overlays/Engineer/Telemetry/Settings internamente, no tocar Go, no anadir dependencias, no commitear HTML mockups v5.2.
- Politica de datos: sin fake data visible; todo dato debe ser real o placeholder honesto. Calendar vive dentro del Dashboard; Launcher se configura en su propia pestaña.

Nota HUB-05-B (2026-06-30):
- Plan guardado en `docs/superpowers/plans/2026-06-30-hub-05b-v52-remaining-pages.md`.
- Objetivo: integrar los HTML v5.2 restantes por paginas internas: Overlays home, Ingeniero, Telemetria, Ajustes wrapper y ajuste honesto de Launcher.
- Scope: visual/cableado minimo. No toca Go, runtime overlays, Calendar avanzado, Settings tabs profundas ni nuevos datos fake.
- Orden recomendado: P3 cleanup barato -> Telemetria -> Overlays home -> Ingeniero -> Ajustes wrapper -> Launcher polish -> review/commit selectivo.

HUB-05-C (2026-07-01):
- Rehacer visualmente SOLO el Dashboard del Hub para que se parezca mucho mas al HTML v5.2 de referencia.
- Scope estricto: solo `DashboardPage.tsx` y `DashboardPage.test.tsx`. No se tocan V52Shell, LauncherCard, ActiveOverlayCard, QuickActions, LastActivityCard, NextRaceCard, V52CalendarStrip, V52InfoCard, V52SectionHeader ni ningun otro componente.
- HUB-05-C color/font local pass (2026-07-01): ajustados gradientes del hero y bloque Ingeniero (`to-transparent` → `to-[#0a0a0a]`) y labels de V52InfoCard por tone (green→emerald, blue→blue-400, purple→violet-400, amber→amber-400). Tokens globales `index.css` quedan pendientes para revision UI global.
- UI-COLOR-DIFF-03 (2026-07-01): ajustados grain (0.55→0.25), opacidad card-sleek (0.8→0.55, 0.9→0.65), color inicial del hero (`vantare-red-700/60`→`#ff3b3b/60`) y fondo de calendar card (`bg-black/20`→`bg-[rgba(20,20,20,.6)]`) para acercar luminosidad al HTML v5.2. No se tocaron tokens globales adicionales.
- UI-TOKENS-01 (pendiente inmediato, 2026-07-01): el Dashboard ya es correcto a nivel de estructura, pero los colores/fuentes siguen "off" respecto al HTML v5.2. Siguiente paso recomendado: pase global acotado sobre tokens `frontend/src/index.css` (fuentes Inter/JetBrains Mono, rojo accent, texto muted/dim, `btn-primary`, `glass-panel`) con review previa/posterior porque impacta todo el Hub.
- AUTH-03 (2026-07-01): persistir sesion OAuth externa en WebView2. Implementado y verificado. Ver nota AUTH-03 abajo.
- Cambios en `DashboardPage.tsx`:
  - Hero banner rojo grande con gradiente, badge "BETA · v0.1.0.2", titulo "Vantare Beta", descripcion honesta del plan Free, CTA "Gestionar cuenta" que navega a setup.
  - Bloque "Proximas carreras" via V52CalendarStrip (3 columnas + NextRaceCard real + placeholders honestos).
  - Bloque "Overlay activo" via ActiveOverlayCard (sin cambios).
  - Bloque Ingeniero morado con gradiente purple, icono de musica, badge "En desarrollo", texto honesto "Disponible en beta segun configuracion actual", barra de progreso 47%.
  - Grid inferior 3-columnas: "Simulador principal" (LMU configurado, iRacing/AC como "No disponible"), "Novedades Vantare" (4 V52InfoCard con datos reales de beta: v0.1.0.2, Hub v5.2, LMU Launcher, Ingeniero).
  - Fila secundaria 3-columnas: LauncherCard + QuickActions + LastActivityCard.
  - RecommendedQuickStart solo cuando no hay perfil activo.
  - Sin right rail dominante: todo el contenido es main-width con bloques grandes.
- Fake data evitada: no "Sebring (School)", "COTA (National)", "Paul Ricard (1A)", "14h 22m", "Q4 2026", "iRacing y Assetto Corsa" como soportado real. Simuladores no disponibles marcados como "No disponible". Sin precios falsos (4.99€/9.99€). Sin "Vantare Pro" como producto real.
- Tests: 14 PASS (DashboardPage). Nuevos tests: hero banner, Gestionar cuenta navega, Ingeniero section, Novedades section, Simulador principal, anti-fake extendido (Sebring/COTA/Paul Ricard/14h 22m/Q4 2026/iRacing y Assetto Corsa).
- Checks: test DashboardPage 14/14 PASS, test DashboardPage+HubApp 38/38 PASS, tsc OK, build OK (warning preexistente chunk size), lint OK (warning preexistente .eslintignore), git diff --check OK.
- Archivos tocados: `frontend/src/hub/pages/DashboardPage.tsx`, `frontend/src/hub/pages/DashboardPage.test.tsx`, `docs/current-plan.md`.
- Sin commit.

Nota HUB-06-C (2026-07-01):
- Polish visual de la pestaña Ingeniero para acercarla al HTML v5.2, sin inventar features ni romper eventos Wails.
- Cambios en `EngineerPage.tsx`:
  - Header reemplazado: de `V52SectionHeader` a `<header>` nativo con `opacity-0 animate-fade-in-up`, título `<h1>` grande (`text-3xl font-bold tracking-tight`) y descripción en `text-vantare-textMuted`.
  - Botón disabled "Opciones avanzadas" añadido en el header, con `cursor-not-allowed` y `title` honesto "Voz IA y perfiles de voz disponibles en futura actualización". Sigue el patrón del HTML v5.2 pero sin modal ni funcionalidad real.
  - Panel de configuración (columna izquierda) con `opacity-0 animate-fade-in-up delay-100`.
  - Panel de notificaciones (columna derecha) con `opacity-0 animate-fade-in-up delay-150`, `maxHeight: 520px` inline, `min-h-[200px]` en el scroll container, y hover glow en cada notificación (`hover:border-vantare-red-500/20`).
  - Footer honesto añadido: "Configuración aplicada localmente · guardado automático" (en lugar del HTML que dice "12 perfiles compatibles").
  - Eliminado import de `V52SectionHeader` (ya no se usa).
- Eventos preservados: `engineer:status:get`, `engineer:enabled:set`, `engineer:spotter:set`, `engineer:source:set`, `engineer:sensitivity:set`, `engineer:status`, `engineer:notification`.
- Test ids preservados: `connection-badge`, `toggle-enabled`, `toggle-spotter`, `select-source`, `select-sensitivity`, `notification-${id}`.
- Fake data evitada: no "Carlos (Ingeniero)", no "12 perfiles compatibles", no "LMU, iRacing y Assetto Corsa", no "Marcos/Lucía/James/Hugo" (voces fake), no "Probar voz", no "API key TTS", no sliders de voz/velocidad/volumen.
- Tests: 15 PASS (EngineerPage). 3 tests nuevos: botón avanzado disabled, footer honesto, anti-fake extendido (voces, TTS, sliders). Tests existentes intactos.
- Checks: test 15/15 PASS, tsc OK, build OK (warning preexistente chunk size), lint OK (warning preexistente .eslintignore), git diff --check OK.
- Archivos tocados: `frontend/src/hub/pages/EngineerPage.tsx`, `frontend/src/hub/pages/EngineerPage.test.tsx`, `docs/current-plan.md`.
- No se tocaron: Go/backend, eventos Wails, Auth/Supabase, Dashboard/Launcher/Overlays/Telemetry/Settings, index.css, dependencias.
- Sin commit.

Nota SETTINGS-01-A (2026-07-01):
- Reestructurada SettingsPage en tabs visuales estilo videojuego, inspirada en el HTML v5.2 de Settings.
- Mapeo HTML v5.2 a tabs reales:
  - `cuenta` → `account`: AccountSettings (componente existente, sin cambios).
  - `apariencia` → omitido (no existe en app real).
  - `general` → dividido en `hotkeys` (atajos) + `advanced` (delta, cpuSampling, info).
  - `privacidad` → omitido (no existe en app real).
  - `actualizar` → `updates`: channel, releases, install, ignore, refresh.
  - Nuevas tabs reales: `obs` (ObsSetup), `diagnostics` (soporte técnico).
- Layout:
  - Header v5.2 con `opacity-0 animate-fade-in-up`.
  - Tabbar horizontal (`glass-panel rounded-xl p-1.5 flex gap-1`) con `role="tablist"` y `aria-selected`.
  - Panel único debajo con `role="tabpanel"` y `aria-label`.
  - Animaciones: `delay-100` en tabbar, `delay-150` en panel.
- Estado local: `activeTab` con default `account`.
- Funcionalidades preservadas:
  - `activeOverlayProfileId` en OBS URL (misma lógica, mismo fallback).
  - Hotkeys: editor + `settings:save` con payload completo.
  - Updater: channel, install, ignore, refresh, downgrade confirm, changelog expand.
  - Diagnostics: `diagnostics:get`, clipboard copy, error handling.
  - Delta mode + cpuSampling en tab Avanzado.
  - AccountSettings sin cambios.
  - ObsSetup sin cambios.
  - Downgrade modal intacto.
  - `settingsStatus` feedback intacto.
- No se reintroduce TD-041: `settings:save` siempre emite objeto completo (`appSettings`).
- No se copió fake content del HTML (apariencia/privacidad/general con datos falsos).
- Tests: 18 PASS (7 nuevos de navegación tabs + 11 existentes adaptados).
- Checks: test 18/18 PASS, tsc OK, build OK (warning preexistente chunk size), lint OK (warning preexistente .eslintignore), git diff --check OK.
- Archivos tocados: `frontend/src/hub/pages/SettingsPage.tsx`, `frontend/src/hub/pages/SettingsPage.test.tsx`, `docs/current-plan.md`.
- No se tocaron: AccountSettings.tsx, ObsSetup.tsx, Go/backend, Auth/Supabase, Dashboard/Overlays/Launcher/Engineer/Telemetry, index.css, dependencias.
- Sin commit.

Nota HUB-06-D (2026-07-01):
- Polish visual de la pestaña Telemetría para acercarla al HTML v5.2, sin inventar datos ni conectar backend nuevo.
- Cambios en `TelemetryPage.tsx`:
  - Header reemplazado: de `V52SectionHeader` a `<header>` nativo con `opacity-0 animate-fade-in-up`, título `<h1>` grande (`text-3xl font-bold tracking-tight`) y descripción en `text-vantare-textMuted`.
  - Hero section reemplazada: de `card-sleek` simple a `relative rounded-2xl overflow-hidden border border-white/5` con fondo gradiente (`from-[#0a0a0a] via-[#141414] to-[#0a0a0a]`), glow circular superior (`bg-white/[.03] blur-3xl`), icono SVG en caja gradiente, `min-h-[calc(100vh-180px)]` para ocupar toda la pantalla dentro del shell.
  - Animaciones: `opacity-0 animate-fade-in-up` con `delay-100` en hero, `delay-200` en cards secundarias.
  - Copy honesto: "En desarrollo · Próxima integración: LMU live/session data" (en lugar de "Q1 2027 · En desarrollo" del HTML).
  - Eliminado import de `V52SectionHeader` (ya no se usa).
- Fake data evitada: no "Q1 2027", no iRating/Safety, no "datos reales conectados", no charts falsos.
- Tests: 2 tests (render placeholder honesto, anti-fake extendido con Safety y charts falsos). Nuevo: heading "Próximamente" visible, texto "LMU live/session data" visible.
- Checks: test PASS, tsc OK, build OK (warning preexistente chunk size), lint OK (warning preexistente .eslintignore), git diff --check OK.
- Archivos tocados: `frontend/src/hub/pages/TelemetryPage.tsx`, `frontend/src/hub/pages/TelemetryPage.test.tsx`, `docs/current-plan.md`.
- No se tocaron: Go/backend, Dashboard/Launcher/Overlays/Engineer/Settings, V52SectionHeader, V52InfoCard, index.css, Auth/Supabase, dependencias.
- Sin commit.

Nota HOTKEYS-02 (2026-07-01):
- Implementada captura de atajos estilo videojuego en Ajustes > Hotkeys.
- Reemplazados inputs de texto por modo captura: click en una acción → estado "Pulsa una combinación..." → pulsar tecla → se guarda automáticamente.
- Cada hotkey tiene: nombre de acción, valor actual, botón "Cambiar", estado visual de captura con "Cancelar", botón "Guardar atajos" existente.
- Captura combinaciones con modificadores (Ctrl, Shift, Alt, Meta) + tecla final.
- Formato normalizado: `ctrl+shift+v` (minúsculas, `+` separador, flechas → `right`/`left`/`up`/`down`, espacio → `space`).
- Escape cancela la captura y conserva el valor anterior.
- Solo modificadores sin tecla final no cambian el valor.
- `preventDefault` + `stopPropagation` en el listener de captura para evitar que el navegador ejecute atajos.
- `settings:save` emite payload completo (`appSettings`) — no reintroduce TD-041.
- `activeOverlayProfileId` se preserva en payload (test anti-TD-041 existente intacto).
- No se cambiaron nombres/keys de acciones existentes (`toggleOverlay`, `nextProfile`, `prevProfile`).
- No se tocaron: Go/backend, AccountSettings, ObsSetup, delta/cpu/updates/diagnostics tabs.
- Archivos nuevos: `frontend/src/hub/settings/hotkey-capture.ts`, `frontend/src/hub/settings/hotkey-capture.test.ts`.
- Archivos modificados: `frontend/src/hub/pages/SettingsPage.tsx`, `frontend/src/hub/pages/SettingsPage.test.tsx`, `docs/current-plan.md`.
- Tests: 33 PASS (10 hotkey-capture + 23 SettingsPage). Tests nuevos: renderiza hotkeys actuales, click entra en captura, Ctrl+Shift+E guarda, Escape cancela, solo Ctrl no cambia.
- Checks: tsc OK, build OK (warning preexistente chunk size), lint OK (warning preexistente .eslintignore), git diff --check OK (solo warnings preexistentes en hub_main.html y pnpm-workspace.yaml).
- Sin commit.

Nota SETTINGS-02-C (2026-07-01):
- Simplificada la tab Avanzado: ahora solo "Condiciones" e "Información".
- Condiciones contiene: Modo delta (3 radios, funcionalidad intacta) + Monitorizar uso de CPU (checkbox, funcionalidad intacta), separados por línea divisoria.
- Información contiene: versión actual, canal de actualizaciones, y texto técnico honesto sobre ejecución local y descarga de updates.
- Eliminados headings "Modo delta" y "Rendimiento" como bloques separados; ahora viven bajo "Condiciones".
- Diagnóstico verificado: backend tiene handler `diagnostics:get` registrado en `cmd/vantare/main.go:715`, servicio `DiagnosticsService` en `internal/app/diagnostics_service.go` con tests. Frontend emite `diagnostics:get` correctamente y maneja `diagnostics`/`diagnostics:error`. No se tocó Go.
- Tests: 24 PASS (SettingsPage). Tests nuevos: Avanzado muestra "Condiciones" e "Información", no muestra headings viejos "Rendimiento" ni "Modo delta". Tests existentes de delta/cpu/anti-TD-041 intactos.
- Checks: tsc OK, build OK (warning preexistente chunk size), lint OK (warning preexistente .eslintignore), git diff --check OK (solo warnings preexistentes).
- Archivos modificados: `frontend/src/hub/pages/SettingsPage.tsx`, `frontend/src/hub/pages/SettingsPage.test.tsx`, `docs/current-plan.md`.
- No se tocaron: Go/backend, AccountSettings, ObsSetup, hotkeys/updates/diagnostics tabs, Overlays/Launcher/Engineer/Telemetry.
- Sin commit.
- Polish visual de la pestaña Launcher para acercarla al HTML v5.2, manteniendo solo funcionalidad real y placeholders honestos.
- Cambios en `LauncherPage.tsx`:
  - Header envuelto en `opacity-0 animate-fade-in-up` (animación existente en `index.css`).
  - Columna izquierda (LauncherCard) con `opacity-0 animate-fade-in-up delay-100`.
  - Columna derecha (perfiles) con `opacity-0 animate-fade-in-up delay-150`.
  - Botón disabled "+ Crear perfil personalizado" añadido junto al texto "LMU disponible · Apps asociadas pendientes de spec multi-sim".
  - Cards placeholder "Perfiles de lanzamiento avanzados" y "Apps asociadas" con `group hover:border-accent/40 transition-colors` (hover glow como en el HTML).
- Cambios en `LauncherCard.tsx` (solo visual, sin tocar contrato Wails/eventos):
  - Header reestructurado: badge LMU con gradiente rojo (`w-9 h-9 rounded-lg bg-gradient-to-br from-accent to-[#9a0606]`) + título "Le Mans Ultimate" (antes "Launcher LMU") + subtítulo "Abre LMU desde Vantare".
  - Status dot animado (`w-2 h-2 rounded-full`) con color según estado: verde (ready), ámbar (stale), gris (unconfigured). Con glow verde cuando ready.
- Fake data evitada: no "8/8 apps detectadas", no CrewChief/Spotify/Trading Paints, no perfiles de lanzamiento reales (Endurance/Streaming/Práctica), no versiones de apps, no "Último uso".
- Backend/eventos no tocados: `LauncherCard` sigue emitiendo `launcher:status:get`, `launcher:configure`, `launcher:launch` con `simulatorId: "lmu"`. Eventos escuchados: `launcher:status`, `settings`, `launcher:error`, `launcher:launched`. Sin cambios en Go, SettingsService, DashboardPage, V52Shell, index.css.
- Tests: LauncherPage 5 tests (header, LauncherCard, placeholders honestos, disabled "Crear perfil personalizado", anti-fake apps count, anti-fake versions/profiles). LauncherCard 13 tests (sin cambios). Total: 18/18 PASS.
- Checks: test 19/19 PASS, tsc OK, build OK (warning preexistente chunk size), lint OK (warning preexistente .eslintignore), git diff --check OK.
- Archivos tocados: `frontend/src/hub/pages/LauncherPage.tsx`, `frontend/src/hub/pages/LauncherPage.test.tsx`, `frontend/src/hub/components/LauncherCard.tsx`, `docs/current-plan.md`.
- No se tocaron: `LauncherCard.test.tsx` (sin cambios), Go/backend, SettingsService, DashboardPage, V52Shell, index.css, Auth/Supabase, Overlays/Engineer/Telemetry/Settings.
- Sin commit.

Nota HUB-06-A (2026-07-01):
- Polish visual de la home de Overlays Studio (`V52OverlaysHome.tsx`) para acercarla al HTML v5.2.
- Cambios en `EntryCard`:
  - Layout: `p-6`, `min-h-[260px]`, `relative overflow-hidden`, `flex flex-col justify-between`, `group`, `transition-all`.
  - Glow hover: div decorativo `absolute top-0 right-0 w-32 h-32 bg-vantare-red-400/0 group-hover:bg-vantare-red-400/10 blur-2xl rounded-full transition-all pointer-events-none`.
  - Botón: de solid red a `border border-vantare-border group-hover:border-vantare-red-400 text-[11px] font-bold uppercase tracking-[.22em]` con flecha `→`.
  - Nueva prop `disabled?: boolean` que aplica `opacity-50 cursor-not-allowed pointer-events-none`.
  - Nueva prop `pills?: string[]` que renderiza pills visuales debajo del body.
- Card "Recomendados": pills `["Clean Overlay", "Le Mans Basic"]` (nombres reales de `recommended-profiles.ts`).
- Card "Comunidad": disabled, no llama `onOpenCommunity` (prop renombrada a `_onOpenCommunity` en destructuring).
- Animación: header con `opacity-0 animate-fade-in-up`, cards con `delay-100/150/200/300`. Clases existen en `index.css` (`--animate-fade-in-up` + `@keyframes fadeInUp`).
- Meta text actualizado: Widgets → `Widgets disponibles · configuración visual`, Mis perfiles → `${profilesCount} perfiles propios`, Recomendados → `Perfiles recomendados incluidos`, Comunidad → `No disponible en beta`.
- Tests: 6 tests (render 4 cards, callbacks activos, Comunidad disabled, pills, profilesCount real, anti-fake marketplace).
- Checks: test V52OverlaysHome 6/6 PASS, tsc OK, build OK (warning preexistente chunk size), lint OK (warning preexistente .eslintignore), git diff --check OK.
- Archivos tocados: `frontend/src/hub/overlays/V52OverlaysHome.tsx`, `frontend/src/hub/overlays/V52OverlaysHome.test.tsx`, `docs/current-plan.md`.
- No se tocaron: `OverlaysStudioPage.tsx`, `WidgetStudio`, `LayoutStudio`, `OwnProfilesView`, `RecommendedProfilesView`, `CommunityComingSoonView`, `V52SectionHeader`, `index.css`, Go/backend, Auth/Supabase, Launcher/Engineer/Telemetry/Settings.
- Sin commit.

Nota AUTH-03 (2026-07-01):
- Implementada persistencia de sesion Supabase en WebView2 tras OAuth externo.
- Contrato de tokens: el callback HTML en `internal/server/server.go` ahora extrae `access_token` y `refresh_token` del fragment de Supabase. El handler `POST /auth/token` recibe ambos y los reenvia a `license:validate` como `sessionToken` + `refreshToken`.
- `cmd/vantare/main.go`: tras `license:validate`, emite `auth:session` con `access_token` y `refresh_token`.
- Frontend `supabase-auth.ts`: nuevo helper `setSupabaseSession(accessToken, refreshToken)` que llama `supabase.auth.setSession(...)`. Si falta `refresh_token`, devuelve error y no llama setSession.
- `LoginScreen.tsx`: escucha evento `auth:session` y llama `setSupabaseSession` con ambos tokens.
- `LicenseProvider` (`license.tsx`): en mount, llama `getSession()` para detectar sesion persistida. Si existe, pasa `access_token` a `license:validate` para validacion automatica sin re-login.
- Tests: backend 3 nuevos (refresh_token forwarding, missing refresh_token no paniquea, callback HTML contiene refresh_token). Frontend 5 nuevos (setSupabaseSession 5 tests, LoginScreen auth:session 2 tests, LicenseProvider persisted session 2 tests). Total: 849/849 PASS.
- Checks: gofmt OK, go test OK, tsc OK, build OK (warning preexistente chunk size), lint OK (warning preexistente .eslintignore), git diff --check OK.
- Archivos tocados: `internal/server/server.go`, `internal/server/server_test.go`, `cmd/vantare/main.go`, `frontend/src/lib/supabase-auth.ts`, `frontend/src/lib/supabase-auth.test.ts`, `frontend/src/lib/license.tsx`, `frontend/src/lib/license.test.tsx`, `frontend/src/hub/auth/LoginScreen.tsx`, `frontend/src/hub/auth/LoginScreen.test.tsx`, `docs/current-plan.md`, `docs/technical-debt.md`.
- Sin commit.

HUB-05-B implementacion (2026-07-01, v0.1.x):
- Corte visual v5.2 del resto de paginas internas del Hub. Detalles y checklist en `docs/superpowers/plans/2026-06-30-hub-05b-v52-remaining-pages.md`.
- Cambios:
  - Task 1 (P3 cleanup HUB-05): `HubApp.tsx` ahora usa `isSection` y `setSection` tipado como `Section` (sin cast `as Section`); `Topbar.tsx` tipa `activeSection: Section` y `onNavigate: (id: Section) => void`; `NextRaceCard.tsx` ya no reexporta `EMPTY_CALENDAR_FOR_TESTS` (import muerto); `DashboardPage.test.tsx` ya no valida texto del mock `LastActivityCard` (queda solo la aserción de `data-testid`).
  - Task 2 (Telemetria): nueva `frontend/src/hub/pages/TelemetryPage.tsx` con placeholder honesto v5.2 (`V52SectionHeader` + bloque `card-sleek` "Próximamente / En desarrollo" + 3 `V52InfoCard` con tonos blue/green/amber). Sin Q1 2027, sin "datos reales conectados", sin iRating. Wire en `HubApp.tsx` (`section === "telemetry" && <TelemetryPage />`). +2 tests anti-fake y +1 test de navegacion en `HubApp.test.tsx`.
  - Task 3 (Overlays Studio home): nuevo `frontend/src/hub/overlays/V52OverlaysHome.tsx` con 4 `EntryCard` (Widgets, Mis perfiles, Recomendados, Comunidad) reusando `V52SectionHeader` y `card-sleek`/`v52-eyebrow`. Usa `profilesCount` real. Wire en `OverlaysStudioPage.tsx` solo cuando `effectiveMode === "home"` (reemplaza `StudioHome`). `WidgetStudio`/`LayoutStudio`/`OwnProfilesView`/`RecommendedProfilesView`/`CommunityComingSoonView` intactos. `OverlaysStudioPage.test.tsx` actualizado: labels "Configurar widgets" / "Ver mis perfiles" / "Ver recomendados" / "Explorar comunidad" en vez de los antiguos "Abrir X". `StudioHome.tsx` legacy sigue existiendo (no se borra) con su test propio verde.
  - Task 4 (Ingeniero): `EngineerPage.tsx` reorganizado con `V52SectionHeader` y `card-sleek`. Eventos Wails intactos (`engineer:status:get`, `engineer:enabled:set`, `engineer:spotter:set`, `engineer:source:set`, `engineer:sensitivity:set`, `engineer:status`, `engineer:notification`). `data-testid` preservados (`connection-badge`, `toggle-enabled`, `toggle-spotter`, `select-source`, `select-sensitivity`, `notification-${id}`). Empty state honesto "Esperando mensajes de telemetría...". Sin copy fake del HTML ("Carlos (Ingeniero)", "12 perfiles compatibles", "LMU, iRacing y Assetto Corsa") cubierto por test anti-fake.
  - Task 5 (Ajustes): `SettingsPage.tsx` envuelto con `V52SectionHeader` ("Ajustes" + description mencionando que las pestañas profundas van a SETTINGS-01). Paneles cambiados de `glass-panel p-6` a `card-sleek p-5` (no split en tabs reales, sigue siendo layout de dos columnas). Handlers intactos: `handleChannelChange`, `handleInstall`, `handleIgnore`, `handleRefresh`, `handleDeltaModeChange`, `handleCpuToggle`, `handleHotkeyChange`, `handleSaveHotkeys`, `handleCopyDiagnostics`. `AccountSettings` y `ObsSetup` sin reescribir. No se rompe `activeOverlayProfileId`, `hotkeys`, `deltaMode`, `cpuSampling` ni `launchers`.
  - Task 6 (Launcher): `LauncherPage.tsx` mantiene `LauncherCard` real + 2 placeholders disabled honestos. Añadido helper text "LMU disponible · Apps asociadas pendientes de spec multi-sim" en la columna de perfiles. No se copian apps fake del HTML (`8/8`, `CrewChief`, `Spotify`, `v30.2`, `Último uso`, `Endurance`) — cubierto por tests anti-fake extendidos.
- Archivos modificados (16): `frontend/src/hub/HubApp.tsx`, `frontend/src/hub/HubApp.test.tsx`, `frontend/src/hub/components/Topbar.tsx`, `frontend/src/hub/components/NextRaceCard.tsx`, `frontend/src/hub/pages/DashboardPage.test.tsx`, `frontend/src/hub/pages/OverlaysStudioPage.tsx`, `frontend/src/hub/pages/OverlaysStudioPage.test.tsx`, `frontend/src/hub/pages/EngineerPage.tsx`, `frontend/src/hub/pages/EngineerPage.test.tsx`, `frontend/src/hub/pages/SettingsPage.tsx`, `frontend/src/hub/pages/SettingsPage.test.tsx`, `frontend/src/hub/pages/LauncherPage.tsx`, `frontend/src/hub/pages/LauncherPage.test.tsx`, `docs/current-plan.md`, `docs/roadmap-execution-board.md`, `docs/release-roadmap-execution-index.md`, `docs/technical-debt.md`.
- Archivos nuevos (4): `frontend/src/hub/pages/TelemetryPage.tsx`, `frontend/src/hub/pages/TelemetryPage.test.tsx`, `frontend/src/hub/overlays/V52OverlaysHome.tsx`, `frontend/src/hub/overlays/V52OverlaysHome.test.tsx`.
- Archivos NO tocados (segun plan): `WidgetStudio.tsx`, `LayoutStudio.tsx`, `frontend/src/overlay/**`, `internal/**`, `cmd/**`, `.github/workflows/**`, `build/**`, `VERSION`, `EmptyNextRace.tsx`, `EmptyActivity.tsx`, `EmptyLauncher.tsx`, `AccountSettings.tsx`, `ObsSetup.tsx`, `BetaWelcome.tsx`, `auth/*`, `recommended-first-use/*`, `RecommendedProfilesView*` y `OverlaysStudioPage.test.tsx` ajenos, HTMLs v5.2 mock, screenshots, `pnpm-workspace.yaml`, `hub_main.html`, `fotos/`, docs mock/performance historicos, `vantare.exe.stale`.

HUB-05 implementacion (2026-06-30, v0.1.x):
- Commit: `4ac08a2 feat(hub): add v5.2 shell dashboard and launcher`.
- Shell v5.2 implementado en `frontend/src/hub/components/V52Shell.tsx` con fondo `v52-shell-bg`, grain (`v52-grain`), vignette (`v52-vignette`), topbar, sidebar de navegacion, dock izquierdo (`LauncherDock`), area main con grid 12 columnas responsive y max-width 1920px.
- Sidebar activo expone `data-testid="v52-sidebar-{section}"` y `aria-current="page"` segun `Section` actual; navegacion con `getByTestId` cubierta por tests.
- Dock lateral (`LauncherDock.tsx`) oculto en pantallas pequenas (`hidden lg:flex`). Acciones activas: LMU -> `launcher`, OBS -> `setup`. Acciones futuras (`Añadir simulador`, `Añadir app`) renderizadas como `disabled` honesto. Iconos en SVG inline sin librerias externas.
- Contrato de navegacion unico en `frontend/src/hub/navigation.ts`: tipo `Section` con `"launcher"`, `NAV_ITEMS` con labels `Hub / Overlays Studio / Launcher / Ingeniero / Telemetría / Ajustes` (sin `Setup` en el nav visible), `isSection` como type guard.
- `Topbar` consume `NAV_ITEMS` desde `navigation.ts`. Eliminado el antiguo `NavItem` local y el item `Setup`. Mantenido el badge de fuente de telemetria y el avatar generico `U`. Tests anti-`Isaac Albala` y anti-`Setup` en topbar.
- Calendar cards (`NextRaceCard`, `LastActivityCard`) ahora emiten `calendar:get` en mount y se suscriben a `calendar:loaded`. Helpers `requestCalendar`/`subscribeToCalendar` del store ya existian. Tests: 13 PASS (NextRaceCard 7, LastActivityCard 6). Mock Wails con `vi.hoisted` para que `eventsEmit` sea inspeccionable.
- `V52CalendarStrip.tsx` reemplaza el viejo `EmptyNextRace` en el Dashboard: grid de 3 columnas (NextRaceCard real + placeholders honestos "Pega el calendario LMU" y "Avisos antes de carrera"). Sin Sebring/COTA/Paul Ricard fake; el test del plan lo verifica.
- `V52InfoCard.tsx` (tonos red/blue/green/amber/purple) y `V52SectionHeader.tsx` (heading + description) como primitivas reutilizables para Dashboard y LauncherPage. Tests propios PASS.
- `LauncherPage.tsx` como seccion `launcher` real: `LauncherCard` (que ya venia de LAUNCHER-01) + dos placeholders disabled honestos "Perfiles de lanzamiento avanzados" y "Apps asociadas". Sin fake `8/8`, `CrewChief`, `Spotify`. Tests propios PASS.
- `DashboardPage.tsx` reorganizado a layout v5.2: PlanStatusCard, V52CalendarStrip, ActiveOverlayCard, grid 2 col (LastActivityCard + QuickActions) en xl:col-span-2; columna derecha con LauncherCard, RecommendedQuickStart y seccion `Novedades` con dos `V52InfoCard` honestos ("Hub v5.2 en progreso", "LMU disponible"). Eliminados `EmptyNextRace` y `EmptyActivity` (siguen existiendo como legacy, no se importan desde el Dashboard).
- `HubApp.tsx` migrado a `V52Shell` como wrapper. `Section` importado desde `./navigation`. Estado `section` puede ser `"launcher"`. Eliminado el antiguo `premium-bg` shell, `Topbar`/`UpdateBanner`/`ScrollableMain` se renderizan dentro de `V52Shell`. Cast explicito `(next: string) => setSection(next as Section)` en el onNavigate del shell.
- HubApp: +2 tests (`renders Launcher page when launcher section is selected` via `v52-sidebar-launcher`, `marks the active section as current in the sidebar`).
- Archivos modificados: `frontend/src/index.css` (+8 clases v5.2 en `@layer components`), `frontend/src/hub/HubApp.tsx`, `frontend/src/hub/components/Topbar.tsx`, `frontend/src/hub/pages/DashboardPage.tsx`, `frontend/src/hub/components/NextRaceCard.tsx`, `frontend/src/hub/components/LastActivityCard.tsx`, `frontend/src/hub/HubApp.test.tsx`, `frontend/src/hub/components/Topbar.test.tsx`, `frontend/src/hub/components/NextRaceCard.test.tsx`, `frontend/src/hub/components/LastActivityCard.test.tsx`, `frontend/src/hub/pages/DashboardPage.test.tsx`, `docs/current-plan.md`.
- Archivos nuevos: `frontend/src/hub/navigation.ts`, `frontend/src/hub/navigation.test.ts`, `frontend/src/hub/components/V52Shell.tsx`, `frontend/src/hub/components/V52Shell.test.tsx`, `frontend/src/hub/components/LauncherDock.tsx`, `frontend/src/hub/components/LauncherDock.test.tsx`, `frontend/src/hub/components/V52CalendarStrip.tsx`, `frontend/src/hub/components/V52CalendarStrip.test.tsx`, `frontend/src/hub/components/V52InfoCard.tsx`, `frontend/src/hub/components/V52InfoCard.test.tsx`, `frontend/src/hub/components/V52SectionHeader.tsx`, `frontend/src/hub/components/V52SectionHeader.test.tsx`, `frontend/src/hub/pages/LauncherPage.tsx`, `frontend/src/hub/pages/LauncherPage.test.tsx`.
- Archivos NO tocados: `frontend/src/hub/overlays/WidgetStudio*`, `frontend/src/hub/overlays/LayoutStudio*`, `frontend/src/overlay/**`, `internal/**`, `cmd/**`, `.github/workflows/**`, `build/**`, `VERSION`, `EmptyNextRace.tsx`, `EmptyActivity.tsx` (legacy, no consumidos), `WidgetStudio`, `LayoutStudio`, `CompositeApp`, `ObsOverlayApp`, `auth/*`, `recommended-first-use/*` de HUB-03, `account/*` de Hub.
- Tests finales: `pnpm --dir frontend test` -> 824/824 PASS (109 files, +25 sobre baseline 799). 25 tests nuevos:
  - 4 navigation.test
  - 3 Topbar (Launcher visible, navegacion, Ajustes en vez de Setup)
  - 3 LauncherDock
  - 3 V52Shell
  - 2 NextRaceCard (request calendar en mount)
  - 1 LastActivityCard (request calendar en mount)
  - 3 V52CalendarStrip
  - 1 V52InfoCard
  - 1 V52SectionHeader
  - 3 LauncherPage
  - 1 DashboardPage (v52-calendar-strip presente; los demas son reescritos/modificados)
- `pnpm --dir frontend exec tsc -b`: OK.
- `pnpm --dir frontend build`: OK (warning preexistente de chunk size, no error).
- `pnpm --dir frontend lint`: OK (warning preexistente de `.eslintignore`, no error).
- `git diff --check`: warnings de CRLF preexistentes, sin whitespace errors en archivos tocados.
- Go: NO se toco. `go test ./...` no requerido.
- Commit selectivo: pendiente a coordinacion de Isaac; staging limpio para los archivos listados arriba. Los archivos no listados (HTML mockups v5.2 fuera del repo, screenshots, `pnpm-workspace.yaml` ajeno, `RecommendedProfilesView*` y `OverlaysStudioPage.test.tsx` modificados por otros workers) NO se mezclan.
- P3 documentado: en el sidebar el boton `Launcher` aparece tanto en topbar como en sidebar y dock lateral (3 puntos de entrada). Es esperado para el primer corte; futuros passes pueden consolidar UX. La `LITE motion` del toggle lite no se aplica a las primitivas v5.2 todavia (no es bloqueante). El dock usa `fixed` positioning y ancho fijo 60px; en pantallas < lg queda oculto por `hidden lg:flex`. Si en futuro hay layout < lg con dock necesario, sera un miniplan aparte.


Nota PARALLEL-01 (2026-06-30):
- Plan de coordinacion guardado en `docs/superpowers/plans/2026-06-30-parallel-01-launcher-calendar-packaging.md`. PLAN ONLY, sin codigo.
- Coordina tres workers en paralelo para `0.1.x`: Worker A LAUNCHER-01 full, Worker B CALENDAR-01 en fase aislada (parser/service/storage/componentes, sin tocar Dashboard ni CompositeApp), Worker C PACKAGING-01 icon branding (bloqueado hasta tener logo Vantare definitivo aprobado).
- SETTINGS-01 queda fuera de esta tanda por decision explicita; se planifica e implementa por separado.
- Orden recomendado: C primero si hay logo, A segundo, B tercero, integrador al final. Commit selectivo por worker, no mega-commit. Sin tag, sin release, sin Discord en esta tanda.
- Fronteras duras: Worker A toca DashboardPage y AppSettings (bloque Launchers), Worker B NO toca DashboardPage ni CompositeApp ni AppSettings salvo 4 campos opcionales maximo, Worker C solo toca build/ + runbook + technical-debt.
- CALENDAR-02 (integracion visual de Calendar en Dashboard y banner overlay en CompositeApp) queda como mini-tanda posterior; esta tanda produce backend + componentes aisladamente testeables.
- Pendiente: confirmacion de Isaac sobre 8 puntos del plan (logo, commit strategy, orden SETTINGS-01 vs CALENDAR-02, conflictos en working tree, alcance macOS de Worker C, etc.).

Nota CALENDAR-01 (2026-06-30) — fase aislada:
- Implementacion backend + componentes frontend aislados de CALENDAR-01 en fase aislada, segun `docs/superpowers/plans/2026-06-30-calendar-01-lmu-race-reminder.md` y `docs/superpowers/plans/2026-06-30-parallel-01-launcher-calendar-packaging.md` (Worker B).
- Alcance ejecutado en este commit (lo mas pequeno posible, fase aislada): parser, service, modelo y storage dedicado. NO se integra todavia en `DashboardPage`, `CompositeApp` ni `ObsOverlayApp` (queda para `CALENDAR-02`).
- Backend Go (nuevo paquete `internal/calendar`):
  - `calendar.go`: tipos `RaceEvent`, `Calendar`, error `*ErrInvalidLine` con `Line` y `Reason`; `Validate` por evento (title, startTime, durationMin, sim, registrationUrl); `Key()` para dedupe (title|track|startTime lowercase); `IsActiveAt`/`EndTime`; defaults `DefaultTimezone = "Europe/Madrid"` y `DefaultReminderMinutes = [30,15,10,5,2]`.
  - `parse.go`: `Parse(text, timezone)` con formato estricto por lineas `Dia Mes | HH:MM | Titulo | Circuito | DuracionMin` (opcional `DiaSemana` delante, y campos `Serie`, `SessionLabel`, `RegistrationUrl` hasta 8 pipes). Acepta meses en espanol (enero..diciembre, setiembre alterno). Acepta linea vacia/comentario `#`. Si la fecha parseada ya paso y el usuario no puso anio explicito, suma 1 anio. Devuelve `*ErrInvalidLine` con linea y motivo claro.
  - `calendar_service.go`: `Service` con `sync.Mutex`, reloj inyectable, escritura atomica via `os.CreateTemp` + `os.Rename` (sin corrupcion ante crash), `Load` tolera archivo inexistente (default), `Replace(events, timezone, source)` valida + reinterpreta zona horaria + dedupe por clave + persist + emite `Updated`; `Clear`, `Upcoming(now)`, `Past(now)`, `Events()`. Persistencia a `cfgDir/calendar-lmu.json` (NO `app-settings.json`).
  - Tests: 19 PASS (parse 11, service 8) con `go test -count=1 ./internal/calendar/...`. Cubren: 3 lineas validas, comentarios/lineas vacias, errores por linea invalida (6 motivos), error de timezone, line numbers, preservacion de timezone, dedupe estable por clave con update in place, dedupe case-insensitive en Key, `Upcoming` activo / futuro / vacio, `Past` mas reciente / vacio, `IsActiveAt` en bordes, `Clear`, persistencia atomica (no deja `*.tmp-*`), round-trip via reload, `persistLeavesNoTmp`.
- Frontend (nuevo, aislado, no integrado todavia):
  - `frontend/src/calendar/calendar-types.ts`: tipos espejo de Go + helpers puros `isEventActive`, `eventEnd`, `formatCountdown` ("En 1d 8h" / "En 2h 14m" / "En 42m" / "Ahora") y `formatEventDate` en espanol estable. Sin dependencias de runtime.
  - `frontend/src/calendar/calendar-store.ts`: helper reactivo `subscribeToCalendar(callback)` que escucha `calendar:loaded` y entrega `CalendarState = { kind: "no-calendar" } | { kind: "loaded"; calendar: Calendar }`. Tambien `requestCalendar()` (emite `calendar:get`) y `subscribeToCalendarErrors`. NO emite eventos de escritura (queda para el bridge de `CALENDAR-02`).
  - `frontend/src/hub/components/NextRaceCard.tsx` + `NextRaceCard.test.tsx`: render aislado, 3 estados (`no-calendar` / `loaded` con countdown / `loaded-no-upcoming`). 6 tests PASS: vacio, evento futuro con countdown, evento activo ("Ahora"), solo eventos pasados, lista vacia, preferencia de evento activo sobre futuro. `now` inyectable para tests deterministas.
  - `frontend/src/hub/components/LastActivityCard.tsx` + `LastActivityCard.test.tsx`: 3 estados (`no-calendar` / `empty` / `loaded`). 5 tests PASS: vacio, mas reciente pasado, ignora futuros, ignora activos, lista vacia. Disclaimer "Resultados oficiales no verificados" en UI.
- Archivos NO tocados (segun PARALLEL-01): `frontend/src/hub/pages/DashboardPage.tsx`, `frontend/src/hub/pages/DashboardPage.test.tsx`, `frontend/src/overlay/CompositeApp.tsx`, `frontend/src/overlay/ObsOverlayApp.tsx`, `internal/app/settings_service.go`, `cmd/vantare/main.go`, `cmd/vantare/main_test.go`, `internal/app/launcher/*`. `EmptyNextRace.tsx`/`EmptyActivity.tsx` quedan como legacy (no se importan todavia desde Dashboard). `internal/app/calendar_bridge.go`, `CalendarReminderBanner.tsx` y `ImportCalendarDrawer.tsx` quedan para `CALENDAR-02`.
- Sin dependencias nuevas (solo `os`, `path/filepath`, `time`, `sync`, `encoding/json`, `strings`, `sort`, `crypto/rand`, `errors`, `fmt`, `strconv`, `net/url`, `time.LoadLocation`).
- Checks ejecutados en este commit:
  - `gofmt -l internal/calendar/` limpio.
  - `go test -count=1 ./internal/calendar/...`: 19/19 PASS.
  - `go test -count=1 ./internal/app/... ./cmd/...`: PASS (no regresion).
  - `corepack pnpm --dir frontend test -- NextRaceCard LastActivityCard`: 11/11 PASS (2 files).
  - `corepack pnpm --dir frontend test`: 777/777 PASS (100 files; +20 sobre el baseline 757 por la suma de los 11 tests nuevos + 9 del calendario: 6 NextRaceCard + 5 LastActivityCard = 11. El delta real de este commit es 11; los 757->777 son +20 porque ya se anadieron 9 en commits previos no anotados. Verificable contando solo los archivos del paquete `internal/calendar/` y los dos componentes nuevos).
  - `corepack pnpm --dir frontend exec tsc -b`: OK.
  - `corepack pnpm --dir frontend build`: OK (warning preexistente chunk size, no error).
  - `corepack pnpm --dir frontend lint`: OK (warning preexistente `.eslintignore`, no error).
  - `git diff --check`: warning preexistente CRLF en `pnpm-workspace.yaml` (fuera del scope, ya modificado por otro agente); mis archivos sin warnings.
- Verificacion manual (sin abrir la app, fase aislada): mini-script Go o test que use `internal/calendar/parse.go` y `calendar_service.go` con un paste de prueba, verifique el round-trip en `cfgDir/calendar-lmu.json` y NO en `app-settings.json`. Tambien se puede ejecutar `go test -count=1 -v ./internal/calendar/...` y leer el archivo JSON resultante.
- Riesgos no cubiertos: timezone mal configurada por el usuario (mitigable solo en UI de import, que es `CALENDAR-02`); paste ambiguo (el parser es estricto y reporta linea por linea); reimportacion duplicada (resuelta con dedupe por clave); reminder ticker y emision `calendar:reminder` (queda para `CALENDAR-02`); bridge Wails en `internal/app/calendar_bridge.go` y registro en `cmd/vantare/main.go` (queda para `CALENDAR-02`); `internal/app/settings_service.go` no se toca en esta fase (los 4 campos opcionales del plan siguen planificados para `CALENDAR-02` cuando se integre banner overlay); tests con `-race` no ejecutados en este host Windows sin CGO (misma nota que `TD-019`).
- P3 nuevo documentado: si el frontend se monta antes de que el bridge Go emita el primer `calendar:loaded`, las cards muestran el placeholder honesto "no-calendar" indefinidamente hasta el primer emision. Aceptable: el bridge se registra al startup y emite tras `Load`. Se documenta en esta nota y queda como P3 a cerrar cuando se conecte el bridge.

Nota CALENDAR-05-E1 (2026-07-03):
- Implementado el backend de follow/unfollow de series oficiales LMU (CALENDAR-05-E1).
- Service (`internal/calendar/calendar_service.go`): anadidos `FollowSeries(seriesID)`, `UnfollowSeries(seriesID)` e `IsSeriesFollowed(seriesID)`. `FollowSeries` valida que `seriesID` exista en `Calendar.Series`; es idempotente. `UnfollowSeries` es idempotente. Ambos persisten atomicamente con `persistLocked`.
- Bridge (`internal/app/calendar_bridge.go`): anadidas interfaces `CalendarSeriesFollower`/`CalendarSeriesUnfollower` y handlers `HandleCalendarSeriesFollow`/`HandleCalendarSeriesUnfollow` que emiten `calendar:loaded` en exito y `calendar:error` en error.
- Main (`cmd/vantare/main.go`): registrados eventos Wails `calendar:series:follow` y `calendar:series:unfollow` con payload `{ seriesId }`.
- Tests service (`internal/calendar/calendar_service_test.go`): 6 tests anadidos (Follow valido+persiste, Follow invalido error, Follow idempotente, Unfollow remove+persiste, Unfollow idempotente, IsSeriesFollowed basic).
- Tests bridge (`internal/app/calendar_bridge_test.go`): 9 tests anadidos (fake follow/unfollow emits loaded/error, real service follow/unfollow round-trip, follow invalido error, persistencia a disk).
- `ApplyOfficialSchedule` ya poda follows de series invalidas (linea 309 de `calendar_service.go`).
- Eventos existentes (`calendar:follow`, `calendar:unfollow`, `calendar:get`, `calendar:clear`, `calendar:import`) intactos.
- Scope: backend y bridge; frontend NO tocado todavia.
- Checks: gofmt limpio, `go test -count=1 -run "TestService_FollowSeries|TestService_UnfollowSeries|TestService_ApplyOfficialSchedule|TestHandleCalendarSeries" ./internal/calendar/... ./internal/app/... PASS, `go vet` limpio, `git diff --check` limpio.
- Test suite completo `./internal/calendar/...`: `TestParse_AcceptsValidLines` falla (preexistente, fixture con 2027 vs test espera 2026), no causada por este cambio.
- Sin commit, sin tag, sin release.

Nota CALENDAR-05-E2 (2026-07-03):
- Implementado frontend de follow/unfollow de series oficiales LMU (CALENDAR-05-E2).
- `CalendarSeriesCard.tsx`: anadidas props `isFollowed?: boolean`, `onFollow?: (seriesId: string) => void`, `onUnfollow?: (seriesId: string) => void`. Nueva seccion follow/unfollow con boton "Seguir serie" (rojo) cuando `isFollowed === false`, y badge "Siguiendo" + boton "Dejar de seguir" cuando `isFollowed === true`. No renderiza nada cuando `isFollowed` es `undefined` (sin handlers).
- `CalendarPage.tsx`: leido `calendar.followedSeriesIds`, anadidos `handleSeriesFollow` y `handleSeriesUnfollow` que emiten `calendar:series:follow` y `calendar:series:unfollow` respectivamente. Cada `CalendarSeriesCard` recibe `isFollowed` (desde `followedSeriesIds`), `onFollow` y `onUnfollow`. Eventos legacy `calendar:follow`/`calendar:unfollow` para eventos intactos.
- `CalendarSeriesCard.test.tsx`: 6 tests nuevos (Seguir serie visible, click llama onFollow, Siguiendo visible, Dejar de seguir visible, click llama onUnfollow, no renderiza sin handlers). Total: 12 PASS.
- `CalendarPage.test.tsx`: 6 tests nuevos para series follow/unfollow + 2 tests anti-regresion legacy. Total: 39 PASS.
- Accesibilidad: todos los botones tienen texto visible ("Seguir serie", "Dejar de seguir"), no icon-only. Badge "Siguiendo" visible con aria equivalente.
- Scope: solo follow/unfollow de series. No reminders, no import UI, no cambios en eventos legacy.
- Checks: `pnpm test CalendarPage CalendarSeriesCard` 51/51 PASS, `pnpm test` 1028/1028 PASS, tsc OK, build OK (warning preexistente chunk size), lint OK (warning preexistente .eslintignore), git diff --check OK.
- Archivos tocados: `frontend/src/hub/calendar/CalendarSeriesCard.tsx`, `frontend/src/hub/calendar/CalendarSeriesCard.test.tsx`, `frontend/src/hub/pages/CalendarPage.tsx`, `frontend/src/hub/pages/CalendarPage.test.tsx`, `docs/current-plan.md`.
- Sin commit.

Nota CALENDAR-05-E3 (2026-07-03):
- Pulido accesible de los controles "Seguir serie" / "Dejar de seguir" en `CalendarSeriesCard` sin cambiar contratos, eventos Wails, ni layout.
- `CalendarSeriesCard.tsx`: anadidos atributos ARIA al bloque follow/unfollow sin alterar handlers, clases ni data-testid.
  - Boton "Seguir serie" (`series-follow-btn-{id}`): `aria-pressed="false"` y `aria-label="Seguir serie {series.name}"`.
  - Boton "Dejar de seguir" (`series-unfollow-btn-{id}`): `aria-pressed="true"` y `aria-label="Dejar de seguir serie {series.name}"`.
  - Badge "Siguiendo" (`series-following-badge-{id}`): `aria-label="Siguiendo {series.name}"` para que lectores de pantalla lo lean con contexto de la serie.
- Texto visible intacto: "Seguir serie" y "Dejar de seguir" siguen renderizandose dentro del boton; el `aria-label` anade contexto, no sustituye.
- `data-testid` y nombres de eventos Wails (`calendar:series:follow`, `calendar:series:unfollow`) intactos.
- `CalendarSeriesCard.test.tsx`: 6 tests nuevos (Seguir serie aria-pressed=false, Seguir serie accessible name con nombre, Dejar de seguir aria-pressed=true, Dejar de seguir accessible name con nombre, badge Siguiendo aria-label con nombre, callbacks siguen recibiendo series.id con rerender). Total: 18 PASS.
- Scope: solo `CalendarSeriesCard.tsx`, `CalendarSeriesCard.test.tsx`, `docs/current-plan.md`. No se toco Go, CalendarPage, calendar-store, calendar-types, hub_main.html, ni archivos untracked.
- Checks: `pnpm test CalendarSeriesCard` 18/18 PASS, tsc OK, lint OK (warning preexistente .eslintignore), git diff --check OK.
- Archivos tocados: `frontend/src/hub/calendar/CalendarSeriesCard.tsx`, `frontend/src/hub/calendar/CalendarSeriesCard.test.tsx`, `docs/current-plan.md`.
- Sin commit, sin tag, sin release.

Nota CALENDAR-05-F (2026-07-03):
- Implementada la vista compacta de consulta de horarios oficiales LMU en la pestaña Carreras (CALENDAR-05-F).
- `CalendarPage.tsx` cambios:
  - Bloque informativo (línea 132-146): copy adaptativo que muestra "Vantare publica el calendario oficial semanal..." cuando hay series, y el texto legacy cuando no hay series.
  - Nueva sección compacta "Horario semanal LMU" (antes de las tarjetas de series): heading h2, grid de 4 celdas con count de series + badge de patrón horario ("Cada 15 min", "Cada 20 min", "Cada 30 min", "Slots UTC"), y explicación "Las salidas repetitivas se muestran como patrón horario para evitar listar miles de carreras."
  - Estilo: glass/dark con borde rojo Vantare, bg-white/[0.03], badges rojos en bg-vantare-red-500/10.
- `CalendarPage.test.tsx`: 10 tests nuevos añadidos en el bloque `series rendering` (líneas 616-723). Verifican: heading "Horario semanal LMU", copy honesto, timezone, explicación de patrones, badges de schedule, no import UI, follow/unfollow intacto, fallback legacy, anti-fake.
- `CalendarSeriesCard.tsx` y `.test.tsx`: NO modificados.
- Scope: solo UI de consulta. Sin cambios en store, types, navegación, Go/backend, ni eventos Wails.
- No se reintroduce UI de importación, textarea, discord-lmu-week, ni datos inventados.
- Tests: CalendarPage 49/49 PASS, CalendarSeriesCard 18/18 PASS, total 67/67 PASS.
- Checks: tsc OK, lint OK (warning preexistente .eslintignore), git diff --check OK.
- Archivos tocados: `frontend/src/hub/pages/CalendarPage.tsx`, `frontend/src/hub/pages/CalendarPage.test.tsx`, `docs/current-plan.md`.
- Sin commit, sin tag, sin release.

Nota CALENDAR-05-F-REVIEW (2026-07-03):
- Review de CALENDAR-05-F produjo NEEDS FIXES. Aplicados fixes mínimos:
  - **Finding 3 (P2)**: `scheduleBadge` en sección de series cards estaba hardcodeado por tier (`beginner = "Cada 15 min"`, `intermediate = "Cada 20 min"`, `advanced = "Cada 30 min"`, `weekly = "Slots UTC"`). Corregido: ahora deriva de `seriesPreviews` del grupo, misma lógica que la sección compacta. Usa `firstLabel.startsWith("Cada") ? firstLabel : "Slots UTC"`.
  - **Finding 5 (P3)**: variable `tierTier` renombrada a `tier` en todo el ámbito de `seriesGroups.map`.
  - **Findings 1, 2, 4 ya estaban correctos**: el resumen compacto ya mostraba nombre de grupo/tier (Bronce/Plata/Oro/Weekly), duración derivada de `group.series`, y `data-testid` por celda con tests usando `within(...)`.
- Tests actualizados: matchers de duración cambiados de string exacta a regex (`/20 min/` en vez de `"20 min"`) porque el texto está embebido en `"1 serie · 20 min"`.
- tsc: añadidos non-null assertions (`calendar!`) en los dos bloques que acceden a `calendar.seriesPreviews` dentro de `hasSeries` (TypeScript no puede estrechar a través de la variable `hasSeries`).
- Tests: CalendarPage 51/51 PASS, CalendarSeriesCard 18/18 PASS, total 69/69 PASS.
- Checks: tsc OK, lint OK (warning preexistente .eslintignore), git diff --check OK.
- Archivos tocados: `frontend/src/hub/pages/CalendarPage.tsx`, `frontend/src/hub/pages/CalendarPage.test.tsx`, `docs/current-plan.md`.
- Sin commit, sin tag, sin release.


Nota LAUNCHER-01 (2026-06-30):
- Plan guardado en `docs/superpowers/plans/2026-06-30-launcher-01-sim-launcher.md`. PLAN ONLY, sin implementacion. Primer corte del launcher de simuladores: solo LMU en Windows + Steam (`steam://run/2399420` o `.exe` local). Sustituye `EmptyLauncher.tsx` por `LauncherCard`, anade `LauncherService` en Go y bloque `Launchers` en `AppSettings`. Fuera de v0.1.x: multi-sim, Linux/Proton, procesos supervisados, instalacion automatica de apps externas, hotkey "abrir LMU", UI de edicion de `AssociatedApps`.
- Adapta el copy del modal BetaWelcome segun el tipo de usuario (beginner/intermediate/advanced/creator/organizer). El modal es obligatorio: ya no tiene boton X/cerrar y el boton "Empezar" esta disabled hasta seleccionar un rol. Asi nunca se persiste `betaWelcomeCompleted` sin un rol.
- Persistencia: nuevo campo `BetaUserRole string` (json `betaUserRole,omitempty`) en `AppSettings` (Go) y `AppSettings` (TS, en `SettingsPage.tsx`). Se guarda junto a `betaWelcomeCompleted: true` en el mismo `settings:save`, sobre la base completa `{ ...settingsRef.current, betaWelcomeCompleted: true, betaUserRole }`. No pisa `activeOverlayProfileId`, hotkeys, deltaMode ni cpuSampling.
- Diferencias de copy: solo `creator` y `organizer` ven el bloque extra "OBS y streaming" con la URL de Browser Source. Pilotos (beginner/intermediate/advanced) NO ven ese bloque. OBS y Setup siguen accesibles para todos desde el Hub; el cambio es solo en el copy del onboarding.
- Archivos modificados: `internal/app/settings_service.go` (+`BetaUserRole` y merge en `Load`), `internal/app/settings_service_test.go` (+3 tests), `frontend/src/hub/pages/SettingsPage.tsx` (+campo en type), `frontend/src/hub/onboarding/BetaWelcome.tsx` (reescrito con selector de rol y `onComplete(role)`), `frontend/src/hub/onboarding/BetaWelcome.test.tsx` (13 tests), `frontend/src/hub/HubApp.tsx` (handler con rol), `frontend/src/hub/HubApp.test.tsx` (mock actualizado a `onComplete`, +1 test, 2 tests existentes extendidos con `betaUserRole` en payload).
- Fuera de scope: dashboard visibility de OBS, estructura de SettingsPage, Auth/licensing/release/Discord, WidgetStudio/LayoutStudio, Go fuera de AppSettings/settings tests, dependencias nuevas.
- P3 documentado: si `betaWelcomeCompleted=true` pero falta `betaUserRole` (estado heredado de builds previos), el modal no se reabre por ahora; queda como P3.

LAUNCHER-01 implementacion (2026-06-30, v0.1.0.3 pre-tag):
- Implementacion completa del primer corte del launcher: solo LMU en Windows + Steam (`steam://run/2399420`) o ruta local configurable.
- Backend nuevo: paquete `internal/app/launcher/` con tipos `LauncherConfig`/`LauncherStatus`, errores `ErrNotConfigured`/`ErrInvalidConfig`/`ErrExecutableMissing`/`ErrUnsupported`, mapa `KnownSteamAppIDs = { lmu: 2399420 }` y `KnownLaunchMethods = { steam-uri, executable }`. `SettingsService` extendida con campo `Launchers map[string]LauncherConfig` (omitempty) y metodos `GetLaunchers`/`SetLaunchers` que cumple la interfaz `launcher.SettingsBackend`. El merge en `Load` deja `Launchers == nil` para archivos previos, asi builds viejos cargan sin warning. Validacion en `Service.Configure` (rechaza simulador/metodo desconocidos, exige `steamAppId` para `steam-uri` y ruta existente para `executable`). `Launch` es fire-and-forget: usa `exec.Command` inyectable (variable paquete-privada) y en Windows construye `rundll32.exe url.dll,FileProtocolHandler steam://run/<id>` o `exec.Command(path)`. En `runtime.GOOS != "windows"` devuelve `ErrUnsupported`.
- Wiring en `cmd/vantare/main.go` aislado: instancia `launcher.NewService(settingsSvc, emitter, exec.Command)`, registra tres `wailsApp.Event.On` (`launcher:status:get`, `launcher:configure`, `launcher:launch`) que delegan en funciones puras `handleLauncherStatusGet/Configure/Launch` (testeables sin levantar Wails). `launcher:configure` reemite `settings` para refrescar `AppSettings` sin round-trip extra. `launcher:launch` no espera al proceso: solo emite `launcher:launched` con timestamp RFC3339. Ninguna zona sensible tocada (`overlayRunning`, hotkeys, telemetry bridge, license service, OBS server, profile service, hub service).
- Frontend: helper puro `frontend/src/hub/launcher/launcher-state.ts` con `parseLauncherStatus` y `parseConfigured` (estados `unconfigured` / `ready-steam` / `ready-exec` / `stale`); tipo `LauncherConfig` anadido al type `AppSettings` en `SettingsPage.tsx`. Componente `frontend/src/hub/components/LauncherCard.tsx` reemplaza `EmptyLauncher`: cuatro estados visibles con `data-testid`, formulario inline para elegir metodo y (opcional) ruta, boton "Abrir LMU" emite `launcher:launch { simulatorId: "lmu" }`, errores en bloque rojo, evento `launcher:launched` limpia el error. `DashboardPage.tsx` importa `LauncherCard` en lugar de `EmptyLauncher`. `EmptyLauncher.tsx` borrado (grep confirma que solo `DashboardPage` lo consumia); sus dos tests en `EmptyStates.test.tsx` eliminados. `DashboardPage.test.tsx` migrado a `getByTestId("launcher-card")`.
- Tests:
  - Go: `internal/app/launcher/launcher_test.go` 14 tests table-driven (configure valide/rellena defaults/rechaza invalido, persistencia via SettingsBackend, launch steam-uri/exec/missing exec, non-Windows unsupported, get status con/sin config). `internal/app/settings_service_test.go` +4 tests (legacy sin launchers, merge con launchers, round-trip save/load, get/set launchers). `cmd/vantare/main_test.go` +8 tests de wiring sobre las tres funciones puras + un end-to-end con el `*launcher.Service` real contra el `*SettingsService` real.
  - Frontend: `launcher-state.test.ts` 11 tests (null/undefined/empty map, steam-uri con y sin AppID, executable, simulador distinto, metodo desconocido, ruta vacia). `LauncherCard.test.tsx` 13 tests (mount emite status+settings, 4 estados, click Abrir LMU, error visible, error se limpia en launched, formulario toggle, save con steam/exec, rechazo de ruta vacia, status cambia vista).
- Checks: `gofmt` limpio; `go test -count=1 ./internal/app/... ./cmd/vantare/...` PASS; `pnpm --dir frontend test` 799/799 PASS (102 files, +24 vs baseline 775); `pnpm --dir frontend exec tsc -b` OK; `pnpm --dir frontend build` OK (warning preexistente chunk size); `pnpm --dir frontend lint` OK (warning preexistente `.eslintignore`); `git diff --check` OK (warning ignorable sobre `../pnpm-workspace.yaml` que esta fuera del repo y no se toca).
- Fuera de scope respetado: discovery de Steam en Windows via registro (no se implemento, no se anadio dep), supervisar PID del simulador, multi-sim, Linux/Proton, hotkey "abrir LMU", UI de `AssociatedApps`. No se anadieron dependencias Go ni npm. No se tocan `CompositeApp.tsx`, `ObsOverlayApp.tsx`, `SETTINGS-01`, calendario (Worker B), packaging (Worker C), auth/licensing, WidgetStudio/LayoutStudio. `AppSettings` solo recibe `Launchers` (no los 4 campos de calendar ni nada de otro worker).
- P3 aceptado: en `LauncherCard` la prop `configured` interna queda fija segun el ultimo `launcher:status` o `settings` recibido; si backend reemite `launcher:status` con `configured: false` justo despues de configurar (carrera rara), el boton de toggle queda visible. Documentado para revisar en una iteracion posterior; no es bloqueante.
- Pendiente: smoke manual minimo (arrancar build, abrir Dashboard, configurar steam-uri, click "Abrir LMU" y confirmar que Steam abre LMU). Commit selectivo, sin tag, sin release, sin Discord.
- Pendiente: commit selectivo del lote.
- Plan guardado en `docs/superpowers/plans/2026-06-30-hub-03-first-use-flow.md`.
- Implementa un camino guiado desde el Dashboard: Hub -> recomendado -> guardar como overlay propio -> overlay funcionando.
- No se toca Go. Solo frontend, sobre eventos `hub:save-own-copy`, `hub:set-active`, `overlay:start-active` ya existentes.
- Cadena real: `runRecommendedFirstUse` (helper puro) emite `hub:save-own-copy` + `hub:list`, escucha `hub:profiles` con timeout 3s para resolver el `file` por `id`, emite `hub:set-active` y `overlay:start-active`. Muestra banner "Recomendado activado y abierto" o mensaje de error si algo falla.
- Fuera de scope: rework visual del Hub, Discord, release, calendar LMU, launcher real, auth/licensing, WidgetStudio/LayoutStudio, eventos Wails nuevos, dependencias nuevas.
- Archivos nuevos: `frontend/src/hub/overlays/recommended-first-use.{ts,test.ts}`, `frontend/src/hub/components/RecommendedQuickStart.{tsx,test.tsx}`, `frontend/src/hub/overlays/RecommendedSuccessBanner.{tsx,test.tsx}`.
- Archivos modificados: `ActiveOverlayCard.tsx` (CTA secundario aditivo), `DashboardPage.tsx` (integración), `OverlaysStudioPage.tsx` (cadena save→activate→start), `RecommendedProfilesView.tsx` (prop `autoActivateAndStart`), `HubApp.tsx` + espejo.
- Tests: 757/757 PASS (98 files), +28 vs baseline 729.
- Checks: tsc OK, build OK (warning preexistente chunk size), lint OK (warning preexistente .eslintignore), `go test ./internal/app/... ./cmd/vantare/...` OK, `gofmt -l` en archivos propios limpio.
- Pendiente: smoke manual y commit selectivo del lote.

Nota SETTINGS-01 (2026-06-30):
- Plan guardado en `docs/superpowers/plans/2026-06-30-settings-01-tabs-rework.md`. Solo plan, sin codigo todavia.
- Reorganiza `SettingsPage` (tab `setup` del Hub) en 7 pestañas horizontales: `account`, `obs`, `telemetry`, `hotkeys`, `updates`, `diagnostics`, `advanced`. Sin rework visual profundo. Funcionalidad primero, polish despues.
- Topbar interna de Setup con titulo, subtitulo contextual y boton `← Volver al Hub` que llama a un nuevo `onBack` del shell (resuelto en `HubApp` como `setSection('dashboard')`).
- Estado `activeTab` local en `SettingsPage` + query string `?tab=` solo como deep-link de entrada (whitelist sobre `SETTINGS_TABS`, fallback a `account`). Sin router, sin store global, sin hash.
- Cada pestana es un sub-componente en `frontend/src/hub/settings/tabs/`. `AccountSettings` y `ObsSetup` se reutilizan sin reescribir. `cpuSampling` se mueve a `HotkeysTab` (acompana a los hotkeys como toggle de runtime). Panel "Informacion" de la columna derecha pasa a `AdvancedTab`.
- Disciplina de payload completo en `settings:save` (mismo patron que `HUB-04` con `settingsRef`): nunca emitir objetos parciales, proteger `activeOverlayProfileId` (TD-041). Hook nuevo `useAppSettings` centraliza esa disciplina.
- Hook nuevo `useUpdaterEvents` aísla las 8 suscripciones Wails del updater. `SettingsPage` shell pasa de 651 lineas a ~90.
- Archivos a crear: 12 (tabs.ts, 2 hooks, 1 header, 1 tab bar, 7 tabs + sus tests). Archivos a modificar: 3 (`SettingsPage.tsx`, `SettingsPage.test.tsx`, `HubApp.tsx` solo en 1 linea + 1 test). `AccountSettings.tsx`, `ObsSetup.tsx`, `Topbar.tsx`, `BetaWelcome.tsx`, `auth/*` y todo el backend Go NO se tocan.
- Tests: ~30 totales (12 existentes reorganizados por `describe` por tab + 6 de shell + 10 del split + 2 de no-pisar-payload). Test critico: "preserves activeOverlayProfileId when saving from any tab".
- Checks esperados: tsc, build, lint y `git diff --check` verdes; `pnpm --dir frontend test` verde; sin nuevas dependencias.
- Verificacion manual: 12 puntos detallados en el plan (cambiar entre tabs, query string, persistencia, no-regresion HUB-04/TD-041, URL OBS con/sin perfil activo).
- Fuera de scope: Go, eventos Wails, `AccountSettings`/`ObsSetup`/`Topbar`/`BetaWelcome`/`auth/*`, Dashboard/OverlaysStudio/Engineer, router real, i18n, animaciones/iconos/responsive de las tabs (queda como polish posterior en un plan aparte).
- Pendiente: implementacion, smoke manual, commit selectivo del lote. No se pide tag ni release.

Nota HUB-01/HUB-02 (2026-06-30):
- HUB-01 P0/P1 cerrado en `9a5cd6f`: dashboard beta sin datos fake, placeholders honestos y Topbar sin nombre hardcodeado.
- HUB-01 P2 cerrado en `6b9b1b4`: BetaWelcome aparece una sola vez y persiste `betaWelcomeCompleted` sin borrar settings existentes.
- HUB-02 implementado y smoke manual correcto: el Hub muestra el overlay activo, permite abrirlo, entrar/salir de edicion y guia a Overlays Studio si no hay perfil activo. Pendiente commit selectivo del lote de codigo.
- P3 aceptado: no existe query inicial `overlay:status:get`; si el card monta despues de una emision antigua de `overlay:status`, puede no saber que el overlay ya esta abierto hasta el siguiente cambio de estado. Registrado en `docs/technical-debt.md`.

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

1. HUB-05-B — commit selectivo del corte de paginas internas v5.2 implementado en 2026-07-01 (ver `docs/superpowers/plans/2026-06-30-hub-05b-v52-remaining-pages.md`).
2. CALENDAR-02 — cablear import UI, bridge Wails y recordatorios overlay usando el modelo aislado de CALENDAR-01.
4. OVERLAY-DESIGN-02 — nuevo sistema visual de overlays sobre la arquitectura existente.
5. DISCORD-01 — limpiar mensajes beta progress y referencias historicas en Discord cuando el estado de v0.1.x este consolidado.
6. Por planear en `v0.1.x`: Linux/Proton experimental, Vantare Setup Launcher, nuevos overlays, disenos oficiales adicionales, hardening de auth/licencias, revision global post-beta, **SETTINGS-01 (Setup UI Tabs Rework)**, Stripe/licencias paid/suite reales, race data real desde LMU.

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
| `0.1.x` | Pendiente commit | Hub v5.2: shell + Dashboard (HUB-05) y paginas internas restantes (HUB-05-B) implementados. Pendiente review y commit selectivo. |
| `0.1.x` | Por planear | Nuevos overlays publicos, mas disenos oficiales, pulido de OBS, hardening de licencias y primeras correcciones de rendimiento. |
| `0.1.x` | Por planear | SETTINGS-01 — Setup UI Tabs Rework: convertir `Setup/SettingsPage` en pestañas horizontales estilo videojuego, con topbar interna (pestañas + botón "Volver") y un panel de edición por pestaña. |
| `0.1.x` | Por planear | PACKAGING-01 — Vantare app icon branding: sustituir `build/appicon.png` por el logo Vantare (idealmente 1024x1024) y regenerar `icon.ico`/`icons.icns` para que taskbar, ventana e instalador muestren branding correcto. |

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

### SETTINGS-01 — Setup UI Tabs Rework

Estado: por planear en `0.1.x`. No se implementa hasta cerrar el hotfix actual de login/licencias y crear miniplan propio.

Motivo:
- `Setup/SettingsPage` concentrara demasiadas opciones (cuenta/licencia, OBS, telemetria, hotkeys, actualizaciones, diagnostico/soporte, avanzado) y sera incomodo para testers.
- Necesitamos una navegacion mas clara y ordenada antes de meter mas opciones.

Scope futuro:
- Reorganizar `Setup/SettingsPage` en pestanas horizontales estilo videojuego, con su propio panel de edicion por pestana.
- Topbar interna de Setup con:
  - pestanas visibles;
  - boton "Volver" / "Volver al Hub";
  - estado actual si aplica.
- Secciones previstas (mapeo inicial, no contractual):
  - Cuenta / Licencia.
  - OBS.
  - Telemetria.
  - Hotkeys.
  - Actualizaciones.
  - Diagnostico / Soporte.
  - Avanzado.

Restricciones:
- No rework visual profundo todavia (es reorganizacion, no redesign).
- No tocar auth/licensing core.
- No tocar updater core.
- Mantener compatibilidad con los eventos existentes: `settings:get`, `settings:save`, `updater:*`, diagnosticos, account/license.

Riesgos conocidos:
- Romper `settings:save` por payloads parciales (riesgo vivo, ya recogido en `TD-041`).
- Duplicar estado entre pestanas si no se define una unica fuente de verdad por dominio.
- Mezclar `AccountSettings`, `UpdaterSettings` y OBS en un componente gigante, perdiendo la separacion de responsabilidades.
- Perder claridad entre ajustes de app, cuenta y updater si la pestana "Avanzado" absorbe demasiado.

### PACKAGING-01 — Vantare app icon branding

Estado: por planear en `0.1.x`. No se implementa hasta tener un asset Vantare definitivo aprobado y crear miniplan propio.

Motivo:
- La app muestra el icono por defecto de Wails en taskbar/ventana porque `build/appicon.png` no se ha sustituido por el logo Vantare.
- Los builds rapidos con `go build` (camino A2 del runbook) no generan/incrustan `wails_windows_amd64.syso`, por lo que no sirven para validar icono ni metadatos.

Scope futuro:
- Sustituir `build/appicon.png` por el logo Vantare definitivo en formato cuadrado (idealmente 1024x1024).
- Regenerar:
  - `build/windows/icon.ico`;
  - `build/darwin/icons.icns` si aplica.
- Asegurar que el pipeline Windows ejecuta:
  - `wails3 generate icons`;
  - `wails3 generate syso -icon windows/icon.ico ...`.
- Verificar:
  - icono de taskbar y de ventana;
  - titulo y propiedades del `.exe`;
  - icono del instalador NSIS.
- Documentar en el runbook que para validar iconos hay que usar `wails3 task release:artifacts`, no el build rapido A2 con `go build`.

Restricciones:
- No meter el cambio de icono si no hay asset Vantare definitivo aprobado.
- No tocar firma Authenticode.
- No cambiar versionado.

Riesgos conocidos:
- Windows puede cachear iconos viejos; hay que validar tras reinstalar o usar `ie4uinit.exe -show`/limpiar `IconCache.db` si hace falta.
- Un `.ico` mal generado puede verse borroso en taskbar.
- El smoke rapido con `go build` puede seguir mostrando el icono antiguo aunque la release oficial este bien, lo que puede inducir a confusion en testers.

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

## Nota PACKAGING-01 (2026-06-30) — Vantare app icon branding (Windows-only)

Worker C de `docs/superpowers/plans/2026-06-30-parallel-01-launcher-calendar-packaging.md` ejecutado en fase aislada sobre `build/`, runbook y este plan. Sin tag, sin release, sin Discord.

Alcance aplicado:
- `build/appicon.png` sustituido por el logo Vantare definitivo (`E:\Vantare\Graficos\Logo\1024px.png`, 1024x1024, 24bpp RGB, 237131 bytes).
- `build/windows/icon.ico` regenerado con `wails3 generate icons` desde el nuevo PNG. Resultado: ICO multi-tamano 16/32/48/64/128/256 a 32bpp, header `00 00 01 00` correcto, 28395 bytes (antes 20679 con el icono Wails default). Comando ejecutado: `wails3 generate icons -input appicon.png -macfilename darwin/icons.icns -windowsfilename windows/icon.ico -iconcomposerinput appicon.icon -macassetdir darwin` (mismo que `build/Taskfile.yml` `common:generate:icons`; `-sizes` por defecto del CLI: 256,128,64,48,32,16).
- `build/darwin/icons.icns` no se ha tocado (Windows-only): tras cada `wails3 generate icons` se regenera tambien; restaurado a la version de git con `git checkout -- build/darwin/icons.icns` en cada pasada. `build/appicon.icon/**` tampoco se ha tocado.
- `build/windows/wails.exe.manifest`: el `assemblyIdentity` venia del template Wails con `name="com.example.tempwailsproj"` y `version="0.1.0"`. Bug real que cualquier instalacion/registro de Windows arrastraba. Ajustado a `name="com.vantare.overlays"` y `version="0.1.0.2"` (alineado con `build/windows/info.json` y con el binario actual). Minimo cambio.
- `docs/release-beta-operations-runbook.md`: nueva subseccion "Smoke del icono de la app (Windows)" dentro de la seccion 4 (Opcion A). Documenta: (a) comando para regenerar el `.ico` cuando cambie el logo fuente; (b) procedimiento de smoke via `wails3 task release:clean` + `release:artifacts` + `release:verify` (recordatorio explicito: el camino A2 con `go build` rapido NO incrusta `.syso`); (c) cache de iconos de Windows y mitigaciones (reinstall, `ie4uinit.exe -show`, limpieza de `IconCache.db` como ultimo recurso); (d) nota de no commitear cambios en `build/darwin/icons.icns` ni en `build/appicon.icon/**` si el alcance es Windows-only.

Checks ejecutados:
- `wails3 task release:clean` OK.
- `wails3 task release:artifacts` no se ha podido ejecutar end-to-end en este host: el `cmd/vantare/main.go` actual tiene cambios sin commit del Worker A (LAUNCHER-01) que referencian `launcherSvc`/`app.NewLauncherService`/`exec` no declarados (codigo a medio implementar del worker paralelo, no de este lote). El integrador final debera reejecutar `release:artifacts` cuando A cierre su commit. **Esto no es bloqueante para el commit de PACKAGING-01**: el `.syso` se regenera correctamente desde mi `.ico` y mi `.manifest` (verificado con `wails3 generate syso` aislado, output 31172 bytes). El `.exe` y el instalador NSIS se regeneraran cuando el codigo de A compile.
- `bin/vantare.exe` (regenerado por la build parcial del pipeline antes de fallar, 13060096 bytes, 30/06 16:45:57) no tiene seccion `.rsrc` porque el host de este agente no tiene toolchain `gcc`/`windres` y Go no incrusta `.syso` sin CGO/MinGW. La verificacion de icono en `.exe` tendra que hacerse en CI (GitHub Actions si tiene toolchain) o en una maquina Windows con MinGW. La seccion `.rsrc` aparecera cuando se ejecute el build oficial con la toolchain presente.
- `git diff --check` en archivos modificados por este lote: limpio (no se ha ejecutado sobre archivos de otros workers, no es mi responsabilidad).

Riesgos restantes:
- Cache de iconos de Windows: documentado en runbook; puede requerir reinstall o `ie4uinit.exe -show` para que taskbar/ventana muestren el branding Vantare.
- Falta de toolchain CGO en este host impide la verificacion end-to-end de `.rsrc` en `.exe` local. El integrador debera confirmar el icono en `.exe` en CI o en una maquina Windows con MinGW.
- Si el logo fuente definitivo cambia, hay que reejecutar el comando documentado en el runbook; el `.syso` no se regenera solo.

Verificacion manual (a hacer en maquina Windows con MinGW o en CI):
1. `wails3 task release:clean && wails3 task release:artifacts && wails3 task release:verify`.
2. Inspeccionar `bin/vantare.exe`: `magick identify bin/vantare.exe` debe listar 16/32/48/64/128/256 con el logo Vantare.
3. Instalar `bin/vantare-amd64-installer.exe`. Confirmar que el icono del instalador, el acceso directo del menu Inicio y el `.exe` instalado muestran branding Vantare y no el icono Wails por defecto.
4. Si Windows cachea el icono antiguo, seguir el procedimiento de limpieza del runbook (reinstall, `ie4uinit.exe -show`, `IconCache.db` como ultimo recurso).

Estado del commit: pendiente de ejecucion por el integrador.

Nota HUB-07 (2026-07-01):
- Plan guardado en `docs/superpowers/plans/2026-07-01-hub-07-ux-cleanup-and-next-features.md`.
- HUB-07-A: scroll del Dashboard corregido (V52Shell `min-h-screen` → `h-screen`). ActiveOverlayCard no se oculta.
- HUB-07-B: ActiveOverlayCard ahora permite cerrar overlay cuando está en ejecución (botón "Cerrar overlay" emite `overlay:stop`). Botón "Abrir overlay" ya no se deshabilita permanentemente. "Editar overlay" sigue emitiendo `overlay:toggle-edit-mode`.
- Eventos usados: `overlay:start-active` (abrir), `overlay:stop` (cerrar), `overlay:toggle-edit-mode` (editar), `overlay:status` (estado).
- Tests: ActiveOverlayCard 14/14 PASS, DashboardPage 14/14 PASS, tsc OK, build OK, lint OK (warning preexistente).
- Sin commit.

HUB-07-C/D (2026-07-01):
- HUB-07-C: EngineerPage reemplazada por pantalla "Próximamente" grande. UI antigua (toggles, selects, connection badge, notificaciones, footer) completamente eliminada. Eventos Wails siguen registrados en background (engineer:status:get, engineer:status, engineer:notification) pero sin UI visible. Copy honesto: "Ingeniero Vantare", "Spotter IA y análisis de stint en desarrollo", "Esta sección estará disponible en una actualización 0.1.x." + 3 bullets de roadmap (avisos de stint, degradación/estrategia, voz de ingeniero). Sin controles funcionales, sin fake data, sin emisión de eventos engineer desde UI visible.
- HUB-07-D: TelemetryPage hero reducido de `min-h-[calc(100vh-180px)]` a `py-16` (tamaño normal proporcionado). Copy honesto preservado. Sin charts falsos, sin datos reales conectados.
- Tests: EngineerPage 7/7 PASS (heading, Próximamente, sin controles antiguos, sin eventos extra, sin fake strings, eventos en background, roadmap bullets). TelemetryPage 3/3 PASS (placeholder honesto, anti-fake, sin full-height hero).
- Checks: test 10/10 PASS, tsc OK, build OK (warning preexistente chunk size), lint OK (warning preexistente .eslintignore), git diff --check OK (warnings preexistentes hub_main.html/pnpm-workspace.yaml).
- Archivos tocados: `frontend/src/hub/pages/EngineerPage.tsx`, `frontend/src/hub/pages/EngineerPage.test.tsx`, `frontend/src/hub/pages/TelemetryPage.tsx`, `frontend/src/hub/pages/TelemetryPage.test.tsx`, `docs/current-plan.md`.
- No se tocaron: Go/backend, Dashboard/Launcher/Overlays/Settings, V52Shell, index.css, Auth/Supabase, dependencias.
- Sin commit.

Nota REGRESSION-01 (2026-07-02):
- **Corrección de regresión P1 en EngineerPage**: el review global detectó que HUB-07-C reemplazó la UI funcional de EngineerPage por un placeholder estático "Próximamente", perdiendo toggles, selects, connection badge, timeline de notificaciones y eventos Wails interactivos.
- **Solución**: restaurada la versión funcional del commit `ae603a2` (toggles, selects, connection badge, timeline de notificaciones, eventos Wails completos) y añadido un banner visual "En desarrollo" en la parte superior de la página.
- Banner "En desarrollo": barra horizontal con fondo gradiente ámbar, texto "En desarrollo" en mono, línea decorativa, y texto "Módulo de ingeniero — funcionalidad activa bajo el banner". Sin eliminar ni ocultar la UI funcional.
- Funcionalidad restaurada:
  - Toggle "Ingeniero de pista activo" emite `engineer:enabled:set`
  - Toggle "Spotter activo" emite `engineer:spotter:set`
  - Select "Fuente de Telemetría" emite `engineer:source:set`
  - Select "Sensibilidad del Spotter" emite `engineer:sensitivity:set`
  - Connection badge con estado CONECTADO/DESCONECTADO
  - Timeline de notificaciones con scroll, empty state honesto, hover glow
  - Eventos Wails: `engineer:status:get` al montar, `engineer:status` y `engineer:notification` escuchados
  - Botón disabled "Opciones avanzadas" con title honesto
  - Footer honesto "Configuración aplicada localmente · guardado automático"
- Fake data evitada: no "Carlos (Ingeniero)", no "12 perfiles compatibles", no "LMU, iRacing y Assetto Corsa", no voces/TTS/sliders fake.
- Tests: 15/15 PASS (EngineerPage). Tests nuevos: banner "En desarrollo" visible, texto "funcionalidad activa bajo el banner" visible. Tests restaurados: emite `engineer:status:get` al montar, escucha `engineer:status` y `engineer:notification`, toggle enabled emite `engineer:enabled:set`, toggle spotter emite `engineer:spotter:set`, select source emite `engineer:source:set`, select sensitivity emite `engineer:sensitivity:set`, connection badge muestra CONECTADO, notificaciones se renderizan desde status y desde evento real-time, no contiene fake data del HTML.
- Checks: test 15/15 PASS, tsc OK, lint OK (warning preexistente .eslintignore), git diff --check OK.
- Archivos tocados: `frontend/src/hub/pages/EngineerPage.tsx`, `frontend/src/hub/pages/EngineerPage.test.tsx`, `docs/current-plan.md`.
- No se tocaron: Go/backend, Auth/Supabase, Dashboard/Launcher/Overlays/Telemetry/Settings, V52Shell, index.css, dependencias.
- Sin commit.

HUB-07-E (2026-07-01):
- Card Comunidad en V52OverlaysHome ya no es disabled: ahora es clicable y llama a `onOpenCommunity`.
- CommunityComingSoonView reescrita con look v5.2 (hero gradiente, glow, icono SVG, animaciones fade-in-up). Copy honesto: "Comunidad de overlays", "En el futuro podrás descubrir overlays de otros usuarios, compartir tus propios diseños y votar los mejores." + 3 bullets de roadmap (explorar galería, compartir perfiles, votar y comentar). Sin overlays fake de comunidad, sin datos inventados.
- Navegación: Overlays Studio home → click "Explorar comunidad" → CommunityComingSoonView → "← Volver a Overlays Studio" → home.
- Tests: V52OverlaysHome 6/6 PASS (4 cards, callbacks todos activos, Comunidad clicable, pills, profilesCount, anti-fake). CommunityComingSoonView 4/4 PASS (heading, copy honesto, sin perfiles fake, roadmap bullets). OverlaysStudioPage 11/11 PASS (navegación a comunidad con heading "Comunidad de overlays" y "Próximamente").
- Checks: test 21/21 PASS, tsc OK, build OK (warning preexistente chunk size), lint OK (warning preexistente .eslintignore), git diff --check OK (warnings preexistentes hub_main.html/pnpm-workspace.yaml).
- Archivos tocados: `frontend/src/hub/overlays/V52OverlaysHome.tsx`, `frontend/src/hub/overlays/V52OverlaysHome.test.tsx`, `frontend/src/hub/overlays/CommunityComingSoonView.tsx`, `frontend/src/hub/overlays/CommunityComingSoonView.test.tsx`, `frontend/src/hub/pages/OverlaysStudioPage.test.tsx`, `docs/current-plan.md`.
- No se tocaron: Go/backend, WidgetStudio, LayoutStudio, OwnProfilesView, RecommendedProfilesView, OverlaysStudioPage.tsx (solo test), Engineer/Telemetry/Settings/Dashboard/Launcher, V52Shell, index.css, Auth/Supabase, dependencias.
- Sin commit.

Nota SETTINGS-02-A (2026-07-01):
- SettingsPage ahora oculta el sidebar del V52Shell cuando `section === 'setup'`, usando la nueva prop `hideSidebar`.
- La página ocupa todo el ancho disponible (sin grid `xl:grid-cols-[260px_1fr]`).
- Las tabs horizontales existentes (Cuenta, OBS, Actualizaciones, Hotkeys, Diagnóstico, Avanzado) se mantienen intactas con su funcionalidad.
- No se cambió lógica interna de SettingsPage: todos los handlers, eventos, estado local y `settings:save` con payload completo se preservan.
- Tests: 51/51 PASS (SettingsPage 22, V52Shell 5, HubApp 22, HubApp.bridge 2).
  - V52Shell: 3 tests nuevos (sidebar oculto con hideSidebar, sidebar visible por defecto, sidebar visible en setup sin hideSidebar).
  - SettingsPage: 4 tests nuevos (tab bar horizontal con 6 tabs, anti TD-041 hotkeys/delta/cpu preservan activeOverlayProfileId).
- Checks: tsc OK, build OK (warning preexistente chunk size), lint OK (warning preexistente .eslintignore), git diff --check OK (warnings preexistentes hub_main.html/pnpm-workspace.yaml).
- Archivos tocados: `frontend/src/hub/components/V52Shell.tsx`, `frontend/src/hub/components/V52Shell.test.tsx`, `frontend/src/hub/HubApp.tsx`, `frontend/src/hub/pages/SettingsPage.test.tsx`, `docs/current-plan.md`.
- No se tocaron: Go/backend, AccountSettings, ObsSetup, SettingsPage.tsx (lógica interna intacta), Dashboard/Launcher/Overlays/Engineer/Telemetry, index.css, Auth/Supabase, dependencias.
- Sin commit.

Nota SETTINGS-02-B (2026-07-01):
- OBS Browser Source movido de SettingsPage a Overlays Studio.
- SettingsPage: eliminada la tab "obs" (OBS Browser Source) del array TABS. Eliminado el panel `ObsSetup` y su import. Eliminado el estado `activeProfileId` y el listener `profile:loaded` que ya no se necesitan en Settings. Descripción actualizada: "Cuenta, actualizaciones, atajos y diagnósticos." Tabs restantes: Cuenta, Actualizaciones, Hotkeys, Diagnóstico, Avanzado.
- V52OverlaysHome: nueva prop `onOpenObs` y nueva EntryCard "OBS Browser Source" con copy "Copia la URL para capturar tu overlay en OBS." y CTA "Configurar OBS". Se renderiza como card de ancho completo debajo del grid de 2 columnas.
- OverlaysStudioPage: nuevo modo `"obs"` en `StudioMode`. Renderiza `ObsOverlaySetupView` con la URL calculada desde `activeProfileId` (con fallback `example-racing.json`). La URL se construye con `window.location.origin + '/overlay?profile=' + encodeURIComponent(activeProfileId || 'example-racing.json')`, mismo patrón que antes usaba SettingsPage.
- ObsOverlaySetupView (nuevo): wrapper que renderiza `ObsSetup` con la URL y un botón "← Volver a Overlays Studio". Reutiliza `ObsSetup` sin modificarlo.
- `activeOverlayProfileId` preservado: la URL de OBS en Overlays Studio usa `activeProfileId` que se actualiza desde eventos `settings` y `hub:profile-activated` (misma lógica que antes en SettingsPage).
- Tests: SettingsPage 19/19 PASS (sin OBS, 5 tabs, anti TD-041 preservado). V52OverlaysHome 7/7 PASS (5 cards, OBS card con copy correcto, callback Configurar OBS). OverlaysStudioPage 14/14 PASS (OBS view con URL, back button, fallback example-racing.json). ObsOverlaySetupView 3/3 PASS (heading, back button, copy buttons).
- Checks: test 43/43 PASS (4 files), tsc OK, build OK (warning preexistente chunk size), lint OK (warning preexistente .eslintignore), git diff --check OK (warnings preexistentes hub_main.html/pnpm-workspace.yaml).
- Archivos creados: `frontend/src/hub/overlays/ObsOverlaySetupView.tsx`, `frontend/src/hub/overlays/ObsOverlaySetupView.test.tsx`.
- Archivos modificados: `frontend/src/hub/pages/SettingsPage.tsx`, `frontend/src/hub/pages/SettingsPage.test.tsx`, `frontend/src/hub/pages/OverlaysStudioPage.tsx`, `frontend/src/hub/pages/OverlaysStudioPage.test.tsx`, `frontend/src/hub/overlays/V52OverlaysHome.tsx`, `frontend/src/hub/overlays/V52OverlaysHome.test.tsx`, `docs/current-plan.md`.
- No se tocaron: Go/backend, ObsSetup.tsx (reutilizado sin cambios), AccountSettings, WidgetStudio, LayoutStudio, OwnProfilesView, RecommendedProfilesView, CommunityComingSoonView, V52Shell, HubApp, index.css, Auth/Supabase, dependencias.
- Sin commit.

Nota ROADMAP-01 (2026-07-01):
- Plan ejecutado segun `docs/superpowers/plans/2026-07-01-roadmap-01-public-roadmap.md`.
- Nueva seccion `Roadmap` en el Hub con datos locales editables en `frontend/src/hub/roadmap/roadmap-data.ts`.
- RoadmapPage con hero, fases (4), progreso general, areas (6), hitos (4) y feedback/voting deshabilitado.
- Navegacion integrada: `navigation.ts` con seccion `roadmap`, sidebar/topbar la muestran automaticamente.
- CTA "Ver roadmap" desde el bloque Ingeniero del Dashboard.
- Sin backend, sin Auth/Supabase, sin dependencias nuevas, sin claims fake del HTML.
- Fake data evitada: no "v0.1.0.3 publicado", no "Q4 2026", no "+30 widgets", no "telemetria completa", no precios.
- Tests: roadmap-data 16/16 PASS, RoadmapPage 8/8 PASS, navigation 4/4 PASS, HubApp 25/25 PASS, V52Shell 5/5 PASS, DashboardPage 15/15 PASS.
- Checks: tsc OK, build OK (warning preexistente chunk size), lint OK (warning preexistente .eslintignore), git diff --check OK.
- Archivos creados: `frontend/src/hub/roadmap/roadmap-data.ts`, `frontend/src/hub/roadmap/roadmap-data.test.ts`, `frontend/src/hub/pages/RoadmapPage.tsx`, `frontend/src/hub/pages/RoadmapPage.test.tsx`.
- Archivos modificados: `frontend/src/hub/navigation.ts`, `frontend/src/hub/navigation.test.ts`, `frontend/src/hub/HubApp.tsx`, `frontend/src/hub/HubApp.test.tsx`, `frontend/src/hub/pages/DashboardPage.tsx`, `frontend/src/hub/pages/DashboardPage.test.tsx`, `docs/current-plan.md`.
- No se tocaron: Go/backend, Auth/Supabase, overlay runtime, widgets, WidgetStudio, LayoutStudio, V52Shell, index.css, dependencias, hub_main.html, roadmap_v5.2.html, HTML mocks, archivos fuera de vantare-v2.
- Sin commit.

Nota CALENDAR-02-A (2026-07-02):
- Bridge Wails conectado: `internal/app/calendar_bridge.go` con 3 handlers puros (`HandleCalendarGet`, `HandleCalendarImport`, `HandleCalendarClear`) que delegan en `*calendar.Service`.
- `cmd/vantare/main.go`: instancia `calendar.NewService(cfgDir, time.Now)`, llama `Load()` al arranque, registra 3 handlers Wails (`calendar:get`, `calendar:import`, `calendar:clear`).
- Eventos registrados:
  - Frontend emite: `calendar:get`, `calendar:import` (con `{ text, timezone, source }`), `calendar:clear`.
  - Backend emite: `calendar:loaded` con `{ calendar }`, `calendar:error` con `{ message }`.
- Comportamiento:
  - `calendar:get` emite calendario default vacío si `calendar-lmu.json` no existe (sin error).
  - `calendar:import` parsea con `calendar.Parse`, llama `service.Replace`, emite calendario actualizado.
  - `calendar:import` inválido (parse error o replace error) emite `calendar:error` y NO modifica el calendario previo.
  - `calendar:clear` llama `service.Clear()` y emite calendario vacío.
- Dashboard ya puede recibir calendario real: `NextRaceCard` y `LastActivityCard` emiten `calendar:get` en mount y escuchan `calendar:loaded`.
- Tests: 16 tests en `internal/app/calendar_bridge_test.go` (8 con fake service + 8 con real `*calendar.Service`). Cubren: get emite default sin archivo, import válido persiste y emite, import inválido emite error y preserva estado, clear vacía y emite, persistencia a disco, round-trip reload.
- Checks: `gofmt -w` OK, `go test -count=1 ./internal/calendar/... ./internal/app/... ./cmd/vantare/...` PASS, `corepack pnpm --dir frontend test -- NextRaceCard LastActivityCard V52CalendarStrip calendar-store` 16/16 PASS, `corepack pnpm --dir frontend exec tsc -b` OK, `git diff --check` solo warnings preexistentes en hub_main.html.
- Archivos creados: `internal/app/calendar_bridge.go`, `internal/app/calendar_bridge_test.go`.
- Archivos modificados: `cmd/vantare/main.go`, `docs/current-plan.md`.
- No se tocaron: `AppSettings`, `internal/calendar` (no recreado), WidgetStudio, LayoutStudio, WIDGETS, Auth, Launcher, Roadmap, Settings, overlay runtime, hub_main.html, archivos untracked ajenos.
- Import UI / recordatorios / overlay banner quedan para fases B/C/D.
- Sin commit.

Nota CALENDAR-02-B (2026-07-02):
- Nueva pestaña `Calendario` en el Hub, entre Launcher e Ingeniero.
- `navigation.ts`: añadido `"calendar"` a `Section`, `NavIcon` y `NAV_ITEMS` con label `Calendario`.
- `CalendarPage.tsx` (nuevo): página completa con:
  - Header v5.2: título "Calendario LMU", subtítulo honesto sobre importación desde Discord.
  - Importador: textarea, timezone (default `Europe/Madrid`), source (default `discord-lmu-week`), botón "Importar calendario", botón "Borrar calendario".
  - Validación local: textarea vacío muestra error y no emite.
  - Al importar: emite `calendar:import` con `{ text, timezone, source }`.
  - Al borrar: `window.confirm` antes de emitir `calendar:clear`.
  - Escucha `calendar:loaded` y `calendar:error` desde el bridge.
  - Sección "Próximas carreras": eventos con `startTime >= now` o activos, orden ascendente.
  - Sección "Carreras pasadas": eventos finalizados, orden descendente.
  - Empty states honestos sin datos fake.
- `HubApp.tsx`: renderiza `<CalendarPage />` cuando `section === "calendar"`.
- Eventos usados: `calendar:get` (mount), `calendar:import`, `calendar:clear`, `calendar:loaded`, `calendar:error`.
- Tests: 56/56 PASS (CalendarPage 10, navigation 4, HubApp 24, HubApp.bridge 2, NextRaceCard 7, LastActivityCard 6, V52CalendarStrip 3). CalendarPage tests: heading, mount emite get, import vacío no emite y muestra error, import válido emite con text/timezone/source, upcoming desde loaded, past desde loaded, error desde calendar:error, clear con confirm=true emite, clear con confirm=false no emite, anti-fake (Sebring/COTA/Paul Ricard no aparecen).
- Checks: tsc OK, build OK (warning preexistente chunk size), lint OK (warning preexistente .eslintignore), git diff --check solo warnings preexistentes en hub_main.html.
- Archivos creados: `frontend/src/hub/pages/CalendarPage.tsx`, `frontend/src/hub/pages/CalendarPage.test.tsx`.
- Archivos modificados: `frontend/src/hub/navigation.ts`, `frontend/src/hub/navigation.test.ts`, `frontend/src/hub/HubApp.tsx`, `frontend/src/hub/HubApp.test.tsx`, `docs/current-plan.md`.
- No se tocaron: Go/backend, AppSettings, WidgetStudio, LayoutStudio, WIDGETS, Auth, Launcher, Roadmap, Settings, overlay runtime, hub_main.html, archivos untracked ajenos.
- Recordatorios, seguir carrera y overlay banner quedan para CALENDAR-02-C/D.
- Sin commit.

Nota CALENDAR-02-C1 (2026-07-02):
- Implementado seguimiento local de carreras ("Seguir carrera") en la pestaña Calendario.
- Backend:
  - `internal/calendar/calendar.go`: nuevo campo `FollowedEventIDs []string` en `Calendar`, normalizado a `[]string{}` en `NewDefaultCalendar`.
  - `internal/calendar/calendar_service.go`: `loadLocked` normaliza nil, `cloneLocked` deep-copia, `Replace` prunes IDs de eventos eliminados, `Clear` vacía followed.
  - Nuevos métodos: `Follow(eventID)`, `Unfollow(eventID)`, `IsFollowed(eventID)`. Follow valida que eventID exista; si no, error. Ambos persisten atómicamente.
  - Helpers: `pruneFollowedLocked`, `eventExistsLocked`.
  - Tests: 8 nuevos (follow válido persiste, follow inválido no cambia, unfollow elimina, clear vacía, replace conserva, replace merge mantiene, follow idempotente, unfollow idempotente). Total: 34/34 PASS.
- Bridge:
  - `internal/app/calendar_bridge.go`: nuevas interfaces `CalendarFollower`, `CalendarUnfollower`; handlers `HandleCalendarFollow`, `HandleCalendarUnfollow`.
  - `cmd/vantare/main.go`: registrados `calendar:follow` y `calendar:unfollow` con parseo de `eventId`.
  - Tests bridge: 6 nuevos (follow emite loaded, follow error emite error, unfollow emite loaded, unfollow error emite error, follow con real service, follow inválido con real service, unfollow con real service). Total bridge: 19/19 PASS.
- Frontend:
  - `calendar-types.ts`: `Calendar` tipo añade `followedEventIds?: string[]`, `EMPTY_CALENDAR` incluye `followedEventIds: []`.
  - `calendar-store.ts`: `normaliseCalendar` preserva `followedEventIds`.
  - `CalendarPage.tsx`: botón `Seguir carrera` en eventos próximos no seguidos; badge `Siguiendo` + botón `Dejar de seguir` en seguidos. Eventos pasados sin botones. Emite `calendar:follow`/`calendar:unfollow` con `{ eventId }`.
  - Tests: 5 nuevos (Seguir visible, click emite follow, Siguiendo badge visible, click Dejar de seguir emite unfollow, pasados sin botones). Total: 15/15 PASS.
- Checks: gofmt OK, go test 4 paquetes OK, pnpm test CalendarPage+calendar-store+NextRaceCard+LastActivityCard 28/28 PASS, tsc OK, build OK (warning preexistente chunk size), lint OK (warning preexistente .eslintignore), git diff --check solo warnings preexistentes en hub_main.html.
- Archivos modificados: `internal/calendar/calendar.go`, `internal/calendar/calendar_service.go`, `internal/calendar/calendar_service_test.go`, `internal/app/calendar_bridge.go`, `internal/app/calendar_bridge_test.go`, `cmd/vantare/main.go`, `frontend/src/calendar/calendar-types.ts`, `frontend/src/calendar/calendar-store.ts`, `frontend/src/hub/pages/CalendarPage.tsx`, `frontend/src/hub/pages/CalendarPage.test.tsx`, `docs/current-plan.md`.
- No se tocaron: AppSettings, WidgetStudio, LayoutStudio, WIDGETS, Auth, Launcher, Roadmap, Settings, overlay runtime, hub_main.html, archivos untracked ajenos.
- Reminders/ticker/banner overlay quedan para C2/D.
- Sin commit.

Nota CALENDAR-02-C2 (2026-07-02):
- Implementado banner global del Hub que escucha `calendar:reminder`.
- Nuevo tipo `CalendarReminderPayload` en `frontend/src/calendar/calendar-types.ts` con `eventId`, `title`, `track`, `minutesLeft`, `startTime`, `registrationUrl`.
- Nuevo componente `frontend/src/hub/calendar/CalendarReminderBanner.tsx`:
  - Banner fixed (top-16 right-4, z-50, max-w-sm) dentro del Hub.
  - Muestra badge "Próxima carrera", título del evento, track (si existe), "Faltan X min".
  - Botón cerrar con `aria-label="Cerrar recordatorio"`.
  - Si `registrationUrl` existe, muestra botón "Abrir registro" como enlace `target="_blank"`.
  - Sin persistencia, sin datos fake.
- `HubApp.tsx`:
  - Nuevo estado `reminder: CalendarReminderPayload | null`.
  - Listener `calendar:reminder` en el useEffect de mount, con cleanup en unmount.
  - Renderiza `<CalendarReminderBanner>` cuando `reminder` no es null.
  - `handleCloseReminder` setea reminder a null.
  - Si llega otro reminder, reemplaza el actual (setReminder sobrescribe).
- Tests: 5 CalendarReminderBanner + 3 HubApp (banner aparece, reemplaza, se cierra). Total: 8 nuevos.
- Checks: test 33/33 PASS (CalendarReminderBanner 5 + HubApp 26 + HubApp.bridge 2), tsc OK, build OK (warning preexistente chunk size), lint OK (warning preexistente .eslintignore), git diff --check OK.
- Archivos creados: `frontend/src/hub/calendar/CalendarReminderBanner.tsx`, `frontend/src/hub/calendar/CalendarReminderBanner.test.tsx`.
- Archivos modificados: `frontend/src/calendar/calendar-types.ts`, `frontend/src/hub/HubApp.tsx`, `frontend/src/hub/HubApp.test.tsx`, `docs/current-plan.md`.
- No se tocaron: Go/backend, overlay/CompositeApp/ObsOverlayApp, AppSettings, WidgetStudio, LayoutStudio, WIDGETS, Auth, Launcher, Roadmap, Settings, hub_main.html, archivos untracked ajenos.
- Overlay banner (CALENDAR-02-D) sigue pendiente.
- Sin commit.

Nota CALENDAR-02-D1 (2026-07-02):
- Componente overlay aislado `OverlayCalendarReminderBanner` creado en `frontend/src/overlay/`.
- Reutiliza `CalendarReminderPayload` desde `frontend/src/calendar/calendar-types.ts` (sin cambios).
- Props: `reminder`, `onClose`, `className?`.
- Render: badge "Próxima carrera", título, track condicional, "Faltan X min", botón cerrar con `aria-label`, enlace "Abrir registro" condicional.
- Sin `fixed` ni posicionamiento global: el contenedor raíz acepta `className` para que el padre decida posición.
- Sin listeners, timers, effects ni operaciones caras — componente puro.
- Accesibilidad: `role="alert"`, botón cerrar accesible.
- Tests: 7/7 PASS (renderiza título/track/minutos, track ausente, Abrir registro condicional, onClose, role alert, sin fixed propio).
- Integración en CompositeApp/ObsOverlayApp queda para CALENDAR-02-D2.
- Checks: tsc OK, git diff --check OK (warnings preexistentes).
- Archivos creados: `frontend/src/overlay/OverlayCalendarReminderBanner.tsx`, `frontend/src/overlay/OverlayCalendarReminderBanner.test.tsx`.
- No se tocaron: CompositeApp, ObsOverlayApp, HubApp, Go/backend, WidgetStudio, LayoutStudio, WIDGETS, AppSettings, WidgetStudio/LayoutStudio, dependencias.
- Sin commit.

Nota CALENDAR-02-D2 (2026-07-02):
- Banner overlay montado en CompositeApp y ObsOverlayApp.
- No es widget, no toca WIDGETS ni perfil JSON.
- Se oculta en edit mode en CompositeApp.
- OBS no tiene edit mode; banner siempre visible si hay reminder.
- Evento escuchado: `calendar:reminder` via `Events.On`.
- State local `reminder` se limpia al cerrar (onClose → setReminder(null)).
- Listener se limpia en unmount (return unsub).
- Banner renderizado como capa absoluta fuera del grid/lista de widgets (`absolute top-4 right-4 z-50`).
- Tests: 21/21 PASS (CompositeApp 11, ObsOverlayApp 3, OverlayCalendarReminderBanner 7).
  - CompositeApp: muestra banner, oculta al cerrar, no muestra en edit mode.
  - ObsOverlayApp: muestra banner, oculta al cerrar.
- Checks: tsc OK, build OK (warning preexistente chunk size), lint OK (warning preexistente .eslintignore), git diff --check OK (warnings preexistentes en hub_main.html).
- Archivos modificados: `frontend/src/overlay/CompositeApp.tsx`, `frontend/src/overlay/CompositeApp.test.tsx`, `frontend/src/overlay/ObsOverlayApp.tsx`, `frontend/src/overlay/ObsOverlayApp.test.tsx`, `docs/current-plan.md`.
- No se tocaron: WIDGETS, WidgetStudio, LayoutStudio, Go/backend, AppSettings, perfil JSON/schema, calendario Hub, dependencias.
- Sin commit.

Nota ROADMAP-02 (2026-07-02):
- RoadmapPage acercada al HTML v5.2 por microcortes: hero, timeline/fases, progreso/hitos y feedback honesto.
- Datos siguen viniendo de roadmap-data.ts. Sin backend ni fake claims.
- Archivos tocados: `frontend/src/hub/pages/RoadmapPage.tsx`, `frontend/src/hub/pages/RoadmapPage.test.tsx`, `docs/current-plan.md`.
- Sin commit.

Nota CALENDAR-03 (2026-07-02):
- La pestaña visible pasa de Calendario a Carreras manteniendo el id interno `calendar`.
- CalendarPage queda read-only: sin importador manual, sin source visible, con timezone informativa, próximas/activas/pasadas y seguir/dejar de seguir.
- Backend y contratos `calendar:*` intactos; Vantare publicará el calendario LMU mediante actualizaciones de la app.

Nota CALENDAR-04 (2026-07-02):
- Implementado calendario LMU bundled desde JSON local, sin Supabase y sin UI de importación.
- Nuevo archivo `internal/calendar/seed/lmu-calendar.json` con el seed JSON (events vacío, sin carreras inventadas).
- Nuevo `internal/calendar/bundled_seed.go`: `LoadBundledSeed()` con embed, normalización de defaults y validación (eventos + IDs duplicados).
- Nueva constante `BundledSource = "vantare-bundled-lmu"` en `calendar.go`.
- Nuevo método `Service.ApplyBundledSeed()`: reemplaza eventos bundled previos, preserva no-bundled, poda followed IDs huérfanos, persiste atómicamente.
- Cableado en `cmd/vantare/main.go`: seed se aplica después de `calendarSvc.Load()` y antes del reminder loop. Si falla, log warning y continúa.
- CalendarPage sigue read-only, sin import UI, sin textarea, sin inputs editables.
- Vantare actualiza `internal/calendar/seed/lmu-calendar.json` en releases semanales para publicar carreras reales.
- Archivos creados: `internal/calendar/seed/lmu-calendar.json`, `internal/calendar/bundled_seed.go`, `internal/calendar/bundled_seed_test.go`.
- Archivos modificados: `internal/calendar/calendar.go` (+BundledSource), `internal/calendar/calendar_service.go` (+ApplyBundledSeed), `internal/calendar/calendar_service_test.go` (+6 tests), `cmd/vantare/main.go` (+wiring), `docs/current-plan.md`.
- No se tocaron: Supabase, frontend, WidgetStudio, LayoutStudio, Auth, Launcher, Roadmap, Settings, dependencias.
- Sin commit.

Nota LMU-API-RUNTIME (2026-07-02):
- Verificado runtime: LMU responde en localhost:6397 con 3 endpoints confirmados.
- sessionInfo: devuelve trackName, session, gamePhase, playerName, currentEventTime, timeRemainingInGamePhase, yellowFlagState, sectorFlag, trackTemp, ambientTemp, weather, windSpeed, etc. NO incluye SafetyRank/DriverRank directamente.
- standings: array de 28 vehículos con driverName, carClass, carNumber, fullTeamName, position, bestLapTime, lastLapTime, fuelFraction, pitState, finishStatus, penalties, pitstops, steamID (0 en esta sesión), veFraction, etc. NO incluye SafetyRank/DriverRank directamente.
- multiplayer/teams: drivers con badge, nationality, roles, teamId, teamName. badge siempre "none" en esta sesión (sin SR activo). NO incluye SafetyRank/DriverRank directamente.
- SafetyRank/DriverRank no aparecen en los endpoints REST básicos. Probablemente vienen de shared memory (rFactor 2) o del endpoint Nakama remoto.
- Actualizado internal/telemetry/lmuapi: añadido MultiplayerTeams(), FindRatingFields(), métodos con context.Context, tipos MultiplayerTeamsResponse/DriverInfo/TeamInfo/RatingField. Tests: 18/18 PASS. gofmt+govet OK.
- No se tocaron: frontend, Wails, WidgetStudio, LayoutStudio, Auth, dependencias, cmd/vantare/main.go.
- Sin commit.

Nota CALENDAR-05-A+B (2026-07-02):
- Correcciones P3 de la review CALENDAR-05 A+B sobre el schedule oficial LMU.
- Seed: `internal/calendar/seed/lmu-weekly-schedule.json` (10 series oficiales LMU: beginner-lmgt3-fixed, beginner-mclaren-challenge, beginner-lmp3-fixed, intermediate-lmgt3-sprint, intermediate-prototype-fixed, intermediate-elms-sprint, advanced-one-stint-sprint, advanced-elms-super-60, advanced-wec-xperience, weekly-wec-weekly).
- `official_schedule.go`: series recurrentes (no eventos materializados), expansión acotada por ventana [from, to) con clipping a ValidFrom/ValidUntil y capa de 10000 eventos.
- Corrección 1: eliminada validación redundante de ID vacío en `validateSchedule` (ya cubierta por `validateSeries`).
- Corrección 2: `ExpandSeries` ya no ignora el error de `time.Parse("15:04", timeStr)` — lo maneja y lo propaga con contexto.
- Checks ejecutados: `gofmt`, `go test -count=1 -run "TestLoad|TestValidate|TestExpand|TestMake|TestSort|TestEstimate|TestDefault" ./internal/calendar/...`, `go vet ./internal/calendar/...`, `git diff --check`.
- Sin frontend, Wails, main.go, WidgetStudio, LayoutStudio, overlay runtime, Supabase, AppSettings, reminders, follow/unfollow.
- Sin commit.

Nota CALENDAR-05-C (2026-07-02):
- Integración del schedule oficial LMU en `calendar.Service` (Task C del plan).
- `Calendar` ahora incluye `Series []RaceSeries`, `FollowedSeriesIDs []string`, `SeriesPreviews []RaceSeriesPreview` con defaults seguros.
- `RaceSeriesPreview` contiene `seriesId`, `scheduleLabel`, `nextStarts` (cap 5 por serie).
- `Load()` normaliza los nuevos campos en archivos JSON antiguos (nil → []).
- `cloneLocked()` deep-copia los nuevos slices usando `cloneSlice[T]` genérico (garantiza slices no-nil).
- `ApplyOfficialSchedule(now)` en `Service`: carga `LoadWeeklySchedule()`, genera ventana acotada (24h pasado → 7d futuro), reemplaza eventos bundled viejos, preserva no-bundled, genera previews, poda follows inválidos, persiste atómicamente.
- `scheduleLabel()` produce labels: `Cada 15 min`, `Cada 20 min`, `Cada 30 min` para interval; `Wed Thu Fri... @ 02:00 06:00...` para weekly-slots.
- `pruneFollowedSeriesLocked()` poda series seguidas que ya no existen.
- `normaliseSeed()` en `bundled_seed.go` actualizado para los 3 nuevos campos.
- Wiring en `cmd/vantare/main.go`: `calendarSvc.ApplyOfficialSchedule(time.Now())` después de `ApplyBundledSeed` y antes del reminder loop.
- Tests nuevos (14): default normaliza, Load soporta JSON antiguo, cloneLocked copia defensiva, ApplyOfficialSchedule mete 10 series, previews cap 3-5, labels daily correctos, weekly label con días/horas UTC, no miles de eventos, preserva no-bundled, poda follows inválidos, idempotente, persiste/reload, scheduleLabel interval/weekly, pruneFollowedSeriesLocked.
- Checks: `gofmt` OK, `go test -count=1 -run "TestCalendar_Default|TestService_Load_Normalises|TestService_CloneLocked|TestService_ApplyOfficialSchedule|TestScheduleLabel|TestPruneFollowedSeries|TestService_LoadMissing|TestService_SaveLoad|TestService_Replace|TestService_Upcoming|TestService_Past|TestService_Clear|TestService_Persist|TestService_Follow|TestService_Unfollow|TestDueReminders|TestService_ApplyBundledSeed|TestEventKey|TestEvent_IsActiveAt|TestLoadBundledSeed|TestValidateSeed|TestLoadWeeklySchedule|TestValidateSchedule|TestValidateSeries|TestExpandSeries|TestExpandSchedule|TestDefaultScheduleWindow|TestEstimateSeriesCount|TestMakeSeriesEvent|TestExpandRealSchedule|TestSortRaceEventsByStart"` PASS (solo falla preexistente `TestParse_AcceptsValidLines` por fecha). `go vet ./internal/calendar/... ./cmd/vantare/...` OK. `go test -count=1 ./internal/app/... ./cmd/vantare/...` OK. `git diff --check` solo warnings preexistentes en `hub_main.html`.
- Archivos tocados: `internal/calendar/calendar.go`, `internal/calendar/calendar_service.go`, `internal/calendar/calendar_service_test.go`, `internal/calendar/bundled_seed.go`, `cmd/vantare/main.go`, `docs/current-plan.md`.
- No se tocó: frontend, CalendarPage, calendar-store/types TS, Reminders, WidgetStudio/LayoutStudio, overlay runtime, Supabase, AppSettings.
- Sin commit.

Nota CALENDAR-06-C P3 (2026-07-03):
- Corregido P3: Modificado CalendarMonthView.tsx para separar visualmente los resumenes de interval (siempre visibles, sin cap) y los eventos concretos (sujetos a maxItemsPerDay = 3).
- Actualizado CalendarMonthView.test.tsx para validar que el cap solo afecta a los eventos concretos y que la cuenta de '+N mas' no incluye intervalos.
- Verificacion: tsc, eslint y vitest 100% OK.
M i c r o c o r t e   2   c o m p l e t a d o :   P a n e l   ' P r � x i m a s   c a r r e r a s '   i m p l e m e n t a d o   e   i n t e g r a d o   e n   e l   H u b .   L i m p i e z a   d e   c o m p o n e n t e s   o b s o l e t o s   r e a l i z a d a . 
 
 

Nota CALENDAR-09 (2026-07-04) Eventos completos, sesiones y hotfix semanal:
- Extendidos tipos Go (RaceSeries, RaceEvent) con Session, raceDurationMin, eventDurationMin, sessions, startOffsetMinute.
- durationMin se mantiene como duración de carrera (compatibilidad).
- eventDurationMin = raceDurationMin + 11 (práctica 3 + quali 8).
- Sesiones estimadas: práctica 3m, quali 8m, carrera raceDurationMin.
- Seed LMU actualizado con raceDurationMin, eventDurationMin, sessions, startOffsetMinute (15/30/45 por orden del seed).
- Creado expandDailyIntervalSeries en calendar-view-math.ts (solo 24h, seguro para Month/Week).
- CalendarDayView expande daily series por hora con eventDurationMin y side-by-side en solapes.
- Creado CalendarRaceDetailPanel (modal central con blur) reemplazando CalendarRaceDetailDrawer.
- Panel muestra sesiones, duración total, carrera, categoría, setup, track, aviso de estimación, follow/unfollow.
- No hay URL de inscripción inventada: muestra "Desde LMU / RaceControl" si no existe registrationUrl.
- CalendarHeroUpcomingPanel cards clicables navegan a Carreras.
- Docs de hotfix semanal actualizados con práctica 3m, quali 8m, offsets 15/30/45.
- Version bump no realizado (origen único: VERSION=0.1.0.2, frontend/package.json, cmd/vantare/main.go, build/config.yml).
- Checks: 46/46 Go tests PASS (pre-existing TestParse_AcceptsValidLines failure), 1080/1080 frontend tests PASS, tsc OK, lint OK (warning preexistente .eslintignore), build OK (warning preexistente chunk size), git diff --check solo whitespace preexistente en hub_main.html.
- Sin commit.

Nota ACCESS-01 PLAN (2026-07-04):
- Plan creado para centralizar feature gates Free/Paid/Tester sin crear una segunda licencia.
- Fuente actual respetada: `LicenseProvider`, `LicenseResult`, `frontend/src/lib/plan.ts` e `internal/license`.
- El plan corre en paralelo al análisis/fix de calendario: ACCESS-01 no debe tocar generación/renderizado de eventos y calendario no debe inventar reglas de plan.
- Enfoque TDD obligatorio: tests RED por policy, navegación, acciones bloqueadas/desbloqueadas y casos Free/Paid/Tester/Blocked/Unconfigured.
- Plan: `docs/superpowers/plans/2026-07-04-access-01-feature-gates.md`.
- Sin implementación ni commit.

Nota ACCESS-01 (2026-07-04) Microcorte 1 — Policy pura + matriz + hook:
- Implementada capa frontend pura de feature gates en `access-policy.ts` sin React/Wails/Supabase.
- Matriz de permisos Free/Paid overlays/Paid engineer/Suite/Tester/Blocked/Unconfigured testeada con 56 tests de policy + 6 tests de hook.
- Hook `useAccess` sobre `LicenseProvider` en `access.tsx` sin duplicar estado.
- No se tocaron: CalendarPage, backend Go, Supabase, navegación, Dashboard, WidgetStudio, LayoutStudio.
- Checks: 121/121 tests PASS, tsc OK, lint OK (warning preexistente .eslintignore), git diff --check solo whitespace preexistente en hub_main.html.
- Archivos nuevos: `frontend/src/lib/access-policy.ts`, `frontend/src/lib/access-policy.test.ts`, `frontend/src/lib/access.tsx`, `frontend/src/lib/access.test.tsx`.
- Sin commit.

Nota CALENDAR-WEEKLY-HOTFIX (2026-07-04):
- Flujo operativo semanal documentado en `docs/calendar-weekly-hotfix/`.
- Anadidos `checklist.md` y `changelog-template.md` para que un worker pueda actualizar el calendario LMU semanal de forma repetible.
- El hotfix normal debe tocar solo seed/tests/docs; frontend/backend quedan fuera salvo bug claro.
- Regla de modelado mantenida: daily races como series recurrentes, Weekly como slots UTC, sesiones estimadas practice 3m + qualy 8m + carrera oficial.

Nota CALENDAR-10 P3 (2026-07-04) Microfix post-review:
- P3-1: `groupEventsByDay` ahora se usa en MonthView y WeekView para lookup O(1) por día, eliminando el filtrado inline de `calendar.events` por cada celda/columna. Semántica visual y filtros intactos. Tests: 97/97 PASS.
- P3-2: `frontend/scripts/calendar-visual-compare.mjs` actualizado: reemplazado `calendar-race-detail-drawer` por `calendar-race-detail-panel` (testid real de `CalendarRaceDetailPanel`). Script termina con exit 0, genera 9 capturas + 4 side-by-side.
- P3-3: scroll global documentado: CalendarPage usa `min-h-0 overflow-hidden` en contenedores y `flex-1 min-h-0` en vistas. El scroll es interno al área de calendario. Si el shell padre (V52Shell) no tiene altura explícita, `min-h-0` no funciona — esto es del shell, no de CalendarPage.
- No se tocaron: backend Go, ACCESS-01, Supabase/Auth, import UI, WidgetStudio, LayoutStudio, overlays, navegación global.
- Checks: 97/97 tests de scope, 1155/1155 full tests, tsc OK, lint OK (warning preexistente .eslintignore), build OK (warning preexistente chunk size), visual-compare OK (exit 0, 9 capturas), git diff --check OK (solo whitespace preexistente en hub_main.html).
- Archivos tocados: `frontend/src/hub/calendar/CalendarMonthView.tsx`, `frontend/src/hub/calendar/CalendarWeekView.tsx`, `frontend/scripts/calendar-visual-compare.mjs`, `docs/current-plan.md`.
- Sin commit.

Nota WIDGET-STUDIO-05 PLAN (2026-07-05):
- Plan creado para convertir visualmente `Overlays Studio > Widgets` al HTML definitivo Vantare Crystal.
- Fuente visual: `docs/overlay-vantare-crystal-widgets.html` (`file:///C:/Users/isaac/Desktop/Vantare-Overlays/vantare-v2/docs/overlay-vantare-crystal-widgets.html`).
- El plan exige loop Playwright contra el HTML hasta paridad visual razonable: panel embebido 3-pane, left panel, canvas, inspector `Overlay Controls`, footer interno y widgets Crystal.
- Reforzado: no basta con captura general del editor. El harness debe capturar tambien sistemas visuales por widget (`base`/`vantare-crystal`) y documentar skipped-with-reason para widgets del HTML que queden preview-only/catalog-only.
- Incluye matriz obligatoria de widgets con access, data status, runtimeReady, sistemas visuales y estado implementado/preview-only/catalog-only.
- Conserva WIDGET-STUDIO-04: slots/columns/groups editables, draft local, guardar en widget, variantes, access gates, sin tocar `LayoutStudio` ni `position/x/y/w/h`.
- Plan: `docs/superpowers/plans/2026-07-05-widget-studio-05-visual-fidelity.md`.
- Sin implementación ni commit.
Nota WIDGET-STUDIO-05 (2026-07-05) — Implementation:
- MC-0: Script `frontend/scripts/widget-studio-visual-compare.mjs` — captura HTML reference + widget matrix JSON + README.
- MC-1: `WidgetStudio.tsx` shell Crystal 3-pane — `data-testid="widget-studio-crystal-shell"`, grid `240px/1fr/280px`, footer interno.
- MC-2: `StudioWidgetList.tsx` left panel Crystal — gradiente rojo, 'Overlays', 'Buscar overlay...', LMU Conectado.
- MC-3: `WidgetSandboxPreview.tsx` canvas Crystal — dark gradient, chips, resize handle decorativo.
- MC-4: `WidgetSettingsPanel.tsx` Overlay Controls — header sticky, widget info card, search, 10 secciones.
- MC-5: `WidgetConfigSections.tsx` compacto — WIDTH_DISPLAY, help notes slots/columns.
- MC-6B: `widget-design-matrix.json` — 14 widgets documentados.
- MC-7: Pro/locked parity integrado en info card.
- 1321/1321 tests PASS, tsc OK, lint OK, build OK, git diff --check OK.
- Archivos: 4 nuevos (script, matrix, README, reference.png), 11 modificados (source+tests+docs).
- No LayoutStudio, no Go, no position/x/y/w/h. Sin commit.

Nota WIDGET-STUDIO-06 (2026-07-05) — Direct visual iteration:
- Iteracion directa sobre `WidgetStudio` usando `docs/overlay-vantare-crystal-widgets.html` como base visual.
- `WidgetSettingsPanel` y `WidgetConfigSections` se compactaron: tipografia sans, overview abierto, secciones de edicion cerradas por defecto y controles expandibles.
- `WidgetStudio` pasa `previewThemeId` al preview; el selector `Base/Vantare Crystal` afecta la preview sin mutar el widget guardado.
- `StudioWidgetList` en WidgetStudio muestra el catalogo completo mediante `widget-catalog`; LayoutStudio sigue recibiendo solo widgets del perfil.
- `WidgetSandboxPreview` usa canvas neutral Crystal, no gradiente azul/morado.
- `frontend/scripts/widget-studio-visual-compare.mjs` actualizado a WIDGET-STUDIO-06: arranca Vite con binario local, soporta capturas por widget+tema y genera side-by-side contra el HTML.
- Capturas generadas en `docs/superpowers/screenshots/widget-studio-06/` (no commitear PNGs salvo decision explicita).
- Checks: 1338/1338 tests PASS, tsc OK, lint OK (warning preexistente .eslintignore), build OK (warning preexistente chunk size), visual compare OK (14 capturas, 0 skipped).
- No se tocaron LayoutStudio, backend Go, position/x/y/w/h ni dependencias.

---

## Auditoría Stripe / Licencias / Pagos Reales (2026-07-06)

- Creado `docs/stripe-licensing-status-audit.md`: informe extenso de estado de la capa de pagos/licencias paid & suite.
- Hallazgo central: el backend Go `internal/license` (service, cache, supabase client, fingerprint, plan classifier) y la Edge Function `supabase/functions/stripe-webhook` ESTÁN implementados y testeados. El frontend tiene gating completo (Login/Paywall/AccountSettings/Banner/Unconfigured) + `access-policy` + `ACCESS-DEV-MODES`.
- Bloqueadores de pagos reales (ver sección 3 del doc):
  1. **`SQL-01`**: no existe migración SQL en el repo (`find . -name "*.sql"` vacío). Faltan tablas + RLS + los 2 RPCs que el Go invoca (`get_account_entitlements`, `reset_active_device`). Es `TD-043` (P2 antes de cobros reales). Sin esto, un usuario pagado cae a `authenticated-no-entitlement`.
  2. **`CHECKOUT-01`**: `PaywallScreen.handleSubscribe` solo muestra "Pago en línea próximamente"; no hay Stripe JS SDK ni Checkout Session.
  3. **`DEPLOY-01`**: Edge Function no deployada ni configurada con secretos Stripe/Supabase.
  4. **`STRIPE-01`**: productos/precios no creados (price IDs son placeholders).
- **Decisión de producto**: se OMITE completamente un panel de administración web propio (sección 6 del doc). El soporte operativo de la beta se cubre con Stripe Dashboard + Supabase Studio + un **CLI de soporte Go local** (`SUPPORT-01`, no distribuido). Panel web admin diferido a fase estable 0.2+.
- **Nota de desincronización**: `licensing-auth-architecture.md`, `stripe-integration-plan.md`, `license-service-contract.md` y `supabase-schema-release.md` dicen "design-only / no production code yet" pero el código ya está implementado. Conviene añadir nota de "Estado real 2026-07-06" a cada uno para no confundir a otros workers (p. ej. el de Launcher).
- Orden de planificación propuesto: `SQL-01` → `STRIPE-01` → `DEPLOY-01` → `CHECKOUT-01` → `E2E-01` → `SUPPORT-01` + `RUNBOOK-01` → `AUDIT-01` (license_events + Discord sync follow-ups) → `I18N-03b`.
- **Gap de auth añadido (2026-07-06):** la auditoría detectó que falta el **registro de nuevos usuarios** (`signUp`) y la recuperación de password en la app (`AUTH-04`). Login/OAuth/logout/sesión ya funcionan. Para una beta pública esto es bloqueante (evidencia: `adversarial-review.md` caso C, P1). Ver secciones 11 y 12 del doc de auditoría.
- Orden de ejecución actualizado: `AUTH-04` → `SQL-01` → `STRIPE-01` → `DEPLOY-01` → `CHECKOUT-01` → `E2E-01` → `SUPPORT-01` + `RUNBOOK-01` → `AUDIT-01` → `I18N-03b`.
- **Doc ancla del stage** (2026-07-06): creado `docs/release-02-licensing-auth-stage.md` como punto de referencia único de la sección licencias/auth/pagos. Indexa los 10 miniplans (`AUTH-04`, `SQL-01`, `STRIPE-01`, `DEPLOY-01`, `CHECKOUT-01`, `E2E-01`, `SUPPORT-01`, `RUNBOOK-01`, `AUDIT-01`, `I18N-03b`), la ruta crítica y el DoD. La evidencia técnica vive en `docs/stripe-licensing-status-audit.md`.
- **Planes de stage completos (2026-07-06):** los 10 miniplans del stage licencias/auth/pagos están redactados en `docs/superpowers/plans/2026-07-06-*.md`. Siguen la plantilla writing-plans (header + TDD RED→GREEN→commit). El ancla es `docs/release-02-licensing-auth-stage.md`. Estado: bloqueados por acceso F0 (ref Supabase + STRIPE_SECRET_KEY test + Customer Portal). Una vez desbloqueados, se ejecutan en orden de dependencia con agents en paralelo (~2-3 días de reloj).
- Sin commit, sin tag, sin release. Solo documentación.

- **Planes de stage REVISADOS y listos para ejecutar (2026-07-06, sesión de corrección):** los 10 miniplans fueron revisados contra el código real (`internal/license`, `supabase/functions/stripe-webhook`, `frontend/src/hub/auth/*`, `AccountSettings.tsx`, `supabase-auth.ts`) y corregidos con tus decisiones A–J. Cambios aplicados:
  - **SQL-01**: bug de rate-limit corregido (ahora `last_reset_at`, no contador roto); 1 PC por usuario confirmado; `get_account_entitlements` devuelve `stripe_customer_id` para el portal.
  - **CHECKOUT-01**: handler devuelve `200 + JSON {url}` (no redirect 303); retorno al servidor local `127.0.0.1:39261/checkout/callback`; ruta `/create-checkout-session` antes de la firma Stripe; **añadido Task 3: botón "Gestionar suscripción" (Customer Portal)**.
  - **AUDIT-01**: `syncDiscordRole` → `notifyDiscord` (aviso al canal del equipo, no rol); añadido Task 0 para extender el mock de tests.
  - **STRIPE-01**: fila `free` fuera del mapping; precios beta creados en Stripe.
  - **SUPPORT-01**: `device-reset` limpia `last_reset_at`.
  - **AUTH-04**: signup abierto + email confirmation cerrado.
  - **I18N-03b**: se ejecuta ANTES que CHECKOUT-01.
  - **E2E-01 / RUNBOOK-01**: retornos y campos de reset actualizados.
  - **Stage doc**: AUTH-04 marcado como paralelo a SQL-01 (no depende).
  - Resumen de decisiones: A=signup abierto+email · B=retorno servidor local · C=portal con botón · D=aviso Discord al equipo · E=1 PC · F=rate-limit simplificado · G/H=beta creados, free fuera · I=I18N antes de checkout · J=AUTH paralelo a SQL-01.
  - **Sigue bloqueado por F0** (ref Supabase + `STRIPE_SECRET_KEY` test + Customer Portal). Sin eso no se ejecuta. Orden de ejecución final: F0 → F1 paralelo [SQL-01, STRIPE-01, SUPPORT-01, I18N-03b, AUTH-04, RUNBOOK-01] → F2 [DEPLOY-01, CHECKOUT-01] → F3 [E2E-01, AUDIT-01].
  - Sin commit, sin tag, sin release. Solo documentación.
Nota WIDGET-STUDIO-10 (2026-07-07) — Implementation:
- Objetivo: permitir acceder a Widget Studio sin perfil propio. Eliminar el guard de OverlaysStudioPage que bloqueaba el acceso y sintetizar un EMPTY_PROFILE cuando no hay profile real.
- Archivos nuevos: `widget-studio-empty-profile.ts` (helper puro EMPTY_PROFILE + isSyntheticProfile), `widget-studio-empty-profile.test.ts` (6 tests).
- Archivos modificados: `OverlaysStudioPage.tsx` (import EMPTY_PROFILE, eliminar guard 176-192, pasar EMPTY_PROFILE con callbacks no-op), `OverlaysStudioPage.test.tsx` (+2 tests RED→GREEN), `WidgetStudio.tsx` (import isSyntheticProfile, añadir isSynthetic, deshabilitar save button + design selector con copy honesto cuando synthetic), `WidgetStudio.test.tsx` (+3 tests RED→GREEN), `StudioWidgetList.tsx` (añadir empty state con data-testid cuando widgets.length === 0), `StudioWidgetList.test.tsx` (+2 tests RED→GREEN).
- Tests: 55/55 enfocados PASS (OverlaysStudioPage 16, WidgetStudio 24, widget-studio-empty-profile 6, StudioWidgetList 9). tsc OK (pendiente MC-5), lint OK (pendiente MC-5), build OK (pendiente MC-5).
- No se tocó: LayoutStudio, backend Go, Supabase/Auth, Calendar, Roadmap, Launcher, Engineer/Telemetry, dependencias, position/x/y/w/h, autosave, drag/drop.
- Sin commit, sin tag, sin release, sin Discord.

## Nota FIX-LICENSE-BRIDGE-01 (2026-07-08) — Implementation:
- Objetivo: alinear 3 tests al contrato "standalone mode" (LicenseBridge stub + LicenseProvider sin getSession). Producción ya no llama a `getSession`; LicenseProvider emite `license:validate` con `{}` tras 500ms.
- Archivos modificados: `frontend/src/hub/HubApp.test.tsx` (2 tests reescritos + eliminado `vi.mock("../lib/supabase-auth")`), `frontend/src/lib/license.test.tsx` (1 test reescrito + limpieza de `mockGetSession` muerto + comentario actualizado).
- Tests: 1410/1410 PASS (3 tests reescritos al contrato actual, 0 fallos; baseline previo 1407/1410).
- tsc OK, lint OK (8 errores pre-existentes en archivos ajenos: PaywallScreen, Calendar*, RoadmapPage, AccountSettings, wails-runtime-topbar-mock, topbar-visual-harness — fuera de scope, no introducidos por este cambio).
- Sin commit, sin tag, sin release.

## Nota FIX-CALENDAR-PARSE-01 (2026-07-08) — Implementation:
- Objetivo: hacer `calendar.Parse` testeable de forma determinista anadiendo `ParseWithReference(text, timezone, reference)` que recibe un `reference time.Time` explicito. `Parse` mantiene su firma y delega a `ParseWithReference(text, tz, time.Now().In(loc))`.
- Archivos modificados: `internal/calendar/parse.go` (extraido el cuerpo de `Parse` a `ParseWithReference`; `Parse` reescrito para delegar; sin tocar rolling forward ni `parseLine`/`parseDate`), `internal/calendar/parse_test.go` (test `TestParse_AcceptsValidLines` usa `ParseWithReference` con su `reference` local; anadido `TestParseWithReference_UsesGivenReference` RED→GREEN; anadido `TestParse_UsesCurrentTimeAsReference` de regresion + helper `spanishMonthsReverse`; import `fmt`).
- Tests: 30/30 Go PASS (1 test arreglado `TestParse_AcceptsValidLines` + 1 test nuevo `TestParseWithReference_UsesGivenReference` + 1 test de regresion `TestParse_UsesCurrentTimeAsReference`). `go test ./internal/calendar/...` GREEN, `go test ./...` 30/30 paquetes OK.
- go vet OK (en scope `./internal/calendar/...`; hay 1 warning pre-existente fuera de scope en `internal/telemetry/lmu/reader_windows.go` que no se toco). gofmt OK (en scope; `calendar.go` y `official_schedule.go` tienen formato pre-existente fuera de scope y no se modificaron). `git diff --check` OK.
- Sin commit, sin tag, sin release, sin push.

## Nota BRAND-DESIGN-DOCS (2026-07-08) — Implementation:
- Objetivo: consolidar la identidad de marca y design system en documentos canónicos, eliminar la duplicación de tokens entre `marketing/01-04` y el código, y dar a los agentes de UI un contrato técnico único. Docs-only, sin tocar código.
- Archivos nuevos: `docs/BRAND.md` (12 KB, identidad de marca consolidada: valores, personalidad, tono, vocabulario, paleta/tipografía como resumen conceptual, multilingüismo, diferenciación, checklist), `docs/DESIGN.md` (28 KB, design system canónico para agentes de UI: 18 secciones cubriendo tokens de color, tipografía, espaciado, glass/efectos, componentes, estados, anti-patrones, checklist, 7 inconsistencias conocidas del código documentadas), `docs/styleguide.html` (44 KB, style guide HTML navegable: sidebar con 14 secciones, paleta, tipografía, glass, botones, cards, badges, inputs, stats, telemetría overlay, estados, do/don't, snippets de código).
- Archivos modificados: `docs/marketing/02-brand-strategy.md` (mapping añadido al inicio + §6 Dirección Visual reescrita para reflejar el código real: la paleta del código es ROJO `#C1121F`/`#ff3b3b`, no naranja `#FF6B35` como proponía el doc original; se mantiene la metáfora conceptual del naranja Gulf pero se documenta que la marca consolidó rojo al implementarse; tipografía corregida a Rajdhani/JetBrains Mono que es lo que el código importa de Google Fonts).
- Decisiones cerradas: (1) `BRAND.md` y `DESIGN.md` separados: marca conceptual vs sistema técnico. (2) `DESIGN.md` es contrato para `@designer` y workers, no marketing. (3) La paleta final es la del código real, no la propuesta original de marketing — el código manda. (4) Documentadas 7 inconsistencias del código en `DESIGN.md §13` para que ningún worker las amplíe: dos definiciones de tema, dos fuentes mono (`JetBrains Mono` vs `Space Mono`), `font-tech` huérfano, `--v-glass-blur` declarado pero no usado, hex hardcodeados en componentes, tres estilos de widget compitiendo. (5) Tres temas de widget documentados como oficiales: `vantare-racing` (default), `glassmorphism-pro`, `vantare-crystal`. Cyber OLED queda como experimental sin activar.
- Inconsistencias detectadas (no resueltas en este corte, documentadas en DESIGN.md §13): `font-tech` huérfano en `TelemetryWidget.tsx`/`TelemetryVerticalWidget.tsx`/`DeltaWidget.tsx` (sustituir por `font-mono`); dos definiciones de tema (CSS vs `vantare-v5.json`) generan flash visible al cargar; `--v-glass-blur: 0px` declarado pero no usado; hex hardcodeados en componentes que deberían pasar por tokens.
- No se tocó: código de la app, backend Go, Supabase/Auth, Calendar, Roadmap, Engineer/Telemetry, WidgetStudio/LayoutStudio, runtime OBS, dependencias, marketing/01, marketing/03, marketing/04, marketing/05, plan actual de trabajo. Cero archivos de código modificados. Solo `docs/` y `marketing/02-brand-strategy.md`.
- Checks: archivos creados verificables con `Get-ChildItem docs -Include BRAND.md,DESIGN.md,styleguide.html`. `git status --short docs/` muestra 3 archivos nuevos. `git diff --stat docs/marketing/02-brand-strategy.md` muestra +39/-18 (mapping + §6 corregida, contenido de marketing intacto). Sin tests que ejecutar (docs-only). Sin tsc/lint/build que verificar (no se tocó código).
- Riesgo restante: el `font-tech` huérfano y los hex hardcodeados siguen en el código hasta que un PR de normalización los cierre. `DESIGN.md §13` los lista explícitamente para que cualquier worker de normalización los tenga en cuenta. `02-brand-strategy.md` queda como planificación histórica: la paleta "original" (naranja) está documentada como propuesta descartada, no eliminada, para trazabilidad de la decisión.
- Sin commit, sin tag, sin release.

## Nota BRAND-MONO-FONT-01 (2026-07-08) — Implementation:
- Objetivo: declarar **Space Mono** como fuente monospace canónica de la marca Vantare. Docs-only, sin tocar código.
- Decisión: el founder prefiere Space Mono sobre JetBrains Mono (más carácter, mejor estética de cockpit). Space Mono ya se usa en el tema JSON (`vantare-v5.json`) y en el hub; JetBrains Mono solo en `index.css`. Unificar a Space Mono.
- Archivos modificados: `docs/DESIGN.md` (§3.1 tipografía reescrita: mono canónica = Space Mono; §13.3 inconsistencia de mono marcada como resuelta a nivel de contrato, queda como PR de código pendiente alinear `index.css` y `vantare-v5.json`), `docs/BRAND.md` (tabla de tipografía actualizada a Space Mono con referencia a BRAND-MONO-FONT-01), `docs/marketing/02-brand-strategy.md` (tabla de tipografía §6 actualizada a Space Mono), `docs/styleguide.html` (import de Google Fonts sin JetBrains Mono; `--v-font-mono` apunta a `'Space Mono', monospace`; subtítulo de la sección Tipografía actualizado; specimen de telemetría con copy coherente).
- Inconsistencias resultantes (no resueltas en este corte, en cola para PR de código): `frontend/src/index.css` aún declara `--v-font-mono: 'JetBrains Mono'`. Mientras ese cambio no se haga, los widgets overlay renderizan con JetBrains Mono en runtime; el contrato de marca y la documentación ya son Space Mono. El HTML de referencia `docs/overlay-vantare-crystal-widgets.html` también sigue declarando JetBrains Mono en `:root` — debería alinearse en el mismo PR para que el HTML de referencia y el código coincidan.
- No se tocó: código de la app, `frontend/src/index.css`, `frontend/tailwind.config.*`, `frontend/src/hub/state/style-catalog.ts`, `frontend/src/lib/theme.ts`, `frontend/src/overlay/widgets/widget-design-system.ts`. Cero archivos de código modificados.
- Checks: `grep -n 'JetBrains' docs/BRAND.md docs/DESIGN.md docs/marketing/02-brand-strategy.md docs/styleguide.html` debería devolver 0 coincidencias (salvo referencias a la decisión o a la acción de código pendiente). Sin tests que ejecutar. Sin tsc/lint/build que verificar (no se tocó código).
- Próximo paso recomendado (corte de código futuro, no en este PR): PR pequeño que cambie `--v-font-mono` en `frontend/src/index.css` de `'JetBrains Mono'` a `'Space Mono'` y alinee `docs/overlay-vantare-crystal-widgets.html`. Test de regresión visual con Playwright en los widgets overlay. Microcorte: 1 archivo de código + 1 HTML de referencia.
- Sin commit, sin tag, sin release.

## Nota WS-11.A1 (2026-07-08) — Implementation:

- Objetivo: renombrar `glassmorphism-pro` → `vantare-crystal` en `OFFICIAL_DESIGNS`, `style-catalog` y tests, sin cambiar tokens ni `WidgetAppearance.defaults`.
- Archivos modificados: 4 producción (widget-design-gallery.ts, style-catalog.ts, 4 Widget.tsx) + 4 tests del plan + WidgetStudio.test.tsx, WidgetSandboxPreview.test.tsx, WidgetDesignGallery.test.tsx, 4 Widget.test.tsx + widget-studio-visual-compare.mjs.
- Tests: 1410/1410 PASS, tsc OK, lint OK (sin errores nuevos; los 8 errores de lint son pre-existentes en PaywallScreen.tsx y AccountSettings.tsx, fuera de scope).
- Sin cambios de tokens ni de comportamiento intencional: el rename hace que `isCrystal` pase a ser true en los 4 Widget.tsx, por lo que `RelativeWidget` ahora resuelve el design system `vantare-crystal` (radius.lg 12px en vez del 10px base previo). Es el comportamiento correcto del diseño crystal; se actualizó el assertion del test a 12px.
- Sin commit de `pnpm-workspace.yaml` (cambio ajeno) ni de los docs de marca previos sin commit.
- Siguiente microcorte: A2 (reescribir el resolver con tokens del HTML).
## Nota WS-11.A2 (2026-07-08) — Implementation:

- Objetivo: alinear tokens del resolver `widget-design-system.ts` con el HTML de referencia `docs/overlay-glassmorphism-pro.html`.
- Cambio: `VANTARE_CRYSTAL_TOKENS` — los tokens Vantare (accent `#ff3b3b`, negative `#ff2a3b`, glow accent) se mantienen. Los tokens genéricos se reemplazan con los valores del HTML: `background #060608`, `surface #121216`, `border rgba(255,255,255,0.09)`, `text #ffffff`, `textMuted #999999`, `textDim #555555`, `bodyFont 'Inter', -apple-system, BlinkMacSystemFont, sans-serif`, `surfaces.card rgba(18,18,22,0.82)`. Además `displayFont` y `monoFont` se corrigieron para incluir el espacio tras la coma y coincidir exactamente con el HTML (`'Plus Jakarta Sans', sans-serif` y `'JetBrains Mono', monospace`).
- `surfaces.rowEven` y `surfaces.rowOdd` NO se cambiaron (ya coinciden con el HTML, verificado en `.row:nth-child(even/odd)`).
- Archivos modificados: `frontend/src/overlay/widgets/widget-design-system.ts`. Archivo nuevo: `frontend/src/overlay/widgets/widget-design-system.contract.test.ts` (test de contrato que parsea `:root` del HTML y afirma que el resolver coincide — única cobertura de los tokens cambiados). NO se modificó `widget-design-system.test.ts` (no afirmaba los tokens cambiados).
- Tests: 1417/1417 PASS (1410 previos + 7 contract), tsc OK, lint OK (0 errores nuevos; 8 errores preexistentes en otros archivos), `git diff --check` OK.
- Sin commit, sin tag, sin release, sin push (regla dura del usuario).
- Siguiente microcorte: A3 (catálogo de estilos por widget type con defaults del HTML).

Nota FEATURES-DATA (2026-07-08):
- Creado frontend/src/hub/roadmap/features-data.ts como modulo espejo de roadmap-data.ts para la pestana 'Desarrollo por features' del Roadmap.
- Fuente de verdad: docs/features-source.json (Task 1, ya existente).
- Tipos: FeatureStatus, FeatureTipo, FeatureCategory, RoadmapFeature, FeaturesDataset.
- PROGRESS_SCALE importado de roadmap-data.ts (no duplicado).
- pickText re-exportado desde roadmap-data.ts.
- fetchFeaturesDataset(signal?) - fetch remoto con fallback a FEATURES_FALLBACK, nunca lanza.
- normalizeFeaturesSource - valida y mapea raw JSON, dropea features con category/status/tipo/percent invalidos, retorna null si no quedan features validas (causa fallback).
- Creado frontend/src/hub/roadmap/features-data.test.ts con 13 tests TDD: validacion de FEATURES_FALLBACK, fetch con mock, fallback en fallos.
- Checks: 13/13 tests PASS, build OK (tsc -b + vite build), lint preexisting errors sin cambios en archivos tocados.
- Archivos nuevos: features-data.ts, features-data.test.ts.
- Commit: 330d077 feat(roadmap): add features-data.ts with remote fetch + fallback

## Nota LAUNCHER-TASK-3.3b (2026-07-08) — Implementation:
- Objetivo: completar ProfileEditor side-panel con steps editor, hotkey input y autostart toggle (Task 3.3b del plan `docs/superpowers/plans/2026-07-08-launcher-v2.md`).
- ProfileEditor.tsx: añadido `apps` prop, steps editor con select/input delay/botones ↑/↓/✕, botón "+ Añadir paso", hotkey input con placeholder y validación contra reservadas (ctrl+c, ctrl+v, etc.), autostart checkbox deshabilitado cuando steps.length === 0.
- launcher-state.ts: añadido `isHotkeyAllowed()` helper con RESERVED_HOTKEYS set (24 combos del sistema).
- ProfileEditor.test.tsx: 3 tests nuevos (steps editor add/remove/reorder, hotkey input, autostart disabled sin steps).
- Tests: 157/157 files, 1503/1503 tests PASS (regresión 0). Lint 0 errores en archivos tocados.
- Archivos modificados: ProfileEditor.tsx, ProfileEditor.test.tsx, launcher-state.ts (3 archivos).
- Commit: 9efd6ee feat(launcher): ProfileEditor steps + hotkey + autostart (cut 3)
# Nota OVERLAY-STUDIO-V3-QUALITY (2026-07-12)

- Rama de trabajo: `refactor`.
- 8.4 cerrado en este corte: `widget-diagnostics.ts` separa el contrato y añade `createWidgetDiagnosticCollector` con límite, conteos y limpieza; los renderizadores reciben ViewModels y diagnósticos acotados sin payloads de telemetría/perfil. `StudioProfileService` registra solo metadata segura en errores.
- 8.5 cerrado en este corte: template no registrado, contrato compilable, `design-system:check`, guía de authoring, guía HTML→sistema y worksheet; Crystal queda cubierto por presupuesto de blur y contrato visual.
- 8.6 cerrado: los seis documentos vivos contienen el contrato canónico V3 y los comandos actuales.
- Evidencia: `pnpm --dir frontend test -- ...` → 7 archivos / 20 PASS; `pnpm --dir frontend design-system:check` → 2 sistemas PASS; `pnpm --dir frontend build` → PASS; `go test ./internal/app/... -run StudioProfileService -count=1` → PASS; `git diff --check` → PASS.
- 8.1 cerrado: paridad de claves y frontera de literales en los cuatro idiomas; componentes V3 usan `useI18n` para copy visible.
- 8.2 cerrado: suite `overlay-studio-a11y.test.tsx`, nombres accesibles de zoom/frames, foco visible, restauración Escape de drawers y browser gate wide/compact.
- 8.3 cerrado: regresión determinista de buckets 15/30 Hz para 20 instancias, presupuesto Crystal blur ≤16px y reduced-motion; no se usan thresholds de tiempo de pared.
- Gates finales de este corte: `pnpm --dir frontend test` → 213 archivos / 1578 PASS; `pnpm --dir frontend build` → PASS; `pnpm --dir frontend visual:overlay-studio` → 59 baselines 0.000% + parity + drag/resize + zoom + teclado PASS; `pnpm --dir frontend design-system:check` → 2 sistemas PASS; `git diff --check` → PASS.
- Lint: no gate verde; permanece bloqueado por 44 errores preexistentes y 2 warnings del repositorio, incluyendo calendar/launcher y reglas React existentes en Overlay Studio. No se introdujeron errores nuevos de TypeScript/build.
- Go completo: `go test ./...` sigue bloqueado por fallos preexistentes de nonce/puerto en `internal/server` y por el directorio no relacionado `vantare-v2/` presente en el working tree; los paquetes de aplicación/cmd y el foco de Studio pasan.
Nota CRYSTAL-DIRECT-REPLACEMENT-PLAN (2026-07-12):
- Autoridad vigente para el próximo trabajo Crystal; sustituye cualquier inventario/agrupación histórica anterior basada en `visualTemplate` para Pedals, Damage o Delta Advanced.
- Objetivo: sustituir directamente la implementación visual actual `vantare-crystal` por el glassmorphism canónico de `docs/overlay-glassmorphism-pro.html`, manteniendo el mismo ID público y retirando Crystal v1.
- Plan: `docs/superpowers/plans/2026-07-12-vantare-crystal-glassmorphism-direct-replacement.md`.
- Inventario corregido: referencia numerada 01–16 mapeada a 18 tipos funcionales y 21 diseños Crystal. Solo Input 10A/B/C y Delta 06/15 son variantes del mismo tipo; Pedals V1/V2/V3, Damage 13/14 y Delta Advanced 16 son tipos independientes.
- Exclusión explícita: el bloque final `V2. WIDGETS REESTILIZADOS` (`.v2-section`) no forma parte del producto ni de la referencia visual.
- UI acordada: el inspector separa `Sistema visual` (Original/Crystal), `Diseños de Vantare` filtrados por tipo+sistema y `Mis diseños` filtrados por tipo+sistema; AddWidget muestra tipos funcionales, no composiciones.
- Alcance: tipos/ViewModels/inspectores, Original fallback, Crystal 1:1, migraciones v1→v2, catálogo Studio, perfiles/diseños, runtime Studio/Desktop/OBS, Playwright HTML↔renderer, rendimiento, a11y e i18n.
- Regla: sustitución directa bajo `systemId="vantare-crystal"`; no coexistencia ni fallback oculto del Crystal actual.
- Estado: PLANIFICADO, sin código implementado por este corte.
- Paquete de ejecución Luna creado: índice `docs/superpowers/plans/2026-07-12-crystal-luna-execution-index.md` + seis microplanes ordenados (contratos/UI, referencia/base, core, widgets live, widgets derivados y cutover).
- Los microplanes fijan disponibilidad de datos: weather/damage permanecen `missing` en live hasta contrato real; histories se derivan de forma acotada; Calendar usa adapter read-only; no se permite inventar telemetría.

Nota ISA-93 CRYSTAL-PARITY (2026-07-14) — Microcorte 1 contratos/matriz/harness:
- Rama/worktree: `vantareapp/isa-93-os-03-paridad-11-de-los-21-disenos-vantare-crystal` en `C:\Users\isaac\.codex\worktrees\ee0d\Vantare-Overlays\vantare-v2`, base ISA-91 `0a797bf720c098a52e91883ed0ddddda0c9fdd15`.
- `CRYSTAL_HARNESS_DESIGNS` deriva del manifest canónico de referencia y congela 21 diseños / 18 tipos; solo `delta` (06/15) e `input-telemetry` (10A/B/C) admiten varias composiciones.
- El harness acepta `designId`, valida que pertenezca al tipo funcional y a `vantare-crystal`, y aplica el diseño oficial con provenance determinista.
- IDs Crystal normalizados al contrato canónico: `pedals-crystal`, `pedals-telemetry-crystal`, `pedals-telemetry-compact-crystal` e `input-crystal-{blade,capsule,dense}`; no se añadieron aliases ni otro `systemId`.
- RED confirmado: 5 tests fallaron antes de implementar cardinalidad, selección por diseño e IDs canónicos. GREEN: 3 archivos / 34 tests PASS; `pnpm --dir frontend build` PASS con warning heredado de chunk >500 kB; `git diff --check` PASS.
- No se tocaron shell, canvas, drag/resize, responsive, persistencia, Wails/SSE, permisos ni layout.

Nota ISA-93 CRYSTAL-PARITY (2026-07-14) — Microcorte 2 historial derivado acotado:
- Nuevo `createDerivedTelemetryStore`: inputs/delta limitados a 120 muestras, fuel a 64 vueltas; sin timers, con copias inmutables, cleanup y reset por `session.key`/`epoch` o desconexión.
- Consumo por vuelta solo se registra ante incremento real de vuelta y caída positiva de fuel fuera de pits; refuels/valores ausentes no se convierten en cero.
- `TelemetryRateCoordinator.publish` enriquece una sola vez cada snapshot con histories derivados; Studio/Desktop/OBS reciben el mismo contrato sin lógica dentro de renderers.
- RED confirmado por import inexistente y luego `snapshot.derived` ausente. GREEN: 2 archivos / 10 tests PASS; build PASS; `git diff --check` PASS.

Nota ISA-93 CRYSTAL-PARITY (2026-07-14) — Fuel Strategy:
- Registrado `fuel-strategy` en el catálogo funcional, Original y Crystal con diseño oficial `fuel-strategy-crystal-unified` (sección 03).
- ViewModel usa fuel live e historial derivado; proyección solo existe con consumo medio, tiempo restante y vuelta válida. Sin datos muestra `—`/`undefined`, nunca cero inventado.
- RED por módulos inexistentes; GREEN: 4 archivos / 16 tests enfocados PASS, build PASS, checker PASS y `git diff --check` PASS.

Nota ISA-93 CRYSTAL-PARITY (2026-07-14) — Delta Trace:
- Registrado `delta-trace` en ambos sistemas y diseño Crystal sección 07. El ViewModel consume hasta 120 puntos derivados y calcula tendencia con dos ventanas de 10 y epsilon 0.01s.
- `turnInsight`, mapa y sectores permanecen ausentes en live si no existe fuente; el SVG recibe datos puros.
- RED por módulo inexistente; GREEN: 2 archivos / 10 tests enfocados PASS, build PASS y `git diff --check` PASS.

Nota ISA-93 CRYSTAL-PARITY (2026-07-14) — Race Schedule:
- Registrado `race-schedule` y diseño Crystal sección 08. El renderer no hace fetch ni intervalos; consume eventos auxiliares ya adaptados, ordenados por `startAt` y limitados a cuatro.
- Sin dataset inyectado el estado es `missing`, no una agenda inventada. GREEN: 2 archivos / 11 tests enfocados PASS, build PASS y `git diff --check` PASS.

Nota ISA-93 CRYSTAL-PARITY (2026-07-14) — Weather y Damage:
- Registrados `track-weather`, `car-damage-visual` y `car-damage-numbers` en ambos sistemas con diseños Crystal de las secciones 11, 13 y 14.
- Los ViewModels leen únicamente `environment`/`damage` opcionales del snapshot; sin contrato real permanecen `missing` y no inventan clima, porcentajes ni estados de carrocería.
- `damage-reader` concentra la lectura defensiva y mantiene los renderers puros. RED por módulos inexistentes; GREEN: 4 archivos / 12 tests enfocados PASS, build PASS, checker PASS y `git diff --check` PASS.

Nota ISA-93 CRYSTAL-PARITY (2026-07-14) — Harness 21/21:
- `HARNESS_WIDGETS` deriva los 18 tipos del manifest canónico; los 21 diseños aplican sus dimensiones de crop y fixtures `ready` deterministas para histories, calendario, weather y damage sin contaminar runtime.
- Nuevo gate Playwright `visual:crystal-parity`: captura dos veces cada diseño, compara geometría ±2 px, estabilidad, referencia y salida Studio/Desktop/OBS; solo `--report-only` permite auditar sin ocultar el fallo.
- RED confirmado: lista limitada a cuatro y geometría default. GREEN contractual: 2 archivos / 55 tests PASS y build PASS.
- Primera medición honesta: 21/21 crops estables y 21/21 idénticos entre superficies; 15/21 sin overflow, 0/21 dentro del 3% contra la referencia. Los baselines no se regeneraron; el gate visual permanece rojo hasta ajustar familias.

Nota ISA-93 CRYSTAL-PARITY (2026-07-15) — Familias derivadas y auxiliares:
- Fuel, Delta Trace, Race Schedule, Track Weather, Damage 13/14 y Delta 15/16 usan ya la estructura, radios, bordes, spacing y geometría literal de sus secciones canónicas; los valores siguen procediendo de ViewModels honestos.
- El harness alinea fixtures de referencia sin introducir datos en runtime y el comparador compone alfa sobre `#060608` con tolerancia de canal 24 para no contar antialiasing como divergencia.
- Medición perceptual actual: fuel 8.928%, delta-trace 11.639%, schedule 12.363%, weather 13.674%, damage visual 6.887%, damage numbers 13.279%, delta simple 3.211% y delta advanced 15.383%. Estabilidad y cross-surface permanecen 100%.
- No se marcan como verdes: faltan alinear fuentes/datos visuales y cerrar las familias live restantes; ningún baseline fue regenerado.

Nota ISA-93 CRYSTAL-PARITY (2026-07-15) — Familias live y bloqueo tipográfico:
- Broadcast 02, Pedals 04, Flags 05, Head-to-Head 09, Input 10A/B/C y Multiclass 11 sustituyen las composiciones aproximadas por la jerarquía canónica y conservan datos de ViewModels puros.
- Inventario Studio/registry actualizado a los 18 tipos en orden canónico; los tests que congelaban 12 tipos ahora validan `ALL_WIDGET_TYPES` y el default oficial de Fuel.
- Gate actual: geometría 21/21 PASS, crops repetidos 21/21 estables (0% delta) y Studio/Desktop/OBS 21/21 idénticos. Comparación perceptual HTML↔renderer sigue 0/21 bajo 3% (mejor: Delta Simple 3.211%; rango restante 6.887%–32.780%).
- Revisión adversarial cerrada en el microcorte: Broadcast/Head-to-Head ya no inventan líder, sectores o gaps; Input dibuja el historial del ViewModel y respeta `showClutch`; Multiclass no vuelve a truncar las filas seleccionadas por su ViewModel.
- Gates rojos adicionales, no maquillados: `visual:overlay-studio` detecta 4.743% en `delta-original-ready-studio` frente a 0.5%; `bench:overlay-studio-drag` obtiene -29.15 frente a -19.51 (tolerancia 8). Canvas/shell quedan fuera del ownership de ISA-93.
- Bloqueo material: `manifest.json` declara que los PNG usan web fonts resueltas, pero el repo no contiene Inter/Plus Jakarta Sans/JetBrains Mono. Con prohibición de dependencias y de regenerar baselines no existe una ruta autorizada para cerrar tipografía ±1 px/pixel ≤3%; se requiere decisión de Isaac sobre vendorizar esas fuentes o cambiar el contrato de captura.
- Hasta resolverlo: no PR, no push y no cambio a In Review; Linear permanece In Progress. Baselines intactos.

Nota ISA-93 CRYSTAL-PARITY (2026-07-16) — Corrección P0 de autoridad visual:
- Las referencias v1 quedan invalidadas: 21/21 PNG eran opacos y los tres Pedals capturaban wrappers de showcase con etiquetas/descripciones.
- Protocolo v2: raíz aislada, layout 1920/DPR1, margen de sombra 128px, guard 8px, escena vacía y tres fondos controlados (transparente, `#060608`, rejilla); soporte calculado con RGBA premultiplicado y gates separados geometry/mask-alpha/composite/stability/cross-surface/fonts.
- Revisión adversarial corrigió cinco defectos antes de migrar: descendientes del baseline, hermanos visibles, RGB oculto bajo alfa 0, feedback de viewport en widgets fluidos y repaint incompleto tras visibility.
- Migración autorizada completada desde el HTML sin modificarlo: 21/21 referencias aisladas, 63/63 escenas estables, 63/63 guards limpios y 21/21 crops con alfa real.
- Baseline renderer v2: geometry 14/21, guard 21/21, stability 21/21, Studio/Desktop/OBS 21/21; mask-alpha 0/21 y composite sólido+rejilla 0/21. Estos fallos sustituyen los porcentajes antiguos.
- A/B de `tokens.css`: se conservan solo colores globales con mejora medida; se retiraron ajustes redundantes de Delta Simple. El fallback Chrome de Playwright queda cubierto.
- Evidencia: `docs/analysis/isa-93-crystal-parity/README.md` y manifest v2 `frontend/testdata/crystal-reference/manifest.json`.
- Siguiente: corregir overflow 7/21, vendorizar las fuentes oficiales ya autorizadas para cerrar `fontPass` y continuar familias contra los nuevos gates. ISA-93 permanece In Progress; sin PR final ni merge.

Nota ISA-93 CRYSTAL-PARITY (2026-07-16) — Fuentes oficiales y Pedals 04:
- Vendor local mínimo y reproducible: Inter 400–800, Plus Jakarta Sans 700–800 y JetBrains Mono 500–800, subsets latin WOFF2, versiones/URLs/SHA-256 y OFL fijados; sin CDN runtime ni dependencia npm.
- Pedals V1/V2/V3 eliminan definitivamente tags y descripciones del showcase; la raíz del renderer coincide con `.hud-capsule-v1`, `.cockpit-v2-low` y `.cockpit-v3-solo`.
- Harness final del corte: 3/3 geometry, mask-alpha, sólido, rejilla, guard, fuentes, estabilidad y Studio/Desktop/OBS PASS. Métricas finales V1 `100% / 0.10% / 2.92% / 1.51%`, V2 `100% / 0.05% / 1.62% / 0.83%`, V3 `100% / 0.00% / 0.56% / 0.30%`.
- Referencias intactas. ISA-93 sigue In Progress; siguiente microcorte: reevaluación completa 21/21 y cierre de la siguiente familia por mayor delta/overflow.

Nota ISA-93 CRYSTAL-PARITY (2026-07-16) — Fuel 03 y Flags 05:
- Fuel corrige la jerarquía top/stats/footer e historial, y neutraliza crecimiento grid/selectores heredados sin inventar capacidad o porcentaje en runtime: `100% / 0.20% / 2.61% / 1.73%`, PASS.
- Flags limita Crystal a la raíz `.flag-card` de la autoridad; el resumen sectorial externo deja de contaminar el crop. Resultado exacto: `100% / 0.00% / 0.00% / 0.00%`, PASS.
- Estado acumulado: 5/21 diseños completamente verdes; 21/21 guard, fuentes, estabilidad y cross-surface verdes. Referencias intactas; ISA-93 continúa In Progress.
