import type { SessionLayoutType, WidgetInstanceV3, WidgetVisibilityV3 } from "../../../overlay/core/profile-document";
import type { TelemetrySnapshot } from "../../../overlay/core/telemetry-snapshot";
import { isWidgetVisibleV3 } from "../../../overlay/core/widget-visibility";
import type { StudioCommand } from "../state/studio-command";

const UPDATE_HZ_PRESETS = [5, 10, 15, 30, 60] as const;
const SESSION_TYPE_OPTIONS = ["practice", "qualifying", "race", "warmup", "endurance"] as const;

export type BehaviorSectionProps = {
  widget: WidgetInstanceV3;
  session: SessionLayoutType;
  snapshot: TelemetrySnapshot;
  dispatch(command: StudioCommand): void;
};

function patchBehavior(
  widget: WidgetInstanceV3,
  session: SessionLayoutType,
  patch: Partial<WidgetInstanceV3["behavior"]>,
  dispatch: BehaviorSectionProps["dispatch"],
): void {
  dispatch({
    type: "widget/behavior",
    session,
    widgetIds: [widget.id],
    patch,
  });
}

export function BehaviorSection(props: BehaviorSectionProps): React.ReactElement {
  const { widget, session, snapshot, dispatch } = props;
  const runtimeVisible = isWidgetVisibleV3(widget, snapshot);

  return (
    <div
      data-testid="studio-inspector-section-behavior"
      data-widget-id={widget.id}
      data-runtime-visible={runtimeVisible ? "true" : "false"}
    >
      <div className="osv3-inspector-field-group" data-testid="studio-behavior-update-hz">
        <span className="osv3-inspector-field__label">Frecuencia</span>
        <div className="osv3-inspector-preset-row">
          {UPDATE_HZ_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              data-testid={`studio-behavior-hz-${preset}`}
              className={widget.behavior.updateHz === preset ? "is-active" : undefined}
              onClick={() => patchBehavior(widget, session, { updateHz: preset }, dispatch)}
            >
              {preset}
            </button>
          ))}
        </div>
        <label className="osv3-inspector-field">
          <span className="osv3-inspector-field__label">Hz avanzado</span>
          <input
            type="number"
            min={1}
            max={240}
            data-testid="studio-behavior-hz-advanced"
            value={widget.behavior.updateHz}
            onChange={(event) => {
              const next = Number.parseInt(event.target.value, 10);
              if (!Number.isFinite(next) || next < 1 || next > 240) {
                return;
              }
              patchBehavior(widget, session, { updateHz: next }, dispatch);
            }}
          />
        </label>
      </div>

      <div data-testid="studio-behavior-conditional-controls">
        <label className="osv3-inspector-field">
          <span className="osv3-inspector-field__label">Visible en boxes</span>
          <select
            data-testid="studio-behavior-in-pit"
            value={
              widget.behavior.visibleWhen?.inPit === undefined
                ? "any"
                : widget.behavior.visibleWhen.inPit
                  ? "in-pit"
                  : "on-track"
            }
            onChange={(event) => {
              const nextVisibleWhen: WidgetVisibilityV3 = {
                ...widget.behavior.visibleWhen,
              };
              if (event.target.value === "any") {
                delete nextVisibleWhen.inPit;
              } else {
                nextVisibleWhen.inPit = event.target.value === "in-pit";
              }
              patchBehavior(widget, session, { visibleWhen: nextVisibleWhen }, dispatch);
            }}
          >
            <option value="any">Siempre</option>
            <option value="in-pit">Solo en boxes</option>
            <option value="on-track">Solo en pista</option>
          </select>
        </label>

        <fieldset className="osv3-inspector-field" data-testid="studio-behavior-session-types">
          <legend>Sesiones visibles</legend>
          {SESSION_TYPE_OPTIONS.map((sessionType) => {
            const selected = widget.behavior.visibleWhen?.sessionTypes?.includes(sessionType) ?? false;
            return (
              <label key={sessionType}>
                <input
                  type="checkbox"
                  data-testid={`studio-behavior-session-${sessionType}`}
                  checked={selected}
                  onChange={(event) => {
                    const current = new Set(widget.behavior.visibleWhen?.sessionTypes ?? []);
                    if (event.target.checked) {
                      current.add(sessionType);
                    } else {
                      current.delete(sessionType);
                    }
                    const nextVisibleWhen: WidgetVisibilityV3 = {
                      ...widget.behavior.visibleWhen,
                      sessionTypes: [...current],
                    };
                    if (nextVisibleWhen.sessionTypes?.length === 0) {
                      delete nextVisibleWhen.sessionTypes;
                    }
                    patchBehavior(widget, session, { visibleWhen: nextVisibleWhen }, dispatch);
                  }}
                />
                {sessionType}
              </label>
            );
          })}
        </fieldset>
      </div>
    </div>
  );
}