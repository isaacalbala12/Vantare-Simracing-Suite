import { studioText as t } from "../../i18n/studio";
import { useStudio } from "../../screens/studio/state";
import { Button } from "../Button";
export function ActionNotice() {
  const state = useStudio(),
    { view, notice } = state;
  if (!view || !notice || notice.revision !== view.revision) return null;
  return (
    <div
      className={
        state.canvasMode ? "v-canvas-accessible-help" : "v-studio-action-notice"
      }
    >
      <span role="status">
        {notice.kind === "preset"
          ? t.presetApplied(notice.name)
          : notice.kind === "removed"
            ? t.removedName(notice.name)
            : t.addedName(notice.name)}
      </span>
      {!state.canvasMode && (
        <Button
          size="sm"
          disabled={!view.canUndo}
          aria-disabled={state.pending}
          onClick={() => {
            if (!state.pending)
              void state.execute({
                method: "studio.undo",
                baseRevision: view.revision,
              });
          }}
        >
          {t.undo}
        </Button>
      )}
    </div>
  );
}
