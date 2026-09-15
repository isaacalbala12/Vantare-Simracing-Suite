import { Events } from "@wailsio/runtime";
import type { ScheduleCandidate } from "./schedule-import-model";

const KEY = "vantare.calendar.published-candidate";
export const SCHEDULE_REVIEW_CHANGED = "vantare:calendar-review-changed";
export const candidateKey = (candidate: ScheduleCandidate) => `${candidate.messageId}:${candidate.sourceHash}`;
export function publishedCandidateKey(): string {
  try { return localStorage.getItem(KEY) ?? ""; } catch { return ""; }
}
// A local notification receipt, never publication authority. A reset profile
// may offer review again; only a successful server ACK may write this receipt.
export function recordPublishedCandidate(candidate: ScheduleCandidate): void {
  try { localStorage.setItem(KEY, candidateKey(candidate)); } catch { /* Keep the notice if storage is unavailable. */ }
  window.dispatchEvent(new Event(SCHEDULE_REVIEW_CHANGED));
}
export function latestReviewCandidate(candidates: ScheduleCandidate[], now: number): ScheduleCandidate | undefined {
  return candidates.filter(c => c.messageId && c.sourceHash && c.sourceText &&
    Number.isFinite(Date.parse(c.receivedAt)) &&
    Date.parse(c.schedule?.validUntil ?? "") > now &&
    Date.parse(c.schedule?.validFrom ?? "") < Date.parse(c.schedule?.validUntil ?? ""))
    .sort((a,b) => Date.parse(b.schedule!.validFrom) - Date.parse(a.schedule!.validFrom) ||
      Date.parse(b.receivedAt) - Date.parse(a.receivedAt))[0];
}

// This one-operation listener deliberately outlives the review screen. It is
// released on the native result (or transport failure), not on route changes.
export function trackCandidatePublication(candidate: ScheduleCandidate, draftId: string): () => void {
  const done = () => { offPublished(); offError(); };
  const offPublished = Events.On("schedule:published", (event: unknown) => {
    if ((event as {data?: {draftId?: string}})?.data?.draftId !== draftId) return;
    recordPublishedCandidate(candidate); done();
  });
  const offError = Events.On("schedule:error", (event: unknown) => {
    if ((event as {data?: {requestId?: string}})?.data?.requestId === draftId) done();
  });
  return done;
}
