import { describe, expect, it } from "vitest";
import {
  buildDiagnosticsBlob,
  diagnosticsFilename,
} from "./diagnostics-actions";
import {
  fixtureGeneratedAtUtc,
  fixturePayload,
} from "./test-fixtures";

describe("diagnostics exact browser actions", () => {
  it("builds an UTF-8 JSON blob from the exact payload without stringifying again", async () => {
    const blob = buildDiagnosticsBlob(fixturePayload);

    expect(blob.type).toBe("application/json;charset=utf-8");
    expect(await blob.text()).toBe(fixturePayload);
    expect(await blob.text()).not.toBe(JSON.stringify(fixturePayload));
  });

  it("derives a local filename without exposing paths", () => {
    expect(diagnosticsFilename(fixtureGeneratedAtUtc)).toBe(
      "vantare-diagnostics-2026-07-31T10-15-30Z.json",
    );
  });
});
