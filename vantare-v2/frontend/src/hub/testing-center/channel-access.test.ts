import { describe, expect, it } from "vitest";
import { resolveTestingCenterChannel } from "./channel-access";

describe("Testing Center channel access", () => {
  it("uses the nightly build identity when both signed capabilities are present", () => {
    expect(resolveTestingCenterChannel("nightly", [
      "vantare.channel.testers",
      "vantare.channel.nightly",
    ])).toBe("nightly");
  });

  it("uses the testers build identity even for a principal with both capabilities", () => {
    expect(resolveTestingCenterChannel("testers", [
      "vantare.channel.testers",
      "vantare.channel.nightly",
    ])).toBe("testers");
  });

  it("fails closed for master, mismatched capability or missing metadata", () => {
    expect(resolveTestingCenterChannel("master", ["vantare.channel.nightly"])).toBeNull();
    expect(resolveTestingCenterChannel("nightly", ["vantare.channel.testers"])).toBeNull();
    expect(resolveTestingCenterChannel("testers", ["vantare.channel.nightly"])).toBeNull();
    expect(resolveTestingCenterChannel(null, ["vantare.channel.nightly"])).toBeNull();
    expect(resolveTestingCenterChannel("nightly", undefined)).toBeNull();
  });
});
