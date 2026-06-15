import { describe, expect, it } from "vitest";
import { resolveSessionMode } from "./telemetry-ref";

describe("resolveSessionMode", () => {
  it("detects practice from sessionName", () => {
    expect(resolveSessionMode(10, "PRACTICE1")).toBe("practice");
    expect(resolveSessionMode(1, "PRACTICE2")).toBe("practice");
  });
  it("detects qualifying from sessionName", () => {
    expect(resolveSessionMode(2, "QUALIFY1")).toBe("qualifying");
  });
  it("detects race from sessionName", () => {
    expect(resolveSessionMode(11, "RACE")).toBe("race");
    expect(resolveSessionMode(3, "RACE1")).toBe("race");
  });
  it("falls back to sessionType", () => {
    expect(resolveSessionMode(1, "")).toBe("practice");
    expect(resolveSessionMode(2, "")).toBe("qualifying");
    expect(resolveSessionMode(3, "")).toBe("race");
  });
  it("defaults to race for unknown values", () => {
    expect(resolveSessionMode(99, "UNKNOWN")).toBe("race");
  });
});
