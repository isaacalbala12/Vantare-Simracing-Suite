import { describe, expect, it } from "vitest";
import { DRIVER_NAME_FORMATS, formatDriverName } from "./driver-name";

describe("formatDriverName", () => {
  it("returns the name untouched for full, absent or unknown modes", () => {
    expect(formatDriverName("María Costa")).toBe("María Costa");
    expect(formatDriverName("María Costa", {})).toBe("María Costa");
    expect(formatDriverName("María Costa", { format: {} })).toBe("María Costa");
    expect(formatDriverName("María Costa", { format: { mode: "full" } })).toBe("María Costa");
    expect(formatDriverName("María Costa", { format: { mode: "bogus" } })).toBe("María Costa");
  });

  it.each([
    { name: "María Costa", initial: "M. Costa", surname: "Costa" },
    { name: "Alessandro Pier Guidi", initial: "A. Pier Guidi", surname: "Pier Guidi" },
    { name: "Daniel  (Dani)  Sordo", initial: "D. Sordo", surname: "Sordo" },
    { name: "  María   Costa  ", initial: "M. Costa", surname: "Costa" },
  ])("formats $name per mode", ({ name, initial, surname }) => {
    expect(formatDriverName(name, { format: { mode: "initial" } })).toBe(initial);
    expect(formatDriverName(name, { format: { mode: "surname" } })).toBe(surname);
  });

  it("keeps single-word names and placeholders intact in every mode", () => {
    for (const mode of ["initial", "surname", "truncate"]) {
      expect(formatDriverName("Stoffel", { format: { mode } })).toBe("Stoffel");
      expect(formatDriverName("", { format: { mode } })).toBe("");
    }
    expect(formatDriverName(undefined, { format: { mode: "initial" } })).toBe("?");
    expect(formatDriverName(undefined, { format: { mode: "surname" } })).toBe("?");
    expect(formatDriverName(undefined)).toBe("?");
  });

  it("keeps the legacy truncate mode working", () => {
    expect(formatDriverName("María Costa", { format: { mode: "truncate", maxChars: 6 } })).toBe("María…");
    expect(formatDriverName("María Costa", { format: { mode: "truncate", maxChars: 64 } })).toBe("María Costa");
    expect(formatDriverName("María Costa", { format: { mode: "truncate" } })).toBe("María Costa");
  });

  it("only exposes the three user-facing formats", () => {
    expect(DRIVER_NAME_FORMATS).toEqual(["full", "initial", "surname"]);
  });
});
