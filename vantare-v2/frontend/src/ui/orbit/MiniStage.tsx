import { useEffect, useRef, useState, type ReactNode } from "react";
import { MINI_STAGE_HEIGHT, MINI_STAGE_WIDTH, type WidgetDoc } from "./viz-types";

export interface MiniStageProps {
  widgets: WidgetDoc[];
  system: "crystal" | "original" | "endurance";
  /**
   * Pinta el widget real del sistema V3 (`WidgetVisualHost` en modo preview).
   * El kit no conoce el registro de widgets: quien monta el `MiniStage` inyecta
   * el render. Sin él se dibuja un marco rotulado con el nombre del widget.
   */
  renderWidget?(doc: WidgetDoc): ReactNode;
  className?: string;
}

/**
 * Mini-lienzo (`04 · .mini-stage`): `aspect-ratio 16/9`, `container-type:
 * inline-size`, rejilla `6.25cqw` y widgets sin interacción.
 */
export function MiniStage({ widgets, system, renderWidget, className }: MiniStageProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const update = () => setWidth(node.clientWidth);
    update();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", update);
      return () => window.removeEventListener("resize", update);
    }
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const scale = width > 0 ? width / MINI_STAGE_WIDTH : 0;

  return (
    <div
      aria-hidden="true"
      className={["orbit-mini-stage", className].filter(Boolean).join(" ")}
      data-system={system}
      data-testid="orbit-mini-stage"
      ref={ref}
    >
      <div
        className="orbit-mini-stage__plane"
        style={{
          width: MINI_STAGE_WIDTH,
          height: MINI_STAGE_HEIGHT,
          transform: `scale(${scale})`,
        }}
      >
        {widgets.map((doc) => (
          <div
            className="orbit-mini-stage__widget"
            data-hidden={doc.hidden || doc.state === "oculto" ? "true" : undefined}
            data-widget={doc.id}
            key={doc.id}
            style={{ left: doc.x, top: doc.y, width: doc.w, height: doc.h }}
          >
            {renderWidget ? (
              renderWidget(doc)
            ) : (
              <span className="orbit-mini-stage__ghost">{doc.name}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
