import type { WidgetRendererProps } from "../../core/design-system-definition";
import type { PedalsTelemetryCompactViewModel } from "../../widget-types/pedals-telemetry-compact/pedals-telemetry-compact-view-model";

const CHANNELS = [
  { id: "clutch", label: "C" },
  { id: "brake", label: "B" },
  { id: "throttle", label: "T" },
] as const;

/** Rotación del volante: steering normalizado -1..1 → ±450° (un giro GT). */
const WHEEL_LOCK_DEG = 450;

export function PedalsAdvancedIracing({ model }: WidgetRendererProps<PedalsTelemetryCompactViewModel>) {
  const values = { clutch: model.clutch, brake: model.brake, throttle: model.throttle };
  const steeringDeg = (model.steering ?? 0) * WHEEL_LOCK_DEG;
  return (
    <section className="vi-pedals-adv" data-widget-system="vantare-iracing" data-widget-renderer="pedals-telemetry-compact" data-status={model.status}>
      {model.status !== "ready" && <p className="vi-status" role="status">{model.statusMessage ?? model.status}</p>}
      <div className="vi-gear">
        <strong className="vi-gear-letter">{model.gearText}</strong>
        {model.showSpeed ? <span className="vi-speed"><b>{model.speedText}</b> km/h</span> : null}
        {model.showRpm ? <span className="vi-rpm">{model.rpmText} rpm</span> : null}
      </div>
      <div className="vi-bars" role="group" aria-label="Pedal inputs">
        {CHANNELS.map(({ id, label }) => {
          if (id === "clutch" && !model.showClutch) return null;
          return (
            <span key={id} className="vi-bar" data-pedal={id} title={`${label} ${Math.round(values[id] * 100)}%`}>
              <i style={{ height: `${Math.round(values[id] * 100)}%` }} />
            </span>
          );
        })}
      </div>
      <svg className="vi-wheel" viewBox="0 0 64 64" aria-hidden="true">
        <g transform={`rotate(${steeringDeg} 32 32)`}>
          <circle cx="32" cy="32" r="25" fill="none" stroke="currentColor" strokeWidth="7" />
          <path d="M32 32 L32 9 M32 32 L12.5 46 M32 32 L51.5 46" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
          <rect x="29" y="4" width="6" height="9" rx="2" className="vi-wheel-marker" />
        </g>
      </svg>
    </section>
  );
}
