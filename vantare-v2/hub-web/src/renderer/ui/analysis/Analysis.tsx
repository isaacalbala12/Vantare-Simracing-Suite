import { type ReactNode, useEffect, useRef, useState } from "react";
import type { AnalysisRow } from "../../../contract/generated/analysis";
import type { HostError } from "../../../contract/generated/contract";
import type {
  AnalysisController,
  AnalysisSnapshot,
} from "../../app/AnalysisController";
import {
  recordingGroup,
  recordingGroups,
  recordingZone,
} from "../../app/analysis-dates";
import {
  lostToLoad,
  orderedSessions,
  recordingBestTime,
  savedLaps,
} from "../../app/analysis-laps";
import { folderUnusable } from "../../app/analysis-recording-status";
import { Icon, type IconName } from "../../assets/icons/Icon";
import {
  date,
  lapTime,
  recordingDate,
  recordingDateLabel,
  size,
  analysisText as t,
} from "../../i18n/analysis.es";
import { recordingStatusText } from "../../i18n/recording-status.es";
import { Button } from "../Button";
import { Badge, Callout, Skeleton, Spinner } from "../Data";
import { SearchInput } from "../Forms";
import { RailBlock, SectionPageHeader } from "../Frame";
import { SessionTrack, SessionVehicle } from "./SessionIdentity";
import "./analysis.css";
import { useRecordingClock } from "./useRecordingClock";
export function AnalysisRail({
  state,
  clock = Date.now,
  timeZone = recordingZone(),
}: {
  state?: AnalysisSnapshot;
  clock?: () => number;
  timeZone?: string;
}) {
  const now = useRecordingClock(clock, timeZone);
  const row = state?.selected;
  const opened = state?.opened;
  const latest = orderedSessions(opened?.sessions)[0]?.session;
  // Issue 2871: lo que guardó una grabación sin cierre confirmado.
  const saved = opened && !opened.finished ? savedLaps(opened.laps) : undefined;
  // Issue 2883: «Completa» solo si se confirmó el final y no se perdió nada.
  const lost = opened && lostToLoad(opened);
  const complete = !!opened?.finished && !lost;
  return (
    <>
      {row && opened && (
        <RailBlock icon="pulse" title={t.thisRecording}>
          <dl className="v-an-recording-meta">
            {[
              [t.date, recordingDateLabel(row.startedAtMs, now, timeZone)],
              [t.circuit, <SessionTrack key="track" session={latest} />],
              [t.carLabel, <SessionVehicle key="car" session={latest} />],
              [t.laps, opened.laps.length],
              [t.size, size(row.sizeBytes)],
              [
                t.state,
                <Badge key="state" dot tone={complete ? "ok" : "warn"}>
                  {complete ? t.complete : t.unconfirmed}
                </Badge>,
              ],
              ...(saved
                ? [[t.saved, t.savedUntil(saved.complete, saved.partial)]]
                : []),
              ...(lost ? [[t.lost, t.lostToLoad[lost]]] : []),
            ].map(([label, value]) => (
              <div key={String(label)}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </RailBlock>
      )}
    </>
  );
}
export function AnalysisNotice({
  title,
  help,
  children,
  icon = "pulse",
  loading = false,
}: {
  title: string;
  loading?: boolean;
  icon?: IconName;
  help?: string;
  children?: ReactNode;
}) {
  return (
    <div className="v-card v-an-notice">
      <div>
        {loading ? <Spinner label={title} /> : <Icon name={icon} />}
        <h2>{title}</h2>
        {help && <p>{help}</p>}
        <div className="v-an-actions">{children}</div>
      </div>
    </div>
  );
}
function RecordingRow({
  row,
  state,
  controller,
  now,
  timeZone,
}: {
  row: AnalysisRow;
  state: AnalysisSnapshot;
  controller?: AnalysisController;
  now: number;
  timeZone: string;
}) {
  const ref = useRef<HTMLTableRowElement>(null);
  useEffect(() => {
    if (!ref.current || row.recording || !controller) return;
    const observer = new IntersectionObserver(([entry]) =>
      controller.visibleRow(row.id, entry.isIntersecting),
    );
    observer.observe(ref.current);
    return () => {
      observer.disconnect();
      controller.visibleRow(row.id, false);
    };
  }, [controller, row.id, row.recording]);
  const inspection = state.inspections[row.id];
  const readable =
    inspection && ["complete", "unconfirmed"].includes(inspection.state);
  const latest = readable
    ? orderedSessions(inspection.sessions)[0]?.session
    : undefined;
  const best = recordingBestTime(
    readable ? inspection.sessions : [],
    readable ? inspection.bestLapApproxMs : null,
  );
  const more = readable ? Math.max(0, inspection.sessions.length - 1) : 0;
  const description = date(row.startedAtMs, timeZone);
  const error = state.rowErrors[row.id];
  const status = row.recording
    ? t.recording
    : inspection
      ? t[inspection.state]
      : error === "analysisLocked"
        ? t.locked
        : error === "analysisIncompatible"
          ? t.incompatible
          : error
            ? t.unreadable
            : t.dash;
  return (
    <tr ref={ref} onClick={() => controller?.open(row)}>
      <td>
        <time
          dateTime={new Date(row.startedAtMs).toISOString()}
          title={date(row.startedAtMs, timeZone)}
        >
          {recordingDate(row.startedAtMs, now, timeZone)}
        </time>
      </td>
      <td>
        <button
          type="button"
          className="v-an-open"
          aria-description={
            more ? `${description}. ${t.moreSessionsHelp(more)}.` : description
          }
          onClick={(event) => {
            event.stopPropagation();
            controller?.open(row);
          }}
        >
          {latest?.trackName ? (
            <strong>{latest.trackName}</strong>
          ) : (
            <em>{t.track}</em>
          )}
          {latest?.vehicle || latest?.className ? (
            <span>
              <SessionVehicle session={latest} />
            </span>
          ) : (
            <em>{t.car}</em>
          )}
          {more > 0 && (
            <small title={t.moreSessionsHelp(more)}>
              {t.moreSessions(more)}
            </small>
          )}
        </button>
      </td>
      <td className="v-an-secondary">{readable ? inspection.laps : t.dash}</td>
      <td
        className="v-an-secondary v-an-number"
        aria-description={best.ms !== null ? t.recordingBest : undefined}
      >
        {lapTime(best.ms, best.official)}
      </td>
      <td className="v-an-number">{size(row.sizeBytes)}</td>
      <td>
        <Badge
          dot
          tone={
            row.recording || status === t.unreadable
              ? "err"
              : status === t.complete
                ? "ok"
                : status === t.unconfirmed
                  ? "warn"
                  : "neutral"
          }
        >
          {status}
        </Badge>
      </td>
      <td>
        <Icon
          name={
            row.recording || inspection?.state === "locked"
              ? "lock"
              : "i-chevron"
          }
        />
      </td>
    </tr>
  );
}
export function AnalysisCatalog({
  state,
  controller,
  enabled,
  settings,
  statusStrip,
  pruneNotice,
  clock = Date.now,
  timeZone = recordingZone(),
}: {
  state: AnalysisSnapshot;
  controller?: AnalysisController;
  enabled: boolean;
  settings: () => void;
  statusStrip?: ReactNode;
  pruneNotice?: ReactNode;
  clock?: () => number;
  timeZone?: string;
}) {
  const now = useRecordingClock(clock, timeZone);
  const [search, setSearch] = useState("");
  const [how, setHow] = useState(false);
  const [showLoading, setShowLoading] = useState(false);
  useEffect(() => {
    if (!state.loading) {
      setShowLoading(false);
      return;
    }
    const timer = setTimeout(() => setShowLoading(true), 300);
    return () => clearTimeout(timer);
  }, [state.loading]);
  const needle = search.trim().toLocaleLowerCase("es");
  const rows = state.rows.filter((row) => {
    const latest = orderedSessions(state.inspections[row.id]?.sessions)[0]
      ?.session;
    return `${latest?.trackName || t.track} ${latest?.vehicle || t.car} ${latest?.className ?? ""} ${date(row.startedAtMs, timeZone)}`
      .toLocaleLowerCase("es")
      .includes(needle);
  });
  const groups = recordingGroups.filter((group) =>
    rows.some(
      (row) => recordingGroup(row.startedAtMs, now, timeZone) === group,
    ),
  );
  return (
    <div className="v-an-layout">
      <SectionPageHeader
        title={t.recordings}
        description={t.intro}
        search={
          state.rows.length > 0 && (
            <SearchInput
              label={t.search}
              clearLabel={t.clear}
              value={search}
              onChange={setSearch}
            />
          )
        }
      />
      {statusStrip}
      {pruneNotice}
      {state.recordingStatus && !state.loading && !state.error && (
        <p className="v-an-catalog-usage">
          {recordingStatusText.catalogUsage(
            state.rows.length,
            state.rows.reduce((total, row) => total + row.sizeBytes, 0),
          )}
        </p>
      )}
      {!enabled && state.rows.length > 0 && (
        <Callout
          title={t.off}
          actions={<Button onClick={settings}>{t.settings}</Button>}
        >
          {t.offExisting}
        </Callout>
      )}
      {state.loading ? (
        showLoading ? (
          <>
            <p role="status">{t.loading}</p>
            <div className="v-card v-an-tablewrap">
              <table
                className="v-table v-an-table v-an-catalog"
                aria-busy="true"
              >
                <caption className="v-sr-only">{t.loading}</caption>
                <CatalogColumns />
                <tbody>
                  {["a", "b", "c", "d", "e", "f", "g"].map((id) => (
                    <tr key={id}>
                      {[
                        "date",
                        "car",
                        "laps",
                        "best",
                        "size",
                        "state",
                        "arrow",
                      ].map((key) => (
                        <td
                          key={key}
                          className={
                            key === "laps" || key === "best"
                              ? "v-an-secondary"
                              : undefined
                          }
                        >
                          <Skeleton label={t.loading} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null
      ) : state.error && folderUnusable(state.recordingStatus) ? (
        // Not a passing failure: trying again would not turn a link into a folder.
        <AnalysisNotice
          icon="stop"
          title={recordingStatusText.folderUnusable}
          help={recordingStatusText.folderUnusableHelp}
        />
      ) : state.error ? (
        <AnalysisNotice icon="x" title={t.catalogTitle} help={t.catalogHelp}>
          <Button onClick={controller?.load}>{t.retry}</Button>
        </AnalysisNotice>
      ) : !state.rows.length ? (
        <AnalysisNotice
          icon={enabled ? "pulse" : "stop"}
          title={enabled ? t.empty : t.off}
          help={enabled ? t.emptyHelp : t.offHelp}
        >
          <Button
            variant={enabled ? "neutral" : "primary"}
            onClick={enabled ? () => setHow(!how) : settings}
          >
            {enabled ? t.how : t.settings}
          </Button>
          {how && <p>{t.steps}</p>}
        </AnalysisNotice>
      ) : !rows.length ? (
        <AnalysisNotice title={t.noResults} />
      ) : (
        <div className="v-card v-an-tablewrap">
          <table className="v-table v-an-table v-an-catalog">
            <caption className="v-sr-only">{t.recordings}</caption>
            <CatalogColumns />
            {groups.map((group) => (
              <tbody key={group}>
                <tr className="v-an-day">
                  <th colSpan={2} scope="rowgroup">
                    {t[group]}
                  </th>
                </tr>
                {rows
                  .filter(
                    (r) =>
                      recordingGroup(r.startedAtMs, now, timeZone) === group,
                  )
                  .map((row) => (
                    <RecordingRow
                      key={row.id}
                      row={row}
                      state={state}
                      controller={controller}
                      now={now}
                      timeZone={timeZone}
                    />
                  ))}
              </tbody>
            ))}
          </table>
        </div>
      )}
    </div>
  );
}

function CatalogColumns() {
  return (
    <thead>
      <tr>
        {[t.date, t.vehicle, t.laps, t.best, t.size, t.state, t.open].map(
          (label, i) => (
            <th
              scope="col"
              key={label}
              className={i === 2 || i === 3 ? "v-an-secondary" : undefined}
            >
              {i === 6 ? <span className="v-sr-only">{label}</span> : label}
            </th>
          ),
        )}
      </tr>
    </thead>
  );
}

export function AnalysisError({
  kind,
  recording,
  back,
  retry,
  updates,
}: {
  kind: HostError["kind"];
  recording: boolean;
  back: () => void;
  retry: () => void;
  updates: () => void;
}) {
  const [title, help] = recording
    ? [t.recordingTitle, t.recordingHelp]
    : kind === "analysisLocked"
      ? [t.lockedTitle, t.lockedHelp]
      : kind === "analysisIncompatible"
        ? [t.incompatibleTitle, t.incompatibleHelp]
        : kind === "analysisNotFound"
          ? [t.missingTitle, t.missingHelp]
          : kind === "analysisChanged"
            ? [t.changedTitle, t.changedHelp]
            : kind === "analysisTooLarge"
              ? [t.largeTitle, t.largeHelp]
              : kind === "analysisTimeout"
                ? [t.timeoutTitle, t.timeoutHelp]
                : [t.unreadableTitle, t.unreadableHelp];
  const onlyBack =
    recording ||
    ["analysisNotFound", "analysisChanged", "analysisTooLarge"].includes(kind);
  return (
    <AnalysisNotice
      icon={recording || kind === "analysisLocked" ? "lock" : "x"}
      title={title}
      help={help}
    >
      {!onlyBack && (
        <Button onClick={kind === "analysisIncompatible" ? updates : retry}>
          {kind === "analysisIncompatible" ? t.updates : t.retry}
        </Button>
      )}
      <Button onClick={back}>{t.back}</Button>
    </AnalysisNotice>
  );
}
