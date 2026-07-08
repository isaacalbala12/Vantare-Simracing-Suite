# WIDGET-STUDIO-10 — Acceder a Widget Studio sin perfil propio

Fecha: 2026-07-07
Estado: plan listo para ejecucion por worker
Skills esperadas: `vantare-core`, `planning-and-task-breakdown`, `test-driven-development`, `frontend-ui-engineering`, `frontend-design-deslop`, `code-review-and-quality`

## Objetivo

Hoy `Overlays Studio → Widgets` exige tener un perfil propio cargado. Si no hay ninguno, la UI muestra el empty state `"Selecciona o crea un perfil para editar widgets."` y bloquea el acceso a `WidgetStudio`. Esto contradice la separacion de responsabilidades documentada en `docs/widget-architecture.md` (WidgetStudio edita configuracion interna, no placement) y rompe la iteracion: un tester o un nuevo usuario no puede explorar el editor Crystal, los disenos oficiales ni los slots/columns sin antes pasar por el flujo "crear perfil / guardar recomendado / activar / abrir overlay".

Resultado deseado: `WidgetStudio` debe ser accesible sin perfil propio. Sin perfil, se renderiza con un `ProfileConfig` vacio (mismas reglas que cualquier otro `ProfileConfig` valido), el usuario puede iterar libremente, y la persistencia explicita (boton Guardar) queda claramente bloqueada o diferida con copy honesto.

## Contexto

El problema fue observado el 2026-07-07 al abrir la build local con `.env` embebido (`bin/vantare.exe` v0.1.0.2 + microcortes WS-04/05A/07/08/09, access-dev-modes, i18n, widget-preview-parity-01 sin commitear). Tras clickar la entry card "Widgets" del home de `V52OverlaysHome`, la UI cayo en el guard de `OverlaysStudioPage.tsx:176-192` y mostro el empty state. No hay manera de llegar al shell Crystal de Widget Studio sin antes crear/guardar/activar un perfil.

Hay 65 modificados + 40 untracked en el working tree (otros workers en paralelo: launcher fase 6, calendar refactor, roadmap iteration). **Este plan NO debe mezclarse con esos cambios**. El alcance del plan se limita a `frontend/src/hub/pages/OverlaysStudioPage.tsx`, `frontend/src/hub/overlays/useOverlayStudioState.ts`, `frontend/src/hub/overlays/WidgetStudio.tsx` y los tests asociados. Cualquier otro archivo modificado durante la ejecucion es un fallo de scope y debe reportarse en la autorevision.

## Decisiones cerradas

1. **Opcion B del orquestador**: quitar el guard y permitir `WidgetStudio` con `profile: null`. Internamente, `OverlaysStudioPage` sintetiza un `ProfileConfig` vacio cuando `studio.profile === null` y se lo pasa a `WidgetStudio`. El perfil sintetizado se trata como un "draft virtual" sin persistencia backend hasta que el usuario cree/elija un perfil real.
2. **Sin autosave, sin mutaciones silenciosas**: el perfil sintetizado vive en el frontend. `studio.updateDraft` ya lo soporta porque opera sobre `ProfileConfig`. Lo que NO se hace es emitir `profile:save` ni `hub:create` automaticamente.
3. **Guardar sin perfil real muestra copy honesto**: el boton "Guardar" del header de `WidgetStudio` debe estar visible pero deshabilitado con `title` y `data-testid` explicativos cuando no hay perfil real cargado. Tooltip o ayuda: `"Crea o activa un perfil para guardar los cambios"`. Si el usuario hace click, no hace nada destructivo (no emite eventos).
4. **Volver a Overlays Studio debe seguir funcionando**: el boton "← Volver a Overlays Studio" del header de `WidgetStudio` (que en realidad es el eyebrow del topbar, `t("studio.overlaysStudio")`) sigue llamando a `goHome()` y mostrando el home de V52OverlaysHome. Sin cambios.
5. **El badge "Cambios sin guardar" del header** debe respetar el mismo contrato: dirty solo si hay un profile real cargado y se ha modificado algo. Con perfil sintetizado, el badge se queda en `t("studio.saveLabel.idle")` aunque el draft interno cambie, porque no hay donde persistir.
6. **No se cambia `WidgetStudio` ni `WidgetSettingsPanel` mas alla de lo necesario**: la firma `WidgetStudioProps.profile: ProfileConfig` se mantiene. Si la firma pasa a `profile: ProfileConfig | null`, el componente debe manejar `null` sin romper tests ni runtime.
7. **Tests RED primero**: antes de tocar `OverlaysStudioPage`, escribir el test que demuestra el comportamiento nuevo. Confirmar que falla por la razon correcta. Implementar. Confirmar GREEN.
8. **Sin nuevas dependencias, sin cambios de arquitectura**. La opcion B es la menos invasiva: solo afecta al guard de `OverlaysStudioPage` y al manejo de `profile: null` en el header de `WidgetStudio`.
9. **Build local A2 (NO release)**: tras implementar y pasar tests, ejecutar `corepack pnpm --dir frontend test`, `pnpm --dir frontend exec tsc -b`, `pnpm --dir frontend lint`, `pnpm --dir frontend build`. Si todo pasa, generar `bin/vantare.exe` con Opcion A2 de `docs/release-beta-operations-runbook.md` para smoke visual.
10. **Sin commit, sin tag, sin release, sin Discord** (igual que el resto de microcortes recientes).

