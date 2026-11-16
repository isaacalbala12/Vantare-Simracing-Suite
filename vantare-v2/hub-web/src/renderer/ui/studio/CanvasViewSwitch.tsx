import { useLayoutEffect, useRef } from "react";
import { Icon } from "../../assets/icons/Icon";
import { canvasText as t } from "../../i18n/studio-canvas";
import { useStudio } from "../../screens/studio/state";
import { Button } from "../Button";

export function CanvasViewSwitch() {
  const state = useStudio();
  const widget = useRef<HTMLButtonElement>(null);
  const previous = useRef(state.canvasMode);
  useLayoutEffect(() => {
    if (previous.current && !state.canvasMode) widget.current?.focus();
    previous.current = state.canvasMode;
  }, [state.canvasMode]);
  return (
    <fieldset className="v-studio-view-switch" aria-label={t.view}>
      <Button
        ref={widget}
        size="sm"
        variant="ghost"
        aria-pressed={!state.canvasMode}
        aria-label={t.close}
        onClick={() => state.setCanvasMode(false)}
      >
        <Icon name="v-studio" />
        {t.widget}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        aria-pressed={state.canvasMode}
        aria-label={t.open}
        onClick={() => state.setCanvasMode(true)}
      >
        <Icon name="v-side" />
        {t.layout}
      </Button>
    </fieldset>
  );
}
