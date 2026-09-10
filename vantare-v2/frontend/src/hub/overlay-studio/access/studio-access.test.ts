import { describe, expect, it } from "vitest";
import { deltaDefinition } from "../../../overlay/widget-types/delta/delta-definition";
import { standingsDefinition } from "../../../overlay/widget-types/standings/standings-definition";
import type { WidgetPolicyWire } from "../../../overlay/core/widget-policy";
import type { ProfileDocumentV3, WidgetInstanceV3 } from "../../../overlay/core/profile-document";
import type { WidgetDesignV1 } from "../../../overlay/core/widget-design";
import type { StudioCommand } from "../state/studio-command";
import {
  assertCommandAccess,
  canMutateWidget,
  getStudioMutationGate,
  resolveCommandMutations,
  StudioAccessError,
  validateDraftAccess,
  type StudioMutation,
  type StudioPolicy,
} from "./studio-access";

const freePolicy: StudioPolicy = {
  revision: 1,
  overlaysBasic: true,
  overlaysAdvanced: false,
  engineerAI: false,
  brandCrystal: "required",
  brandEfficiency: "required",
  brandOriginal: "none",
};

const paidPolicy: StudioPolicy = {
  revision: 2,
  overlaysBasic: true,
  overlaysAdvanced: true,
  engineerAI: false,
  brandCrystal: "optional",
  brandEfficiency: "optional",
  brandOriginal: "none",
};

const engineerPolicy: StudioPolicy = {
  revision: 3,
  overlaysBasic: true,
  overlaysAdvanced: false,
  engineerAI: true,
  brandCrystal: "optional",
  brandEfficiency: "optional",
  brandOriginal: "none",
};

const expiredPaidPolicy: StudioPolicy = {
  ...paidPolicy,
  revision: 4,
  validUntil: "2026-01-01T00:00:00Z",
};


function buildEngineerWidget(id = "engineer-main"): WidgetInstanceV3 {
  return {
    ...deltaDefinition.createDefault(id),
    id,
    type: "engineer-radio",
  };
}

function buildRelativeWidget(id = "relative-main"): WidgetInstanceV3 {
  return {
    ...deltaDefinition.createDefault(id),
    id,
    type: "relative",
  };
}

function buildDocument(widgets: WidgetInstanceV3[]): ProfileDocumentV3 {
  return {
    schemaVersion: 3,
    id: "profile-1",
    name: "Test",
    displayMode: "edit",
    monitorIndex: 0,
    layouts: {
      general: {
        type: "general",
        widgets,
      },
    },
  };
}

const advancedDesign: WidgetDesignV1 = {
  id: "delta-time-attack",
  name: "Time Attack",
  widgetType: "delta",
  systemId: "vantare-original",
  systemVersion: 1,
  configVersion: 1,
  visual: { accent: "amber" },
  includesContent: false,
  origin: "vantare",
  requiredFeature: "overlays.advanced",
};

function policyOf(name: string): StudioPolicy {
  switch (name) {
    case "free":
      return freePolicy;
    case "paid":
      return paidPolicy;
    case "engineer":
      return engineerPolicy;
    case "missing":
      return null;
    case "expired":
      return expiredPaidPolicy;
    default:
      throw new Error(`unknown policy: ${name}`);
  }
}