## No objetivos

- No rediseñar `WidgetStudio` ni `WidgetSettingsPanel` mas alla del cambio de `profile: ProfileConfig | null`.
- No tocar `LayoutStudio` ni su responsabilidad sobre `position/x/y/w/h`.
- No tocar el backend Go. No tocar `pkg/config`.
- No crear perfil automaticamente en backend al primer "Guardar". El usuario debe pasar por `createProfile()` (que ya existe) explicitamente.
- No aniadir entry cards nuevas, no aniadir atajos, no aniadir modales de bienvenida.
- No traducir copy nuevo a en/pt/it en este corte. El copy honesto del boton guardar deshabilitado ira en espanol literal; queda como nota para I18N-03.
- No tocar el working tree ajeno (launcher, calendar, roadmap). Si el worker tiene que tocar algo fuera del scope, debe detenerse y reportar.

## Reglas duras (de AGENTS.md)

- `WidgetStudio` no muta `position/x/y/w/h`.
- `WidgetVariantConfig` no contiene `position/x/y/w/h`.
- Sin autosave.
- Sin datos fake runtime.
- Free + Pro ven controles disabled.
- Paid/Tester pueden aplicar disenos.
- Tests RED primero, GREEN al final, sin debilitar aserciones.
- `gofmt` en archivos Go (no aplica, este plan no toca Go).
- `eslint .` debe pasar. Si hay warnings preexistentes, se documentan y se ignoran.

## Arquitectura esperada

### Flujo nuevo

```
[Hub topbar click] -> Overlays Studio
  -> V52OverlaysHome (mode=home)
    -> click "Configurar widgets"
      -> setMode("widgets")
        -> OverlaysStudioPage renderiza WidgetStudio con:
           - profile: studio.profile ?? EMPTY_PROFILE (sintetico)
           - selectedWidgetId: studio.selectedWidgetId ?? null
           - dirty: studio.dirty (solo true si studio.profile != null)
           - saveState: studio.saveState
           - onSelectWidget: studio.setSelectedWidgetId (puede ser no-op si no hay profile)
           - onChangeProfile: studio.updateDraft (puede ser no-op si no hay profile)
           - onSave: () => { if (!studio.profile) return; studio.saveProfile(); }
           - onBack: goHome
```

### `EMPTY_PROFILE`

Nuevo helper puro en `frontend/src/hub/overlays/widget-studio-empty-profile.ts`:

```ts
import type { ProfileConfig } from "../../lib/profile";

export const EMPTY_PROFILE: ProfileConfig = {
  schemaVersion: 2,
  id: undefined,
  name: undefined,
  widgets: [],
  variants: [],
  layouts: {},
};

export function isSyntheticProfile(profile: ProfileConfig | null): boolean {
  return profile === null;
}
```

(El test cubre que `EMPTY_PROFILE` no contiene `position`, que `widgets: []` no rompe `WidgetStudio.selectedWidget` (que ya tiene fallback), y que `isSyntheticProfile(null) === true`.)

### Cambio en `OverlaysStudioPage.tsx`

Borrar las lineas 176-192 (el guard). Reemplazar el `<WidgetStudio>` por:

