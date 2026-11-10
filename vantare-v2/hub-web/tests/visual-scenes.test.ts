import { describe, expect, it } from "vitest";
import { createMockHost } from "../src/mock/host";

describe("explicit visual QA fixtures", () => {
  it.each(["dark", "light"])(
    "seeds %s without changing ordinary mock defaults",
    (scheme) => {
      const read = {
        kind: "request",
        id: 1,
        request: { method: "settings.get" },
      };
      const visual = createMockHost(`visual-${scheme}:ajustes-con-diseno`)(
        read,
      );
      expect(visual).toMatchObject({
        kind: "response",
        result: {
          value: {
            appearance: { scheme, palette: "vantare" },
            zoom: 100,
            startup: { supported: true },
            track: { exists: true },
          },
        },
      });
      expect(createMockHost()(read)).toMatchObject({
        result: {
          value: {
            appearance: { scheme: "dark" },
            startup: { supported: false },
          },
        },
      });
    },
  );
  it("does not interpret unknown theme/configuration strings as visual fixtures", () => {
    const read = { kind: "request", id: 1, request: { method: "core.get" } };
    expect(createMockHost("visual-invalid:ajustes-con-diseno")(read)).toEqual(
      createMockHost()(read),
    );
  });
});
