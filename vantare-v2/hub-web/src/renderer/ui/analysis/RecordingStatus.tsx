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
  clock?: () => number;
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
  clock = Date.now,
  timeZone = recordingZone(),
}: StatusProps) {
  const now = useRecordingClock(clock, timeZone);
  if (state.recordingStatusPending) return null;
  const status = state.recordingStatus;
  const usage =
    status && !state.error
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
        : kind === "degraded" ||
            kind === "quotaUnmet" ||
            kind.startsWith("pending")
          ? "warn"
          : "neutral";
  const help =
    kind === "recording" &&
    status &&
    Number.isFinite(new Date(status.startedAtMs).getTime())
      ? `${t.started(status.startedAtMs, now, timeZone)} ${t.recordingHelp}`
      : kind === "degraded" && status?.cause === "pruneIncomplete"
        ? t.pruneIncompleteHelp
        : t[`${kind}Help`];
  const content = (
    <>
      <div className="v-an-status-message" data-kind={kind}>
        <Badge tone={tone} dot>
          <span role="status">{t[kind]}</span>
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
          <QuotaMeter
            label={a.recordings}
            value={usage.count}
            max={status.limits.maxRecordings}
            caption={t.count(usage.count, status.limits.maxRecordings)}
          />
          <QuotaMeter
            label={a.size}
            value={usage.bytes}
            max={status.limits.maxBytes}
            caption={t.bytes(usage.bytes, status.limits.maxBytes)}
          />
          <p>{t.quota(status.limits.maxRecordings, status.limits.maxBytes)}</p>
          <p>{a.local}</p>
        </RailBlock>
      )}
    </>
  );
}

function QuotaMeter({
  label,
  value,
  max,
  caption,
}: {
  label: string;
  value: number;
  max: number;
  caption: string;
}) {
  if (max <= 0) return null;
  return (
    <div className="v-an-quota-meter">
      <span>{label}</span>
      <span>{caption}</span>
      <meter
        min={0}
        max={max}
        value={Math.min(value, max)}
        aria-label={label}
        aria-valuetext={caption}
      />
    </div>
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
    <div className="v-an-prune-notice">
      <Callout
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
    </div>
  );
}
