import type { WidgetRendererProps } from "../../../core/design-system-definition";
import type { HeadToHeadEntry, HeadToHeadViewModel } from "../../../widget-types/head-to-head/head-to-head-view-model";

function Driver({ entry, label, gap, selected, sectors }: { entry: HeadToHeadEntry; label: string; gap?: number; selected?: boolean; sectors?: readonly string[] }) {
  return <div className={entry.isPlayer ? "is-player" : ""}>
    <b>{entry.place}</b><strong title={entry.name}><small>{label}</small>{entry.name}</strong>
    <em>{sectors?.length ? <span className="vc-h2h-sectors" aria-label="Comparación de sectores">{sectors.map((sector, index) => <i data-tone={sector} key={`${sector}-${index}`}>S{index + 1}</i>)}</span> : selected ? gap === undefined ? "Sin dato" : `${gap > 0 ? "+" : ""}${gap.toFixed(3)}s` : entry.isPlayer ? "Tú" : ""}</em>
  </div>;
}

export function HeadToHeadCrystal({ model }: WidgetRendererProps<HeadToHeadViewModel>) {
  const ahead = model.ahead ?? (model.target === "ahead" ? model.opponent : undefined);
  const behind = model.behind ?? (model.target === "behind" ? model.opponent : undefined);
  return <section data-widget-system="vantare-crystal" data-widget-renderer="head-to-head" data-status={model.status} className="vc-head-to-head">
    <header>RIVALES EN CLASIFICACIÓN · Gap respecto a ti</header>
    {model.player && model.opponent ? <main>
      {ahead ? <Driver entry={ahead} label="Rival anterior" gap={model.gapSeconds} selected={model.target === "ahead"}/> : null}
      <Driver entry={model.player} label="Tu posición" sectors={model.showSectors ? model.sectorComparisons : undefined}/>
      {behind ? <Driver entry={behind} label="Rival posterior" gap={model.gapSeconds} selected={model.target === "behind"}/> : null}
    </main> : <p role="status">{model.statusMessage ?? "Sin rival en esta dirección"}</p>}
  </section>;
}
