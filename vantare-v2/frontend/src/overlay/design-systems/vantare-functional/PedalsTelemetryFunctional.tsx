import type { WidgetRendererProps } from "../../core/design-system-definition";
import type { PedalsTelemetryViewModel } from "../../widget-types/pedals-telemetry/pedals-telemetry-view-model";

export function PedalsTelemetryFunctional({ model, effects }: WidgetRendererProps<PedalsTelemetryViewModel>) {
  return (
    <section className="vf-pedals-telemetry vf-pedals-telemetry-v1" data-widget-system="vantare-functional" data-widget-renderer="pedals-telemetry" data-status={model.status} data-effects={effects}>
      <div className="vf-pedals-telemetry-frame">
        <div className="vf-pedals-telemetry-gear" aria-label={`Gear ${model.gearText}`}>
          <span className="vf-pedals-telemetry-gear-value">{model.gearText}</span>
        </div>
        <div className="vf-pedals-telemetry-center">
          <small className="vf-rpm-scale">0-10k RPM</small>
          <div className="vf-pedals-telemetry-leds" aria-label={`RPM ${model.rpmText}`}>
            {Array.from({ length: 9 }, (_, index) => (
              <span
                className={`vf-pedals-telemetry-led${model.rpm !== undefined && model.rpm >= (index + 1) * 10000 / 9 ? " is-on" : ""}`}
                key={index}
              />
            ))}
          </div>
          <div className="vf-pedals-telemetry-values">
            <div><small>KPH</small><strong>{model.speedText}</strong></div>
            <div><small>RPM</small><strong className="vf-pedals-telemetry-rpm-value">{model.rpmText}</strong></div>
          </div>
        </div>
        {model.showPosition ? <strong className="vf-pedals-telemetry-position">P{model.positionText}</strong> : null}
      </div>
      {model.statusMessage ? <p className="vf-pedals-telemetry-status" role="status">{model.statusMessage}</p> : null}
    </section>
  );
}
