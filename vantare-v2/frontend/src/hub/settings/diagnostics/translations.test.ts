import { describe, expect, it } from "vitest";
import {
  diagnosticsEn,
  diagnosticsEs,
  diagnosticsIt,
  diagnosticsPt,
} from "./translations";

describe("diagnostics translations", () => {
  it("keeps every locale on the same closed key set", () => {
    const expected = Object.keys(diagnosticsEs).sort();
    expect(Object.keys(diagnosticsEn).sort()).toEqual(expected);
    expect(Object.keys(diagnosticsIt).sort()).toEqual(expected);
    expect(Object.keys(diagnosticsPt).sort()).toEqual(expected);
  });

  it("uses Brazilian Portuguese terminology in the complete diagnostics block", () => {
    const copy = Object.values(diagnosticsPt).join(" ");
    expect(copy).not.toMatch(/\b(partilhar|demasiado|Factos|Travão)\b/u);
    expect(diagnosticsPt["diagnostics.inspector.facts"]).toBe("Fatos");
    expect(diagnosticsPt["diagnostics.field.brake"]).toBe("Freio");
    expect(diagnosticsPt["diagnostics.title"]).toContain("Inspetor");
  });
});
