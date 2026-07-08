# Widget Architecture

Documento canonico para workers que cambien widgets, editores de widgets, previews, runtime overlay o perfiles.

Este documento no sustituye a:

- `docs/widget-rendering-preview-contract.md`: contrato detallado de render, preview y sizing.
- `docs/beta-widget-system-spec.md`: spec amplia de sistema beta, templates, variantes, slots y metricas.
- `docs/product-widget-customization.md`: vision de producto de personalizacion.

Usalo como entrada rapida antes de tocar codigo. Si hay contradiccion, este documento define la separacion de responsabilidades y los otros documentos aportan detalle tecnico o de producto.

## Regla central

`WidgetStudio` edita configuracion interna del widget. `LayoutStudio` edita composicion externa en el lienzo.

| Area | WidgetStudio | LayoutStudio |
|---|---|---|
| Posicion `x/y` | No | Si |
| Tamano externo `w/h` | No | Si |
| Orden/composicion del perfil | No | Si |
| Activar/desactivar instancia | No | Si |
| Abrir/detener overlay | No | Si |
| Columnas | Si | No |
| Metricas | Si | No |
| Filtros | Si | No |
| Formatos | Si | No |
| Apariencia interna | Si | No |
| Variante/theme | Si, para diseno interno | Solo seleccion si el flujo lo requiere |

Si un cambio necesita tocar columnas y `position` a la vez, hay que separarlo en dos cortes o justificar explicitamente por que no se puede.

## Modelo de datos actual

Fuente TypeScript: `frontend/src/lib/profile.ts`.

`ProfileConfig` contiene:

- `widgets: WidgetConfig[]`: instancias colocadas en el perfil.
- `variants?: WidgetVariantConfig[]`: configuraciones internas reutilizables por widgets.
- `layouts?: Partial<Record<LayoutType, ProfileLayout>>`: layouts por sesion cuando apliquen.

`WidgetConfig` contiene:

- `id`, `type`, `enabled`, `updateHz`, `visibleWhen`.
- `position: Rect`: geometria externa de la instancia. Pertenece a `LayoutStudio`.
- `variantId?: string`: referencia a una variante reusable.
- `style?: string` y `props?: WidgetPropsMap`: configuracion interna y overrides. Pertenece a `WidgetStudio` salvo excepcion documentada.

`WidgetVariantConfig` contiene:

- `themeId`, `templateId`, `name`.
- `slots`, `columns`, `columnGroups`.
- `filters`, `formats`, `props`.

Una variante no guarda posicion ni tamano global. Si un worker propone guardar `position` dentro de una variante, esta rompiendo el contrato.

## Edicion por columnas

La decision vigente es editar widgets tabulares por columnas, no por toggles sueltos.

Aplica principalmente a `relative`, `standings` y futuros widgets tipo tabla.

Cada columna debe tratarse como una unidad editable:

- `id`: identidad estable de la columna.
- `metricId`: metrica mostrada.
- `enabled`: si aparece.
- `width`: ancho interno de la columna.
- `format`: formato de la metrica.
- `style`: estilo local de la columna si procede.

Reglas:

1. Activar/desactivar/reordenar/editar columnas pertenece a `WidgetStudio`.
2. `column.width` es ancho interno, no `position.w`.
3. Si las columnas activas hacen que el widget sea mas ancho, la preview de `WidgetStudio` debe mostrar el ancho intrinseco sin mutar `position`.
4. `LayoutStudio` puede redimensionar la instancia completa, pero no debe editar columnas ni metricas.
5. Los widgets deben tener catalogos de columnas/metricas cuando la logica deje de ser trivial. No repartir props sueltas tipo `showBestLap` si el widget ya se modela por columnas.

Tests existentes que protegen esta decision:

- `WidgetStudio.test.tsx`: actualiza columnas de `standings` sin tocar `position`.
- `WidgetSettingsPanel.test.tsx`: aplicar diseno oficial conserva `position`.
- `WidgetSandboxPreview.test.tsx`: usa ancho intrinseco sin mutar `position`.