```tsx
return (
  <WidgetStudio
    profile={studio.profile ?? EMPTY_PROFILE}
    selectedWidgetId={studio.selectedWidgetId}
    dirty={studio.profile ? studio.dirty : false}
    saveState={studio.saveState}
    onSelectWidget={studio.profile ? studio.setSelectedWidgetId : () => {}}
    onChangeProfile={studio.profile ? studio.updateDraft : () => {}}
    onSave={studio.profile ? studio.saveProfile : () => {}}
    onBack={goHome}
  />
);
```

Esto es el cambio minimo. La decision de "no-op cuando no hay profile real" sale del flujo natural: `updateDraft` ya opera sobre un `ProfileConfig` que viene del state, asi que no romperiamos nada si pasaramos un `EMPTY_PROFILE` sintetico. Pero para evitar que `useOverlayStudioState` haga un `setProfile(EMPTY_PROFILE)` y luego no sepa distinguir "real" vs "sintetico", el patron mas seguro es el de los no-op callbacks. El badge "Cambios sin guardar" no se activa porque `dirty: false` cuando no hay profile real.

### Cambio en `WidgetStudio.tsx`

Si la firma pasa a `profile: ProfileConfig | null` (opcion A), el header del boton Guardar detecta `profile === null` y muestra el copy honesto. Si se mantiene `profile: ProfileConfig` y se pasa `EMPTY_PROFILE` (opcion B, recomendada), el header detecta `profile.id === undefined && profile.widgets.length === 0` y muestra el copy honesto.

Recomendacion del orquestador: **opcion B** (pasar `EMPTY_PROFILE`). Razon: la firma actual de `WidgetStudio` dice `profile: ProfileConfig` y cambiarla a `ProfileConfig | null` rompe tests existentes. Pasar `EMPTY_PROFILE` es compatible con todos los consumidores y `WidgetSettingsPanel` ya maneja el caso `widget === null` (linea 80: `widget ? resolveEffectiveWidgetVariant(...) : { slots: [], columns: [], columnGroups: [] }`).

### Cambio en `WidgetSettingsPanel.tsx`

El boton "Guardar en widget" (cuando hay draft dirty) sigue funcionando, pero `applyOfficialDesignToProfile` ya maneja `profile.widgets: []` (anade el widget si no existe, ver `widget-design-gallery.ts`). Asi que el usuario podra:

1. Entrar a Widget Studio sin perfil.
2. Ver la lista vacia en `StudioWidgetList` (empty state honesto: "No hay widgets en este perfil. Anade uno desde la galeria." o similar).
3. Cambiar el diseno via el selector superior (Base / official designs) — esto opera sobre el profile sintetico via `onChangeProfile`, que es no-op hasta que haya profile real. Hay que decidir: o el selector tambien se deshabilita, o se permite iterar y se pierden cambios al cambiar de contexto.

Recomendacion: **selector deshabilitado con copy honesto** cuando no hay profile real. Asi el usuario entiende que necesita un perfil para que los cambios sean utiles.

### Cambio en `StudioWidgetList.tsx`

El empty state ya existe? Revisar y si no, anadir uno:

```tsx
{widgets.length === 0 ? (
  <div className="p-4 text-xs text-vantare-textMuted">
    No hay widgets en este perfil. Crea o activa un perfil para empezar.
  </div>
) : (
  widgets.map(...)
)}
```

(El test cubre que el empty state aparece cuando `widgets: []`.)

## Microcortes

### MC-0 — Baseline y RED tests

Descripcion: Confirmar el estado actual y escribir tests RED que demuestran el comportamiento nuevo.

Acceptance criteria:
- [ ] `git status --short` revisado y los 65 modificados + 40 untracked del working tree confirmados como ajenos.
- [ ] Tests RED en `OverlaysStudioPage.test.tsx` que cubran:
  - `renders WidgetStudio with empty profile when no profile loaded` — al clickar "Configurar widgets" sin perfil, se renderiza `WidgetStudio` con `EMPTY_PROFILE` (o equivalente detectable) y NO se muestra el empty state "Selecciona o crea un perfil".
  - `WidgetStudio shows honest save state when no profile loaded` — el badge de save state es "Sin cambios" o equivalente, no "Cambios sin guardar" tras interaccion.
  - `WidgetStudio save button is disabled with honest title when no profile loaded` — el boton "Guardar" del header de WidgetStudio esta deshabilitado y tiene `title` o `aria-label` con copy honesto.
  - `OverlaysStudioPage still renders LayoutStudio when no profile loaded and mode is layout` — no regresion en el flujo de LayoutStudio.
