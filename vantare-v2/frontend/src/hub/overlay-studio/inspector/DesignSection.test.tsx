import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AccessContext } from "../../../lib/access-policy";
import { OFFICIAL_DESIGNS_SECTION_LABEL } from "../../../overlay/design-systems/official-designs";
import { deltaDefinition } from "../../../overlay/widget-types/delta/delta-definition";
import type { WidgetInstanceV3 } from "../../../overlay/core/profile-document";
import type { WidgetDesignV1 } from "../../../overlay/core/widget-design";
import type { WidgetDesignClient } from "../designs/widget-design-client";
import type { StudioCommand } from "../state/studio-command";
import { DesignSection } from "./DesignSection";

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

function userDesign(overrides: Partial<WidgetDesignV1> = {}): WidgetDesignV1 {
  return {
    id: "user-design-1",
    name: "User Delta",
    widgetType: "delta",
    systemId: "vantare-original",
    systemVersion: 1,
    configVersion: 1,
    visual: { showHeader: false },
    includesContent: false,
    origin: "user",
    ...overrides,
  };
}

function createDesignClient(designs: WidgetDesignV1[] = []): WidgetDesignClient {
  const store = [...designs];
  return {
    list: vi.fn(async () => [...store]),
    save: vi.fn(async (design) => {
      const saved = { ...design, id: design.id || "saved-design-id" };
      store.push(saved);
      return saved;
    }),
    delete: vi.fn(async (id) => {
      const index = store.findIndex((design) => design.id === id);
      if (index >= 0) {
        store.splice(index, 1);
      }
    }),
    rename: vi.fn(async () => undefined),
  };
}

function widgetWithProvenance(designId: string): WidgetInstanceV3 {
  const widget = deltaDefinition.createDefault("delta-main");
  return {
    ...widget,
    visual: {
      ...widget.visual,
      provenance: {
        designId,
        designName: "Active",
        origin: "vantare",
        appliedAt: "2026-07-10T00:00:00Z",
      },
    },
  };
}

