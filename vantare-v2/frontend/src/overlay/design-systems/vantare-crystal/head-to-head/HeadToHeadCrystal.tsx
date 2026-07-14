import type { WidgetRendererProps } from "../../../core/design-system-definition";
import type { HeadToHeadEntry, HeadToHeadViewModel } from "../../../widget-types/head-to-head/head-to-head-view-model";

function Driver({ entry, active, gap, sectors }: { entry: HeadToHeadEntry; active?: boolean; gap?: number; sectors?: readonly string[] }) {
  return <div className={active ? "is-player" : ""}><b>{entry.place}</b><strong>{entry.name}</strong><span>{sectors?.length ? sectors.join(" · ") : "—"}</span><em>{gap === undefined ? "—" : gap.toFixed(3)}</em><time>—</time></div>;
}

export function HeadToHeadCrystal({ model }: WidgetRendererProps<HeadToHeadViewModel>) {
  return <section data-widget-system="vantare-crystal" data-widget-renderer="head-to-head" data-status={model.status} className="vc-head-to-head"><header>HEAD 2 HEAD</header>{model.player && model.opponent ? <main><Driver entry={model.opponent} gap={model.gapSeconds}/><Driver entry={model.player} active sectors={model.showSectors ? model.sectorComparisons : undefined}/></main> : <p role="status">{model.statusMessage ?? "No nearby rival"}</p>}</section>;
}
