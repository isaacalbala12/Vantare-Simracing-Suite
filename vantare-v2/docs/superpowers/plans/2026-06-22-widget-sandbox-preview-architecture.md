# Widget Sandbox Preview Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fragile isolated widget preview in `WidgetStudio` with a sandbox preview that renders the selected widget without layout-frame side effects, measures real content, and scales it predictably.

**Architecture:** Split preview responsibilities into `WidgetRenderer` (pure widget rendering), `PreviewScaler` (generic centering/scaling), and `WidgetSandboxPreview` (WidgetStudio-only sandbox). Keep `PreviewWidgetFrame` for layout/profile previews where position, frame chrome, and canvas behavior are expected.

**Tech Stack:** React, TypeScript, Vitest, React Testing Library, existing Vite/Wails frontend. No new runtime dependencies.

---

## Current Diagnosis

The current `WidgetStudio` isolated preview reuses `PreviewWidgetFrame`, but `PreviewWidgetFrame` was built for layout/profile previews. It mixes widget rendering, absolute positioning, frame styling, clipping, forced CSS overrides, and scaling. This is why repeated small fixes around height, padding, transform origin, compact rows, and cache did not make the Relative preview robust.

The correct fix is to stop centering a layout frame in `WidgetStudio` and instead center the actual rendered widget content in a sandbox.

## Non-Negotiable Boundaries

- `WidgetStudio` edits appearance, data, formatting, filters, and internal widget behavior.
- `WidgetStudio` must not expose or modify `widget.position.x`, `widget.position.y`, `widget.position.w`, or `widget.position.h`.
- `LayoutStudio` owns position and size.
- `PreviewWidgetFrame` must remain available for layout/profile previews.
- Do not touch backend, profile schema, persistence, configs, or marketing docs.
- Do not add dependencies.
- Do not redesign `RelativeWidget` unless the sandbox refactor proves it is still required.

## File Structure

- Create `frontend/src/hub/preview/widget-preview-size.ts`: pure initial logical size resolver for previews.
- Create `frontend/src/hub/preview/widget-preview-size.test.ts`: tests for initial size and mutation safety.
- Create `frontend/src/hub/preview/WidgetRenderer.tsx`: pure widget renderer with variant enrichment.
- Create `frontend/src/hub/preview/WidgetRenderer.test.tsx`: renderer tests.
- Modify `frontend/src/hub/preview/PreviewWidgetFrame.tsx`: delegate widget rendering to `WidgetRenderer`, preserving frame behavior.
- Create `frontend/src/hub/preview/PreviewScaler.tsx`: reusable centered scaling container.
- Create `frontend/src/hub/preview/PreviewScaler.test.tsx`: scaler tests.
- Create `frontend/src/hub/overlays/WidgetSandboxPreview.tsx`: isolated WidgetStudio preview.
- Create `frontend/src/hub/overlays/WidgetSandboxPreview.test.tsx`: sandbox behavior tests.
- Modify `frontend/src/hub/overlays/WidgetPreviewPanel.tsx`: replace internals with `WidgetSandboxPreview`.
- Modify `frontend/src/hub/overlays/WidgetPreviewPanel.test.tsx`: update expectations.
- Modify `frontend/src/hub/overlays/WidgetStudio.test.tsx` only if current tests intentionally depend on old preview internals.
- Modify `docs/current-plan.md` only after code checks and manual verification pass.

No commits or staging in this shared dirty worktree unless the user explicitly asks.

---

## Task 1: Add Pure Preview Size Resolver

**Files:**

