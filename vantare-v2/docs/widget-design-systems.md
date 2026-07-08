# Vantare Design Systems

This document is the single source of truth for Vantare's visual design systems. It documents the visual reference, the runtime resolver, the per-type style catalog, the registry (planned), and the workflow for adding a new design system.

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

## Registry (Planned for WS-11.B)

The next microcorte introduces `frontend/src/hub/registry/design-system-registry.ts` with the API:

```ts
registerDesignSystem({
  id: string,
  name: string,
  tokens: DesignSystemTokens,
  perWidgetAppearance: Record<WidgetType, WidgetAppearance>,
  components?: Partial<Record<WidgetType, { Header, Row, Footer }>>,
  officialDesigns?: OfficialDesign[],
});
```

A design system can register its own structural tokens, per-type defaults, optional JSX components (Header, Row, Footer) per widget type, and optional `OfficialDesign` entries that appear in the gallery.

The first system registered (besides `base` and `vantare-crystal`) will be a proof-of-concept "Vantare v3" that demonstrates the change of form for the Standings widget (different header layout, variable row heights, etc.). The user's images of the F1-style leaderboard and the current "Vantare v3" reference will inform this work.

## Workflow: Adding a New Design System

1. Extract the visual reference (HTML or design mock).
2. Extract tokens (CSS variables, class colors, fonts, effects).
3. Register the system via `registerDesignSystem()`.
4. Add per-type defaults (or let them fall back to `vantare-crystal`).
5. Optionally add `OfficialDesign` entries for the gallery.
6. Optionally add JSX components for widgets that need a different form.
7. Test: verify the system appears in the gallery, applies correctly, and renders in OBS.
