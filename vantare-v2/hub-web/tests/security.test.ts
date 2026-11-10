import { describe, expect, it } from "vitest";
import { mockReply } from "../src/main/mock-host";
import { assetPath, CSP, isAppDocument } from "../src/main/security";

describe("renderer boundary", () => {
  it("rejects foreign origins and malformed paths", () => {
    for (const url of [
      "https://hub/",
      "file:///C:/x",
      "app://other/",
      "app://user@hub/",
      "app://hub/a%5cb",
      "app://hub/C%3a/x",
      "app://hub/%00",
    ])
      expect(assetPath(url)).toBeNull();
    expect(isAppDocument("invalid")).toBe(false);
    expect(assetPath("app://hub/")).toBe("index.html");
    expect(assetPath("app://hub/assets/main.js")).toBe("assets/main.js");
  });
  it("disables network and embedded objects", () => {
    expect(CSP).toContain("connect-src 'none'");
    expect(CSP).toContain("object-src 'none'");
  });
  it("only answers the supported mock handshake", () => {
    expect(mockReply({ kind: "hello", version: 1 })).toMatchObject({
      kind: "hello",
      version: 1,
      demo: true,
    });
    for (const message of [
      null,
      {},
      { kind: "hello", version: 2 },
      { kind: "request", method: "unknown" },
    ])
      expect(mockReply(message)).toBeNull();
  });
});
