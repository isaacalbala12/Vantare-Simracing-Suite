# Widget Design Gallery Beta Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capa de galería/hub de diseños de widgets para beta `v0.1.0.0`. Permite listar presets oficiales por widget type, aplicarlos al widget seleccionado sin tocar `position`, y convivir con los presets de usuario existentes.

**Architecture:** Helper puro `widget-design-gallery.ts` con catálogo de presets oficiales por widget type (`relative`, `standings`, `delta`, `pedals`) y función `applyOfficialDesign` que reusa `applyPreset` y nunca toca `position`. Componente `WidgetDesignGallery` dentro de `WidgetSettingsPanel` (ruta WidgetStudio) que lista los diseños compatibles con el widget seleccionado, sin controles de posición/tamaño. Los presets oficiales son solo lectura; los presets de usuario siguen viviendo en el backend `PresetService` (ya implementado en Task 4 previa).

**Tech Stack:** React/TypeScript, Vitest. Sin nuevas dependencias. Sin cambios de schema, sin cambios de Go, sin cambios de OBS runtime, sin auth/licensing.

---

## Decisiones cerradas

- **Sin backend nuevo**: los presets oficiales son estáticos en TS (no en disco). El backend `PresetService` ya existe y se mantiene para presets de usuario.
- **Aplicación preserva `position`**: `applyOfficialDesign` reusa `applyPreset` (spread mantiene `position` por contrato) y se testea explícitamente con `toEqual` para bloquear cualquier futura regresión.
- **No marketplace, no cloud sync, no sharing**: fuera de alcance beta.
- **No se toca `LayoutStudio`**: la galería vive solo en `WidgetSettingsPanel` (WidgetStudio).
- **No se introducen controles de position/tamaño en WidgetStudio**: la galería solo aplica appearance / variant / columns.
- **Archivos permitidos**:
  - `frontend/src/hub/overlays/WidgetStudio.tsx` (cambios mínimos si fueran necesarios para integrar la galería).
  - `frontend/src/hub/overlays/WidgetSettingsPanel.tsx`.
  - `frontend/src/hub/preview/WidgetRenderer.tsx` (cambios mínimos si fueran necesarios para previews).
  - `frontend/src/lib/profile.ts` (cambios mínimos si fueran necesarios para tipos).
  - `frontend/src/hub/widgets/**` carpeta nueva permitida.
  - Tests relacionados.
- **Archivos prohibidos** (NO tocar):
  - `auth/licensing`, `internal/license`, `supabase`.
  - `VERSION`, `build/`, `.github/workflows/`.
  - Overlay runtime Go (`cmd/vantare`, `internal/window`, `internal/app` salvo tests sin side effects).

---

## Tests obligatorios (contrato beta)

1. Aplicar diseño conserva `position` byte a byte.
2. Aplicar diseño cambia `appearance` (y, según widget, `variant.columns`) según el preset elegido.
3. La galería filtra por widget type y nunca muestra diseños incompatibles.
4. Si llega un preset con `widgetType` distinto al del widget seleccionado, la galería lo descarta y `applyOfficialDesign` lanza error.
5. `WidgetStudio` (página completa) sigue sin exponer X/Y/W/H, "Eliminar" ni secciones de position/tamaño.
6. La galería no muestra controles que muten `position`.

---

## Task 1: Helper puro `widget-design-gallery.ts`

**Files:**
- Create: `frontend/src/hub/widgets/widget-design-gallery.ts`
- Create: `frontend/src/hub/widgets/widget-design-gallery.test.ts`

- [ ] **Step 1: Escribir tests del helper puro (deben fallar)**

Cubrir:
- `OFFICIAL_DESIGNS` no está vacío y contiene al menos un diseño por widget type soportado (`relative`, `standings`, `delta`, `pedals`).
- `listOfficialDesigns(widgetType)` devuelve solo diseños cuyo `widgetType` coincide (filtro estricto).
- `listOfficialDesigns(widgetType)` devuelve `[]` para widget types desconocidos.
- `applyOfficialDesign(widget, design)` modifica `props.appearance` y, si el design tiene `variant`, genera `variantId` y devuelve una `WidgetVariantConfig`.
- `applyOfficialDesign(widget, design)` **preserva `position` exactamente**.
- `applyOfficialDesign(widget, design)` rechaza designs con `widgetType` distinto (lanza error).
- `applyOfficialDesign` no muta el widget original.
- Los designs oficiales incluyen `widgetType` válido en sus variantes y los campos `appearance`/props que se aplican.

