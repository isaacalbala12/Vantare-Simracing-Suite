import { describe, expect, it } from "vitest";
import {
  buildSummary,
  classifyPlan,
  classifyStatus,
  sortedEntitlements,
  PLAN_LABELS,
  PLAN_STATUS_LABELS,
} from "./plan";
import type { Entitlement, LicenseState } from "./license-types";

describe("classifyPlan", () => {
  const cases: Array<{ name: string; in: Entitlement[]; want: string }> = [
    { name: "empty is free", in: [], want: "free" },
    { name: "overlays alone", in: ["overlays"], want: "paid_overlays" },
    { name: "engineer alone", in: ["engineer"], want: "paid_engineer" },
    { name: "bundle is suite", in: ["bundle"], want: "suite" },
    { name: "beta_access is suite", in: ["beta_access"], want: "suite" },
    { name: "founder is suite", in: ["founder"], want: "suite" },
    { name: "pro_founder is suite", in: ["pro_founder"], want: "suite" },
    { name: "visionary_backer is suite", in: ["visionary_backer"], want: "suite" },
    { name: "supporter is paid_overlays", in: ["supporter"], want: "paid_overlays" },
    { name: "bundle plus ac_lua_pack is suite", in: ["bundle", "ac_lua_pack"], want: "suite" },
    { name: "ac_lua_pack alone is free", in: ["ac_lua_pack"], want: "free" },
    {
      name: "overlays plus engineer is suite",
      in: ["overlays", "engineer"],
      want: "suite",
    },
    { name: "unknown token", in: ["mystery_key" as Entitlement], want: "unknown" },
    { name: "whitespace ignored", in: ["" as Entitlement], want: "free" },
  ];

  for (const tc of cases) {
    it(tc.name, () => {
      expect(classifyPlan(tc.in)).toBe(tc.want);
    });
  }
});

describe("classifyStatus", () => {
  const states: Array<[LicenseState | null, string]> = [
    ["active", "active"],
    ["grace", "grace"],
    ["expired", "blocked"],
    ["device-limit", "blocked"],
    ["authenticated-no-entitlement", "free"],
    ["anonymous", "anonymous"],
    ["unconfigured", "unconfigured"],
    [null, "free"],
  ];

  for (const [state, expected] of states) {
    it(`${String(state)} -> ${expected}`, () => {
      expect(classifyStatus(state)).toBe(expected);
    });
  }
});

describe("buildSummary", () => {
  it("active suite", () => {
    expect(buildSummary("active", ["bundle"])).toEqual({
      label: "suite",
      status: "active",
    });
  });
  it("grace overlays", () => {
    expect(buildSummary("grace", ["overlays"])).toEqual({
      label: "paid_overlays",
      status: "grace",
    });
  });
  it("blocked without entitlements", () => {
    expect(buildSummary("expired", [])).toEqual({
      label: "free",
      status: "blocked",
    });
  });
  it("authenticated-no-entitlement is free", () => {
    expect(buildSummary("authenticated-no-entitlement", [])).toEqual({
      label: "free",
      status: "free",
    });
  });
  it("anonymous forces anonymous status even with suite entitlements", () => {
    expect(buildSummary("anonymous", ["bundle"])).toEqual({
      label: "suite",
      status: "anonymous",
    });
  });
  it("active unknown becomes free", () => {
    expect(buildSummary("active", ["mystery" as Entitlement])).toEqual({
      label: "free",
      status: "active",
    });
  });
  it("unconfigured is not blocked", () => {
    expect(buildSummary("unconfigured", [])).toEqual({
      label: "free",
      status: "unconfigured",
    });
  });
});

describe("sortedEntitlements", () => {
  it("returns a sorted copy without mutating the input", () => {
    const src: Entitlement[] = ["bundle", "overlays", "engineer"];
    const got = sortedEntitlements(src);
    expect(got).toEqual(["bundle", "engineer", "overlays"]);
    expect(src).toEqual(["bundle", "overlays", "engineer"]);
  });
});

describe("label maps", () => {
  it("covers every plan label", () => {
    const labels: string[] = ["free", "paid_overlays", "paid_engineer", "suite", "unknown"];
    for (const label of labels) {
      expect(PLAN_LABELS[label as keyof typeof PLAN_LABELS]).toBeTruthy();
    }
  });
  it("covers every plan status", () => {
    const statuses: string[] = ["active", "grace", "blocked", "free", "anonymous", "unconfigured"];
    for (const status of statuses) {
      expect(PLAN_STATUS_LABELS[status as keyof typeof PLAN_STATUS_LABELS]).toBeTruthy();
    }
  });
});