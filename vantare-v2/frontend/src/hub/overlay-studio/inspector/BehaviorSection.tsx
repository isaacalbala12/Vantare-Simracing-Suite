import { useState } from "react";
import type { SessionLayoutType, WidgetInstanceV3, WidgetVisibilityV3 } from "../../../overlay/core/profile-document";
import type { TelemetrySnapshot } from "../../../overlay/core/telemetry-snapshot";
import { isWidgetVisibleV3 } from "../../../overlay/core/widget-visibility";
import { useI18n } from "../../../i18n/I18nProvider";
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
  const { t } = useI18n();
  const runtimeVisible = isWidgetVisibleV3(widget, snapshot);
  const [advancedHzInput, setAdvancedHzInput] = useState<string>(String(widget.behavior.updateHz));

  const handleAdvancedHzChange = (value: string) => {
    setAdvancedHzInput(value);
  };

  const handleAdvancedHzBlur = () => {
    const parsed = Number.parseInt(advancedHzInput, 10);
    if (Number.isFinite(parsed)) {
      const clamped = Math.max(1, Math.min(240, parsed));
      setAdvancedHzInput(String(clamped));
      if (clamped !== widget.behavior.updateHz) {
        patchBehavior(widget, session, { updateHz: clamped }, dispatch);
      }
    } else {
      setAdvancedHzInput(String(widget.behavior.updateHz));
    }
  };

  return (
    <div
      data-testid="studio-inspector-section-behavior"
      data-widget-id={widget.id}
      data-runtime-visible={runtimeVisible ? "true" : "false"}
    >
      <div className="osv3-inspector-field-group" data-testid="studio-behavior-update-hz">
        <span className="osv3-inspector-field__label">{t("studio.v3.behavior.frequency")}</span>
        <div className="osv3-inspector-preset-row">
          {UPDATE_HZ_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              data-testid={`studio-behavior-hz-${preset}`}
              className={widget.behavior.updateHz === preset ? "is-active" : undefined}
              onClick={() => {
                patchBehavior(widget, session, { updateHz: preset }, dispatch);
                setAdvancedHzInput(String(preset));
              }}
            >
              {preset}
            </button>
          ))}
        </div>
        <label className="osv3-inspector-field">
          <span className="osv3-inspector-field__label">{t("studio.v3.behavior.advancedHz")}</span>
          <input
            type="number"
            min={1}
            max={240}
            data-testid="studio-behavior-hz-advanced"
            value={advancedHzInput}
            onChange={(event) => handleAdvancedHzChange(event.target.value)}
            onBlur={handleAdvancedHzBlur}
          />
        </label>
      </div>

      <div data-testid="studio-behavior-conditional-controls">
        <label className="osv3-inspector-field">
          <span className="osv3-inspector-field__label">{t("studio.v3.behavior.visibleInPit")}</span>
          <select
            className="osv3-inspector-select"
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
            <option value="any">{t("studio.v3.behavior.pit.any")}</option>
            <option value="in-pit">{t("studio.v3.behavior.pit.inPit")}</option>
            <option value="on-track">{t("studio.v3.behavior.pit.onTrack")}</option>
          </select>
        </label>

        <fieldset className="osv3-inspector-fieldset" data-testid="studio-behavior-session-types">
          <legend className="osv3-inspector-fieldset__legend">{t("studio.v3.behavior.visibleSessions")}</legend>
          <div className="osv3-inspector-checkbox-group">
            {SESSION_TYPE_OPTIONS.map((sessionType) => {
              const selected = widget.behavior.visibleWhen?.sessionTypes?.includes(sessionType) ?? false;
              return (
                <label key={sessionType} className="osv3-inspector-checkbox-label">
                  <input
                    type="checkbox"
                    className="osv3-inspector-checkbox"
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
                  <span className="osv3-inspector-checkbox-text">{sessionType}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
      </div>
    </div>
  );
}