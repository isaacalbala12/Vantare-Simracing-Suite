import { useUi } from "../../app/UiState";
import { studioText as t } from "../../i18n/studio";
import { useStudioFocus } from "../../screens/studio/focus";
import { Button } from "../Button";
import { Callout, Skeleton } from "../Data";
import { ActionNotice } from "./ActionNotice";
import { CatalogDialog } from "./CatalogDialog";
import { EmptyStudio } from "./EmptyStudio";
import { FocusHeader } from "./FocusHeader";
import { LayoutStrip } from "./LayoutStrip";
import { RemoveWidget } from "./RemoveWidget";
import { Stage } from "./Stage";
import { LoadingStudio, ReadonlyStudio, StudioFeedback } from "./StudioStates";
import { StudioSteps as StudioInspector } from "./StudioSteps";
import { widgetName } from "./Widgets";
import "./focus.css";
import "./studio-states.css";

export type ReturnTypeOfStudioFocus = ReturnType<typeof useStudioFocus>;
export function StudioFocus() {
  const model = useStudioFocus();
  const { state, selected, catalogOpen } = model;
  const view = state.view;
  const navigate = useUi((value) => value.navigate);
  return (
    <div className="v-studio-focus">
      <div
        className="v-studio-focus-layout"
        data-missing={view?.state === "missing"}
        data-state={view?.state ?? "loading"}
        ref={model.root}
      >
        <RemoveWidget />
        <CatalogDialog
          open={catalogOpen}
          onOpenChange={model.setCatalogOpen}
          onPlans={() => navigate("account")}
        />
        {view?.state !== "missing" && <LayoutStrip model={model} />}
        <div className="v-focus-column">
          {view ? (
            <FocusHeader
              item={selected}
              view={view}
              pending={state.pending}
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
          ) : (
            <Skeleton label={t.loading} />
          )}
          <StudioFeedback model={model} />
          {view?.state === "missing" ? (
            <div className="v-studio-unavailable">
              <Callout title={t.missing}>{t.missingHelp}</Callout>
            </div>
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
              <Stage
                item={selected}
                name={widgetName(selected, view)}
                blocked={model.blocked}
                pending={state.pending}
                onShow={() => model.toggle(selected.id)}
              />
            </>
          ) : view?.state === "protected" ? (
            <ReadonlyStudio />
          ) : view ? (
            <EmptyStudio model={model} />
          ) : (
            <LoadingStudio />
          )}
          <ActionNotice />
          {view && view.state !== "missing" && selected && (
            <div className="v-studio-temporary" aria-busy={state.pending}>
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
