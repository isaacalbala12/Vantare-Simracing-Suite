# Sprint 6 — Themes + Auth + Feature Gating + Offline Mode

## TL;DR

> **Quick Summary**: Completar el sistema de temas con ThemeProvider, CSS variables dinámicas, página de temas en el Hub y editor visual básico. Conectar autenticación real con Supabase (Auth + licencias + HWID binding + edge function). Implementar feature gating por tier (Free/Pro/Ultimate) con bloqueo de UI en tiempo real. Construir offline mode con cache de licencia de 24h y grace period degradado.
>
> **Deliverables**:
> - `packages/ui-core/src/themes/` — ThemeProvider, useTheme, useOverlayTheme, theme-utils, built-in themes
> - `apps/desktop/src/renderer/hub/pages/ThemesPage.tsx` — Selector + editor visual de temas
> - `apps/desktop/src/renderer/hub/pages/AccountPage.tsx` — Login, register, license display
> - `packages/auth/src/supabase-client.ts` + `auth-service.ts` — Cliente Supabase real con secure storage
> - `supabase/functions/validate-license/index.ts` — Edge function de validación con HWID
> - `packages/auth/src/feature-gate.ts` + `useLicense.ts` — Feature gating por tier
> - `packages/auth/src/offline-manager.ts` — License cache TTL 24h + grace period
> - DB migrations SQL (`supabase/migrations/`) — profiles, licenses, subscriptions, validations
> - 35+ tests nuevos (unit + component + integration)
>
> **Estimated Effort**: XL (22 tareas across 4 waves + final)
> **Parallel Execution**: YES — 4 waves + final
> **Critical Path**: T1 (Theme types/schema) → T3-T5 (ThemeProvider + CSS vars) → T10 (ThemesPage) → T13 (Supabase setup) → T14-T16 (Auth service real) → T19-T20 (Feature gating) → T22 (Offline mode)

---

## Context

### Original Request
"Necesito que hagas un plan para poder completar el sprint 6. Debe de ser completo para analizarlo completamente."

### Estado Actual del Proyecto (Pre-Sprint 6)

**Lo que YA existe** (heredado de sprints 1-5):
- Monorepo funcional con pnpm, turbo, TypeScript, Electron 33+, Tailwind v4
- 3 temas built-in JSON en `apps/desktop/src/renderer/themes/` (dark, blood, midnight)
- Tipos `Theme` en `shared/types/theme.ts` (muy simplificado)
- Handlers IPC para themes (`themes:get`, `themes:save`, `themes:set-active`, `themes:delete`)
- Preload expone métodos de themes
- `useTheme` hook mínimo en `packages/ui-core/src/hooks/useTheme.ts`
- `AuthService` mock en `packages/auth/src/index.ts` (solo en memoria, sin Supabase)
- Handlers IPC para auth (`auth:login`, `auth:register`, `auth:logout`, `auth:session`, `auth:license-status`)
- Bridge types con todos los canales necesarios
- Hub UI con Dashboard, Settings, Profiles, Overlays, Inspector
- Electron-store persistencia para settings, profiles, themes, activeThemeId

**Gaps identificados** (lo que falta implementar):
- No hay `ThemeProvider` React Context que aplique CSS variables dinámicamente
- Los tokens actuales no siguen el schema completo del THEME-SYSTEM.md (56 tokens)
- No hay página `ThemesPage` ni editor visual en el Hub
- No hay import/export de temas JSON
- No hay overlay-scoped theme overrides funcionando
- AuthService no está conectado a Supabase
- No hay proyecto Supabase configurado ni variables de entorno
- No hay tablas de DB (profiles, licenses, subscriptions, validations)
- No hay RLS policies
- No hay edge function `validate-license`
- No hay HWID binding
- No hay secure JWT storage (electron-safe-storage)
- No hay enum `Feature` ni mapping `tierFeatures`
- No hay hooks `useLicense` / `useFeatureGate`
- No hay UI bloqueando features premium (badges, upgrade prompts)
- No hay license caching para offline
- No hay grace period ni degradación de features offline
- No hay AccountPage en el Hub

### Metis Review
**Gaps identificados**:
- **Gap 1**: Theme system es "media implementación" — falta el núcleo dinámico (CSS vars + provider)
- **Gap 2**: Auth es 100% mock — necesita conexión real a Supabase para ser un producto freemium
- **Gap 3**: Feature gating no existe en UI — cualquier usuario puede acceder a todo
- **Gap 4**: Offline mode no está diseñado — el producto debe funcionar 24h sin internet
- **Gap 5**: No hay caché de licencia con TTL — toda validación es en tiempo real
- **Gap 6**: Supabase service_role_key no debe exponerse en renderer (solo main process)

### Decisiones de Diseño Resueltas

| Decisión | Valor | Justificación |
|---|---|---|
| Supabase client location | `packages/auth/src/` compartido | Reutilizable entre desktop y futuros packages |
| Secure storage | `electron-safe-storage` en main process | El renderer NUNCA toca JWT en crudo |
| HWID source | `machine-id` + `cpu serial` + `motherboard serial` | Suficiente para v1.0; tolerancia 80% similitud |
| Theme tokens schema | 56 tokens normalizados (THEME-SYSTEM.md) | Compatibilidad futura con community themes |
| CSS vars strategy | Inyección en `document.documentElement` en tiempo real | Funciona en BrowserWindows independientes |
| Tailwind v4 @theme | Mantiene variables conectadas a utility classes | Evita recompilación al cambiar tema |
| Feature gating UI | Badges + disabled state + `UpgradePrompt` | No bloquear agresivamente, convertir a upgrade |
| Offline grace period | 24h TTL cache, 72h grace period read-only | Balance UX vs seguridad |

---

## Work Objectives

### Core Objective
Transformar el sistema de temas en un producto visual completo con 3 temas built-in, editor visual, y aplicación dinámica de CSS variables. Conectar la autenticación a Supabase con licencias reales, HWID binding, y feature gating. Garantizar que la app funcione offline 24h con cache de licencia.

### Concrete Deliverables
- `packages/ui-core/src/themes/types.ts` — Schema completo de 56 tokens con Zod
- `packages/ui-core/src/themes/defaults.ts` — 3 temas built-in normalizados (dark, blood, midnight)
- `packages/ui-core/src/themes/ThemeProvider.tsx` — React Context + inyección de CSS variables
- `packages/ui-core/src/themes/useTheme.ts` — Hook completo (setTheme, setToken, availableThemes, etc.)
- `packages/ui-core/src/themes/useOverlayTheme.ts` — Hook con overlay overrides
- `packages/ui-core/src/themes/theme-utils.ts` — merge, validation, contrast check
- `packages/ui-core/src/themes/export-import.ts` — Serialización JSON de themes
- `apps/desktop/src/renderer/hub/pages/ThemesPage.tsx` — Página de gestión de temas
- `apps/desktop/src/renderer/hub/components/ThemeEditor.tsx` — Editor visual de tokens básicos
- `apps/desktop/src/renderer/hub/components/ThemeSelector.tsx` — Selector de temas reutilizable
- `apps/desktop/src/renderer/hub/components/UpgradePrompt.tsx` — Prompt para features bloqueadas
- `apps/desktop/src/renderer/hub/pages/AccountPage.tsx` — Login/register + estado de licencia
- `apps/desktop/src/renderer/shared/stores/auth-store.ts` — Zustand store de auth
- `packages/auth/src/supabase-client.ts` — Cliente Supabase conectado a proyecto real
- `packages/auth/src/auth-service.ts` — AuthService real (no mock) con secure storage
- `packages/auth/src/license-validator.ts` — Validación de licencia contra edge function
- `packages/auth/src/hwid.ts` — Generación de HWID
- `packages/auth/src/feature-gate.ts` — Enum Feature + tierFeatures + hasFeature()
- `packages/auth/src/hooks/useLicense.ts` — Hook de licencia + feature gating
- `packages/auth/src/offline-manager.ts` — License cache TTL + grace period
- `supabase/migrations/001_initial_schema.sql` — DB schema completo
- `supabase/functions/validate-license/index.ts` — Edge function de validación
- `supabase/functions/register-user/index.ts` — Edge function de registro con licencia free
- `.env.example` — Variables de entorno documentadas (SIN valores reales)

