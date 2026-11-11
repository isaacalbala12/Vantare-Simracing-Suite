import { Dialog } from "@base-ui/react/dialog";
import { studioText as t } from "../../i18n/studio";
import { useStudio } from "../../screens/studio/state";
import { Button } from "../Button";
import { widgetName } from "./Widgets";
export function RemoveWidget() {
  const state = useStudio(),
    view = state.view;
  const item = view?.instances.find((item) => item.id === state.removing);
  if (!view || !item) return null;
  return (
    <Dialog.Root
      open={!!item}
      onOpenChange={(open) => {
        if (!state.pending) state.setRemoving(open ? state.removing : null);
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="v-backdrop" />
        <Dialog.Popup className="v-studio-remove">
          <Dialog.Title>{t.removeTitle}</Dialog.Title>
          <Dialog.Description>
            {t.removeNamed(widgetName(item, view))}
          </Dialog.Description>
          {state.failure && <p role="alert">{state.failure.message}</p>}
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
              onClick={() => {
                state.setRemoving(null);
                void state
                  .execute({
                    method: "studio.remove",
                    id: item.id,
                    baseRevision: view.revision,
                  })
                  .then((value) => {
                    if (value) state.setSelected(null);
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
