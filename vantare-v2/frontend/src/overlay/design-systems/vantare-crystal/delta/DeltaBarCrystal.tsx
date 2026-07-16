import type { CSSProperties } from "react";
import type { DeltaViewModel } from "../../../widget-types/delta/delta-view-model";
import { CrystalPill } from "../crystal-primitives";

export function DeltaBarCrystal({ model, showHeader }: { model: DeltaViewModel; showHeader: boolean }) {
  return (
    <div className="vc-delta-bar">
      {showHeader ? (
        <div className="vc-delta-bar-top">
          <CrystalPill className="vc-delta-bar-lap">{model.lapText ?? "LAP —"}</CrystalPill>
          <span className="vc-delta-bar-predicted">{model.predictedLapText ?? "—"}</span>
          <CrystalPill tone={model.tone} className="vc-delta-bar-split">
            {model.splitText ?? model.deltaText}
          </CrystalPill>
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
        {model.deltaText}
      </CrystalPill>
      {model.statusMessage ? <p className="vc-delta-status-message" role="status">{model.statusMessage}</p> : null}
    </div>
  );
}

