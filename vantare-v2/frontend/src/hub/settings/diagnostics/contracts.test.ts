import { describe, expect, it } from "vitest";
import {
  DiagnosticsContractError,
  decodeDiagnosticsErrorEvent,
  decodeDiagnosticsSessionListEvent,
  decodePreparedDiagnosticsEvent,
} from "./contracts";
import {
  fixtureCurrentSession,
  fixturePayload,
  fixturePrepared,
} from "./test-fixtures";

function rawPrepared() {
  return {
    schemaVersion: fixturePrepared.schemaVersion,
    generatedAtUtc: fixturePrepared.generatedAtUtc,
    payload: fixturePrepared.payload,
    sha256: fixturePrepared.sha256,
    byteSize: fixturePrepared.byteSize,
  };
}

describe("diagnostics closed decoders", () => {
  it("accepts the exact allowlisted prepared payload without regenerating it", () => {
    const decoded = decodePreparedDiagnosticsEvent({
      requestId: "request-1234",
      prepared: rawPrepared(),
    });

    expect(decoded.prepared.payload).toBe(fixturePayload);
    expect(decoded.prepared.report.telemetry).toEqual({
      source: "lmu",
      live: true,
      available: true,
    });
  });

  it.each([
    ["path", "C:\\Users\\driver\\telemetry"],
    ["root", "\\\\server\\private"],
    ["database", "history-v1.sqlite"],
    ["sessionId", "session-personal"],
  ])("rejects unsafe or unknown session field %s", (key, value) => {
    expect(() =>
      decodeDiagnosticsSessionListEvent({
        requestId: "request-1234",
        result: {
          sessions: [{ ...fixtureCurrentSession, [key]: value }],
          truncated: false,
        },
      }),
    ).toThrow(DiagnosticsContractError);
  });

  it("rejects unknown fields inside the immutable diagnostics payload", () => {
    const report = JSON.parse(fixturePayload) as Record<string, unknown>;
    report.telemetryPath = "C:\\Users\\driver\\Telemetry";
    const payload = JSON.stringify(report);

    expect(() =>
      decodePreparedDiagnosticsEvent({
        requestId: "request-1234",
        prepared: {
          ...rawPrepared(),
          payload,
          byteSize: new TextEncoder().encode(payload).byteLength,
        },
      }),
    ).toThrow(/unknown field telemetryPath/i);
  });

  it("rejects unknown backend error codes and messages", () => {
    expect(() =>
      decodeDiagnosticsErrorEvent({
        requestId: "request-1234",
        operation: "prepare",
        code: "disk_path_exposed",
      }),
    ).toThrow(DiagnosticsContractError);

    expect(() =>
      decodeDiagnosticsErrorEvent({
        requestId: "request-1234",
        operation: "prepare",
        code: "prepare_failed",
        message: "C:\\private",
      }),
    ).toThrow(/unknown field message/i);
  });
});
