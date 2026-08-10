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
 * The widget states three things and no more: how far each pedal is down, which
 * ones are off their rest position, and which are pinned. It is meant to be
 * quiet — a pedal trace that flickers is a pedal trace nobody reads.
 *
 * Only transform and opacity animate, so OBS composites every frame.
 */
export function PedalsRedlineTemplate({ model }: { model: PedalsViewModel }) {
  return (
    <div className="ven-pred-root">
      {model.statusMessage ? (
        <p className="ven-status-message" role="status">
          {model.statusMessage}
        </p>
      ) : null}
      <div className="ven-pred-block">
        <div className="ven-pred-rails">
          {RAILS.map((rail) => {
            const value = model[rail.key];
            return (
              <div
                key={rail.key}
                className="ven-pred-rail"
                data-pedal={rail.key}
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
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
