import { studioDropText as t } from "../../i18n/studio-drop";
import type { DropVisual } from "../../screens/studio/catalog-inputs";
import { WidgetThumb } from "./Widgets";

export function CatalogGhost({
  visual,
  name,
}: {
  visual: DropVisual;
  name: string;
}) {
  const { preview, pointer } = visual;
  return (
    <div
      className="v-canvas-drop-follower"
      data-valid={!!preview}
      style={{
        left: `clamp(8px, ${pointer[0] + 14}px, calc(100vw - 220px))`,
        top: `clamp(8px, ${pointer[1] + 14}px, calc(100vh - 112px))`,
      }}
      aria-hidden="true"
    >
      <span>
        <WidgetThumb kind={visual.kind} />
      </span>
      <strong>{name}</strong>
      <small>{preview ? t.release : t.outside}</small>
    </div>
  );
}
