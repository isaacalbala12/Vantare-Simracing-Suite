import {
  type Request,
  requestTimeoutMs,
} from "../../contract/generated/contract";
import { strategyPickLifetimeSeconds } from "../../contract/generated/strategy";

// The dialogs of Estrategia («Abrir…», «Guardar como…» and «Guardar como hoja de
// cálculo…») live as long as the host's ticket; main answers when the ticket
// expires. A margin on top only bounds a host that never answers.
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
