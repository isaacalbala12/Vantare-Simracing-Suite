import type { Ref } from "react";
import type { AnalysisSnapshot } from "../../app/AnalysisController";
import { recordingZone } from "../../app/analysis-dates";
import {
  type deletedRecordings,
  recordingIndicator,
  recordingUsage,
} from "../../app/analysis-recording-status";
import {
  analysisText as a,
  recordingDateLabel,
  size,
} from "../../i18n/analysis.es";
import { recordingStatusText as t } from "../../i18n/recording-status.es";
import { Button } from "../Button";
import { Badge, Callout } from "../Data";
import { RailBlock } from "../Frame";
import "./recording-status.css";
import { useRecordingClock } from "./useRecordingClock";

type StatusProps = {
  state: AnalysisSnapshot;
  enabled: boolean;
  enabledAtStart?: boolean;
  settings: () => void;
  undo?: () => void;
  undoDisabled?: boolean;
  compact?: boolean;
  railCollapsed?: boolean;
  timeZone?: string;
};

export function RecordingStatus({
  state,
  enabled,
  enabledAtStart,
  settings,
  undo,
  undoDisabled,
  compact,
  railCollapsed,
  timeZone = recordingZone(),
}: StatusProps) {
  const status = state.recordingStatus;
  const usage =
    status && !state.loading && !state.error
      ? recordingUsage(state.rows, status.limits)
      : undefined;
  const kind = recordingIndicator(
    status,
    enabled,
    enabledAtStart,
    !!usage?.atLimit,
    state.rows.some((row) => row.recording),
  );
  const live = kind === "recording" || kind === "limit";
  const tone = live
    ? "live"
    : kind === "idle"
      ? "ok"
      : kind === "stopped"
        ? "err"
        : kind === "degraded" || kind.startsWith("pending")
          ? "warn"
          : "neutral";
  const help =
    kind === "recording" &&
    status &&
    Number.isFinite(new Date(status.startedAtMs).getTime())
      ? `${t.started(new Intl.DateTimeFormat("es-ES", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(status.startedAtMs))} ${t.recordingHelp}`
      : kind === "degraded" && status?.cause === "pruneIncomplete"
        ? t.pruneIncompleteHelp
        : t[`${kind}Help`];
  const content = (
    <>
      <div className="v-an-status-message" role="status">
        <Badge tone={tone} dot>
          {t[kind]}
        </Badge>
        <p>{help}</p>
        {compact && status && usage && (
          <span>
            {t.usage(usage.count, status.limits.maxRecordings, usage.bytes)}
          </span>
        )}
      </div>
      {kind === "disabled" && (
        <Button size="sm" onClick={settings}>
          {a.settings}
        </Button>
      )}
      {kind.startsWith("pending") && undo && (
        <Button size="sm" onClick={undo} disabled={undoDisabled}>
          {a.undo}
        </Button>
      )}
    </>
  );
  if (compact)
    return (
      <div
        className="v-an-strip v-an-status-strip"
        data-rail-collapsed={railCollapsed || undefined}
      >
        {content}
      </div>
    );
  return (
    <>
      <RailBlock icon="pulse" title={a.automatic}>
        {content}
      </RailBlock>
      {status && usage && (
        <RailBlock icon="pulse" title={t.space}>
          <dl className="v-an-recording-meta">
            <div>
              <dt>{a.recordings}</dt>
              <dd>{t.count(usage.count, status.limits.maxRecordings)}</dd>
            </div>
            <div>
              <dt>{a.size}</dt>
              <dd>{t.bytes(usage.bytes, status.limits.maxBytes)}</dd>
            </div>
          </dl>
          <p>{t.quota(status.limits.maxRecordings, status.limits.maxBytes)}</p>
          <p>{a.local}</p>
        </RailBlock>
      )}
    </>
  );
}

type PruneProps = {
  batch: NonNullable<ReturnType<typeof deletedRecordings>>;
  clock?: () => number;
  timeZone?: string;
};

export function RecordingPruneRail({
  batch,
  clock = Date.now,
  timeZone = recordingZone(),
  headingRef,
}: PruneProps & { headingRef: Ref<HTMLParagraphElement> }) {
  const now = useRecordingClock(clock, timeZone);
  return (
    <RailBlock icon="pulse" title={t.prune}>
      <p ref={headingRef} tabIndex={-1}>
        {t.pruneList(
          recordingDateLabel(batch.atMs, now, timeZone),
          batch.items.length,
        )}
      </p>
      <ul className="v-an-prune-list">
        {batch.items.map((item) => (
          <li key={item.name}>
            <span>{recordingDateLabel(item.modifiedAtMs, now, timeZone)}</span>
            <span>{size(item.sizeBytes)}</span>
          </li>
        ))}
      </ul>
    </RailBlock>
  );
}

export function RecordingPruneNotice({
  batch,
  clock = Date.now,
  timeZone = recordingZone(),
  show,
  acknowledge,
}: PruneProps & { show: () => void; acknowledge: () => void }) {
  const now = useRecordingClock(clock, timeZone);
  return (
    <Callout
      tone="warn"
      title={t.pruneTitle(batch.items.length)}
      actions={
        <div className="v-an-prune-actions">
          <Button size="sm" onClick={show}>
            {t.seePrune}
          </Button>
          <Button
            size="sm"
            onClick={(event) => {
              event.currentTarget
                .closest('[role="tabpanel"]')
                ?.querySelector("h1")
                ?.focus();
              acknowledge();
            }}
          >
            {t.acknowledge}
          </Button>
        </div>
      }
    >
      {t.pruneSummary(
        recordingDateLabel(batch.atMs, now, timeZone),
        batch.bytes,
      )}
    </Callout>
  );
}
