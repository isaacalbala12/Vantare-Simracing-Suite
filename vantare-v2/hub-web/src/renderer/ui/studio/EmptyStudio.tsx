import { studioAddAvailable } from "../../../contract/generated/studio";
import { Icon } from "../../assets/icons/Icon";
import { studioText as t } from "../../i18n/studio";
import { Button } from "../Button";
import type { ReturnTypeOfStudioFocus } from "./StudioFocus";
import { WidgetPreview } from "./Widgets";

export function EmptyStudio({ model }: { model: ReturnTypeOfStudioFocus }) {
  const { state, blocked } = model;
  const view = state.view;
  if (view?.state !== "ready" || view.instances.length) return null;
  // The three starter cards are the approved visual order, not a new entitlement rule.
  const suggestions = (["standings", "relative", "delta"] as const).flatMap(
    (kind) => {
      const widget = view.catalog.find(
        (item) => item.kind === kind && item.allowed,
      );
      return widget ? [widget] : [];
    },
  );
  return (
    <section
      className="v-studio-empty-stage"
      aria-labelledby="studio-first-widget"
    >
      <span className="v-studio-empty-ring">
        <Icon name="plus" />
      </span>
      <h2 id="studio-first-widget">{t.firstWidget}</h2>
      <p>{t.emptyHelp}</p>
      <Button
        variant="primary"
        disabled={blocked || !studioAddAvailable}
        aria-disabled={state.pending}
        onClick={() => {
          if (!state.pending) model.setCatalogOpen(true);
        }}
      >
        <Icon name="plus" />
        {t.add}
      </Button>
      {!blocked && studioAddAvailable && suggestions.length > 0 && (
        <section className="v-studio-empty-quick" aria-label={t.quickStart}>
          <h3>{t.quickStart}</h3>
          {suggestions.map((widget) => (
            <button
              type="button"
              key={widget.kind}
              aria-label={`${t.addShort} ${widget.name}`}
              aria-disabled={state.pending}
              onClick={() => {
                if (!state.pending)
                  void state.execute({
                    method: "studio.add",
                    kind: widget.kind,
                    baseRevision: view.revision,
                  });
              }}
            >
              <WidgetPreview kind={widget.kind} small />
              <strong>{widget.name}</strong>
              <small>{widget.about}</small>
              <span>
                <Icon name="plus" />
                {t.addShort}
              </span>
            </button>
          ))}
        </section>
      )}
    </section>
  );
}
