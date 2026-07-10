import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { deltaDefinition } from "../../../overlay/widget-types/delta/delta-definition";
import type { ProfileDocumentV3 } from "../../../overlay/core/profile-document";
import { expectDisabled, expectEnabled } from "../test-helpers";
import { StudioProvider, useStudioDocument } from "../state/studio-store";
import type { StudioProfileClient } from "../state/studio-profile-client";
import { StudioHeader } from "./StudioHeader";

function buildDocument(): ProfileDocumentV3 {
  return {
    schemaVersion: 3,
    id: "profile-1",
    name: "Test Profile",
    displayMode: "edit",
    monitorIndex: 0,
    layouts: {
      general: {
        type: "general",
        widgets: [deltaDefinition.createDefault("delta-main")],
      },
    },
  };
}

function createMockClient(): StudioProfileClient {
  return {
    load: vi.fn(async () => ({ document: buildDocument(), revision: "rev-1" })),
    save: vi.fn(async () => ({ status: "saved", document: buildDocument(), revision: "rev-2" })),
  };
}

function DispatchEditButton() {
  const { dispatch } = useStudioDocument();
  return (
    <button
      type="button"
      data-testid="make-dirty"
      onClick={() =>
        dispatch({
          type: "widget/layout",
          session: "general",
          widgetIds: ["delta-main"],
          patch: { x: 200 },
        })
      }
    >
      Editar
    </button>
  );
}

describe("StudioHeader", () => {
  afterEach(() => cleanup());
  it("enables save only when dirty and wires undo/redo capabilities", async () => {
    render(
      <StudioProvider client={createMockClient()} initialFile="profiles/a.json">
        <DispatchEditButton />
        <StudioHeader
          profiles={[{ id: "profile-1", name: "Perfil A", file: "profiles/a.json" }]}
          activeFile="profiles/a.json"
          onRequestProfileChange={vi.fn()}
          onOpenManageProfiles={vi.fn()}
          onOpenRecommended={vi.fn()}
          onOpenCommunity={vi.fn()}
          onOpenObs={vi.fn()}
        />
      </StudioProvider>,
    );

    await waitFor(() => expectDisabled(screen.getByTestId("studio-save-button")));
    expectDisabled(screen.getByTestId("studio-undo-button"));
    expectDisabled(screen.getByTestId("studio-redo-button"));

    fireEvent.click(screen.getByTestId("make-dirty"));

    await waitFor(() => expectEnabled(screen.getByTestId("studio-save-button")));
    expectEnabled(screen.getByTestId("studio-undo-button"));

    fireEvent.click(screen.getByTestId("studio-undo-button"));
    await waitFor(() => expectDisabled(screen.getByTestId("studio-save-button")));

    fireEvent.click(screen.getByTestId("studio-redo-button"));
    await waitFor(() => expectEnabled(screen.getByTestId("studio-save-button")));
  });

  it("switches sessions without requiring save", async () => {
    const onRequestProfileChange = vi.fn();
    render(
      <StudioProvider client={createMockClient()} initialFile="profiles/a.json">
        <StudioHeader
          profiles={[{ id: "profile-1", name: "Perfil A", file: "profiles/a.json" }]}
          activeFile="profiles/a.json"
          onRequestProfileChange={onRequestProfileChange}
          onOpenManageProfiles={vi.fn()}
          onOpenRecommended={vi.fn()}
          onOpenCommunity={vi.fn()}
          onOpenObs={vi.fn()}
        />
      </StudioProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("studio-session-select")).toBeTruthy());
    fireEvent.change(screen.getByTestId("studio-session-select"), { target: { value: "race" } });
    expect((screen.getByTestId("studio-session-select") as HTMLSelectElement).value).toBe("race");
    expect(onRequestProfileChange).not.toHaveBeenCalled();
  });

  it("calls save through the header button", async () => {
    const client = createMockClient();
    render(
      <StudioProvider client={client} initialFile="profiles/a.json">
        <DispatchEditButton />
        <StudioHeader
          profiles={[{ id: "profile-1", name: "Perfil A", file: "profiles/a.json" }]}
          activeFile="profiles/a.json"
          onRequestProfileChange={vi.fn()}
          onOpenManageProfiles={vi.fn()}
          onOpenRecommended={vi.fn()}
          onOpenCommunity={vi.fn()}
          onOpenObs={vi.fn()}
        />
      </StudioProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("make-dirty")).toBeTruthy());
    fireEvent.click(screen.getByTestId("make-dirty"));
    await act(async () => {
      fireEvent.click(screen.getByTestId("studio-save-button"));
    });
    await waitFor(() => expect(client.save).toHaveBeenCalledOnce());
  });
});