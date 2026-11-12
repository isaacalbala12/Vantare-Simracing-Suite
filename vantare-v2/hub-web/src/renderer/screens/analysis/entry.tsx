import { useState } from "react";
import { SectionChrome } from "../../app/SectionChrome";
import { analysisText as text } from "../../i18n/analysis";
import {
  AnalysisEmptyLayout,
  AnalysisRailLayout,
  type AnalysisReference,
} from "../../ui/analysis/AnalysisEmptyLayout";

/** Presentation only: analysis remains absent from beta navigation, as in GPUI. */
export default function Analysis() {
  const [reference, setReference] = useState<AnalysisReference>("best");
  return (
    <>
      <SectionChrome title={text.title} rail={<AnalysisRailLayout />} />
      <AnalysisEmptyLayout reference={reference} onReference={setReference} />
    </>
  );
}