- Create: `frontend/src/hub/preview/widget-preview-size.ts`
- Create: `frontend/src/hub/preview/widget-preview-size.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/hub/preview/widget-preview-size.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { ProfileConfig, WidgetConfig } from "../../lib/profile";
import { createDefaultRelativeColumns } from "../../overlay/widgets/relative-catalog";
import { resolveWidgetPreviewBaseSize } from "./widget-preview-size";

function profileWith(widget: WidgetConfig): ProfileConfig {
  return {
    id: "profile-test",
    name: "Test",
    widgets: [widget],
    variants: [],
  };
}

describe("resolveWidgetPreviewBaseSize", () => {
  it("returns declared size for non-relative widgets", () => {
    const widget: WidgetConfig = {
      id: "delta",
      type: "delta",
      title: "delta",
      enabled: true,
      updateHz: 15,
      position: { x: 100, y: 200, w: 320, h: 140 },
      props: {},
    };

    expect(resolveWidgetPreviewBaseSize(profileWith(widget), widget)).toEqual({
      width: 320,
      height: 140,
      mode: "declared",
    });
  });

  it("keeps declared width when relative intrinsic width fits", () => {
    const columns = createDefaultRelativeColumns();
    const widget: WidgetConfig = {
      id: "relative",
      type: "relative",
      title: "relative",
      enabled: true,
      updateHz: 15,
      position: { x: 80, y: 90, w: 900, h: 420 },
      variantId: "variant-relative",
      props: {},
    };
    const profile: ProfileConfig = {
      ...profileWith(widget),
      variants: [{ id: "variant-relative", widgetType: "relative", columns }],
    };

    expect(resolveWidgetPreviewBaseSize(profile, widget)).toEqual({
      width: 900,
      height: 420,
      mode: "declared",
    });
  });

  it("expands relative width when active columns need more than declared width", () => {
    const columns = createDefaultRelativeColumns().map((column) =>
      column.id === "bestLap" || column.id === "lastLap" ? { ...column, enabled: true } : column,
    );
    const widget: WidgetConfig = {
      id: "relative",
      type: "relative",
      title: "relative",
      enabled: true,
      updateHz: 15,
      position: { x: 80, y: 90, w: 220, h: 420 },
      variantId: "variant-relative",
      props: {},
    };
    const profile: ProfileConfig = {
      ...profileWith(widget),
      variants: [{ id: "variant-relative", widgetType: "relative", columns }],
    };

    const result = resolveWidgetPreviewBaseSize(profile, widget);

    expect(result.width).toBeGreaterThan(220);
    expect(result.height).toBe(420);
    expect(result.mode).toBe("intrinsic");
    expect(widget.position).toEqual({ x: 80, y: 90, w: 220, h: 420 });
  });
});
```

- [ ] **Step 2: Run the tests and confirm failure**

Run:

```powershell
pnpm --dir frontend test -- widget-preview-size
```

Expected: fail because `widget-preview-size.ts` does not exist yet.

- [ ] **Step 3: Implement the resolver**

Create `frontend/src/hub/preview/widget-preview-size.ts`:

```ts
import type { ProfileConfig, WidgetConfig } from "../../lib/profile";
import { enrichWidgetPropsWithVariant } from "../../lib/widget-variants";
import { getRelativeIntrinsicWidth } from "../../overlay/widgets/relative-format";

export type WidgetPreviewBaseSize = {
  width: number;
  height: number;
  mode: "declared" | "intrinsic";
};

export function resolveWidgetPreviewBaseSize(
  profile: ProfileConfig,
  widget: WidgetConfig,
): WidgetPreviewBaseSize {
  const declared = {
    width: widget.position.w,
    height: widget.position.h,
    mode: "declared" as const,
  };

  if (widget.type !== "relative") {
    return declared;
  }

  const props = enrichWidgetPropsWithVariant(profile, widget);
  const columns = props.variant?.columns ?? [];
  if (columns.length === 0) {
    return declared;
  }

  const intrinsicWidth = getRelativeIntrinsicWidth(columns);
  const width = Math.max(widget.position.w, intrinsicWidth);

  return {
    width,
    height: widget.position.h,
    mode: width > widget.position.w ? "intrinsic" : "declared",
  };
}
```

- [ ] **Step 4: Verify**

Run:

```powershell
pnpm --dir frontend test -- widget-preview-size
pnpm --dir frontend exec tsc -b
```

Expected: both pass.

---

## Task 2: Extract Pure WidgetRenderer

**Files:**

- Create: `frontend/src/hub/preview/WidgetRenderer.tsx`
- Create: `frontend/src/hub/preview/WidgetRenderer.test.tsx`
- Modify: `frontend/src/hub/preview/PreviewWidgetFrame.tsx`

- [ ] **Step 1: Inspect the current widget map**

