import { useState } from "react";
import type { SessionLayoutType, WidgetInstanceV3, WidgetVisibilityV3 } from "../../../overlay/core/profile-document";
import type { TelemetrySnapshot } from "../../../overlay/core/telemetry-snapshot";
import { isWidgetVisibleV3 } from "../../../overlay/core/widget-visibility";
import { useI18n } from "../../../i18n/I18nProvider";
import { Field, Note, SegMulti, Select } from "../../../ui/orbit";
import type { StudioCommand } from "../state/studio-command";
import { useIsOrbitSkin } from "./inspector-skin";

const UPDATE_HZ_PRESETS = [5, 10, 15, 30, 60] as const;
const SESSION_TYPE_OPTIONS = ["practice", "qualifying", "race", "warmup", "endurance"] as const;

type SessionTypeOption = (typeof SESSION_TYPE_OPTIONS)[number];
type PitOption = "any" | "in-pit" | "on-track";

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
  const orbit = useIsOrbitSkin();
  const runtimeVisible = isWidgetVisibleV3(widget, snapshot);
  const [advancedHzInput, setAdvancedHzInput] = useState<string>(String(widget.behavior.updateHz));

  const pitValue: PitOption =
    widget.behavior.visibleWhen?.inPit === undefined
      ? "any"
      : widget.behavior.visibleWhen.inPit
        ? "in-pit"
        : "on-track";

  /** Unico punto de escritura de `visibleWhen.inPit` (lo comparten ambas pieles). */
  const setPit = (next: PitOption) => {
    const nextVisibleWhen: WidgetVisibilityV3 = { ...widget.behavior.visibleWhen };
    if (next === "any") {
      delete nextVisibleWhen.inPit;
    } else {
      nextVisibleWhen.inPit = next === "in-pit";
    }
    patchBehavior(widget, session, { visibleWhen: nextVisibleWhen }, dispatch);
  };

  /** Unico punto de escritura de `visibleWhen.sessionTypes`. */
  const toggleSession = (sessionType: SessionTypeOption, selected: boolean) => {
    const current = new Set(widget.behavior.visibleWhen?.sessionTypes ?? []);
    if (selected) {
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
  };

  const selectedSessions = widget.behavior.visibleWhen?.sessionTypes ?? [];

  if (orbit) {
    // El valor actual siempre esta en la lista aunque no sea un preset: el
    // `Select` no puede reescribir el documento por si solo.
    const hzOptions = [...new Set<number>([...UPDATE_HZ_PRESETS, widget.behavior.updateHz])].sort(
      (a, b) => a - b,
    );

    return (
      <div
        className="orbit-studio-ins__body"
        data-testid="studio-inspector-section-behavior"
        data-runtime-visible={runtimeVisible ? "true" : "false"}
        data-widget-id={widget.id}
      >
        <div className="orbit-studio-ins__grid2">
          <Field htmlFor="orbit-behavior-hz" label={t("studio.inspector.frequency")}>
            <Select
              id="orbit-behavior-hz"
              label={t("studio.inspector.frequency")}
              onChange={(next) => {
                const parsed = Number.parseInt(next, 10);
                patchBehavior(widget, session, { updateHz: parsed }, dispatch);
                setAdvancedHzInput(next);
              }}
              options={hzOptions.map((hz) => ({ value: String(hz), label: String(hz) }))}
              value={String(widget.behavior.updateHz)}
            />
          </Field>
          <Field htmlFor="orbit-behavior-pit" label={t("studio.v3.behavior.visibleInPit")}>
            <Select
              id="orbit-behavior-pit"
              label={t("studio.v3.behavior.visibleInPit")}
              onChange={(next) => setPit(next as PitOption)}
              options={[
                { value: "any", label: t("studio.v3.behavior.pit.any") },
                { value: "in-pit", label: t("studio.v3.behavior.pit.inPit") },
                { value: "on-track", label: t("studio.v3.behavior.pit.onTrack") },
              ]}
              value={pitValue}
            />
          </Field>
        </div>

        <Field label={t("studio.v3.behavior.visibleSessions")}>
          <SegMulti
            label={t("studio.v3.behavior.visibleSessions")}
            onToggle={(value, next) => toggleSession(value, next)}
            options={SESSION_TYPE_OPTIONS.map((sessionType) => ({
              value: sessionType,
              label: t(`studio.inspector.session.${sessionType}`),
            }))}
            values={selectedSessions}
            wide
          />
        </Field>

        <Note title={t("studio.inspector.note.lmuTitle")}>{t("studio.inspector.note.lmuBody")}</Note>
      </div>
    );
  }

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
            value={pitValue}
            onChange={(event) => setPit(event.target.value as PitOption)}
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
              const selected = selectedSessions.includes(sessionType);
              return (
                <label key={sessionType} className="osv3-inspector-checkbox-label">
                  <input
                    type="checkbox"
                    className="osv3-inspector-checkbox"
                    data-testid={`studio-behavior-session-${sessionType}`}
                    checked={selected}
                    onChange={(event) => toggleSession(sessionType, event.target.checked)}
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