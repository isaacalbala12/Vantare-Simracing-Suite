import type { SnapGuide } from "./canvas-snap";

export type CanvasGuidesProps = {
  guides: readonly SnapGuide[];
};

export function CanvasGuides({ guides }: CanvasGuidesProps): React.ReactElement | null {
  if (guides.length === 0) {
    return null;
  }

  return (
    <div data-testid="studio-canvas-guides" className="osv3-canvas-guides" aria-hidden="true">
      {guides.map((guide, index) => (
        <div
          key={`${guide.orientation}-${guide.position}-${guide.kind}-${index}`}
          data-testid={`studio-canvas-guide-${guide.orientation}`}
          data-guide-kind={guide.kind}
          className={
            guide.orientation === "vertical"
              ? "osv3-canvas-guide osv3-canvas-guide--vertical"
              : "osv3-canvas-guide osv3-canvas-guide--horizontal"
          }
          style={
            guide.orientation === "vertical"
              ? { left: `${guide.position}px` }
              : { top: `${guide.position}px` }
          }
        />
      ))}
    </div>
  );
}