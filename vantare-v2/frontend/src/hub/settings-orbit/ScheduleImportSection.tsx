import { useEffect, useMemo, useState } from "react";
import { Events } from "@wailsio/runtime";
import { useI18n } from "../../i18n/I18nProvider";
import { useAccess } from "../../lib/access";
import { Button, Chip, ListRow, Note, SubtleStatus, Surface, Textarea } from "../../ui/orbit";
import { formatMessage } from "../orbit/format-message";
import { useCalendarStarts } from "../orbit/use-calendar-starts";
import { scheduleDiff, type ScheduleCandidate, type SchedulePreview } from "./schedule-import-model";

type ScheduleStatus = "idle" | "parsing" | "saving" | "publishing" | "ok" | "error";

type EventPayload = {
  message?: string;
  draftId?: string;
  sourceText?: string;
  preview?: SchedulePreview;
  draft?: null | { id?: string; sourceText?: string; preview?: SchedulePreview };
  candidates?: ScheduleCandidate[];
};

function payloadOf(event: unknown): EventPayload {
  if (!event || typeof event !== "object") return {};
  const data = (event as { data?: unknown }).data;
  return data && typeof data === "object" ? (data as EventPayload) : {};
}

export function ScheduleImportSection() {
  const { t, locale } = useI18n();
  const access = useAccess();
  const { calendar } = useCalendarStarts();
  const [candidates, setCandidates] = useState<ScheduleCandidate[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState<ScheduleCandidate | null>(null);
  const [sourceText, setSourceText] = useState("");
  const [preview, setPreview] = useState<SchedulePreview | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [status, setStatus] = useState<ScheduleStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const isOwner = access.roles.includes("owner");

  useEffect(() => {
    if (!isOwner) return undefined;
    const unsubscribers = [
      Events.On("schedule:preview", (event: unknown) => {
        const data = payloadOf(event);
        if (data && "series" in data) {
          setPreview(data as SchedulePreview);
          setStatus("ok");
          setError(null);
        }
      }),
      Events.On("schedule:error", (event: unknown) => {
        const data = payloadOf(event);
        setStatus("error");
        setError(data.message ?? t("settings.schedule.errorFallback"));
      }),
      Events.On("schedule:draft-saved", (event: unknown) => {
        const data = payloadOf(event);
        setDraftId(data.draftId ?? null);
        setStatus("ok");
        setMessage(t("settings.schedule.saved"));
      }),
      Events.On("schedule:published", () => {
        setStatus("ok");
        setMessage(t("settings.schedule.published"));
        Events.Emit("calendar:schedule:refresh");
      }),
      Events.On("schedule:draft", (event: unknown) => {
        const data = payloadOf(event);
        const draft = data.draft;
        if (!draft) return;
        setDraftId(data.draftId ?? draft.id ?? null);
        setSourceText(data.sourceText ?? draft.sourceText ?? "");
        setPreview(data.preview ?? draft.preview ?? null);
      }),
      Events.On("schedule:discord:inbox", (event: unknown) => {
        setCandidates(payloadOf(event).candidates ?? []);
      }),
    ];
    Events.Emit("schedule:draft:get");
    Events.Emit("schedule:discord:inbox:get");
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe?.());
  }, [isOwner, t]);

  const diff = useMemo(() => scheduleDiff(preview, calendar?.series), [calendar?.series, preview]);
  const dateFormat = useMemo(
    () => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }),
    [locale],
  );
  if (!isOwner) {
    return <Note>{t("settings.schedule.ownerOnly")}</Note>;
  }

  const selectCandidate = (candidate: ScheduleCandidate) => {
    setSelectedCandidate(candidate);
    setSourceText(candidate.sourceText);
    setPreview(null);
    setDraftId(null);
    setError(null);
    setMessage(null);
    setStatus("parsing");
    Events.Emit("schedule:parse", { text: candidate.sourceText });
  };

  const saveDraft = () => {
    if (!preview || !sourceText.trim()) return;
    setError(null);
    setMessage(null);
    setStatus("saving");
    Events.Emit("schedule:draft:save", { text: sourceText });
  };

  const publish = () => {
    if (!draftId) return;
    setError(null);
    setMessage(null);
    setStatus("publishing");
    Events.Emit("schedule:publish", { draftId });
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
          <div className="orbit-set-schedule__candidates" data-testid="orbit-settings-schedule-candidates">
            {candidates.map((candidate) => (
              <ListRow
                key={`${candidate.messageId}:${candidate.sourceHash}`}
                onClick={() => selectCandidate(candidate)}
                selected={selectedCandidate?.messageId === candidate.messageId}
                subtitle={dateFormat.format(new Date(candidate.receivedAt))}
                title={formatMessageId(candidate.messageId, t("settings.schedule.candidate"))}
              />
            ))}
          </div>
        )}
        <Note>{t("settings.schedule.inboxNote")}</Note>
      </Surface>

      <Surface
        actions={
          <div className="orbit-set-schedule__actions">
            <Button
              data-testid="orbit-settings-schedule-save"
              disabled={!preview || status === "saving" || status === "publishing"}
              onClick={saveDraft}
              size="sm"
              variant="primary"
            >
              {status === "saving" ? t("settings.schedule.saving") : t("settings.schedule.save")}
            </Button>
            <Button
              data-testid="orbit-settings-schedule-publish"
              disabled={!draftId || status === "publishing"}
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
