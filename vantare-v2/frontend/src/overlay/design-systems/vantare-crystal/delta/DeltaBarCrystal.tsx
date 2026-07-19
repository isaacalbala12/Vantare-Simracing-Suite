import type { CSSProperties } from "react";
import type { DeltaViewModel } from "../../../widget-types/delta/delta-view-model";
import { CrystalPill } from "../crystal-primitives";

function formatBarDelta(value: string): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return value;
  if (numeric === 0) return "0.00";
  return `${numeric > 0 ? "+" : ""}${numeric.toFixed(2)}`;
}

export function DeltaBarCrystal({ model, showHeader }: { model: DeltaViewModel; showHeader: boolean }) {
  const deltaText = formatBarDelta(model.deltaText);
  const splitText = formatBarDelta(model.splitText ?? model.deltaText);
  return (
    <div className="vc-delta-bar">
      {showHeader ? (
        <div className="vc-delta-bar-top">
          <span className="vc-delta-bar-lap">{model.lapText ?? "LAP —"}</span>
          <span className="vc-delta-bar-separator" aria-hidden="true">|</span>
          <span className="vc-delta-bar-predicted">{model.predictedLapText ?? "—"}</span>
          <span className="vc-delta-bar-separator" aria-hidden="true">|</span>
          <span data-tone={model.tone} className="vc-delta-bar-split">{splitText}</span>
        </div>
      ) : null}
      <div className="vc-delta-bar-track" aria-hidden="true" data-tone={model.tone}>
        <span className="vc-delta-bar-center" />
        <span
          className="vc-delta-bar-fill"
          style={{ "--delta-progress": String(model.progress) } as CSSProperties}
        />
      </div>
      <CrystalPill tone={model.tone} className="vc-delta-bar-value">
        {deltaText}
      </CrystalPill>
      {model.statusMessage ? <p className="vc-delta-status-message" role="status">{model.statusMessage}</p> : null}
    </div>
  );
}
