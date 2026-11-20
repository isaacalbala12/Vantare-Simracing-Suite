import type { ReactNode } from "react";
import type {
  AnalysisLap,
  AnalysisSessionSummary,
  AnalysisSignal,
} from "../../../contract/generated/analysis";
import type {
  AnalysisController,
  AnalysisSnapshot,
  Opened,
} from "../../app/AnalysisController";
import { recordingZone } from "../../app/analysis-dates";
import {
  bestApproximateLapTime,
  estimatedLap,
  groupSessionLaps,
  lapDataKind,
  lapTime,
  orderedSessions,
  recordingBestTime,
  summarizeLaps,
} from "../../app/analysis-laps";
import {
  hasSectors,
  lapSectors,
  type SectorIndex,
  sectorBests,
} from "../../app/analysis-sectors";
import { Icon } from "../../assets/icons/Icon";
import {
  decimal,
  deltaTime,
  lapTime as formatLapTime,
  percentage,
  recordingDateLabel,
  sessionType,
  size,
  analysisText as t,
} from "../../i18n/analysis.es";
import { comparisonText } from "../../i18n/comparison.es";
import { Button, IconButton } from "../Button";
import { Badge, Card } from "../Data";
import { TrackedCaps } from "../TrackedCaps";
import { AnalysisError, AnalysisNotice } from "./Analysis";
import { CompareAction, LapChoices } from "./LapChoices";
import { RecordingChart } from "./RecordingChart";
import { SectorCells } from "./SectorCells";
import { SessionTrack, SessionVehicle } from "./SessionIdentity";
import { useRecordingClock } from "./useRecordingClock";

