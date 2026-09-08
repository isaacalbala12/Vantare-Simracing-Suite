import { useEffect, useState } from "react";
import { Events } from "@wailsio/runtime";
import { useI18n } from "../../i18n/I18nProvider";
import { Button } from "../../ui/orbit";
import { candidateKey, latestReviewCandidate, publishedCandidateKey, SCHEDULE_REVIEW_CHANGED } from "./schedule-review-receipt";
import type { ScheduleCandidate } from "./schedule-import-model";

export function ScheduleReviewNotice({owner, onReview}: {owner: boolean; onReview(target: string): void}) {
  const {t} = useI18n();
  const [candidate, setCandidate] = useState<ScheduleCandidate>();
  const [receipt, setReceipt] = useState(publishedCandidateKey);
  useEffect(() => {
    if (!owner) return;
    const off = Events.On("schedule:discord:inbox", (event: unknown) => {
      const data = (event as {data?: {candidates?: ScheduleCandidate[]}})?.data;
      if (!Array.isArray(data?.candidates)) return;
      const next = latestReviewCandidate(data.candidates, Date.now());
      setCandidate(previous => previous && next && candidateKey(previous) === candidateKey(next) ? previous : next);
    });
    const refresh = () => { if (document.visibilityState !== "hidden") Events.Emit("schedule:discord:inbox:get"); };
    const receiptChanged = () => setReceipt(publishedCandidateKey());
    refresh();
    const timer = window.setInterval(refresh, 60000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener(SCHEDULE_REVIEW_CHANGED, receiptChanged);
    window.addEventListener("storage", receiptChanged);
    return () => { off(); window.clearInterval(timer); window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener(SCHEDULE_REVIEW_CHANGED, receiptChanged); window.removeEventListener("storage", receiptChanged); };
  }, [owner]);
  if (!owner || !candidate || receipt === candidateKey(candidate)) return null;
  return <aside className="orbit-calendar-review" data-testid="calendar-review-notice" aria-label={t("settings.schedule.pending")}>
    <span role="status">{t("settings.schedule.pending")}</span>
    <Button size="sm" onClick={() => onReview(`schedule:${candidateKey(candidate)}`)}>{t("settings.schedule.review")}</Button>
  </aside>;
}
