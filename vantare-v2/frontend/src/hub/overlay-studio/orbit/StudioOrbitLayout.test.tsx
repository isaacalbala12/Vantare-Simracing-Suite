import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../designs/widget-design-client", () => ({
  createWailsWidgetDesignClient: () => ({
    list: vi.fn(async () => []),
    save: vi.fn(async (design: unknown) => design),
    delete: vi.fn(async () => undefined),
    rename: vi.fn(async () => undefined),
  }),
}));

vi.mock("@wailsio/runtime", () => ({
  Events: {
    On: vi.fn(() => () => undefined),
    Emit: vi.fn(),
  },
}));

import type { ProfileDocumentV3, WidgetInstanceV3 } from "../../../overlay/core/profile-document";
import { deltaDefinition } from "../../../overlay/widget-types/delta/delta-definition";
import { standingsDefinition } from "../../../overlay/widget-types/standings/standings-definition";
import { I18nProvider } from "../../../i18n/I18nProvider";
import { StudioTelemetryProvider } from "../canvas/StudioTelemetryProvider";
import { StudioConfirmProvider } from "../components/StudioConfirmProvider";
import { StudioProvider } from "../state/studio-store";
import type { StudioProfileClient } from "../state/studio-profile-client";
import { createTestTelemetryCoordinator } from "../test-helpers";
import { ORBIT_KEYS, orbitStore } from "../../orbit/orbit-store";
import { StudioOrbitLayout } from "./StudioOrbitLayout";
import { STUDIO_CONTEXT_SLOT_ID, STUDIO_TOPBAR_SLOT_ID } from "./studio-orbit-slots";

function widget(id: string, overrides: Partial<WidgetInstanceV3> = {}): WidgetInstanceV3 {
  const base = id.startsWith("standings")
    ? standingsDefinition.createDefault(id)
    : deltaDefinition.createDefault(id);
  return { ...base, name: id === "delta-main" ? "Delta principal" : id, ...overrides };
}

function buildDocument(widgets: WidgetInstanceV3[]): ProfileDocumentV3 {
  return {
    schemaVersion: 3,
    id: "profile-1",
    name: "Perfil de prueba",
    displayMode: "edit",
    monitorIndex: 0,
    layouts: { general: { type: "general", widgets } },
  };
}

function createClient(document: ProfileDocumentV3): StudioProfileClient {
  return {
    load: vi.fn(async () => ({ document: structuredClone(document), revision: "rev-1" })),
    save: vi.fn(async (input) => ({
      status: "saved" as const,
      document: structuredClone(input.document),
      revision: "rev-2",
    })),
  };
}

function renderStudio(document = buildDocument([widget("delta-main"), widget("standings-main")])) {
  const context = window.document.createElement("div");
  context.id = STUDIO_CONTEXT_SLOT_ID;
  const topbar = window.document.createElement("div");
  topbar.id = STUDIO_TOPBAR_SLOT_ID;
  window.document.body.append(context, topbar);

  return render(
    <I18nProvider>
      <StudioProvider client={createClient(document)} initialFile="profile.json">
        <StudioTelemetryProvider coordinator={createTestTelemetryCoordinator()} liveAvailable={false}>
          <StudioConfirmProvider>
            <StudioOrbitLayout
              activeFile="profile.json"
              onRequestProfileChange={vi.fn()}
              profiles={[{ id: "profile-1", name: "Perfil de prueba", file: "profile.json" }]}
            />
          </StudioConfirmProvider>
        </StudioTelemetryProvider>
      </StudioProvider>
    </I18nProvider>,
  );
}

afterEach(() => {
  cleanup();
  window.document.getElementById(STUDIO_CONTEXT_SLOT_ID)?.remove();
  window.document.getElementById(STUDIO_TOPBAR_SLOT_ID)?.remove();
});

beforeEach(() => {
  window.localStorage.clear();
});