describe("DesignSection", () => {
  afterEach(() => cleanup());

  it("segments official and user designs with active provenance indicator", async () => {
    const widget = widgetWithProvenance("delta-original-base");
    const designClient = createDesignClient([userDesign()]);

    render(
      <DesignSection
        widget={widget}
        session="general"
        widgets={[widget]}
        access={freeAccess}
        dispatch={vi.fn()}
        designClient={designClient}
      />,
    );

    await waitFor(() => {
      expect(screen.queryByTestId("studio-design-user-loading")).toBeNull();
    });

    expect(screen.getByTestId("studio-design-official-section").textContent).toContain(
      OFFICIAL_DESIGNS_SECTION_LABEL,
    );
    expect(screen.getByTestId("studio-design-user-section")).toBeTruthy();
    expect(screen.getByTestId("studio-design-active-delta-original-base")).toBeTruthy();
    expect(screen.getByTestId("studio-design-item-user-design-1")).toBeTruthy();
  });

  it("filters designs hierarchically by visual system and supports keyboard selection", async () => {
    const widget = deltaDefinition.createDefault("delta-main");
    const designClient = createDesignClient([
      userDesign({ id: "user-original", name: "Original user" }),
      userDesign({ id: "user-crystal", name: "Crystal user", systemId: "vantare-crystal" }),
    ]);
    render(
      <DesignSection
        widget={widget}
        session="general"
        widgets={[widget]}
        access={freeAccess}
        dispatch={vi.fn()}
        designClient={designClient}
      />,
    );

    await waitFor(() => expect(screen.queryByTestId("studio-design-user-loading")).toBeNull());
    expect(screen.getByTestId("studio-design-system-vantare-original").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("studio-design-item-delta-original-base")).toBeTruthy();
    expect(screen.queryByTestId("studio-design-item-delta-crystal-bar")).toBeNull();
    expect(screen.getByTestId("studio-design-item-user-original")).toBeTruthy();
    expect(screen.queryByTestId("studio-design-item-user-crystal")).toBeNull();

    const crystalButton = screen.getByTestId("studio-design-system-vantare-crystal");
    fireEvent.keyDown(crystalButton, { key: " " });
    expect(crystalButton.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("studio-design-item-delta-crystal-bar")).toBeTruthy();
    expect(screen.queryByTestId("studio-design-item-delta-time-attack")).toBeNull();
    expect(screen.getByTestId("studio-design-item-user-crystal")).toBeTruthy();
    expect(screen.queryByTestId("studio-design-item-user-original")).toBeNull();
    expect(screen.getByTestId("studio-design-official-section").textContent).not.toContain("vantare-crystal");

    const originalButton = screen.getByTestId("studio-design-system-vantare-original");
    fireEvent.keyDown(originalButton, { key: "Enter" });
    expect(originalButton.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("studio-design-item-delta-time-attack")).toBeTruthy();
  });

  it("dispatches apply-design for a single widget", async () => {
    const widget = deltaDefinition.createDefault("delta-main");
    const dispatch = vi.fn<(command: StudioCommand) => void>();
    const designClient = createDesignClient();

    render(
      <DesignSection
        widget={widget}
        session="general"
        widgets={[widget]}
        access={freeAccess}
        dispatch={dispatch}
        designClient={designClient}
      />,
    );

    fireEvent.click(screen.getByTestId("studio-design-system-vantare-crystal"));
    await waitFor(() => {
      expect(screen.getByTestId("studio-design-apply-delta-crystal-bar")).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("studio-design-apply-delta-crystal-bar"));

    expect(dispatch).toHaveBeenCalledTimes(1);
    const command = dispatch.mock.calls[0]?.[0];
    expect(command?.type).toBe("widget/apply-design");
    if (command?.type === "widget/apply-design") {
      expect(command.widgetIds).toEqual(["delta-main"]);
      expect(command.design.id).toBe("delta-crystal-bar");
      expect(command.design.visual).toEqual({ templateId: "delta-bar", showHeader: true });
    }
  });

  it("applies to all compatible widgets in one command after confirmation", async () => {
    const widgetA = deltaDefinition.createDefault("delta-a");
    const widgetB = deltaDefinition.createDefault("delta-b");
    const dispatch = vi.fn<(command: StudioCommand) => void>();
    const confirmApplyAll = vi.fn(() => true);

    render(
      <DesignSection
        widget={widgetA}
        session="general"
        widgets={[widgetA, widgetB]}
        access={freeAccess}
        dispatch={dispatch}
        designClient={createDesignClient()}
        confirmApplyAll={confirmApplyAll}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("studio-design-apply-all-delta-original-base")).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("studio-design-apply-all-delta-original-base"));

    expect(confirmApplyAll).toHaveBeenCalledWith(
      'Aplicar "Original Base" a 2 widget(s) compatible(s) en esta sesión.',
    );
    const command = dispatch.mock.calls[0]?.[0];
    expect(command?.type).toBe("widget/apply-design");
    if (command?.type === "widget/apply-design") {
      expect(command.widgetIds).toEqual(["delta-a", "delta-b"]);
    }
  });

  it("saves a user design from resolved visual settings without layout fields", async () => {
    const widget = deltaDefinition.createDefault("delta-main");
    widget.visual.appearanceOverrides = { showHeader: false };
    const designClient = createDesignClient();

    render(
      <DesignSection
        widget={widget}
        session="general"
        widgets={[widget]}
        access={freeAccess}
        dispatch={vi.fn()}
        designClient={designClient}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("studio-design-save-open")).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("studio-design-save-open"));
    fireEvent.change(screen.getByTestId("studio-save-design-name"), { target: { value: "Race HUD" } });
    fireEvent.click(screen.getByTestId("studio-save-design-confirm"));

    await waitFor(() => {
      expect(designClient.save).toHaveBeenCalled();
    });

    const saved = (designClient.save as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as WidgetDesignV1;
    expect(saved.name).toBe("Race HUD");
    expect(saved.includesContent).toBe(false);
    expect(saved.visual).toEqual({ showHeader: false });
    expect(saved).not.toHaveProperty("layout");
    expect(saved).not.toHaveProperty("behavior");
  });

  it("locks advanced designs for free users", async () => {
    const widget = deltaDefinition.createDefault("delta-main");
    const advancedDesign = userDesign({
      id: "advanced-design",
      requiredFeature: "overlays.advanced",
    });

    render(
      <DesignSection
        widget={widget}
        session="general"
        widgets={[widget]}
        access={freeAccess}
        dispatch={vi.fn()}
        designClient={createDesignClient([advancedDesign])}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("studio-design-lock-advanced-design")).toBeTruthy();
    });
    expect(screen.queryByTestId("studio-design-apply-advanced-design")).toBeNull();
  });

  it("renames and deletes user designs", async () => {
    const widget = deltaDefinition.createDefault("delta-main");
    const designClient = createDesignClient([userDesign()]);

    render(
      <DesignSection
        widget={widget}
        session="general"
        widgets={[widget]}
        access={paidAccess}
        dispatch={vi.fn()}
        designClient={designClient}
        confirmDelete={() => true}
        promptRename={() => "Renamed Delta"}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("studio-design-rename-user-design-1")).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("studio-design-rename-user-design-1"));
    await waitFor(() => {
      expect(designClient.rename).toHaveBeenCalledWith("user-design-1", "Renamed Delta");
    });

    fireEvent.click(screen.getByTestId("studio-design-delete-user-design-1"));
    await waitFor(() => {
      expect(designClient.delete).toHaveBeenCalledWith("user-design-1");
    });
    expect(screen.queryByTestId("studio-design-item-user-design-1")).toBeNull();
  });
});
