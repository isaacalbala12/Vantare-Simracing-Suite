import {
  type Request,
  requestTimeoutMs,
} from "../../contract/generated/contract";

// The native save dialog is user-paced. Renderer arguments cannot override deadlines.
export function requestDeadline(method: Request["method"]): number | undefined {
  return method === "report.localExport" ? undefined : requestTimeoutMs;
}
