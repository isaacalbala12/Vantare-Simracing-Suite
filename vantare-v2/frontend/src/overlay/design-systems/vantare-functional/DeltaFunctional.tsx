import type { CSSProperties } from "react";
import { useRef } from "react";
import { useI18n } from "../../../i18n/I18nProvider";
import type { WidgetRendererProps } from "../../core/design-system-definition";
import { useWidgetMotion } from "../../core/widget-motion";
import type { DeltaViewModel } from "../../widget-types/delta/delta-view-model";
import { functionalLabels } from "./labels";
import { deriveDeltaCross } from "./functional-motion";

export function DeltaFunctional({ model, settings, motion = "full", effects }: WidgetRendererProps<DeltaViewModel>) {
  const { locale } = useI18n();
  const rootRef = useRef<HTMLElement | null>(null);
  // La barra ya transiciona por CSS; el motor solo marca el cruce de cero y
  // la nueva referencia — los dos momentos que un cambio de ancho no dice.
  useWidgetMotion(model, motion === "full", rootRef, ({ prev, next, root, schedule }) => {
    const cross = deriveDeltaCross(prev, next);
    if (cross) {
      root.dataset.cross = cross;
      schedule(700, () => { delete root.dataset.cross; }, "cross");
    }
    if (next.bestLapText !== prev.bestLapText && next.bestLapText.trim() !== "" && next.bestLapText !== "—") {
      root.dataset.newBest = "true";
      schedule(1100, () => { delete root.dataset.newBest; }, "newBest");
    }
  }, (root) => {
    delete root.dataset.cross;
    delete root.dataset.newBest;
  });
  const labels = functionalLabels[locale];
  const statusText = model.status !== "ready" ? labels[model.status] : undefined;
  const fill: CSSProperties = model.progress === 0
    ? { display: "none" }
    : model.progress < 0
      ? { right: "50%", width: `${Math.abs(model.progress) * 50}%` }
      : { left: "50%", width: `${model.progress * 50}%` };
  const arrow = model.tone === "gaining" ? "▲" : model.tone === "losing" ? "▼" : "";
  // "capsule" es la dirección tipo Crystal (ISA-1128): cápsulas sobre pista
  // gruesa. "instrument" es la dirección por defecto.
  const capsule = settings.templateId === "capsule";

  // Sin cabecera de sesión: el delta es un instrumento — valor, escala y la
  // última vuelta como pie. La marca no vive aquí (decisión de Isaac).
  return (
    <section ref={rootRef} className="vf-delta" data-widget-system="vantare-functional" data-widget-renderer="delta" data-status={model.status} data-tone={model.tone} data-session-header="false" data-template={capsule ? "capsule" : "instrument"} data-effects={effects} data-motion-level={motion}>
      {statusText && <p className="vf-status" role="status">{statusText}</p>}
      {model.statusMessage && model.status !== "stale" && <p className="vf-detail">{model.statusMessage}</p>}
      {capsule ? (
        <div className="vf-delta-capsule">
          <div className="vf-delta-capsule-top">
            <span className="vf-delta-capsule-label">{labels.lastLap}</span>
            <span className="vf-delta-capsule-sep" aria-hidden="true">|</span>
            <span className="vf-delta-capsule-lap">{model.lastLapText}</span>
            <span className="vf-delta-capsule-delta" data-tone={model.tone}>{model.deltaText}</span>
          </div>
          <div className="vf-delta-capsule-track" data-tone={model.tone} aria-hidden="true">
            <span className="vf-delta-capsule-center" />
            <span className="vf-delta-capsule-fill" style={fill} />
          </div>
          <span className="vf-delta-capsule-value" data-tone={model.tone}>
            <span className="vf-delta-arrow" aria-hidden="true">{arrow}</span>
            {model.deltaText}
          </span>
        </div>
      ) : (
        <>
          <strong className="vf-delta-value">
            <span className="vf-delta-arrow" aria-hidden="true">{arrow}</span>
            {model.deltaText}
          </strong>
          <div className="vf-delta-track" aria-hidden="true">
            <span className="vf-delta-center" />
            <span className="vf-delta-fill" style={fill} />
          </div>
          <div className="vf-delta-scale" aria-hidden="true"><span>-2</span><span>0</span><span>+2</span></div>
          <div className="vf-delta-foot"><span className="vf-session-type">{labels.lastLap}</span><span className="vf-clock">{model.lastLapText}</span></div>
        </>
      )}
    </section>
  );
}
