import { studioText as t } from "../../i18n/studio";
import { useStudio } from "../../screens/studio/state";
import { Button } from "../Button";
import { Callout } from "../Data";
export function ActionNotice() {
  const state = useStudio(),
    { view, notice } = state;
  if (!view || !notice || notice.revision !== view.revision) return null;
  return (
    <Callout
      title={
        notice.kind === "removed"
          ? t.removedName(notice.name)
          : t.addedName(notice.name)
      }
      actions={
        <Button
          disabled={state.pending || !view.canUndo}
          onClick={() =>
            void state.execute({
              method: "studio.undo",
              baseRevision: view.revision,
            })
          }
        >
          {t.undo}
        </Button>
      }
    />
  );
}
