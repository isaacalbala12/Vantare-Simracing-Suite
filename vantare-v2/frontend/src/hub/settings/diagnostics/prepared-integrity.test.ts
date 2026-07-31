import { describe, expect, it } from "vitest";
import { fixturePayload, fixturePrepared } from "./test-fixtures";
import { verifyPreparedDiagnostics } from "./prepared-integrity";

describe("prepared diagnostics integrity", () => {
  it("keeps the fixture digest tied to the exact UTF-8 payload", async () => {
    const digest = await globalThis.crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(fixturePayload),
    );
    const actual = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    expect(fixturePrepared.sha256).toBe(actual);
    await expect(verifyPreparedDiagnostics(fixturePrepared)).resolves.toBeUndefined();
    expect(fixturePrepared.byteSize).toBe(
      new TextEncoder().encode(fixturePayload).byteLength,
    );
  });

  it("rejects a byte size mismatch", async () => {
    await expect(
      verifyPreparedDiagnostics({
        ...fixturePrepared,
        byteSize: fixturePrepared.byteSize + 1,
      }),
    ).rejects.toThrow(/byteSize does not match payload/u);
  });
});
