import { describe, expect, it, vi } from "vitest";
import { createAnalysisClient } from "../strategy/analysis-client";

vi.mock("@wailsio/runtime", () => import("./wails-runtime-mock"));

describe("visual harness native Analysis boundary", () => {
  it("reports unavailable native services rather than fabricated status or sessions", async () => {
    const client = createAnalysisClient();
    await expect(client.status()).rejects.toThrow("Native calls are unavailable in the visual harness");
    await expect(client.discover()).rejects.toThrow("Native calls are unavailable in the visual harness");
  });
});
