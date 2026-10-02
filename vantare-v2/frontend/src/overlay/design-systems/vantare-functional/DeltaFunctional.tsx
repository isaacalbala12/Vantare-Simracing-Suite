import type { CSSProperties } from "react";
import { useRef } from "react";
import { useI18n } from "../../../i18n/I18nProvider";
import type { WidgetRendererProps } from "../../core/design-system-definition";
import { useWidgetMotion } from "../../core/widget-motion";
import type { DeltaViewModel } from "../../widget-types/delta/delta-view-model";
import { functionalLabels } from "./labels";
import { deltaReferenceNotice } from "./delta-reference-notice";
import { deltaSide, deriveDeltaCross } from "./functional-motion";

type DeltaEvent = "lap-completed" | "personal-best";

function parseLapTime(value: string): number | undefined {
  const match = /^(\d+):(\d{2})\.(\d{3})$/.exec(value.trim());
  if (!match) return undefined;
  const seconds = Number(match[1]) * 60 + Number(match[2]) + Number(match[3]) / 1000;
  return Number.isFinite(seconds) ? seconds : undefined;
}

function sameSession(prev: DeltaViewModel, next: DeltaViewModel): boolean {
  return prev.sessionIdentity === next.sessionIdentity;
}

function isPersonalBest(prev: DeltaViewModel, next: DeltaViewModel): boolean {
  const previousBest = parseLapTime(prev.bestLapText);
  const nextBest = parseLapTime(next.bestLapText);
  return previousBest !== undefined && nextBest !== undefined && nextBest < previousBest;
}

function isCompletedLap(prev: DeltaViewModel, next: DeltaViewModel): boolean {
  if (next.completedLap !== undefined && prev.completedLap !== undefined) {
    return next.completedLap > prev.completedLap && parseLapTime(next.lastLapText) !== undefined;
  }
  return prev.lastLapText !== next.lastLapText
    && parseLapTime(prev.lastLapText) !== undefined
    && parseLapTime(next.lastLapText) !== undefined;
}

function deriveDeltaEvent(prev: DeltaViewModel, next: DeltaViewModel): DeltaEvent | undefined {
  if (!sameSession(prev, next)) return undefined;
  // A personal best is the higher-priority signal when both values arrive in
  // the same frame; the right-hand last-lap notice still appears with it.
  if (isPersonalBest(prev, next)) return "personal-best";
  if (isCompletedLap(prev, next)) return "lap-completed";
  return undefined;
}

export function DeltaFunctional({ model, settings, motion = "full", effects }: WidgetRendererProps<DeltaViewModel>) {
  const { locale } = useI18n();
  const rootRef = useRef<HTMLElement | null>(null);
  // La barra ya transiciona por CSS; el motor solo marca el cruce de cero y
  // los eventos puntuales de vuelta — los dos momentos que un cambio de ancho
  // no dice.
  useWidgetMotion(model, motion === "full", rootRef, ({ prev, next, root, schedule, persist }) => {
    // Memoria del último lado no neutro: perder→neutro→ganar debe marcar el
    // cruce igual que perder→ganar — el par (neutro, ganar) solo no basta.
    if (prev.reference !== next.reference || prev.requestedReference !== next.requestedReference) {
      persist.set("deltaSide", deltaSide(next.tone));
      return;
    }
    const lastSide = (persist.get("deltaSide") as "gaining" | "losing" | null | undefined) ?? null;
    const cross = deriveDeltaCross(prev, next, lastSide);
    persist.set("deltaSide", deltaSide(next.tone) ?? lastSide);
    if (cross) {
      root.dataset.cross = cross;
      schedule(700, () => { delete root.dataset.cross; });
    }
    const event = deriveDeltaEvent(prev, next);
    if (event) {
      root.dataset.deltaEvent = event;
      schedule(event === "personal-best" ? 4000 : 2600, () => {
        delete root.dataset.deltaEvent;
      }, "delta-event");
    }
  }, (root) => {
    delete root.dataset.deltaEvent;
  });
  const labels = functionalLabels[locale];
  const referenceNotice = deltaReferenceNotice(locale, model.requestedReference, model.reference);
  const statusText = model.status !== "ready" ? labels[model.status] : undefined;
  // El relleno siempre se posiciona con left+width para que el cruce de cero
  // sea continuo: la barra drena hacia el ancla y crece por el otro lado en
  // vez de saltar entre anclas right/left, que no interpolan.
  const fill: CSSProperties = model.progress === 0
    ? { display: "none" }
    : { left: `${50 + Math.min(0, model.progress) * 50}%`, width: `${Math.abs(model.progress) * 50}%` };
  const arrow = model.tone === "gaining" ? "▲" : model.tone === "losing" ? "▼" : "";
  // "capsule" es la dirección tipo Crystal (ISA-1128): cápsulas sobre pista
  // gruesa. "instrument" es la dirección por defecto.
  const capsule = settings.templateId === "capsule";

  const eventNotices = (
    <div className="vf-delta-events" aria-live="polite" aria-atomic="true">
      <span className="vf-delta-reference">
        <small>{labels.personalBest}</small>
        <b className="vf-clock">{model.bestLapText}</b>
      </span>
      <span className="vf-delta-last">
        <small>{labels.lastLap}</small>
        <b className="vf-clock">{model.lastLapText}</b>
      </span>
    </div>
  );

  // Las referencias laterales son avisos efímeros: en reposo solo queda el
  // delta. En el instrumento comparten una rejilla de tres columnas con el
  // valor central, para que una etiqueta nunca invada el indicador.
  return (
    <section ref={rootRef} className="vf-delta" data-widget-system="vantare-functional" data-widget-renderer="delta" data-status={model.status} data-tone={model.tone} data-session-header="false" data-template={capsule ? "capsule" : "instrument"} data-effects={effects}>
      {statusText && <p className="vf-status" role="status">{statusText}</p>}
      {referenceNotice && <p className="vf-detail" role="note">{referenceNotice}</p>}
      {model.statusMessage && model.status !== "stale" && <p className="vf-detail">{model.statusMessage}</p>}
      {capsule ? (
        <div className="vf-delta-capsule">
          {eventNotices}
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
          <header className="vf-delta-head">
            {eventNotices}
            <strong className="vf-delta-value">
              <span className="vf-delta-arrow" aria-hidden="true">{arrow}</span>
              {model.deltaText}
            </strong>
          </header>
          <div className="vf-delta-track" aria-hidden="true">
            <span className="vf-delta-center" />
            <span className="vf-delta-fill" style={fill} />
          </div>
          <div className="vf-delta-scale" aria-hidden="true"><span>-1.5</span><span>0</span><span>+1.5</span></div>
        </>
      )}
    </section>
  );
}
