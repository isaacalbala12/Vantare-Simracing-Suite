# Sprint 8 — Testing + Release v1.0.0

## TL;DR

> **Quick Summary**: Sprint 8 is the final sprint before shipping v1.0.0. It delivers comprehensive E2E test coverage (~12 new tests), performance profiling (measure + report), cross-sim smoke testing with real iRacing/LMU, bug fixes, landing page (static HTML + GitHub Pages), documentation finalization, LICENSE file, GitHub Release v1.0.0 with changelog, final .exe build, and smoke test on clean Windows.
>
> **Deliverables**:
> - 6+ new E2E Playwright tests (overlay rendering, IPC, auth)
> - Performance report (`docs/PERFORMANCE-REPORT.md`)
> - Cross-sim smoke test evidence (.omo/evidence/sprint8/sim-smoke/)
> - Bug fixes (if any found)
> - Landing page: `docs/landing/` static HTML → GitHub Pages
> - `docs/README.md` + `docs/` finalized
> - `LICENSE` file (Proprietary)
> - GitHub Release v1.0.0 with changelog
> - `release/Vantare Overlays 1.0.0.exe` (portable)
> - Smoke test evidence on clean Windows
> - QA evidence in `.omo/evidence/sprint8/`
>
> **Estimated Effort**: Medium (9 tareas across 3 waves + final)
> **Parallel Execution**: YES — 3 waves + final
> **Critical Path**: Bug fixes → Version bump → .exe → GitHub Release

---

## Context

### Original Request
"Haz un plan para el sprint 8 e iniciamos!" — último sprint antes de release v1.0.0.

### Estado Actual (Post-Sprint 7)
- ✅ App funcional con 4 overlays, temas, auth, feature gating, tray, shortcuts, auto-updater
- ✅ 204 tests pasando (31 test files)
- ✅ Sprint 7 committeado y taggeado como `v1.0.0-beta.1`
- ✅ .exe portable generado (v1.0.0-beta.1)
- ✅ Icon assets existentes
- ❌ No hay E2E tests de auth ni overlay rendering
- ❌ No hay perfil de rendimiento
- ❌ No hay landing page
- ❌ No hay LICENSE file
- ❌ No hay GitHub Release
- ❌ No se ha probado con sim real

### Metis Review
**Hallazgos clave**:
- 🟢 Commit Sprint 7 + tag v1.0.0-beta.1 — **HECHO**
- 🟡 Landing page: Static HTML + GitHub Pages (sin backend, sin forms)
- 🟡 Discord: ya está configurado ("está hecho")
- 🟡 Performance profiling: solo medir y reportar (no optimizar)
- 🟡 E2E tests: ~12 tests nuevos
- 🔴 No existe CI/CD — toda validación es local
- 🔴 No existe LICENSE file
- 🔴 Root package.json en 0.1.0 (hay que bump a 1.0.0 también)

### Decisiones de Diseño Resueltas

| Decisión | Valor | Justificación |
|---|---|---|
| Landing page | Static HTML + GitHub Pages | Mínimo esfuerzo, deploy inmediato |
| Performance | Solo medir + reportar | No retrasar release por optimizaciones |
| E2E tests | ~12 tests | Cobertura suficiente para release |
| Discord | Ya configurado | No necesita trabajo |
| .exe type | Portable | Misma config que beta.1 |
| CI/CD | No (validación local) | Post-MVP |
| Sim real test | iRacing + LMU smoke | Validar detección y conexión |
| Version bump | Root + desktop a 1.0.0 | Consistencia |

---

## Work Objectives

### Core Objective
Completar testing integral, performance profiling, documentación, landing page, y GitHub Release v1.0.0 para distribuir la app a usuarios finales.

### Concrete Deliverables
- `apps/desktop/e2e/sprint8-auth.spec.ts` — Auth E2E tests (login, license gating)
- `apps/desktop/e2e/sprint8-overlays.spec.ts` — Overlay rendering E2E tests
- `apps/desktop/e2e/sprint8-ipc.spec.ts` — IPC state/mutation E2E tests
- `docs/PERFORMANCE-REPORT.md` — Performance profiling results
- `.omo/evidence/sprint8/sim-smoke/` — Cross-sim smoke test evidence
- `docs/landing/index.html` — Landing page static HTML
- `docs/landing/style.css` — Landing page styles
- `docs/landing/script.js` — Landing page JS (minimal)
- `LICENSE` — Proprietary license file
- `docs/CHANGELOG.md` — Release changelog
- GitHub Release v1.0.0 (draft)
- `release/Vantare Overlays 1.0.0.exe`
- `.omo/evidence/sprint8/` — QA evidence