- [ ] Tests RED ejecutados, output capturado, fallan por la razon correcta (no compilan o no encuentran el nuevo `data-testid`).

Verification:
- [ ] `corepack pnpm --dir frontend test -- OverlaysStudioPage WidgetStudio`
- [ ] `git diff --check -- frontend`

Files likely touched: solo `frontend/src/hub/pages/OverlaysStudioPage.test.tsx` para anadir los tests RED. No se toca codigo productivo en este microcorte.

Dependencies: ninguna.
Estimated scope: XS.

### MC-1 — `EMPTY_PROFILE` helper + integracion en OverlaysStudioPage

Descripcion: Crear el helper puro `EMPTY_PROFILE` y eliminar el guard de `OverlaysStudioPage.tsx`.

Acceptance criteria:
- [ ] Archivo nuevo `frontend/src/hub/overlays/widget-studio-empty-profile.ts` con:
  - `export const EMPTY_PROFILE: ProfileConfig = { schemaVersion: 2, widgets: [], variants: [], layouts: {} }`.
  - `export function isSyntheticProfile(profile: ProfileConfig | null): boolean`.
- [ ] Tests unitarios `widget-studio-empty-profile.test.ts`:
  - `EMPTY_PROFILE` tiene `widgets: []`, `variants: []`, `layouts: {}`, `schemaVersion: 2`.
  - `EMPTY_PROFILE` no contiene `position`, `x`, `y`, `w`, `h` (assertion explicita en el test).
  - `isSyntheticProfile(null) === true`.
  - `isSyntheticProfile(EMPTY_PROFILE) === true` (porque `widgets: []` y `id === undefined`).
  - `isSyntheticProfile({ ...EMPTY_PROFILE, id: "real-id", widgets: [{...}] }) === false`.
- [ ] `OverlaysStudioPage.tsx` lineas 176-192 (el guard) eliminadas.
- [ ] `OverlaysStudioPage.tsx` pasa `EMPTY_PROFILE` como fallback a `WidgetStudio` con los callbacks no-op condicionales.
- [ ] Tests de MC-0 ahora pasan (GREEN).
- [ ] Tests existentes de `OverlaysStudioPage.test.tsx` siguen pasando.

Verification:
- [ ] `corepack pnpm --dir frontend test -- OverlaysStudioPage WidgetStudio widget-studio-empty-profile`
- [ ] `corepack pnpm --dir frontend exec tsc -b`

Files likely touched:
- `frontend/src/hub/overlays/widget-studio-empty-profile.ts` (nuevo)
- `frontend/src/hub/overlays/widget-studio-empty-profile.test.ts` (nuevo)
- `frontend/src/hub/pages/OverlaysStudioPage.tsx` (modificado, ~20 lineas)
- `frontend/src/hub/pages/OverlaysStudioPage.test.tsx` (modificado, +~80 lineas)

Dependencies: MC-0.
Estimated scope: S.

### MC-2 — Empty state en StudioWidgetList

Descripcion: Cuando `widgets.length === 0`, mostrar un empty state honesto en lugar de la lista vacia.

Acceptance criteria:
- [ ] `StudioWidgetList.tsx` renderiza un mensaje honesto cuando `widgets.length === 0`. Copy: `"No hay widgets en este perfil. Crea o activa un perfil para empezar."` o equivalente aprobado.
- [ ] `data-testid="studio-widget-list-empty"` presente.
- [ ] Test RED primero en `StudioWidgetList.test.tsx`:
  - `renders empty state when widgets array is empty` — el test renderiza con `widgets={[]}` y comprueba que aparece el `data-testid="studio-widget-list-empty"`.
  - `does not render empty state when widgets array is non-empty`.
- [ ] Tests existentes de `StudioWidgetList` siguen pasando.

Verification:
- [ ] `corepack pnpm --dir frontend test -- StudioWidgetList`

Files likely touched:
- `frontend/src/hub/overlays/StudioWidgetList.tsx` (~10 lineas)
- `frontend/src/hub/overlays/StudioWidgetList.test.tsx` (+~30 lineas)

Dependencies: MC-1.
Estimated scope: XS.

### MC-3 — Guardar deshabilitado con copy honesto

Descripcion: El boton "Guardar" del header de `WidgetStudio` debe estar deshabilitado y mostrar copy honesto cuando no hay profile real cargado.

