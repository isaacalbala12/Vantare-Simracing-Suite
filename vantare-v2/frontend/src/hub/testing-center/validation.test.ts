import { describe, expect, it } from "vitest";
import { hasReportFieldErrors, normalizedReportFields, validateReportFields } from "./validation";

describe("Testing Center report validation", () => {
  it("requires the three reproduction fields and validates UTF-8 byte limits", () => {
    const errors = validateReportFields({
      actionText: "  ", expectedText: "ok", observedText: "x".repeat(2049),
      contextText: "", module: "hub",
    });
    expect(errors.actionText).toBe("required");
    expect(errors.expectedText).toBe("required");
    expect(errors.observedText).toBe("too_long");
    expect(hasReportFieldErrors(errors)).toBe(true);
  });

  it("trims transport fields without changing the closed module", () => {
    expect(normalizedReportFields({
      actionText: " action ", expectedText: " expected ", observedText: " observed ",
      contextText: " context ", module: "launcher",
    })).toEqual({
      actionText: "action", expectedText: "expected", observedText: "observed",
      contextText: "context", module: "launcher",
    });
  });
});