### Definition of Done
- [ ] `pnpm test` pasa (tests existentes + nuevos)
- [ ] `pnpm typecheck` pasa
- [ ] `pnpm build` pasa
- [ ] `pnpm package` produce .exe en `release/`
- [ ] Performance report generado y guardado
- [ ] Landing page deployable en GitHub Pages
- [ ] LICENSE file creado
- [ ] GitHub Release v1.0.0 creada (draft)
- [ ] Cross-sim smoke test evidencia capturada

### Must Have
- 6+ nuevos E2E tests (overlay rendering, IPC, auth)
- Performance report documentado
- Landing page funcional (HTML estático)
- LICENSE file (Proprietary)
- CHANGELOG.md
- GitHub Release v1.0.0
- .exe final v1.0.0
- Sim smoke test evidence

### Must NOT Have (Guardrails)
- **NO** nuevas features (overlays, adaptadores, etc.)
- **NO** AC Evo
- **NO** NSIS installer (portable solo)
- **NO** optimizar basado en profiling (solo medir)
- **NO** modificar tests existentes (solo agregar)
- **NO** CI/CD pipeline
- **NO** tocar bridge types, sim-core, auth packages
- **NO** tocar overlays existentes

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed.

### Test Decision
- **Infrastructure exists**: YES — Vitest, Playwright, 204 tests
- **Automated tests**: Tests-after
- **Framework**: Vitest (unit), Playwright Electron (E2E)

### QA Policy
Every task includes agent-executed QA scenarios. Evidence to `.omo/evidence/sprint8/task-{N}-{scenario}.{ext}`.

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Bug fixes + Profiling + License — parallel):
├── T1: Bug fixes from Sprint 7 testing (if any)
├── T2: Performance profiling (measure + report)
├── T3: LICENSE file + root package.json version bump
└── T4: Documentation finalization + CHANGELOG

Wave 2 (E2E tests — parallel):
├── T5: E2E overlay rendering tests (~4 tests)
├── T6: E2E IPC state/mutation tests (~4 tests)
└── T7: E2E auth + license gating tests (~4 tests)

Wave 3 (Landing page + Release):
├── T8: Landing page (static HTML + GitHub Pages)
├── T9: Cross-sim smoke test (iRacing + LMU)
├── T10: GitHub Release v1.0.0 + .exe final
└── T11: QA evidence + full suite pass

Wave FINAL:
├── F1: Plan compliance audit (oracle)
├── F2: Code quality review (unspecified-high)
├── F3: Real manual QA (unspecified-high + playwright)
└── F4: Scope fidelity check (deep)

