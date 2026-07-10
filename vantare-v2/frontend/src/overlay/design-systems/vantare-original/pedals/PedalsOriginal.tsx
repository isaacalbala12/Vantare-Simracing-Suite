import type { CSSProperties } from "react";
import type { WidgetRendererProps } from "../../../core/design-system-definition";
import {
  buildPedalsAppearanceStyle,
  resolvePedalColor,
} from "../../../widget-types/pedals/pedals-renderer-helpers";
import type { PedalsViewModel } from "../../../widget-types/pedals/pedals-view-model";

function pedalHeight(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function PedalsOriginal({ model, settings }: WidgetRendererProps<PedalsViewModel>) {
  const transparentBackground = settings.transparentBackground !== false;

  return (
    <section
      data-widget-system="vantare-original"
      data-widget-renderer="pedals"
      data-status={model.status}
      data-transparent={transparentBackground ? "true" : "false"}
      className="vo-pedals"
      style={buildPedalsAppearanceStyle(settings)}
    >
      {model.statusMessage ? (
        <p className="vo-pedals-status-message" role="status">
          {model.statusMessage}
        </p>
      ) : null}
      <div className="vo-pedals-bars" aria-label="Pedals: clutch, brake, throttle">
        <div className="vo-pedals-channel" data-pedal="clutch">
          <span className="vo-pedals-label">C</span>
          <div className="vo-pedals-track">
            <span
              className="vo-pedals-fill"
              data-pedal="clutch"
              style={
                {
                  height: pedalHeight(model.clutch),
                  background: resolvePedalColor("clutch", settings),
                } as CSSProperties
              }
            />
          </div>
          <span className="vo-pedals-value">{model.clutchText}</span>
        </div>
        <div className="vo-pedals-channel" data-pedal="brake">
          <span className="vo-pedals-label">B</span>
          <div className="vo-pedals-track">
            <span
              className="vo-pedals-fill"
              data-pedal="brake"
              style={
                {
                  height: pedalHeight(model.brake),
                  background: resolvePedalColor("brake", settings),
                } as CSSProperties
              }
            />
          </div>
          <span className="vo-pedals-value">{model.brakeText}</span>
        </div>
        <div className="vo-pedals-channel" data-pedal="throttle">
          <span className="vo-pedals-label">T</span>
          <div className="vo-pedals-track">
            <span
              className="vo-pedals-fill"
              data-pedal="throttle"
              style={
                {
                  height: pedalHeight(model.throttle),
                  background: resolvePedalColor("throttle", settings),
                } as CSSProperties
              }
            />
          </div>
          <span className="vo-pedals-value">{model.throttleText}</span>
        </div>
      </div>
    </section>
  );
}