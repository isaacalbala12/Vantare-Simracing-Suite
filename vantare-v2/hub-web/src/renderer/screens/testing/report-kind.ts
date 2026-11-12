import { reportFieldLimits } from "../../../contract/generated/testing";

const prefixes = ["Tipo: Algo falla\n", "Tipo: Sugerencia\n"] as const;
export function reportSuggestion(context: string) {
  return context.startsWith(prefixes[1]);
}
/** Same local draft prefix as GPUI model::with_report_kind; never truncate a note. */
export function withReportKind(
  context: string,
  suggestion: boolean,
): string | undefined {
  const prefix = prefixes.find((value) => context.startsWith(value));
  const text = prefix ? context.slice(prefix.length) : context;
  const result = prefixes[suggestion ? 1 : 0] + text;
  return new TextEncoder().encode(result).length <= reportFieldLimits[3]
    ? result
    : undefined;
}
