import type { WidgetRendererProps } from "../../core/design-system-definition";
import type { PedalsTelemetryViewModel } from "../../widget-types/pedals-telemetry/pedals-telemetry-view-model";
import { useI18n } from "../../../i18n/I18nProvider";
import { functionalLabels } from "./labels";
import { SteeringWheelArtwork } from "./steering-wheels/SteeringWheelArtwork";
import { normalizeSteeringWheel } from "./steering-wheels/catalog";

const CHANNELS = [
  { id: "clutch", label: "C" },
  { id: "brake", label: "B" },
  { id: "throttle", label: "T" },
] as const;

/** Rotación del volante: steering normalizado -1..1 → ±450° (un giro GT). */
const WHEEL_LOCK_DEG = 450;

/**
 * Eficiencia copia la composición completa del widget compacto de iRacing.
 * Solo cambia la identidad del sistema y consume el contrato de telemetría
 * estándar que ya usa el widget de Eficiencia.
 */
export function PedalsAdvancedEfficiency({ model, settings, effects }: WidgetRendererProps<PedalsTelemetryViewModel>) {
  const { locale } = useI18n();
  const labels = functionalLabels[locale];
  const values = { clutch: model.clutch, brake: model.brake, throttle: model.throttle };
  const wheel = normalizeSteeringWheel(settings.steeringWheel);
  const steeringDeg = (model.steering ?? 0) * WHEEL_LOCK_DEG;
  return (
    <section className="vf-pedals-adv" data-widget-system="vantare-functional" data-widget-renderer="pedals-telemetry" data-status={model.status} data-effects={effects}>
      {model.status !== "ready" && <p className="vf-pedals-adv-status" role="status">{labels[model.status as keyof typeof labels] ?? labels.missing}</p>}
      <div className="vf-pedals-adv-gear">
        <strong className="vf-pedals-adv-gear-letter">{model.gearText}</strong>
        <span className="vf-pedals-adv-speed"><b>{model.speedText}</b> km/h</span>
        <span className="vf-pedals-adv-rpm">{model.rpmText} rpm</span>
      </div>
      <div className="vf-pedals-adv-bars" role="group" aria-label={labels.pedalInputs}>
        {CHANNELS.map(({ id, label }) => {
          if (id === "clutch" && !model.showClutch) return null;
          return (
            <span key={id} className="vf-pedals-adv-bar" data-pedal={id} title={`${label} ${Math.round(values[id] * 100)}%`}>
              <i style={{ height: `${Math.round(values[id] * 100)}%` }} />
            </span>
          );
        })}
      </div>
      <svg className="vf-pedals-adv-wheel" viewBox="0 0 64 64" aria-hidden="true" data-steering-wheel={wheel}>
        <g className="vf-pedals-adv-wheel-rotor" style={{ transform: `rotate(${steeringDeg}deg)`, transformOrigin: "32px 32px" }}>
          <SteeringWheelArtwork wheel={wheel} />
        </g>
      </svg>
    </section>
  );
}