function Pedal({
  signal,
  label,
  brake = false,
}: {
  signal: AnalysisSignal;
  label: string;
  brake?: boolean;
}) {
  return signal.mean === null ? (
    t.dash
  ) : (
    <span className={`v-an-pedal${brake ? " v-an-pedal--brake" : ""}`}>
      <span>{percentage(signal.mean)}</span>
      <meter min={0} max={1} value={signal.mean} aria-label={label} />
    </span>
  );
}
type Sectors = {
  isBest: (lap: AnalysisLap, sector: SectorIndex) => boolean;
  perSession: boolean;
};
function LapRow({
  lap,
  best,
  state,
  controller,
  sectors,
}: {
  lap: AnalysisLap;
  best: number | null;
  state: AnalysisSnapshot;
  controller?: AnalysisController;
  sectors?: Sectors;
}) {
  const { ms: time, official } = lapTime(lap);
  const kind = lapDataKind(lap);
  const delta = time === null || best === null ? null : time - best;
  return (
    <tr data-best={delta === 0 || undefined}>
      <th scope="row" className="v-an-lap-label">{`${t.lap} ${lap.lap}`}</th>
      <td className="v-an-number">{formatLapTime(time, official)}</td>
      {sectors && <SectorCells lap={lap} {...sectors} />}
      <td
        className={`v-an-number ${delta === null ? "" : delta === 0 ? "v-an-gain" : "v-an-loss"}`}
      >
        {delta === null ? t.dash : delta === 0 ? t.fastest : deltaTime(delta)}
      </td>
      <td className="v-an-number v-an-lap-vmax">
        {lap.speed.max === null ? t.dash : decimal(lap.speed.max * 3.6)}
      </td>
      <td className="v-an-number v-an-lap-secondary">
        {lap.speed.mean === null ? t.dash : decimal(lap.speed.mean * 3.6)}
      </td>
      <td className="v-an-lap-secondary">
        <Pedal signal={lap.throttle} label={t.throttle} />
      </td>
      <td className="v-an-lap-secondary">
        <Pedal signal={lap.brake} label={t.brake} brake />
      </td>
      <td>
        <Badge
          dot
          tone={
            kind === "complete" ? "ok" : kind === "gap" ? "warn" : "neutral"
          }
        >
          {t[kind]}
        </Badge>
        {estimatedLap(lap) && (
          <small className="v-an-lap-note">{t.estimatedData}</small>
        )}
        {sectors && official && !lapSectors(lap) && (
          <small className="v-an-lap-note">{t.noSectorsGiven}</small>
        )}
      </td>
      <td>
        <LapChoices lap={lap} state={state} controller={controller} />
      </td>
    </tr>
  );
}
function SessionMeta({
  session,
  title,
}: {
  session: AnalysisSessionSummary;
  title?: string;
}) {
  const labels = [
    title ?? sessionType(session),
    !session.sealed ? t.interrupted : undefined,
    session.positionAtClose !== null
      ? t.closingPosition(session.positionAtClose)
      : undefined,
  ].filter(Boolean);
  return labels.length > 0 && <span>{labels.join(" · ")}</span>;
}
function Technical({ opened }: { opened: Opened }) {
  return (
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
      {opened.laps.map((lap) => (
        <div key={lap.index}>
          <strong>{`${t.lap} ${lap.lap} · ${t.samples}: ${lap.samples}`}</strong>
          {[t.speed, t.throttle, t.brake].map((label, i) => {
            const s = [lap.speed, lap.throttle, lap.brake][i];
            const factor = i === 0 ? 3.6 : 100;
            const values = [s.min, s.mean, s.max]
              .map((value) =>
                value === null ? t.dash : decimal(value * factor),
              )
              .join(" / ");
            return (
              <p
                key={label}
              >{`${label} (${t.range}): ${values}. ${t.reliable} ${s.reliable}, ${t.estimated} ${s.estimated}, ${t.stale} ${s.stale}, ${t.unavailable} ${s.unavailable}`}</p>
            );
          })}
        </div>
      ))}
    </details>
  );
}
export function AnalysisLaps({
  state,
  controller,
  updates,
  statusStrip,
  clock = Date.now,
  timeZone = recordingZone(),
}: {
  state: AnalysisSnapshot;
  controller?: AnalysisController;
  updates: () => void;
  statusStrip?: ReactNode;
  clock?: () => number;
  timeZone?: string;
}) {
  const now = useRecordingClock(clock, timeZone);
  const opened = state.opened;
  const summary = summarizeLaps(opened?.laps ?? []);
  const inspection = state.selected && state.inspections[state.selected.id];
  const best = recordingBestTime(
    opened?.sessions ?? [],
    inspection?.bestLapApproxMs ?? bestApproximateLapTime(opened?.laps ?? []),
  );
  const bestLap =
    best.ms === null
      ? undefined
      : opened?.laps.find((lap) => {
          if (best.official) {
            const time = lapTime(lap);
            return time.ms === best.ms && time.official;
          }
          return lap.sealed && !lap.gap && lap.lapTimeApproxMs === best.ms;
        });
  const sessions = orderedSessions(opened?.sessions);
  const withSectors = hasSectors(opened?.laps ?? []);
  const sectors: Sectors | undefined = withSectors
    ? sectorBests(opened?.laps ?? [], opened?.sessions ?? [])
    : undefined;
  const latest = sessions[0]?.session;
  const grouped = (opened?.sessions.length ?? 0) > 1;
  const sharedIdentity = opened?.sessions.every(
    (session) =>
      session.trackName === latest?.trackName &&
      session.vehicle === latest?.vehicle &&
      session.className === latest?.className,
  );
  const back = () => controller?.load();
  const metrics: [string, ReactNode, string][] = [
    [
      t.best,
      formatLapTime(best.ms, best.official),
      bestLap ? t.lapNumber(bestLap.lap) : t.dash,
    ],
    [
      t.mean,
      formatLapTime(summary.mean, summary.meanOfficial),
      t.meanHelp(summary.complete),
    ],
    [
      t.laps,
      String(opened?.laps.length ?? 0),
      t.lapCounts(summary.complete, summary.gaps, summary.withoutTime),
    ],
    [
      t.maxSpeed,
      summary.maxSpeed === null ? (
        t.dash
      ) : (
        <>
          {decimal(summary.maxSpeed)} <small>{t.kmh}</small>
        </>
      ),
      summary.fastest ? t.lapNumber(summary.fastest.lap) : t.dash,
    ],
  ];
  return (
    <div className="v-an-layout v-an-recording">
      <header className="v-an-heading">
        {opened && (
          <IconButton label={t.back} onClick={back}>
            <Icon name="chevron-left" />
          </IconButton>
        )}
        <div>
          <p className="v-an-heading-meta">
            {state.selected
              ? `${recordingDateLabel(state.selected.startedAtMs, now, timeZone).replace(", ", " · ")} · ${size(state.selected.sizeBytes)}`
              : t.dash}
          </p>
          <h1>
            <SessionTrack session={latest} />
            {" · "}
            <SessionVehicle session={latest} />
          </h1>
          {latest && (
            <div className="v-an-session-meta">
              <SessionMeta session={latest} />
            </div>
          )}
        </div>
      </header>
      {statusStrip}
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
          <dl className="v-an-stats">
            {metrics.map(([label, value, help]) => (
              <div className="v-card" key={label}>
                <dt>{label}</dt>
                <dd>
                  <strong>{value}</strong>
                  <small>{help}</small>
                </dd>
              </div>
            ))}
          </dl>
          <RecordingChart
            pair={state.pair}
            laps={opened.laps}
            bestTime={summary.bestTime}
            bestLap={summary.best?.lap}
          />
          <div className="v-an-lap-notes">
            {summary.approximate && (
              <p className="v-an-lap-note">{t.approximate}</p>
            )}
            {opened.laps.length > 0 &&
              (sectors ? (
                <p className="v-an-lap-note">
                  <span className="v-an-sector-best" aria-hidden="true">
                    {t.sectorSample}
                  </span>{" "}
                  {t.sectorLegend(sectors.perSession)}
                </p>
              ) : (
                <p className="v-an-lap-note">{t.recordingWithoutSectors}</p>
              ))}
            {sectors && summary.approximate && (
              <p className="v-an-lap-note">{t.approximateNoSectors}</p>
            )}
          </div>
          <div className="v-an-laps-card">
            <Card
              title={<TrackedCaps>{t.laps}</TrackedCaps>}
              actions={<CompareAction state={state} controller={controller} />}
            >
              <div className="v-an-tablewrap">
                <table
                  className={`v-table v-an-table v-an-laps${sectors ? " v-an-laps--sectors" : ""}`}
                >
                  <caption className="v-sr-only">
                    {[
                      t.laps,
                      !sessions.length || summary.approximate
                        ? t.approximate
                        : undefined,
                      sectors ? t.sectorsCaption : undefined,
                      t.speed,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </caption>
                  <thead>
                    <tr>
                      {[
                        [t.lap],
                        [t.time],
                        ...(sectors
                          ? [1, 2, 3].map((n) => [
                              t.sector(n),
                              "v-an-lap-sector",
                              t.sectorName(n),
                            ])
                          : []),
                        [t.delta, "v-an-lap-delta"],
                        [t.speedMax, "v-an-lap-vmax"],
                        [t.speedMean, "v-an-lap-secondary v-an-lap-vavg"],
                        [t.throttleColumn, "v-an-lap-secondary v-an-lap-pedal"],
                        [t.brakeColumn, "v-an-lap-secondary v-an-lap-pedal"],
                        [t.data, "v-an-lap-data"],
                        [comparisonText.choices, "v-an-lap-compare"],
                      ].map(([label, name = "", sector]) => (
                        <th
                          scope="col"
                          key={label}
                          aria-label={sector}
                          className={`v-an-lap-column ${name}`}
                        >
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  {groupSessionLaps(opened.laps, sessions).map(
                    ({ session, position, number, laps }) => (
                      <tbody key={position ?? "unassigned"}>
                        {grouped && session && number !== undefined && (
                          <tr className="v-an-session-row">
                            {(sectors ? [12, 8] : [9, 6]).map(
                              (columns, index) => (
                                <th
                                  key={columns}
                                  scope="rowgroup"
                                  colSpan={columns}
                                  className={
                                    index
                                      ? "v-an-session-narrow"
                                      : "v-an-lap-secondary"
                                  }
                                >
                                  <SessionMeta
                                    session={session}
                                    title={[
                                      sessionType(session) ??
                                        t.sessionNumber(number),
                                      ...(sharedIdentity
                                        ? []
                                        : [
                                            session.trackName,
                                            session.vehicle,
                                            session.className,
                                          ]),
                                    ]
                                      .filter(Boolean)
                                      .join(" · ")}
                                  />
                                </th>
                              ),
                            )}
                          </tr>
                        )}
                        {laps.map((lap) => (
                          <LapRow
                            state={state}
                            controller={controller}
                            key={lap.index}
                            lap={lap}
                            best={summary.bestTime}
                            sectors={sectors}
                          />
                        ))}
                      </tbody>
                    ),
                  )}
                </table>
              </div>
              <Technical opened={opened} />
            </Card>
          </div>
        </>
      ) : null}
    </div>
  );
}