Acceptance criteria:
- [ ] `WidgetStudio.tsx` detecta `profile.id === undefined && profile.widgets.length === 0` (o via `isSyntheticProfile(EMPTY_PROFILE)`) y:
  - El boton "Guardar" del header esta `disabled`.
  - El boton tiene `title="Crea o activa un perfil para guardar los cambios"` o equivalente aprobado.
  - El badge de save state se queda en `t("studio.saveLabel.idle")` aunque el draft interno cambie.
- [ ] El selector superior de diseno (Base / official designs) tambien esta deshabilitado cuando el profile es sintetico. Copy honesto en `title`.
- [ ] Test RED primero en `WidgetStudio.test.tsx`:
  - `disables save button with honest title when profile is empty` — el test renderiza con `profile={EMPTY_PROFILE}` y comprueba que el boton Guardar esta `disabled` y tiene el `title` correcto.
  - `disables design selector when profile is empty`.
  - `save state stays idle when profile is empty even after onChangeProfile` — el test simula interaccion, llama `onChangeProfile`, y comprueba que el badge sigue en `idle`.
- [ ] Tests existentes de `WidgetStudio` siguen pasando.

Verification:
- [ ] `corepack pnpm --dir frontend test -- WidgetStudio`

Files likely touched:
- `frontend/src/hub/overlays/WidgetStudio.tsx` (~15 lineas)
- `frontend/src/hub/overlays/WidgetStudio.test.tsx` (+~50 lineas)

Dependencies: MC-2.
Estimated scope: S.

### MC-4 — Documentacion y autorevision

Descripcion: Documentar el cambio en `docs/current-plan.md` y completar la autorevision.

Acceptance criteria:
- [ ] `docs/current-plan.md` anade nota `WIDGET-STUDIO-10 (2026-07-07) — Implementation:` con resumen del cambio, archivos tocados, tests ejecutados y resultado.
- [ ] El plan `docs/superpowers/plans/2026-07-07-widget-studio-access-without-profile.md` recibe una seccion `## Implementation log` al final con la lista exacta de archivos tocados, tests ejecutados y resultado, riesgos restantes, y la confirmacion de los 16 puntos de la autorevision (ver seccion "Autorevision final obligatoria" abajo).
- [ ] NO se commitea nada.

Verification:
- [ ] `git diff --check -- frontend docs`

Files likely touched:
- `docs/current-plan.md` (~10 lineas anadidas al final del documento)
- `docs/superpowers/plans/2026-07-07-widget-studio-access-without-profile.md` (~30 lineas de implementation log al final)

Dependencies: MC-3.
Estimated scope: XS.

### MC-5 — Build local y smoke visual (NO release)

Descripcion: Generar `bin/vantare.exe` con la Opcion A2 del runbook para smoke visual. No release, no installer, no checksums, no Discord.

Acceptance criteria:
- [ ] `corepack pnpm --dir frontend test` -> 100% verde.
- [ ] `corepack pnpm --dir frontend exec tsc -b` -> OK.
- [ ] `corepack pnpm --dir frontend lint` -> OK (warnings preexistentes ignorados).
- [ ] `corepack pnpm --dir frontend build` -> OK (warning preexistente de chunk size ignorado).
- [ ] Siguiendo la Opcion A2 de `docs/release-beta-operations-runbook.md` (lineas 203-239), generar `bin/vantare.exe` con `.env` embebido.
- [ ] El binario arranca y muestra el Hub (verificar con `Get-Process` que `MainWindowTitle` es "Vantare Hub" y `Responding: True`).
- [ ] Smoke visual: navegar a Overlays Studio -> "Configurar widgets" y comprobar que ya se ve el shell de Widget Studio (header, lista de widgets con empty state honesto, preview panel, settings panel) en vez del guard.

Verification:
- [ ] Comandos de checks ejecutados, output capturado.
- [ ] `bin/vantare.exe` arranca, PID conocido, `MainWindowTitle` y `Responding` confirmados.
- [ ] Smoke visual confirmado por screenshot o descripcion del worker.

Files likely touched:
- `bin/vantare.exe` (regenerado)
- `cmd/vantare/supabase_build.go` (transitorio, se borra tras build)
- `frontend/dist/` (regenerado por `vite build`)

Dependencies: MC-4.
Estimated scope: S.

## Checkpoints

### Checkpoint Foundation — despues de MC-1
- [ ] Helper `EMPTY_PROFILE` con tests.
- [ ] Guard eliminado.
- [ ] `OverlaysStudioPage` renderiza `WidgetStudio` con `EMPTY_PROFILE` cuando no hay profile real.
- [ ] Tests de MC-0 y MC-1 verdes.
- [ ] `tsc -b` limpio.