Critical Path: Bug fixes → E2E tests → .exe → GitHub Release
```

---

## TODOs

### Wave 1 — Bug Fixes + Profiling + Housekeeping

- [x] 1. **Bug fixes from Sprint 7** — `apps/desktop/`

  **What to do**:
  - Run `pnpm test --filter=desktop` and check for any failing tests
  - Check for any console errors or warnings during test runs
  - Verify no regressions introduced in Sprint 7
  - If bugs found, fix them. If none, document "No known bugs" in evidence
  - Specific check: `electron-builder.yml` has unused NSIS config block (pre-existing, not blocking)
  - Specific check: verify E2E tests don't produce console errors

  **Must NOT do**:
  - NO introduce nuevas features
  - NO modificar tests que están pasando

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: None needed

  **Parallelization**: Can run in parallel with T2, T3, T4
  **Blocks**: T2-T4
  **Blocked By**: None

  **Acceptance Criteria**:
  - [ ] `pnpm test` — 0 failures
  - [ ] No console errors in existing tests
  - [ ] Evidence saved if bugs found/fixed

- [x] 2. **Performance profiling (measure + report)** — `docs/PERFORMANCE-REPORT.md`

  **What to do**:
  - Crear script de profiling usando `performance.now()` y `process.memoryUsage()`
  - Medir:
    - App startup time (desde `app.whenReady()` hasta `ready-to-show`)
    - Render time per overlay (FPS usando `requestAnimationFrame` callback)
    - Memory usage (`process.memoryUsage().heapUsed`)
    - Telemetry pipeline latency (desde sim → IPC → Zustand → React)
  - Comparar con thresholds del roadmap:
    - Render time: < 16ms (60 FPS)
    - Memory: < 150MB
    - Startup: < 3s
  - Generar `docs/PERFORMANCE-REPORT.md` con resultados

  **Must NOT do**:
  - NO optimizar código basado en resultados
  - NO introducir nuevas dependencias

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: None needed

  **Parallelization**: Can run in parallel with T1, T3, T4
  **Blocks**: None
  **Blocked By**: None

  **Acceptance Criteria**:
  - [ ] `docs/PERFORMANCE-REPORT.md` exists
  - [ ] Report includes startup, render, memory, latency metrics
  - [ ] No code changes made (pure measurement)

- [x] 3. **LICENSE + root version bump** — `LICENSE`, `package.json`

  **What to do**:
  - Crear `LICENSE` file:
    ```
    Proprietary - All rights reserved.
    Copyright 2026 Vantare
    ```
  - Bump root `package.json` version from `0.1.0` to `1.0.0`
  - Verificar que `apps/desktop/package.json` ya está en `1.0.0-beta.1`
  - Actualizar a `1.0.0` en desktop package.json

  **Must NOT do**:
  - NO cambiar el tipo de licencia

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: None needed

  **Parallelization**: Can run in parallel with T1, T2, T4
  **Blocks**: T10 (release needs correct version)
  **Blocked By**: None

  **Acceptance Criteria**:
  - [ ] `LICENSE` file exists with correct text
  - [ ] Root `package.json` version is `1.0.0`
  - [ ] Desktop `package.json` version is `1.0.0`

- [x] 4. **Documentation finalization + CHANGELOG** — `docs/`, `README.md`

  **What to do**:
  - Crear `docs/CHANGELOG.md` con:
    ```markdown
    # Changelog

    ## 1.0.0 (2026-06-07)
    ### Added
    - 4 overlays: Standings, Relative, Delta Bar, Stream Alerts
    - Multi-sim support: iRacing, Le Mans Ultimate, Assetto Corsa
    - Theme system: Dark, Blood, Midnight + custom themes
    - Auth & licensing with Supabase (Free/Pro/Ultimate)
    - Feature gating
    - Offline mode (24h cache)
    - System tray with full context menu
    - Global keyboard shortcuts (Alt+H)
    - Auto-start + start-minimized
    - Auto-updater (electron-updater)
    - HTTP Server with SSE for OBS integration
    - Profile management
    - Hub UI: Dashboard, Settings, Themes, Account, Overlays
    ```
  - Revisar `README.md` y actualizar sección de estado si es necesario
  - Verificar que todos los documentos en `docs/` están actualizados

  **Must NOT do**:
  - NO cambiar documentación técnica de APIs

  **Recommended Agent Profile**:
  - **Category**: `writing`
  - **Skills**: None needed

  **Parallelization**: Can run in parallel with T1, T2, T3
  **Blocks**: T10 (release needs changelog)
  **Blocked By**: None

  **Acceptance Criteria**:
  - [ ] `docs/CHANGELOG.md` exists with v1.0.0 entry
  - [ ] README.md is consistent with current state

### Wave 2 — E2E Tests

- [x] 5. **E2E overlay rendering tests** — `apps/desktop/e2e/sprint8-overlays.spec.ts`

  **What to do**:
  - Crear ~4 tests E2E con Playwright Electron:
    1. Standings overlay renders with mock telemetry data
    2. Relative overlay renders with mock telemetry data
    3. Delta Bar overlay renders and updates with telemetry
    4. Stream Alerts overlay renders and auto-dismisses
  - Usar `window.vantare.*` bridge calls + `electronApp.evaluate()`
  - Seguir patrón de `sprint7-polish.spec.ts`

  **Must NOT do**:
  - NO modificar overlays existentes

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `playwright`

  **Parallelization**: Can run in parallel with T6, T7
  **Blocks**: T11
  **Blocked By**: None (depends on dist/ build)

  **Acceptance Criteria**:
  - [ ] 4 tests creados
  - [ ] Tests usan mock telemetry data
  - [ ] `pnpm test:e2e --list` muestra los specs

- [x] 6. **E2E IPC state/mutation tests** — `apps/desktop/e2e/sprint8-ipc.spec.ts`

  **What to do**:
  - Crear ~4 tests E2E con Playwright Electron:
    1. Settings save/read roundtrip (save settings, read back, verify)
    2. Theme switching works (set active theme, verify CSS vars)
    3. Profile CRUD (create profile, list profiles, verify)
    4. System tray minimize-to-tray + show
  - Usar `window.vantare.*` bridge API

  **Must NOT do**:
  - NO modificar handlers existentes

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `playwright`

  **Parallelization**: Can run in parallel with T5, T7
  **Blocks**: T11
  **Blocked By**: None

  **Acceptance Criteria**:
  - [ ] 4 tests creados
  - [ ] Tests verifican estado antes/después de mutaciones

- [x] 7. **E2E auth + license gating tests** — `apps/desktop/e2e/sprint8-auth.spec.ts`

  **What to do**:
  - Crear ~4 tests E2E con Playwright Electron:
    1. AuthService login flow (mock Supabase)
    2. License status returns tier (mock edge function)
    3. Feature gating: free user cannot access pro features (UI disabled)
    4. Offline mode: app works without network (cached license)
  - Usar mocks para Supabase (no dependencias de red)

  **Must NOT do**:
  - NO depender de Supabase real

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `playwright`

  **Parallelization**: Can run in parallel with T5, T6
  **Blocks**: T11
  **Blocked By**: None

  **Acceptance Criteria**:
  - [ ] 4 tests creados
  - [ ] Tests no dependen de red externa

### Wave 3 — Landing Page + Release

- [ ] 8. **Landing page (static HTML + GitHub Pages)** — `docs/landing/`

  **What to do**:
  - Crear `docs/landing/index.html`:
    - Hero section with app name + tagline
    - Features section (4 overlays, multi-sim, themes, auth)
    - Screenshots section (placeholder images)
    - Download CTA button linking to GitHub Releases
    - Discord invite link
    - Footer with copyright
  - Crear `docs/landing/style.css` (responsive, dark theme matching app)
  - Crear `docs/landing/script.js` (minimal - smooth scroll, CTA tracking)
  - NO backend, NO forms, NO analytics
  - NO screenshots reales (usar placeholders)
  - Para GitHub Pages: crear `docs/landing/` como subdirectorio del repo

  **Must NOT do**:
  - NO backend (no Node, no API)
  - NO forms (no email capture)
  - NO analytics
  - NO cambiar diseño de la app

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: None needed

  **Parallelization**: Can run in parallel with T9, T10
  **Blocks**: None
  **Blocked By**: None

  **Acceptance Criteria**:
  - [ ] `docs/landing/index.html` exists
  - [ ] `docs/landing/style.css` exists
  - [ ] Landing page loads in browser (no 404s)
  - [ ] Download CTA links to GitHub Releases
  - [ ] Responsive design (mobile + desktop)

- [x] 9. **Cross-sim smoke test (iRacing + LMU)** — `.omo/evidence/sprint8/sim-smoke/`

  **What to do**:
  - Verificar que los adaptadores de sim existen y se cargan:
    - `apps/desktop/src/main/sim/adapters/iracing-adapter.ts` — exists
    - `apps/desktop/src/main/sim/adapters/lmu-adapter-v2.ts` — exists
  - Verificar que SimManager detecta ambos sims (vía IPC `getAvailableSims`):
    - handlers.ts `ipcMain.handle('getAvailableSims')` returns `['iracing', 'lmu', 'ac']`
  - Verificar que el SimSwitcher UI muestra ambos sims
  - Si hay acceso a sims reales: conectar y verificar telemetría
  - Si no: documentar "requires physical sim" y verificar detección
  - Guardar evidencia en `.omo/evidence/sprint8/sim-smoke/`

  **Must NOT do**:
  - NO modificar adaptadores de sim
  - NO requerir sims reales para CI

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: None needed

  **Parallelization**: Can run in parallel with T8, T10
  **Blocks**: None
  **Blocked By**: None

  **Acceptance Criteria**:
  - [ ] SimManager returns all 3 sims
  - [ ] Adapter files exist
  - [ ] Evidence saved

- [ ] 10. **GitHub Release v1.0.0 + .exe final** — `apps/desktop/`

  **What to do**:
  - Version check: root `package.json` = `1.0.0`, desktop = `1.0.0`
  - `pnpm build` → verify passes
  - `pnpm package` → produce `release/Vantare Overlays 1.0.0.exe`
  - Crear GitHub Release (draft) usando `gh` CLI:
    ```bash
    gh release create v1.0.0 --title "Vantare Overlays v1.0.0" --notes-file docs/CHANGELOG.md --draft
    ```
  - Subir `.exe` como asset:
    ```bash
    gh release upload v1.0.0 release/Vantare\ Overlays\ 1.0.0.exe
    ```
  - Si `gh` CLI no está configurado: documentar pasos manuales

  **Must NOT do**:
  - NO publicar release (solo draft)
  - NO firmar el .exe

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: None needed

  **Parallelization**: Depends on T3 (version), T4 (changelog)
  **Blocks**: T11
  **Blocked By**: T3, T4

  **Acceptance Criteria**:
  - [ ] `pnpm build` exit 0
  - [ ] `pnpm package` exit 0, .exe in release/
  - [ ] GitHub Release v1.0.0 created (draft) with .exe asset

- [ ] 11. **QA evidence + full suite pass** — `.omo/evidence/sprint8/`

  **What to do**:
  - Crear `.omo/evidence/sprint8/README.md`
  - Ejecutar todos los QA scenarios
  - Evidencia en `.omo/evidence/sprint8/task-{N}-{scenario}.{ext}`
  - Verificar: `pnpm test`, `pnpm typecheck`, `pnpm build`, `pnpm package`

  **Must NOT do**:
  - NO falsificar evidencia

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `playwright`

  **Parallelization**: Depends on T5, T6, T7, T10
  **Blocks**: F1-F4
  **Blocked By**: T5, T6, T7, T10

  **Acceptance Criteria**:
  - [ ] `pnpm test` pasa
  - [ ] `pnpm typecheck` pasa
  - [ ] `pnpm build` pasa
  - [ ] Evidencia completa

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read plan and verify: Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `tsc --noEmit` + linter + `pnpm test`. Check: unused imports, console.log, regressions.

- [ ] F3. **Real Manual QA** — `unspecified-high` (+ `playwright`)
  Execute EVERY QA scenario from EVERY task. Cross-task integration. Edge cases.

- [ ] F4. **Scope Fidelity Check** — `deep`
  Verify 1:1 — everything in spec was built, nothing beyond spec. Check "Must NOT do" compliance.

---

## Commit Strategy

- **T1**: `fix(app): resolve Sprint 7 bugs`
- **T2**: `docs(perf): add performance profiling report`
- **T3**: `chore(repo): add LICENSE, bump version to 1.0.0`
- **T4**: `docs(repo): finalize documentation and CHANGELOG`
- **T5**: `test(e2e): add overlay rendering E2E tests`
- **T6**: `test(e2e): add IPC state/mutation E2E tests`
- **T7**: `test(e2e): add auth and license gating E2E tests`
- **T8**: `feat(landing): add landing page (static HTML + GitHub Pages)`
- **T9**: `test(sim): cross-sim smoke test evidence`
- **T10**: `chore(release): v1.0.0`
- **T11**: `chore(sprint8): add QA evidence`

---

## Success Criteria

### Verification Commands
```bash
pnpm typecheck      # Expected: 0 errors
pnpm test           # Expected: all tests pass
pnpm build          # Expected: exit 0
pnpm package        # Expected: .exe in release/
```

### Final Checklist
- [ ] All Must Have items checked in F1 audit
- [ ] All Must NOT Have items absent
- [ ] All tests pass
- [ ] .exe v1.0.0 exists
- [ ] GitHub Release created (draft)
- [ ] Landing page deployable
- [ ] Performance report saved
