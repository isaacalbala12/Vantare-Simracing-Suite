import { canvasText as t } from "../../i18n/studio-canvas";
import { Stage } from "./Stage";
import type { ReturnTypeOfStudioFocus } from "./StudioFocus";
import { widgetName } from "./Widgets";

export function StudioStage({ model }: { model: ReturnTypeOfStudioFocus }) {
  const { state, selected } = model;
  const view = state.view;
  if (!selected || !view) return null;
  const canvas = view.canvas;
  return (
    <Stage
      view={view}
      item={selected}
      name={widgetName(selected, view)}
      blocked={model.blocked}
      pending={state.pending}
      onShow={() => model.toggle(selected.id)}
      canvasPreview={
        canvas && (
          <button
            type="button"
            className="v-studio-minimap"
            aria-label={t.openMini}
            onClick={() => state.setCanvasMode(true)}
          >
            {view.instances.map((item) => (
              <i
                key={item.id}
                data-selected={item.id === selected.id}
                style={{
                  left: `${(item.x / canvas.width) * 100}%`,
                  top: `${(item.y / canvas.height) * 100}%`,
                  width: `${(item.size.width / canvas.width) * 100}%`,
                  height: `${(item.size.height / canvas.height) * 100}%`,
                }}
              />
            ))}
            <span>{`${t.layout} ↗`}</span>
          </button>
        )
      }
    />
  );
}
