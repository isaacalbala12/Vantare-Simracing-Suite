import type { CSSProperties } from "react";
import type { AnalysisLap } from "../../../contract/generated/analysis";
import { validLapTime } from "../../app/analysis-laps";
import { deltaTime, lapTime, analysisText as t } from "../../i18n/analysis.es";
export function RecordingChart({
  laps,
  bestTime,
  bestLap,
}: {
  laps: AnalysisLap[];
  bestTime: number | null;
  bestLap?: number;
}) {
  const deltas = laps.map((lap) => {
    const time = validLapTime(lap);
    return time === null || bestTime === null ? null : time - bestTime;
  });
  const scale = deltas.reduce<number>(
    (max, value) => Math.max(max, value ?? 0),
    1,
  );
  return (
    <figure className="v-card v-an-chart">
      <figcaption className="v-card-header">
        <h2>{t.chartTitle}</h2>
        <p className="v-an-chart-help">
          {bestLap === undefined ? t.chartMissing : t.chartHelp(bestLap)}
        </p>
      </figcaption>
      <section className="v-an-chart-scroll" aria-label={t.chartTitle}>
        <ol>
          {laps.map((lap, i) => {
            const delta = deltas[i];
            const best = delta === 0;
            const height =
              delta === null ? 100 : Math.max(2, (delta / scale) * 100);
            const label = `${t.lap} ${lap.lap} · ${lapTime(validLapTime(lap))} · ${best ? t.fastest : delta === null ? t.dash : deltaTime(delta)}`;
            return (
              <li
                key={lap.index}
                style={{ "--an-level": height / 104 } as CSSProperties}
              >
                <div className="v-an-bar-lane">
                  <span>
                    {best
                      ? t.fastest
                      : delta === null
                        ? t.dash
                        : deltaTime(delta)}
                  </span>
                  <svg
                    className="v-an-bar-shape"
                    viewBox="0 0 32 104"
                    role="img"
                    aria-label={label}
                    preserveAspectRatio="none"
                  >
                    <rect
                      x="2"
                      y={102 - height}
                      width="28"
                      height={height}
                      rx="3"
                      className={
                        delta === null
                          ? "v-an-bar-gap"
                          : best
                            ? "v-an-bar-best"
                            : "v-an-bar"
                      }
                    />
                  </svg>
                </div>
                <span>{lap.lap}</span>
              </li>
            );
          })}
        </ol>
      </section>
    </figure>
  );
}
