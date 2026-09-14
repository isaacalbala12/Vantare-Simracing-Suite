import type { CSSProperties } from "react";
import type { WidgetRendererProps } from "../../../core/design-system-definition";
import { CrystalBrand } from "../crystal-primitives";
import {
  buildPedalsAppearanceStyle,
  resolvePedalColor,
} from "../../../widget-types/pedals/pedals-renderer-helpers";
import type { PedalsViewModel } from "../../../widget-types/pedals/pedals-view-model";

function pedalHeight(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function PedalsCrystal({ model, settings }: WidgetRendererProps<PedalsViewModel>) {
  const transparentBackground = settings.transparentBackground !== false;
  // Decisión pura de presentación (ISA-1105): la inyecta WidgetVisualHost.
  // Pedals nunca tuvo marca, así que sin decisión se conserva tal cual.
  const brandVisible = settings.brandVisible === true;

  return (
    <section
      data-widget-system="vantare-crystal"
      data-widget-renderer="pedals"
      data-status={model.status}
      data-transparent={transparentBackground ? "true" : "false"}
      className="vc-pedals vc-pedals-v3"
      style={buildPedalsAppearanceStyle(settings)}
    >
      <div className="vc-pedals-frame">
        {brandVisible ? (
          <div className="vc-brand-band">
            <CrystalBrand>VANTARE</CrystalBrand>
          </div>
        ) : null}
        {model.statusMessage ? (
          <p className="vc-pedals-status-message" role="status">
            {model.statusMessage}
          </p>
        ) : null}
        <div className="vc-pedals-channels" aria-label="Pedals: throttle, brake, clutch">
          <article className="vc-pedals-channel" data-pedal="throttle">
            <div className="vc-pedals-meter">
              <span
                className="vc-pedals-fill"
                style={
                  {
                    height: pedalHeight(model.throttle),
                    background: resolvePedalColor("throttle", settings),
                  } as CSSProperties
                }
              />
            </div>
            <span className="vc-pedals-label" style={{ color: resolvePedalColor("throttle", settings) }}>THR</span>
            <span className="vc-pedals-value">{model.throttleText}</span>
          </article>
          <article className="vc-pedals-channel" data-pedal="brake">
            <div className="vc-pedals-meter">
              <span
                className="vc-pedals-fill"
                style={
                  {
                    height: pedalHeight(model.brake),
                    background: resolvePedalColor("brake", settings),
                  } as CSSProperties
                }
              />
            </div>
            <span className="vc-pedals-label" style={{ color: resolvePedalColor("brake", settings) }}>BRK</span>
            <span className="vc-pedals-value">{model.brakeText}</span>
          </article>
          <article className="vc-pedals-channel" data-pedal="clutch">
            <div className="vc-pedals-meter">
              <span
                className="vc-pedals-fill"
                style={
                  {
                    height: pedalHeight(model.clutch),
                    background: resolvePedalColor("clutch", settings),
                  } as CSSProperties
                }
              />
            </div>
            <span className="vc-pedals-label" style={{ color: resolvePedalColor("clutch", settings) }}>CLU</span>
            <span className="vc-pedals-value">{model.clutchText}</span>
          </article>
        </div>
      </div>
    </section>
  );
}
