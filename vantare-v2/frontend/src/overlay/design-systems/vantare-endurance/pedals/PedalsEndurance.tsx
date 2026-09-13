import type { CSSProperties } from "react";
import type { WidgetRendererProps } from "../../../core/design-system-definition";
import { PEDALS_DEFAULT_APPEARANCE } from "../../../widget-types/pedals/pedals-renderer-helpers";
import type { PedalsViewModel } from "../../../widget-types/pedals/pedals-view-model";
import { parsePedalsEnduranceSettings } from "./pedals-endurance-settings";
import { PedalsRedlineTemplate } from "./PedalsRedlineTemplate";

function readColor(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() !== "" ? value : fallback;
}

const PEDALS = [
  { key: "clutch", label: "CLU", colorPath: "pedalClutchColor" },
  { key: "brake", label: "BRK", colorPath: "pedalBrakeColor" },
  { key: "throttle", label: "THR", colorPath: "pedalThrottleColor" },
] as const;

export function PedalsEndurance({ model, settings }: WidgetRendererProps<PedalsViewModel>) {
  const parsed = parsePedalsEnduranceSettings(settings);
  const isNeo = parsed.templateId === "pedals-neo";

  if (parsed.templateId === "pedals-redline") {
    return (
      <section
        data-widget-system="vantare-endurance"
        data-widget-renderer="pedals"
        data-status={model.status}
        data-template="pedals-redline"
        className="ven-root ven-pedals ven-predw"
        style={
          {
            "--ven-pred-throttle": readColor(
              settings.pedalThrottleColor,
              PEDALS_DEFAULT_APPEARANCE.pedalThrottleColor,
            ),
            "--ven-pred-brake": readColor(
              settings.pedalBrakeColor,
              PEDALS_DEFAULT_APPEARANCE.pedalBrakeColor,
            ),
            "--ven-pred-clutch": readColor(
              settings.pedalClutchColor,
              PEDALS_DEFAULT_APPEARANCE.pedalClutchColor,
            ),
          } as CSSProperties
        }
      >
        <PedalsRedlineTemplate model={model} />
      </section>
    );
  }

  const bars = PEDALS.map((pedal) => {
    const value = model[pedal.key];
    const text = model[`${pedal.key}Text` as const];
    const color = readColor(settings[pedal.colorPath], PEDALS_DEFAULT_APPEARANCE[pedal.colorPath]);
    return (
      <div key={pedal.key} className="ven-pedal" data-pedal={pedal.key}>
        <div className="ven-pedal-bar">
          <span
            className="ven-pedal-fill"
            style={{ "--pedal-value": String(value), "--pedal-color": color } as CSSProperties}
          />
        </div>
        <span className="ven-pedal-text">
          {pedal.label} {text}
        </span>
      </div>
    );
  });

  if (isNeo) {
    return (
      <section
        data-widget-system="vantare-endurance"
        data-widget-renderer="pedals"
        data-status={model.status}
        data-template="pedals-neo"
        className="ven-root ven-pedals ven-neop"
      >
        {model.statusMessage ? (
          <p className="ven-status-message" role="status">
            {model.statusMessage}
          </p>
        ) : null}
        <div className="ven-neo-card ven-neop-card">{bars}</div>
      </section>
    );
  }

  return (
    <section
      data-widget-system="vantare-endurance"
      data-widget-renderer="pedals"
      data-status={model.status}
      data-template="pedals-classic"
      className="ven-root ven-pedals"
    >
      {model.statusMessage ? (
        <p className="ven-status-message" role="status">
          {model.statusMessage}
        </p>
      ) : null}
      {bars}
    </section>
  );
}
