import type { WidgetRendererProps } from "../../../core/design-system-definition";
import type { RacingFlagsViewModel } from "../../../widget-types/racing-flags/racing-flags-view-model";

export function RacingFlagsOriginal({ model }: WidgetRendererProps<RacingFlagsViewModel>) {
  return <section data-widget-system="vantare-original" data-widget-renderer="racing-flags" data-status={model.status} data-hidden={model.hidden ? "true" : "false"} className={`vo-racing-flags vo-racing-flags-${model.globalFlag ?? "unknown"}`}>
    {model.statusMessage ? <p role="status">{model.statusMessage}</p> : null}
    <strong className="vo-racing-flags-banner">{model.message ?? (model.globalFlag ? model.globalFlag.toUpperCase() : "NO FLAG")}</strong>
    {model.showSectorFlags ? <div className="vo-racing-flags-sectors">{model.sectorFlags.map((flag, index) => <span data-sector={index + 1} key={`${index}-${flag}`}>{flag.toUpperCase()}</span>)}</div> : null}
  </section>;
}
