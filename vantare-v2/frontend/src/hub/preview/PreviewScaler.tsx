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
  maxScale = 1,
  children,
  className = "",
  style,
  testId = "preview-scaler",
}: PreviewScalerProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  const logicalWidth = logicalSize.width;
  const logicalHeight = logicalSize.height;

  useEffect(() => {
    const node = ref.current;
    if (!node) {
      return;
    }

    const update = () => {
      const rect = node.getBoundingClientRect();
      const next = calculateScale(
        { width: rect.width, height: rect.height },
        { width: logicalWidth, height: logicalHeight },
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
  }, [logicalWidth, logicalHeight, maxScale, padding]);

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
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transform: `scale(${scale})`,
          transformOrigin: "center center",
        }}
      >
        {children}
      </div>
    </div>
  );
}
