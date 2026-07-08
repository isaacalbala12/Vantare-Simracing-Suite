# Vantare Design Systems

This document is the single source of truth for Vantare's visual design systems. It documents the visual reference, the runtime resolver, the per-type style catalog, the design system registry, the built-in systems, and the workflow for adding a new design system.

## Visual Reference

The canonical visual reference is `docs/overlay-glassmorphism-pro.html`. This HTML contains the `vantare-crystal` design system in its pure form, with all colors, fonts, and effects extracted from CSS variables (`:root` block, lines 11-24) and component classes.

The HTML defines:

### CSS variables (`/root`)

- `--bg-page: #060608`
- `--accent-red: #e63946`
- `--accent-red-bright: #ff2a3b`
- `--accent-green: #22c55e`
- `--accent-yellow: #f59e0b`
- `--text-main: #ffffff`
- `--text-muted: #999999`
- `--text-dim: #555555`
- `--font-sans: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif`
- `--font-display: 'Plus Jakarta Sans', sans-serif`
- `--font-mono: 'JetBrains Mono', monospace`

### Inferred variables (used in classes but not defined in `:root`)

- `--bg-glass: rgba(18, 18, 22, 0.82)` (from `.widget-card` line 65)
- `--border-glass: rgba(255, 255, 255, 0.09)` (from `.widget-card` line 65)
- `--shadow-glass: 0 24px 60px rgba(0,0,0,0.75), inset 0 1px 0 rgba(255,255,255,0.1)` (from `.widget-card` line 66)

### Class colors (badge-translucent scheme)

