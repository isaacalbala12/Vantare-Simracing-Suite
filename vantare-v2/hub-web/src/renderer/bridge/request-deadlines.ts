import {
  type Request,
  requestTimeoutMs,
} from "../../contract/generated/contract";

// Native selection and atomic publication complete in main. Never report a
// timeout while main may still publish. Renderer cannot override deadlines.
export function requestDeadline(method: Request["method"]): number | undefined {
  return method === "report.localExport" ||
    method === "calendar.icsExport" ||
    method === "calendar.icsReplace"
    ? undefined
    : requestTimeoutMs;
}