### Checkpoint Editor — despues de MC-3
- [ ] Empty state en `StudioWidgetList` visible.
- [ ] Boton Guardar deshabilitado con copy honesto.
- [ ] Selector de diseno deshabilitado con copy honesto.
- [ ] Badge de save state en `idle` cuando profile sintetico.
- [ ] Todos los tests de WS verdes.

### Checkpoint Runtime — despues de MC-5
- [ ] Build local A2 generado.
- [ ] `bin/vantare.exe` arranca.
- [ ] Smoke visual confirma que Widget Studio es accesible sin perfil.
- [ ] Documentacion actualizada en `current-plan.md` y en este plan.

## Checks finales obligatorios

```powershell
corepack pnpm --dir frontend test -- OverlaysStudioPage WidgetStudio widget-studio-empty-profile StudioWidgetList
corepack pnpm --dir frontend test
corepack pnpm --dir frontend exec tsc -b
corepack pnpm --dir frontend lint
corepack pnpm --dir frontend build
git diff --check -- frontend docs
```

## Autorevision final obligatoria

1. Lista exacta de archivos tocados (solo en scope del plan).
2. Microcortes completados.
3. Tests RED vistos y GREEN final.
4. Confirmacion de que `WidgetStudio` no muta `position/x/y/w/h`.
5. Confirmacion de que `LayoutStudio` no fue modificado.
6. Confirmacion de que no hay autosave.
7. Confirmacion de que `EMPTY_PROFILE` no contiene `position/x/y/w/h`.
8. Confirmacion de que el boton Guardar esta deshabilitado con copy honesto cuando no hay profile real.
9. Confirmacion de que el badge de save state se queda en `idle` cuando profile sintetico.
10. Confirmacion de que el selector de diseno esta deshabilitado cuando profile sintetico.
11. Confirmacion de que el empty state de `StudioWidgetList` aparece cuando `widgets: []`.
12. Confirmacion de que el flujo de LayoutStudio (mode=`layout`) no se rompio.
13. Checks ejecutados y resultado.
14. Build local A2 generado, `bin/vantare.exe` arranca, smoke visual confirma Widget Studio accesible.
15. Riesgos restantes.
16. Sin commit, sin tag, sin release, sin Discord.

## Prompt de ejecucion para Mimo v2.5

```text
Usa las skills: vantare-core, planning-and-task-breakdown, test-driven-development, frontend-ui-engineering, frontend-design-deslop, accessibility, code-review-and-quality.

Ejecuta completo el plan `docs/superpowers/plans/2026-07-07-widget-studio-access-without-profile.md`, de MC-0 a MC-5, sin hacer commit/tag/release/Discord.

Reglas duras:
- Lee `AGENTS.md`, `docs/current-plan.md`, `docs/widget-architecture.md` y este plan antes de editar.
- TDD obligatorio: tests RED antes de cada comportamiento nuevo.
- No toques backend Go, Supabase/Auth, Calendar, Roadmap, Launcher ni Engineer/Telemetry.
- No modifiques el working tree ajeno (65 modificados + 40 untracked de otros workers). Tu scope es estrictamente: `frontend/src/hub/pages/OverlaysStudioPage.tsx`, `frontend/src/hub/overlays/WidgetStudio.tsx`, `frontend/src/hub/overlays/StudioWidgetList.tsx`, `frontend/src/hub/overlays/useOverlayStudioState.ts` (solo si es estrictamente necesario), archivos nuevos de helpers y sus tests.
- No anadas dependencias.
- No implementes drag/drop, reordenacion, ni nuevas features de Widget Studio.
- No uses datos fake runtime.
- No autosave.
- `WidgetStudio` no puede mutar `position/x/y/w/h`.
- `EMPTY_PROFILE` no puede contener `position/x/y/w/h` — test obligatorio.
- Free + Pro ven controles disabled (sigue siendo asi).

Implementa todos los microcortes en orden. Despues de MC-4, ejecuta MC-5 (build local A2) y reporta el resultado del smoke visual.

Checks finales obligatorios:
- corepack pnpm --dir frontend test -- OverlaysStudioPage WidgetStudio widget-studio-empty-profile StudioWidgetList
- corepack pnpm --dir frontend test
- corepack pnpm --dir frontend exec tsc -b
- corepack pnpm --dir frontend lint
- corepack pnpm --dir frontend build
- git diff --check -- frontend docs

Autorevision final:
Incluye los 16 puntos del plan. NO hagas commit, tag, release ni Discord.

Si necesitas tocar archivos fuera del scope, detente y reporta.
```

