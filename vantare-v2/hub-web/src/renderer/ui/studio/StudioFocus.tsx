import { useUi } from "../../app/UiState";
import { studioText as t } from "../../i18n/studio";
import { useStudioFocus } from "../../screens/studio/focus";
import { Button } from "../Button";
import { Callout, Skeleton } from "../Data";
import { ActionNotice } from "./ActionNotice";
import { CatalogDialog } from "./CatalogDialog";
import { FocusHeader } from "./FocusHeader";
import { LayoutStrip } from "./LayoutStrip";
import { RemoveWidget } from "./RemoveWidget";
import { Stage } from "./Stage";
import { StudioSteps as StudioInspector } from "./StudioSteps";
import { widgetName } from "./Widgets";
import "./focus.css";

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
          {state.failure && (
            <Callout
              tone="err"
              title={state.failure.message}
              actions={
                <>
                  {state.canRetry ? (
                    <Button
                      aria-disabled={state.pending}
                      onClick={() => {
                        if (!state.pending) state.retry();
                      }}
                    >
                      {t.retry}
                    </Button>
                  ) : (
                    <span>{t.reconfirm}</span>
                  )}
                  <Button
                    aria-disabled={state.pending}
                    onClick={() => {
                      if (!state.pending) state.discard();
                    }}
                  >
                    {t.discard}
                  </Button>
                </>
              }
            />
          )}
          {view?.state === "protected" && (
            <Callout
              tone="warn"
              title={t.protected}
              actions={
                <Button
                  onClick={() => void state.execute({ method: "studio.get" })}
                >
                  {t.reload}
                </Button>
              }
            />
          )}
          {view?.state === "missing" ? (
            <Callout title={t.missing}>{t.missingHelp}</Callout>
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
            <section className="v-focus-empty">
              <p>{t.appearanceUnavailable}</p>
            </section>
          ) : view ? (
            <section className="v-focus-empty">
              <strong>{t.empty}</strong>
              <p>{t.emptyHelp}</p>
              <Button
                variant="primary"
                disabled={model.blocked}
                onClick={() => model.setCatalogOpen(true)}
              >
                {t.add}
              </Button>
            </section>
          ) : (
            <Skeleton label={t.loading} />
          )}
          <ActionNotice />
          {view && view.state !== "missing" && (
            <div className="v-studio-temporary">
              {selected &&
                (view.state === "protected" ? (
                  <p>{t.appearanceUnavailable}</p>
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
