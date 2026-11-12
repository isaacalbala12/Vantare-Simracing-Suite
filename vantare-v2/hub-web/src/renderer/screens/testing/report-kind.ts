import type { ReportFields } from "../../../contract/generated/testing";
import { reportFieldLimits } from "../../../contract/generated/testing";
import { reportText as text } from "../../i18n/testing-report";

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

export function reportErrors(fields: ReportFields) {
  const keys = [
    "actionText",
    "expectedText",
    "observedText",
    "contextText",
  ] as const;
  const showRequired = keys.slice(0, 3).some((key) => fields[key].length > 0);
  return Object.fromEntries(
    keys.map((key, index) => {
      const value = fields[key];
      const size = new TextEncoder().encode(value.trim()).length;
      const tooLong =
        new TextEncoder().encode(value).length > reportFieldLimits[index];
      const invalid = /[\p{Cc}]/u.test(value.replace(/[\t\n]/g, ""));
      return [
        key,
        tooLong
          ? text.tooLong
          : invalid
            ? text.invalidText
            : showRequired && index < 3 && size < 3
              ? text.tooShort
              : undefined,
      ];
    }),
  ) as Partial<Record<keyof ReportFields, string>>;
}
