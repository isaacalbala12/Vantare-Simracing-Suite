import { describe, expect, it } from "vitest";
import type { AccessContext } from "../../../lib/access-policy";
import { deltaDefinition } from "../../../overlay/widget-types/delta/delta-definition";
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
} from "./studio-access";

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

const staffAccess: AccessContext = {
  planLabel: "free",
  planStatus: "active",
  roles: ["staff"],
  isBlocked: false,
  isUnconfigured: false,
};

const blockedAccess: AccessContext = {
  planLabel: "paid_overlays",
  planStatus: "blocked",
  roles: [],
  isBlocked: true,
  isUnconfigured: false,
};

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

describe("getStudioMutationGate", () => {
  const delta = deltaDefinition.createDefault("delta-main");
  const relative = buildRelativeWidget();

  const cases: Array<{
    name: string;
    access: AccessContext;
    widget: WidgetInstanceV3;
    mutation: StudioMutation;
    allowed: boolean;
    design?: WidgetDesignV1;
  }> = [
    { name: "free mutates delta layout", access: freeAccess, widget: delta, mutation: "layout", allowed: true },
    {
      name: "free can mutate relative layout",
      access: freeAccess,
      widget: relative,
      mutation: "layout",
      allowed: true,
    },
    {
      name: "paid mutates relative layout",
      access: paidAccess,
      widget: relative,
      mutation: "layout",
      allowed: true,
    },
    {
      name: "tester mutates relative duplicate",
      access: testerAccess,
      widget: relative,
      mutation: "duplicate",
      allowed: true,
    },
    {
      name: "staff mutates relative visual",
      access: staffAccess,
      widget: relative,
      mutation: "visual",
      allowed: true,
    },
    {
      name: "blocked cannot mutate delta",
      access: blockedAccess,
      widget: delta,
      mutation: "behavior",
      allowed: false,
    },
    {
      name: "free cannot apply advanced design to delta",
      access: freeAccess,
      widget: delta,
      mutation: "apply-design",
      allowed: false,
      design: advancedDesign,
    },
    {
      name: "paid can apply advanced design to delta",
      access: paidAccess,
      widget: delta,
      mutation: "apply-design",
      allowed: true,
      design: advancedDesign,
    },
  ];

  it.each(cases)("$name", ({ access, widget, mutation, allowed, design }) => {
    expect(getStudioMutationGate({ access, mutation, widget, design }).allowed).toBe(allowed);
  });

  it("always allows save at the gate level", () => {
    expect(getStudioMutationGate({ access: freeAccess, mutation: "save" }).allowed).toBe(true);
  });
});

describe("validateDraftAccess", () => {
  it("allows free users to save unrelated edits when premium widgets are unchanged", () => {
    const saved = buildDocument([deltaDefinition.createDefault("delta-main"), buildRelativeWidget()]);
    const draft = structuredClone(saved);
    draft.layouts.general.widgets[0]!.layout.x = 240;

    expect(validateDraftAccess(freeAccess, saved, draft)).toEqual({ allowed: true });
  });

  it("allows free users to save premium widget layout edits", () => {
    const saved = buildDocument([deltaDefinition.createDefault("delta-main"), buildRelativeWidget()]);
    const draft = structuredClone(saved);
    draft.layouts.general.widgets[1]!.layout.x = 500;

    expect(validateDraftAccess(freeAccess, saved, draft)).toEqual({ allowed: true });
  });

  it("blocks free users from saving premium widget content edits", () => {
    const saved = buildDocument([deltaDefinition.createDefault("delta-main"), buildRelativeWidget()]);
    const draft = structuredClone(saved);
    draft.layouts.general.widgets[1]!.content = { mode: "gap" };

    const result = validateDraftAccess(freeAccess, saved, draft);
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.widgetIds).toEqual(["relative-main"]);
    }
  });

  it("blocks free users from deleting premium widgets", () => {
    const saved = buildDocument([deltaDefinition.createDefault("delta-main"), buildRelativeWidget()]);
    const draft = structuredClone(saved);
    draft.layouts.general.widgets = [draft.layouts.general.widgets[0]!];

    const result = validateDraftAccess(freeAccess, saved, draft);
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.widgetIds).toEqual(["relative-main"]);
    }
  });
});

describe("assertCommandAccess", () => {
  it("allows free users to dispatch relative layout commands", () => {
    const document = buildDocument([buildRelativeWidget()]);
    const command: StudioCommand = {
      type: "widget/layout",
      session: "general",
      widgetIds: ["relative-main"],
      patch: { x: 120 },
    };

    expect(() => assertCommandAccess(freeAccess, command, document)).not.toThrow();
    expect(() => assertCommandAccess(paidAccess, command, document)).not.toThrow();
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

    expect(() => assertCommandAccess(freeAccess, command, document)).toThrow(StudioAccessError);
    expect(() => assertCommandAccess(paidAccess, command, document)).not.toThrow();
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
    expect(canMutateWidget(freeAccess, deltaDefinition.createDefault("delta-main"))).toBe(true);
    expect(canMutateWidget(freeAccess, buildRelativeWidget())).toBe(true);
    expect(canMutateWidget(paidAccess, buildRelativeWidget())).toBe(true);
  });
});