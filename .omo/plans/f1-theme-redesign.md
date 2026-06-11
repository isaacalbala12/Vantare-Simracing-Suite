# F1 Theme Redesign — A1 Base

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the A1 Base visual design (F1/racing telemetry aesthetic) to the entire Vantare-Overlays app — both hub UI and overlay components — as a new "F1" theme option.

**Architecture:** Create a new `f1.json` theme with A1 Base color tokens (#09090b dark, #c42040 red accent). Build reusable A1 structural components (AuroraEffect, SideStripe, TelemetryBar, WaveBars, LiveDot, F1Card). Apply F1 design language to hub layout, dashboard panels, settings pages, and all overlay components (Standings, Relative, DeltaBar, StreamAlerts). Keep existing themes untouched.

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4, CSS Custom Properties, Zustand

**Design Reference:** `C:/Users/isaac/Desktop/Vantare-Ingeniero/frontend/prototypes/f1-radio-a-variants.html` — A1 Base (lines 56-171)

---

## File Structure

### New files to create:
- `packages/ui-core/src/themes/f1.json` — F1 theme tokens
- `packages/ui-core/src/components/f1/AuroraEffect.tsx` — Animated aurora gradient
- `packages/ui-core/src/components/f1/SideStripe.tsx` — Animated red side stripe
- `packages/ui-core/src/components/f1/TelemetryBar.tsx` — Data row (lap, pos, gap, wear)
- `packages/ui-core/src/components/f1/WaveBars.tsx` — Audio visualizer bars
- `packages/ui-core/src/components/f1/LiveDot.tsx` — Pulsing live indicator
- `packages/ui-core/src/components/f1/F1Card.tsx` — Card wrapper combining all effects
- `packages/ui-core/src/components/f1/index.ts` — Re-exports all F1 components
- `apps/desktop/src/renderer/styles/f1.css` — F1-specific CSS (animations, keyframes)

### Files to modify:
- `packages/ui-core/src/themes/defaults.ts` — Import & register F1 theme
- `packages/ui-core/src/themes/index.ts` — Export `f1` from defaults (auto if defaults.ts exports)
- `packages/ui-core/src/index.ts` — Export new F1 components
- `apps/desktop/src/renderer/index.html` — Load Space Grotesk font
- `apps/desktop/src/renderer/styles/globals.css` — Import f1.css
- `apps/desktop/src/renderer/hub/HubLayout.tsx` — Apply F1 sidebar styling
- `apps/desktop/src/renderer/hub/styles/dashboard.css` — Add F1 dashboard panel variants
- `apps/desktop/src/renderer/hub/pages/DashboardPage.tsx` — Optionally wrap in F1 context
- `apps/desktop/src/renderer/bundles/registry.ts` — Register F1 bundle
- `apps/desktop/src/renderer/bundles/default/styles.css` — Add F1 overlay styles
- `packages/ui-core/src/components/GlassPanel.tsx` — Add F1 variant
- Individual overlay components (Standings, Relative, DeltaBar, StreamAlerts)

---

## Task 1: Create F1 Theme JSON

**Files:**
- Create: `packages/ui-core/src/themes/f1.json`

**Design tokens from A1 Base:**
- Background: `#09090b`
- Card surface: `rgba(18, 18, 22, 0.94)`
- Primary accent: `#c42040`
- Secondary: `#9b1b32`
- Text: `#f4f4f5`
- Text muted: `rgba(244, 244, 245, 0.45)`
- Typography: Space Grotesk (headings), Inter (body)
- Radius: 5px
- Shadows: `0 10px 36px rgba(0,0,0,0.45)`

- [ ] **Step 1: Create `packages/ui-core/src/themes/f1.json`**

```json
{
  "id": "f1",
  "name": "F1",
  "description": "Racing telemetry aesthetic with red-crimson accents",
  "author": "Vantare",
  "version": "1.0.0",
  "tokens": {
    "color": {
      "surface": "#09090b",
      "surfaceAlt": "rgba(18,18,22,0.94)",
      "surfaceElevated": "rgba(24,24,28,0.96)",
      "border": "rgba(237,237,240,0.05)",
      "borderSubtle": "rgba(237,237,240,0.03)",
      "primary": "#c42040",
      "primaryHover": "#d43050",
      "primaryMuted": "rgba(196,32,64,0.15)",
      "secondary": "#9b1b32",
      "secondaryHover": "#b02040",
      "text": "#f4f4f5",
      "textMuted": "rgba(244,244,245,0.45)",
      "textInverse": "#09090b",
      "positive": "#22c55e",
      "negative": "#e63950",
      "warning": "#fbbf24",
      "danger": "#e63950",
      "glass": "rgba(18,18,22,0.94)",
      "glassBorder": "rgba(237,237,240,0.05)",
      "overlay": "#00000080"
    },
    "font": {
      "heading": "'Space Grotesk', sans-serif",
      "body": "'Inter', sans-serif",
      "mono": "'JetBrains Mono', monospace",
      "size": {
        "xs": "0.75rem",
        "sm": "0.875rem",
        "base": "1rem",
        "lg": "1.25rem",
        "xl": "1.5rem",
        "2xl": "2rem"
      },
      "weight": {
        "normal": 400,
        "medium": 500,
        "semibold": 600,
        "bold": 700
      }
    },
    "spacing": {
      "xs": "0.25rem",
      "sm": "0.5rem",
      "md": "1rem",
      "lg": "1.5rem",
      "xl": "2rem",
      "2xl": "3rem"
    },
    "radius": {
      "sm": "0.1875rem",
      "md": "0.3125rem",
      "lg": "0.5rem",
      "xl": "0.75rem",
      "full": "9999px"
    },
    "shadow": {
      "sm": "0 1px 2px rgba(0,0,0,0.4)",
      "md": "0 4px 12px rgba(0,0,0,0.45)",
      "lg": "0 10px 36px rgba(0,0,0,0.45)",
      "glow": "0 0 20px rgba(196,32,64,0.25)"
    },
    "animation": {
      "duration": {
        "fast": "150ms",
        "normal": "300ms",
        "slow": "500ms",
        "slowest": "800ms"
      },
      "easing": {
        "default": "cubic-bezier(0.4, 0, 0.2, 1)",
        "bounce": "cubic-bezier(0.34, 1.56, 0.64, 1)",
        "sharp": "cubic-bezier(0.4, 0, 0.6, 1)"
      }
    },
    "glass": {
      "blur": "12px",
      "opacity": 0.94,
      "saturation": "180%"
    },
    "z": {
      "base": 1,
      "overlay": 10,
      "dropdown": 20,
      "modal": 50,
      "toast": 100,
      "tooltip": 200
    }
  }
}
```

- [ ] **Step 2: Register F1 theme in defaults**

Edit `packages/ui-core/src/themes/defaults.ts`:
- Add `import f1Json from './f1.json';`
- Add `export const f1 = validateTheme(f1Json);`
- Add `f1` to `builtInThemes` array
- Add `f1` to `builtInThemeMap`

## Task 2: Create F1 Base CSS + Font Loading

**Files:**
- Create: `apps/desktop/src/renderer/styles/f1.css`
- Modify: `apps/desktop/src/renderer/index.html`
- Modify: `apps/desktop/src/renderer/styles/globals.css`

- [ ] **Step 1: Create `apps/desktop/src/renderer/styles/f1.css`**

This file contains all the A1 Base animations and base component styles:

```css
/* ── F1 Theme — A1 Base Animations & Styles ─────────────────────────────── */

/* Aurora gradient animation */
@keyframes f1-aurora {
  0% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}

/* Wave bars animation */
@keyframes f1-wave {
  0%, 100% { transform: scaleY(0.45); opacity: 0.3; }
  50% { transform: scaleY(1); opacity: 0.7; }
}

/* Stripe pulse animation */
@keyframes f1-stripe-pulse {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 0.85; }
}

/* Live dot pulse */
@keyframes f1-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

/* Glow pulse for panels */
@keyframes f1-glow-pulse {
  0%, 100% { box-shadow: 0 0 10px rgba(196, 32, 64, 0.1); }
  50% { box-shadow: 0 0 25px rgba(196, 32, 64, 0.2); }
}

/* ── F1 Aurora Effect ──────────────────────────────────────────────────── */

.f1-aurora {
  position: absolute; inset: 0;
  background: linear-gradient(90deg, #1a0a10, #120508, #1a0a10, #0f0408, #1a0a10);
  background-size: 400% 400%;
  animation: f1-aurora 8s ease infinite;
  opacity: 0.35;
  pointer-events: none;
  z-index: 0;
}

.f1-aurora-glow {
  position: absolute;
  top: -40%; left: 30%;
  width: 300px; height: 300px;
  background: radial-gradient(circle, rgba(196, 32, 64, 0.07) 0%, transparent 70%);
  pointer-events: none;
  z-index: 0;
}

/* ── F1 Side Stripe ────────────────────────────────────────────────────── */

.f1-side-stripe {
  position: absolute;
  top: 16px; bottom: 16px; left: 12px;
  width: 3px;
  background: linear-gradient(180deg, transparent, #c42040, #9b1b32, #c42040, transparent);
  border-radius: 2px;
  opacity: 0.55;
  animation: f1-stripe-pulse 3s ease-in-out infinite;
  z-index: 1;
}

/* ── F1 Telemetry Bar ──────────────────────────────────────────────────── */

.f1-telemetry {
  display: flex; gap: 20px;
  padding: 8px 20px 8px 28px;
  background: rgba(196, 32, 64, 0.06);
  position: relative; z-index: 1;
}

.f1-telemetry-item {
  font-size: 10px; font-weight: 500;
  letter-spacing: 0.8px;
  color: rgba(244, 244, 245, 0.45);
  text-transform: uppercase;
  font-family: 'Inter', sans-serif;
}

.f1-telemetry-item strong { color: #f4f4f5; font-weight: 700; }
.f1-telemetry-item .accent { color: #e63950; }

/* ── F1 Wave Bars ──────────────────────────────────────────────────────── */

.f1-wave {
  display: flex; align-items: flex-end; gap: 2.5px;
  height: 18px;
}

.f1-wave .bar {
  width: 3px; min-height: 2px;
  background: linear-gradient(180deg, #c42040, #9b1b32);
  border-radius: 1.5px; opacity: 0.45;
  animation: f1-wave 1s ease-in-out infinite;
}

/* ── F1 Header / Typography ────────────────────────────────────────────── */

.f1-name {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 20px; font-weight: 700;
  letter-spacing: 2.5px; text-transform: uppercase;
  color: #ededf0;
}

.f1-label {
  font-size: 10px; font-weight: 500;
  letter-spacing: 4px; text-transform: uppercase;
  color: #c42040;
}

/* ── F1 Live Indicator ─────────────────────────────────────────────────── */

.f1-live {
  font-size: 9px; font-weight: 600;
  letter-spacing: 2px; text-transform: uppercase;
  color: #c42040;
  display: flex; align-items: center; gap: 5px;
}

.f1-live::before {
  content: ''; width: 5px; height: 5px;
  background: #c42040; border-radius: 50%;
  animation: f1-pulse 1.5s ease-in-out infinite;
}

/* ── F1 Source ─────────────────────────────────────────────────────────── */

.f1-source {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 8.5px; font-weight: 500;
  letter-spacing: 3px; text-transform: uppercase;
  color: rgba(244, 244, 245, 0.3);
}

/* ── F1 Card ───────────────────────────────────────────────────────────── */

.f1-card {
  width: 100%;
  position: relative;
  background: rgba(18, 18, 22, 0.94);
  border-radius: 5px;
  overflow: hidden;
  box-shadow: 0 10px 36px rgba(0,0,0,0.45);
  font-family: 'Inter', sans-serif;
}

.f1-card-body {
  padding: 18px 20px 18px 28px;
  position: relative; z-index: 1;
}

.f1-card-header {
  display: flex; align-items: baseline; gap: 12px;
  margin-bottom: 12px;
}

.f1-card-footer {
  display: flex; justify-content: space-between; align-items: center;
  margin-top: 14px; padding-top: 10px;
  border-top: 1px solid rgba(237, 237, 240, 0.05);
}

.f1-card-message {
  font-size: 14.5px; font-weight: 500;
  line-height: 1.55; color: #f4f4f5;
  letter-spacing: 0.2px;
  font-family: 'Inter', sans-serif;
}

.f1-card-message.placeholder {
  color: rgba(244, 244, 245, 0.28);
  font-weight: 400;
}

/* ── F1 Hub Panel (dashboard / sidebar) ────────────────────────────────── */

.f1-hub-panel {
  position: relative;
  background: rgba(18, 18, 22, 0.94);
  border-radius: 5px;
  overflow: hidden;
  border: 1px solid rgba(237, 237, 240, 0.04);
  box-shadow: 0 10px 36px rgba(0,0,0,0.45);
}

.f1-hub-panel::before {
  content: '';
  position: absolute;
  top: 16px; bottom: 16px; left: 8px;
  width: 2px;
  background: linear-gradient(180deg, transparent, #c42040, #9b1b32, #c42040, transparent);
  border-radius: 2px;
  opacity: 0.4;
  animation: f1-stripe-pulse 3s ease-in-out infinite;
  z-index: 1;
  pointer-events: none;
}

/* ── F1 Sidebar accent ─────────────────────────────────────────────────── */

.f1-sidebar-accent {
  position: relative;
}

.f1-sidebar-accent::before {
  content: '';
  position: absolute;
  left: 0;
  top: 4px; bottom: 4px;
  width: 2px;
  background: #c42040;
  border-radius: 1px;
  opacity: 0;
  transition: opacity 0.2s;
}

.f1-sidebar-accent.active::before,
.f1-sidebar-accent:hover::before {
  opacity: 0.7;
}
```

- [ ] **Step 2: Add font loading in `index.html`**

Edit `apps/desktop/src/renderer/index.html` — add before `</head>`:
```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
```

Also update CSP in index.html to allow Google Fonts:
```html
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:;" />
```

- [ ] **Step 3: Import f1.css in globals.css**

Edit `apps/desktop/src/renderer/styles/globals.css` — add after existing imports:
```css
@import "./f1.css";
```

## Task 3: Create F1 React Components

**Files:**
- Create: `packages/ui-core/src/components/f1/AuroraEffect.tsx`
- Create: `packages/ui-core/src/components/f1/SideStripe.tsx`
- Create: `packages/ui-core/src/components/f1/TelemetryBar.tsx`
- Create: `packages/ui-core/src/components/f1/WaveBars.tsx`
- Create: `packages/ui-core/src/components/f1/LiveDot.tsx`
- Create: `packages/ui-core/src/components/f1/F1Card.tsx`
- Create: `packages/ui-core/src/components/f1/index.ts`
- Modify: `packages/ui-core/src/index.ts`

- [ ] **Step 1: Create `AuroraEffect.tsx`**

```tsx
interface AuroraEffectProps {
  className?: string;
}

export function AuroraEffect({ className = '' }: AuroraEffectProps) {
  return (
    <>
      <div className={`f1-aurora ${className}`} aria-hidden="true" />
      <div className="f1-aurora-glow" aria-hidden="true" />
    </>
  );
}
```

- [ ] **Step 2: Create `SideStripe.tsx`**

```tsx
interface SideStripeProps {
  className?: string;
}

export function SideStripe({ className = '' }: SideStripeProps) {
  return <div className={`f1-side-stripe ${className}`} aria-hidden="true" />;
}
```

- [ ] **Step 3: Create `TelemetryBar.tsx`**

```tsx
interface TelemetryItem {
  label: string;
  value: string;
  accent?: boolean;
}

interface TelemetryBarProps {
  items: TelemetryItem[];
  className?: string;
}

export function TelemetryBar({ items, className = '' }: TelemetryBarProps) {
  return (
    <div className={`f1-telemetry ${className}`}>
      {items.map((item, i) => (
        <div key={i} className="f1-telemetry-item">
          {item.label} <strong className={item.accent ? 'accent' : ''}>{item.value}</strong>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Create `WaveBars.tsx`**

```tsx
interface WaveBarsProps {
  barCount?: number;
  className?: string;
}

export function WaveBars({ barCount = 12, className = '' }: WaveBarsProps) {
  return (
    <div className={`f1-wave ${className}`} aria-hidden="true">
      {Array.from({ length: barCount }, (_, i) => (
        <div key={i} className="bar" style={{ animationDelay: `${i * 0.1}s` }} />
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Create `LiveDot.tsx`**

```tsx
interface LiveDotProps {
  className?: string;
}

export function LiveDot({ className = '' }: LiveDotProps) {
  return <span className={`f1-live ${className}`}>Live</span>;
}
```

- [ ] **Step 6: Create `F1Card.tsx`**

```tsx
import type { ReactNode } from 'react';
import { AuroraEffect } from './AuroraEffect';
import { SideStripe } from './SideStripe';

interface F1CardProps {
  children: ReactNode;
  className?: string;
  showAurora?: boolean;
  showStripe?: boolean;
  /** Content area variant: 'body' or 'full' */
  variant?: 'body' | 'full';
}

export function F1Card({
  children,
  className = '',
  showAurora = true,
  showStripe = true,
  variant = 'body',
}: F1CardProps) {
  return (
    <div className={`f1-card ${className}`}>
      {showAurora && <AuroraEffect />}
      {showStripe && <SideStripe />}
      {variant === 'body' ? (
        <div className="f1-card-body">{children}</div>
      ) : (
        children
      )}
    </div>
  );
}
```

- [ ] **Step 7: Create `f1/index.ts`**

```ts
export { AuroraEffect } from './AuroraEffect';
export { SideStripe } from './SideStripe';
export { TelemetryBar } from './TelemetryBar';
export { WaveBars } from './WaveBars';
export { LiveDot } from './LiveDot';
export { F1Card } from './F1Card';
```

- [ ] **Step 8: Export from `packages/ui-core/src/index.ts`**

Add:
```ts
export {
  AuroraEffect,
  SideStripe,
  TelemetryBar,
  WaveBars,
  LiveDot,
  F1Card,
} from './components/f1';
```

## Task 4: Restyle HubLayout with F1 Aesthetic

**Files:**
- Modify: `apps/desktop/src/renderer/hub/HubLayout.tsx`
- Modify: `apps/desktop/src/renderer/hub/styles/dashboard.css`

- [ ] **Step 1: Update HubLayout sidebar**

Key changes:
- Add F1 aurora/gradient background to sidebar area
- Style sidebar nav items with F1 red stripe accent on active
- Add F1 card styling to the sidebar panel
- Update version text styling with Space Grotesk
- Style brand header "VANTARE" with the f1-name class (Space Grotesk, uppercase, letter-spacing)
- Add red accent to active nav items

- [ ] **Step 2: Update dashboard.css**

Add F1 panel variant:
- `.dashboard-panel-f1` — uses `rgba(18,18,22,0.94)` background, 5px radius
- Update the `.dashboard-panel::before` border gradient to use `#c42040`
- Add `.dashboard-panel-f1-side-stripe` for the side stripe effect
- Update `@keyframes panelEnter` to be more subtle

## Task 5: Restyle Overlay Components (Standings, Relative, Delta, Alerts)

**Files:**
- Modify: `apps/desktop/src/renderer/bundles/default/styles.css`
- Modify: `apps/desktop/src/renderer/bundles/default/standings/Standings.tsx`
- Modify: `apps/desktop/src/renderer/bundles/default/relative/Relative.tsx`
- Modify: `apps/desktop/src/renderer/bundles/default/delta/DeltaBar.tsx`
- Modify: `apps/desktop/src/renderer/bundles/default/stream-alerts/StreamAlerts.tsx`

**Theme detection pattern for overlay components:**

All overlay components use `<GlassPanel>` as their container. GlassPanel uses `useTheme()` from `@vantare/ui-core` internally. When `themeId === 'f1'`, GlassPanel automatically wraps children in an `<F1Card>` with `variant="full"` instead of the default glass styling. This means overlay components don't need to change their GlassPanel usage — they get F1 styling automatically when the F1 theme is active. Components that use `className="f1-*"` classes directly (like `TelemetryBar`, `WaveBars`, `LiveDot`, `F1Card`) are only rendered conditionally when F1 is active OR they use CSS variables that auto-adapt.

- [ ] **Step 1: Update overlay styles.css**

Add F1 overlay-specific overrides:
- `.standings-overlay`, `.relative-overlay` — table header: `color: #c42040`, `letter-spacing: 0.05em`
- `.standings-row-player`, `.relative-row-player` — `border-left: 3px solid #c42040`, `background: rgba(196,32,64,0.12)`
- `.text-interval-ahead` → `color: #22c55e`, `.text-interval-behind` → `color: #e63950`
- `.delta-fill--positive` → `background: #e63950`, `.delta-fill--negative` → `background: #22c55e`
- `.delta-value--positive` → `color: #e63950`, `.delta-value--negative` → `color: #22c55e`
- `.delta-track` → `background: rgba(244,244,245,0.08)`
- `.stream-alert-label` → `font-family: 'Space Grotesk', sans-serif`
- `.standings-table th`, `.relative-table th` → use `var(--color-primary)` for text color
- `.stream-alert-message` → font-family: Inter

- [ ] **Step 2: Update Standings.tsx**

- Keep using `<GlassPanel>` — it auto-adapts to F1 theme
- Add `TelemetryBar` at the top with dynamic data: lap count, player position, gap, tyre wear (only render when F1 theme is active — use `useTheme()` to check `themeId === 'f1'`)
- Add `WaveBars` between TelemetryBar and the table header (only when F1 active)
- Update `.standings-row-player` inline styles to use `#c42040` instead of `#DC143C`
- Update `text-leader` color, interval text colors to F1 palette
- Add `import { useTheme, TelemetryBar, WaveBars } from '@vantare/ui-core'`

- [ ] **Step 3: Update Relative.tsx**

- Keep using `<GlassPanel>` — it auto-adapts
- Add `TelemetryBar` showing player position context (only when F1 active)
- Update `.relative-row-player` inline styles: `border-left: 3px solid #c42040`, background `rgba(196,32,64,0.2)`
- Update gap cell colors: ahead → `#22c55e`, behind → `#e63950`

- [ ] **Step 4: Update DeltaBar.tsx**

- Keep using `<GlassPanel>` — it auto-adapts
- Update `.delta-value` font to Space Grotesk when F1 active
- Use `var(--color-positive)` and `var(--color-negative)` instead of hardcoded green/red
- Add small telemetry context line (current lap, best lap) when F1 active

- [ ] **Step 5: Update StreamAlerts.tsx**

- Keep using `<GlassPanel>` — it auto-adapts (F1Card with compact style)
- Update alert labels: `font-family: 'Space Grotesk', sans-serif; color: #c42040`
- Add `LiveDot` component at the end of alert content when F1 theme is active
- Update `import { LiveDot } from '@vantare/ui-core'`

## Task 6: Update ui-core Shared Components

**Files:**
- Modify: `packages/ui-core/src/components/GlassPanel.tsx`
- Modify: `packages/ui-core/src/components/DeltaIndicator.tsx`
- Modify: `packages/ui-core/src/components/PositionBadge.tsx`
- Modify: `packages/ui-core/src/components/TimeDisplay.tsx`

- [ ] **Step 1: Update GlassPanel.tsx**

Add auto-detection of F1 theme via `useTheme()`. When `themeId === 'f1'`, render `<F1Card variant="full">` with the same children instead of the default glass styling. This is the central theme-switching mechanism — all overlay components use GlassPanel and automatically get F1 styling without code changes.

```tsx
import { useTheme } from '../../hooks/useTheme';
import { F1Card } from './f1/F1Card';

interface GlassPanelProps {
  children: React.ReactNode;
  className?: string;
  opacity?: number;
}

export function GlassPanel({ children, className = '', opacity = 0.6 }: GlassPanelProps) {
  const { themeId } = useTheme();

  // When F1 theme is active, render as F1Card (A1 Base card with aurora + stripe)
  if (themeId === 'f1') {
    return (
      <F1Card variant="full" className={className}>
        {children}
      </F1Card>
    );
  }

  // Default glass styling for other themes
  return (
    <div
      className={`glass-panel ${className}`}
      style={{ background: `rgba(0, 0, 0, ${opacity})` }}
    >
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Update DeltaIndicator.tsx**

- Add `font-heading` (Space Grotesk) to the display
- Update positive/negative colors to F1 palette
- Add F1-specific letter-spacing to the text

- [ ] **Step 3: Update PositionBadge.tsx**

- P1: gold `#fbbf24`, P2-P3: `#c42040` red, rest: `#f4f4f5` text
- Use Space Grotesk font

- [ ] **Step 4: Update TimeDisplay.tsx**

- Add Space Grotesk font family
- Use `#f4f4f5` text color
- Add letter-spacing for F1 telemetry feel

## Task 7: Register F1 Bundle

**Files:**
- Modify: `apps/desktop/src/renderer/bundles/registry.ts`
- Create: `apps/desktop/src/renderer/bundles/f1/index.ts` (or reuse default with overrides)

- [ ] **Step 1: Update registry.ts**

Since F1 uses the same overlay components but with different styling via CSS classes, register the f1 bundle pointing to the default components:
```ts
const bundleLoaders: Record<string, BundleLoader> = {
  default: () => import('./default'),
  f1: () => import('./default'),  // Same bundle, F1 styling comes from CSS variables
};
```

This works because the F1 theme's CSS variables will automatically style the components.

## Task 8: Theme-Aware Styling in Hub Components

**Files:**
- Modify: `apps/desktop/src/renderer/hub/pages/DashboardPage.tsx`
- Modify: `apps/desktop/src/renderer/hub/pages/ThemesPage.tsx`
- Modify: `apps/desktop/src/renderer/hub/components/ThemeSelector.tsx`
- Modify: `apps/desktop/src/renderer/hub/components/ThemeEditor.tsx`
- Modify: `apps/desktop/src/renderer/hub/components/DashboardPanel.tsx`
- Modify: Various panel components

- [ ] **Step 1: Update hub components to use theme-aware classes**

All hub components already use `var(--color-*)` tokens, so switching to the F1 theme will automatically update colors. The F1-specific structural CSS classes (`.f1-hub-panel`, `.f1-sidebar-accent`) need to be conditionally applied.

**Pattern for conditional F1 classes in hub components:**

Use the `useTheme()` hook to check the active theme and apply `.f1-*` classes:

```tsx
import { useTheme } from '@vantare/ui-core';

function SomeHubComponent() {
  const { themeId } = useTheme();
  const isF1 = themeId === 'f1';
  
  return (
    <div className={`${isF1 ? 'f1-hub-panel' : 'dashboard-panel'}`}>
      {/* ... */}
    </div>
  );
}
```

**Specific component changes:**

1. **HubLayout.tsx sidebar:**
   - Sidebar container: add `className` with `f1-hub-panel` when F1 active
   - "VANTARE" brand text: use `f1-name` CSS class (Space Grotesk, uppercase, letter-spacing)
   - Active nav items: add `f1-sidebar-accent active` class (red left border accent)
   - Version footer text: replace with `f1-source` class (Space Grotesk, muted)
   - Import `useTheme` from `@vantare/ui-core`

2. **DashboardPanel.tsx:**
   - When F1 theme active: use `f1-hub-panel` class instead of `dashboard-panel`
   - Title bar: use `f1-label` typography for the title text
   - Remove the `::before` gradient border (replaced by F1 side stripe)

3. **DashboardPage.tsx panels:**
   - Pass `className` with `f1-hub-panel` class when F1 active
   - All panel content text inherits from CSS variables

4. **ThemesPage.tsx / ThemeSelector.tsx / ThemeEditor.tsx:**
   - All use `var(--color-*)` tokens — no structural changes needed
   - Theme cards already auto-adapt via CSS variables

## Verification

- [ ] **Verify F1 theme loads**: Select F1 theme in ThemeSelector — all CSS variables update
- [ ] **Verify aurora effect**: Aurora gradient visible on F1Card components
- [ ] **Verify side stripe**: Red animated stripe visible on cards and sidebar
- [ ] **Verify typography**: Space Grotesk for headings, Inter for body
- [ ] **Verify overlay components**: Standings, Relative, DeltaBar, StreamAlerts render with F1 styling
- [ ] **Verify hub**: Dashboard panels, sidebar, settings pages show F1 styling
- [ ] **Verify no regressions**: Dark, Blood, Midnight themes still work correctly
- [ ] **Run diagnostics**: `lsp_diagnostics` on all changed files
- [ ] **Run tests**: `pnpm test` passes
