import { Dialog } from "@base-ui/react/dialog";
import { useEffect, useRef } from "react";
import { studioText as t } from "../../i18n/studio";
import { useStudio } from "../../screens/studio/state";
import { Button } from "../Button";
import { widgetName } from "./Widgets";
export function RemoveWidget() {
  const state = useStudio(),
    view = state.view;
  const item = view?.instances.find((item) => item.id === state.removing);
  const completed = useRef(false);
  useEffect(() => {
    if (state.removing) completed.current = false;
  }, [state.removing]);
  const disabled =
    state.pending ||
    !view ||
    !item ||
    view.state !== "ready" ||
    view.plan === "unverified" ||
    item.locked;
  return (
    <Dialog.Root
      open={!!item}
      onOpenChange={(open) => {
        if (!open && !state.pending) state.setRemoving(null);
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="v-backdrop" />
        <Dialog.Popup
          className="v-dialog v-studio-remove"
          finalFocus={() => !completed.current}
        >
          <Dialog.Title>{t.removeTitle}</Dialog.Title>
          <Dialog.Description>
            {item && view
              ? t.removeNamed(widgetName(item, view))
              : t.removeHelp}
          </Dialog.Description>
          <div>
            <Button
              disabled={state.pending}
              onClick={() => state.setRemoving(null)}
            >
              {t.cancel}
            </Button>
            <Button
              variant="danger"
              busy={state.pending}
              disabled={disabled}
              onClick={() => {
                if (!item || !view || disabled) return;
                const name = widgetName(item, view);
                const cards = Array.from(
                  document.querySelectorAll<HTMLElement>(
                    ".v-studio-grid [data-widget]",
                  ),
                );
                state.focusAfter.current = {
                  id: item.id,
                  index: Math.max(
                    0,
                    cards.findIndex((card) => card.dataset.widget === item.id),
                  ),
                };
                void state
                  .execute({
                    method: "studio.remove",
                    id: item.id,
                    baseRevision: view.revision,
                  })
                  .then((value) => {
                    completed.current = !!value;
                    if (value) {
                      state.setSelected((current) =>
                        current === item.id ? null : current,
                      );
                      state.setNotice({
                        kind: "removed",
                        name,
                        revision: value.revision,
                      });
                    } else state.focusAfter.current = undefined;
                    state.setRemoving(null);
                  });
              }}
            >
              {t.remove}
            </Button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
