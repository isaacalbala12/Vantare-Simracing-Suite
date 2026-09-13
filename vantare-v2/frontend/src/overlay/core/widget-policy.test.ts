import { describe, expect, it } from "vitest";
import type { WidgetInstanceV3 } from "./profile-document";
import {
  isWidgetPolicyExpired,
  isWidgetTypeAllowed,
  parseWidgetPolicyWire,
  readBrandPreference,
  resolveBrandMode,
  resolveBrandVisible,
  resolveEffectiveWidgetGate,
  resolveEffectiveWidgetPolicy,
  resolveWidgetBrandVisible,
  type WidgetPolicyWire,
} from "./widget-policy";

const freeWire: WidgetPolicyWire = {
  revision: 1,
  overlaysBasic: true,
  overlaysAdvanced: false,
  engineerAI: false,
  brandCrystal: "required",
  brandEfficiency: "required",
  brandOriginal: "none",
};

const paidWire: WidgetPolicyWire = {
  revision: 2,
  overlaysBasic: true,
  overlaysAdvanced: true,
  engineerAI: false,
  brandCrystal: "optional",
  brandEfficiency: "optional",
  brandOriginal: "none",
};

const engineerOnlyWire: WidgetPolicyWire = {
  revision: 3,
  overlaysBasic: true,
  overlaysAdvanced: false,
  engineerAI: true,
  brandCrystal: "optional",
  brandEfficiency: "optional",
  brandOriginal: "none",
};

function widget(type: WidgetInstanceV3["type"], systemId: WidgetInstanceV3["visual"]["systemId"]): WidgetInstanceV3 {
  return {
    id: `${type}-main`,
    type,
    layout: { x: 0, y: 0, w: 100, h: 100, zIndex: 0, aspectLocked: false },
    behavior: { enabled: true, updateHz: 4 },
    content: {},
    visual: {
      systemId,
      systemVersion: 1,
      configVersion: 1,
      baseSettings: {},
      appearanceOverrides: {},
    },
  };
}

describe("parseWidgetPolicyWire", () => {
  it("accepts a complete wire payload and ignores unknown fields", () => {
    expect(
      parseWidgetPolicyWire({ ...freeWire, futureFlag: true, roles: ["owner"], email: "a@b.c" }),
    ).toEqual(freeWire);
  });

  it("rejects wrong types, bad brand modes and bad revisions", () => {
    expect(parseWidgetPolicyWire(null)).toBeNull();
    expect(parseWidgetPolicyWire({ ...freeWire, revision: -1 })).toBeNull();
    expect(parseWidgetPolicyWire({ ...freeWire, revision: 1.5 })).toBeNull();
    expect(parseWidgetPolicyWire({ ...freeWire, overlaysAdvanced: "yes" })).toBeNull();
    expect(parseWidgetPolicyWire({ ...freeWire, brandCrystal: "sometimes" })).toBeNull();
    expect(parseWidgetPolicyWire({ ...freeWire, validUntil: "not-a-date" })).toBeNull();
  });

  it("keeps a valid RFC3339 expiry when present", () => {
    const wire = { ...freeWire, validUntil: "2026-09-11T00:00:00Z" };
    expect(parseWidgetPolicyWire(wire)).toEqual(wire);
  });
});

describe("isWidgetPolicyExpired", () => {
  it("treats a missing expiry as valid and a past expiry as expired", () => {
    expect(isWidgetPolicyExpired(freeWire, Date.parse("2026-09-10T00:00:00Z"))).toBe(false);
    expect(
      isWidgetPolicyExpired(
        { ...freeWire, validUntil: "2026-09-11T00:00:00Z" },
        Date.parse("2026-09-10T00:00:00Z"),
      ),
    ).toBe(false);
    expect(
      isWidgetPolicyExpired(
        { ...freeWire, validUntil: "2026-09-11T00:00:00Z" },
        Date.parse("2026-09-12T00:00:00Z"),
      ),
    ).toBe(true);
  });
});

describe("resolveEffectiveWidgetPolicy", () => {
  it("returns null without a snapshot or once the snapshot expires", () => {
    expect(resolveEffectiveWidgetPolicy(null, 0)).toBeNull();
    expect(
      resolveEffectiveWidgetPolicy(
        { ...paidWire, validUntil: "2026-09-11T00:00:00Z" },
        Date.parse("2026-09-12T00:00:00Z"),
      ),
    ).toBeNull();
    expect(resolveEffectiveWidgetPolicy(paidWire, 0)).toEqual(paidWire);
  });
});

describe("isWidgetTypeAllowed", () => {
  it("fail-safe without a policy: standings/pedals available, premium blocked", () => {
    expect(isWidgetTypeAllowed(null, "standings")).toBe(true);
    expect(isWidgetTypeAllowed(null, "pedals")).toBe(true);
    expect(isWidgetTypeAllowed(null, "delta")).toBe(false);
    expect(isWidgetTypeAllowed(null, "relative")).toBe(false);
    expect(isWidgetTypeAllowed(null, "engineer-radio")).toBe(false);
  });

  it("applies the native matrix: free, paid overlays and engineer-only", () => {
    expect(isWidgetTypeAllowed(freeWire, "standings")).toBe(true);
    expect(isWidgetTypeAllowed(freeWire, "pedals")).toBe(true);
    expect(isWidgetTypeAllowed(freeWire, "delta")).toBe(false);
    expect(isWidgetTypeAllowed(freeWire, "engineer-radio")).toBe(false);

    expect(isWidgetTypeAllowed(paidWire, "delta")).toBe(true);
    expect(isWidgetTypeAllowed(paidWire, "standings")).toBe(true);
    expect(isWidgetTypeAllowed(paidWire, "engineer-radio")).toBe(false);

    // Overlays rights never grant Engineer; engineer-only keeps basic widgets.
    expect(isWidgetTypeAllowed(engineerOnlyWire, "engineer-radio")).toBe(true);
    expect(isWidgetTypeAllowed(engineerOnlyWire, "delta")).toBe(false);
    expect(isWidgetTypeAllowed(engineerOnlyWire, "standings")).toBe(true);
    expect(isWidgetTypeAllowed(engineerOnlyWire, "pedals")).toBe(true);
  });
});

