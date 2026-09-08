import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Events } from "@wailsio/runtime";
import { useI18n } from "../../i18n/I18nProvider";
import { useAccess } from "../../lib/access";
import { Button, Chip, ListRow, Note, SubtleStatus, Surface, Textarea } from "../../ui/orbit";
import { formatMessage } from "../orbit/format-message";
import { useCalendarStarts } from "../orbit/use-calendar-starts";
import { scheduleDiff, type ScheduleCandidate, type SchedulePreview } from "./schedule-import-model";
import { candidateKey, publishedCandidateKey, recordPublishedCandidate } from "./schedule-review-receipt";

type ScheduleStatus = "idle" | "parsing" | "saving" | "publishing" | "ok" | "error";
type Request = {kind: "parsing" | "saving" | "publishing"; id: string; candidate: ScheduleCandidate | null; accept?: boolean};
type EventPayload = {
  requestId?: string; message?: string; draftId?: string; sourceText?: string; preview?: SchedulePreview;
  draft?: null | {id?: string; sourceText?: string; preview?: SchedulePreview}; candidates?: ScheduleCandidate[];
};
function payloadOf(event: unknown): EventPayload {
  if (!event || typeof event !== "object") return {};
  const data = (event as {data?: unknown}).data;
  return data && typeof data === "object" ? data as EventPayload : {};
}
export function ScheduleImportSection({candidateTarget}: {candidateTarget?: string} = {}) {
  const {t, locale} = useI18n();
  const access = useAccess();
  const {calendar} = useCalendarStarts();
  const [candidates, setCandidates] = useState<ScheduleCandidate[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState<ScheduleCandidate | null>(null);
  const [sourceText, setSourceText] = useState("");
  const [preview, setPreview] = useState<SchedulePreview | null>(null);
  const [published, setPublished] = useState(false);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [status, setStatus] = useState<ScheduleStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const pending = useRef<Request | null>(null);
  const selected = useRef<ScheduleCandidate | null>(null);
  const openedTarget = useRef<string | undefined>(undefined);
  const isOwner = access.roles.includes("owner") && !access.isBlocked;
  const busy = status === "parsing" || status === "saving" || status === "publishing";
  const send = useCallback((name: string, payload: object, request: Request) => {
    pending.current = request; setStatus(request.kind); setError(null); setMessage(null);
    const fail = () => { if (pending.current !== request) return; pending.current = null;
      setStatus("error"); setError(t("settings.schedule.errorFallback")); };
    try { Promise.resolve(Events.Emit(name, payload)).catch(fail); } catch { fail(); }
  }, [t]);
  const selectCandidate = useCallback((candidate: ScheduleCandidate) => {
    if (pending.current) return;
    selected.current = candidate; setPublished(publishedCandidateKey() === candidateKey(candidate)); setSelectedCandidate(candidate); setSourceText(candidate.sourceText);
    setPreview(null); setDraftId(null);
    const id = crypto.randomUUID();
    send("schedule:parse", {text: candidate.sourceText, requestId: id}, {kind:"parsing",id,candidate});
  }, [send]);
  useEffect(() => {
    if (!isOwner) return;
    const unsubscribers = [
      Events.On("schedule:preview", (event: unknown) => {
        const data = payloadOf(event); const request = pending.current;
        if (request?.kind !== "parsing" || data.requestId !== request.id || !("series" in data)) return;
        pending.current = null; setPreview(data as SchedulePreview); setStatus("ok"); setError(null);
      }),
      Events.On("schedule:error", (event: unknown) => {
        const data = payloadOf(event);
        if (pending.current && data.requestId !== pending.current.id) return;
        pending.current = null; setStatus("error"); setError(data.message ?? t("settings.schedule.errorFallback"));
      }),
      Events.On("schedule:draft-saved", (event: unknown) => {
        const data = payloadOf(event); const request = pending.current;
        if (request?.kind !== "saving" || data.requestId !== request.id || !data.draftId) return;
        pending.current = null; setDraftId(data.draftId);
        if (request.accept) send("schedule:publish", {draftId: data.draftId}, {kind:"publishing",id:data.draftId,candidate:request.candidate});
        else { setStatus("ok"); setMessage(t("settings.schedule.saved")); }
      }),
      Events.On("schedule:published", (event: unknown) => {
        const data = payloadOf(event); const request = pending.current;
        if (request?.kind !== "publishing" || data.draftId !== request.id) return;
        pending.current = null; setPublished(true); setStatus("ok"); setMessage(t("settings.schedule.published")); setDraftId(null);
        if (request.candidate) recordPublishedCandidate(request.candidate);
        // The native publication handler refreshes Calendar after the server ACK.
      }),
      Events.On("schedule:draft", (event: unknown) => {
        if (pending.current || selected.current || candidateTarget) return;
        const data = payloadOf(event); const draft = data.draft;
        if (!draft && !data.draftId) return;
        setDraftId(data.draftId ?? draft?.id ?? null); setSourceText(data.sourceText ?? draft?.sourceText ?? "");
        setPreview(data.preview ?? draft?.preview ?? null);
      }),
      Events.On("schedule:discord:inbox", (event: unknown) => {
        const items = payloadOf(event).candidates ?? []; setCandidates(items);
        if (candidateTarget && openedTarget.current !== candidateTarget && !pending.current) {
          const match = items.find(c => candidateKey(c) === candidateTarget);
          if (match) { openedTarget.current = candidateTarget; selectCandidate(match); }
        }
      }),
    ];
    Events.Emit("schedule:draft:get"); Events.Emit("schedule:discord:inbox:get");
    return () => { unsubscribers.forEach(off => off()); pending.current = null; };
  }, [candidateTarget, isOwner, selectCandidate, send, t]);
  const diff = useMemo(() => scheduleDiff(preview, calendar?.series), [calendar?.series, preview]);
  const dateFormat = useMemo(() => new Intl.DateTimeFormat(locale, {dateStyle:"medium", timeStyle:"short"}), [locale]);
  if (!isOwner) return <Note>{t("settings.schedule.ownerOnly")}</Note>;
  const saveDraft = (accept = false) => {
    if (!preview || !sourceText.trim() || pending.current) return;
    const id = crypto.randomUUID();
    send("schedule:draft:save", {text:sourceText,requestId:id}, {kind:"saving",id,candidate:selected.current,accept});
  };
  const publish = () => {
    if (!preview || pending.current || published) return;
    if (!draftId) { saveDraft(true); return; }
    send("schedule:publish", {draftId}, {kind:"publishing",id:draftId,candidate:selected.current});
  };
  return (
    <>
      <Surface
        actions={
          <Button data-testid="orbit-settings-schedule-refresh" onClick={() => Events.Emit("schedule:discord:inbox:get")} size="sm">
            {t("settings.schedule.refresh")}
          </Button>
        }
        aria-label={t("settings.schedule.inbox")}
        fill
        meta={t("settings.schedule.inboxMeta")}
        title={t("settings.schedule.inbox")}
      >
        {candidates.length === 0 ? (
          <Note>{t("settings.schedule.noCandidates")}</Note>
        ) : (
          <fieldset disabled={busy} style={{border: 0, padding: 0, margin: 0}} className="orbit-set-schedule__candidates" data-testid="orbit-settings-schedule-candidates">
            {candidates.map((candidate) => (
              <ListRow
                key={`${candidate.messageId}:${candidate.sourceHash}`}
                onClick={() => selectCandidate(candidate)}
                selected={selectedCandidate?.messageId === candidate.messageId}
                subtitle={dateFormat.format(new Date(candidate.receivedAt))}
                title={formatMessageId(candidate.messageId, t("settings.schedule.candidate"))}
              />
            ))}
          </fieldset>
        )}
        <Note>{t("settings.schedule.inboxNote")}</Note>
      </Surface>

      <Surface
        actions={
          <div className="orbit-set-schedule__actions">
            <Button
              data-testid="orbit-settings-schedule-save"
              disabled={!preview || busy || published}
              onClick={() => saveDraft()}
              size="sm"
              variant="primary"
            >
              {status === "saving" ? t("settings.schedule.saving") : t("settings.schedule.save")}
            </Button>
            <Button
              data-testid="orbit-settings-schedule-publish"
              disabled={!preview || busy || published}
              onClick={publish}
              size="sm"
              variant="danger"
            >
              {status === "publishing" ? t("settings.schedule.publishing") : t("settings.schedule.publish")}
            </Button>
          </div>
        }
        aria-label={t("settings.schedule.source")}
        fill
        meta={t("settings.schedule.sourceMeta")}
        title={t("settings.schedule.source")}
      >
        <Textarea
          aria-label={t("settings.schedule.source")}
          className="orbit-set-schedule__source"
          data-testid="orbit-settings-schedule-source"
          placeholder={t("settings.schedule.sourcePlaceholder")}
          readOnly
          rows={14}
          value={sourceText}
        />
        {status === "error" && error ? <SubtleStatus tone="attn">{error}</SubtleStatus> : null}
        {status === "ok" && message ? <SubtleStatus tone="ok">{message}</SubtleStatus> : null}
        {draftId ? <Note>{t("settings.schedule.draftReady")}</Note> : null}
      </Surface>

      {preview ? (
        <Surface
          aria-label={t("settings.schedule.preview")}
          fill
          meta={`${preview.validFrom} → ${preview.validUntil}`}
          title={t("settings.schedule.preview")}
        >
          <div className="orbit-set-schedule__summary" data-testid="orbit-settings-schedule-summary">
            <Chip>{formatMessage(t("settings.schedule.seriesCount"), { count: preview.seriesCount })}</Chip>
            <Chip>{formatMessage(t("settings.schedule.diffAdded"), { count: diff.added.length })}</Chip>
            <Chip>{formatMessage(t("settings.schedule.diffChanged"), { count: diff.changed.length })}</Chip>
            <Chip>{formatMessage(t("settings.schedule.diffRemoved"), { count: diff.removed.length })}</Chip>
            {preview.sourceNotesCount > 0 ? (
              <Chip>{formatMessage(t("settings.schedule.sourceNotes"), { count: preview.sourceNotesCount })}</Chip>
            ) : null}
          </div>
          <ul className="orbit-set-schedule__series" data-testid="orbit-settings-schedule-preview">
            {preview.series.map((series) => (
              <li key={series.id}>
                <span className="orbit-set-schedule__series-main">
                  <b>{series.name}</b>
                  <span>{series.track}</span>
                  <span>{series.classes.join(", ")}</span>
                  <span>
                    {formatMessage(t("settings.schedule.seriesTiming"), {
                      race: series.raceMin,
                      total: series.eventDurationMin,
                      cadence: series.cadence,
                    })}
                  </span>
                  <span>
                    {formatMessage(t("settings.schedule.seriesConstraints"), {
                      splits: series.splits,
                      assists: series.assists || t("settings.schedule.noAssists"),
                      tyres: series.tyres,
                      warmers: series.tyreWarmers
                        ? t("settings.schedule.warmersEnabled")
                        : t("settings.schedule.warmersDisabled"),
                    })}
                  </span>
                </span>
                <span className="orbit-set-schedule__series-meta">
                  <Chip>{series.eventKind ?? series.tier}</Chip>
                  {series.licenseLabel ? <Chip>{series.licenseLabel}</Chip> : null}
                  {series.safetyRating ? <Chip>{series.safetyRating}</Chip> : null}
                  {series.format === "team" ? <Chip tier="gold">{t("settings.schedule.team")}</Chip> : null}
                  {series.fairShare ? <Chip>{t("settings.schedule.fairShare")}</Chip> : null}
                  {series.forbiddenBadges?.length ? (
                    <Chip>
                      {formatMessage(t("settings.schedule.forbiddenBadges"), {
                        badges: series.forbiddenBadges.join(", "),
                      })}
                    </Chip>
                  ) : null}
                  {series.timeScale ? (
                    <Chip>{formatMessage(t("settings.schedule.timeScale"), { scale: series.timeScale })}</Chip>
                  ) : null}
                  {series.veLimit ? (
                    <Chip>{formatMessage(t("settings.schedule.veLimit"), { limit: series.veLimit })}</Chip>
                  ) : null}
                  {series.inGameStartTime ? <Chip>{series.inGameStartTime}</Chip> : null}
                </span>
              </li>
            ))}
          </ul>
        </Surface>
      ) : null}
    </>
  );
}

function formatMessageId(messageId: string, label: string): string {
  return `${label} · ${messageId}`;
}
