import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../../i18n/I18nProvider";
import type { ProfileDocumentV3, WidgetInstanceV3 } from "../../../overlay/core/profile-document";
import { standingsDefinition } from "../../../overlay/widget-types/standings/standings-definition";
import { pedalsDefinition } from "../../../overlay/widget-types/pedals/pedals-definition";
import type { WidgetDesignClient } from "../designs/widget-design-client";
import { applyStudioCommand } from "../state/studio-command";
import { DesignSection } from "./DesignSection";

afterEach(cleanup);

const client: WidgetDesignClient = {
  list: vi.fn(async () => []),
  save: vi.fn(async (design) => design),
  delete: vi.fn(async () => undefined),
  rename: vi.fn(async () => undefined),
};

function renderDesignSection(initial: WidgetInstanceV3) {
  let latest: ProfileDocumentV3 = {
    schemaVersion: 3, id: "functional-studio", name: "Functional Studio", displayMode: "edit", monitorIndex: 0,
    layouts: { general: { type: "general", widgets: [initial] } },
  };
  function Host() {
    const [document, setDocument] = useState(latest);
    const widgets = document.layouts.general.widgets;
    return <I18nProvider><DesignSection
      widget={widgets[0]} widgets={widgets} session="general" designClient={client}
      access={{ planLabel: "suite", planStatus: "active", roles: [], isBlocked: false, isUnconfigured: false }}
      dispatch={(command) => { latest = applyStudioCommand(document, command); setDocument(latest); }}
    /></I18nProvider>;
  }
  render(<Host />);
  return () => latest.layouts.general.widgets[0];
}

describe("Studio Functional selection", () => {
  it("selects Functional and Broadcast without replacing the configured standings content", async () => {
    const widget = standingsDefinition.createDefault("standings-main");
    widget.content = { ...widget.content, rowCount: 10 };
    const getWidget = renderDesignSection(widget);
    await waitFor(() => expect(screen.queryByTestId("studio-design-user-loading")).toBeNull());
    fireEvent.click(document.getElementById("orbit-design-system")!);
    fireEvent.click(screen.getByRole("option", { name: /Vantare Functional/ }));
    expect(getWidget().visual.systemId).toBe("vantare-functional");
    fireEvent.click(document.getElementById("orbit-design-variant")!);
    fireEvent.click(screen.getByRole("option", { name: /Functional Broadcast/ }));
    expect(getWidget().visual.baseSettings.templateId).toBe("broadcast");
    expect(getWidget().content).toEqual(widget.content);
    expect(getWidget().visual.provenance?.designId).toBe("standings-functional-broadcast");
  });

  it("does not offer the Standings-only system for Pedals", async () => {
    renderDesignSection(pedalsDefinition.createDefault("pedals-main"));
    await waitFor(() => expect(screen.queryByTestId("studio-design-user-loading")).toBeNull());
    fireEvent.click(document.getElementById("orbit-design-system")!);
    expect(screen.queryByRole("option", { name: /Vantare Functional/ })).toBeNull();
  });
});
