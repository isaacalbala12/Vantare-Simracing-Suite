import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../../i18n/I18nProvider";
import type { ProfileConfig, WidgetConfig } from "../../lib/profile";
import { enrichWidgetPropsWithVariant } from "../../lib/widget-variants";
import { getRelativeFilters } from "../../overlay/widgets/relative-filters";
import type { MockSessionScenario } from "../../overlay/widgets/mock-telemetry";
import {
  applyCanonicalPreviewOverrides,
  getCanonicalPreviewMaxRows,
  getCanonicalPreviewTelemetry,
} from "../../overlay/widgets/widget-preview-fixtures";
import { PreviewScaler } from "../preview/PreviewScaler";
import { WidgetRenderer } from "../preview/WidgetRenderer";
import { getWidgetPreviewContractSize } from "../preview/widget-preview-contract";
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
  mockSessionScenario?: MockSessionScenario;
};

type LogicalSizeState = {
  widgetId: string | null;
  baseWidth: number;
  minimumHeight: number;
  width: number;
  height: number;
};

export function WidgetSandboxPreview({ profile, activeWidget, mockSessionScenario }: WidgetSandboxPreviewProps) {
  const { t } = useI18n();
  const contentRef = useRef<HTMLDivElement | null>(null);

  const isOfficialDesign = (activeWidget?.variantId ?? "").startsWith("official-");

  const previewProfile = useMemo(() => {
    if (!activeWidget || !isOfficialDesign) return profile;
    return applyCanonicalPreviewOverrides(profile, activeWidget);
  }, [profile, activeWidget, isOfficialDesign]);

  const previewWidget = useMemo(() => {
    if (!activeWidget) return null;
    if (!isOfficialDesign) return activeWidget;
    const maxRows = getCanonicalPreviewMaxRows(activeWidget.type);
    const previewProps = {
      ...activeWidget.props,
      __previewTelemetry: getCanonicalPreviewTelemetry(),
    };
    if (maxRows != null) {
      return { ...activeWidget, props: { ...previewProps, maxRows } };
    }
    return { ...activeWidget, props: previewProps };
  }, [activeWidget, isOfficialDesign]);

  const effectiveWidget = previewWidget ?? activeWidget;

  const rendererProps = useMemo(() => {
    if (!effectiveWidget) return null;
    return enrichWidgetPropsWithVariant(previewProfile, effectiveWidget);
  }, [effectiveWidget, previewProfile]);
  const baseSize = useMemo(() => {
    if (!activeWidget) {
      return { width: 320, height: 180, mode: "declared" as const };
    }
    if (isOfficialDesign) {
      return getWidgetPreviewContractSize(activeWidget.type);
    }
    return resolveWidgetPreviewBaseSize(profile, activeWidget);
  }, [activeWidget, profile, isOfficialDesign]);
  const compactRelative = activeWidget?.type === "relative"
    && getRelativeFilters(rendererProps?.variant?.filters, rendererProps ?? undefined).rowHeightMode === "compact";
  const intrinsicSizing = baseSize.mode === "intrinsic" || compactRelative;
  const minimumWidth = baseSize.width;
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
        {t("studio.selectWidgetPreview")}
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
            width: intrinsicSizing ? "fit-content" : `${logicalSize.width}px`,
            minHeight: compactRelative ? undefined : `${logicalSize.height}px`,
          }}
        >
          <WidgetRenderer
            profile={previewProfile}
            widget={effectiveWidget!}
            editMode
            telemetryMode="mock"
            mockSessionScenario={mockSessionScenario}
            updateHz={activeWidget.updateHz}
            disabled
            fillHost={!intrinsicSizing}
            testId="widget-sandbox-renderer"
          />
        </div>
      </PreviewScaler>
    </div>
  );
}
