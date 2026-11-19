import { describe, expect, it } from "vitest";
import { copyLimiter } from "../src/main/copy-limit";

describe("copy limiter of the main process", () => {
  it("lets the first copy through and holds the next ones for the interval", () => {
    let clock = 10_000;
    const limit = copyLimiter(() => clock, 1000);
    expect(limit.allow()).toBe(true);
    clock += 999;
    expect(limit.allow()).toBe(false);
    // a refused copy does not extend the pause
    clock += 1;
    expect(limit.allow()).toBe(true);
    clock += 1;
    expect(limit.allow()).toBe(false);
    clock += 1000;
    expect(limit.allow()).toBe(true);
  });

  it("is not frozen by a clock that goes back", () => {
    let clock = 50_000;
    const limit = copyLimiter(() => clock, 1000);
    expect(limit.allow()).toBe(true);
    clock = 10_000;
    expect(limit.allow()).toBe(true);
    clock += 10;
    expect(limit.allow()).toBe(false);
  });
});
