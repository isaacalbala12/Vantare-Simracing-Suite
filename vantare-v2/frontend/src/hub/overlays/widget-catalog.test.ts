import { describe, expect, it } from "vitest";
import type { AccessContext } from "../../lib/access-policy";
import {
  getWidgetCatalogEntry,
  canPreviewWidget,
  canApplyWidget,
  isRuntimeReadyWidget,
  getAllWidgetCatalogEntries,
} from "./widget-catalog";

// ── AccessContext factories ──────────────────────────────────────────────

const freeAccess: AccessContext = {
  planLabel: "free",
  planStatus: "active",
  roles: [],
  isBlocked: false,
  isUnconfigured: false,
};

const paidAccess: AccessContext = {
  planLabel: "paid_overlays",
  planStatus: "active",
  roles: [],
  isBlocked: false,
  isUnconfigured: false,
};

const testerAccess: AccessContext = {
  planLabel: "free",
  planStatus: "active",
  roles: ["tester"],
  isBlocked: false,
  isUnconfigured: false,
};

const blockedAccess: AccessContext = {
  planLabel: "free",
  planStatus: "blocked",
  roles: [],
  isBlocked: true,
  isUnconfigured: false,
};

const unconfiguredAccess: AccessContext = {
  planLabel: "unknown",
  planStatus: "unconfigured",
  roles: [],
  isBlocked: false,
  isUnconfigured: true,
};

// ── getWidgetCatalogEntry ────────────────────────────────────────────────

describe("getWidgetCatalogEntry", () => {
  it("returns free/ok/columns/runtimeReady for standings", () => {
    const entry = getWidgetCatalogEntry("standings");
    expect(entry).toBeDefined();
    expect(entry!.access).toBe("free");
    expect(entry!.dataStatus).toBe("ok");
    expect(entry!.editModel).toBe("columns");
    expect(entry!.runtimeReady).toBe(true);
  });

  it("returns pro/ok/columns/runtimeReady for relative", () => {
    const entry = getWidgetCatalogEntry("relative");
    expect(entry).toBeDefined();
    expect(entry!.access).toBe("pro");
    expect(entry!.dataStatus).toBe("ok");
    expect(entry!.editModel).toBe("columns");
    expect(entry!.runtimeReady).toBe(true);
  });

  it("returns tester/pending/slots/runtimeReady=false for track-weather", () => {
    const entry = getWidgetCatalogEntry("track-weather");
    expect(entry).toBeDefined();
    expect(entry!.access).toBe("tester");
    expect(entry!.dataStatus).toBe("pending");
    expect(entry!.editModel).toBe("slots");
    expect(entry!.runtimeReady).toBe(false);
  });

  it("returns undefined for nonexistent type", () => {
    expect(getWidgetCatalogEntry("nonexistent")).toBeUndefined();
  });
  it("returns pro/partial/slots/runtimeReady=false for broadcast-tower", () => {
    const entry = getWidgetCatalogEntry("broadcast-tower");
    expect(entry).toBeDefined();
    expect(entry!.access).toBe("pro");
    expect(entry!.dataStatus).toBe("partial");
    expect(entry!.editModel).toBe("slots");
    expect(entry!.runtimeReady).toBe(false);
  });

  it("returns pro/partial/mixed/runtimeReady=false for multiclass-relative", () => {
    const entry = getWidgetCatalogEntry("multiclass-relative");
    expect(entry).toBeDefined();
    expect(entry!.access).toBe("pro");
    expect(entry!.dataStatus).toBe("partial");
    expect(entry!.editModel).toBe("mixed");
    expect(entry!.runtimeReady).toBe(false);
  });
});

// ── getAllWidgetCatalogEntries ────────────────────────────────────────────

describe("getAllWidgetCatalogEntries", () => {
  it("returns exactly 14 entries", () => {
    const entries = getAllWidgetCatalogEntries();
    expect(entries).toHaveLength(14);
  });
});

// ── canPreviewWidget ─────────────────────────────────────────────────────

describe("canPreviewWidget", () => {
  it("returns true for free user previewing a pro widget", () => {
    expect(canPreviewWidget("relative", freeAccess)).toBe(true);
  });
});

// ── canApplyWidget ───────────────────────────────────────────────────────

