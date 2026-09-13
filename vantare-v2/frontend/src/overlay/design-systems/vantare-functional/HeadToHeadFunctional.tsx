import type { WidgetRendererProps } from "../../core/design-system-definition";
import type { HeadToHeadEntry, HeadToHeadViewModel } from "../../widget-types/head-to-head/head-to-head-view-model";

function Driver({ entry, label, gap, selected }: { entry: HeadToHeadEntry; label: string; gap?: number; selected?: boolean }) {
  return (
    <div className="vf-head-to-head-row" data-player={entry.isPlayer || undefined} data-selected={selected || undefined}>
      <span className="vf-head-to-head-place">{entry.place}</span>
      <span className="vf-head-to-head-number">{entry.number}</span>
      <span className="vf-head-to-head-name">{entry.name}</span>
      <span className="vf-head-to-head-class">{entry.className}</span>
      <span className="vf-head-to-head-gap">{selected && gap !== undefined ? `${gap > 0 ? "+" : ""}${gap.toFixed(3)}` : ""}</span>
      <span className="vf-head-to-head-label">{label}</span>
    </div>
  );
}

export function HeadToHeadFunctional({ model, effects }: WidgetRendererProps<HeadToHeadViewModel>) {
  const ahead = model.ahead ?? (model.target === "ahead" ? model.opponent : undefined);
  const behind = model.behind ?? (model.target === "behind" ? model.opponent : undefined);

  return (
    <section
      className="vf-head-to-head"
      data-widget-system="vantare-functional"
      data-widget-renderer="head-to-head"
      data-status={model.status}
      data-target={model.target}
      data-effects={effects}
    >
      <header className="vf-head-to-head-header">H2H · {model.target === "ahead" ? "DELANTE" : "DETRÁS"}</header>
      {model.player && model.opponent ? (
        <div className="vf-head-to-head-list" role="list">
          {ahead ? <Driver entry={ahead} label="Rival" gap={model.gapSeconds} selected={model.target === "ahead"} /> : null}
          <Driver entry={model.player} label="Tú" />
          {behind ? <Driver entry={behind} label="Rival" gap={model.gapSeconds} selected={model.target === "behind"} /> : null}
        </div>
      ) : (
        <p className="vf-status" role="status">{model.statusMessage ?? "Sin rival en esta dirección"}</p>
      )}
    </section>
  );
}