## Superficies de render

### WidgetStudio sandbox

Responsabilidad: editar y previsualizar configuracion interna.

Usa:

- `WidgetSandboxPreview`
- `WidgetRenderer`
- `PreviewScaler`

Reglas:

- No usa drag/resize.
- No usa `PreviewWidgetFrame`.
- Puede usar sizing intrinseco para widgets configurables.
- No persiste cambios sin accion explicita del usuario.
- Nunca abre/detiene overlays.
### Draft local y edicion

`WidgetSettingsPanel` mantiene un draft local de la configuracion editable del widget seleccionado.

Flujo:

1. `resolveEffectiveWidgetVariant(widget, profile)` resuelve la config efectiva (variant > props > defaults).
2. El draft se inicializa con la config efectiva.
3. El usuario edita slots/columns/columnGroups via `WidgetConfigSections`.
4. El draft diverge sin persistir. Dirty detection via JSON comparison.
5. El usuario puede:
   - **Guardar en widget**: merge draft en `widget.props` (slots/columns/columnGroups). No crea variante.
   - **Guardar como variante**: usa draft como contenido de la variante. No incluye position.
   - **Descartar**: restaura draft a la config efectiva.
   - **Aplicar variante existente**: reemplaza draft con la variante.

Reglas:

- `WidgetConfigSections` recibe `slots`, `columns`, `columnGroups` como props y notifica cambios via `onDraftChange`.
- `canApply` controla si los controles estan habilitados. Free + Pro ven controles disabled.
- Los helpers de edicion (`toggleSlotEnabled`, `updateColumnConfig`, etc.) son puros y no mutan input.
- Los helpers no devuelven `position`, `x`, `y`, `w`, `h`.
- `widthPreset` (xs/sm/md/lg/auto) se mapea a anchos numericos en el runtime via `WIDTH_PRESET_MAP`.

### LayoutStudio canvas

Responsabilidad: colocar instancias en canvas.

Usa:

- `PreviewCanvas`
- `PreviewWidgetFrame`

Reglas:

- Siempre usa `position.w/h` como caja externa.
- Puede mover/redimensionar/activar/desactivar instancias.
- No expone columnas, filtros, metricas, formatos ni apariencia interna.
- Guardado explicito.

### Runtime desktop

Responsabilidad: render real en app desktop.

Usa:

- `CompositeApp`
- `WidgetHost`
- `WidgetRenderer`
- transporte Wails cuando aplique.

Reglas:

- No muta perfiles.
- Renderiza datos live.
- Usa `position` como fuente de layout.

### OBS overlay

Responsabilidad: render real para fuente navegador OBS.

Usa:

- `ObsOverlayApp`
- `WidgetHost`
- telemetria SSE cuando aplique.

Reglas:

- Debe comportarse como runtime desktop en sizing/layout.
- No debe depender de APIs Wails.
- No muta perfiles.

### Profile previews y miniaturas

Responsabilidad: mostrar una vista reducida de un perfil.

Reglas:

- Son preview, no editor de apariencia.
- No deben confundirse con `WidgetStudio`.
- No deben persistir cambios.

## Sizing

Hay tres conceptos distintos que no deben mezclarse:

1. Layout size: `widget.position.w/h`. Pertenece a `LayoutStudio`.
2. Intrinsic size: ancho/alto natural del contenido, por ejemplo columnas activas. Pertenece al preview/render del widget.
3. Base size: tamano logico usado por `WidgetHost` o `PreviewWidgetFrame` para escalar proporcionalmente.

Reglas:

- `widget-preview-size.ts` calcula sizing intrinseco solo para el sandbox de `WidgetStudio`.
- `widget-base-size.ts` calcula base size para runtime y canvas cuando el widget necesita escalado proporcional.
- `WidgetHost` coloca y escala widgets en runtime segun `position`.
- Un widget no debe leer `position.w/h` directamente. Debe recibir su host ya resuelto.

## Flujo para crear o modificar un widget

Antes de tocar codigo:

