import type { AnalysisLap } from "../../../contract/generated/analysis";
import { lapSectors, type SectorIndex } from "../../app/analysis-sectors";
import { sectorTime, analysisText as t } from "../../i18n/analysis.es";

/** Marca de «mejor sector»: un recuadro (forma, no solo color) más texto para lectores de pantalla. */
export function BestSector({
  ms,
  n,
  perSession,
}: SectorProps & { ms: number }) {
  return (
    <>
      <span className="v-an-sector-best" title={t.bestSector(n, perSession)}>
        {sectorTime(ms)}
      </span>
      <span className="v-sr-only">{t.bestSectorHidden(n)}</span>
    </>
  );
}
type SectorProps = { n: number; perSession: boolean };
const sectorNumber = [1, 2, 3] as const;

/** Celdas S1–S3 de una vuelta: tiempos, o «—» (con «sin dato» para lectores) si no hay sectores. */
export function SectorCells({
  lap,
  isBest,
  perSession,
}: {
  lap: AnalysisLap;
  isBest: (lap: AnalysisLap, sector: SectorIndex) => boolean;
  perSession: boolean;
}) {
  const sectors = lapSectors(lap);
  return ([0, 1, 2] as const).map((i) => (
    <td key={i} className={`v-an-number${sectors ? "" : " v-an-dash"}`}>
      {!sectors ? (
        <>
          <span aria-hidden="true">{t.dash}</span>
          <span className="v-sr-only">{t.noData}</span>
        </>
      ) : isBest(lap, i) ? (
        <BestSector
          ms={sectors[i]}
          n={sectorNumber[i]}
          perSession={perSession}
        />
      ) : (
        sectorTime(sectors[i])
      )}
    </td>
  ));
}
