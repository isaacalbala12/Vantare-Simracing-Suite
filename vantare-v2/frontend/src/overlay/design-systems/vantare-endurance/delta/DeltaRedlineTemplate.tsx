import { useRef, type CSSProperties } from "react";
import type { DeltaViewModel } from "../../../widget-types/delta/delta-view-model";
import { useDeltaMotion } from "./useDeltaMotion";

/**
 * Fill opacity floor and span. A delta barely off zero still needs to register,
 * so the fill never starts fully transparent; magnitude then drives it up.
 */
const FILL_OPACITY_FLOOR = 0.3;
const FILL_OPACITY_SPAN = 0.55;

/**
 * Redline delta: a bipolar bar anchored at zero, the reading centred on it, and
 * the reference lap stated underneath. `model.progress` already arrives clamped
 * to [-1, 1] over a +-2s scale, so half the bar is one full-scale deflection.
 */
export function DeltaRedlineTemplate({
  model,
  showReference,
}: {
  model: DeltaViewModel;
  showReference: boolean;
}) {
  const magnitude = Math.min(1, Math.abs(model.progress));
  const direction = model.progress < 0 ? "gain" : model.progress > 0 ? "loss" : undefined;
  const rootRef = useRef<HTMLDivElement | null>(null);
  useDeltaMotion(model, model.status === "ready", rootRef);

  return (
    <div className="ven-dred-root" ref={rootRef}>
      {model.statusMessage ? (
        <p className="ven-status-message" role="status">
          {model.statusMessage}
        </p>
      ) : null}
      <div className="ven-dred-block">
        <div className="ven-dred-bar" data-tone={model.tone}>
          {direction ? (
            <i
              aria-hidden="true"
              className="ven-dred-fill"
              data-dir={direction}
              style={
                {
                  width: `${magnitude * 50}%`,
                  opacity: FILL_OPACITY_FLOOR + magnitude * FILL_OPACITY_SPAN,
                } as CSSProperties
              }
            />
          ) : null}
          <span aria-hidden="true" className="ven-dred-zero" />
          <strong className="ven-dred-value">{model.deltaText}</strong>
        </div>
        {showReference ? (
          <div className="ven-dred-ref">
            <small>BEST</small>
            <b>{model.bestLapText}</b>
          </div>
        ) : null}
      </div>
    </div>
  );
}