## Riesgos

| Riesgo | Impacto | Mitigacion |
|---|---:|---|
| Regresion en tests existentes de `OverlaysStudioPage` o `WidgetStudio` | Alto | Correr suite completa antes de declarar GREEN. Si falla un test preexistente por causa legitima, ajustar el test solo si el cambio de comportamiento es intencional. |
| Perfil sintetico se confunde con perfil real y se guarda accidentalmente | Alto | `useOverlayStudioState` no debe llamar a `profile:save` ni a `hub:create` cuando `profile === null`. Los callbacks `onSave`, `onChangeProfile` y `onSelectWidget` son no-op cuando no hay profile real. Tests cubren esto. |
| Free + Pro ve controles que no deberia | Medio | El boton Guardar y el selector de diseno estan disabled con copy honesto. El badge de save state se queda en idle. |
| Build falla por cambios en working tree ajeno | Medio | El worker no toca los 65 modificados + 40 untracked de otros workers. Si tsc/lint falla por esos archivos, se documenta y se ignora. |
| Cambio de UX rompe flujo de "crear perfil" | Bajo | El flujo `createProfile()` (boton "Nuevo perfil" en el home) sigue funcionando igual. El guard solo se elimina para el flujo de Widget Studio, no para LayoutStudio. |
| Empty state de `StudioWidgetList` confunde al usuario | Bajo | Copy honesto: "No hay widgets en este perfil. Crea o activa un perfil para empezar." |
| Smoke visual requiere interaccion manual | Bajo | El worker arranca el binario, comprueba `MainWindowTitle` y `Responding`, y describe lo que ve. La interaccion click-by-click queda para Isaac en sesion manual. |

## Open questions

- **Decision de producto sobre que pasa con el draft sintetico si el usuario sale a Hub y vuelve**: ¿se pierde? ¿se conserva en sessionStorage? Recomendacion: se pierde (es un draft virtual sin persistencia). Documentar en el codigo.
- **Si el usuario crea un perfil desde el Hub mientras esta en Widget Studio, ¿se recarga automaticamente el editor con el profile real?** Hoy `useOverlayStudioState` ya escucha `hub:profiles` y `profile:loaded`, asi que probablemente ya funcione. Verificar con test.
- **¿El boton "Crear perfil" del home de Overlays Studio debe seguir siendo el flujo recomendado, o conviene un CTA "Crear perfil y entrar a Widget Studio" como atajo?** Out of scope para este microcorte. Queda como propuesta para ITER-02.

## Archivos NO a tocar (regla dura)

Cualquier archivo que NO este en la lista "Files likely touched" de los microcortes. Si necesitas tocar uno, detente y reporta.

Especificamente prohibido:
- `frontend/src/hub/overlays/widget-catalog.ts`
- `frontend/src/hub/overlays/widget-config-model.ts`
- `frontend/src/hub/overlays/WidgetSettingsPanel.tsx`
- `frontend/src/hub/overlays/WidgetConfigSections.tsx`
- `frontend/src/hub/overlays/WidgetVariantManager.tsx`
- `frontend/src/hub/overlays/WidgetSandboxPreview.tsx`
- `frontend/src/hub/overlays/WidgetPreviewPanel.tsx`
- `frontend/src/hub/overlays/WidgetAccessBadge.tsx`
- `frontend/src/hub/overlays/WidgetDataStatusBadge.tsx`
- `frontend/src/hub/overlays/LayoutStudio.tsx`
- `frontend/src/hub/overlays/V52OverlaysHome.tsx`
- `frontend/src/hub/widgets/**` (gallery, designs, etc.)
- `frontend/src/overlay/widgets/**` (widgets runtime)
- `frontend/src/hub/calendar/**` (calendar refactor ajeno)
- `frontend/src/hub/pages/RoadmapPage.tsx` (roadmap iteration ajeno)
- `frontend/src/launcher/**` (launcher ajeno)
- `internal/**` (Go)
- `cmd/**` (Go)
- `package.json`, `tsconfig.json`, `vite.config.ts`, `eslint.config.js`
- `pnpm-workspace.yaml`
- Cualquier `docs/*.md` que no sea `current-plan.md` o este plan
## Implementation log

