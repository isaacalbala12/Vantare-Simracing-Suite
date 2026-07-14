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
      <header>V1: CÁPSULA HUD ORIGINAL</header>
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
      </div>
      <footer>Cápsula redondeada original.</footer>
      {model.statusMessage ? <p className="vc-pedals-telemetry-status" role="status">{model.statusMessage}</p> : null}
    </section>
  );
}
