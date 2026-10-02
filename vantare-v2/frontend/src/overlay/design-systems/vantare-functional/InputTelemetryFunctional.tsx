import { useI18n } from "../../../i18n/I18nProvider";
import type { WidgetRendererProps } from "../../core/design-system-definition";
import type { InputTelemetryViewModel } from "../../widget-types/input-telemetry/input-telemetry-view-model";
import { functionalLabels } from "./labels";

export function InputTelemetryFunctional({ model, effects }: WidgetRendererProps<InputTelemetryViewModel>) {
  const { locale } = useI18n();
  const labels = functionalLabels[locale];
  const statusText = model.status !== "ready" ? labels[model.status] : undefined;

  const inputs = [
    { id: "clutch", value: model.clutch, label: labels.clutch },
    { id: "brake", value: model.brake, label: labels.brake },
    { id: "throttle", value: model.throttle, label: labels.throttle },
  ] as const;

  const gearText = model.gear === undefined ? "—" : model.gear === 0 ? "N" : model.gear < 0 ? `R${Math.abs(model.gear)}` : String(model.gear);
  const n = (value: number | undefined, suffix = ""): string => value === undefined ? "—" : `${Math.round(value)}${suffix ? ` ${suffix}` : ""}`;

  return (
    <section className="vf-input-telemetry" data-widget-system="vantare-functional" data-widget-renderer="input-telemetry" data-status={model.status} data-effects={effects}>
      {statusText && <p className="vf-status" role="status">{statusText}</p>}
      {model.statusMessage && model.status !== "stale" && <p className="vf-detail">{model.statusMessage}</p>}
      <div className="vf-input-telemetry-body">
        <div className="vf-input-telemetry-primary">
          <b className="vf-input-telemetry-gear">{gearText}</b>
          <div className="vf-input-telemetry-readout">
            <span className="vf-input-telemetry-readout-label">{labels.speed}</span>
            <b>{n(model.speedKph, "KPH")}</b>
          </div>
          <div className="vf-input-telemetry-readout">
            <span className="vf-input-telemetry-readout-label">{labels.rpm}</span>
            <b>{n(model.rpm)}</b>
          </div>
        </div>
        <div className="vf-input-telemetry-bars" role="group" aria-label={labels.pedals}>
          {inputs
            .filter((input) => input.id !== "clutch" || model.showClutch)
            .map((input) => (
              <div key={input.id} className="vf-input-telemetry-bar" data-pedal={input.id}>
                <div className="vf-input-telemetry-track">
                  <span className="vf-input-telemetry-fill" style={{ height: `${Math.round(input.value * 100)}%` }} />
                </div>
                <span className="vf-input-telemetry-label">{input.label}</span>
              </div>
            ))}
        </div>
      </div>
      {model.history.length > 0 && (
        <div className="vf-input-telemetry-trace" aria-hidden="true">
          {model.history.map((sample, index) => (
            <span key={index} className="vf-input-telemetry-sample" style={{ height: `${Math.round(sample.throttle * 100)}%` }} />
          ))}
        </div>
      )}
    </section>
  );
}
