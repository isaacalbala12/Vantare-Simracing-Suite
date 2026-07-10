# LayoutStudio Sub-Nav Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current WidgetSettingsPanel's flat accordion layout with a unique sub-nav pattern (icon rail with mini-previews + content area) that matches the approved v10 HTML mockup, using bronze-style cards with red vantare accent.

**Architecture:** The right panel (`WidgetSettingsPanel`) is restructured into a two-column internal layout: a 72px icon rail on the left (with mini-previews per section, color-coded accents, status badges, and a sticky widget header with visibility toggle) and a content area on the right that shows only the active section. The sub-nav is **dynamic** — its items change based on the selected widget type. All existing functionality (PreviewInspector, WidgetDesignGallery, WidgetVariantManager, WidgetConfigSections, RelativeSettingsSection, StandingsSettingsSection, PedalsSettingsSection, WidgetPresetSection) is preserved but reorganized into the new section structure.

**Tech Stack:** React 18, TypeScript, Tailwind CSS v4, Wails v2 runtime, Vitest + Testing Library

---

## Reference

- **Approved mockup:** `layout-studio-v10.html` (repo root)
- **Current code:** `src/hub/overlays/WidgetSettingsPanel.tsx` (250 lines)
- **CSS tokens:** `src/index.css` — `v52-shell-bg`, `v52-grain`, `v52-vignette`, `glass-panel`, `btn-primary`, `btn-secondary`

## Section Mapping (dynamic sub-nav)

The sub-nav items depend on the widget type. Here is the full mapping:

