import { prepareResidentResults } from "../check-resident-results.ts";
import type { VisualScene } from "./scenes.ts";
export const residentResultsScenes:Record<string,VisualScene>={};
for (const state of ["mixed","accepted","rejected","finished","unsupported","unknown","timeout","gap","restart","stale","inert"]) {
  residentResultsScenes[`launcher-results-${state}`]={
    mock:`launcher-results-${state==="inert" ? "mixed" : state}`,
    prepare:page=>prepareResidentResults(page,state),
  };
}
