import { useI18n } from "../../../i18n/I18nProvider";
import type { WidgetRendererProps } from "../../core/design-system-definition";
import type { PedalsViewModel } from "../../widget-types/pedals/pedals-view-model";
import { functionalLabels } from "./labels";
import vantareMark from "../../../assets/orbit/vantare-mark.png";

export function PedalsFunctional({ model, settings }: WidgetRendererProps<PedalsViewModel>) {
  const { locale } = useI18n();
  const labels = functionalLabels[locale];
  const hasHeader = settings.showHeader !== false;
  // Marca integrada (ISA-1105): la decisión llega como brandVisible desde la
  // política nativa — o del selector de marca del Workshop, que hace de
  // autoridad local. Sin ella se conserva el comportamiento previo.
  const brandVisible = (settings.brandVisible as boolean | undefined) ?? hasHeader;
  const statusText = model.status !== "ready" ? labels[model.status] : undefined;
  const pedals = [
    { id: "clutch", value: model.clutch, text: model.clutchText, label: "C", name: labels.clutch },
    { id: "brake", value: model.brake, text: model.brakeText, label: "B", name: labels.brake },
    { id: "throttle", value: model.throttle, text: model.throttleText, label: "T", name: labels.throttle },
  ] as const;

  return (
    <section className="vf-pedals" data-widget-system="vantare-functional" data-widget-renderer="pedals" data-status={model.status} data-session-header={hasHeader}>
      {hasHeader && <div className="vf-session" title={labels.pedals}>
        {brandVisible ? <span className="vf-brand" aria-label="Vantare"><img src={vantareMark} alt="" /></span> : null}
        <span className="vf-session-context"><span className="vf-session-type" role={model.status === "stale" ? "status" : undefined}>{model.status === "stale" ? labels.stale : labels.pedals}</span></span>
      </div>}
      {statusText && model.status !== "stale" && <p className="vf-status" role="status">{statusText}</p>}
      {model.statusMessage && model.status !== "stale" && <p className="vf-detail">{model.statusMessage}</p>}
      <div className="vf-pedals-bars" role="group" aria-label={labels.pedals}>
        {pedals.map((pedal) => (
          <div key={pedal.id} className="vf-pedal" data-pedal={pedal.id} title={`${pedal.name}: ${pedal.text}`}>
            <div className="vf-pedal-track"><span className="vf-pedal-fill" style={{ height: `${Math.round(pedal.value * 100)}%` }} /></div>
            <span className="vf-pedal-label">{pedal.label}</span>
            <span className="vf-pedal-value">{pedal.text}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
