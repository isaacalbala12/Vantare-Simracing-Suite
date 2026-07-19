import type { WidgetRendererProps } from "../../../core/design-system-definition";
import type { HeadToHeadEntry, HeadToHeadViewModel } from "../../../widget-types/head-to-head/head-to-head-view-model";

function Driver({ entry, active, gap, sectors }: { entry: HeadToHeadEntry; active?: boolean; gap?: number; sectors?: readonly string[] }) {
  return <div className={active ? "is-player" : ""}><b>{entry.place}</b><strong>{entry.name}</strong><span>{sectors?.length ? <><u data-side="left">« —</u>{sectors.map((sector, index) => <i data-tone={sector} key={`${sector}-${index}`}>—</i>)}<u data-side="right">— »</u></> : "—"}</span><em>{gap === undefined ? "—" : gap.toFixed(3)}</em><time>—</time></div>;
}

export function HeadToHeadCrystal({ model }: WidgetRendererProps<HeadToHeadViewModel>) {
  const ahead = model.ahead ?? (model.target === "ahead" ? model.opponent : undefined);
  const behind = model.behind ?? (model.target === "behind" ? model.opponent : undefined);
  return <section data-widget-system="vantare-crystal" data-widget-renderer="head-to-head" data-status={model.status} className="vc-head-to-head"><header>HEAD 2 HEAD</header>{model.player && model.opponent ? <main>{ahead ? <Driver entry={ahead} gap={model.target === "ahead" ? model.gapSeconds : undefined}/> : null}<Driver entry={model.player} active sectors={model.showSectors ? model.sectorComparisons : undefined}/>{behind ? <Driver entry={behind} gap={model.target === "behind" ? model.gapSeconds : undefined}/> : null}</main> : <p role="status">{model.statusMessage ?? "No nearby rival"}</p>}</section>;
}
