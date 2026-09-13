import type { StandingsViewModel } from "../../widget-types/standings/standings-view-model";
import type { FunctionalInfoChoice } from "./session-info-settings";
import type { functionalLabels } from "./labels";

export function SessionInfo({ choices, model, labels, className }: {
  choices: readonly FunctionalInfoChoice[];
  model: StandingsViewModel;
  labels: typeof functionalLabels.en;
  className: string;
}) {
  const available = model.status === "ready" || model.status === "stale";
  return <div className={className}>
    {choices.map((metric, index) => {
      if (metric === "none") return null;
      const value = available ? model.sessionInfo?.[metric] : undefined;
      const stale = value?.stale || model.status === "stale";
      const text = value?.text ?? "—";
      const label = labels[metric];
      return <span key={index} className="vf-info" data-info={metric} data-stale={stale || undefined} title={`${label}: ${text}${stale ? ` · ${labels.stale}` : ""}`}>
        <span className="vf-info-label">{label}</span><strong>{text}</strong>
      </span>;
    })}
  </div>;
}