- [ ] **Step 2: Implementar `widget-design-gallery.ts`**

Decisiones:
- Catálogo `OFFICIAL_DESIGNS: OfficialDesign[]` exportado como `const`, no se persiste en disco.
- Tipo `OfficialDesign` con `id`, `name`, `description`, `widgetType`, `appearance`, `variant?`, `props?`.
- Mínimo 2 designs por cada uno de los 4 widget types pedidos (Relative, Standings, Delta, Pedals). 8 designs totales mínimo.
- Los designs deben usar IDs estables (sin UUID) y `name`/`description` claros para el usuario beta.
- Reutilizar `applyPreset` de `lib/widget-presets.ts` (no duplicar lógica). `applyOfficialDesign` es un wrapper que valida `widgetType`, asigna un `id` único interno para el variantId, y devuelve `{ widget, variant }`.
- `listOfficialDesigns(widgetType)` filtra estrictamente.

- [ ] **Step 3: Verificar tests**

Run:
```powershell
$env:Path = "C:\Users\isaac\AppData\Roaming\npm;$env:Path"
pnpm --dir frontend test -- widget-design-gallery
```

Expected: PASS.

---

## Task 2: Componente `WidgetDesignGallery.tsx`

**Files:**
- Create: `frontend/src/hub/widgets/WidgetDesignGallery.tsx`
- Create: `frontend/src/hub/widgets/WidgetDesignGallery.test.tsx`

- [ ] **Step 1: Escribir tests del componente (deben fallar)**

Cubrir:
- Renderiza la lista de diseños compatibles con el widget seleccionado (mock de `listOfficialDesigns` si se prefiere inline).
- NO renderiza diseños incompatibles (test directo: dado un widget `relative`, no aparece ningún diseño cuyo `widgetType !== "relative"`).
- Al hacer click en "Aplicar", llama a `onApplyDesign(design)` (callback del padre).
- Muestra el nombre del widget en el encabezado de la sección.
- Si no hay widget seleccionado, no renderiza la sección.
- Si la lista filtrada está vacía, muestra un mensaje tipo "Sin diseños oficiales disponibles".

- [ ] **Step 2: Implementar `WidgetDesignGallery.tsx`**

Decisiones:
- Props: `{ widget: WidgetConfig | null; onApplyDesign: (design: OfficialDesign) => void; testId?: string }`.
- Render solo si `widget !== null`.
- Lista filtrada con `listOfficialDesigns(widget.type)`.
- Cada item: nombre, descripción corta, botón `Aplicar` que invoca `onApplyDesign(design)`.
- Botón `Aplicar` deshabilitado mientras el padre está aplicando (prop opcional `applyingId`).
- Estilo consistente con `WidgetPresetSection` (oscuro, mono, denso).
- Sin inputs de position/tamaño/eliminar.
- `data-testid` para los elementos clave (`widget-design-gallery`, `widget-design-item-{id}`, `widget-design-apply-{id}`, `widget-design-empty`).

- [ ] **Step 3: Verificar tests**

Run:
```powershell
pnpm --dir frontend test -- WidgetDesignGallery
```

Expected: PASS.

---

## Task 3: Integrar galería en `WidgetSettingsPanel`

**Files:**
- Modify: `frontend/src/hub/overlays/WidgetSettingsPanel.tsx`
- Create/Modify: `frontend/src/hub/overlays/WidgetSettingsPanel.test.tsx` (añadir tests si no existen).

- [ ] **Step 1: Añadir tests de integración**

Cubrir:
- `WidgetSettingsPanel` renderiza la sección `WidgetDesignGallery` cuando hay un widget seleccionado.
- Al hacer click en `Aplicar` en un diseño oficial, `onChangeProfile` recibe un perfil con `position` inalterado y `appearance`/`variant` actualizados.
- `WidgetSettingsPanel` sigue sin exponer controles de position/tamaño (test ya existente debe seguir verde).

- [ ] **Step 2: Implementar integración**