Read `frontend/src/hub/preview/PreviewWidgetFrame.tsx` and identify the current widget imports/map. Move that map into `WidgetRenderer.tsx`; do not invent new widget ids.

- [ ] **Step 2: Write renderer tests**

Create `frontend/src/hub/preview/WidgetRenderer.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ProfileConfig, WidgetConfig } from "../../lib/profile";
import { WidgetRenderer } from "./WidgetRenderer";

function profileWith(widget: WidgetConfig): ProfileConfig {
  return {
    id: "profile-test",
    name: "Test",
    widgets: [widget],
    variants: [],
  };
}

describe("WidgetRenderer", () => {
  it("renders a known widget without layout frame chrome", () => {
    const widget: WidgetConfig = {
      id: "relative",
      type: "relative",
      title: "relative",
      enabled: true,
      updateHz: 15,
      position: { x: 300, y: 400, w: 600, h: 420 },
      props: {},
    };

    render(<WidgetRenderer profile={profileWith(widget)} widget={widget} testId="renderer" />);

    expect(screen.getByTestId("renderer")).toBeInTheDocument();
    expect(screen.getByText("RELATIVE")).toBeInTheDocument();
    expect(screen.queryByTestId("preview-widget-frame-relative")).not.toBeInTheDocument();
  });

  it("renders an unknown widget fallback", () => {
    const widget: WidgetConfig = {
      id: "unknown",
      type: "unknown-widget",
      title: "unknown",
      enabled: true,
      updateHz: 15,
      position: { x: 0, y: 0, w: 300, h: 200 },
      props: {},
    };

    render(<WidgetRenderer profile={profileWith(widget)} widget={widget} testId="renderer" />);

    expect(screen.getByTestId("renderer")).toHaveTextContent("unknown-widget");
  });
});
```

- [ ] **Step 3: Run the tests and confirm failure**

Run:

```powershell
pnpm --dir frontend test -- WidgetRenderer
```

Expected: fail because `WidgetRenderer.tsx` does not exist yet.

- [ ] **Step 4: Create `WidgetRenderer.tsx`**

Create `frontend/src/hub/preview/WidgetRenderer.tsx` by moving the existing widget imports and widget component map from `PreviewWidgetFrame.tsx`.

Use this public component shape:

```tsx
import type { CSSProperties } from "react";
import type { ProfileConfig, WidgetConfig } from "../../lib/profile";
import { enrichWidgetPropsWithVariant } from "../../lib/widget-variants";

export type WidgetTelemetryMode = "mock" | "live";

export type WidgetRendererProps = {
  profile?: ProfileConfig | null;
  widget: WidgetConfig;
  editMode?: boolean;
  telemetryMode?: WidgetTelemetryMode;
  updateHz?: number;
  disabled?: boolean;
  className?: string;
  style?: CSSProperties;
  testId?: string;
};

export function WidgetRenderer({
  profile,
  widget,
  editMode = false,
  telemetryMode = "mock",
  updateHz,
  disabled = false,
  className = "",
  style,
  testId = "widget-renderer",
}: WidgetRendererProps) {
  const Component = WIDGETS[widget.type];
  const props = enrichWidgetPropsWithVariant(profile ?? undefined, widget);

  return (
    <div
      data-testid={testId}
      className={`${disabled ? "pointer-events-none" : ""} ${className}`.trim()}
      style={style}
    >
      {Component ? (
        <Component
          editMode={editMode}
          telemetryMode={telemetryMode}
          updateHz={updateHz ?? widget.updateHz}
          props={props}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-xs text-neutral-500">
          {widget.type}
        </div>
      )}
    </div>
  );
}
```

Do not leave `WIDGETS` duplicated in both files.

- [ ] **Step 5: Refactor `PreviewWidgetFrame.tsx`**

Modify `PreviewWidgetFrame.tsx` so it imports and uses `WidgetRenderer`.

The frame remains responsible for:

- outer frame test id,
- frame size,
- overflow/frame behavior,
- edit-mode rendering context,
- existing profile-preview behavior.

The frame must not own widget type resolution after this task.

- [ ] **Step 6: Verify**

Run:

