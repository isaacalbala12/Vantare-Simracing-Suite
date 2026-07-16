import type { WidgetRendererProps } from "../../../core/design-system-definition";
import type { RacingFlagsViewModel } from "../../../widget-types/racing-flags/racing-flags-view-model";

export function RacingFlagsCrystal({ model }: WidgetRendererProps<RacingFlagsViewModel>) {
  const label = model.globalFlag === "green" ? "RESUME RACING" : model.globalFlag === "yellow" ? "CAUTION" : "RACING CONTROL";
  const message = model.message ?? (model.globalFlag ? `${model.globalFlag.toUpperCase()} FLAG` : "NO FLAG");
  return <section data-widget-system="vantare-crystal" data-widget-renderer="racing-flags" data-status={model.status} data-hidden={model.hidden ? "true" : "false"} className={`vc-racing-flags vc-racing-flags-${model.globalFlag ?? "unknown"}`}>
    <div className="vc-racing-flags-top">{label}</div>
    <div className="vc-racing-flags-banner"><small>{model.globalFlag === "yellow" ? "SECTOR" : "FLAG"}</small><strong>{message}</strong></div>
    {model.statusMessage ? <p role="status">{model.statusMessage}</p> : null}
  </section>;
}
