import { useEffect } from "react";
import { useUi } from "../../app/UiState";
import { studioText as t } from "../../i18n/studio";
import { canvasText } from "../../i18n/studio-canvas";
import { useStudioFocus } from "../../screens/studio/focus";
import { Button } from "../Button";
import { Callout } from "../Data";
import { ActionNotice } from "./ActionNotice";
import { CanvasStage } from "./CanvasStage";
import { CatalogDialog } from "./CatalogDialog";
import { EmptyCanvas } from "./EmptyCanvas";
import { EmptyStudio } from "./EmptyStudio";
import { FocusHeader } from "./FocusHeader";
import { LayoutStrip } from "./LayoutStrip";
import { RemoveWidget } from "./RemoveWidget";
import { StudioStage } from "./StudioStage";
import { LoadingStudio, ReadonlyStudio, StudioFeedback } from "./StudioStates";
import { StudioSteps as StudioInspector } from "./StudioSteps";
import "./focus.css";
import "./studio-states.css";

export type ReturnTypeOfStudioFocus = ReturnType<typeof useStudioFocus>;
export function StudioFocus() {
  const model = useStudioFocus();
  const { state, selected, catalogOpen } = model;
  const view = state.view;
  const hasConservedWidgets =
    view?.instances.some(
      (item) => !view.catalog.some((widget) => widget.kind === item.kind),
    ) ?? false;
  const unavailableCanvas =
    state.canvasMode &&
    (view?.state === "monitorUnavailable" ||
      (view?.monitor === null &&
        (view.state === "protected" || view.state === "missing")));
  const navigate = useUi((value) => value.navigate);
  const canvasSidebar = useUi((value) => value.canvasSidebar);
  const listCollapsed = useUi((value) => value.studioListCollapsed);
  useEffect(() => {
    if (!state.canvasMode) return;
    canvasSidebar(true);
    return () => canvasSidebar(false);
  }, [state.canvasMode, canvasSidebar]);
  return (
    <div className="v-studio-focus">
      <div
        className="v-studio-focus-layout"
        data-missing={view?.state === "missing"}
        data-state={view?.state ?? (state.failure ? "error" : "loading")}
        data-view={state.canvasMode ? "canvas" : "widget"}
        data-list-collapsed={state.canvasMode && listCollapsed}
        ref={model.root}
      >
        <RemoveWidget />
        {!state.canvasMode && (
          <CatalogDialog
            open={catalogOpen}
            onOpenChange={model.setCatalogOpen}
            onPlans={() => navigate("account")}
          />
        )}
        {view?.state !== "missing" && <LayoutStrip model={model} />}
        <div className="v-focus-column">
          {view ? (
            <FocusHeader
              item={selected}
              view={view}
              pending={state.pending}
              readOnly={model.canvasReadOnly}
              onRemove={() => {
                if (selected) state.setRemoving(selected.id);
              }}
              onTrack={() =>
                void state.execute({
                  method: "studio.track",
                  show: !view.showing,
                })
              }
            />
          ) : !state.failure ? (
            <span className="v-skeleton" aria-hidden="true" />
          ) : null}
          {!unavailableCanvas && (
            <StudioFeedback
              model={model}
              hasConservedWidgets={hasConservedWidgets}
            />
          )}
          {state.canvasMode && view ? (
            selected || (view.state === "ready" && view.canvas) ? (
              <CanvasStage
                view={view}
                selected={selected}
                onSelect={model.select}
                catalogOpen={catalogOpen}
                onCatalogOpenChange={model.setCatalogOpen}
                actions={
                  <Button
                    size="sm"
                    variant="neutral"
                    onClick={() => state.setCanvasMode(false)}
                  >
                    {canvasText.done}
                  </Button>
                }
              />
            ) : (
              <EmptyCanvas model={model} />
            )
          ) : view?.state === "missing" ? (
            <section
              className="v-studio-unavailable"
              aria-label={t.missing}
              tabIndex={-1}
            >
              <Callout title={t.missing}>{t.missingHelp}</Callout>
            </section>
          ) : selected && view ? (
            <>
              {(selected.locked || view.plan === "unverified") && (
                <Callout
                  title={
                    view.plan === "unverified" ? t.verifyWidget : t.lockedWidget
                  }
                  actions={
                    <Button onClick={() => navigate("account")}>
                      {t.plans}
                    </Button>
                  }
                />
              )}
              <StudioStage model={model} />
            </>
          ) : view?.state === "protected" ? (
            <ReadonlyStudio />
          ) : view ? (
            <EmptyStudio model={model} />
          ) : !state.failure ? (
            <LoadingStudio />
          ) : null}
          {view?.state === "ready" && <ActionNotice />}
          {view && view.state !== "missing" && selected && (
            <div
              className="v-studio-temporary"
              aria-busy={state.pending}
              hidden={state.canvasMode}
              inert={state.canvasMode || undefined}
            >
              {selected &&
                (view.state === "protected" ? (
                  <ReadonlyStudio>
                    <StudioInspector item={selected} readOnly />
                  </ReadonlyStudio>
                ) : (
                  <StudioInspector item={selected} />
                ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
