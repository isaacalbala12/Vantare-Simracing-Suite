import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import type {
  AnalysisLap,
  AnalysisRow,
  AnalysisSignal,
} from "../../../contract/generated/analysis";
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
import { Icon, type IconName } from "../../assets/icons/Icon";
import {
  date,
  decimal,
  lapTime,
  recordingDate,
  size,
  analysisText as t,
} from "../../i18n/analysis.es";
import { Button } from "../Button";
import { Badge, Callout, Skeleton, Spinner } from "../Data";
import { SearchInput } from "../Forms";
import { RailBlock, SectionPageHeader } from "../Frame";
import { ActionGroup } from "../ShellLayout";
import "./analysis.css";
import { useRecordingClock } from "./useRecordingClock";
export function AnalysisRail({
  enabled,
  recording,
}: {
  enabled: boolean;
  recording: boolean;
}) {
  return (
    <RailBlock icon="pulse" title={t.automatic}>
      <p>
        <strong>{enabled ? t.enabled : t.disabled}</strong>
      </p>
      {recording && <p>{t.recording}</p>}
      <p>{t.local}</p>
    </RailBlock>
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
  icon?: IconName;
  loading?: boolean;
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
  const dateId = useId();
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
        <button type="button" className="v-an-open" aria-description={date(row.startedAtMs, timeZone)} onClick={(event) => {event.stopPropagation(); controller?.open(row);}}> 
          <em>{t.track}</em>
          <em>{t.car}</em>
        </button>
      </td>
      <td className="v-an-secondary">{readable ? inspection.laps : t.dash}</td>
      <td className="v-an-secondary v-an-number">
        {lapTime(readable ? inspection.bestLapApproxMs : null)}
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
  clock = Date.now,
  timeZone = recordingZone(),
}: {
  state: AnalysisSnapshot;
  controller?: AnalysisController;
  enabled: boolean;
  settings: () => void;
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
  const rows = state.rows.filter((row) =>
    `${t.track} ${t.car} ${date(row.startedAtMs, timeZone)}`
      .toLocaleLowerCase("es")
      .includes(needle),
  );
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
      <div className="v-an-strip" role="status">
        {`${t.automatic}: ${enabled ? t.enabled : t.disabled}`}
        {state.rows.some((r) => r.recording) && <strong>{t.recording}</strong>}
      </div>
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

function Signal({
  signal,
  factor,
}: {
  signal: AnalysisSignal;
  factor: number;
}) {
  return (
    <span
      title={`${t.reliable}: ${signal.reliable}; ${t.estimated}: ${signal.estimated}; ${t.stale}: ${signal.stale}; ${t.unavailable}: ${signal.unavailable}`}
    >
      {[signal.min, signal.mean, signal.max]
        .map((value) => (value === null ? t.dash : decimal(value * factor)))
        .join(" / ")}
      {signal.estimated || signal.stale ? " ≈" : ""}
    </span>
  );
}
export function AnalysisLaps({
  state,
  controller,
  updates,
}: {
  state: AnalysisSnapshot;
  controller?: AnalysisController;
  updates: () => void;
}) {
  const opened = state.opened;
  const back = () => controller?.load();
  const times =
    opened?.laps.flatMap((lap) =>
      lap.sealed && !lap.gap && lap.lapTimeApproxMs !== null
        ? [lap.lapTimeApproxMs]
        : [],
    ) ?? [];
  const best = times.length ? Math.min(...times) : null;
  const speeds =
    opened?.laps.flatMap((lap) =>
      lap.speed.max === null ? [] : [lap.speed.max * 3.6],
    ) ?? [];
  const validTime = (lap: AnalysisLap) =>
    lap.sealed && !lap.gap ? lap.lapTimeApproxMs : null;
  return (
    <div className="v-an-layout">
      <SectionPageHeader
        title={t.track}
        description={
          state.selected
            ? `${date(state.selected.startedAtMs)} · ${size(state.selected.sizeBytes)} · ${t.car}`
            : t.intro
        }
      />
      {opened && !state.error && (
        <ActionGroup>
          <Button onClick={back}>{t.back}</Button>
        </ActionGroup>
      )}
      {state.opening ? (
        <AnalysisNotice title={t.opening} help={t.openingHelp} loading>
          <Button onClick={back}>{t.cancel}</Button>
        </AnalysisNotice>
      ) : state.error ? (
        <AnalysisError
          kind={state.error}
          recording={!!state.selected?.recording}
          back={back}
          retry={() => {
            if (state.selected) controller?.open(state.selected);
          }}
          updates={updates}
        />
      ) : opened ? (
        <>
          <div className="v-an-stats">
            {[
              [t.best, lapTime(best)],
              [
                t.mean,
                lapTime(
                  times.length
                    ? times.reduce((a, b) => a + b, 0) / times.length
                    : null,
                ),
              ],
              [t.laps, opened.laps.length],
              [
                t.maxSpeed,
                speeds.length
                  ? `${decimal(Math.max(...speeds))} ${t.kmh}`
                  : t.dash,
              ],
            ].map(([label, value]) => (
              <div className="v-card" key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
          <div className="v-card v-an-tablewrap">
            <table className="v-table v-an-table">
              <caption>{`${t.laps} · ${t.approximate} · ${t.range}`}</caption>
              <thead>
                <tr>
                  {[
                    t.lap,
                    t.time,
                    t.delta,
                    t.speed,
                    t.throttle,
                    t.brake,
                    t.data,
                  ].map((label, i) => (
                    <th
                      scope="col"
                      key={label}
                      className={
                        i === 4 || i === 5 ? "v-an-secondary" : undefined
                      }
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {opened.laps.map((lap) => (
                  <tr
                    key={lap.index}
                    data-best={
                      (validTime(lap) !== null && validTime(lap) === best) ||
                      undefined
                    }
                  >
                    <th scope="row">{`${t.lap} ${lap.lap}`}</th>
                    <td className="v-an-number">{lapTime(validTime(lap))}</td>
                    <td className="v-an-number">
                      {validTime(lap) === null || best === null
                        ? t.dash
                        : validTime(lap) === best
                          ? t.best
                          : `≈+${(((validTime(lap) ?? best) - best) / 1000).toFixed(1)}`}
                    </td>
                    <td>
                      <Signal signal={lap.speed} factor={3.6} />
                    </td>
                    <td className="v-an-secondary">
                      <Signal signal={lap.throttle} factor={100} />
                    </td>
                    <td className="v-an-secondary">
                      <Signal signal={lap.brake} factor={100} />
                    </td>
                    <td>
                      {!lap.sealed
                        ? t.unsealed
                        : lap.gap
                          ? t.gap
                          : lap.lapTimeApproxMs === null
                            ? t.incomplete
                            : t.complete}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <details className="v-an-technical">
              <summary>{t.technical}</summary>
              <dl>
                {[
                  [t.watermark, opened.watermark],
                  [t.attempted, opened.attempted],
                  [t.total, opened.total],
                  [t.finished, opened.finished ? t.yes : t.no],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
              {opened.laps.map((l) => (
                <div key={l.index}>
                  <strong>{`${t.lap} ${l.lap} · ${t.samples}: ${l.samples}`}</strong>
                  {[t.speed, t.throttle, t.brake].map((label, i) => {
                    const s = [l.speed, l.throttle, l.brake][i];
                    return (
                      <p
                        key={label}
                      >{`${label}: ${t.reliable} ${s.reliable}, ${t.estimated} ${s.estimated}, ${t.stale} ${s.stale}, ${t.unavailable} ${s.unavailable}`}</p>
                    );
                  })}
                </div>
              ))}
            </details>
          </div>
        </>
      ) : (
        <AnalysisNotice title={t.empty} help={t.intro}>
          <Button onClick={back}>{t.back}</Button>
        </AnalysisNotice>
      )}
    </div>
  );
}
