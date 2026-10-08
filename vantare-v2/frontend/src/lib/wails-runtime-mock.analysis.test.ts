import { describe, expect, it } from "vitest";
import { createAnalysisClient } from "../strategy/analysis-client";
import { Call } from "./wails-runtime-mock";

describe("visual harness native Analysis boundary", () => {
  it("reports unavailable native services rather than fabricated status or sessions", async () => {
    const client = createAnalysisClient({ call: async (method, args) => Call.ByName(method, ...args) });
    await expect(client.status()).rejects.toThrow("Native calls are unavailable in the visual harness");
    await expect(client.discover()).rejects.toThrow("Native calls are unavailable in the visual harness");
  });
});