```powershell
pnpm --dir frontend test -- WidgetRenderer PreviewWidgetFrame
pnpm --dir frontend exec tsc -b
```

Expected: all pass.

---

## Task 3: Add Reusable PreviewScaler

**Files:**

- Create: `frontend/src/hub/preview/PreviewScaler.tsx`
- Create: `frontend/src/hub/preview/PreviewScaler.test.tsx`

- [ ] **Step 1: Write scaler tests**

Create `frontend/src/hub/preview/PreviewScaler.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PreviewScaler } from "./PreviewScaler";

const originalResizeObserver = globalThis.ResizeObserver;

afterEach(() => {
  globalThis.ResizeObserver = originalResizeObserver;
});

describe("PreviewScaler", () => {
  it("renders children inside a logical size box", () => {
    render(
      <div style={{ width: 800, height: 600 }}>
        <PreviewScaler logicalSize={{ width: 400, height: 200 }} testId="scaler">
          <div>content</div>
        </PreviewScaler>
      </div>,
    );

    expect(screen.getByText("content")).toBeInTheDocument();
    expect(screen.getByTestId("scaler-inner")).toHaveStyle({
      width: "400px",
      height: "200px",
    });
  });

  it("works without ResizeObserver", () => {
    globalThis.ResizeObserver = undefined as typeof ResizeObserver;

    render(
      <PreviewScaler logicalSize={{ width: 300, height: 120 }} testId="scaler">
        <div>fallback</div>
      </PreviewScaler>,
    );

    expect(screen.getByText("fallback")).toBeInTheDocument();
    expect(screen.getByTestId("scaler-inner")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests and confirm failure**

Run:

```powershell
pnpm --dir frontend test -- PreviewScaler
```

Expected: fail because `PreviewScaler.tsx` does not exist yet.

- [ ] **Step 3: Implement `PreviewScaler.tsx`**

Create `frontend/src/hub/preview/PreviewScaler.tsx`:

```tsx
import type { CSSProperties, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

export type PreviewScalerProps = {
  logicalSize: { width: number; height: number };
  padding?: number;
  maxScale?: number;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  testId?: string;
};

function calculateScale(
  container: { width: number; height: number },
  logical: { width: number; height: number },
  padding: number,
  maxScale: number,
) {
  if (container.width <= 0 || container.height <= 0 || logical.width <= 0 || logical.height <= 0) {
    return 1;
  }

  const availableWidth = Math.max(1, container.width - padding * 2);
  const availableHeight = Math.max(1, container.height - padding * 2);
  return Math.min(maxScale, availableWidth / logical.width, availableHeight / logical.height);
}

export function PreviewScaler({
  logicalSize,
  padding = 48,
  maxScale = 2,
  children,
  className = "",
  style,
  testId = "preview-scaler",
}: PreviewScalerProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const node = ref.current;
    if (!node) {
      return;
    }

    const update = () => {
      const rect = node.getBoundingClientRect();
      const next = calculateScale(
        { width: rect.width, height: rect.height },
        logicalSize,
        padding,
        maxScale,
      );
      setScale((previous) => (Math.abs(previous - next) < 0.001 ? previous : next));
    };

    update();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", update);
      return () => window.removeEventListener("resize", update);
    }

    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [logicalSize.width, logicalSize.height, maxScale, padding]);

  return (
    <div
      ref={ref}
      data-testid={testId}
      className={`relative flex h-full w-full items-center justify-center overflow-hidden ${className}`.trim()}
      style={style}
    >
      <div
        data-testid={`${testId}-inner`}
        style={{
          width: `${logicalSize.width}px`,
          height: `${logicalSize.height}px`,
          transform: `scale(${scale})`,
          transformOrigin: "center center",
        }}
      >
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verify**

Run:

```powershell
pnpm --dir frontend test -- PreviewScaler
pnpm --dir frontend exec tsc -b
```

Expected: both pass.

---

## Task 4: Create WidgetSandboxPreview

**Files:**

- Create: `frontend/src/hub/overlays/WidgetSandboxPreview.tsx`
- Create: `frontend/src/hub/overlays/WidgetSandboxPreview.test.tsx`

- [ ] **Step 1: Write sandbox tests**

Create `frontend/src/hub/overlays/WidgetSandboxPreview.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ProfileConfig, WidgetConfig } from "../../lib/profile";
import { createDefaultRelativeColumns } from "../../overlay/widgets/relative-catalog";
import { WidgetSandboxPreview } from "./WidgetSandboxPreview";

function profileWith(widget: WidgetConfig): ProfileConfig {
  return {
    id: "profile-test",
    name: "Test",
    widgets: [widget],
    variants: [],
  };
}

describe("WidgetSandboxPreview", () => {
  it("renders an empty state without an active widget", () => {
    render(<WidgetSandboxPreview profile={{ id: "p", name: "P", widgets: [], variants: [] }} activeWidget={null} />);

    expect(screen.getByTestId("widget-sandbox-preview-empty")).toBeInTheDocument();
  });

  it("renders the active widget without PreviewWidgetFrame", () => {
    const widget: WidgetConfig = {
      id: "relative",
      type: "relative",
      title: "relative",
      enabled: true,
      updateHz: 15,
      position: { x: 400, y: 500, w: 600, h: 420 },
      props: {},
    };

    render(<WidgetSandboxPreview profile={profileWith(widget)} activeWidget={widget} />);

    expect(screen.getByTestId("widget-sandbox-preview")).toBeInTheDocument();
    expect(screen.getByTestId("widget-sandbox-renderer")).toBeInTheDocument();
    expect(screen.queryByTestId("preview-widget-frame-relative")).not.toBeInTheDocument();
  });

  it("uses intrinsic relative width without mutating position", () => {
    const columns = createDefaultRelativeColumns().map((column) =>
      column.id === "bestLap" || column.id === "lastLap" ? { ...column, enabled: true } : column,
    );
    const widget: WidgetConfig = {
      id: "relative",
      type: "relative",
      title: "relative",
      enabled: true,
      updateHz: 15,
      variantId: "variant-relative",
      position: { x: 400, y: 500, w: 220, h: 420 },
      props: {},
    };
    const profile: ProfileConfig = {
      ...profileWith(widget),
      variants: [{ id: "variant-relative", widgetType: "relative", columns }],
    };

    render(<WidgetSandboxPreview profile={profile} activeWidget={widget} />);

    const inner = screen.getByTestId("widget-sandbox-scaler-inner");
    expect(parseInt(inner.style.width, 10)).toBeGreaterThan(220);
    expect(widget.position).toEqual({ x: 400, y: 500, w: 220, h: 420 });
  });
});
```

- [ ] **Step 2: Run the tests and confirm failure**

Run:

```powershell
pnpm --dir frontend test -- WidgetSandboxPreview
```

Expected: fail because `WidgetSandboxPreview.tsx` does not exist yet.

- [ ] **Step 3: Implement `WidgetSandboxPreview.tsx`**

Create `frontend/src/hub/overlays/WidgetSandboxPreview.tsx`:

```tsx
import { useEffect, useMemo, useRef, useState } from "react";
import type { ProfileConfig, WidgetConfig } from "../../lib/profile";
import { PreviewScaler } from "../preview/PreviewScaler";
import { WidgetRenderer } from "../preview/WidgetRenderer";
import { resolveWidgetPreviewBaseSize } from "../preview/widget-preview-size";

const checkerboardStyle = {
  backgroundColor: "#0b0b0d",
  backgroundImage:
    "linear-gradient(45deg, #151518 25%, transparent 25%), linear-gradient(-45deg, #151518 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #151518 75%), linear-gradient(-45deg, transparent 75%, #151518 75%)",
  backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0px",
  backgroundSize: "16px 16px",
};

type WidgetSandboxPreviewProps = {
  profile: ProfileConfig;
  activeWidget: WidgetConfig | null;
};

export function WidgetSandboxPreview({ profile, activeWidget }: WidgetSandboxPreviewProps) {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const baseSize = useMemo(() => {
    if (!activeWidget) {
      return { width: 320, height: 180, mode: "declared" as const };
    }
    return resolveWidgetPreviewBaseSize(profile, activeWidget);
  }, [activeWidget, profile]);

  const [logicalSize, setLogicalSize] = useState({ width: baseSize.width, height: baseSize.height });

  useEffect(() => {
    setLogicalSize({ width: baseSize.width, height: baseSize.height });
  }, [activeWidget?.id, baseSize.width, baseSize.height]);

  useEffect(() => {
    const node = contentRef.current;
    if (!node || !activeWidget) {
      return;
    }

    let frame = 0;
    const measure = () => {
      const rect = node.getBoundingClientRect();
      const width = Math.max(baseSize.width, Math.ceil(node.scrollWidth), Math.ceil(rect.width));
      const height = Math.max(baseSize.height, Math.ceil(node.scrollHeight), Math.ceil(rect.height));

      setLogicalSize((previous) =>
        previous.width === width && previous.height === height ? previous : { width, height },
      );
    };

    frame = window.requestAnimationFrame(measure);

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => {
        window.cancelAnimationFrame(frame);
        window.removeEventListener("resize", measure);
      };
    }

    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [activeWidget, baseSize.width, baseSize.height]);

  if (!activeWidget) {
    return (
      <div
        data-testid="widget-sandbox-preview-empty"
        className="flex h-full min-h-[360px] items-center justify-center rounded-lg border border-neutral-800 text-sm text-neutral-500"
        style={checkerboardStyle}
      >
        Selecciona un widget para previsualizarlo.
      </div>
    );
  }

  return (
    <div
      data-testid="widget-sandbox-preview"
      className="h-full min-h-[360px] rounded-lg border border-neutral-800"
      style={checkerboardStyle}
    >
      <PreviewScaler logicalSize={logicalSize} testId="widget-sandbox-scaler">
        <div
          ref={contentRef}
          data-testid="widget-sandbox-content"
          style={{
            width: `${logicalSize.width}px`,
            minHeight: `${logicalSize.height}px`,
          }}
        >
          <WidgetRenderer
            profile={profile}
            widget={activeWidget}
            editMode
            telemetryMode="mock"
            updateHz={activeWidget.updateHz}
            disabled
            testId="widget-sandbox-renderer"
          />
        </div>
      </PreviewScaler>
    </div>
  );
}
```

- [ ] **Step 4: Verify**

Run:

```powershell
pnpm --dir frontend test -- WidgetSandboxPreview widget-preview-size PreviewScaler WidgetRenderer
pnpm --dir frontend exec tsc -b
```

Expected: all pass.

---

## Task 5: Replace WidgetPreviewPanel Internals

**Files:**

- Modify: `frontend/src/hub/overlays/WidgetPreviewPanel.tsx`
- Modify: `frontend/src/hub/overlays/WidgetPreviewPanel.test.tsx`
- Modify: `frontend/src/hub/overlays/WidgetStudio.test.tsx` only if current tests intentionally reference old internals.

- [ ] **Step 1: Write or update tests for the new panel contract**

In `WidgetPreviewPanel.test.tsx`, assert:

```tsx
expect(screen.getByTestId("widget-sandbox-preview")).toBeInTheDocument();
expect(screen.queryByTestId("preview-widget-frame-relative")).not.toBeInTheDocument();
```

Keep existing tests that verify empty state and active widget selection, but update them to the sandbox test ids.

- [ ] **Step 2: Run the tests and confirm failure**

Run:

```powershell
pnpm --dir frontend test -- WidgetPreviewPanel WidgetStudio
```

Expected: fail while `WidgetPreviewPanel` still renders `PreviewWidgetFrame`.

- [ ] **Step 3: Replace internals**

Modify `frontend/src/hub/overlays/WidgetPreviewPanel.tsx` so it keeps the same public props but delegates the actual preview surface:

```tsx
import type { ProfileConfig, WidgetConfig } from "../../lib/profile";
import { WidgetSandboxPreview } from "./WidgetSandboxPreview";

type WidgetPreviewPanelProps = {
  profile: ProfileConfig;
  activeWidget: WidgetConfig | null;
};

export function WidgetPreviewPanel({ profile, activeWidget }: WidgetPreviewPanelProps) {
  return <WidgetSandboxPreview profile={profile} activeWidget={activeWidget} />;
}
```

If the existing file also owns a title/header wrapper that should remain visually visible, keep that wrapper and replace only the old preview body with `WidgetSandboxPreview`.

Remove old local helpers that calculate `renderSize` for `PreviewWidgetFrame`.

- [ ] **Step 4: Verify**

Run:

```powershell
pnpm --dir frontend test -- WidgetPreviewPanel WidgetStudio WidgetSandboxPreview
pnpm --dir frontend exec tsc -b
pnpm --dir frontend build
```

Expected: all pass.

---

## Task 6: Manual Verification Checkpoint

- [ ] **Step 1: Rebuild/reopen app from a clean frontend state**

Use the same app launch flow the user has been using. If testing a production Wails binary, rebuild the binary so the new frontend assets are embedded.

- [ ] **Step 2: Verify Relative default**

Open `Overlays Studio` -> `Widgets` -> `relative`.

Expected:

- preview is visible near the center of the checkerboard,
- not anchored to the bottom,
- not clipped,
- default five-column Relative still looks correct.

- [ ] **Step 3: Verify Relative columns**

Enable:

- `Mostrar mejor vuelta`,
- `Mostrar ultima vuelta`.

Expected:

- columns stay aligned row by row,
- names are not auto-truncated unless the truncation option is selected,
- preview widens/scales instead of clipping columns.

- [ ] **Step 4: Verify Relative filters and row height**

Test:

- `Coches delante`: `0`, `1`, `3`,
- `Coches detras`: `0`, `1`, `4`,
- `Filtro de clase`: todas / misma clase,
- `Mostrar coche del jugador`: on / off,
- `Altura de filas`: rellenar altura / reducir altura visual.

Expected:

- compact mode stays centered in the checkerboard,
- fill mode keeps using the declared widget height,
- no mode pushes the widget outside the visible preview area.

- [ ] **Step 5: Verify other widgets**

Select:

- `delta`,
- `standings`,
- `telemetry`,
- `telemetry-vertical`,
- `pedals`.

Expected:

- previews still render,
- no new clipping or offset,
- no position/size controls appear in `WidgetStudio`.

If any step fails, stop and report the exact scenario with screenshot.

---

## Task 7: Final Checks, Review, and Documentation

**Files:**

- Modify: `docs/current-plan.md`

- [ ] **Step 1: Run focused checks**

```powershell
pnpm --dir frontend test -- WidgetRenderer PreviewScaler WidgetSandboxPreview WidgetPreviewPanel WidgetStudio
pnpm --dir frontend exec tsc -b
pnpm --dir frontend build
```

Expected: all pass.

- [ ] **Step 2: Run full frontend checks**

```powershell
pnpm --dir frontend test
git diff --check
```

Expected: all pass. CRLF warnings are acceptable only if `git diff --check` exits with code `0`.

- [ ] **Step 3: Run code review**

Use the code review skill or a reviewer worker. The reviewer must verify:

- `WidgetPreviewPanel` no longer uses `PreviewWidgetFrame`.
- `PreviewWidgetFrame` still works for layout/profile previews.
- `WidgetRenderer` has no position/layout-frame responsibilities.
- `PreviewScaler` has no widget-specific logic.
- `WidgetSandboxPreview` ignores `position.x/y`.
- No backend/schema/config files were touched.
- No new dependencies were added.
- Tests are behavior-focused and not only checking fragile Tailwind class strings.
- Manual verification covered Relative fill and compact modes.

- [ ] **Step 4: Update `docs/current-plan.md`**

Only after tests, build, manual verification, and review pass:

- mark the sandbox preview refactor as implemented,
- record any remaining limitation,
- keep the `WidgetStudio` versus `LayoutStudio` separation rule visible.

Do not edit:

- `docs/marketing/01-brand-foundation.md`,
- `docs/marketing/`,
- `docs/INTEGRATION_ANALYSIS.md`,
- configs,
- backend,
- schema.

---

## Future Follow-Up: Browser Visual Regression Harness

This plan intentionally does not add a browser visual test harness in the first implementation cut. After the sandbox preview is stable, create a separate plan for a small browser-level preview harness using the existing Playwright dependency. That harness should catch clipping and offset bugs that JSDOM cannot detect.