1. Identificar si el cambio es de configuracion interna o layout externo.
2. Leer este documento y `docs/widget-rendering-preview-contract.md`.
3. Buscar tests cercanos antes de editar.

Para un widget nuevo:

1. Crear componente en `frontend/src/overlay/widgets/`.
2. Registrar en `frontend/src/hub/preview/WidgetRenderer.tsx`.
3. Registrar en `CompositeApp` y `ObsOverlayApp` si debe existir en runtime.
4. Definir default size en `frontend/src/lib/widget-factory.ts`.
5. Definir estilo/defaults donde corresponda.
6. Si es tabular, definir columnas/metricas por catalogo.
7. Si necesita sizing proporcional, actualizar `widget-base-size.ts`.
8. Si necesita preview intrinseca, actualizar `widget-preview-size.ts`.
9. Anadir settings section si tiene configuracion propia.
10. Tests de widget, WidgetStudio, LayoutStudio/runtime segun riesgo.

## Guardado y persistencia

Reglas actuales:

- Cambios en `WidgetStudio` requieren guardado explicito.
- Cambios en `LayoutStudio` requieren guardado explicito.
- Previews no persisten.
- Runtime desktop y OBS no persisten.
- Recomendados/copias deben conservar la separacion: copiar un perfil puede copiar `position` y variantes; aplicar una variante no debe mover la instancia.

## Patrones prohibidos

- Editar `position` desde `WidgetStudio`.
- Editar columnas/filtros/apariencia desde `LayoutStudio`.
- Guardar `position` dentro de `WidgetVariantConfig`.
- Crear toggles sueltos cuando el widget ya es de columnas/slots.
- Usar mocks visuales estaticos si existe telemetria normalizada.
- Hacer autosave en pantallas de edicion.
- Registrar transports reales en previews del Hub.
- Resolver problemas de preview moviendo/redimensionando instancias.
- Anadir dependencias UI para resolver layout de widgets sin aprobacion.

## Checklist de revision para workers

Antes de cerrar un cambio de widgets:

- [ ] El cambio toca solo la superficie correcta (`WidgetStudio`, `LayoutStudio`, runtime, OBS o preview).
- [ ] `WidgetStudio` no cambia `position`.
- [ ] `LayoutStudio` no cambia columnas, filtros, metricas ni apariencia.
- [ ] Variantes no guardan posicion/tamano.
- [ ] Columnas se editan como columnas, no como toggles sueltos.
- [ ] Preview de `WidgetStudio` no deja espacio vacio artificial.
- [ ] Runtime desktop y OBS siguen compartiendo contrato de sizing.
- [ ] No hay autosave accidental.
- [ ] Hay tests o razon clara para no anadirlos.
- [ ] `docs/current-plan.md` se actualizo si el estado del proyecto cambia.

## Referencias rapidas

- Arquitectura general: `docs/architecture.md`
- Contrato de render/preview: `docs/widget-rendering-preview-contract.md`
- Spec tecnica amplia: `docs/beta-widget-system-spec.md`
- Vision producto: `docs/product-widget-customization.md`
- Tipos de perfil: `frontend/src/lib/profile.ts`
- Preview sandbox: `frontend/src/hub/overlays/WidgetSandboxPreview.tsx`
- Widget renderer: `frontend/src/hub/preview/WidgetRenderer.tsx`
- Layout canvas: `frontend/src/hub/preview/PreviewCanvas.tsx`
- Runtime desktop: `frontend/src/overlay/CompositeApp.tsx`
- Runtime OBS: `frontend/src/overlay/ObsOverlayApp.tsx`

## Visual Token Architecture (WS-11.A1-A3 + B1-B4)

The visual presentation of widgets is composed of four layers, each with a single responsibility:

### Layer 1: Runtime resolver (`widget-design-system.ts`)

File: `frontend/src/overlay/widgets/widget-design-system.ts`

