import { describe, expect, it } from "vitest";
import { createTestingCenterClient, mapAgentJobVisibleState, TestingCenterClientError, type TestingCenterEventTransport } from "./testing-center-client";

function fakeTransport(respond: (name: string, payload: Record<string, unknown>, emit: (name: string, value: unknown) => void) => void): TestingCenterEventTransport {
  const listeners = new Map<string, Set<(value: unknown) => void>>();
  const emitResponse = (name: string, value: unknown) => listeners.get(name)?.forEach((listener) => listener({ data: value }));
  return {
    emit(name, payload) { respond(name, payload as Record<string, unknown>, emitResponse); },
    on(name, listener) {
      const entries = listeners.get(name) ?? new Set();
      entries.add(listener);
      listeners.set(name, entries);
      return () => entries.delete(listener);
    },
  };
}

describe("Testing Center Wails client", () => {
  it("does not present a merged job as delivered before verified release", () => {
    expect(mapAgentJobVisibleState("merged_nightly")).toBe("verifying_nightly");
    expect(mapAgentJobVisibleState("smoke_running")).toBe("verifying_nightly");
    expect(mapAgentJobVisibleState("nightly_tagged")).toBe("verifying_nightly");
    expect(mapAgentJobVisibleState("completed")).toBe("available_nightly");
    expect(mapAgentJobVisibleState("revert_pr_open")).toBe("reverting_nightly");
    expect(mapAgentJobVisibleState("reverted")).toBe("reverted_nightly");
    expect(mapAgentJobVisibleState("needs_owner")).toBe("needs_owner");
    expect(mapAgentJobVisibleState("red_running")).toBe("processing");
    expect(mapAgentJobVisibleState("fix_queued")).toBe("stopped");
    expect(mapAgentJobVisibleState("unexpected_new_state")).toBe("stopped");
  });
  it("loads an omitted optional draft as empty closed fields", async () => {
    const client = createTestingCenterClient(fakeTransport((name, payload, emit) => {
      if (name === "testing-center:report-draft:load") {
        queueMicrotask(() => emit("testing-center:report-draft:loaded", {
          requestId: payload.requestId,
          draft: {
            schemaVersion: 1,
            idempotencyKey: `draft_${"a".repeat(64)}`,
            actionText: "action",
            expectedText: "expected",
            observedText: "observed",
          },
        }));
      }
    }));
    await expect(client.loadDraft()).resolves.toMatchObject({ contextText: "", module: "unknown" });
  });

  it("maps not_found to an empty local state", async () => {
    const client = createTestingCenterClient(fakeTransport((name, payload, emit) => {
      if (name === "testing-center:report-draft:load") {
        queueMicrotask(() => emit("testing-center:report-draft:error", {
          requestId: payload.requestId, operation: "load", code: "not_found",
        }));
      }
    }));
    await expect(client.loadDraft()).resolves.toBeNull();
  });

  it("rejects a correlated malformed response instead of hanging", async () => {
    const client = createTestingCenterClient(fakeTransport((name, payload, emit) => {
      if (name === "testing-center:report-draft:load") {
        queueMicrotask(() => emit("testing-center:report-draft:loaded", {
          requestId: payload.requestId,
          draft: { schemaVersion: 99 },
        }));
      }
    }), 100);
    await expect(client.loadDraft()).rejects.toEqual(
      expect.objectContaining<Partial<TestingCenterClientError>>({ code: "contract_error" }),
    );
  });

  it("rejects a diagnostic whose digest does not match its exact payload", async () => {
    const client = createTestingCenterClient(fakeTransport((name, payload, emit) => {
      if (name === "testing-center:diagnostic:prepare") {
        queueMicrotask(() => emit("testing-center:diagnostic:prepared", {
          requestId: payload.requestId,
          preview: {
            contractVersion: "testing-center.diagnostic.v1",
            payload: "{}",
            sha256: "0".repeat(64),
            byteSize: 2,
          },
          environment: {
            appVersion: "v1", osFamily: "windows", osVersion: "Windows", arch: "amd64", availableLogCount: 0,
            channel: "nightly",
          },
        }));
      }
    }));
    await expect(client.prepareDiagnostic({ module: "hub", includeLogs: false }))
      .rejects.toEqual(expect.objectContaining<Partial<TestingCenterClientError>>({ code: "contract_error" }));
  });

  it("rejects a multibyte diagnostic larger than the byte limit", async () => {
    const body = "á".repeat(40_000);
    const client = createTestingCenterClient(fakeTransport((name, payload, emit) => {
      if (name === "testing-center:diagnostic:prepare") {
        queueMicrotask(() => emit("testing-center:diagnostic:prepared", {
          requestId: payload.requestId,
          preview: {
            contractVersion: "testing-center.diagnostic.v1",
            payload: body,
            sha256: "0".repeat(64),
            byteSize: new TextEncoder().encode(body).byteLength,
          },
          environment: {
            appVersion: "v1", osFamily: "windows", osVersion: "Windows", arch: "amd64",
            availableLogCount: 0, channel: "nightly",
          },
        }));
      }
    }));
    await expect(client.prepareDiagnostic({ module: "hub", includeLogs: false }))
      .rejects.toEqual(expect.objectContaining<Partial<TestingCenterClientError>>({ code: "contract_error" }));
  });

  it("does not send a client-selected release channel to the backend", async () => {
    let emitted: Record<string, unknown> | null = null;
    const client = createTestingCenterClient(fakeTransport((name, payload, emit) => {
      if (name !== "testing-center:diagnostic:prepare") return;
      emitted = payload;
      const body = "{}";
      crypto.subtle.digest("SHA-256", new TextEncoder().encode(body)).then((digest) => {
        const sha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
        emit("testing-center:diagnostic:prepared", {
          requestId: payload.requestId,
          preview: { contractVersion: "testing-center.diagnostic.v1", payload: body, sha256, byteSize: 2 },
          environment: {
            appVersion: "v1", osFamily: "windows", osVersion: "Windows", arch: "amd64",
            availableLogCount: 0, channel: "testers",
          },
        });
      });
    }));
    await expect(client.prepareDiagnostic({ module: "hub", includeLogs: false }))
      .resolves.toMatchObject({ environment: { channel: "testers" } });
    expect(emitted).not.toHaveProperty("channel");
  });
});
