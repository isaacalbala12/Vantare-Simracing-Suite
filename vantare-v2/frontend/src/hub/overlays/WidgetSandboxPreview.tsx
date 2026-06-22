import { useEffect, useMemo, useRef, useState } from "react";
import type { ProfileConfig, WidgetConfig } from "../../lib/profile";
import { enrichWidgetPropsWithVariant } from "../../lib/widget-variants";
import { getRelativeFilters } from "../../overlay/widgets/relative-filters";
import { PreviewScaler } from "../preview/PreviewScaler";
import { WidgetRenderer } from "../preview/WidgetRenderer";
import { resolveWidgetPreviewBaseSize } from "../preview/widget-preview-size";

const checkerboardStyle = {
  backgroundColor: "#0b0b0d",
  backgroundImage:
    "linear-gradient(45deg, #151518 25%, transparent 25%), linear-gradient(-45deg, #151518 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #151518 75%), linear-gradient(-45deg, transparent 75%, #151518 75%)",
  backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0px",
  backgroundSize: "16px 16px",
} as const;

type WidgetSandboxPreviewProps = {
  profile: ProfileConfig;
  activeWidget: WidgetConfig | null;
};

type LogicalSizeState = {
  widgetId: string | null;
  baseWidth: number;
  minimumHeight: number;
  width: number;
  height: number;
};

export function WidgetSandboxPreview({ profile, activeWidget }: WidgetSandboxPreviewProps) {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const rendererProps = useMemo(() => {
    if (!activeWidget) return null;
    return enrichWidgetPropsWithVariant(profile, activeWidget);
  }, [activeWidget, profile]);
  const baseSize = useMemo(() => {
    if (!activeWidget) {
      return { width: 320, height: 180, mode: "declared" as const };
    }
    return resolveWidgetPreviewBaseSize(profile, activeWidget);
  }, [activeWidget, profile]);
  const compactRelative = activeWidget?.type === "relative"
    && getRelativeFilters(rendererProps?.variant?.filters, rendererProps ?? undefined).rowHeightMode === "compact";
  const minimumWidth = compactRelative ? 1 : baseSize.width;
  const minimumHeight = compactRelative ? 1 : baseSize.height;
  const widgetId = activeWidget?.id ?? null;

  const [measuredSize, setMeasuredSize] = useState<LogicalSizeState>({
    widgetId,
    baseWidth: minimumWidth,
    minimumHeight,
    width: minimumWidth,
    height: minimumHeight,
  });
  const logicalSize = measuredSize.widgetId === widgetId
    && measuredSize.baseWidth === minimumWidth
    && measuredSize.minimumHeight === minimumHeight
    ? { width: measuredSize.width, height: measuredSize.height }
    : { width: minimumWidth, height: minimumHeight };

  useEffect(() => {
    const node = contentRef.current;
    if (!node || !activeWidget) {
      return;
    }

    let frame = 0;
    const measure = () => {
      const rect = node.getBoundingClientRect();
      const width = Math.max(minimumWidth, Math.ceil(node.scrollWidth), Math.ceil(rect.width));
      const measuredHeight = Math.max(Math.ceil(node.scrollHeight), Math.ceil(rect.height));
      const height = Math.max(minimumHeight, measuredHeight);

      setMeasuredSize((previous) =>
        previous.widgetId === widgetId
          && previous.baseWidth === minimumWidth
          && previous.minimumHeight === minimumHeight
          && previous.width === width
          && previous.height === height
          ? previous
          : { widgetId, baseWidth: minimumWidth, minimumHeight, width, height },
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
  }, [activeWidget, minimumWidth, minimumHeight, widgetId]);

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
            width: compactRelative ? "fit-content" : `${logicalSize.width}px`,
            minHeight: compactRelative ? undefined : `${logicalSize.height}px`,
          }}
        >
          <WidgetRenderer
            profile={profile}
            widget={activeWidget}
            editMode
            telemetryMode="mock"
            updateHz={activeWidget.updateHz}
            disabled
            fillHost={!compactRelative}
            testId="widget-sandbox-renderer"
          />
        </div>
      </PreviewScaler>
    </div>
  );
}
