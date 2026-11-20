import type { AnalysisLap } from "../../../contract/generated/analysis";
import { hasSectors, sectorRows, sectorsWhy } from "../../app/analysis-sectors";
import { Icon } from "../../assets/icons/Icon";
import {
  sectorDelta,
  sectorTime,
  analysisText as t,
} from "../../i18n/analysis.es";
import { comparisonText as c } from "../../i18n/comparison.es";
import { TrackedCaps } from "../TrackedCaps";

const Note = ({ children }: { children: string }) => (
  <p className="v-an-common v-an-sector-why">
    <Icon name="info" />
    <span>{children}</span>
  </p>
);
const time = (ms: number | null) => (ms === null ? t.dash : sectorTime(ms));

/** «Por sector»: A, B y A−B por sector, solo con lo que manda el host. */
export function SectorComparison({
  laps,
  a,
  b,
}: {
  laps: readonly AnalysisLap[];
  a?: AnalysisLap;
  b?: AnalysisLap;
}) {
  if (!hasSectors(laps))
    return (
      <div className="v-card v-an-sector-card">
        <Note>{c.recordingWithoutSectors}</Note>
      </div>
    );
  const reasons = (
    [
      ["A", a],
      ["B", b],
    ] as const
  ).flatMap(([side, lap]) => {
    const why = sectorsWhy(lap);
    return lap && why ? [c.sectorsWhy(side, lap.lap, why)] : [];
  });
  return (
    <div className="v-card v-an-sector-card">
      <table className="v-an-sectors">
        <caption className="v-sr-only">{c.sectorTable}</caption>
        <thead>
          <tr>
            <th scope="col" className="v-an-sectors-title">
              <TrackedCaps>{c.bySector}</TrackedCaps>
            </th>
            {(["a", "b"] as const).map((side) => (
              <th scope="col" key={side}>
                <span className="v-an-legend">
                  <span className={`v-an-series-${side}`}>
                    {c.line(c[side], (side === "a" ? a : b)?.lap)}
                  </span>
                </span>
              </th>
            ))}
            <th scope="col">{c.sectorDifference}</th>
          </tr>
        </thead>
        <tbody>
          {sectorRows(a, b).map((row, i) => (
            <tr key={t.sector(i + 1)}>
              <th scope="row" aria-label={t.sectorName(i + 1)}>
                {t.sector(i + 1)}
              </th>
              <td className="v-an-number">{time(row.a)}</td>
              <td className="v-an-number">{time(row.b)}</td>
              <td className="v-an-sector-delta">
                {row.diff === null ? (
                  t.dash
                ) : (
                  <>
                    <span
                      className={`v-an-number ${row.diff > 0 ? "v-an-compare-loss" : row.diff < 0 ? "v-an-compare-gain" : ""}`}
                    >
                      {sectorDelta(row.diff)}
                    </span>
                    <small>
                      {row.diff > 0
                        ? c.sectorLoses
                        : row.diff < 0
                          ? c.sectorWins
                          : c.sectorTies}
                    </small>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {reasons.length > 0 && (
        <Note>
          {[reasons.length === 2 ? c.noneHaveSectors : "", ...reasons]
            .filter(Boolean)
            .join(" ")}
        </Note>
      )}
    </div>
  );
}