The resolver (`resolveWidgetDesignSystem(themeId)`) returns a `DesignSystemTokens` object containing **structural tokens**: accent color, background, surface, border, text colors, typography (displayFont, bodyFont, monoFont), radii (sm/md/lg/xl), and effects (glow). The runtime OBS/overlay reads these tokens to render the widget's chrome (header, panel, card).

Two themes are registered: `base` and `vantare-crystal`. The `vantare-crystal` tokens match the visual reference in `docs/overlay-glassmorphism-pro.html`. Vantare brand tokens (accent `#ff3b3b`, negative `#ff2a3b`, glow accent) are kept as the Vantare identity.

### Layer 2: Per-widget-type catalog (`style-catalog.ts`)

File: `frontend/src/hub/state/style-catalog.ts`

The catalog (`getStylesForType(widgetType)`, `getDefaultAppearance(widgetType, styleId)`) provides per-widget-type `WidgetAppearance` defaults: accentColor, textColor, backgroundColor, borderColor, plus widget-specific fields (tire colors, pedal colors, class colors, gap colors, RPM LEDs).

For `vantare-crystal`, the defaults match the HTML reference. Class colors use a translucent badge scheme (`bg: rgba(...,0.25)` + `fg: #...`). Tokens not defined in the HTML (tireHard, rpmBlue, classGt4, classUnknown) have invented values documented in the commit.

### Layer 3: Registry de sistemas de diseño (`hub/registry/`)

Files: `frontend/src/hub/registry/` (WS-11.B1-B4)

The design system registry (`registerDesignSystem`, `lookupDesignSystem`, `listDesignSystems`) bundles structural tokens + per-type defaults + optional JSX components (Header, Row, Footer) into a single `DesignSystem` object. See "Registry de Sistemas de Diseño" below.

Three built-in systems are registered at startup: `base`, `vantare-crystal`, `vantare-v3`. The registry is the single source of truth for design system lookup. Widgets that support component replacement (currently only `StandingsWidget`) read from the registry via `useWidgetComponents(type, themeId)`.

### Layer 4: User overrides (`OfficialDesign.appearance`, `WidgetVariantConfig.appearance`)

When the user applies an `OfficialDesign` from the gallery, the design's `appearance` overrides the catalog defaults. When the user creates a custom variant, the variant's `appearance` (and `props`, `columns`, `filters`, `formats`) overrides everything.

### Flow

1. User selects an `OfficialDesign` in `WidgetDesignGallery` (still hardcoded `OFFICIAL_DESIGNS`, not the registry).
2. `applyOfficialDesignToProfile` creates a `WidgetVariantConfig` with `appearance` from the design.
3. On render, the runtime reads `widget.style` (or `variant.themeId`) to get the `themeId`.
4. The runtime calls `resolveWidgetDesignSystem(themeId)` to get structural tokens.
5. The widget calls `useWidgetComponents(type, themeId)` to check for custom JSX components from the registry.
6. The widget reads `variant.appearance` (or the catalog default) for per-widget-type colors.
7. Structural tokens + per-widget colors + optional custom components are merged to render the widget.

## Registry de Sistemas de Diseño (WS-11.B1-B4)

Files: `frontend/src/hub/registry/`

### `DesignSystem` type (`design-system.ts`)

```ts
type DesignSystem = {
  id: string;                                      // Unique ID, used as themeId in variants
  name: string;                                    // Human-readable name
  description?: string;                            // Short description for gallery
  tokens: DesignSystemTokens;                      // Structural tokens (Layer 1)
  perWidgetAppearance: Partial<Record<WidgetType, WidgetAppearance>>;  // Per-type defaults
  components: Partial<Record<WidgetType, WidgetComponents>>;            // Optional JSX parts
  officialDesigns?: unknown[];                     // Reserved for future use
};
```

`WidgetComponents` is an object with optional `Header`, `Row`, `Footer` component slots. Each component receives `WidgetComponentProps<TData>`: `data`, `appearance`, `className`.

### Registry API (`design-system-registry.ts`)

