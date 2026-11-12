import type { ReactNode } from "react";
import { analysisText as t } from "../../i18n/analysis";
import { Segmented } from "../Forms";
import "./analysis.css";
export type AnalysisReference = "best" | "session" | "pro";
const references = [
  { value: "best", label: t.best },
  { value: "session", label: t.session },
  { value: "pro", label: t.pro },
] as const;
function Surface({
  title,
  meta,
  actions,
  children,
  fill = false,
}: {
  title: string;
  meta: string;
  actions?: ReactNode;
  children: ReactNode;
  fill?: boolean;
}) {
  return (
    <section className="v-analysis-surface" data-fill={fill} aria-label={title}>
      <header>
        <h2>{title}</h2>
        <span className="v-analysis-meta">{meta}</span>
        {actions}
      </header>
      <div className="v-analysis-body">{children}</div>
    </section>
  );
}
export function AnalysisEmptyLayout({
  reference,
  onReference,
}: {
  reference: AnalysisReference;
  onReference: (value: AnalysisReference) => void;
}) {
  return (
    <div className="v-analysis">
      <header className="v-analysis-header">
        <div>
          <p className="v-analysis-eyebrow">{t.eyebrow}</p>
          <h1>{t.noSession}</h1>
          <p className="v-analysis-lead">{t.lead}</p>
        </div>
        <div className="v-analysis-actions">
          <Segmented
            label={t.references}
            value={reference}
            options={[...references]}
            onChange={(value) => {
              const selected = references.find((item) => item.value === value);
              if (selected) onReference(selected.value);
            }}
          />
          <span className="v-analysis-status">{t.status}</span>
        </div>
      </header>
      <div className="v-analysis-stats">
        {[t.lap, t.delta, t.sectors, t.consistency].map((label) => (
          <section key={label} aria-label={label}>
            <h2>{label}</h2>
            <strong>{t.absent}</strong>
            <p>{t.noData}</p>
          </section>
        ))}
      </div>
      <div className="v-analysis-columns">
        <div className="v-analysis-map-column">
          <Surface title={t.map} meta={t.mapMeta}>
            <p>{t.mapEmpty}</p>
          </Surface>
          <Surface title={t.insights} meta={t.insightsMeta} fill>
            <p>{t.noSessions}</p>
          </Surface>
        </div>
        <Surface
          title={t.traces}
          meta={t.traceMeta}
          fill
          actions={
            <fieldset className="v-analysis-axis" aria-label={t.axis}>
              <button type="button" aria-pressed="true">
                {t.distance}
              </button>
              <button type="button" disabled>
                {t.time}
              </button>
            </fieldset>
          }
        >
          <p>{t.tracesEmpty}</p>
        </Surface>
      </div>
      <p className="v-analysis-note">{t.noSessions}</p>
    </div>
  );
}
export function AnalysisRailLayout() {
  return (
    <div className="v-analysis-rail">
      <h2>{t.title}</h2>
      <div className="v-analysis-rail-heading">
        <h3>{t.sessions}</h3>
        <span>{0}</span>
      </div>
      <p>{t.noneIndexed}</p>
      <small>{t.future}</small>
    </div>
  );
}
