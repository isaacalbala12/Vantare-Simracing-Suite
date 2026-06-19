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
