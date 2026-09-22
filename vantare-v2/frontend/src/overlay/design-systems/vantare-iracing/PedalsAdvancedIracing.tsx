import type { WidgetRendererProps } from "../../core/design-system-definition";
import type { PedalsTelemetryCompactViewModel } from "../../widget-types/pedals-telemetry-compact/pedals-telemetry-compact-view-model";

const CHANNELS = [
  { id: "clutch", label: "C" },
  { id: "brake", label: "B" },
  { id: "throttle", label: "T" },
] as const;

/** Rotación del volante: steering normalizado -1..1 → ±450° (un giro GT). */
const WHEEL_LOCK_DEG = 450;

export function PedalsAdvancedIracing({ model, effects }: WidgetRendererProps<PedalsTelemetryCompactViewModel>) {
  const values = { clutch: model.clutch, brake: model.brake, throttle: model.throttle };
  const steeringDeg = (model.steering ?? 0) * WHEEL_LOCK_DEG;
  return (
    <section className="vi-pedals-adv" data-widget-system="vantare-iracing" data-widget-renderer="pedals-telemetry-compact" data-status={model.status} data-effects={effects}>
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
        <g className="vi-wheel-rotor" style={{ transform: `rotate(${steeringDeg}deg)`, transformOrigin: "32px 32px" }}>
          <path d="M23 11H41Q43 11 46 13L49 15L53 14Q57 15 59 23L60 32Q60 43 55 51Q53 55 50 52L46 47L42 45L34 49Q32 50 30 49L22 45L18 47L14 52Q11 55 9 51Q4 43 4 32L5 23Q7 15 11 14L15 15L18 13Q21 11 23 11ZM12 23Q10 23 10 26V30L18 29V24Q18 22 16 22ZM52 23L48 22Q46 22 46 24V29L54 30V26Q54 23 52 23ZM11 37Q12 43 15 46L18 43V36Q14 34 11 37ZM53 37Q50 34 46 36V43L49 46Q52 43 53 37Z" fill="currentColor" fillOpacity=".16" fillRule="evenodd" stroke="currentColor" strokeOpacity=".75" strokeWidth="1.2" strokeLinejoin="round" />
          <path d="M7 23L11 25Q8 31 12 34Q11 42 16 49L14 52Q11 55 9 51Q4 42 4 32Q4 27 7 23ZM57 23Q60 27 60 32Q60 42 55 51Q53 55 50 52L48 49Q53 42 52 34Q56 31 53 25Z" fill="var(--vi-muted)" fillOpacity=".45" stroke="currentColor" strokeOpacity=".8" strokeWidth="1.2" strokeLinejoin="round" />
          <rect x="23" y="16" width="18" height="14" rx="1" fill="var(--vi-slot)" stroke="var(--vi-muted)" strokeWidth="1.2" />
          <path d="M25 13H39" stroke="currentColor" strokeWidth="1.5" strokeDasharray="1 2" strokeLinecap="round" opacity=".7" />
          <g fill="var(--vi-slot)" stroke="currentColor" strokeWidth="1.2">
            <circle cx="14" cy="18" r="1.7" />
            <circle cx="20" cy="20" r="1.7" />
            <circle cx="20" cy="27" r="1.7" />
            <circle cx="20" cy="34" r="1.7" />
            <circle cx="20" cy="41" r="1.7" />
            <circle cx="50" cy="18" r="1.7" />
            <circle cx="44" cy="20" r="1.7" />
            <circle cx="44" cy="27" r="1.7" />
            <circle cx="44" cy="34" r="1.7" />
            <circle cx="44" cy="41" r="1.7" />
          </g>
          <circle cx="32" cy="35" r="3" fill="var(--vi-clutch)" />
          <circle cx="26" cy="41" r="2.8" fill="var(--vi-throttle)" />
          <circle cx="38" cy="41" r="2.8" fill="var(--vi-brake)" />
          <circle cx="32" cy="46" r="2.5" fill="currentColor" />
          <path d="M32 32V35M26 38V41M38 38V41M32 43.5V46" stroke="var(--vi-slot)" strokeWidth="1.3" strokeLinecap="round" />
        </g>
      </svg>
    </section>
  );
}
