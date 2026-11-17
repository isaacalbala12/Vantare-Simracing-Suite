import type { ReactNode } from "react";
import type {
  AnalysisLap,
  AnalysisSignal,
} from "../../../contract/generated/analysis";
import type {
  AnalysisController,
  AnalysisSnapshot,
  Opened,
} from "../../app/AnalysisController";
import {
  estimatedLap,
  lapDataKind,
  summarizeLaps,
  validLapTime,
} from "../../app/analysis-laps";
import { Icon } from "../../assets/icons/Icon";
import {
  decimal,
  deltaTime,
  lapTime,
  percentage,
  recordingDateLabel,
  size,
  analysisText as t,
} from "../../i18n/analysis.es";
import { Button, IconButton } from "../Button";
import { Badge, Card } from "../Data";
import { TrackedCaps } from "../TrackedCaps";
import { AnalysisError, AnalysisNotice, RecordingStrip } from "./Analysis";
import { RecordingChart } from "./RecordingChart";
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
function LapRow({ lap, best }: { lap: AnalysisLap; best: number | null }) {
  const time = validLapTime(lap);
  const kind = lapDataKind(lap);
  const delta = time === null || best === null ? null : time - best;
  return (
    <tr data-best={delta === 0 || undefined}>
      <th scope="row" className="v-an-lap-label">{`${t.lap} ${lap.lap}`}</th>
      <td className="v-an-number">{lapTime(time)}</td>
      <td
        className={`v-an-number ${delta === null ? "" : delta === 0 ? "v-an-gain" : "v-an-loss"}`}
      >
        {delta === null ? t.dash : delta === 0 ? t.fastest : deltaTime(delta)}
      </td>
      <td className="v-an-number">
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
      </td>
    </tr>
  );
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
  enabled,
}: {
  state: AnalysisSnapshot;
  controller?: AnalysisController;
  updates: () => void;
  enabled: boolean;
}) {
  const now = useRecordingClock(Date.now);
  const opened = state.opened;
  const summary = summarizeLaps(opened?.laps ?? []);
  const back = () => controller?.load();
  const metrics: [string, ReactNode, string][] = [
    [
      t.best,
      lapTime(summary.bestTime),
      summary.best ? t.lapNumber(summary.best.lap) : t.dash,
    ],
    [t.mean, lapTime(summary.mean), t.meanHelp(summary.complete)],
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
              ? `${recordingDateLabel(state.selected.startedAtMs, now).replace(", ", " · ")} · ${size(state.selected.sizeBytes)}`
              : t.dash}
          </p>
          <h1>
            <em>{t.track}</em>
            {" · "}
            <em>{t.car}</em>
          </h1>
        </div>
      </header>
      <RecordingStrip
        enabled={enabled}
        recording={state.rows.some((row) => row.recording)}
      />
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
            laps={opened.laps}
            bestTime={summary.bestTime}
            bestLap={summary.best?.lap}
          />
          <div className="v-an-laps-card">
            <Card title={<TrackedCaps>{t.laps}</TrackedCaps>}>
              <div className="v-an-tablewrap">
                <table className="v-table v-an-table v-an-laps">
                  <caption className="v-sr-only">{`${t.laps} · ${t.approximate} · ${t.speed}`}</caption>
                  <thead>
                    <tr>
                      {[
                        t.lap,
                        t.time,
                        t.delta,
                        t.speedMax,
                        t.speedMean,
                        t.throttleColumn,
                        t.brakeColumn,
                        t.data,
                      ].map((label, i) => (
                        <th
                          scope="col"
                          key={label}
                          className={`v-an-lap-column${i >= 4 && i <= 6 ? " v-an-lap-secondary" : ""}`}
                        >
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {opened.laps.map((lap) => (
                      <LapRow
                        key={lap.index}
                        lap={lap}
                        best={summary.bestTime}
                      />
                    ))}
                  </tbody>
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