| Section | Accent | Shown when | Content source |
|---|---|---|---|
| **Diseño** | red (#C1121F) | Always (if designs exist for type) | WidgetDesignGallery + WidgetVariantManager + WidgetPresetSection |
| **Apariencia** | purple (#A855F7) | Always | PreviewInspector → Apariencia (StyleSelector, AppearanceEditor, opacity) |
| **Columnas** | blue (#3B82F6) | `widget.type === "relative" \|\| "standings"` | WidgetConfigSections (slots/columns/columnGroups) + RelativeSettingsSection + StandingsSettingsSection |
| **Slots** | blue (#3B82F6) | `widget.type !== "relative" && !== "standings"` (if slots exist) | WidgetConfigSections (slots only) |
| **Colores** | amber (#F59E0B) | `widget.type === "pedals"` | PedalsSettingsSection |
| **Visibilidad** | amber (#F59E0B) | Always | PreviewInspector → Visibilidad Condicional (inPit, sessionType) |
| **General** | cyan (#06B6D4) | Always | PreviewInspector → Vista General (name, updateHz) |

**Note:** "Columnas" and "Slots" are mutually exclusive — relative/standings show "Columnas" (which includes slots+columns+columnGroups+type-specific settings), all other types show "Slots" (just slots). This avoids confusion.

## File Structure

### New files to create:

| File | Responsibility |
|---|---|
| `src/hub/overlays/SubNavRail.tsx` | The icon rail component (72px wide) with mini-previews, accent colors, badges, sticky widget header, and footer dirty state |
| `src/hub/overlays/SubNavContent.tsx` | The content area that renders the active section's content |
| `src/hub/overlays/sub-nav-config.ts` | Configuration: section definitions, accent colors, which sections show for which widget types, mini-preview renderers |
| `src/hub/overlays/BronzeCard.tsx` | Reusable bronze-style card component (red vantare accent variant) |
| `src/hub/overlays/SubNavRail.test.tsx` | Tests for the rail component |
| `src/hub/overlays/SubNavContent.test.tsx` | Tests for the content component |
| `src/hub/overlays/sub-nav-config.test.ts` | Tests for section config logic |
| `src/hub/overlays/BronzeCard.test.tsx` | Tests for the card component |

### Files to modify:

| File | Changes |
|---|---|
| `src/hub/overlays/WidgetSettingsPanel.tsx` | Replace the entire render with `<SubNavRail>` + `<SubNavContent>` layout. Keep draft logic, handleDraftChange, handleSaveToWidget, handleDiscard. |
| `src/index.css` | Add `.bc` (bronze card), `.bc-active`, `.bc-tag`, `.bc-divider`, `.bc-eyebrow`, `.bc-primary`, `.bc-secondary`, `.bc-meta`, `.sn-rail`, `.sn-item`, `.sn-preview`, `.sn-badge`, `.sn-tip`, `.sn-footer` classes |

### Files NOT modified (preserved as-is):

- `LayoutStudio.tsx` — no changes needed, it already renders `<WidgetSettingsPanel>`
- `PreviewCanvas.tsx` — no changes
- `StudioWidgetList.tsx` — no changes
- `PreviewInspector.tsx` — used as-is, just rendered inside a different section
- `WidgetDesignGallery.tsx` — used as-is
- `WidgetVariantManager.tsx` — used as-is
- `WidgetConfigSections.tsx` — used as-is
- `RelativeSettingsSection.tsx` — used as-is
- `StandingsSettingsSection.tsx` — used as-is
- `PedalsSettingsSection.tsx` — used as-is
- `WidgetPresetSection.tsx` — used as-is
- `useOverlayStudioState.ts` — no changes
- `widget-design-gallery.ts` — no changes

---

## Task 1: BronzeCard component

**Files:**
- Create: `src/hub/overlays/BronzeCard.tsx`
- Create: `src/hub/overlays/BronzeCard.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/hub/overlays/BronzeCard.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { BronzeCard } from "./BronzeCard";

describe("BronzeCard", () => {
  it("renders children inside a card with bc class", () => {
    render(
      <BronzeCard>
        <span data-testid="content">Hello</span>
      </BronzeCard>
    );
    expect(screen.getByTestId("content")).toBeTruthy();
    expect(screen.getByText("Hello")).toBeTruthy();
  });

  it("applies active class when active prop is true", () => {
    render(
      <BronzeCard active data-testid="card">
        <span>Active card</span>
      </BronzeCard>
    );
    const card = screen.getByTestId("card");
    expect(card.className).toContain("bc-active");
  });

  it("applies custom className alongside bc", () => {
    render(
      <BronzeCard className="custom-class" data-testid="card">
        <span>Custom</span>
      </BronzeCard>
    );
    const card = screen.getByTestId("card");
    expect(card.className).toContain("bc");
    expect(card.className).toContain("custom-class");
  });

  it("renders tag, eyebrow, primary, secondary, and meta sub-components", () => {
    render(
      <BronzeCard>
        <BronzeCard.Tag>Time Attack</BronzeCard.Tag>
        <BronzeCard.Eyebrow>Color</BronzeCard.Eyebrow>
        <BronzeCard.Primary>Verde · Rojo</BronzeCard.Primary>
        <BronzeCard.Divider />
        <BronzeCard.Secondary>Fondo oscuro</BronzeCard.Secondary>
        <BronzeCard.Meta>crystal.json</BronzeCard.Meta>
      </BronzeCard>
    );
    expect(screen.getByText("Time Attack")).toBeTruthy();
    expect(screen.getByText("Color")).toBeTruthy();
    expect(screen.getByText("Verde · Rojo")).toBeTruthy();
    expect(screen.getByText("Fondo oscuro")).toBeTruthy();
    expect(screen.getByText("crystal.json")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --dir frontend test -- BronzeCard.test.tsx`
Expected: FAIL with "Cannot find module './BronzeCard'"

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/hub/overlays/BronzeCard.tsx
import type { ReactNode, HTMLAttributes } from "react";

type BronzeCardProps = HTMLAttributes<HTMLDivElement> & {
  active?: boolean;
  children: ReactNode;
};

export function BronzeCard({ active = false, className = "", children, ...rest }: BronzeCardProps) {
  return (
    <div
      className={`bc ${active ? "bc-active" : ""} ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}

function Tag({ children }: { children: ReactNode }) {
  return <span className="bc-tag" style={{ color: "#C1121F" }}>{children}</span>;
}

function Eyebrow({ children }: { children: ReactNode }) {
  return <div className="bc-eyebrow">{children}</div>;
}

function Primary({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`bc-primary ${className}`}>{children}</div>;
}

function Divider() {
  return <div className="bc-divider" />;
}

function Secondary({ children }: { children: ReactNode }) {
  return <div className="bc-secondary">{children}</div>;
}

function Meta({ children }: { children: ReactNode }) {
  return <div className="bc-meta">{children}</div>;
}

BronzeCard.Tag = Tag;
BronzeCard.Eyebrow = Eyebrow;
BronzeCard.Primary = Primary;
BronzeCard.Divider = Divider;
BronzeCard.Secondary = Secondary;
BronzeCard.Meta = Meta;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --dir frontend test -- BronzeCard.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/hub/overlays/BronzeCard.tsx src/hub/overlays/BronzeCard.test.tsx
git commit -m "feat: add BronzeCard component for sub-nav redesign"
```

---

## Task 2: Add CSS classes for bronze cards and sub-nav

**Files:**
- Modify: `src/index.css` (append after the `@layer components` block, before the `[data-visual-mode="lite"]` block)

- [ ] **Step 1: Add bronze card CSS**

Append the following CSS block to `src/index.css` inside the `@layer components` block (after the `.v52-dock-item-muted` rule, before the closing `}` of `@layer components`):

```css
  /* === BRONZE CARD (red vantare accent) === */
  .bc {
    position: relative;
    background:
      linear-gradient(180deg, rgba(193, 18, 31, 0.08) 0%, rgba(193, 18, 31, 0.02) 40%, transparent 100%),
      #0a0a0e;
    border: 1px solid rgba(255, 255, 255, 0.04);
    border-radius: 8px;
    padding: 12px 14px;
    cursor: pointer;
    transition: all 0.2s;
    overflow: hidden;
  }
  .bc::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 1px;
    background: linear-gradient(90deg, transparent 0%, rgba(193, 18, 31, 0.4) 50%, transparent 100%);
  }
  .bc:hover { border-color: rgba(193, 18, 31, 0.3); }
  .bc-active {
    border-color: rgba(193, 18, 31, 0.5);
    background:
      linear-gradient(180deg, rgba(193, 18, 31, 0.15) 0%, rgba(193, 18, 31, 0.04) 40%, transparent 100%),
      #0a0a0e;
  }
  .bc-active::before {
    background: linear-gradient(90deg, transparent 0%, #C1121F 50%, transparent 100%);
    height: 1.5px;
  }

  .bc-tag {
    display: inline-flex;
    align-items: center;
    padding: 2px 8px;
    border: 1px solid currentColor;
    border-radius: 4px;
    font-family: var(--v-font-sans);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }
  .bc-divider {
    height: 1px;
    background: rgba(255, 255, 255, 0.06);
    margin: 8px 0;
  }
  .bc-eyebrow {
    font-family: var(--v-font-sans);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    color: var(--v-text-muted);
  }
  .bc-primary {
    font-family: var(--v-font-display);
    font-size: 16px;
    font-weight: 700;
    color: var(--v-text);
    line-height: 1.1;
    letter-spacing: 0.01em;
  }
  .bc-secondary {
    font-family: var(--v-font-sans);
    font-size: 11.5px;
    color: #b0b0b8;
    line-height: 1.2;
  }
  .bc-meta {
    font-family: var(--v-font-mono);
    font-size: 10px;
    color: var(--v-text-muted);
    margin-top: 2px;
  }

  /* === SUB-NAV RAIL === */
  .sn-rail {
    width: 72px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    border-right: 1px solid rgba(255, 255, 255, 0.04);
    background: rgba(0, 0, 0, 0.15);
  }
  .sn-rail-header {
    padding: 10px 8px 12px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
    text-align: center;
  }
  .sn-rail-header-name {
    font-family: var(--v-font-sans);
    font-size: 10px;
    font-weight: 700;
    color: var(--v-text);
    letter-spacing: 0.05em;
    line-height: 1.1;
    text-transform: uppercase;
  }
  .sn-rail-header-status {
    font-family: var(--v-font-mono);
    font-size: 8px;
    color: #34D399;
    letter-spacing: 0.1em;
    margin-top: 2px;
  }
  .sn-rail-visibility {
    margin: 10px auto 0;
    width: 36px; height: 20px;
    border-radius: 10px;
    background: #1a1a1f;
    border: 1px solid rgba(255, 255, 255, 0.08);
    position: relative;
    cursor: pointer;
    transition: all 0.2s;
  }
  .sn-rail-visibility.on {
    background: linear-gradient(135deg, #9B2226, #66001A);
    border-color: rgba(193, 18, 31, 0.4);
  }
  .sn-rail-visibility::after {
    content: '';
    position: absolute;
    top: 2px; left: 2px;
    width: 14px; height: 14px;
    border-radius: 50%;
    background: #4a4a55;
    transition: all 0.2s;
  }
  .sn-rail-visibility.on::after { left: 18px; background: #fff; }

  .sn-items {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 10px 0;
  }
  .sn-item {
    position: relative;
    width: 52px; height: 44px;
    display: flex;
    align-items: center; justify-content: center;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.15s;
    flex-shrink: 0;
    background: transparent;
    border: none;
  }
  .sn-item:hover { background: rgba(255, 255, 255, 0.04); }
  .sn-preview {
    width: 32px; height: 22px;
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
    overflow: hidden;
    position: relative;
  }
  .sn-item:hover .sn-preview { border-color: rgba(255, 255, 255, 0.2); }
  .sn-item.active .sn-preview {
    background: rgba(193, 18, 31, 0.12);
    border-color: rgba(193, 18, 31, 0.4);
    box-shadow: 0 0 12px rgba(193, 18, 31, 0.2);
  }
  .sn-item.active::before {
    content: '';
    position: absolute;
    left: -1px;
    top: 10px; bottom: 10px;
    width: 2px;
    background: #C1121F;
    border-radius: 0 2px 2px 0;
  }
  .sn-item[data-accent="blue"].active::before { background: #3B82F6; box-shadow: 0 0 8px rgba(59, 130, 246, 0.5); }
  .sn-item[data-accent="blue"].active .sn-preview { background: rgba(59, 130, 246, 0.12); border-color: rgba(59, 130, 246, 0.4); box-shadow: 0 0 12px rgba(59, 130, 246, 0.2); }
  .sn-item[data-accent="purple"].active::before { background: #A855F7; box-shadow: 0 0 8px rgba(168, 85, 247, 0.5); }
  .sn-item[data-accent="purple"].active .sn-preview { background: rgba(168, 85, 247, 0.12); border-color: rgba(168, 85, 247, 0.4); box-shadow: 0 0 12px rgba(168, 85, 247, 0.2); }
  .sn-item[data-accent="amber"].active::before { background: #F59E0B; box-shadow: 0 0 8px rgba(245, 158, 11, 0.5); }
  .sn-item[data-accent="amber"].active .sn-preview { background: rgba(245, 158, 11, 0.12); border-color: rgba(245, 158, 11, 0.4); box-shadow: 0 0 12px rgba(245, 158, 11, 0.2); }
  .sn-item[data-accent="cyan"].active::before { background: #06B6D4; box-shadow: 0 0 8px rgba(6, 182, 212, 0.5); }
  .sn-item[data-accent="cyan"].active .sn-preview { background: rgba(6, 182, 212, 0.12); border-color: rgba(6, 182, 212, 0.4); box-shadow: 0 0 12px rgba(6, 182, 212, 0.2); }

  .sn-badge {
    position: absolute;
    top: -3px; right: -3px;
    min-width: 14px; height: 14px;
    padding: 0 4px;
    border-radius: 7px;
    background: rgba(0, 0, 0, 0.6);
    border: 1px solid rgba(255, 255, 255, 0.1);
    font-family: var(--v-font-mono);
    font-size: 8px;
    font-weight: 700;
    color: #b0b0b8;
    display: flex; align-items: center; justify-content: center;
  }
  .sn-badge-changes {
    background: linear-gradient(135deg, #9B2226, #66001A);
    border-color: rgba(193, 18, 31, 0.4);
    color: #fff;
  }

  .sn-tip {
    position: absolute;
    left: calc(100% + 8px);
    top: 50%;
    transform: translateY(-50%);
    padding: 4px 8px;
    background: rgba(8, 8, 10, 0.95);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 4px;
    font-size: 10px;
    font-weight: 600;
    color: #fff;
    white-space: nowrap;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.15s;
    z-index: 50;
  }
  .sn-item:hover .sn-tip { opacity: 1; }

  .sn-footer {
    flex-shrink: 0;
    padding: 8px 12px;
    border-top: 1px solid rgba(255, 255, 255, 0.04);
    display: flex;
    align-items: center;
    gap: 8px;
    background: rgba(0, 0, 0, 0.2);
    font-family: var(--v-font-mono);
    font-size: 9px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--v-text-muted);
  }
  .sn-footer-dot {
    width: 6px; height: 6px;
    border-radius: 50%;
    background: #34D399;
    box-shadow: 0 0 6px rgba(52, 211, 153, 0.5);
    flex-shrink: 0;
  }
  .sn-footer-dot.dirty { background: #F59E0B; box-shadow: 0 0 6px rgba(245, 158, 11, 0.5); }
  .sn-footer-btn {
    padding: 3px 8px;
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.04);
    color: #b0b0b8;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    cursor: pointer;
    transition: all 0.15s;
    border: none;
  }
  .sn-footer-btn:hover { background: rgba(255, 255, 255, 0.08); color: #fff; }

  /* === SUB-NAV CONTENT === */
  .sn-content {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .sn-content-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 16px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
    min-height: 41px;
  }
  .sn-content-title {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .sn-content-title-text {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--v-text);
  }
  .sn-content-title-dot {
    width: 6px; height: 6px;
    border-radius: 50%;
    background: #C1121F;
    box-shadow: 0 0 6px rgba(193, 18, 31, 0.5);
  }
  .sn-content-actions {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .sn-action {
    width: 24px; height: 24px;
    display: flex; align-items: center; justify-content: center;
    border-radius: 5px;
    color: var(--v-text-muted);
    transition: all 0.15s;
    cursor: pointer;
    background: transparent;
    border: none;
  }
  .sn-action:hover { color: #fff; background: rgba(255, 255, 255, 0.05); }
  .sn-content-body {
    flex: 1;
    overflow-y: auto;
    padding: 14px 16px;
  }
  .sn-section {
    animation: snFade 0.2s ease-out;
  }
  @keyframes snFade {
    from { opacity: 0; transform: translateX(4px); }
    to { opacity: 1; transform: translateX(0); }
  }
```

- [ ] **Step 2: Verify CSS compiles**

Run: `pnpm --dir frontend build`
Expected: Build succeeds without CSS errors

- [ ] **Step 3: Commit**

```bash
git add src/index.css
git commit -m "feat: add bronze card and sub-nav CSS classes"
```

---

## Task 3: Sub-nav config (section definitions)

**Files:**
- Create: `src/hub/overlays/sub-nav-config.ts`
- Create: `src/hub/overlays/sub-nav-config.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/hub/overlays/sub-nav-config.test.ts
import { describe, it, expect } from "vitest";
import { getSectionsForWidget, type SubNavSectionId } from "./sub-nav-config";

describe("sub-nav-config", () => {
  it("returns Diseño + Apariencia + Columnas + Visibilidad + General for relative", () => {
    const sections = getSectionsForWidget("relative");
    const ids = sections.map((s) => s.id);
    expect(ids).toContain("diseno");
    expect(ids).toContain("apariencia");
    expect(ids).toContain("columnas");
    expect(ids).toContain("visibilidad");
    expect(ids).toContain("general");
    expect(ids).not.toContain("slots");
    expect(ids).not.toContain("colores");
  });

  it("returns Diseño + Apariencia + Columnas + Visibilidad + General for standings", () => {
    const sections = getSectionsForWidget("standings");
    const ids = sections.map((s) => s.id);
    expect(ids).toContain("columnas");
    expect(ids).not.toContain("slots");
  });

  it("returns Diseño + Apariencia + Slots + Visibilidad + General for delta", () => {
    const sections = getSectionsForWidget("delta");
    const ids = sections.map((s) => s.id);
    expect(ids).toContain("slots");
    expect(ids).not.toContain("columnas");
    expect(ids).not.toContain("colores");
  });

  it("returns Diseño + Apariencia + Colores + Visibilidad + General for pedals", () => {
    const sections = getSectionsForWidget("pedals");
    const ids = sections.map((s) => s.id);
    expect(ids).toContain("colores");
    expect(ids).not.toContain("columnas");
    expect(ids).not.toContain("slots");
  });

  it("returns Diseño + Apariencia + Slots + Visibilidad + General for unknown type", () => {
    const sections = getSectionsForWidget("telemetry");
    const ids = sections.map((s) => s.id);
    expect(ids).toContain("slots");
    expect(ids).not.toContain("columnas");
  });

  it("all sections have accent colors", () => {
    const sections = getSectionsForWidget("relative");
    for (const s of sections) {
      expect(s.accent).toMatch(/^(|blue|purple|amber|cyan)$/);
    }
  });

  it("all sections have a title and label", () => {
    const sections = getSectionsForWidget("delta");
    for (const s of sections) {
      expect(s.title).toBeTruthy();
      expect(s.label).toBeTruthy();
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --dir frontend test -- sub-nav-config.test.ts`
Expected: FAIL with "Cannot find module './sub-nav-config'"

- [ ] **Step 3: Write minimal implementation**

```ts
// src/hub/overlays/sub-nav-config.ts

export type SubNavSectionId =
  | "diseno"
  | "apariencia"
  | "columnas"
  | "slots"
  | "colores"
  | "visibilidad"
  | "general";

export type AccentColor = "" | "blue" | "purple" | "amber" | "cyan";

export type SubNavSection = {
  id: SubNavSectionId;
  title: string;
  label: string;
  accent: AccentColor;
};

const COLUMN_TYPES = new Set(["relative", "standings"]);

const ALL_SECTIONS: Record<SubNavSectionId, SubNavSection> = {
  diseno: { id: "diseno", title: "Diseño", label: "Diseño", accent: "" },
  apariencia: { id: "apariencia", title: "Apariencia", label: "Apariencia", accent: "purple" },
  columnas: { id: "columnas", title: "Columnas", label: "Columnas", accent: "blue" },
  slots: { id: "slots", title: "Slots", label: "Slots", accent: "blue" },
  colores: { id: "colores", title: "Colores", label: "Colores", accent: "amber" },
  visibilidad: { id: "visibilidad", title: "Visibilidad", label: "Visibilidad", accent: "amber" },
  general: { id: "general", title: "General", label: "General", accent: "cyan" },
};

export function getSectionsForWidget(widgetType: string): SubNavSection[] {
  const hasColumns = COLUMN_TYPES.has(widgetType);
  const isPedals = widgetType === "pedals";

  const sections: SubNavSectionId[] = [
    "diseno",
    "apariencia",
    hasColumns ? "columnas" : "slots",
    isPedals ? "colores" : null,
    "visibilidad",
    "general",
  ].filter((id): id is SubNavSectionId => id !== null);

  return sections.map((id) => ALL_SECTIONS[id]);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --dir frontend test -- sub-nav-config.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/hub/overlays/sub-nav-config.ts src/hub/overlays/sub-nav-config.test.ts
git commit -m "feat: add sub-nav section config with dynamic widget-type mapping"
```

---

## Task 4: SubNavRail component

**Files:**
- Create: `src/hub/overlays/SubNavRail.tsx`
- Create: `src/hub/overlays/SubNavRail.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/hub/overlays/SubNavRail.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SubNavRail } from "./SubNavRail";
import type { SubNavSection } from "./sub-nav-config";

const mockSections: SubNavSection[] = [
  { id: "diseno", title: "Diseño", label: "Diseño", accent: "" },
  { id: "apariencia", title: "Apariencia", label: "Apariencia", accent: "purple" },
  { id: "slots", title: "Slots", label: "Slots", accent: "blue" },
];

describe("SubNavRail", () => {
  it("renders widget name in header", () => {
    render(
      <SubNavRail
        widgetName="Delta trace"
        widgetEnabled={true}
        sections={mockSections}
        activeSectionId="diseno"
        onSelectSection={() => {}}
        onToggleVisibility={() => {}}
        dirty={false}
        onReset={() => {}}
      />
    );
    expect(screen.getByText("Delta trace")).toBeTruthy();
  });

  it("shows active status when widget is enabled", () => {
    render(
      <SubNavRail
        widgetName="Delta"
        widgetEnabled={true}
        sections={mockSections}
        activeSectionId="diseno"
        onSelectSection={() => {}}
        onToggleVisibility={() => {}}
        dirty={false}
        onReset={() => {}}
      />
    );
    expect(screen.getByText(/Activo/i)).toBeTruthy();
  });

  it("renders a button per section", () => {
    render(
      <SubNavRail
        widgetName="Delta"
        widgetEnabled={true}
        sections={mockSections}
        activeSectionId="diseno"
        onSelectSection={() => {}}
        onToggleVisibility={() => {}}
        dirty={false}
        onReset={() => {}}
      />
    );
    expect(screen.getByText("Diseño")).toBeTruthy();
    expect(screen.getByText("Apariencia")).toBeTruthy();
    expect(screen.getByText("Slots")).toBeTruthy();
  });

  it("calls onSelectSection when a section button is clicked", () => {
    const onSelect = vi.fn();
    render(
      <SubNavRail
        widgetName="Delta"
        widgetEnabled={true}
        sections={mockSections}
        activeSectionId="diseno"
        onSelectSection={onSelect}
        onToggleVisibility={() => {}}
        dirty={false}
        onReset={() => {}}
      />
    );
    fireEvent.click(screen.getByText("Slots"));
    expect(onSelect).toHaveBeenCalledWith("slots");
  });

  it("calls onToggleVisibility when visibility toggle is clicked", () => {
    const onToggle = vi.fn();
    render(
      <SubNavRail
        widgetName="Delta"
        widgetEnabled={true}
        sections={mockSections}
        activeSectionId="diseno"
        onSelectSection={() => {}}
        onToggleVisibility={onToggle}
        dirty={false}
        onReset={() => {}}
      />
    );
    const toggle = screen.getByRole("button", { name: /visible/i });
    fireEvent.click(toggle);
    expect(onToggle).toHaveBeenCalled();
  });

  it("shows dirty indicator when dirty is true", () => {
    render(
      <SubNavRail
        widgetName="Delta"
        widgetEnabled={true}
        sections={mockSections}
        activeSectionId="diseno"
        onSelectSection={() => {}}
        onToggleVisibility={() => {}}
        dirty={true}
        onReset={() => {}}
      />
    );
    expect(screen.getByText(/cambios/i)).toBeTruthy();
  });

  it("calls onReset when reset button is clicked", () => {
    const onReset = vi.fn();
    render(
      <SubNavRail
        widgetName="Delta"
        widgetEnabled={true}
        sections={mockSections}
        activeSectionId="diseno"
        onSelectSection={() => {}}
        onToggleVisibility={() => {}}
        dirty={true}
        onReset={onReset}
      />
    );
    fireEvent.click(screen.getByText("Reset"));
    expect(onReset).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --dir frontend test -- SubNavRail.test.tsx`
Expected: FAIL with "Cannot find module './SubNavRail'"

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/hub/overlays/SubNavRail.tsx
import type { SubNavSection, AccentColor } from "./sub-nav-config";

type SubNavRailProps = {
  widgetName: string;
  widgetEnabled: boolean;
  sections: SubNavSection[];
  activeSectionId: string;
  onSelectSection: (id: string) => void;
  onToggleVisibility: () => void;
  dirty: boolean;
  onReset: () => void;
};

export function SubNavRail({
  widgetName,
  widgetEnabled,
  sections,
  activeSectionId,
  onSelectSection,
  onToggleVisibility,
  dirty,
  onReset,
}: SubNavRailProps) {
  return (
    <div className="sn-rail" data-testid="sub-nav-rail">
      {/* Header: widget name + status + visibility toggle */}
      <div className="sn-rail-header">
        <div className="sn-rail-header-name">{widgetName}</div>
        <div className="sn-rail-header-status">
          {widgetEnabled ? "● Activo" : "● Oculto"}
        </div>
        <button
          type="button"
          className={`sn-rail-visibility ${widgetEnabled ? "on" : ""}`}
          onClick={onToggleVisibility}
          aria-label="Toggle widget visibility"
        />
      </div>

      {/* Section items with mini-previews */}
      <div className="sn-items">
        {sections.map((section) => (
          <button
            key={section.id}
            type="button"
            className={`sn-item ${activeSectionId === section.id ? "active" : ""}`}
            data-accent={section.accent}
            data-testid={`sn-item-${section.id}`}
            onClick={() => onSelectSection(section.id)}
          >
            <div className="sn-preview">
              <SectionMiniPreview sectionId={section.id} accent={section.accent} />
            </div>
            <span className="sn-tip">{section.label}</span>
          </button>
        ))}
      </div>

      {/* Footer: dirty state + reset */}
      <div className="sn-footer">
        <span className={`sn-footer-dot ${dirty ? "dirty" : ""}`} />
        <span>{dirty ? "Cambios" : "Guardado"}</span>
        {dirty && (
          <button type="button" className="sn-footer-btn" onClick={onReset}>
            Reset
          </button>
        )}
      </div>
    </div>
  );
}

function SectionMiniPreview({ sectionId, accent }: { sectionId: string; accent: AccentColor }) {
  switch (sectionId) {
    case "diseno":
      return (
        <div className="flex gap-0.5 w-full px-1.5">
          <div className="h-2.5 flex-1 rounded-sm" style={{ background: "linear-gradient(135deg, #1a3a5c, #0a1a2c)" }} />
          <div className="h-2.5 flex-1 rounded-sm" style={{ background: "linear-gradient(135deg, #4a0012, #2a000a)" }} />
          <div className="h-2.5 flex-1 rounded-sm" style={{ background: "linear-gradient(135deg, #1f2937, #111827)" }} />
        </div>
      );
    case "apariencia":
      return (
        <div className="w-full px-1.5 space-y-0.5">
          <div className="h-1 w-full bg-white/15 rounded-full relative overflow-hidden">
            <div className="absolute left-0 top-0 h-full w-1/2 bg-white/60 rounded-full" />
          </div>
          <div className="h-1 w-full bg-white/15 rounded-full relative overflow-hidden">
            <div className="absolute left-0 top-0 h-full w-3/4 bg-white/60 rounded-full" />
          </div>
        </div>
      );
    case "columnas":
    case "slots":
      return (
        <div className="flex flex-col gap-0.5 w-full px-2">
          <div className="flex items-center gap-0.5">
            <div className="w-2 h-1 rounded-full bg-blue-400" />
            <div className="flex-1 h-0.5 bg-white/20 rounded" />
          </div>
          <div className="flex items-center gap-0.5">
            <div className="w-2 h-1 rounded-full bg-blue-400" />
            <div className="flex-1 h-0.5 bg-white/20 rounded" />
          </div>
          <div className="flex items-center gap-0.5">
            <div className="w-2 h-1 rounded-full bg-white/10" />
            <div className="flex-1 h-0.5 bg-white/10 rounded" />
          </div>
        </div>
      );
    case "colores":
      return (
        <div className="flex items-center justify-center w-full h-full">
          <svg className="w-3 h-3 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
          </svg>
        </div>
      );
    case "visibilidad":
      return (
        <div className="flex items-center justify-center w-full h-full">
          <svg className="w-3 h-3 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
        </div>
      );
    case "general":
      return (
        <div className="flex items-center justify-center w-full h-full">
          <svg className="w-3 h-3 text-cyan-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <circle cx="12" cy="12" r="3" strokeWidth={2} />
          </svg>
        </div>
      );
    default:
      return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --dir frontend test -- SubNavRail.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/hub/overlays/SubNavRail.tsx src/hub/overlays/SubNavRail.test.tsx
git commit -m "feat: add SubNavRail component with mini-previews and dynamic sections"
```

---

## Task 5: SubNavContent component

**Files:**
- Create: `src/hub/overlays/SubNavContent.tsx`
- Create: `src/hub/overlays/SubNavContent.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/hub/overlays/SubNavContent.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SubNavContent } from "./SubNavContent";
import type { SubNavSection } from "./sub-nav-config";

const mockSections: SubNavSection[] = [
  { id: "diseno", title: "Diseño", label: "Diseño", accent: "" },
  { id: "apariencia", title: "Apariencia", label: "Apariencia", accent: "purple" },
];

describe("SubNavContent", () => {
  it("renders the active section title in header", () => {
    render(
      <SubNavContent
        sections={mockSections}
        activeSectionId="diseno"
        onResetSection={() => {}}
      >
        <div data-testid="diseno-content">Design content</div>
        <div data-testid="apariencia-content" className="hidden">Appearance content</div>
      </SubNavContent>
    );
    expect(screen.getByText("Diseño")).toBeTruthy();
  });

  it("renders reset and more-actions buttons in header", () => {
    render(
      <SubNavContent
        sections={mockSections}
        activeSectionId="diseno"
        onResetSection={() => {}}
      >
        <div>Content</div>
      </SubNavContent>
    );
    expect(screen.getByTitle("Reset sección")).toBeTruthy();
    expect(screen.getByTitle("Más opciones")).toBeTruthy();
  });

  it("calls onResetSection when reset button is clicked", () => {
    const onReset = vi.fn();
    render(
      <SubNavContent
        sections={mockSections}
        activeSectionId="diseno"
        onResetSection={onReset}
      >
        <div>Content</div>
      </SubNavContent>
    );
    screen.getByTitle("Reset sección").click();
    expect(onReset).toHaveBeenCalled();
  });

  it("renders children inside the body", () => {
    render(
      <SubNavContent
        sections={mockSections}
        activeSectionId="diseno"
        onResetSection={() => {}}
      >
        <div data-testid="child">Child content</div>
      </SubNavContent>
    );
    expect(screen.getByTestId("child")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --dir frontend test -- SubNavContent.test.tsx`
Expected: FAIL with "Cannot find module './SubNavContent'"

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/hub/overlays/SubNavContent.tsx
import type { ReactNode } from "react";
import type { SubNavSection } from "./sub-nav-config";

type SubNavContentProps = {
  sections: SubNavSection[];
  activeSectionId: string;
  onResetSection: () => void;
  children: ReactNode;
};

export function SubNavContent({
  sections,
  activeSectionId,
  onResetSection,
  children,
}: SubNavContentProps) {
  const activeSection = sections.find((s) => s.id === activeSectionId);

  return (
    <div className="sn-content" data-testid="sub-nav-content">
      <div className="sn-content-header">
        <div className="sn-content-title">
          <span className="sn-content-title-dot" data-accent={activeSection?.accent ?? ""} />
          <span className="sn-content-title-text">{activeSection?.title ?? ""}</span>
        </div>
        <div className="sn-content-actions">
          <button type="button" className="sn-action" title="Reset sección" onClick={onResetSection}>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          <button type="button" className="sn-action" title="Más opciones">
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
              <circle cx="5" cy="12" r="1.5" />
              <circle cx="12" cy="12" r="1.5" />
              <circle cx="19" cy="12" r="1.5" />
            </svg>
          </button>
        </div>
      </div>
      <div className="sn-content-body">{children}</div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --dir frontend test -- SubNavContent.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/hub/overlays/SubNavContent.tsx src/hub/overlays/SubNavContent.test.tsx
git commit -m "feat: add SubNavContent component with section header and body"
```

---

## Task 6: Rewrite WidgetSettingsPanel with sub-nav layout

**Files:**
- Modify: `src/hub/overlays/WidgetSettingsPanel.tsx` (full rewrite of render, keep draft logic)
- Modify: `src/hub/overlays/WidgetSettingsPanel.test.tsx` (update tests for new structure)

- [ ] **Step 1: Read the current WidgetSettingsPanel.test.tsx to understand existing test expectations**

Run: Read `src/hub/overlays/WidgetSettingsPanel.test.tsx`

- [ ] **Step 2: Write the new WidgetSettingsPanel implementation**

Replace the entire content of `src/hub/overlays/WidgetSettingsPanel.tsx` with:

```tsx
import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useI18n } from "../../i18n/I18nProvider";
import type { ProfileConfig, WidgetConfig, SlotConfig, ColumnConfig, ColumnGroupConfig } from "../../lib/profile";
import { PreviewInspector } from "../preview/PreviewInspector";
import { RelativeSettingsSection } from "./RelativeSettingsSection";
import { StandingsSettingsSection } from "./StandingsSettingsSection";
import { PedalsSettingsSection } from "./PedalsSettingsSection";
import { WidgetPresetSection } from "./WidgetPresetSection";
import { WidgetConfigSections } from "./WidgetConfigSections";
import { WidgetDesignGallery } from "../widgets/WidgetDesignGallery";
import { applyOfficialDesignToProfile, getActiveOfficialDesignId, getOfficialDesign, type OfficialDesign } from "../widgets/widget-design-gallery";
import { WidgetVariantManager } from "./WidgetVariantManager";
import { useAccess } from "../../lib/access";
import { canApplyWidget } from "./widget-catalog";
import { resolveEffectiveWidgetVariant } from "./widget-config-model";
import { SubNavRail } from "./SubNavRail";
import { SubNavContent } from "./SubNavContent";
import { getSectionsForWidget, type SubNavSectionId } from "./sub-nav-config";

type WidgetSettingsPanelProps = {
  profile: ProfileConfig;
  widget: WidgetConfig | null;
  onChangeProfile: (profile: ProfileConfig) => void;
};

type DraftConfig = {
  slots: SlotConfig[];
  columns: ColumnConfig[];
  columnGroups: ColumnGroupConfig[];
};

function isDraftDirty(draft: DraftConfig, effective: DraftConfig): boolean {
  return (
    JSON.stringify(draft.slots) !== JSON.stringify(effective.slots) ||
    JSON.stringify(draft.columns) !== JSON.stringify(effective.columns) ||
    JSON.stringify(draft.columnGroups) !== JSON.stringify(effective.columnGroups)
  );
}

export function WidgetSettingsPanel({ profile, widget, onChangeProfile }: WidgetSettingsPanelProps) {
  const access = useAccess();
  const canApply = widget ? canApplyWidget(widget.type, access) : false;
  const { t } = useI18n();

  const effective = useMemo(
    () => widget
      ? resolveEffectiveWidgetVariant(widget, profile)
      : { slots: [], columns: [], columnGroups: [] },
    [widget, profile],
  );

  const [draft, setDraft] = useState<DraftConfig>({
    slots: effective.slots,
    columns: effective.columns,
    columnGroups: effective.columnGroups,
  });

  const prevWidgetId = useRef(widget?.id);
  useEffect(() => {
    if (widget?.id !== prevWidgetId.current) {
      prevWidgetId.current = widget?.id;
      setDraft({
        slots: effective.slots,
        columns: effective.columns,
        columnGroups: effective.columnGroups,
      });
    }
  }, [widget?.id, effective.slots, effective.columns, effective.columnGroups]);

  const dirty = isDraftDirty(draft, effective);

  const handleDraftChange = useCallback(
    (changes: { slots?: SlotConfig[]; columns?: ColumnConfig[]; columnGroups?: ColumnGroupConfig[] }) => {
      setDraft((prev) => ({
        ...prev,
        ...(changes.slots !== undefined ? { slots: changes.slots } : {}),
        ...(changes.columns !== undefined ? { columns: changes.columns } : {}),
        ...(changes.columnGroups !== undefined ? { columnGroups: changes.columnGroups } : {}),
      }));
    },
    [],
  );

  const handleSaveToWidget = useCallback(() => {
    if (!widget || !canApply) return;
    const updatedWidgets = profile.widgets.map((w) => {
      if (w.id !== widget.id) return w;
      return {
        ...w,
        props: {
          ...w.props,
          slots: draft.slots,
          columns: draft.columns,
          columnGroups: draft.columnGroups,
        },
      };
    });
    onChangeProfile({ ...profile, widgets: updatedWidgets });
  }, [widget, canApply, profile, draft, onChangeProfile]);

  const handleDiscard = useCallback(() => {
    setDraft({
      slots: effective.slots,
      columns: effective.columns,
      columnGroups: effective.columnGroups,
    });
  }, [effective]);

  const handleApplyOfficialDesign = (design: OfficialDesign) => {
    if (!widget || !canApply) return;
    onChangeProfile(applyOfficialDesignToProfile(profile, widget.id, design));
  };

  const handleToggleVisibility = useCallback(() => {
    if (!widget) return;
    const updatedWidgets = profile.widgets.map((w) =>
      w.id === widget.id ? { ...w, enabled: !w.enabled } : w
    );
    onChangeProfile({ ...profile, widgets: updatedWidgets });
  }, [widget, profile, onChangeProfile]);

  const activeDesignId = widget ? getActiveOfficialDesignId(widget) : null;
  const selectedDesign = activeDesignId ? getOfficialDesign(activeDesignId) : null;
  const sameTypeWidgets = widget
    ? profile.widgets.filter((w) => w.type === widget.type)
    : [];

  // Sub-nav state
  const sections = widget ? getSectionsForWidget(widget.type) : [];
  const [activeSectionId, setActiveSectionId] = useState<SubNavSectionId | null>(null);

  // Reset active section when widget changes
  useEffect(() => {
    if (sections.length > 0) {
      setActiveSectionId(sections[0].id);
    } else {
      setActiveSectionId(null);
    }
  }, [widget?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!widget) {
    return (
      <div className="glass-panel flex h-full items-center justify-center rounded-xl text-sm text-vantare-textMuted">
        Selecciona un widget para editar
      </div>
    );
  }

  return (
    <div data-testid="widget-settings-panel" className="flex h-full min-h-0 overflow-hidden rounded-xl">
      {/* Sub-nav rail */}
      <SubNavRail
        widgetName={widget.name || widget.id}
        widgetEnabled={widget.enabled}
        sections={sections}
        activeSectionId={activeSectionId ?? ""}
        onSelectSection={(id) => setActiveSectionId(id as SubNavSectionId)}
        onToggleVisibility={handleToggleVisibility}
        dirty={dirty}
        onReset={handleDiscard}
      />

      {/* Sub-nav content */}
      <SubNavContent
        sections={sections}
        activeSectionId={activeSectionId ?? ""}
        onResetSection={handleDiscard}
      >
        {/* Diseño section */}
        {activeSectionId === "diseno" && (
          <div className="sn-section space-y-3">
            {canApply && (
              <WidgetDesignGallery
                widget={widget}
                activeDesignId={activeDesignId}
                onApplyDesign={handleApplyOfficialDesign}
              />
            )}
            {selectedDesign && sameTypeWidgets.length > 1 && (
              <button
                type="button"
                data-testid="apply-design-to-all"
                onClick={() => {
                  let updated = profile;
                  for (const w of sameTypeWidgets) {
                    updated = applyOfficialDesignToProfile(updated, w.id, selectedDesign);
                  }
                  onChangeProfile(updated);
                }}
                className="w-full rounded bg-vantare-red-500/20 px-2.5 py-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-vantare-red-400 hover:bg-vantare-red-500/30 cursor-pointer transition-colors"
              >
                Aplicar a todos
              </button>
            )}
            <WidgetVariantManager
              profile={profile}
              widget={widget}
              onChangeProfile={onChangeProfile}
              canApply={canApply}
              draft={dirty ? draft : undefined}
            />
            <WidgetPresetSection
              profile={profile}
              widget={widget}
              onChangeProfile={onChangeProfile}
            />
          </div>
        )}

        {/* Apariencia section */}
        {activeSectionId === "apariencia" && (
          <div className="sn-section">
            <PreviewInspector
              profile={profile}
              widget={widget}
              onChangeProfile={onChangeProfile}
              disabled={false}
              showPositionControls={false}
              showDangerActions={false}
              showAppearanceControls={true}
            />
          </div>
        )}

        {/* Columnas section (relative/standings) */}
        {activeSectionId === "columnas" && (
          <div className="sn-section space-y-3">
            <WidgetConfigSections
              slots={draft.slots}
              columns={draft.columns}
              columnGroups={draft.columnGroups}
              widgetType={widget.type}
              canApply={canApply}
              onDraftChange={handleDraftChange}
            />
            <RelativeSettingsSection
              profile={profile}
              widget={widget}
              onChangeProfile={onChangeProfile}
            />
            <StandingsSettingsSection
              profile={profile}
              widget={widget}
              onChangeProfile={onChangeProfile}
            />
            {dirty && canApply && (
              <div className="flex items-center gap-2 border-t border-white/5 pt-3" data-testid="draft-actions">
                <button
                  type="button"
                  onClick={handleSaveToWidget}
                  data-testid="save-to-widget-btn"
                  className="rounded bg-vantare-red-500/80 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-white hover:bg-vantare-red-500 cursor-pointer"
                >
                  {t("studio.saveToWidget")}
                </button>
                <button
                  type="button"
                  onClick={handleDiscard}
                  data-testid="discard-changes-btn"
                  className="rounded border border-white/10 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-vantare-textMuted hover:bg-white/5 cursor-pointer"
                >
                  {t("studio.discard")}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Slots section (non-relative/standings) */}
        {activeSectionId === "slots" && (
          <div className="sn-section space-y-3">
            <WidgetConfigSections
              slots={draft.slots}
              columns={draft.columns}
              columnGroups={draft.columnGroups}
              widgetType={widget.type}
              canApply={canApply}
              onDraftChange={handleDraftChange}
            />
            {dirty && canApply && (
              <div className="flex items-center gap-2 border-t border-white/5 pt-3" data-testid="draft-actions">
                <button
                  type="button"
                  onClick={handleSaveToWidget}
                  data-testid="save-to-widget-btn"
                  className="rounded bg-vantare-red-500/80 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-white hover:bg-vantare-red-500 cursor-pointer"
                >
                  {t("studio.saveToWidget")}
                </button>
                <button
                  type="button"
                  onClick={handleDiscard}
                  data-testid="discard-changes-btn"
                  className="rounded border border-white/10 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-vantare-textMuted hover:bg-white/5 cursor-pointer"
                >
                  {t("studio.discard")}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Colores section (pedals) */}
        {activeSectionId === "colores" && (
          <div className="sn-section">
            <PedalsSettingsSection
              profile={profile}
              widget={widget}
              onChangeProfile={onChangeProfile}
            />
          </div>
        )}

        {/* Visibilidad section */}
        {activeSectionId === "visibilidad" && (
          <div className="sn-section">
            <PreviewInspector
              profile={profile}
              widget={widget}
              onChangeProfile={onChangeProfile}
              disabled={false}
              showPositionControls={false}
              showDangerActions={false}
              showAppearanceControls={false}
            />
          </div>
        )}

        {/* General section */}
        {activeSectionId === "general" && (
          <div className="sn-section">
            <PreviewInspector
              profile={profile}
              widget={widget}
              onChangeProfile={onChangeProfile}
              disabled={false}
              showPositionControls={false}
              showDangerActions={false}
              showAppearanceControls={false}
            />
          </div>
        )}
      </SubNavContent>
    </div>
  );
}
```

- [ ] **Step 3: Update existing tests**

Read `src/hub/overlays/WidgetSettingsPanel.test.tsx` and update any test that:
- Queries for `widget-settings-header` → now it's in the SubNavRail header
- Queries for `pro-upgrade-notice` → keep as-is if it still renders
- Queries for `PreviewInspector` → it's now rendered conditionally per section
- Queries for `WidgetDesignGallery` → it's now inside the "diseno" section
- Queries for `draft-actions` / `save-to-widget-btn` / `discard-changes-btn` → still present but inside "columnas" or "slots" section

Key test updates:
- The panel now requires a `widget` prop to render the sub-nav. Tests that pass `widget={null}` should expect the placeholder.
- Tests that check for `WidgetDesignGallery` need to ensure `activeSectionId` defaults to "diseno" (first section).
- The `data-testid="widget-settings-panel"` is still on the root div.

- [ ] **Step 4: Run tests**

Run: `pnpm --dir frontend test -- WidgetSettingsPanel.test.tsx`
Expected: PASS (fix any failing tests by updating selectors)

- [ ] **Step 5: Run full test suite**

Run: `pnpm --dir frontend test`
Expected: All tests pass

- [ ] **Step 6: Run build**

Run: `pnpm --dir frontend build`
Expected: Build succeeds

- [ ] **Step 7: Commit**

```bash
git add src/hub/overlays/WidgetSettingsPanel.tsx src/hub/overlays/WidgetSettingsPanel.test.tsx
git commit -m "feat: rewrite WidgetSettingsPanel with sub-nav layout (bronze cards, dynamic sections)"
```

---

## Task 7: Update LayoutStudio grid to match new panel width

**Files:**
- Modify: `src/hub/overlays/LayoutStudio.tsx` (line ~180, the grid template)

- [ ] **Step 1: Update the grid template**

In `LayoutStudio.tsx`, find the grid line:

```tsx
<div className="grid min-h-0 flex-1 gap-4 overflow-y-auto xl:grid-cols-[280px_1fr_340px] xl:overflow-hidden">
```

Change `340px` to `380px` to accommodate the sub-nav rail (72px) + content area:

```tsx
<div className="grid min-h-0 flex-1 gap-4 overflow-y-auto xl:grid-cols-[280px_1fr_380px] xl:overflow-hidden">
```

- [ ] **Step 2: Run tests**

Run: `pnpm --dir frontend test -- LayoutStudio`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/hub/overlays/LayoutStudio.tsx
git commit -m "feat: widen right panel to 380px for sub-nav rail"
```

---

## Task 8: Visual verification and polish

**Files:**
- No code changes unless issues found

- [ ] **Step 1: Run the app in dev mode**

Run: `pnpm --dir frontend dev`
Open the app, navigate to Overlays Studio → open a profile → select a widget.

- [ ] **Step 2: Verify the following:**

- [ ] Sub-nav rail shows on the left side of the right panel with 72px width
- [ ] Widget name appears in the rail header
- [ ] Visibility toggle works (clicking it enables/disables the widget)
- [ ] Section items show mini-previews with correct accent colors
- [ ] Clicking a section item switches the content area
- [ ] Active section has accent line on the left + colored preview background
- [ ] Tooltips appear on hover over section items
- [ ] Footer shows "Guardado" when clean, "Cambios" + "Reset" when dirty
- [ ] Content header shows section title with colored dot
- [ ] Reset and more-actions buttons work in content header
- [ ] Diseño section shows WidgetDesignGallery + WidgetVariantManager + WidgetPresetSection
- [ ] Apariencia section shows PreviewInspector with appearance controls
- [ ] Columnas section (relative/standings) shows WidgetConfigSections + RelativeSettingsSection + StandingsSettingsSection + draft actions
- [ ] Slots section (other types) shows WidgetConfigSections + draft actions
- [ ] Colores section (pedals) shows PedalsSettingsSection
- [ ] Visibilidad section shows PreviewInspector visibility controls
- [ ] General section shows PreviewInspector general controls
- [ ] Switching widgets resets the active section to the first one
- [ ] No widget selected shows the placeholder

- [ ] **Step 3: Fix any visual issues found**

If any issues are found, fix them in the relevant component and re-test.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "polish: visual verification and fixes for sub-nav redesign"
```

---

## Self-Review

**1. Spec coverage:**
- ✅ Sub-nav rail with mini-previews → Task 4 (SubNavRail)
- ✅ Dynamic sections per widget type → Task 3 (sub-nav-config)
- ✅ Bronze-style cards with red accent → Task 1 (BronzeCard) + Task 2 (CSS)
- ✅ Content area with section header → Task 5 (SubNavContent)
- ✅ WidgetSettingsPanel rewrite → Task 6
- ✅ Layout grid width update → Task 7
- ✅ Visual verification → Task 8
- ✅ PreviewInspector preserved → used in Apariencia/Visibilidad/General sections
- ✅ WidgetDesignGallery preserved → used in Diseño section
- ✅ WidgetVariantManager preserved → used in Diseño section
- ✅ WidgetPresetSection preserved → used in Diseño section
- ✅ WidgetConfigSections preserved → used in Columnas/Slots sections
- ✅ RelativeSettingsSection preserved → used in Columnas section
- ✅ StandingsSettingsSection preserved → used in Columnas section
- ✅ PedalsSettingsSection preserved → used in Colores section
- ✅ Draft logic (save/discard) preserved → in WidgetSettingsPanel
- ✅ Visibility toggle → in SubNavRail header
- ✅ Dirty state footer → in SubNavRail footer

**2. Placeholder scan:** No placeholders found. All code blocks contain complete implementations.

**3. Type consistency:**
- `SubNavSectionId` used consistently across sub-nav-config, SubNavRail, SubNavContent, WidgetSettingsPanel
- `SubNavSection` type matches in all files
- `AccentColor` type used in SubNavRail and sub-nav-config
- `BronzeCard` props extend `HTMLAttributes<HTMLDivElement>` consistently
- `DraftConfig` type preserved from original WidgetSettingsPanel