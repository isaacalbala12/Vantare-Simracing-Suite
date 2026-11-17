import { type ReactNode, useEffect, useRef, useState } from "react";
import type { AnalysisRow } from "../../../contract/generated/analysis";
import type {
  AnalysisController,
  AnalysisSnapshot,
} from "../../app/AnalysisController";
import { Icon } from "../../assets/icons/Icon";
import {
  date,
  day,
  lapTime,
  size,
  analysisText as t,
} from "../../i18n/analysis.es";
import { Button } from "../Button";
import { Callout, Skeleton } from "../Data";
import { SearchInput } from "../Forms";
import { RailBlock, SectionPageHeader } from "../Frame";
import "./analysis.css";
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
}: {
  title: string;
  help?: string;
  children?: ReactNode;
}) {
  return (
    <div className="v-card v-an-notice">
      <div>
        <Icon name="pulse" />
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
}: {
  row: AnalysisRow;
  state: AnalysisSnapshot;
  controller?: AnalysisController;
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
      <td>{date(row.startedAtMs)}</td>
      <td>
        <span className="v-an-open">
          <strong>{t.track}</strong>
          <span>{t.car}</span>
        </span>
      </td>
      <td className="v-an-secondary">{readable ? inspection.laps : t.dash}</td>
      <td className="v-an-secondary v-an-number">
        {lapTime(readable ? inspection.bestLapApproxMs : null)}
      </td>
      <td className="v-an-number">{size(row.sizeBytes)}</td>
      <td>
        <span
          className="v-an-state"
          data-state={row.recording ? "recording" : inspection?.state}
        >
          {status}
        </span>
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
}: {
  state: AnalysisSnapshot;
  controller?: AnalysisController;
  enabled: boolean;
  settings: () => void;
}) {
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
  const days = [...new Set(rows.map((r) => day(r.startedAtMs)))];
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
            <div className="v-card v-an-loading">
              {["a", "b", "c", "d", "e", "f", "g"].map((id) => (
                <Skeleton key={id} label={t.loading} />
              ))}
            </div>
          </>
        ) : null
      ) : state.error ? (
        <AnalysisNotice title={t.catalogTitle} help={t.catalogHelp}>
          <Button onClick={controller?.load}>{t.retry}</Button>
        </AnalysisNotice>
      ) : !state.rows.length ? (
        <AnalysisNotice
          title={enabled ? t.empty : t.off}
          help={enabled ? t.emptyHelp : t.offHelp}
        >
          <Button onClick={enabled ? () => setHow(!how) : settings}>
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
            <thead>
              <tr>
                {[
                  t.date,
                  t.vehicle,
                  t.laps,
                  t.best,
                  t.size,
                  t.state,
                  t.dash,
                ].map((label, i) => (
                  <th
                    scope="col"
                    key={label}
                    className={
                      i === 2 || i === 3 ? "v-an-secondary" : undefined
                    }
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            {days.map((d) => (
              <tbody key={d}>
                <tr className="v-an-day">
                  <th colSpan={2} scope="rowgroup">
                    {d}
                  </th>
                </tr>
                {rows
                  .filter((r) => day(r.startedAtMs) === d)
                  .map((row) => (
                    <RecordingRow
                      key={row.id}
                      row={row}
                      state={state}
                      controller={controller}
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
