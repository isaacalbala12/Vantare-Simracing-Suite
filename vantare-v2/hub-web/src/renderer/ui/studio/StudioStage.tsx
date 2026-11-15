import { canvasText as c } from "../../i18n/studio-canvas";
import { useStudio } from "../../screens/studio/state";
import { Button } from "../Button";
import { Tooltip } from "../Layers";
import { CanvasStage } from "./CanvasStage";
import { Stage } from "./Stage";
import type { ReturnTypeOfStudioFocus } from "./StudioFocus";
import { widgetName } from "./Widgets";

export function StudioStage({ model }: { model: ReturnTypeOfStudioFocus }) {
  const state = useStudio();
  const selected = model.selected;
  const view = state.view;
  if (!selected || !view) return null;
  const switcher = (
    <Tooltip
      label={state.canvasMode ? c.close : view.canvas ? c.open : c.unavailable}
    >
      <Button
        size="sm"
        variant="ghost"
        aria-pressed={state.canvasMode}
        aria-label={state.canvasMode ? c.close : c.open}
        disabled={!state.canvasMode && !view.canvas}
        onClick={() => state.setCanvasMode(!state.canvasMode)}
      >
        {state.canvasMode ? c.widget : c.layout}
      </Button>
    </Tooltip>
  );
  return state.canvasMode ? (
    <CanvasStage
      view={view}
      selected={selected}
      onSelect={model.select}
      actions={switcher}
    />
  ) : (
    <Stage
      item={selected}
      name={widgetName(selected, view)}
      blocked={model.blocked}
      pending={state.pending}
      onShow={() => model.toggle(selected.id)}
      actions={switcher}
    />
  );
}
