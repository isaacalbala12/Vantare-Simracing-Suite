import type { CSSProperties } from "react";
import type { WidgetRendererProps } from "../../../core/design-system-definition";
import type { PedalsTelemetryCompactViewModel } from "../../../widget-types/pedals-telemetry-compact/pedals-telemetry-compact-view-model";

const channels = [["brake", "B"], ["throttle", "T"], ["clutch", "C"]] as const;

export function PedalsTelemetryCompactOriginal({ model }: WidgetRendererProps<PedalsTelemetryCompactViewModel>) {
  const values = { throttle: model.throttle, brake: model.brake, clutch: model.clutch };
  return (
    <section data-widget-system="vantare-original" data-widget-renderer="pedals-telemetry-compact" data-status={model.status} className="vo-pedals-telemetry-compact">
      <div className="vo-pedals-compact-gear"><strong>{model.gearText}</strong><small>GEAR</small></div>
      {model.showSpeed ? <div className="vo-pedals-compact-readout"><strong>{model.speedText}</strong><small>KM/H</small></div> : null}
      {model.showRpm ? <div className="vo-pedals-compact-readout"><strong>{model.rpmText}</strong><small>RPM</small></div> : null}
      <div className="vo-pedals-compact-bars" aria-label="Pedal inputs">
        {channels.map(([name, label]) => {
          if (name === "clutch" && !model.showClutch) return null;
          return <div className="vo-pedals-compact-channel" data-pedal={name} key={name}>
            <span>{label}</span><i style={{ height: `${Math.round(values[name] * 100)}%` } as CSSProperties} />
          </div>;
        })}
      </div>
    </section>
  );
}