| Function | Description |
|---|---|
| `registerDesignSystem(system)` | Register a system. Throws on duplicate id. |
| `lookupDesignSystem(id)` | Lookup by id. Returns `DesignSystem` or `null`. Safe for undefined/null/empty. |
| `listDesignSystems()` | Returns array of all registered systems. |
| `clearDesignSystemRegistry()` | Clears all registrations. **Tests only**. |

The registry is an in-memory `Map<string, DesignSystem>` at module level. Systems are registered explicitly — there are no side-effect imports.

### Component resolution (`widget-components.ts`)

```ts
// Synchronous resolver: returns WidgetComponents for a type + themeId
resolveWidgetComponents(type: string, themeId: string | undefined | null): WidgetComponents

// React hook: memoized by type + themeId
useWidgetComponents(type: string, themeId: string | undefined | null): WidgetComponents
```

Both return empty object `{}` when the system is not found or doesn't provide components for that type. The widget falls back to its built-in implementation.

### Built-in systems (`builtin-systems.ts`)

| id | name | Tokens source | Per-type defaults | Components |
|---|---|---|---|---|
| `base` | Base | `resolveWidgetDesignSystem("base")` | `getDefaultAppearance(type, "base")` for all widget types | None |
| `vantare-crystal` | Vantare Crystal | `resolveWidgetDesignSystem("vantare-crystal")` | `getDefaultAppearance(type, "vantare-crystal")` for all widget types | None |
| `vantare-v3` | Vantare v3 (example) | `resolveWidgetDesignSystem("vantare-crystal")` (same tokens as crystal) | Same as crystal | `standings.Header` → `VantareV3StandingsHeader` |

The built-in systems are registered via `registerBuiltinDesignSystems()` which is called from `main.tsx` (line 12-13) before any component renders. The function is idempotent (guards against double-registration).

**Known limitation**: `vantare-v3` uses the same tokens as `vantare-crystal`. It exists as a proof-of-concept for the component replacement mechanism, not as a visually distinct design system.

### Entry point wiring

`frontend/src/main.tsx`:
```ts
import { registerBuiltinDesignSystems } from "./hub/registry/builtin-systems";
registerBuiltinDesignSystems();
```

### Widget consumption

Currently only `StandingsWidget` (`frontend/src/overlay/widgets/StandingsWidget.tsx`) consumes the registry:

```ts
import { useWidgetComponents } from "../../hub/registry";
// Inside component:
const { Header: CustomHeader } = useWidgetComponents("standings", style);
```

If `CustomHeader` is defined, it renders the system's Header component; otherwise renders the default.

### Known gaps (post-B4)

- **`widget-design-gallery.ts`** does NOT read from the registry. `OFFICIAL_DESIGNS` is hardcoded. Systems cannot contribute gallery entries via `officialDesigns` yet.
- **`resolveWidgetAppearance`** does NOT read per-type defaults from the registry. It still reads from `style-catalog.ts` directly. This is gap P1 (the registry's `perWidgetAppearance` is populated but unused by the appearance resolver).
- **Only `StandingsWidget`** consumes `useWidgetComponents`. `DeltaWidget`, `PedalsWidget`, `RelativeWidget`, etc. do not query the registry for custom components.
- **The `officialDesigns` field** in `DesignSystem` is typed as `unknown[]` — the shape is not defined and the field is not populated by any built-in system.

### Resolver de apariencia (`widget-appearance.ts`)

File: `frontend/src/overlay/widgets/widget-appearance.ts`

`resolveWidgetAppearance(type, props)` resolves the effective `WidgetAppearance` for a widget instance. Resolution order:

1. `props.style` or `props.variant.themeId` → determines the `style` (theme id).
2. `getDefaultAppearance(type, style)` → per-type defaults from `style-catalog.ts`.
3. `getWidgetAppearance(props)` → user overrides from `variant.appearance` or `props`.
4. Merge: overrides ?? catalog defaults ?? global fallbacks (e.g. `classHypercarFg: "#f87171"`).

Returns `{ style: string, appearance: Required<WidgetAppearance> }`.

**Important**: step 2 does NOT consult the registry's `perWidgetAppearance`. This is gap P1.