describe("resolveEffectiveWidgetGate", () => {
  it("uses the native policy when present and valid", () => {
    expect(resolveEffectiveWidgetGate({ policy: paidWire, type: "delta" }).allowed).toBe(true);
    expect(resolveEffectiveWidgetGate({ policy: freeWire, type: "delta" }).allowed).toBe(false);
    expect(resolveEffectiveWidgetGate({ policy: freeWire, type: "standings" }).allowed).toBe(true);
  });

  it("without a snapshot applies the fail-safe Free matrix, never legacy rights", () => {
    expect(resolveEffectiveWidgetGate({ policy: null, type: "delta" }).allowed).toBe(false);
    expect(resolveEffectiveWidgetGate({ policy: null, type: "engineer-radio" }).allowed).toBe(false);
    expect(resolveEffectiveWidgetGate({ policy: null, type: "standings" }).allowed).toBe(true);
    expect(resolveEffectiveWidgetGate({ policy: null, type: "pedals" }).allowed).toBe(true);
  });

  it("an expired snapshot restores nothing: premium stays blocked, basic stays open", () => {
    const expiredPaid = { ...paidWire, validUntil: "2026-09-11T00:00:00Z" };
    const after = Date.parse("2026-09-12T00:00:00Z");
    // Ni siquiera un snapshot que fue premium recupera derechos al caducar.
    expect(resolveEffectiveWidgetGate({ policy: expiredPaid, type: "delta", nowMs: after }).allowed)
      .toBe(false);
    expect(
      resolveEffectiveWidgetGate({ policy: expiredPaid, type: "engineer-radio", nowMs: after })
        .allowed,
    ).toBe(false);
    expect(
      resolveEffectiveWidgetGate({ policy: expiredPaid, type: "standings", nowMs: after }).allowed,
    ).toBe(true);
    expect(resolveEffectiveWidgetGate({ policy: expiredPaid, type: "pedals", nowMs: after }).allowed)
      .toBe(true);
  });

  it("only a fresh snapshot returns rights, never the passage of time", () => {
    const expiredPaid = { ...paidWire, validUntil: "2026-09-11T00:00:00Z" };
    const after = Date.parse("2026-09-12T00:00:00Z");
    expect(resolveEffectiveWidgetGate({ policy: expiredPaid, type: "delta", nowMs: after }).allowed)
      .toBe(false);
    expect(resolveEffectiveWidgetGate({ policy: { ...paidWire, revision: 3 }, type: "delta" }).allowed)
      .toBe(true);
  });
});

describe("brand decisions", () => {
  it("requires the integrated brand without a policy on Crystal/Efficiency, never on Original", () => {
    expect(resolveBrandMode(null, "vantare-crystal")).toBe("required");
    expect(resolveBrandMode(null, "vantare-functional")).toBe("required");
    expect(resolveBrandMode(null, "vantare-original")).toBe("none");
    expect(resolveBrandMode(null, "vantare-endurance")).toBe("none");
  });

  it("reads the native brand mode per system", () => {
    expect(resolveBrandMode(paidWire, "vantare-crystal")).toBe("optional");
    expect(resolveBrandMode(paidWire, "vantare-functional")).toBe("optional");
    expect(resolveBrandMode(paidWire, "vantare-original")).toBe("none");
  });

  it("required always shows, optional follows the explicit opt-in, none hides", () => {
    expect(resolveBrandVisible({ mode: "required", showBrand: false })).toBe(true);
    expect(resolveBrandVisible({ mode: "optional", showBrand: true })).toBe(true);
    expect(resolveBrandVisible({ mode: "optional", showBrand: false })).toBe(false);
    expect(resolveBrandVisible({ mode: "optional" })).toBe(false);
    expect(resolveBrandVisible({ mode: "none", showBrand: true })).toBe(false);
  });

  it("reads the opt-in from merged visual settings without mutating the document", () => {
    const on = widget("standings", "vantare-crystal");
    on.visual.appearanceOverrides = { showBrand: true };
    const off = widget("standings", "vantare-crystal");
    expect(readBrandPreference(on)).toBe(true);
    expect(readBrandPreference(off)).toBe(false);
    expect(resolveWidgetBrandVisible(null, on)).toBe(true);
    expect(resolveWidgetBrandVisible(null, off)).toBe(true);
    expect(resolveWidgetBrandVisible(paidWire, on)).toBe(true);
    expect(resolveWidgetBrandVisible(paidWire, off)).toBe(false);
  });

  it("an imported opt-out never removes the mandatory free brand", () => {
    const imported = widget("standings", "vantare-functional");
    imported.visual.baseSettings = { showBrand: false, showSessionHeader: false };
    expect(resolveWidgetBrandVisible(freeWire, imported)).toBe(true);
    expect(resolveWidgetBrandVisible(paidWire, imported)).toBe(false);
  });
});
