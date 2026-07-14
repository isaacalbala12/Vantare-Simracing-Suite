import type { DeltaViewModel } from "../../../widget-types/delta/delta-view-model";
import { CrystalPill } from "../crystal-primitives";

export function DeltaSimpleCrystal({ model }: { model: DeltaViewModel }) {
  return (
    <div className="vc-delta-simple">
      <div className="vc-delta-simple-bar" aria-hidden="true" data-tone={model.tone} />
      <CrystalPill tone={model.tone} className="vc-delta-simple-badge">
        {model.deltaText === "0.000" ? "+0.000" : model.deltaText}
      </CrystalPill>
      {model.statusMessage ? <p className="vc-delta-status-message" role="status">{model.statusMessage}</p> : null}
    </div>
  );
}