describe("getStudioMutationGate", () => {
  const delta = deltaDefinition.createDefault("delta-main");
  const relative = buildRelativeWidget();
  const engineer = buildEngineerWidget();

  const cases: Array<{
    name: string;
    policy: string;
    widget: WidgetInstanceV3;
    mutation: StudioMutation;
    allowed: boolean;
    design?: WidgetDesignV1;
  }> = [
    { name: "free cannot add delta", policy: "free", widget: delta, mutation: "add", allowed: false },
    { name: "free cannot change delta content", policy: "free", widget: delta, mutation: "content", allowed: false },
    { name: "paid can add delta", policy: "paid", widget: delta, mutation: "add", allowed: true },
    { name: "free can delete a blocked widget", policy: "free", widget: relative, mutation: "delete", allowed: true },
    { name: "free mutates delta layout", policy: "free", widget: delta, mutation: "layout", allowed: true },
    {
      name: "free can mutate relative layout",
      policy: "free",
      widget: relative,
      mutation: "layout",
      allowed: true,
    },
    {
      name: "paid mutates relative layout",
      policy: "paid",
      widget: relative,
      mutation: "layout",
      allowed: true,
    },
    {
      name: "overlays policy never grants engineer radio",
      policy: "paid",
      widget: engineer,
      mutation: "content",
      allowed: false,
    },
    {
      name: "engineer policy grants engineer radio but not delta",
      policy: "engineer",
      widget: engineer,
      mutation: "content",
      allowed: true,
    },
    {
      name: "engineer policy keeps delta blocked",
      policy: "engineer",
      widget: delta,
      mutation: "add",
      allowed: false,
    },
    {
      name: "expired paid policy blocks delta content",
      policy: "expired",
      widget: delta,
      mutation: "content",
      allowed: false,
    },
    {
      name: "missing policy blocks delta content",
      policy: "missing",
      widget: delta,
      mutation: "content",
      allowed: false,
    },
    {
      name: "missing policy still allows basic widgets",
      policy: "missing",
      widget: standingsDefinition.createDefault("standings-main"),
      mutation: "content",
      allowed: true,
    },
    {
      name: "free cannot apply advanced design to delta",
      policy: "free",
      widget: delta,
      mutation: "apply-design",
      allowed: false,
      design: advancedDesign,
    },
    {
      name: "paid can apply advanced design to delta",
      policy: "paid",
      widget: delta,
      mutation: "apply-design",
      allowed: true,
      design: advancedDesign,
    },
  ];

  it.each(cases)("$name", ({ policy, widget, mutation, allowed, design }) => {
    expect(
      getStudioMutationGate({ policy: policyOf(policy), mutation, widget, design }).allowed,
    ).toBe(allowed);
  });

  it("expired policy denies premium deterministically", () => {
    const policy: WidgetPolicyWire = { ...paidPolicy, validUntil: "2026-01-01T00:00:00Z" };
    expect(
      getStudioMutationGate({ policy, mutation: "add", widget: delta }).allowed,
    ).toBe(false);
    expect(
      getStudioMutationGate({ policy, mutation: "content", widget: standingsDefinition.createDefault("standings-main") }).allowed,
    ).toBe(true);
  });

  it("always allows save at the gate level", () => {
    expect(getStudioMutationGate({ policy: freePolicy, mutation: "save" }).allowed).toBe(true);
  });
});

describe("validateDraftAccess", () => {
  it("allows free users to save unrelated edits when premium widgets are unchanged", () => {
    const saved = buildDocument([deltaDefinition.createDefault("delta-main"), buildRelativeWidget()]);
    const draft = structuredClone(saved);
    draft.layouts.general.widgets[0]!.layout.x = 240;

    expect(validateDraftAccess(freePolicy, saved, draft)).toEqual({ allowed: true });
  });

  it("allows free users to save premium widget layout edits", () => {
    const saved = buildDocument([deltaDefinition.createDefault("delta-main"), buildRelativeWidget()]);
    const draft = structuredClone(saved);
    draft.layouts.general.widgets[1]!.layout.x = 500;

    expect(validateDraftAccess(freePolicy, saved, draft)).toEqual({ allowed: true });
  });

  it("blocks free users from saving premium widget content edits", () => {
    const saved = buildDocument([deltaDefinition.createDefault("delta-main"), buildRelativeWidget()]);
    const draft = structuredClone(saved);
    draft.layouts.general.widgets[1]!.content = { mode: "gap" };

    const result = validateDraftAccess(freePolicy, saved, draft);
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.widgetIds).toEqual(["relative-main"]);
    }
  });

  it("allows free users to delete premium widgets while preserving the remaining profile", () => {
    const saved = buildDocument([deltaDefinition.createDefault("delta-main"), buildRelativeWidget()]);
    const draft = structuredClone(saved);
    draft.layouts.general.widgets = [draft.layouts.general.widgets[0]!];

    expect(validateDraftAccess(freePolicy, saved, draft)).toEqual({ allowed: true });
    expect(draft.layouts.general.widgets[0]).toEqual(saved.layouts.general.widgets[0]);
  });

  it("paid policy saves premium content edits without losing siblings", () => {
    const saved = buildDocument([deltaDefinition.createDefault("delta-main"), buildRelativeWidget()]);
    const draft = structuredClone(saved);
    draft.layouts.general.widgets[1]!.content = { mode: "gap" };

    expect(validateDraftAccess(paidPolicy, saved, draft)).toEqual({ allowed: true });
    expect(draft.layouts.general.widgets[0]).toEqual(saved.layouts.general.widgets[0]);
  });
});

