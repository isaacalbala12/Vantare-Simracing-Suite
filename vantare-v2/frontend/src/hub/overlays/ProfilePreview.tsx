import { useEffect, useRef, useState } from "react";
import type { ProfileConfig } from "../../lib/profile";
import { PreviewWidgetFrame } from "../preview/PreviewWidgetFrame";

type ProfilePreviewProps = {
  profile: ProfileConfig;
};

const LOGICAL_WIDTH = 1920;
const LOGICAL_HEIGHT = 1080;

export function ProfilePreview({ profile }: ProfilePreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [previewWidth, setPreviewWidth] = useState(360);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setPreviewWidth(entry.contentBoxSize?.[0]?.inlineSize ?? entry.contentRect.width);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const scale = Math.min(previewWidth / LOGICAL_WIDTH, 1);

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
        {profile.widgets.map((widget) => (
          <PreviewWidgetFrame
            key={widget.id}
            widget={widget}
            selected={false}
            scale={scale}
            onSelect={() => undefined}
            disabled
          />
        ))}
      </div>
    </div>
  );
}