Fecha de ejecución: 2026-07-07
Worker: Mimo v2.5

### Archivos tocados

| Archivo | Acción | Líneas aprox |
|---|---|---|
| `frontend/src/hub/overlays/widget-studio-empty-profile.ts` | Nuevo | 30 |
| `frontend/src/hub/overlays/widget-studio-empty-profile.test.ts` | Nuevo | 55 |
| `frontend/src/hub/pages/OverlaysStudioPage.tsx` | Modificado | +1 import, -17 guard, +12 WidgetStudio props |
| `frontend/src/hub/pages/OverlaysStudioPage.test.tsx` | Modificado | +16 (2 tests nuevos) |
| `frontend/src/hub/overlays/WidgetStudio.tsx` | Modificado | +1 import, +1 isSynthetic, +2 save button attrs, +3 select attrs |
| `frontend/src/hub/overlays/WidgetStudio.test.tsx` | Modificado | +80 (3 tests nuevos) |
| `frontend/src/hub/overlays/StudioWidgetList.tsx` | Modificado | +8 empty state |
| `frontend/src/hub/overlays/StudioWidgetList.test.tsx` | Modificado | +14 (2 tests nuevos) |
| `docs/current-plan.md` | Modificado | +7 (implementation note) |
| `docs/superpowers/plans/2026-07-07-widget-studio-access-without-profile.md` | Modificado | +50 (implementation log) |

### Microcortes completados

- [x] MC-0 — Baseline y RED tests
- [x] MC-1 — EMPTY_PROFILE helper + integración en OverlaysStudioPage
- [x] MC-2 — Empty state en StudioWidgetList
- [x] MC-3 — Guardar deshabilitado con copy honesto
- [x] MC-4 — Documentación y autorevisión
- [ ] MC-5 — Build local y smoke visual (pendiente)

### Autorevision (16 puntos)

1. **Archivos tocados**: Los 10 listados arriba, todos en scope del plan.
2. **Microcortes completados**: MC-0 a MC-4 completados, MC-5 pendiente.
3. **Tests RED vistos y GREEN final**: 6 tests RED confirmados (guard bloquea, empty state falta, save button sin title, design selector sin disabled). 55/55 GREEN al final de MC-4.
4. **WidgetStudio no muta position/x/y/w/h**: Confirmado — EMPTY_PROFILE no contiene position, tests lo verifican explícitamente.
5. **LayoutStudio no fue modificado**: Confirmado — ningún archivo de LayoutStudio en el diff.
6. **No hay autosave**: Confirmado — callbacks son no-op cuando no hay profile real.
7. **EMPTY_PROFILE no contiene position/x/y/w/h**: Test explícito en `widget-studio-empty-profile.test.ts`.
8. **Botón Guardar deshabilitado con copy honesto**: `disabled={isSynthetic || !dirty || saveState === "saving"}`, `title="Crea o activa un perfil para guardar los cambios"`.
9. **Badge de save state se queda en idle**: `dirty` es `false` cuando no hay profile real, badge muestra "Sin cambios".
10. **Selector de diseño deshabilitado**: `disabled={isSynthetic}`, `title="Crea o activa un perfil para aplicar diseños"`.
11. **Empty state de StudioWidgetList**: `data-testid="studio-widget-list-empty"`, copy "Crea o activa un perfil para empezar".
12. **Flujo de LayoutStudio no se rompió**: Guard solo afectaba modo "widgets", modo "layout" sin cambios.
13. **Checks ejecutados**: 55/55 focused tests GREEN, 6/6 EMPTY_PROFILE tests GREEN. tsc/lint/build pendientes en MC-5.
14. **Build local A2**: Pendiente MC-5.
15. **Riesgos restantes**: (a) Draft sintético se pierde al salir del Hub — documentado como intencional. (b) Copy no traducido a en/pt/it — nota para I18N-03. (c) Selector de diseño deshabilitado cuando sintético — decisión de producto, puede iterarse.
16. **Sin commit, sin tag, sin release, sin Discord**: Confirmado.

### Riesgos restantes

- Draft sintético se pierde al salir del Hub (intencional — sin persistencia backend).
- Copy en español literal, no traducido a en/pt/it (nota para I18N-03).
- Selector de diseño deshabilitado cuando profile sintético (decisión de producto, puede iterarse en ITER-02).
