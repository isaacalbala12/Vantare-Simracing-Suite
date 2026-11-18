import { describe, expect, it } from "vitest";
import type { AccessView } from "../src/contract/generated/contract";
import { lock, navigation, visible } from "../src/renderer/app/navigation";

const anonymous: AccessView = {
  verified: false,
  blocked: false,
  tester: false,
  calendar: false,
  engineer: false,
  strategy: false,
  analysis: false,
};
describe("navigation from core access", () => {
  it("keeps settings usable, hides restricted routes, and locks product sections without a fresh grant", () => {
    expect(lock("settings", anonymous)).toBeUndefined();
    expect(lock("home", anonymous)).toBeUndefined();
    expect(lock("home", { ...anonymous, blocked: true })).toBeUndefined();
    expect(lock("launcher", anonymous)).toBeTruthy();
    expect(visible("testing", anonymous)).toBe(false);
    expect(visible("calendar", anonymous)).toBe(false);
  });
  it("shows reports to a verified non-tester and calendar only to a tester", () => {
    const member = { ...anonymous, verified: true, calendar: true };
    expect(
      navigation(member).find((item) => item.id === "testing")?.label,
    ).toBe("Informes");
    expect(visible("calendar", member)).toBe(false);
    expect(visible("calendar", { ...member, tester: true })).toBe(true);
    expect(
      visible("calendar", { ...member, tester: true, blocked: true }),
    ).toBe(false);
  });
  it("keeps future modules locked even when the core grants their entitlement", () => {
    const owner = {
      ...anonymous,
      verified: true,
      strategy: true,
      analysis: true,
      engineer: true,
    };
    expect(lock("strategy", owner)).toBeTruthy();
    expect(lock("engineer", owner)).toBeTruthy();
  });
});

it.each(["nightly", "testers", "master", undefined])(
  "gates Analysis on both the beta preference and channel %s",
  (channel) => {
    for (const analysis of [true, false]) {
      const access = { ...anonymous, analysis };
      for (const enabled of [true, false, undefined]) {
        const expected = channel === "nightly" && enabled === true;
        expect(visible("analysis", access, channel, enabled)).toBe(expected);
        expect(navigation(access, channel, enabled).some(({ id }) => id === "analysis")).toBe(expected);
      }
      expect(lock("analysis", access)).toBeUndefined();
    }
  },
);
