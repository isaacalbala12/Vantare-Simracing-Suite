import type { WidgetRendererProps } from "../../../core/design-system-definition";
import type { RacingFlagsViewModel } from "../../../widget-types/racing-flags/racing-flags-view-model";

export function RacingFlagsCrystal({ model }: WidgetRendererProps<RacingFlagsViewModel>) {
  return <section data-widget-system="vantare-crystal" data-widget-renderer="racing-flags" data-status={model.status} data-hidden={model.hidden ? "true" : "false"} className={`vc-racing-flags vc-racing-flags-${model.globalFlag ?? "unknown"}`}>
    <div className="vc-racing-flags-top">RACING CONTROL</div>
    <div className="vc-racing-flags-banner"><span className="vc-racing-flags-light" />{model.message ?? (model.globalFlag ? model.globalFlag.toUpperCase() : "NO FLAG")}</div>
    {model.showSectorFlags ? <div className="vc-racing-flags-sectors">{model.sectorFlags.map((flag, index) => <span data-sector={index + 1} key={`${index}-${flag}`}>S{index + 1} {flag.toUpperCase()}</span>)}</div> : null}
    {model.statusMessage ? <p role="status">{model.statusMessage}</p> : null}
  </section>;
}