describe("assertCommandAccess", () => {
  it("treats an atomic monitor and viewport change as layout access", () => {
    const document = buildDocument([deltaDefinition.createDefault("delta-main")]);
    const command: StudioCommand = {
      type: "document/monitor",
      monitorIndex: 1,
      viewport: { width: 3440, height: 1440 },
    };

    expect(resolveCommandMutations(command)).toEqual(["layout"]);
    expect(() => assertCommandAccess(freePolicy, command, document)).not.toThrow();
  });

  it("treats a document viewport edit as layout access across persisted sessions", () => {
    const document = buildDocument([deltaDefinition.createDefault("delta-main")]);
    document.layouts.race = {
      type: "race",
      widgets: [buildRelativeWidget("relative-race")],
    };
    const command: StudioCommand = {
      type: "document/layout-viewport",
      viewport: { width: 3440, height: 1440 },
    };

    expect(resolveCommandMutations(command)).toEqual(["layout"]);
    expect(() => assertCommandAccess(freePolicy, command, document)).not.toThrow();
  });

  it("allows free users to dispatch relative layout commands", () => {
    const document = buildDocument([buildRelativeWidget()]);
    const command: StudioCommand = {
      type: "widget/layout",
      session: "general",
      widgetIds: ["relative-main"],
      patch: { x: 120 },
    };

    expect(() => assertCommandAccess(freePolicy, command, document)).not.toThrow();
    expect(() => assertCommandAccess(paidPolicy, command, document)).not.toThrow();
  });

  it("throws when a free user dispatches a blocked relative visual command", () => {
    const relative = buildRelativeWidget();
    const document = buildDocument([relative]);
    const command: StudioCommand = {
      type: "widget/visual",
      session: "general",
      widgetIds: ["relative-main"],
      visual: {
        ...relative.visual,
        appearanceOverrides: { showHeader: false },
      },
    };

    expect(() => assertCommandAccess(freePolicy, command, document)).toThrow(StudioAccessError);
    expect(() => assertCommandAccess(paidPolicy, command, document)).not.toThrow();
  });
});

describe("resolveCommandMutations", () => {
  it("maps reset-section commands to the expected mutation", () => {
    expect(
      resolveCommandMutations({
        type: "widget/reset-section",
        session: "general",
        widgetIds: ["delta-main"],
        section: "design",
        saved: buildDocument([deltaDefinition.createDefault("delta-main")]),
      }),
    ).toEqual(["apply-design"]);
  });
});

describe("canMutateWidget", () => {
  it("allows layout mutation for every widget tier", () => {
    expect(canMutateWidget(freePolicy, deltaDefinition.createDefault("delta-main"))).toBe(true);
    expect(canMutateWidget(freePolicy, buildRelativeWidget())).toBe(true);
    expect(canMutateWidget(paidPolicy, buildRelativeWidget())).toBe(true);
  });
});
