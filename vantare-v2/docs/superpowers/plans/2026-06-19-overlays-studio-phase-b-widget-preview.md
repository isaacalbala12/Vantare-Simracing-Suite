# Overlays Studio Phase B: Widget Preview Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the text placeholder in the Widget Editor with a real, auto-scaled, and centered widget preview using mock telemetry data and a checkerboard background.

**Architecture:** The preview panel will render the existing `PreviewWidgetFrame` but force it into an isolated mode (`editMode=true`, `telemetryMode="mock"`). To maintain relative sizes without pixelation or overflow, the container will use a `ResizeObserver` to calculate a CSS `transform: scale()` that makes the widget fit perfectly regardless of its original absolute `w` and `h` dimensions.

**Tech Stack:** React 19, TypeScript, Vitest + Testing Library, Tailwind CSS v4.

---

### Task 1: Add Isolated Widget Preview

**Files:**
- Modify: `frontend/src/hub/overlays/WidgetPreviewPanel.test.tsx` (create if doesn't exist)
- Modify: `frontend/src/hub/overlays/WidgetPreviewPanel.tsx`

**Step 1: Write the failing test**

*(If `WidgetPreviewPanel.test.tsx` doesn't exist, create it. If it does, replace/add this test).*

```tsx
import { render, screen, cleanup } from "@testing-library/react";
import { describe, expect, it, afterEach } from "vitest";
import { WidgetPreviewPanel } from "./WidgetPreviewPanel";
import type { WidgetConfig } from "../../lib/profile";

afterEach(() => {
  cleanup();
});

const mockWidget: WidgetConfig = {
  id: "test-widget",
  type: "delta",
  enabled: true,
  updateHz: 30,
  position: { x: 0, y: 0, w: 400, h: 100 },
};

describe("WidgetPreviewPanel", () => {
  it("renders a real widget frame with mock telemetry and checkerboard background", () => {
    render(<WidgetPreviewPanel activeWidget={mockWidget} />);

    // Check that the preview frame is rendered (using the testid from PreviewWidgetFrame)
    expect(screen.getByTestId("preview-widget-frame-test-widget")).toBeTruthy();

    // Check that the old placeholder text is gone
    expect(screen.queryByText(/Preview compacto de configuración/i)).toBeNull();
    
    // Check that checkerboard background class is applied
    const container = screen.getByTestId("widget-preview-container");
    expect(container.style.backgroundImage).toContain("linear-gradient");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --dir frontend test -- WidgetPreviewPanel.test.tsx`
Expected: FAIL because `WidgetPreviewPanel` still renders the placeholder text and doesn't use `PreviewWidgetFrame`.

**Step 3: Write minimal implementation**

Modify `frontend/src/hub/overlays/WidgetPreviewPanel.tsx`:

```tsx
import { useEffect, useRef, useState } from "react";
import type { WidgetConfig } from "../../lib/profile";
import { PreviewWidgetFrame } from "../preview/PreviewWidgetFrame";

type WidgetPreviewPanelProps = {
  activeWidget: WidgetConfig | null;
};

export function WidgetPreviewPanel({ activeWidget }: WidgetPreviewPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  // Auto-fit calculation
  useEffect(() => {
    if (!activeWidget || !containerRef.current) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width: containerW, height: containerH } = entry.contentRect;
        // Leave a 60px padding safety margin
        const safeW = Math.max(1, containerW - 60);
        const safeH = Math.max(1, containerH - 60);
        
        const scaleW = safeW / Math.max(1, activeWidget.position.w);
        const scaleH = safeH / Math.max(1, activeWidget.position.h);
        
        // Use the smallest scale to fit, but cap it at 3x to avoid gigantic widgets
        const fitScale = Math.min(scaleW, scaleH, 3);
        setScale(fitScale);
      }
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [activeWidget]);

  if (!activeWidget) {
    return (
      <div className="flex h-full flex-col items-center justify-center rounded-xl border border-dashed border-white/10 bg-black/40">
        <span className="text-sm font-medium text-vantare-textMuted">
          Selecciona un widget para editar su apariencia
        </span>
      </div>
    );
  }

  // Checkerboard pattern for high contrast against white/black widgets
  const bgStyle = {
    backgroundImage: "linear-gradient(45deg, #18181b 25%, transparent 25%), linear-gradient(-45deg, #18181b 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #18181b 75%), linear-gradient(-45deg, transparent 75%, #18181b 75%)",
    backgroundSize: "20px 20px",
    backgroundPosition: "0 0, 0 10px, 10px -10px, -10px 0px",
    backgroundColor: "#09090b"
  };

  return (
    <div 
      ref={containerRef}
      data-testid="widget-preview-container"
      className="relative flex h-full items-center justify-center overflow-hidden rounded-xl border border-white/10"
      style={bgStyle}
    >
      <div 
        className="relative transition-transform duration-100 ease-out"
        style={{
          width: activeWidget.position.w,
          height: activeWidget.position.h,
          transform: `scale(${scale})`,
          transformOrigin: "center center",
        }}
      >
        {/* We reuse the PreviewWidgetFrame but suppress its absolute positioning via wrapper isolation */}
        <div className="absolute inset-0 [&>div]:!relative [&>div]:!top-0 [&>div]:!left-0 [&>div]:!border-0">
          <PreviewWidgetFrame
            widget={activeWidget}
            selected={false}
            scale={1}
            disabled={true}
            onSelect={() => {}}
          />
        </div>
      </div>
    </div>
  );
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm --dir frontend test -- WidgetPreviewPanel.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add frontend/src/hub/overlays/WidgetPreviewPanel.test.tsx frontend/src/hub/overlays/WidgetPreviewPanel.tsx
git commit -m "feat(hub): add isolated widget preview with auto-scale and mock telemetry"
```
