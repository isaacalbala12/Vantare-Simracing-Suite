import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { ProfileConfig } from "../../lib/profile";
import { buildMockTelemetry } from "../../overlay/core/mock-scenarios";
import type { ProfileDocumentV3 } from "../../overlay/core/profile-document";
import { WidgetVisualHost } from "../../overlay/core/WidgetVisualHost";
import { WidgetVisualViewport } from "../../overlay/core/WidgetVisualViewport";
import { resolveProfilePreviewDocument } from "./profile-preview-document";

const MemoWidgetVisualHost = memo(WidgetVisualHost);

const LOGICAL_WIDTH = 1920;
const LOGICAL_HEIGHT = 1080;

const PREVIEW_SNAPSHOT = buildMockTelemetry({
  session: "race",
  location: "track",
  state: "ready",
});

type ProfilePreviewProps = {
  profile?: ProfileConfig | null;
  previewDocument?: ProfileDocumentV3 | null;
};

export function ProfilePreview({ profile, previewDocument }: ProfilePreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [previewWidth, setPreviewWidth] = useState(360);
  const document = useMemo(
    () => resolveProfilePreviewDocument(profile, previewDocument),
    [profile, previewDocument],
  );
  const widgets = document?.layouts.general.widgets ?? [];

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateWidth = () => {
      setPreviewWidth(el.clientWidth || 360);
    };
    updateWidth();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateWidth);
      return () => window.removeEventListener("resize", updateWidth);
    }

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setPreviewWidth(entry.contentBoxSize?.[0]?.inlineSize ?? entry.contentRect.width);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const scale = Math.min(previewWidth / LOGICAL_WIDTH, 1);

  if (!document) {
    return (
      <div
        data-testid="profile-preview"
        className="flex aspect-video items-center justify-center rounded-lg border border-white/10 bg-black/45 text-xs text-vantare-textMuted"
      >
        Preview no disponible
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      data-testid="profile-preview"
      className="relative overflow-hidden rounded-lg border border-white/10 bg-black/45"
      style={{ aspectRatio: `${LOGICAL_WIDTH} / ${LOGICAL_HEIGHT}` }}
    >
      <div
        className="absolute left-0 top-0"
        style={{
          width: LOGICAL_WIDTH,
          height: LOGICAL_HEIGHT,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
      >
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px)",
            backgroundSize: "80px 80px",
          }}
        />
        {widgets.map((widget) => {
          const { x, y, w, h, zIndex } = widget.layout;

          return (
            <div
              key={widget.id}
              data-testid={`profile-preview-frame-${widget.id}`}
              className={`absolute overflow-hidden ${widget.behavior.enabled ? "" : "opacity-45 grayscale"}`}
              style={{
                left: x,
                top: y,
                width: w,
                height: h,
                zIndex,
                pointerEvents: "none",
              }}
            >
              <WidgetVisualViewport
                widgetType={widget.type}
                layout={widget.layout}
                testId={`profile-preview-viewport-${widget.id}`}
              >
                <MemoWidgetVisualHost
                  widget={widget}
                  snapshot={PREVIEW_SNAPSHOT}
                  renderMode="harness"
                />
              </WidgetVisualViewport>
            </div>
          );
        })}
      </div>
    </div>
  );
}