Decisiones:
- Importar `WidgetDesignGallery` y `applyOfficialDesign` de `frontend/src/hub/widgets/widget-design-gallery`.
- Añadir la sección `WidgetDesignGallery` en el panel, **después** de `WidgetPresetSection` (los presets oficiales van primero como capa "design gallery", los de usuario van como capa "guardar/aplicar presets locales").
- `onApplyDesign` envuelve `applyOfficialDesign` y emite `onChangeProfile` igual que hace `WidgetPresetSection`.
- No introducir props nuevas en `WidgetSettingsPanel` si se puede resolver con el profile+widget actuales.
- Reusar la lógica de variantes que ya tiene `WidgetPresetSection` (eliminar `variantId` previo del widget, eliminar la variant previa del `profile.variants`, añadir la nueva).

- [ ] **Step 3: Verificar tests**

Run:
```powershell
pnpm --dir frontend test -- WidgetSettingsPanel
```

Expected: PASS.

---

## Task 4: Tests de no-regresión `WidgetStudio`

**Files:**
- Modify (si necesario): `frontend/src/hub/overlays/WidgetStudio.test.tsx` (añadir un test explícito).

- [ ] **Step 1: Añadir test que la galería aparece dentro de WidgetStudio y no rompe el contrato de separation**

Test:
- Renderizar `WidgetStudio` con un widget `relative` seleccionado y verificar que `getByTestId("widget-design-gallery")` está presente y que no hay inputs/buttons de position/tamaño en todo el árbol.

- [ ] **Step 2: Verificar que ningún test previo se rompe**

Run:
```powershell
pnpm --dir frontend test -- WidgetStudio WidgetSettingsPanel WidgetRenderer
```

Expected: PASS.

---

## Task 5: Suite completa y checks

Run:
```powershell
pnpm --dir frontend test
pnpm --dir frontend exec tsc -b
pnpm --dir frontend build
pnpm --dir frontend lint
git diff --check
```

Expected:
- Todos los tests PASS.
- tsc, build, lint exit 0.
- `git diff --check` sin errores.

---

## Archivos esperados

Creados:
- `frontend/src/hub/widgets/widget-design-gallery.ts`
- `frontend/src/hub/widgets/widget-design-gallery.test.ts`
- `frontend/src/hub/widgets/WidgetDesignGallery.tsx`
- `frontend/src/hub/widgets/WidgetDesignGallery.test.tsx`
- `docs/superpowers/plans/2026-06-29-widget-design-gallery-beta.md` (este plan)

Modificados:
- `frontend/src/hub/overlays/WidgetSettingsPanel.tsx`
- `frontend/src/hub/overlays/WidgetSettingsPanel.test.tsx` (posibles nuevos tests)
- `frontend/src/hub/overlays/WidgetStudio.test.tsx` (posibles nuevos tests)
- `docs/current-plan.md` (estado del bloque)

NO modificados (prohibido):
- `frontend/src/hub/overlays/LayoutStudio.tsx`
- `frontend/src/hub/overlays/WidgetPresetSection.tsx`
- `frontend/src/lib/widget-presets.ts`
- `frontend/src/lib/widget-presets-store.ts`
- Cualquier archivo Go, auth, supabase, license, build, workflow, runtime overlay, OBS.

---

## Verificación manual

1. Abrir app, ir a `Widgets` en `Overlays Studio`.
2. Seleccionar un widget `Relative`. Comprobar que aparece la sección `Diseños oficiales` con al menos 2 opciones.
3. Pulsar `Aplicar` en uno. El preview debe cambiar appearance pero la posición visible del widget en el panel no debe cambiar.
4. Cambiar al widget `Pedals`. La lista debe filtrarse y mostrar solo designs de pedals.
5. Cambiar al widget `Delta`. Idem.
6. Cambiar al widget `Standings`. Idem.
7. Pulsar `Guardar` en `WidgetStudio` y verificar que el perfil persistido tiene `position` intacto.

---

## Riesgos y P3 esperados

- P3: si en el futuro se quiere marcar un diseño aplicado como "activo" y deshabilitar otros, queda para iteración post-beta.
- P3: la galería no muestra una miniatura real renderizada del widget con el diseño aplicado (solo nombre + descripción) para no introducir un sub-widget runtime en el panel. Se podrá añadir cuando se cierre el rework visual global.
- P3: si se quieren presets oficiales por versión, queda para R04+.