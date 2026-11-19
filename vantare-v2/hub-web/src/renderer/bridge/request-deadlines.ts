import {
  type Request,
  requestTimeoutMs,
} from "../../contract/generated/contract";
import { strategyPickLifetimeSeconds } from "../../contract/generated/strategy";

// The dialogs of Estrategia («Abrir…», «Guardar como…» and «Guardar como hoja de
// cálculo…») live as long as the host's ticket (120 s). Main has no timer of its
// own: it answers when the dialog closes, and tells the renderer the ticket expired
// if that is after the 120 s. The margin on top bounds a host (or a dialog that
// nobody closes) that never answers: after it the renderer gives up and the screen
// can show its notice while the dialog is still open. A timer in main that voids the
// ticket at 120 s would close that gap.
const strategyDialogMs = (strategyPickLifetimeSeconds + 15) * 1000;

// Native selection and atomic publication complete in main. Never report a
// timeout while main may still publish. Renderer cannot override deadlines.
export function requestDeadline(method: Request["method"]): number | undefined {
  return method === "report.localExport" ||
    method === "calendar.icsExport" ||
    method === "calendar.icsReplace"
    ? undefined
    : method === "strategy.pickFile" || method === "strategy.exportFile"
      ? strategyDialogMs
      : requestTimeoutMs;
}
