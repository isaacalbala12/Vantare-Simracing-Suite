import { type ReactNode, useEffect, useRef, useState } from "react";
import type { AnalysisRow } from "../../../contract/generated/analysis";
import type {
  AnalysisController,
  AnalysisSnapshot,
} from "../../app/AnalysisController";
import { recordingGroup, recordingGroups } from "../../app/analysis-dates";
import { Icon, type IconName } from "../../assets/icons/Icon";
import {
  date,
  lapTime,
  recordingDate,
  size,
  analysisText as t,
} from "../../i18n/analysis.es";
import { Button } from "../Button";
import { Badge, Callout, Skeleton } from "../Data";
import { SearchInput } from "../Forms";
import { RailBlock, SectionPageHeader } from "../Frame";
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
}: {
  title: string;
  icon?: IconName;
  help?: string;
  children?: ReactNode;
}) {
  return (
    <div className="v-card v-an-notice">
      <div>
        <Icon name={icon} />
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
}: {
  row: AnalysisRow;
  state: AnalysisSnapshot;
  controller?: AnalysisController;
  now: number;
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
    <tr ref={ref}>
      <td>
        <time
          dateTime={new Date(row.startedAtMs).toISOString()}
          title={date(row.startedAtMs)}
        >
          {recordingDate(row.startedAtMs, now)}
        </time>
      </td>
      <td>
        <span className="v-an-open">
          <em>{t.track}</em>
          <em>{t.car}</em>
        </span>
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
}: {
  state: AnalysisSnapshot;
  controller?: AnalysisController;
  enabled: boolean;
  settings: () => void;
  clock?: () => number;
}) {
  const now = useRecordingClock(clock);
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
    `${t.track} ${t.car} ${date(row.startedAtMs)}`
      .toLocaleLowerCase("es")
      .includes(needle),
  );
  const groups = recordingGroups.filter((group) =>
    rows.some((row) => recordingGroup(row.startedAtMs, now) === group),
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
                  .filter((r) => recordingGroup(r.startedAtMs, now) === group)
                  .map((row) => (
                    <RecordingRow
                      key={row.id}
                      row={row}
                      state={state}
                      controller={controller}
                      now={now}
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
