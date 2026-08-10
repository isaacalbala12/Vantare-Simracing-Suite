import type { CSSProperties } from "react";
import type { PedalsViewModel } from "../../../widget-types/pedals/pedals-view-model";

/**
 * Below this a pedal reads as released. Telemetry rarely returns a clean zero
 * with a load cell resting, and a rail lit at 1% would make "off" look "on".
 */
const ENGAGED_THRESHOLD = 0.02;

/**
 * At or above this a pedal counts as pinned. Full throttle and full brake are
 * the two moments worth marking, so the rail gains a halo instead of just
 * being tall.
 */
const SATURATED_THRESHOLD = 0.99;

const RAILS = [
  { key: "clutch", label: "CLU", textKey: "clutchText", colorVar: "--ven-pred-clutch" },
  { key: "brake", label: "BRK", textKey: "brakeText", colorVar: "--ven-pred-brake" },
  { key: "throttle", label: "THR", textKey: "throttleText", colorVar: "--ven-pred-throttle" },
] as const;

/**
 * Redline pedals: three vertical rails in the graphite shell, each filling from
 * the floor, with the slot primitive underneath — microcaps label in grey, the
 * reading in tabular white.
 *
 * The one event this widget can state from the ViewModel alone is trail
 * braking: brake and throttle overlapping. It gets the same light seam the
 * standings uses for a battle, drawn on the boundary between the two rails it
 * concerns. Everything else here is still at rest, which is the point.
 *
 * Only transform and opacity animate, so OBS composites every frame.
 */
export function PedalsRedlineTemplate({ model }: { model: PedalsViewModel }) {
  const trailBraking =
    model.brake > ENGAGED_THRESHOLD && model.throttle > ENGAGED_THRESHOLD;

  return (
    <div className="ven-pred-root">
      {model.statusMessage ? (
        <p className="ven-status-message" role="status">
          {model.statusMessage}
        </p>
      ) : null}
      <div className="ven-pred-block" data-trail-braking={trailBraking ? "true" : undefined}>
        <div className="ven-pred-rails">
          {RAILS.map((rail) => {
            const value = model[rail.key];
            return (
              <div
                key={rail.key}
                className="ven-pred-rail"
                data-pedal={rail.key}
                data-seam={trailBraking && rail.key === "brake" ? "true" : undefined}
                data-engaged={value > ENGAGED_THRESHOLD ? "true" : undefined}
                data-saturated={value >= SATURATED_THRESHOLD ? "true" : undefined}
              >
                <div className="ven-pred-well">
                  <i
                    aria-hidden="true"
                    className="ven-pred-fill"
                    style={
                      {
                        transform: `scaleY(${value})`,
                        background: `var(${rail.colorVar})`,
                      } as CSSProperties
                    }
                  />
                </div>
                <div className="ven-pred-slot">
                  <small>{rail.label}</small>
                  <b>{model[rail.textKey]}</b>
                </div>
                {trailBraking && rail.key === "brake" ? (
                  <span aria-hidden="true" className="ven-pred-seam" />
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
