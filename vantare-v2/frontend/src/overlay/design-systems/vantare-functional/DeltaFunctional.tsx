import type { CSSProperties } from "react";
import { useI18n } from "../../../i18n/I18nProvider";
import type { WidgetRendererProps } from "../../core/design-system-definition";
import type { DeltaViewModel } from "../../widget-types/delta/delta-view-model";
import { functionalLabels } from "./labels";
import vantareMark from "../../../assets/orbit/vantare-mark.png";

export function DeltaFunctional({ model, settings }: WidgetRendererProps<DeltaViewModel>) {
  const { locale } = useI18n();
  const labels = functionalLabels[locale];
  const hasHeader = settings.showHeader !== false;
  // Marca integrada (ISA-1105): la decisión llega como brandVisible desde la
  // política nativa — o del selector de marca del Workshop, que hace de
  // autoridad local. Sin ella se conserva el comportamiento previo.
  const brandVisible = (settings.brandVisible as boolean | undefined) ?? hasHeader;
  const statusText = model.status !== "ready" ? labels[model.status] : undefined;
  const fill: CSSProperties = model.progress === 0
    ? { display: "none" }
    : model.progress < 0
      ? { right: "50%", width: `${Math.abs(model.progress) * 50}%` }
      : { left: "50%", width: `${model.progress * 50}%` };

  return (
    <section className="vf-delta" data-widget-system="vantare-functional" data-widget-renderer="delta" data-status={model.status} data-tone={model.tone} data-session-header={hasHeader}>
      {hasHeader && <div className="vf-session" title={labels.delta}>
        {brandVisible ? <span className="vf-brand" aria-label="Vantare"><img src={vantareMark} alt="" />VANTARE</span> : null}
        <span className="vf-session-context"><span className="vf-session-type" role={model.status === "stale" ? "status" : undefined}>{model.status === "stale" ? labels.stale : labels.delta}</span></span>
        <span className="vf-delta-last"><span className="vf-session-type">{labels.lastLap}</span><span className="vf-clock">{model.lastLapText}</span></span>
      </div>}
      {statusText && model.status !== "stale" && <p className="vf-status" role="status">{statusText}</p>}
      {model.statusMessage && model.status !== "stale" && <p className="vf-detail">{model.statusMessage}</p>}
      <strong className="vf-delta-value">
        <span className="vf-delta-arrow" aria-hidden="true">{model.tone === "gaining" ? "▲" : model.tone === "losing" ? "▼" : ""}</span>
        {model.deltaText}
      </strong>
      <div className="vf-delta-track" aria-hidden="true">
        <span className="vf-delta-center" />
        <span className="vf-delta-fill" style={fill} />
      </div>
      <div className="vf-delta-scale" aria-hidden="true"><span>-2</span><span>0</span><span>+2</span></div>
    </section>
  );
}
