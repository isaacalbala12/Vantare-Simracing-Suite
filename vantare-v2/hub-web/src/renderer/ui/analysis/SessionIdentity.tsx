import type { AnalysisSessionSummary } from "../../../contract/generated/analysis";
import { analysisText as t } from "../../i18n/analysis.es";

export function SessionTrack({
  session,
}: {
  session?: AnalysisSessionSummary;
}) {
  return session?.trackName || <em>{t.track}</em>;
}

export function SessionVehicle({
  session,
}: {
  session?: AnalysisSessionSummary;
}) {
  return (
    <>
      {session?.vehicle || <em>{t.car}</em>}
      {session?.className && ` · ${session.className}`}
    </>
  );
}