describe("canApplyWidget", () => {
  it("rejects free user applying a pro widget", () => {
    expect(canApplyWidget("relative", freeAccess)).toBe(false);
  });

  it("allows paid user applying a pro widget", () => {
    expect(canApplyWidget("relative", paidAccess)).toBe(true);
  });

  it("allows tester user applying a tester widget", () => {
    expect(canApplyWidget("track-weather", testerAccess)).toBe(true);
  });

  it("rejects blocked user applying anything", () => {
    expect(canApplyWidget("standings", blockedAccess)).toBe(false);
  });

  it("allows free user applying a free widget", () => {
    expect(canApplyWidget("delta", freeAccess)).toBe(true);
  });

  it("rejects unconfigured user applying anything", () => {
    expect(canApplyWidget("delta", unconfiguredAccess)).toBe(false);
  });

  it("rejects free user applying broadcast-tower (pro)", () => {
    expect(canApplyWidget("broadcast-tower", freeAccess)).toBe(false);
  });

  it("allows paid user applying broadcast-tower (pro)", () => {
    expect(canApplyWidget("broadcast-tower", paidAccess)).toBe(true);
  });

  it("rejects free user applying multiclass-relative (pro)", () => {
    expect(canApplyWidget("multiclass-relative", freeAccess)).toBe(false);
  });

  it("allows paid user applying multiclass-relative (pro)", () => {
    expect(canApplyWidget("multiclass-relative", paidAccess)).toBe(true);
  });

  it("returns false for nonexistent widget type", () => {
    expect(canApplyWidget("nonexistent", paidAccess)).toBe(false);
  });
});

// ── isRuntimeReadyWidget ─────────────────────────────────────────────────

describe("isRuntimeReadyWidget", () => {
  it("returns true for standings", () => {
    expect(isRuntimeReadyWidget("standings")).toBe(true);
  });

  it("returns false for track-weather", () => {
    expect(isRuntimeReadyWidget("track-weather")).toBe(false);
  });

  it("returns false for nonexistent type", () => {
    expect(isRuntimeReadyWidget("nonexistent")).toBe(false);
  });
});

// ── Invariants ───────────────────────────────────────────────────────────

describe("invariants", () => {
  it("all runtimeReady entries have data status 'ok'", () => {
    const entries = getAllWidgetCatalogEntries();
    const runtimeReady = entries.filter((e) => e.runtimeReady);
    for (const entry of runtimeReady) {
      expect(entry.dataStatus).toBe("ok");
    }
  });

  it("all entries have valid AccessTier values", () => {
    const entries = getAllWidgetCatalogEntries();
    const validTiers = ["free", "pro", "tester", "experimental"];
    for (const entry of entries) {
      expect(validTiers).toContain(entry.access);
    }
  });

  it("all entries have valid EditModel values", () => {
    const entries = getAllWidgetCatalogEntries();
    const validModels = ["slots", "columns", "mixed"];
    for (const entry of entries) {
      expect(validModels).toContain(entry.editModel);
    }
  });
});
// ── Tester / Experimental invariants ──────────────────────────────────

describe("tester/experimental data status", () => {
  it("all tester widgets have data status 'pending' or 'partial'", () => {
    const entries = getAllWidgetCatalogEntries().filter(
      (e) => e.access === "tester",
    );
    for (const entry of entries) {
      expect(["pending", "partial"]).toContain(entry.dataStatus);
    }
  });

  it("all experimental widgets have data status 'pending' or 'partial'", () => {
    const entries = getAllWidgetCatalogEntries().filter(
      (e) => e.access === "experimental",
    );
    for (const entry of entries) {
      expect(["pending", "partial"]).toContain(entry.dataStatus);
    }
  });
});

describe("tester/experimental runtime readiness", () => {
  it("no tester widget is runtime-ready", () => {
    const entries = getAllWidgetCatalogEntries().filter(
      (e) => e.access === "tester",
    );
    for (const entry of entries) {
      expect(isRuntimeReadyWidget(entry.type)).toBe(false);
    }
  });

  it("no experimental widget is runtime-ready", () => {
    const entries = getAllWidgetCatalogEntries().filter(
      (e) => e.access === "experimental",
    );
    for (const entry of entries) {
      expect(isRuntimeReadyWidget(entry.type)).toBe(false);
    }
  });
});
