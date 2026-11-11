import {
  reportBinaryNames,
  reportBinaryStates,
  reportExportLimit,
} from "./generated/contract";
import { isReportPreviewId } from "./testing-validation";
import { exact, oneOf, record } from "./validation-common";

export function isLocalReport(value: unknown): boolean {
  return (
    record(value) &&
    exact(value, ["core", "binaries", "report", "preparedHash"]) &&
    isReportPreviewId(value.preparedHash) &&
    oneOf(value.core, ["connected", "incompatible", "unavailable"]) &&
    typeof value.report === "string" &&
    new TextEncoder().encode(value.report).length <= reportExportLimit &&
    Array.isArray(value.binaries) &&
    value.binaries.length <= reportBinaryNames.length &&
    new Set(value.binaries.map((binary) => record(binary) && binary.name))
      .size === value.binaries.length &&
    value.binaries.every(
      (binary) =>
        record(binary) &&
        exact(binary, ["name", "state", "sha256"]) &&
        oneOf(binary.name, reportBinaryNames) &&
        oneOf(binary.state, reportBinaryStates) &&
        (binary.state === "present"
          ? isReportPreviewId(binary.sha256)
          : binary.sha256 === null),
    )
  );
}
