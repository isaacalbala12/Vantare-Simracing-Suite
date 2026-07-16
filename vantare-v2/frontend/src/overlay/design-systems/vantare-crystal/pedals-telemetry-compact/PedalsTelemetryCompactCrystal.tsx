import type { CSSProperties } from "react";
import type { WidgetRendererProps } from "../../../core/design-system-definition";
import type { PedalsTelemetryCompactViewModel } from "../../../widget-types/pedals-telemetry-compact/pedals-telemetry-compact-view-model";

const channels = [["throttle", "THR"], ["brake", "BRK"], ["clutch", "CLU"]] as const;

export function PedalsTelemetryCompactCrystal({ model }: WidgetRendererProps<PedalsTelemetryCompactViewModel>) {
  const values = { throttle: model.throttle, brake: model.brake, clutch: model.clutch };
  return (
    <section data-widget-system="vantare-crystal" data-widget-renderer="pedals-telemetry-compact" data-status={model.status} className="vc-pedals-telemetry-compact vc-pedals-telemetry-compact-v2">
      <div className="vc-pedals-compact-frame">
        <div className="vc-pedals-compact-bars" aria-label="Pedal inputs">
          {channels.map(([name, label]) => {
            if (name === "clutch" && !model.showClutch) return null;
            return <div className="vc-pedals-compact-channel" data-pedal={name} key={name}>
              <span className="vc-pedals-compact-label">{label}</span>
              <span className="vc-pedals-compact-track"><i style={{ height: `${Math.round(values[name] * 100)}%` } as CSSProperties} /></span>
            </div>;
          })}
        </div>
        <div className="vc-pedals-compact-core">
          <div className="vc-pedals-compact-shift" aria-label={`RPM ${model.rpmText}`}>
            {Array.from({ length: 7 }, (_, index) => (
              <i
                className={`${model.rpm !== undefined && model.rpm >= (index + 1) * 900 ? "is-on " : ""}${index < 3 ? "is-green" : index < 5 ? "is-yellow" : "is-red"}`}
                key={index}
              />
            ))}
          </div>
          <strong className="vc-pedals-compact-gear">{model.gearText}</strong>
          {model.showSpeed ? <span className="vc-pedals-compact-speed">{model.speedText} KM/H</span> : null}
        </div>
      </div>
    </section>
  );
}