### Definition of Done
- [ ] `pnpm test` pasa (todos los tests existentes + 35+ tests nuevos)
- [ ] `pnpm typecheck` pasa sin errores
- [ ] 3 temas built-in aplican CSS variables dinámicamente sin recargar
- [ ] ThemesPage permite cambiar tema, crear custom theme, importar/exportar JSON
- [ ] AuthService conecta a Supabase real: login, register, logout, session funcional
- [ ] LicenseValidator consulta edge function y retorna tier correcto
- [ ] HWID se genera consistentemente y se vincula a licencia
- [ ] Feature gating: Free tier no puede activar LMU/AC/custom themes (UI bloqueada)
- [ ] Offline mode: app funciona 24h sin internet con licencia cacheada
- [ ] AccountPage renderiza estado de licencia, email, y botón logout
- [ ] QA evidence guardada en `.omo/evidence/sprint6/`

### Must Have
- ThemeProvider montado en root de la app (App.tsx)
- CSS variables inyectadas en `document.documentElement` al cambiar tema
- Todos los componentes existentes usan tokens del tema activo (no hardcoded)
- Schema Zod para Theme con validación de 56 tokens
- Supabase client config via variables de entorno (`SUPABASE_URL`, `SUPABASE_ANON_KEY`)
- Service role key NUNCA en renderer (solo main process / edge functions)
- JWT almacenado en `electron-safe-storage` (main process)
- Edge function `validate-license` con HWID binding + rate limiting
- Tablas: `profiles`, `licenses`, `subscriptions`, `license_validations`, `hwid_changes`
- RLS policies habilitadas en todas las tablas de usuario
- Feature enum con al menos 12 features mapeadas a tiers
- `tierFeatures` mapping explícito (free/pro/ultimate)
- License cache TTL = 24h, grace period = 72h
- Offline degradado: si cache expira, revertir a free tier

### Must NOT Have (Guardrails)
- **NO** exponer `SUPABASE_SERVICE_ROLE_KEY` en renderer process
- **NO** almacenar JWT en `localStorage`, `sessionStorage`, o memoria del renderer
- **NO** modificar el schema de Telemetry ni SimAdapter
- **NO** romper overlays existentes (Standings, Relative, Delta Bar, Stream Alerts)
- **NO** ejecutar migrations destructivas sin backup en Supabase
- **NO** permitir que un usuario free acceda a features pro/ultimate sin upgrade
- **NO** bloquear toda la app si Supabase está offline (degradar a free tier)
- **NO** modificar `packages/sim-core` excepto para agregar exports si es necesario
- **NO** cambiar la estructura del bridge existente (solo agregar canales si es necesario)

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed.

### Test Decision
- **Infrastructure exists**: YES — Vitest, Playwright, bun test, Storybook
- **Automated tests**: TDD (RED → GREEN → REFACTOR) para lógica compleja; tests de componente con Testing Library
- **Framework**: Vitest (packages/auth, packages/ui-core), Playwright (desktop Hub pages)

### QA Policy
Cada tarea incluye agent-executed QA scenarios. Evidence se guarda en `.omo/evidence/sprint6/task-{N}-{scenario-slug}.{ext}`.

- **Theme tests**: Vitest — cambio de tema aplica CSS vars, validación de schema, import/export roundtrip
- **Auth tests**: Vitest con mocks de Supabase + tests de integración contra edge function local (si es posible)
- **Feature gating tests**: Vitest — matriz tier × feature, asserts de hasFeature()
- **Offline tests**: Vitest — clock mocking para TTL, transición online → offline
- **UI tests**: Playwright — login form, theme switch, feature blocked badge

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation — Theme core types + Auth infra):
├── T1: Theme schema Zod completo (56 tokens)
├── T2: Normalizar 3 temas built-in al schema completo
├── T3: ThemeProvider + inyección CSS variables
├── T4: useTheme + useOverlayTheme hooks
├── T5: theme-utils (merge, validation, contrast)
└── T6: Setup Supabase project + variables de entorno + .env.example

Wave 2 (Auth backend + Theme persistence):
├── T7: DB migrations (profiles, licenses, subscriptions, validations)
├── T8: RLS policies
├── T9: Edge function validate-license (HWID binding)
├── T10: Edge function register-user (crea licencia free)
├── T11: packages/auth supabase-client + secure storage
├── T12: AuthService real (login/register/logout/session)
└── T13: HWID generation + LicenseValidator

Wave 3 (UI Pages + Feature Gating):
├── T14: ThemesPage — selector + listado
├── T15: ThemeEditor — editor visual de tokens básicos
├── T16: Theme import/export JSON
├── T17: AccountPage — login/register forms + license display
├── T18: Feature enum + tierFeatures mapping
├── T19: useLicense hook + hasFeature()
├── T20: Feature gating UI (badges, disabled, UpgradePrompt)
└── T21: Wire feature gating en overlays/settings existentes

Wave 4 (Offline Mode + Integration):
├── T22: OfflineManager — license cache TTL 24h + grace period
├── T23: Integrar OfflineManager en AuthService
├── T24: Actualizar electron-store schema para license cache
├── T25: Integrar ThemeProvider en App.tsx y overlay windows
├── T26: Refactorizar componentes hardcodeados a tokens del tema
├── T27: Tests E2E: login → theme switch → feature gating → offline
└── T28: Tests de integración: auth → license → feature gate → UI

Wave FINAL:
├── F1: Plan compliance audit (oracle)
├── F2: Code quality review (unspecified-high)
├── F3: Security review — verificar que JWT no filtra al renderer
└── F4: Scope fidelity check (deep)

Critical Path: T1 → T3 → T14 → T25 (theme UI usable)
              T6 → T7 → T9 → T11 → T12 → T13 → T17 (auth usable)
              T12 → T18 → T19 → T20 → T21 (feature gating usable)
              T13 → T22 → T23 (offline mode usable)
