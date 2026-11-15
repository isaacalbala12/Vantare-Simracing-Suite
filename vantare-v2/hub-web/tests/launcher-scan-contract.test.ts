import { describe, expect, it } from "vitest";
import { isCatalog } from "../src/contract/apps-validation";
import { launcherScanTimestampMax } from "../src/contract/generated/contract";
import { createMockHost } from "../src/mock/host";

describe("completed launcher scan metadata", () => {
  const catalog = {
    revision: "0".repeat(64),
    scanning: false,
    apps: [],
    lastScan: null,
  };
  it("distinguishes unknown, in progress, zero warnings and reported warnings", () => {
    expect(isCatalog(catalog)).toBe(true);
    for (const scanning of [false, true])
      for (const warningCount of [0, 2]) {
        expect(
          isCatalog({
            ...catalog,
            scanning,
            lastScan: { completedAtMs: "1700000000123", warningCount },
          }),
        ).toBe(true);
      }
  });
  it("rejects invented dates, unsafe counts and private diagnostic fields", () => {
    for (const lastScan of [
      {},
      { completedAtMs: "1700000000123", warningCount: -1 },
      { completedAtMs: "1700000000123", warningCount: 1.5 },
      {
        completedAtMs: "1700000000123",
        warningCount: Number.MAX_SAFE_INTEGER + 1,
      },
      { completedAtMs: "01700000000123", warningCount: 0 },
      { completedAtMs: "2026-11-15", warningCount: 0 },
      {
        completedAtMs: (BigInt(launcherScanTimestampMax) + 1n).toString(),
        warningCount: 0,
      },
      {
        completedAtMs: "1700000000123",
        warningCount: 1,
        warnings: ["D:/Users/private/app.exe"],
      },
    ])
      expect(isCatalog({ ...catalog, lastScan })).toBe(false);
  });
  it("the mock publishes the recorded fixture metadata without deriving it from availability", () => {
    const host = createMockHost("launcher-aplicaciones");
    const reply = host({
      kind: "request",
      id: 1,
      request: { method: "launcher.catalog" },
    });
    if (
      reply?.kind !== "response" ||
      reply.result.method !== "launcher.catalog"
    )
      throw new Error("catalog");
    expect(reply.result.value.lastScan).toEqual({
      completedAtMs: "1700000000123",
      warningCount: 0,
    });
    expect(isCatalog(reply.result.value)).toBe(true);
  });
});
