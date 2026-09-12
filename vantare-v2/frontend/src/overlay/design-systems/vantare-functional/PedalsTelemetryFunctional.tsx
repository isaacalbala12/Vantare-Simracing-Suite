import { useI18n } from "../../../i18n/I18nProvider";
import type { WidgetRendererProps } from "../../core/design-system-definition";
import type { PedalsTelemetryViewModel } from "../../widget-types/pedals-telemetry/pedals-telemetry-view-model";
import { functionalLabels } from "./labels";

export function PedalsTelemetryFunctional({ model, effects }: WidgetRendererProps<PedalsTelemetryViewModel>) {
  const { locale } = useI18n();
  const labels = functionalLabels[locale];
  const statusText = model.status !== "ready" ? labels[model.status] : undefined;
  const inputs = [
    { id: "clutch", value: model.clutch, text: `${Math.round(model.clutch * 100)}%`, label: labels.clutch[0], name: labels.clutch, color: "var(--vf-clutch, #c9a15c)" },
    { id: "brake", value: model.brake, text: `${Math.round(model.brake * 100)}%`, label: labels.brake[0], name: labels.brake, color: "var(--vf-brake, #d95360)" },
    { id: "throttle", value: model.throttle, text: `${Math.round(model.throttle * 100)}%`, label: labels.throttle[0], name: labels.throttle, color: "var(--vf-throttle, #6fae7d)" },
  ] as const;

  return (
    <section className="vf-pedals-telemetry" data-widget-system="vantare-functional" data-widget-renderer="pedals-telemetry" data-status={model.status} data-effects={effects}>
      {statusText && <p className="vf-status" role="status">{statusText}</p>}
      {model.statusMessage && model.status !== "stale" && <p className="vf-detail">{model.statusMessage}</p>}
      {model.status === "ready" && (
        <div className="vf-pedals-telemetry-body">
          <div className="vf-pedals-telemetry-primary">
            <span className="vf-pedals-telemetry-gear" aria-label={model.gearText}>{model.gearText}</span>
            <div className="vf-pedals-telemetry-speed">
              <b>{model.speedText}</b>
              <span>KPH</span>
            </div>
            <div className="vf-pedals-telemetry-rpm">
              <span>RPM</span>
              <b>{model.rpmText}</b>
            </div>
          </div>
          <div className="vf-pedals-telemetry-bars" role="group" aria-label={labels.pedals}>
            {inputs.filter((input) => model.showClutch || input.id !== "clutch").map((input) => (
              <div key={input.id} className="vf-pedals-telemetry-bar" data-pedal={input.id} title={`${input.name}: ${input.text}`}>
                <div className="vf-pedals-telemetry-track"><span className="vf-pedals-telemetry-fill" style={{ height: `${Math.round(input.value * 100)}%`, background: input.color }} /></div>
                <span className="vf-pedals-telemetry-label">{input.label}</span>
                <span className="vf-pedals-telemetry-value">{input.text}</span>
              </div>
            ))}
          </div>
          {model.showPosition && (
            <div className="vf-pedals-telemetry-position">
              <span className="vf-pedals-telemetry-position-label">POS</span>
              <b>{model.positionText}</b>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
