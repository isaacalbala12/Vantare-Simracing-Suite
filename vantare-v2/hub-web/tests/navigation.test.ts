import { describe, expect, it } from "vitest";
import type { AccessView } from "../src/contract/generated/contract";
import {
  lock,
  navigation,
  strategyOpen,
  visible,
} from "../src/renderer/app/navigation";

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

// «Funciones en pruebas»: tester right, the module's own signed right and the
// preference. The update channel plays no part.
const tester: AccessView = {
  verified: true,
  blocked: false,
  tester: true,
  calendar: true,
  engineer: true,
  strategy: true,
  analysis: true,
};
it.each([
  ["a tester with both rights", tester, true, true],
  [
    "a tester without either right",
    { ...tester, analysis: false, strategy: false },
    false,
    false,
  ],
  [
    "a tester with the Analysis right only",
    { ...tester, strategy: false },
    true,
    false,
  ],
  [
    "a tester with the Strategy right only",
    { ...tester, analysis: false },
    false,
    true,
  ],
  [
    "a verified non-tester with both rights",
    { ...tester, tester: false },
    false,
    false,
  ],
  ["a blocked account", { ...anonymous, blocked: true }, false, false],
  ["an anonymous account", anonymous, false, false],
])(
  "with the beta on, opens for %s exactly what it holds",
  (_, access, analysis, strategy) => {
    expect(visible("analysis", access, true)).toBe(analysis);
    expect(navigation(access, true).some(({ id }) => id === "analysis")).toBe(
      analysis,
    );
    expect(lock("analysis", access)).toBeUndefined();
    expect(strategyOpen(access, true)).toBe(strategy);
    // the Strategy entry stays visible in every case; only the lock changes
    expect(visible("strategy", access, true)).toBe(true);
    expect(
      navigation(access, true).find(({ id }) => id === "strategy")?.locked,
    ).toBe(strategy ? undefined : "Próximamente");
  },
);
it.each([false, undefined])(
  "keeps Strategy «Próximamente» and Analysis out of a tester's menu with the beta %s",
  (enabled) => {
    expect(strategyOpen(tester, enabled)).toBe(false);
    expect(lock("strategy", tester, enabled)).toBe("Próximamente");
    expect(visible("analysis", tester, enabled)).toBe(false);
    expect(
      navigation(tester, enabled).some(({ id }) => id === "analysis"),
    ).toBe(false);
  },
);
it("never opens Engineer, even for a tester with the beta on", () => {
  expect(lock("engineer", tester, true)).toBe("Próximamente");
});
it("names the future modules in Spanish", () => {
  const names = Object.fromEntries(
    navigation(anonymous, true).map(({ id, label }) => [id, label]),
  );
  expect(names.strategy).toBe("Estrategia");
  expect(names.engineer).toBe("Ingeniero");
});
