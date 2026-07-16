import type { CSSProperties } from "react";
import type { WidgetRendererProps } from "../../../core/design-system-definition";
import type { PedalsTelemetryViewModel } from "../../../widget-types/pedals-telemetry/pedals-telemetry-view-model";

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function pedalHeight(value: number): string {
  return percent(value);
}

const channels = [
  ["clutch", "C", "var(--vo-pedals-telemetry-clutch)"],
  ["brake", "B", "var(--vo-pedals-telemetry-brake)"],
  ["throttle", "T", "var(--vo-pedals-telemetry-throttle)"],
] as const;

export function PedalsTelemetryOriginal({ model }: WidgetRendererProps<PedalsTelemetryViewModel>) {
  const values = { throttle: model.throttle, brake: model.brake, clutch: model.clutch };
  const labels = { throttle: percent(model.throttle), brake: percent(model.brake), clutch: percent(model.clutch) };

  return (
    <section
      data-widget-system="vantare-original"
      data-widget-renderer="pedals-telemetry"
      data-status={model.status}
      className="vo-pedals-telemetry"
    >
      <div className="vo-pedals-telemetry-gear" aria-label={`Gear ${model.gearText}`}>
        <span className="vo-pedals-telemetry-gear-value">{model.gearText}</span>
      </div>
      <div className="vo-pedals-telemetry-main">
        <div className="vo-pedals-telemetry-rpm" aria-label={`RPM ${model.rpmText}`}>
          {Array.from({ length: 10 }, (_, index) => (
            <span
              className={`vo-pedals-telemetry-led${model.rpm !== undefined && model.rpm >= (index + 1) * 900 ? " is-on" : ""}${index >= 8 ? " is-red" : ""}`}
              key={index}
            />
          ))}
        </div>
        <div className="vo-pedals-telemetry-values">
          <div><strong>{model.speedText}</strong><small>KM/H</small></div>
          <div><strong>{model.rpmText}</strong><small>RPM</small></div>
          {model.showPosition ? <div><strong>{model.positionText}</strong><small>POS</small></div> : null}
        </div>
        <div className="vo-pedals-telemetry-bars" aria-label="Pedal inputs">
          {channels.map(([name, label, color]) => {
            if (name === "clutch" && !model.showClutch) return null;
            return (
              <div className="vo-pedals-telemetry-channel" data-pedal={name} key={name}>
                <span className="vo-pedals-telemetry-pedal-label">{label}</span>
                <span className="vo-pedals-telemetry-track">
                  <span
                    className="vo-pedals-telemetry-fill"
                    style={{ height: pedalHeight(values[name]), background: color } as CSSProperties}
                  />
                </span>
                <span className="vo-pedals-telemetry-pedal-value">{labels[name]}</span>
              </div>
            );
          })}
        </div>
      </div>
      {model.statusMessage ? <p className="vo-pedals-telemetry-status" role="status">{model.statusMessage}</p> : null}
    </section>
  );
}
