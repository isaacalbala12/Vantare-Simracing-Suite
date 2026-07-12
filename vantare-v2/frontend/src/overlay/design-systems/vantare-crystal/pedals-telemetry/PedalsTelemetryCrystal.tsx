import type { CSSProperties } from "react";
import type { WidgetRendererProps } from "../../../core/design-system-definition";
import type { PedalsTelemetryViewModel } from "../../../widget-types/pedals-telemetry/pedals-telemetry-view-model";

const channels = [
  ["clutch", "C", "var(--vc-pedals-telemetry-clutch)"],
  ["brake", "B", "var(--vc-pedals-telemetry-brake)"],
  ["throttle", "T", "var(--vc-pedals-telemetry-throttle)"],
] as const;

function pedalHeight(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function PedalsTelemetryCrystal({ model }: WidgetRendererProps<PedalsTelemetryViewModel>) {
  const values = { throttle: model.throttle, brake: model.brake, clutch: model.clutch };
  return (
    <section
      data-widget-system="vantare-crystal"
      data-widget-renderer="pedals-telemetry"
      data-status={model.status}
      className="vc-pedals-telemetry vc-pedals-telemetry-v1"
    >
      <div className="vc-pedals-telemetry-frame">
        <div className="vc-pedals-telemetry-gear" aria-label={`Gear ${model.gearText}`}>
          <span className="vc-pedals-telemetry-gear-value">{model.gearText}</span>
        </div>
        <div className="vc-pedals-telemetry-center">
          <div className="vc-pedals-telemetry-leds" aria-label={`RPM ${model.rpmText}`}>
            {Array.from({ length: 10 }, (_, index) => (
              <span
                className={`vc-pedals-telemetry-led${model.rpm !== undefined && model.rpm >= (index + 1) * 900 ? " is-on" : ""}${index >= 8 ? " is-red" : ""}`}
                key={index}
              />
            ))}
          </div>
          <div className="vc-pedals-telemetry-values">
            <div><strong>{model.speedText}</strong><small>KM/H</small></div>
            <div><strong>{model.rpmText}</strong><small>RPM</small></div>
            {model.showPosition ? <div><strong>{model.positionText}</strong><small>POS</small></div> : null}
          </div>
        </div>
        <div className="vc-pedals-telemetry-bars" aria-label="Pedal inputs">
          {channels.map(([name, label, color]) => {
            if (name === "clutch" && !model.showClutch) return null;
            return (
              <div className="vc-pedals-telemetry-channel" data-pedal={name} key={name}>
                <span className="vc-pedals-telemetry-pedal-label">{label}</span>
                <span className="vc-pedals-telemetry-track">
                  <span
                    className="vc-pedals-telemetry-fill"
                    style={{ height: pedalHeight(values[name]), background: color } as CSSProperties}
                  />
                </span>
                <span className="vc-pedals-telemetry-pedal-value">{Math.round(values[name] * 100)}%</span>
              </div>
            );
          })}
        </div>
      </div>
      {model.statusMessage ? <p className="vc-pedals-telemetry-status" role="status">{model.statusMessage}</p> : null}
    </section>
  );
}
