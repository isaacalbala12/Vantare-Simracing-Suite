import type {
  DiagnosticsErrorCode,
  DiagnosticsSession,
} from "./contracts";

// Local AA correction for normal diagnostics copy on the #0F0F0F card surface.
// The global default (#7A7A7A) measures 4.466:1; this measures 4.592:1.
export const DIAGNOSTICS_MUTED_TEXT_COLOR = "#7C7C7C";

export type RequestStatus =
  | "idle"
  | "loading"
  | "ready"
  | "empty"
  | "error"
  | "timeout"
  | "canceled";

export type RequestState<T> = {
  status: RequestStatus;
  data?: T;
  code?: DiagnosticsErrorCode;
};

export type DiagnosticsActionState =
  | "idle"
  | "copied"
  | "downloaded"
  | "error";

export type Translate = (key: string) => string;
export type ErrorText = (code?: DiagnosticsErrorCode) => string;

export function badgeClass(
  kind: DiagnosticsSession["compatibility"],
): string {
  switch (kind) {
    case "current":
      return "border-emerald-400/30 bg-emerald-400/10 text-emerald-300";
    case "future":
      return "border-cyan-400/30 bg-cyan-400/10 text-cyan-300";
    case "corrupt":
      return "border-red-400/30 bg-red-400/10 text-red-300";
  }
}

export function formatBytes(bytes: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(
    bytes / 1024,
  );
}

export function formatDate(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
