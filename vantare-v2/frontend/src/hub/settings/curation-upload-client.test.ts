import { describe, expect, it, vi } from "vitest";
import { createCurationUploadClient, type CurationUploadTransport } from "./curation-upload-client";

function transportHarness() {
  const handlers = new Map<string, (event: unknown) => void>();
  const emit = vi.fn((name: string, payload: unknown) => {
    if (name === "curation:upload:command") {
      const command = payload as { commandId: string };
      handlers.get("curation:upload:result")?.({ data: {
        protocolVersion: "curation.upload.v1",
        commandId: command.commandId,
        snapshot: { consent: { textVersion: "", acceptedAt: "0001-01-01T00:00:00Z", active: false }, paused: false, enabled: false, queue: [], deletions: [] },
      } });
    }
  });
  const transport: CurationUploadTransport = {
    emit,
    on: (name, handler) => {
      handlers.set(name, handler);
      return () => handlers.delete(name);
    },
  };
  return { transport, emit };
}

describe("curation upload client", () => {
  it("requests the versioned snapshot and never carries credentials", async () => {
    const { transport, emit } = transportHarness();
    const snapshot = await createCurationUploadClient(transport).snapshot();
    expect(snapshot.enabled).toBe(false);
    const command = emit.mock.calls[0][1] as Record<string, unknown>;
    expect(command.protocolVersion).toBe("curation.upload.v1");
    expect(JSON.stringify(command)).not.toContain("Secret");
  });

  it("rejects malformed queue states instead of guessing", async () => {
    const handlers = new Map<string, (event: unknown) => void>();
    const transport: CurationUploadTransport = {
      on: (name, handler) => { handlers.set(name, handler); return () => handlers.delete(name); },
      emit: (_name, payload) => {
        const command = payload as { commandId: string };
        handlers.get("curation:upload:result")?.({ data: {
          protocolVersion: "curation.upload.v1", commandId: command.commandId,
          snapshot: { consent: { textVersion: "v1", acceptedAt: "2026-08-22T10:00:00Z", active: true }, paused: false, enabled: false, queue: [{ id: "q", state: "sending" }], deletions: [] },
        } });
      },
    };
    await expect(createCurationUploadClient(transport).snapshot()).rejects.toMatchObject({ code: "contract_error" });
  });
});