describe("StudioOrbitLayout", () => {
  it("sincroniza la selección entre lista, lienzo e inspector", async () => {
    renderStudio();
    const row = await screen.findByTestId("orbit-studio-widget-item-delta-main");
    fireEvent.click(within(row).getByRole("option"));

    await waitFor(() => {
      expect(
        screen.getByTestId("orbit-studio-inspector").getAttribute("data-widget-id"),
      ).toBe("delta-main");
    });
    expect(screen.getByTestId("orbit-studio-inspector-name").textContent).toContain(
      "Delta principal",
    );
    expect(screen.getByTestId("studio-widget-frame-delta-main").className).toContain(
      "osv3-widget-frame--selected",
    );
    expect(screen.getByTestId("orbit-studio-status-selection").textContent).toContain("1");
  });

  it("el ojo de la lista oculta el widget y tacha su nombre", async () => {
    renderStudio();
    const eye = await screen.findByTestId("orbit-studio-widget-eye-delta-main");
    fireEvent.click(eye);

    await waitFor(() => {
      expect(
        screen.getByTestId("orbit-studio-widget-item-delta-main").getAttribute("data-enabled"),
      ).toBe("false");
    });
    // La marca de oculto del lienzo es el badge que ya pinta el host V3; el
    // 12 % de opacidad cuelga de él en `orbit-studio.css`.
    expect(screen.getByTestId("studio-widget-hidden-badge-delta-main")).toBeTruthy();
  });

  it("actualiza en vivo el resumen del acordeón de comportamiento", async () => {
    renderStudio();
    fireEvent.click(
      within(await screen.findByTestId("orbit-studio-widget-item-delta-main")).getByRole("option"),
    );
    const inspector = await screen.findByTestId("orbit-studio-inspector");
    const summaries = () =>
      [...inspector.querySelectorAll(".orbit-acc__sum")].map((node) => node.textContent ?? "");

    await waitFor(() => expect(summaries().join(" ")).toContain("fps"));
    const before = summaries().find((text) => text.includes("fps")) ?? "";

    fireEvent.click(screen.getByTestId("studio-behavior-hz-10"));

    await waitFor(() => {
      const after = summaries().find((text) => text.includes("fps")) ?? "";
      expect(after).not.toBe(before);
      expect(after).toContain("10");
    });
  });

  it("pliega el inspector con la preferencia rightDock", async () => {
    orbitStore.set(ORBIT_KEYS.rightDock, "closed");
    renderStudio();
    await waitFor(() => {
      expect(screen.getByTestId("orbit-studio").getAttribute("data-right-dock")).toBe("closed");
    });
    expect(screen.getByTestId("orbit-studio-dock").hasAttribute("hidden")).toBe(true);

    fireEvent.click(screen.getByTestId("orbit-studio-dock-toggle"));
    await waitFor(() => {
      expect(screen.getByTestId("orbit-studio").getAttribute("data-right-dock")).toBe("open");
    });
    expect(orbitStore.get(ORBIT_KEYS.rightDock)).toBe("open");
  });

  it("la topbar refleja el estado real de guardado", async () => {
    renderStudio();
    const save = await screen.findByTestId("orbit-studio-save");
    expect(save.getAttribute("data-s")).toBe("saved");

    fireEvent.click(
      within(await screen.findByTestId("orbit-studio-widget-item-delta-main")).getByRole("option"),
    );
    fireEvent.click(await screen.findByTestId("studio-layout-center"));

    await waitFor(() => {
      expect(screen.getByTestId("orbit-studio-save").getAttribute("data-s")).toBe("dirty");
    });

    fireEvent.click(screen.getByTestId("orbit-studio-save"));
    await waitFor(() => {
      expect(screen.getByTestId("orbit-studio-save").getAttribute("data-s")).toBe("saved");
    });
  });

  it("no usa el `title` nativo en ninguno de sus controles", async () => {
    renderStudio();
    await screen.findByTestId("orbit-studio-toolbar");
    expect(screen.getByTestId("orbit-studio").querySelectorAll("[title]").length).toBe(0);
    expect(
      screen.getByTestId("orbit-studio-widget-list").querySelectorAll("[title]").length,
    ).toBe(0);
  });
});
