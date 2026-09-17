import type { WidgetRendererProps } from "../../core/design-system-definition";
import type { PedalsTelemetryCompactViewModel } from "../../widget-types/pedals-telemetry-compact/pedals-telemetry-compact-view-model";

const CHANNELS = [
  { id: "clutch", label: "C" },
  { id: "brake", label: "B" },
  { id: "throttle", label: "T" },
] as const;

export function PedalsAdvancedIracing({ model, effects }: WidgetRendererProps<PedalsTelemetryCompactViewModel>) {
  const values = { clutch: model.clutch, brake: model.brake, throttle: model.throttle };
  return (
    <section className="vi-pedals-adv" data-widget-system="vantare-iracing" data-widget-renderer="pedals-telemetry-compact" data-status={model.status} data-effects={effects}>
      {model.status !== "ready" && <p className="vi-status" role="status">{model.statusMessage ?? model.status}</p>}
      <div className="vi-frame">
        <div className="vi-gear">
          <strong className="vi-gear-letter">{model.gearText}</strong>
          <span className="vi-gear-label">GEAR</span>
        </div>
        <div className="vi-telemetry">
          {model.showSpeed ? <span className="vi-speed"><small>VELOCIDAD</small><b>{model.speedText} <em>KPH</em></b></span> : null}
          {model.showRpm ? <span className="vi-rpm"><b>{model.rpmText}</b> <em>RPM</em></span> : null}
        </div>
        <div className="vi-bars" role="group" aria-label="Pedal inputs">
          {CHANNELS.map(({ id, label }) => {
            if (id === "clutch" && !model.showClutch) return null;
            const percentage = Math.round(values[id] * 100);
            return (
              <span key={id} className="vi-channel" data-pedal={id} title={`${label} ${percentage}%`}>
                <small className="vi-channel-label">{label}</small>
                <span className="vi-bar"><i style={{ height: `${percentage}%` }} /></span>
                <b className="vi-channel-value">{percentage}%</b>
              </span>
            );
          })}
        </div>
        <div className="vi-position"><small>POS</small><strong>—</strong></div>
      </div>
    </section>
  );
}
