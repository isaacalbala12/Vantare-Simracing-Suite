import type { WidgetRendererProps } from "../../../core/design-system-definition";
import type { PedalsTelemetryViewModel } from "../../../widget-types/pedals-telemetry/pedals-telemetry-view-model";

export function PedalsTelemetryCrystal({ model }: WidgetRendererProps<PedalsTelemetryViewModel>) {
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
            {Array.from({ length: 9 }, (_, index) => (
              <span
                className={`vc-pedals-telemetry-led${model.rpm !== undefined && model.rpm >= (index + 1) * 1000 ? " is-on" : ""}${index >= 4 ? " is-red" : ""}`}
                key={index}
              />
            ))}
          </div>
          <div className="vc-pedals-telemetry-values">
            <div><small>KPH</small><strong>{model.speedText}</strong></div>
            <div><small>RPM</small><strong className="vc-pedals-telemetry-rpm-value">{model.rpmText}</strong></div>
          </div>
        </div>
        {model.showPosition ? <strong className="vc-pedals-telemetry-position">P{model.positionText}</strong> : null}
      </div>
      {model.statusMessage ? <p className="vc-pedals-telemetry-status" role="status">{model.statusMessage}</p> : null}
    </section>
  );
}
