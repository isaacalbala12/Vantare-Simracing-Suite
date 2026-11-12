import { expect, it } from "vitest";
import { reportFieldLimits } from "../src/contract/generated/testing";
import {
  reportSuggestion,
  withReportKind,
} from "../src/renderer/screens/testing/report-kind";

it("uses the GPUI local prefix without duplicating it or changing the note", () => {
  expect(withReportKind("Mi nota", true)).toBe("Tipo: Sugerencia\nMi nota");
  expect(withReportKind("Tipo: Sugerencia\nMi nota", false)).toBe(
    "Tipo: Algo falla\nMi nota",
  );
  expect(withReportKind("Tipo: Algo falla\nMi nota", false)).toBe(
    "Tipo: Algo falla\nMi nota",
  );
  expect(reportSuggestion("Tipo: Sugerencia\nNota")).toBe(true);
  expect(reportSuggestion("Nota\nTipo: Sugerencia\n")).toBe(false);
});
it("refuses an overflowing UTF-8 prefix without truncating the local note", () => {
  const prefix = new TextEncoder().encode("Tipo: Sugerencia\n").length;
  const note = "x".repeat(reportFieldLimits[3] - prefix);
  expect(withReportKind(note, true)).toBe(`Tipo: Sugerencia\n${note}`);
  expect(withReportKind(`${note}ñ`, true)).toBeUndefined();
  expect(
    withReportKind("🙂".repeat(reportFieldLimits[3] / 4), true),
  ).toBeUndefined();
});
