import { reportExportStatuses } from "../generated/report_local";
import { isLocalReport } from "../report-local-validation";
import { isReportFields } from "../testing-validation";
import { exact } from "../validation-common";
export { report_localMethods as methods } from "../generated/report_local";
export function isRequest(value: Record<string, unknown>): boolean {
  switch (value.method) {
    case "report.localPrepare": return exact(value, ["method", "fields"]) && isReportFields(value.fields);
    case "report.localExport": return exact(value, ["method"]);
    default: return false;
  }
}
export function isReply(value: Record<string, unknown>): boolean {
  switch (value.method) {
    case "report.localPrepare": return exact(value, ["method", "value"]) && isLocalReport(value.value);
    case "report.localExport": return exact(value, ["method", "status"]) && reportExportStatuses.some((status) => status === value.status);
    default: return false;
  }
}
export function isError(_value: Record<string, unknown>): boolean { return false; }
export function isEvent(_value: Record<string, unknown>): boolean { return false; }