```

### Dependency Matrix
- **T1 → T2, T3, T4, T5**: Schema necesario para todo el theme system
- **T3 → T14, T15, T25**: ThemeProvider necesario para UI y App
- **T6 → T7, T9, T10, T11**: Supabase setup necesario para backend
- **T7 → T8, T9**: DB schema necesario para edge functions
- **T9, T10 → T13**: Edge functions necesarias para LicenseValidator
- **T11 → T12**: Supabase client necesario para AuthService
- **T12 → T17, T18, T19, T22**: Auth real necesario para AccountPage y feature gating
- **T13 → T22**: LicenseValidator necesario para OfflineManager
- **T18 → T19 → T20 → T21**: Feature gating en cadena
- **F1-F4**: Dependen de todas las tareas anteriores

### Agent Dispatch Summary
- **Wave 1**: 6 tareas — T1(deep), T2(quick), T3(deep), T4(deep), T5(medium), T6(quick)
- **Wave 2**: 7 tareas — T7(deep), T8(medium), T9(unspecified-high), T10(medium), T11(deep), T12(deep), T13(unspecified-high)
- **Wave 3**: 8 tareas — T14(medium), T15(deep), T16(medium), T17(medium), T18(quick), T19(medium), T20(medium), T21(medium)
- **Wave 4**: 8 tareas — T22(deep), T23(medium), T24(medium), T25(medium), T26(medium), T27(unspecified-high), T28(deep), F1-F4(reviewers)

---

## TODOs

### Wave 1 — Theme Foundation

- [ ] 1. **Theme schema Zod completo** — `packages/ui-core/src/themes/types.ts`

  **What to do**:
  - Crear schema Zod para cada categoría de tokens:
    ```typescript
    export const ColorTokensSchema = z.object({
      surface: z.string(),
      surfaceAlt: z.string(),
      surfaceElevated: z.string(),
      border: z.string(),
      borderSubtle: z.string(),
      primary: z.string(),
      primaryHover: z.string(),
      primaryMuted: z.string(),
      secondary: z.string(),
      secondaryHover: z.string(),
      text: z.string(),
      textMuted: z.string(),
      textInverse: z.string(),
      positive: z.string(),
      negative: z.string(),
      warning: z.string(),
      danger: z.string(),
      glass: z.string(),
      glassBorder: z.string(),
      overlay: z.string(),
    });
    ```
  - Crear schemas para: FontTokens, SpacingTokens, RadiusTokens, ShadowTokens, AnimationTokens, GlassTokens, ZIndexTokens
  - Crear `ThemeSchema` con metadatos + tokens + overlayOverrides opcional
  - Exportar TypeScript types inferidos: `Theme`, `ThemeTokens`, `ThemeTokenMap`
  - Añadir validación de colores hex/rgb/hsla
  - Añadir `validateTheme(theme: unknown): Theme` helper

  **Must NOT do**:
  - NO cambiar `shared/types/theme.ts` todavía (se hace en T2)
  - NO agregar lógica de UI en este archivo

  **Acceptance Criteria**:
  - [ ] Schema valida los 3 temas built-in existentes (o falla con mensaje claro si no cumplen)
  - [ ] `validateTheme` retorna objeto tipado o lanza ZodError detallado
  - [ ] Tests: tema válido pasa, tema con color inválido falla, tema con token faltante falla

  **QA Scenarios**:
  ```
  Scenario: Schema accepts valid dark theme
    Tool: Bun test
    Steps: Parse dark.json con validateTheme
    Expected Result: No errors, typed Theme returned
    Evidence: .omo/evidence/sprint6/task1-valid-theme.log

  Scenario: Schema rejects invalid color
    Tool: Bun test
    Steps: Parse theme with color "not-a-color"
    Expected Result: ZodError with path ['tokens','color','primary']
    Evidence: .omo/evidence/sprint6/task1-invalid-color.log
  ```
  **Commit**: YES
  - Message: `feat(themes): add complete Zod schema for 56 theme tokens`
  - Files: `packages/ui-core/src/themes/types.ts`, `packages/ui-core/src/themes/__tests__/types.test.ts`

- [ ] 2. **Normalizar 3 temas built-in** — `packages/ui-core/src/themes/defaults.ts`

  **What to do**:
  - Convertir dark.json, blood.json, midnight.json al schema completo de 56 tokens
  - Mover archivos JSON de `apps/desktop/src/renderer/themes/` a `packages/ui-core/src/themes/`
  - Actualizar tokens legacy (`bg-primary` → `color.surface`, `text-primary` → `color.text`, etc.)
  - Asegurar que los 3 temas tengan TODOS los 56 tokens definidos
  - Mantener compatibilidad visual aproximada con los temas actuales
  - Actualizar test `themes.test.ts` para usar nuevo schema y ubicación

  **Must NOT do**:
  - NO eliminar los archivos JSON originales hasta que T25 esté completo
  - NO cambiar nombres de IDs de tema (`dark`, `blood`, `midnight`)

  **Acceptance Criteria**:
  - [ ] Los 3 temas validan contra `ThemeSchema` sin errores
  - [ ] Todos los 56 tokens presentes en cada tema
  - [ ] Tests actualizados pasan
  - [ ] `builtInThemes` export sigue funcionando

  **QA Scenarios**:
  ```
  Scenario: All built-in themes have 56 tokens
    Tool: Bun test
    Steps: Iterate builtInThemes, count tokens
    Expected Result: Each theme has >= 56 tokens, all schema-required keys present
    Evidence: .omo/evidence/sprint6/task2-token-count.log
  ```
  **Commit**: YES
  - Message: `feat(themes): normalize dark, blood, and midnight themes to 56-token schema`
  - Files: `packages/ui-core/src/themes/dark.json`, `blood.json`, `midnight.json`, `defaults.ts`, `__tests__/themes.test.ts`

- [ ] 3. **ThemeProvider + CSS variables** — `packages/ui-core/src/themes/ThemeProvider.tsx`

  **What to do**:
  - Crear React Context:
    ```typescript
    interface ThemeContextValue {
      theme: Theme;
      themeId: string;
      tokens: ThemeTokenMap;
      setTheme: (id: string) => void;
      setToken: <K extends keyof ThemeTokenMap>(cat: K, token: keyof ThemeTokenMap[K], value: string | number) => void;
      applyOverlayOverride: (overlayId: string, override: Partial<ThemeTokenMap>) => void;
      clearOverlayOverride: (overlayId: string) => void;
      availableThemes: Array<{ id: string; name: string; description: string }>;
      isDark: boolean;
    }
    ```
  - Al montar: leer tema activo vía `window.vantare.getActiveTheme()` y `window.vantare.getThemes()`
  - Aplicar CSS variables a `document.documentElement.style.setProperty('--color-surface', tokens.color.surface, ...)`
  - Función `applyThemeToDOM(tokens)` que itera todas las categorías y settea variables
  - Soportar tema built-in + custom themes desde electron-store
  - Detectar dark/light vía luminosidad del `color.surface`
  - Persistir cambios vía `window.vantare.setActiveTheme()` y `window.vantare.saveTheme()`

  **Must NOT do**:
  - NO usar localStorage (usar IPC bridge + electron-store)
  - NO re-renderizar toda la app en cada cambio de token (usar context value memoizado)

  **Acceptance Criteria**:
  - [ ] Al montar, las CSS variables se aplican en :root
  - [ ] Cambiar tema actualiza variables sin recargar
  - [ ] Custom themes se cargan desde electron-store y se mezclan con built-ins
  - [ ] `isDark` se calcula correctamente para los 3 temas

  **QA Scenarios**:
  ```
  Scenario: ThemeProvider applies CSS variables on mount
    Tool: Testing Library + jsdom
    Steps: Render ThemeProvider with dark theme, query --color-surface on documentElement
    Expected Result: getPropertyValue('--color-surface') equals dark theme value
    Evidence: .omo/evidence/sprint6/task3-css-vars.log

  Scenario: Switching theme updates CSS variables
    Tool: Testing Library
    Steps: Render with dark, call setTheme('blood'), query --color-primary
    Expected Result: Primary color changes to blood's primary
    Evidence: .omo/evidence/sprint6/task3-theme-switch.log
  ```
  **Commit**: YES
  - Message: `feat(themes): add ThemeProvider with runtime CSS variable injection`
  - Files: `packages/ui-core/src/themes/ThemeProvider.tsx`, `__tests__/ThemeProvider.test.tsx`

- [ ] 4. **useTheme + useOverlayTheme hooks** — `packages/ui-core/src/themes/useTheme.ts`, `useOverlayTheme.ts`

  **What to do**:
  - `useTheme`: consumir ThemeContext, retornar todos los valores expuestos
  - `useOverlayTheme(overlayId: string)`:
    - Lee tokens globales + overlay override para ese overlayId
    - Retorna `tokens` mezclados
    - Proporciona `applyOverride` y `clearOverride` scoped al overlay
  - Ambos hooks deben ser null-safe (throw si se usan fuera de provider)
  - Tests para cada hook

  **Must NOT do**:
  - NO crear nuevos objetos de tokens en cada render (usar useMemo)

  **Acceptance Criteria**:
  - [ ] `useTheme` retorna theme, themeId, setTheme, setToken
  - [ ] `useOverlayTheme` retorna tokens mezclados con override
  - [ ] Llamar applyOverride actualiza solo ese overlay
  - [ ] Llamar clearOverride revierte al tema global

  **QA Scenarios**:
  ```
  Scenario: Overlay override only affects one overlay
    Tool: Bun test
    Steps: applyOverride('standings', { color: { primary: '#ff0000' } }), verify other overlays unchanged
    Expected Result: standings primary = red, global primary unchanged
    Evidence: .omo/evidence/sprint6/task4-overlay-override.log
  ```
  **Commit**: YES
  - Message: `feat(themes): add useTheme and useOverlayTheme hooks`
  - Files: `packages/ui-core/src/themes/useTheme.ts`, `useOverlayTheme.ts`, `__tests__/hooks.test.ts`

- [ ] 5. **theme-utils** — `packages/ui-core/src/themes/theme-utils.ts`

  **What to do**:
  - Implementar helpers:
    - `mergeThemes(parent: Theme, override: Partial<Theme>): Theme` — deep merge
    - `validateThemeContrast(theme: Theme): ContrastReport` — calcular ratios WCAG
    - `getLuminance(hex: string): number` — convertir hex a luminancia relativa
    - `isDarkColor(hex: string): boolean` — luminancia < 0.5
    - `themeToCssVariables(tokens): Record<string, string>` — flatten de tokens a --prefixed keys
  - Tests para cada helper con casos edge

  **Must NOT do**:
  - NO usar librerías externas (todo puro TS)

  **Acceptance Criteria**:
  - [ ] mergeThemes sobrescribe solo campos presentes en override
  - [ ] validateThemeContrast reporta AA/AAA para pares críticos
  - [ ] themeToCssVariables genera keys del tipo `--color-surface`

  **QA Scenarios**:
  ```
  Scenario: Contrast validation passes for dark theme
    Tool: Bun test
    Steps: validateThemeContrast(dark)
    Expected Result: All critical pairs (text on surface, primary text) pass AA
    Evidence: .omo/evidence/sprint6/task5-contrast.log
  ```
  **Commit**: YES
  - Message: `feat(themes): add theme utilities (merge, contrast, css vars)`
  - Files: `packages/ui-core/src/themes/theme-utils.ts`, `__tests__/theme-utils.test.ts`

- [ ] 6. **Setup Supabase project + env vars** — `.env.example`, docs

  **What to do**:
  - Crear `.env.example` en raíz del proyecto:
    ```
    SUPABASE_URL=https://your-project.supabase.co
    SUPABASE_ANON_KEY=your-anon-key
    # Service role key — only used in Electron main process and edge functions
    SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
    ```
  - Crear `.env.example` en `apps/desktop/`
  - Documentar en `docs/AUTH-GUIDE.md` sección "Variables de Entorno" actualizada
  - Verificar que `@supabase/supabase-js` ya está en `packages/auth/package.json`
  - Añadir `electron-safe-storage` y `machine-id` a `packages/auth` y `apps/desktop`

  **Must NOT do**:
  - NO commitear archivos `.env` reales
  - NO colocar service_role_key en ningún archivo que vaya al renderer bundle

  **Acceptance Criteria**:
  - [ ] `.env.example` existe en raíz y en apps/desktop
  - [ ] `.gitignore` incluye `.env` y `.env.local`
  - [ ] Dependencias `electron-safe-storage` y `machine-id` instaladas
  - [ ] Documentación actualizada

  **QA Scenarios**:
  ```
  Scenario: No real env files committed
    Tool: Bash
    Steps: git ls-files | grep -E '^\.env' | grep -v example
    Expected Result: Empty output
    Evidence: .omo/evidence/sprint6/task6-env-check.log
  ```
  **Commit**: YES
  - Message: `chore(auth): add Supabase env examples and secure storage dependencies`
  - Files: `.env.example`, `apps/desktop/.env.example`, `docs/AUTH-GUIDE.md`, `packages/auth/package.json`

### Wave 2 — Auth Backend

- [ ] 7. **DB Migrations** — `supabase/migrations/001_initial_schema.sql`

  **What to do**:
  - Crear directorio `supabase/migrations/`
  - Migration SQL con:
    - `public.profiles` (id UUID FK auth.users, display_name, avatar_url, preferred_sim, created_at, updated_at)
    - `public.licenses` (id UUID PK, user_id FK, tier TEXT CHECK, hwid TEXT, created_at, expires_at, is_active, deactivated_at, deactivation_reason, last_validated_at, validation_count)
    - `public.subscriptions` (id UUID PK, user_id FK, plan, status, started_at, expires_at, cancelled_at, payment_provider, payment_id)
    - `public.license_validations` (id UUID PK, license_id FK, user_id FK, hwid, ip_address, validated_at, is_valid, failure_reason)
    - `public.hwid_changes` (id UUID PK, license_id FK, old_hwid, new_hwid, changed_at, auto_approved)
    - Trigger `on_auth_user_created` → inserta profile
  - Todos los índices recomendados en AUTH-GUIDE.md

  **Must NOT do**:
  - NO modificar tablas del schema `auth.*` de Supabase
  - NO usar tipos no estándar que dificulten migrations futuras

  **Acceptance Criteria**:
  - [ ] SQL ejecuta sin errores en un proyecto Supabase limpio
  - [ ] Todas las tablas y FK creadas correctamente
  - [ ] Trigger crea perfil automáticamente al registrar usuario

  **QA Scenarios**:
  ```
  Scenario: Migration applies cleanly in fresh Supabase project
    Tool: Supabase CLI (if available) or manual dashboard execution
    Steps: Run 001_initial_schema.sql in SQL Editor
    Expected Result: All tables created, no errors
    Evidence: .omo/evidence/sprint6/task7-migration.log
  ```
  **Commit**: YES
  - Message: `feat(supabase): add initial schema migrations for auth and licensing`
  - Files: `supabase/migrations/001_initial_schema.sql`

- [ ] 8. **RLS Policies** — incluido en migration + tests

  **What to do**:
  - Habilitar RLS en todas las tablas públicas
  - Policies:
    - `profiles`: SELECT/UPDATE own row
    - `licenses`: SELECT own row, NO public INSERT/UPDATE/DELETE
    - `subscriptions`: SELECT own row
    - `license_validations`: INSERT solo service role, SELECT own rows
    - `hwid_changes`: SELECT own rows (vía license)
  - Tests que verifiquen policies conectando como anon vs authenticated

  **Must NOT do**:
  - NO permitir SELECT de licencias de otros usuarios

  **Acceptance Criteria**:
  - [ ] Usuario autenticado solo ve sus propias filas
  - [ ] Usuario anónimo no puede leer/escribir ninguna tabla protegida
  - [ ] Service role puede insertar en license_validations

  **QA Scenarios**:
  ```
  Scenario: RLS blocks cross-user license access
    Tool: Edge case test (documentado, no automático sin 2 credenciales reales)
    Steps: Verificar en dashboard que policy existe
    Expected Result: Policies listadas en cada tabla
    Evidence: .omo/evidence/sprint6/task8-rls.log
  ```
  **Commit**: YES (con T7)

- [ ] 9. **Edge function validate-license** — `supabase/functions/validate-license/index.ts`

  **What to do**:
  - Implementar edge function basada en AUTH-GUIDE.md sección 6.1
  - Recibir JWT en header Authorization
  - Validar usuario con `supabase.auth.getUser(token)`
  - Recibir `{ hwid }` en body
  - Buscar licencia activa del usuario
  - Verificar expiración
  - Verificar HWID (bind si es primera vez, reject si cambió)
  - Insertar registro en `license_validations`
  - Retornar `{ valid, tier, expires_at, license_id }`
  - CORS headers
  - Rate limiting implícito: máximo 100 validaciones por hora por license (usar rate_limits table)

  **Must NOT do**:
  - NO retornar service_role_key o datos de otros usuarios
  - NO permitir validación sin JWT

  **Acceptance Criteria**:
  - [ ] Edge function despliega con `supabase functions deploy validate-license`
  - [ ] Request sin JWT retorna 401
  - [ ] Request con HWID missing retorna 400
  - [ ] Usuario sin licencia retorna `{ valid: false, tier: 'free' }`
  - [ ] HWID mismatch retorna `{ valid: false, tier: 'free', error: 'Hardware mismatch' }`
  - [ ] Primera validación con HWID nueva vincula HWID a licencia

  **QA Scenarios**:
  ```
  Scenario: Validate-license returns tier for valid user
    Tool: curl / supabase functions serve
    Steps: Register test user, call validate-license con JWT + hwid
    Expected Result: 200, valid=true, tier=free
    Evidence: .omo/evidence/sprint6/task9-validate-success.log

  Scenario: Validate-license rejects invalid token
    Tool: curl
    Steps: Call with Authorization: Bearer invalid
    Expected Result: 401
    Evidence: .omo/evidence/sprint6/task9-validate-unauthorized.log
  ```
  **Commit**: YES
  - Message: `feat(supabase): add validate-license edge function with HWID binding`
  - Files: `supabase/functions/validate-license/index.ts`

- [ ] 10. **Edge function register-user** — `supabase/functions/register-user/index.ts`

  **What to do**:
  - Implementar registro con creación automática de licencia free
  - Recibir `{ email, password, hwid }`
  - Crear usuario vía `supabase.auth.admin.createUser()`
  - Insertar licencia `tier='free', is_active=true, hwid=hwid`
  - Retornar `{ user_id, message }` o error
  - No enviar email de confirmación en v1 (`email_confirm: true`)

  **Must NOT do**:
  - NO exponer password en logs
  - NO permitir creación de licencias pro/ultimate desde este endpoint

  **Acceptance Criteria**:
  - [ ] Registro crea usuario en auth.users
  - [ ] Trigger crea profile
  - [ ] Edge function crea licencia free vinculada
  - [ ] Email duplicado retorna error claro

  **QA Scenarios**:
  ```
  Scenario: Register creates user and free license
    Tool: curl
    Steps: POST {email, password, hwid}, verify user+license exist in DB
    Expected Result: 200, license.tier='free', hwid set
    Evidence: .omo/evidence/sprint6/task10-register.log
  ```
  **Commit**: YES
  - Message: `feat(supabase): add register-user edge function with free license creation`
  - Files: `supabase/functions/register-user/index.ts`

- [ ] 11. **Supabase client + secure storage** — `packages/auth/src/supabase-client.ts`

  **What to do**:
  - Crear cliente Supabase para `packages/auth`:
    ```typescript
    import { createClient } from '@supabase/supabase-js';
    export const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_ANON_KEY!
    );
    ```
  - Nota: Este cliente se usa en main process. Renderer NUNCA usa supabase directamente.
  - Crear `secure-storage.ts` wrapper around `electron-safe-storage`:
    ```typescript
    export const secureStorage = {
      get: async (key: string): Promise<string | null> => { /* safeStorage.decryptString */ },
      set: async (key: string, value: string): Promise<void> => { /* safeStorage.encryptString */ },
      remove: async (key: string): Promise<void> => { /* delete */ },
    };
    ```
  - Este módulo solo se importa desde Electron main (no en renderer).

  **Must NOT do**:
  - NO usar `localStorage` para JWT
  - NO importar secure-storage en código que se bundlee al renderer

  **Acceptance Criteria**:
  - [ ] Cliente Supabase inicializa con env vars
  - [ ] secureStorage encrypta y decrypta strings correctamente
  - [ ] Tests con mock de electron safeStorage pasan

  **QA Scenarios**:
  ```
  Scenario: Secure storage roundtrip
    Tool: Bun test con mock de safeStorage
    Steps: set('jwt', 'abc'), get('jwt')
    Expected Result: 'abc' retornado
    Evidence: .omo/evidence/sprint6/task11-secure-storage.log
  ```
  **Commit**: YES
  - Message: `feat(auth): add Supabase client and secure storage wrapper`
  - Files: `packages/auth/src/supabase-client.ts`, `packages/auth/src/secure-storage.ts`, `__tests__/secure-storage.test.ts`

- [ ] 12. **AuthService real** — `packages/auth/src/auth-service.ts`

  **What to do**:
  - Reemplazar AuthService mock por implementación real:
    ```typescript
    export class AuthService {
      static async login(email, password): Promise<AuthResult>
      static async register(email, password, hwid): Promise<AuthResult>
      static async logout(): Promise<void>
      static async getSession(): Promise<AuthUser | null>
      static async getLicenseStatus(): Promise<LicenseStatus>
      static canAccess(feature: Feature): boolean
    }
    ```
  - Login: `supabase.auth.signInWithPassword`, almacenar session en secureStorage
  - Register: llamar edge function `register-user` con hwid
  - Logout: `supabase.auth.signOut`, limpiar secureStorage
  - getSession: leer de secureStorage + refresh si es necesario
  - getLicenseStatus: llamar `validate-license` edge function, cachear resultado
  - Mantener compatibilidad con la interfaz existente de `AuthService` en `packages/auth/src/index.ts`

  **Must NOT do**:
  - NO romper tests existentes de `AuthService` (adaptar mocks si es necesario)
  - NO almacenar password en ningún lado

  **Acceptance Criteria**:
  - [ ] Login con credenciales válidas retorna success=true + user
  - [ ] Login con credenciales inválidas retorna success=false
  - [ ] Register crea usuario (llamando edge function mock o real)
  - [ ] Logout limpia sesión
  - [ ] getLicenseStatus retorna tier del usuario
  - [ ] Tests existentes pasan o se migran a la nueva implementación

  **QA Scenarios**:
  ```
  Scenario: AuthService login flow
    Tool: Bun test con Supabase mocks
    Steps: Mock signInWithPassword success, call AuthService.login
    Expected Result: JWT saved to secureStorage, user returned
    Evidence: .omo/evidence/sprint6/task12-login.log
  ```
  **Commit**: YES
  - Message: `feat(auth): implement real AuthService with Supabase and secure storage`
  - Files: `packages/auth/src/auth-service.ts`, `packages/auth/src/index.ts` (reexport), `__tests__/auth-service.test.ts`

- [ ] 13. **HWID + LicenseValidator** — `packages/auth/src/hwid.ts`, `license-validator.ts`

  **What to do**:
  - `hwid.ts`:
    - Usar `machine-id` (dynamic import para compatibilidad)
    - Leer CPU ID y motherboard serial via WMIC en Windows
    - Hashear combinación con SHA-256
    - `getHardwareId(): Promise<string>`
  - `license-validator.ts`:
    - `validateLicense(jwt: string, hwid: string): Promise<LicenseStatus>`
    - Llamar edge function `validate-license`
    - Cachear resultado por 6h en memoria
    - Retornar `{ tier, isValid, expiresAt }`

  **Must NOT do**:
  - NO ejecutar WMIC en tests (mock)
  - NO cachear indefinidamente

  **Acceptance Criteria**:
  - [ ] HWID es consistente entre llamadas en misma máquina
  - [ ] HWID cambia suficientemente entre máquinas diferentes
  - [ ] LicenseValidator retorna tier cacheado si es reciente
  - [ ] LicenseValidator consulta red si cache expiró

  **QA Scenarios**:
  ```
  Scenario: HWID generation produces stable hash
    Tool: Bun test con mock de machine-id
    Steps: Mock machine-id='abc', call getHardwareId twice
    Expected Result: Same hash both times
    Evidence: .omo/evidence/sprint6/task13-hwid.log
  ```
  **Commit**: YES
  - Message: `feat(auth): add HWID generation and license validator`
  - Files: `packages/auth/src/hwid.ts`, `packages/auth/src/license-validator.ts`, `__tests__/hwid.test.ts`, `__tests__/license-validator.test.ts`

### Wave 3 — UI Pages + Feature Gating

- [ ] 14. **ThemesPage** — `apps/desktop/src/renderer/hub/pages/ThemesPage.tsx`

  **What to do**:
  - Página en Hub con ruta `/themes` (agregar a App.tsx y HubLayout)
  - Secciones:
    - Grid de tarjetas de temas disponibles (built-in + custom)
    - Tema activo destacado
    - Botón "Create Custom Theme" (clona tema activo)
    - Botón "Import Theme" (file picker JSON)
    - Botón "Export Theme" por tema
  - Usar `useTheme()` para datos y acciones
  - Preview del tema en una miniatura de overlay

  **Must NOT do**:
  - NO implementar editor completo en esta tarea (eso es T15)
  - NO modificar el schema de Theme

  **Acceptance Criteria**:
  - [ ] Página renderiza todos los temas
  - [ ] Click en tema lo activa inmediatamente
  - [ ] Import/export JSON funciona
  - [ ] Ruta `/themes` navegable desde sidebar

  **QA Scenarios**:
  ```
  Scenario: ThemesPage renders built-in themes
    Tool: Playwright
    Steps: Navigate to /themes, assert dark/blood/midnight visible
    Expected Result: All 3 themes displayed
    Evidence: .omo/evidence/sprint6/task14-themes-page.png
  ```
  **Commit**: YES
  - Message: `feat(hub): add ThemesPage with theme selection and import/export`
  - Files: `apps/desktop/src/renderer/hub/pages/ThemesPage.tsx`, `App.tsx`, `HubLayout.tsx`

- [ ] 15. **ThemeEditor** — `apps/desktop/src/renderer/hub/components/ThemeEditor.tsx`

  **What to do**:
  - Componente modal/drawer para editar tokens básicos:
    - Colores: surface, primary, secondary, text, positive, negative
    - Tipografía: font-family
    - Radios: radius-md
    - Sombras: shadow-md
  - Color picker nativo `<input type="color">`
  - Live preview: cambios aplican al theme activo temporalmente
  - Botones Save, Cancel, Reset
  - Validación: theme debe tener nombre único, todos los tokens requeridos

  **Must NOT do**:
  - NO editar temas built-in (solo clonar)
  - NO permitir guardar tema inválido

  **Acceptance Criteria**:
  - [ ] Editor abre desde ThemesPage
  - [ ] Cambio de color se refleja en preview en tiempo real
  - [ ] Save persiste tema custom
  - [ ] Cancel descarta cambios

  **QA Scenarios**:
  ```
  Scenario: ThemeEditor live preview updates primary color
    Tool: Playwright
    Steps: Open editor, change primary color to #ff0000, verify preview
    Expected Result: Preview uses red primary
    Evidence: .omo/evidence/sprint6/task15-editor-preview.png
  ```
  **Commit**: YES
  - Message: `feat(hub): add ThemeEditor with live preview`
  - Files: `apps/desktop/src/renderer/hub/components/ThemeEditor.tsx`, `__tests__/ThemeEditor.test.tsx`

- [ ] 16. **Theme import/export JSON** — `packages/ui-core/src/themes/export-import.ts` + UI

  **What to do**:
  - `exportTheme(theme: Theme): string` — JSON formateado con schema version
  - `importTheme(json: string): Theme` — parse + validate
  - Agregar botones en ThemesPage
  - File picker para importar
  - Download blob para exportar
  - Manejar errores: JSON inválido, schema version incompatible

  **Must NOT do**:
  - NO usar eval() o Function() para parsear

  **Acceptance Criteria**:
  - [ ] Export genera JSON válido según schema
  - [ ] Import reconstruye tema idéntico
  - [ ] Import rechaza JSON inválido con mensaje de error
  - [ ] Schema version es `vantare-theme-v1`

  **QA Scenarios**:
  ```
  Scenario: Roundtrip import/export preserves theme
    Tool: Bun test
    Steps: exportTheme(dark) → importTheme → deep equal
    Expected Result: Identical theme object
    Evidence: .omo/evidence/sprint6/task16-roundtrip.log
  ```
  **Commit**: YES
  - Message: `feat(themes): add theme JSON import/export with schema validation`
  - Files: `packages/ui-core/src/themes/export-import.ts`, UI wiring

- [ ] 17. **AccountPage** — `apps/desktop/src/renderer/hub/pages/AccountPage.tsx`

  **What to do**:
  - Página en Hub con ruta `/account`
  - Estados:
    - No autenticado: formulario de login + tab para register
    - Autenticado: email, tier, fecha expiración, HWID (parcial), botón logout
  - Usar `auth-store.ts` de Zustand
  - Validación de email y password mínimo 8 chars
  - Mensajes de error claros

  **Must NOT do**:
  - NO mostrar JWT completo
  - NO mostrar HWID completo (últimos 8 caracteres)

  **Acceptance Criteria**:
  - [ ] Login form funcional
  - [ ] Register form funcional
  - [ ] Estado autenticado muestra datos de licencia
  - [ ] Logout limpia UI y vuelve a formulario

  **QA Scenarios**:
  ```
  Scenario: AccountPage login flow
    Tool: Playwright
    Steps: Navigate /account, enter credentials, click login
    Expected Result: UI shows email and tier
    Evidence: .omo/evidence/sprint6/task17-account-login.png
  ```
  **Commit**: YES
  - Message: `feat(hub): add AccountPage with login/register and license display`
  - Files: `apps/desktop/src/renderer/hub/pages/AccountPage.tsx`, `auth-store.ts`, `App.tsx`, `HubLayout.tsx`

- [ ] 18. **Feature enum + tierFeatures** — `packages/auth/src/feature-gate.ts`

  **What to do**:
  - Definir enum:
    ```typescript
    export enum Feature {
      STANDINGS = 'standings',
      RELATIVE = 'relative',
      DELTA_BAR = 'delta-bar',
      STREAM_ALERTS = 'stream-alerts',
      FUEL_CALCULATOR = 'fuel-calculator',
      TRACK_MAP = 'track-map',
      INPUT_TELEMETRY = 'input-telemetry',
      CUSTOM_THEMES = 'custom-themes',
      DATA_BLOCKS = 'data-blocks',
      IRACING = 'iracing',
      LMU = 'lmu',
      AC = 'ac',
    }
    ```
  - Mapeo a tiers según AUTH-GUIDE.md sección 8.2
  - Helpers:
    - `hasFeature(tier: Tier, feature: Feature): boolean`
    - `getRequiredTier(feature: Feature): Tier`
    - `getFeaturesForTier(tier: Tier): Feature[]`

  **Must NOT do**:
  - NO hardcodear checks de tier dispersos en la app

  **Acceptance Criteria**:
  - [ ] Todos los features mapeados correctamente
  - [ ] Free solo tiene standings/relative/delta-bar/iracing
  - [ ] Tests de matriz pasan

  **QA Scenarios**:
  ```
  Scenario: Tier feature matrix is correct
    Tool: Bun test
    Steps: Assert free hasFeature(STANDINGS)=true, hasFeature(LMU)=false
    Expected Result: Matrix matches AUTH-GUIDE
    Evidence: .omo/evidence/sprint6/task18-feature-matrix.log
  ```
  **Commit**: YES
  - Message: `feat(auth): add Feature enum and tier mapping`
  - Files: `packages/auth/src/feature-gate.ts`, `__tests__/feature-gate.test.ts`

- [ ] 19. **useLicense hook** — `packages/auth/src/hooks/useLicense.ts`

  **What to do**:
  - Hook React que expone:
    ```typescript
    interface UseLicenseReturn {
      user: AuthUser | null;
      tier: Tier;
      isLoading: boolean;
      hasFeature: (feature: Feature) => boolean;
      requireFeature: (feature: Feature) => void; // throws if no access
      refreshLicense: () => Promise<void>;
    }
    ```
  - Suscribirse a cambios de auth store
  - Al montar: validar licencia y actualizar tier
  - Tests con mocks de AuthService

  **Must NOT do**:
  - NO exponer métodos de login/logout (eso es AccountPage)

  **Acceptance Criteria**:
  - [ ] Hook retorna tier correcto según AuthService
  - [ ] hasFeature funciona para todos los features
  - [ ] requireFeature lanza error si no tiene acceso

  **QA Scenarios**:
  ```
  Scenario: useLicense reflects tier from AuthService
    Tool: Testing Library
    Steps: Mock AuthService currentLicense={tier:'pro'}, render hook
    Expected Result: result.current.tier === 'pro', hasFeature(LMU)=true
    Evidence: .omo/evidence/sprint6/task19-uselicense.log
  ```
  **Commit**: YES
  - Message: `feat(auth): add useLicense hook for feature gating`
  - Files: `packages/auth/src/hooks/useLicense.ts`, `__tests__/useLicense.test.ts`

- [ ] 20. **Feature gating UI** — `apps/desktop/src/renderer/hub/components/UpgradePrompt.tsx`, `FeatureBadge.tsx`

  **What to do**:
  - `FeatureBadge` — muestra etiqueta "Pro" o "Ultimate" en features bloqueadas
  - `UpgradePrompt` — modal/card que explica qué tier se necesita y por qué
  - `FeatureGate` — wrapper component:
    ```tsx
    <FeatureGate feature={Feature.LMU}>
      <SimOption value="lmu" />
    </FeatureGate>
    ```
  - Estilos consistentes con tema (usar tokens)
  - Animaciones suaves

  **Must NOT do**:
  - NO bloquear completamente la navegación (solo deshabilitar contenido)
  - NO mostrar upgrade prompt en features free

  **Acceptance Criteria**:
  - [ ] FeatureBadge muestra tier requerido
  - [ ] FeatureGate deshabilita interacción si no hay acceso
  - [ ] UpgradePrompt muestra información correcta

  **QA Scenarios**:
  ```
  Scenario: LMU option disabled for free tier
    Tool: Playwright
    Steps: Login as free, navigate to sim switcher, assert LMU has Pro badge and disabled
    Evidence: .omo/evidence/sprint6/task20-feature-gate.png
  ```
  **Commit**: YES
  - Message: `feat(hub): add feature gating UI components`
  - Files: `apps/desktop/src/renderer/hub/components/UpgradePrompt.tsx`, `FeatureBadge.tsx`, `FeatureGate.tsx`

- [ ] 21. **Wire feature gating en la app** — múltiples archivos

  **What to do**:
  - Aplicar `FeatureGate` en:
    - SimSwitcher: LMU/AC deshabilitados para free
    - OverlaySettingsPage: Stream Alerts, Track Map, etc. con badges
    - ThemesPage: Custom themes editor bloqueado para free/pro
    - SettingsPage: opciones premium marcadas
  - NO modificar funcionalidad core de overlays, solo UI

  **Must NOT do**:
  - NO romper funcionalidad existente para usuarios con acceso

  **Acceptance Criteria**:
  - [ ] Usuario free ve indicadores de upgrade en features pro/ultimate
  - [ ] Usuario pro/ultimate no ve bloqueos
  - [ ] Mock/demo mode permite todo (para testing interno)

  **QA Scenarios**:
  ```
  Scenario: Free user sees upgrade prompts in relevant places
    Tool: Playwright
    Steps: Login as free, visit overlays + themes + settings
    Expected Result: At least 3 upgrade prompts/badges visible
    Evidence: .omo/evidence/sprint6/task21-wire-gating.png
  ```
  **Commit**: YES
  - Message: `feat(hub): wire feature gating into existing pages`
  - Files: `SimSwitcher.tsx`, `OverlaySettingsPage.tsx`, `ThemesPage.tsx`, `SettingsPage.tsx`

### Wave 4 — Offline Mode + Integration

- [ ] 22. **OfflineManager** — `packages/auth/src/offline-manager.ts`

  **What to do**:
  - Clase que maneja estado online/offline
  - License cache en electron-store con TTL 24h
  - Grace period: si offline >24h pero <72h, mantener último tier (solo lectura)
  - Si offline >72h, degradar a free
  - Eventos:
    - `window.addEventListener('online')` → revalidar licencia
    - `window.addEventListener('offline')` → marcar offline, usar cache
  - Métodos:
    - `getEffectiveTier(): Tier`
    - `cacheLicense(status: LicenseStatus): void`
    - `isOfflineValid(): boolean`

  **Must NOT do**:
  - NO usar localStorage
  - NO permitir bypass de cache

  **Acceptance Criteria**:
  - [ ] Cache persiste en electron-store
  - [ ] TTL de 24h respetado
  - [ ] Grace period de 72h funciona
  - [ ] Degradación a free tras 72h offline

  **QA Scenarios**:
  ```
  Scenario: OfflineManager uses cached license within TTL
    Tool: Bun test con clock mocking
    Steps: Cache pro license, advance time 12h, call getEffectiveTier
    Expected Result: Returns 'pro'
    Evidence: .omo/evidence/sprint6/task22-offline-ttl.log

  Scenario: OfflineManager degrades after grace period
    Tool: Bun test con clock mocking
    Steps: Cache pro license, advance time 96h, call getEffectiveTier
    Expected Result: Returns 'free'
    Evidence: .omo/evidence/sprint6/task22-offline-grace.log
  ```
  **Commit**: YES
  - Message: `feat(auth): add OfflineManager with 24h TTL and 72h grace period`
  - Files: `packages/auth/src/offline-manager.ts`, `__tests__/offline-manager.test.ts`

- [ ] 23. **Integrar OfflineManager en AuthService**

  **What to do**:
  - Modificar `AuthService.getLicenseStatus()`:
    - Primero intentar validación online
    - Si falla por red, consultar OfflineManager
    - Retornar tier efectivo
  - Al iniciar sesión válida: cachear licencia
  - Al detectar evento `online`: revalidar en background

  **Must NOT do**:
  - NO hacer revalidación síncrona que bloquee UI

  **Acceptance Criteria**:
  - [ ] App funciona sin internet con cache válida
  - [ ] Al volver online, se revalida licencia
  - [ ] Tests de integración pasan

  **QA Scenarios**:
  ```
  Scenario: AuthService falls back to cached license on network error
    Tool: Bun test
    Steps: Mock validate-license failure, cached pro license exists
    Expected Result: getLicenseStatus returns pro
    Evidence: .omo/evidence/sprint6/task23-fallback.log
  ```
  **Commit**: YES
  - Message: `feat(auth): integrate OfflineManager with AuthService`
  - Files: `packages/auth/src/auth-service.ts`

- [ ] 24. **Actualizar electron-store schema para license cache**

  **What to do**:
  - Añadir a `StoreSchema` en `handlers.ts`:
    ```typescript
    licenseCache: {
      tier: Tier;
      valid: boolean;
      cachedAt: string;
      expiresAt: string | null;
      licenseId: string;
    } | null;
    ```
  - Añadir handler IPC si es necesario
  - Inicializar default como `null`

  **Must NOT do**:
  - NO almacenar JWT en electron-store (solo en safeStorage)

  **Acceptance Criteria**:
  - [ ] Schema actualizado
  - [ ] App arranca sin errores con nuevo default
  - [ ] License cache persiste entre reinicios

  **QA Scenarios**:
  ```
  Scenario: Store accepts new licenseCache field
    Tool: Bun test
    Steps: Verify store.get('licenseCache') returns null initially
    Expected Result: No errors
    Evidence: .omo/evidence/sprint6/task24-store.log
  ```
  **Commit**: YES
  - Message: `feat(desktop): add licenseCache to electron-store schema`
  - Files: `apps/desktop/src/main/ipc/handlers.ts`

- [ ] 25. **Integrar ThemeProvider en App.tsx y overlays**

  **What to do**:
  - Envolver App con `<ThemeProvider>` en `main.tsx`
  - Asegurar que ThemeProvider también se monte en `OverlayShell` (overlay windows)
  - Actualizar imports de `builtInThemes` a nueva ubicación
  - Eliminar archivos JSON de temas viejos de `apps/desktop/src/renderer/themes/`
  - Actualizar `HubLayout` para usar `useTheme()` en lugar de `window.vantare.getActiveTheme()`

  **Must NOT do**:
  - NO romper renderizado de overlays existentes

  **Acceptance Criteria**:
  - [ ] App arranca con ThemeProvider
  - [ ] Overlays reciben tema activo
  - [ ] Cambio de tema se refleja en todas las ventanas
  - [ ] No hay referencias a archivos de temas movidos

  **QA Scenarios**:
  ```
  Scenario: Theme change applies across windows
    Tool: Playwright
    Steps: Open main window + overlay window, change theme in Hub
    Expected Result: Both windows reflect new theme colors
    Evidence: .omo/evidence/sprint6/task25-multiwindow-theme.png
  ```
  **Commit**: YES
  - Message: `feat(desktop): wire ThemeProvider into App, overlays, and HubLayout`
  - Files: `main.tsx`, `OverlayShell.tsx`, `HubLayout.tsx`, `App.tsx`

- [ ] 26. **Refactorizar componentes hardcodeados a tokens del tema**

  **What to do**:
  - Identificar componentes con colores/espaciado hardcodeados:
    - `HubLayout.tsx` (bg-[#0a0a0a], bg-[#1e1e1e])
    - `DashboardPage.tsx` (colores fijos)
    - `EmptyState` en HubLayout
    - Componentes de overlay que usan colores literales
  - Reemplazar por clases semánticas usando CSS variables:
    - `bg-[#0a0a0a]` → `bg-surface`
    - `text-white/50` → `text-text-muted`
  - Priorizar componentes del Hub; overlays opcional si el scope crece

  **Must NOT do**:
  - NO cambiar comportamiento funcional
  - NO forzar refactor masivo en un solo commit

  **Acceptance Criteria**:
  - [ ] Hub UI usa tokens del tema
  - [ ] Cambio de tema afecta al Hub completamente
  - [ ] Tests visuales no fallan (snapshots actualizados si aplica)

  **QA Scenarios**:
  ```
  Scenario: Hub responds to theme changes
    Tool: Playwright
    Steps: Change from dark to blood, take screenshot of Hub
    Expected Result: Colors update (primary accents, surfaces)
    Evidence: .omo/evidence/sprint6/task26-hub-theme.png
  ```
  **Commit**: YES
  - Message: `refactor(ui): migrate hardcoded Hub colors to theme tokens`
  - Files: `HubLayout.tsx`, `DashboardPage.tsx`, componentes afectados

- [ ] 27. **E2E Tests: auth → theme → feature gating → offline**

  **What to do**:
  - Escribir tests de Playwright:
    - `auth-flow.spec.ts`: register → login → logout
    - `theme-flow.spec.ts`: change theme → create custom → export/import
    - `feature-gate.spec.ts`: free user blocked from pro features
    - `offline-mode.spec.ts`: simulate offline, verify app continues
  - Usar mocks de network cuando no haya Supabase real disponible

  **Must NOT do**:
  - NO depender de Supabase real para CI (debe poder correr offline)

  **Acceptance Criteria**:
  - [ ] 4 specs ejecutan en CI
  - [ ] Cada spec tiene ≥ 3 assertions
  - [ ] Mock mode permite bypass de auth para desarrollo local

  **QA Scenarios**:
  ```
  Scenario: Full E2E auth + feature gate flow
    Tool: Playwright
    Steps: Register, login, verify free tier blocks LMU
    Expected Result: Auth success + LMU disabled
    Evidence: .omo/evidence/sprint6/task27-e2e-auth.log
  ```
  **Commit**: YES
  - Message: `test(e2e): add auth, theme, feature gating, and offline specs`
  - Files: `apps/desktop/e2e/sprint6/`

- [ ] 28. **Tests de integración: auth → license → feature gate → UI**

  **What to do**:
  - Test unitario de flujo completo:
    1. AuthService.register
    2. LicenseValidator.validate
    3. hasFeature(Feature.LMU)
    4. Render FeatureGate con LMU → assert disabled
  - Mock todo el stack de Supabase
  - Verificar que OfflineManager se integra correctamente

  **Must NOT do**:
  - NO usar credenciales reales en tests

  **Acceptance Criteria**:
  - [ ] Flujo completo testeado
  - [ ] Tests pasan en CI
  - [ ] Cobertura de auth package > 80%

  **QA Scenarios**:
  ```
  Scenario: Integration test covers full auth-to-UI flow
    Tool: Bun test
    Steps: Run integration test suite
    Expected Result: All assertions pass
    Evidence: .omo/evidence/sprint6/task28-integration.log
  ```
  **Commit**: YES
  - Message: `test(auth): add integration tests for auth-license-feature gate flow`
  - Files: `packages/auth/src/__tests__/integration.test.ts`

### Wave FINAL

- [ ] F1. **Plan compliance audit (oracle)**
  - Verificar que todas las tareas T1-T28 están implementadas
  - Verificar que todos los deliverables del TL;DR existen
  - Verificar que F-009, F-010, F-016, F-021 están completos

- [ ] F2. **Code quality review (unspecified-high)**
  - Revisar typecheck, lint, tests
  - Verificar que no hay any implícitos
  - Verificar que no hay imports cíclicos

- [ ] F3. **Security review**
  - Grep por `SUPABASE_SERVICE_ROLE_KEY` en renderer bundles
  - Grep por `localStorage.setItem('jwt'` o similar
  - Verificar que secure storage solo se usa en main

- [ ] F4. **Scope fidelity check (deep)**
  - Comparar contra ROADMAP Sprint 6
  - Verificar entregables listados
  - Confirmar métricas de éxito

---

## Métricas de Éxito del Sprint

| Métrica | Objetivo | Cómo medir |
|---|---|---|
| Cobertura tests auth package | > 80% | `pnpm test --filter=@vantare/auth` |
| Cobertura tests ui-core themes | > 80% | `pnpm test --filter=@vantare/ui-core` |
| Typecheck | 0 errores | `pnpm typecheck` |
| E2E tests sprint 6 | 4/4 passing | `pnpm test:e2e --filter=@vantare/desktop` |
| Tiempo de aplicación de tema | < 100ms | Performance test en browser |
| Offline functionality | 24h TTL | Test con clock mocking |

---

## Riesgos y Mitigaciones

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Supabase project setup requiere cuenta/crédito | Alto | Usar free tier, crear proyecto al inicio del sprint |
| WMIC puede fallar en algunas PCs Windows | Medio | Fallback a machine-id solo, tests con mocks |
| Electron safeStorage no disponible en Linux CI | Medio | Mock en tests, documentar requisito Windows |
| Feature gating puede romper tests existentes | Medio | Mantener mock/demo mode que desbloquea todo |
| Cambio de tema dinámico en múltiple ventanas es complejo | Medio | Broadcast IPC `theme:changed` desde main |

---

## Notas para Ejecución

1. **Supabase setup primero**: T6 debe completarse lo antes posible para desbloquear T7-T13.
2. **Tests primero**: Cada tarea sigue TDD cuando la lógica es compleja.
3. **Commits atómicos**: Un commit por tarea, con mensaje semántico.
4. **QA evidence**: Cada escenario debe producir un artefacto en `.omo/evidence/sprint6/`.
5. **No romper sprints anteriores**: Si un cambio afecta SimManager, overlays, o IPC, debe ser backward compatible.

---

*Plan generado para Sprint 6 — Themes + Auth — Vantare Overlays v1.0*