- Hypercar: `bg: rgba(255,42,59,0.25)`, `fg: #ff2a3b`
- LMP2: `bg: rgba(59,130,246,0.25)`, `fg: #60a5fa`
- LMP3: `bg: rgba(6,182,212,0.25)`, `fg: #22d3ee`
- GT3: `bg: rgba(245,158,11,0.25)`, `fg: #fbbf24`
- GT4: `bg: rgba(244,114,182,0.25)`, `fg: #f472b6`
- Unknown: `bg: rgba(107,114,128,0.25)`, `fg: #6b7280` (invented; HTML doesn't define)

### Tire colors

- Soft: `#ff4d4d` (`.tire-S`)
- Medium: `#facc15` (`.tire-M`)
- Hard: `#e5e7eb` (invented; HTML doesn't define)

### Pedal colors

- Throttle: `#22c55e` (`.fill-thr`)
- Brake: `#ff2a3b` (`.fill-brk`)
- Clutch: `#f59e0b` (`.fill-clu`)

### RPM LEDs

- Green: `#22c55e` (`.led.green`)
- Yellow: `#f59e0b` (`.shift-dot.y`)
- Red: `#ff2a3b` (`.led.red`)
- Blue: `#38bdf8` (invented; HTML doesn't define)

### Gaps

- Ahead (red): `#ff4d4d`
- Behind (green): `#34d399`

### Other

- Leader: `#22c55e` (same as `--accent-green`)
- PIT: `#f59e0b` (`.pit-tag`)
- Info: `#38bdf8` (`.rs-clock`, `.tw-bar-fill`)

## Runtime Resolver

The runtime resolver is at `frontend/src/overlay/widgets/widget-design-system.ts`. It exports `resolveWidgetDesignSystem(themeId: string | undefined): DesignSystemTokens`.

The resolver maintains a `THEMES` map. Currently registered themes:

- `base`: solid colors, no cristal effects. Identity: `#9b2226` (Vantare red).
- `vantare-crystal`: dark glass with red Vantare accents. Identity: `#ff3b3b` (Vantare bright red).

If `themeId` is unknown or undefined, the resolver falls back to `base`.

The Vantare brand tokens (accent `#ff3b3b`, negative `#ff2a3b`, glow accent) are kept across all themes as the Vantare identity.

## Per-Type Style Catalog

The per-type catalog is at `frontend/src/hub/state/style-catalog.ts`. It exports:

- `getStylesForType(widgetType: string): StyleEntry[]` — list of available styles for a widget type.
- `getDefaultAppearance(widgetType: string, styleId: string): WidgetAppearance` — the per-type defaults for a given style.

Currently registered per-type entries with `id: "vantare-crystal"`: telemetry, telemetry-vertical, standings, relative, delta, pedals. Each provides a `WidgetAppearance` with the HTML-aligned defaults.

Other registered styles per type: `vantare-racing` (kept as a legacy alternative).

## OfficialDesign Gallery

The gallery is at `frontend/src/hub/widgets/widget-design-gallery.ts`. It exports `OFFICIAL_DESIGNS: OfficialDesign[]` — the curated list of designs the user can apply from the UI.

After WS-11.A1, the crystal designs are renamed:

- `relative-vantare-crystal`
- `standings-vantare-crystal`
- `delta-vantare-crystal`
- `pedals-vantare-crystal`

Each uses `themeId: "vantare-crystal"` and provides its own `appearance` and `variant` configuration.

Other designs (racing, broadcast, endurance) are kept unchanged.

## Registry API (WS-11.B1-B3)

### Location

All registry files live in `frontend/src/hub/registry/`:

| File | Export |
|---|---|
| `design-system.ts` | Types: `DesignSystem`, `WidgetComponent`, `WidgetComponentProps`, `WidgetComponents` |
| `design-system-registry.ts` | Functions: `registerDesignSystem`, `lookupDesignSystem`, `listDesignSystems`, `clearDesignSystemRegistry` |
| `widget-components.ts` | Functions: `resolveWidgetComponents`, `useWidgetComponents` |
| `builtin-systems.ts` | `registerBuiltinDesignSystems()`, `_resetBuiltinRegistration()` |
| `index.ts` | Re-exports all public API |
| `_examples/vantare-v3-standings-header.tsx` | Example component used by the `vantare-v3` system |

### DesignSystem type (`design-system.ts`)

```ts
type DesignSystem = {
  id: string;
  name: string;
  description?: string;
  tokens: DesignSystemTokens;
  perWidgetAppearance: Partial<Record<WidgetType, WidgetAppearance>>;
  components: Partial<Record<WidgetType, WidgetComponents>>;
  officialDesigns?: unknown[];  // Reserved; not yet used
};
```

`WidgetComponents` has 3 optional slots:

```ts
type WidgetComponents = {
  Header?: WidgetComponent<unknown>;
  Row?: WidgetComponent<unknown>;
  Footer?: WidgetComponent<unknown>;
};
```

Each `WidgetComponent<TData>` receives `WidgetComponentProps<TData>`: `data`, `appearance: Required<WidgetAppearance>`, and an optional `className`. The caller is responsible for passing the resolved appearance.

### Registry functions (`design-system-registry.ts`)

| Function | Signature | Description |
|---|---|---|
| `registerDesignSystem` | `(system: DesignSystem): void` | Register a system. **Throws** if id is already registered. |
| `lookupDesignSystem` | `(id: string \| undefined \| null): DesignSystem \| null` | Returns null for unknown/missing/empty id. |
| `listDesignSystems` | `(): DesignSystem[]` | Returns all registered systems. |
| `clearDesignSystemRegistry` | `(): void` | Clears registry. **Tests only**. |

The registry is an in-memory `Map<string, DesignSystem>`. Systems must be explicitly registered — there are no side-effect imports.

### Component resolution (`widget-components.ts`)

```ts
// Synchronous — for non-React contexts
function resolveWidgetComponents(type: string, themeId: string | undefined | null): WidgetComponents

// React hook — memoized by type + themeId
function useWidgetComponents(type: string, themeId: string | undefined | null): WidgetComponents
```

Both return `{}` when the system is not registered or doesn't provide components for that widget type. The widget must fall back to its built-in implementation.

## Built-in Systems (WS-11.B4)

### Registration

Built-in systems are registered at the application entry point (`frontend/src/main.tsx`, line 12-13):

```ts
import { registerBuiltinDesignSystems } from "./hub/registry/builtin-systems";
registerBuiltinDesignSystems();
```

`registerBuiltinDesignSystems()` is idempotent — safe to call multiple times. It guards against double-registration with a module-level `registered` flag.

### The three built-in systems

| id | name | Tokens | Per-type defaults | Components |
|---|---|---|---|---|
| `base` | Base | `resolveWidgetDesignSystem("base")` | `getDefaultAppearance(type, "base")` for all `WIDGET_TYPES` | None |
| `vantare-crystal` | Vantare Crystal | `resolveWidgetDesignSystem("vantare-crystal")` | `getDefaultAppearance(type, "vantare-crystal")` for all `WIDGET_TYPES` | None |
| `vantare-v3` | Vantare v3 (example) | Same tokens as `vantare-crystal` | Same per-type defaults as `vantare-crystal` | `standings.Header` = `VantareV3StandingsHeader` |

### `base` system

- Solid colors, no cristal/glass effects.
- Accent: `#9b2226` (Vantare dark red).
- Background: `#000000`, surface: `#111111`.
- Fonts: Inter (display + body), JetBrains Mono (mono).
- Radii: sm 4px, md 6px, lg 10px, xl 14px.

### `vantare-crystal` system

- Dark glass with red Vantare accents.
- Accent: `#ff3b3b` (Vantare bright red).
- Background: `#060608`, surface/card: `rgba(18,18,22,0.82)`.
- Border: `rgba(255,255,255,0.09)`.
- Fonts: Plus Jakarta Sans (display), Inter (body), JetBrains Mono (mono).
- Radii: sm 4px, md 8px, lg 12px, xl 16px.
- Tokens match `docs/overlay-glassmorphism-pro.html` (verified by contract test).

### `vantare-v3` system (example/proof-of-concept)

- Uses identical tokens to `vantare-crystal`.
- Contributes a custom `Header` for `standings` via the registry: `VantareV3StandingsHeader`.
- The custom header is intentionally minimal (centered time + system name) — it exists to validate the component replacement API, not as a visually distinct design.
- See `frontend/src/hub/registry/_examples/vantare-v3-standings-header.tsx`.
- **This is not a visually distinct design system** — it shares all tokens with crystal. Real Vantare v3 visual work is future scope.

## Wiring

### Entry point

`frontend/src/main.tsx` calls `registerBuiltinDesignSystems()` at module level (line 13), before the React tree mounts. This ensures all systems are registered before any widget renders.

### Widget consumption

Currently **only `StandingsWidget`** (`frontend/src/overlay/widgets/StandingsWidget.tsx`) uses the registry:

```tsx
import { useWidgetComponents } from "../../hub/registry";

// Inside component:
const { style, appearance: a } = resolveWidgetAppearance("standings", props);
const { Header: CustomHeader } = useWidgetComponents("standings", style);

// In JSX:
{CustomHeader ? (
  <CustomHeader data={{ time: timeStr }} appearance={a} className="" />
) : (
  <DefaultHeader ... />
)}
```

### Apply to all button

`WidgetSettingsPanel` (`frontend/src/hub/overlays/WidgetSettingsPanel.tsx`, line 168-186) shows an "Aplicar a todos" button when:
- A design is selected from the gallery, AND
- There are multiple widgets of the same type in the profile.

Clicking it applies the selected design to all same-type widgets in the profile via `applyOfficialDesignToProfile`.

## Architecture Diagram

```text
main.tsx
  |
  +-- registerBuiltinDesignSystems()
  |     |
  |     +-- registerDesignSystem("base")
  |     +-- registerDesignSystem("vantare-crystal")
  |     +-- registerDesignSystem("vantare-v3")
  |
  +-- <HubApp />          <- WidgetDesignGallery (hardcoded OFFICIAL_DESIGNS)
  |
  +-- <CompositeApp />    <- Runtime overlay
        |
        +-- StandingsWidget
              |
              +-- resolveWidgetAppearance(type, props)
              |     |
              |     +-- getWidgetStyleForRender(props) -> style (themeId)
              |     +-- getDefaultAppearance(type, style)  <- style-catalog.ts
              |     +-- getWidgetAppearance(props) -> user overrides
              |
              +-- useWidgetComponents(type, style)
                    |
                    +-- lookupDesignSystem(style) -> registry
                          |
                          +-- system.components[type] -> { Header?, Row?, Footer? }
```

## Known Limitations

1. **`widget-design-gallery.ts` is NOT integrated with the registry.** The gallery uses a hardcoded `OFFICIAL_DESIGNS` array. The `officialDesigns` field in `DesignSystem` is typed as `unknown[]` and is never populated or read. Systems cannot contribute gallery entries through the registry.

2. **`resolveWidgetAppearance` does NOT read from the registry.** The appearance resolver (`widget-appearance.ts`) reads per-type defaults from `style-catalog.ts` directly, not from `system.perWidgetAppearance`. The registry's `perWidgetAppearance` is populated by built-in systems but it's a dead data path (gap P1).

3. **Only `StandingsWidget` consumes `useWidgetComponents`.** Delta, Pedals, Relative, Telemetry, and other widgets do not query the registry for custom components. They all use `resolveWidgetAppearance` but none check for registry-provided JSX parts.

4. **`vantare-v3` is not a visually distinct design.** It shares all tokens with `vantare-crystal`. It serves only as a proof-of-concept for the component replacement mechanism. A real Vantare v3 visual identity requires future work.

5. **The registry is in-memory only.** Systems are registered at startup and cannot be added/removed at runtime. There is no persistence, no dynamic loading, and no user-facing UI to manage systems.

## Workflow: Adding a New Design System

1. **Extract the visual reference** (HTML or design mock). Identify structural tokens (colors, fonts, radii, glow) and per-widget-type overrides.
2. **If new structural tokens are needed**: add them to `widget-design-system.ts` (the `THEMES` map). This is the runtime resolver.
3. **If new per-type defaults are needed**: add entries to `style-catalog.ts` (`CATALOG` object). The catalog is the source of truth for `WidgetAppearance` defaults.
4. **Register the system** via `registerDesignSystem()`:
   - `tokens`: reference the resolver (e.g. `resolveWidgetDesignSystem("vantare-crystal")`).
   - `perWidgetAppearance`: reference the catalog (e.g. `getDefaultAppearance(type, "vantare-crystal")`).
   - `components`: optional JSX parts per widget type.
5. **Add it to `builtin-systems.ts`** in the `buildBuiltinSystems()` array if it should be registered at startup.
6. **Wire the widget**: add `useWidgetComponents(type, themeId)` in the target widget's component. The widget must handle the fallback when no custom component is found.
7. **Test**:
   - Registry unit tests: `design-system-registry.test.ts`, `widget-components.test.tsx`.
   - Built-in registration test: `builtin-systems.test.ts` (verifies all 3 systems are registered).
   - Widget test: verify the custom component renders when the system is active.
   - Visual parity: verify the widget renders correctly in `WidgetStudio` sandbox and OBS runtime.

### Example: `vantare-v3` system

The `vantare-v3` system is the reference implementation:
- `builtin-systems.ts` lines 50-67: system definition with same tokens as crystal, but adds `components: { standings: { Header: ... } }`.
- `_examples/vantare-v3-standings-header.tsx`: the Header component implementing `WidgetComponentProps<{ time?: string }>`.
- `StandingsWidget.tsx` line 126: `useWidgetComponents("standings", style)` — wires the registry to the widget.
- The pattern to copy: register → add example component → add `useWidgetComponents` in widget → fallback to default when not found.

### Future workflow (when gaps are closed)

Once gaps P1-P5 are resolved, the workflow will be:
1. Define the design system object (tokens, per-type defaults, components, official designs).
2. Register it at startup.
3. Gallery reads from `listDesignSystems().officialDesigns`.
4. Appearance resolver reads from `lookupDesignSystem(style).perWidgetAppearance`.
5. All widgets check `useWidgetComponents` and fall back to defaults.
6. Test end-to-end: gallery → apply → render.
