import type { WidgetRendererProps } from "../../core/design-system-definition";
import type { FastestLapViewModel } from "../../widget-types/fastest-lap/fastest-lap-view-model";
import { useI18n } from "../../../i18n/I18nProvider";
import { functionalLabels } from "./labels";
import "./fastest-lap.css";

export function FastestLapFunctional({ model, motion, effects, layout }: WidgetRendererProps<FastestLapViewModel>) {
  const { locale } = useI18n();
  const labels = functionalLabels[locale];
  const notice = model.notification;
  const timing = notice?.timing;
  if (!timing || timing.bestMs === undefined) {
    return <section className="vf-fastest-lap-empty" data-widget-renderer="fastest-lap" data-status={model.status} />;
  }
  const ms = timing.bestMs;
  const time = `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}.${String(ms % 1000).padStart(3, "0")}`;
  return (
    <section key={notice?.id} className="vf-fastest-lap" data-widget-system="vantare-functional" data-widget-renderer="fastest-lap"
      data-notice-kind={notice?.kind} data-notice-phase={notice?.phase}
      data-compact={layout && (layout.w < 360 || layout.h < 88) || undefined}
      data-motion={motion} data-effects={effects} data-status={model.status} data-preview={model.preview || undefined}
      role="status" aria-live={model.preview ? "off" : "polite"}>
      <div className="vf-fastest-lap-icon" aria-hidden="true">
        <svg viewBox="0 0 48 56" fill="none">
          <path d="M18 3h12M24 4v6M37 13l4-4" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
          <circle cx="24" cy="32" r="18" stroke="currentColor" strokeWidth="4" />
          <path d="M24 21v12l7 4" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <div className="vf-fastest-lap-content">
        <div className="vf-fastest-lap-heading">
          <span>{notice?.kind === "personal" ? labels.personalBest : labels.fastestLap}</span>
          {notice?.kind === "class" && model.activeClass && <small>{model.activeClass}</small>}
        </div>
        <strong className="vf-fastest-lap-time">{time}</strong>
        {model.showDriver && timing.driver && <span className="vf-fastest-lap-driver">{timing.driver}</span>}
      </div>
    </section>
  );
}
