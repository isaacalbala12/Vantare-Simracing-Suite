# Matriz de Severidad

Resumen por severidad, categoría, si es NUEVO o YA DOCUMENTADO, y archivo.

| # | Hallazgo | Cat | Sev | Estado | Archivo |
|---|---|---|---|---|---|
| 1 | Notificaciones Ingeniero no llegan (SSE churn 30Hz) | PERF/BUG | **P0** | NUEVO | `EngineerNotificationsWidget.tsx:77` |
| 2 | Re-render raíz 30Hz | PERF | P1 | YA DOC (TD-006) | `ObsOverlayApp.tsx` |
| 3 | Normalización variantes por tick (x2) | PERF | P1 | YA DOC (TD-007) | `ObsOverlayApp.tsx:155` |
| 4 | Onboarding `unconfigured` → blank | BUG | P1 | YA DOC (TD-046) | `OnboardingFlow.tsx:116` |
| 5 | Secciones premium sin AccessGate | BUG/SEC | P1 | NUEVO | `HubApp.tsx:200` |
| 6 | Selector diseño WidgetStudio sin `canApply` | BUG/SEC | P1 | NUEVO | `WidgetStudio.tsx:112` |
| 7 | SSE sin auth | SEC | P1 | NUEVO | `sse.go:14` |
| 8 | SSE sin límite conexiones (DoS) | SEC/PERF | P1 | NUEVO | `sse.go:1` |
| 9 | ProfileService/HubService sin mutex (race) | BUG | P1 | NUEVO | `profile_service.go:17` |
| 10 | `settings:save` no valida LauncherApps | SEC | P1 | NUEVO | `settings_service.go:225` |
| 11 | `settings:save` limpia `activeOverlayProfileId` | BUG | P1 | YA DOC (TD-041) | `SettingsPage.tsx:252` |
| 12 | Login/Paywall en español hardcodeado | BUG | P1 | YA DOC (I18N-03b) | `LoginScreen.tsx:1` |
| 13 | `translate()` devuelve key (enmascara) | BUG | P1 | YA DOC | `i18n.ts` |
| 14 | Cast `as OverlayStatus` sin validar | BUG | P1 | NUEVO | `OverlaysStudioPage.tsx:72` |
| 15 | BroadcastTower `setInterval` no hidden | PERF | P2 | NUEVO | `BroadcastTowerWidget.tsx:45` |
| 16 | MulticlassRelative `setInterval` no hidden | PERF | P2 | NUEVO | `MulticlassRelativeWidget.tsx:54` |
| 17 | `diff.Compute` allocs/emit sin pool | PERF | P2 | NUEVO | `diff.go:23` |
| 18 | `vehiclesChanged` allocs 60+30Hz | PERF | P2 | NUEVO | `filter.go:168` |
| 19 | `ValidateAddr` OK pero falta toggle UI LAN | SEC | P2 | YA DOC | `server.go:113` |
| 20 | `SaveProfile` sin rollback atómico | BUG | P2 | NUEVO | `profile_service.go:74` |
| 21 | `nonceStore.Generate()` panic fuera main | SEC | P2 | NUEVO | `server.go:39` |
| 22 | Updater UX fragmentada | BUG | P2 | YA DOC (TD-020) | `UpdateBanner/SettingsPage` |
| 23 | Firma de código ausente | SEC | P2 | YA DOC (TD-027) | release pipeline |
| 24 | TD-015 review seguridad real pendiente | SEC | P2 | YA DOC | auth/licencias |
| 25 | Hotkey dead code `nameToAction` | BUG | P3 | NUEVO | `hotkeys.go:288` |
| 26 | Gaps test UnconfiguredScreen | BUG | P3 | YA DOC (TD-045) | — |
| 27 | betaWelcome legacy sin rol | BUG | P3 | YA DOC (TD-048) | `HubApp.tsx:136` |
| 28 | ActiveOverlayCard no consulta estado | BUG | P3 | YA DOC (TD-047) | — |
| 29 | engineer-notifications sin edit frame | BUG | P3 | YA DOC (TD-036) | — |
| 30 | Vitest ECONNREFUSED ruido | BUG | P3 | YA DOC (TD-042) | — |
| 31 | Múltiples rAF concurrentes | PERF | P3 | YA DOC (TD-010) | widgets/* |
| 32 | Playwright harness ausente | PERF | P3 | YA DOC (TD-008) | — |

## Conteo

- **P0:** 1
- **P1:** 13 (2 YA DOC, 11 NUEVOS)
- **P2:** 9 (4 YA DOC, 5 NUEVOS)
- **P3:** 8 (6 YA DOC, 1 NUEVO, 1 mixto)

## NUEVOS relevantes (no en docs previos)
Bloqueantes/medianos nuevos: #1, #5, #6, #7, #8, #9, #10, #14, #15, #16, #17, #18, #20, #21, #25.
Es decir: **la auditoría encontró 15 hallazgos nuevos** (1 P0, 8 P1, 5 P2, 1 P3) que no estaban en `technical-debt.md` ni en las auditorías previas de `docs/`. La mayoría son de concurrencia Go, gating inconsistente de UI y SSE sin protección — superficie que las auditorías previas no cubrieron en profundidad.
