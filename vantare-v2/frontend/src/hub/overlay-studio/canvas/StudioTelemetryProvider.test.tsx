import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { buildMockTelemetry } from "../../../overlay/core/mock-scenarios";
import { createTelemetryStore } from "../../../overlay/core/telemetry-store";
import { StudioProvider, useStudioPreview } from "../state/studio-store";
import {
  ConnectedStudioTelemetryProvider,
  StudioTelemetryProvider,
  useStudioTelemetrySnapshot,
} from "./StudioTelemetryProvider";
import type { StudioProfileClient } from "../state/studio-profile-client";
import { deltaDefinition } from "../../../overlay/widget-types/delta/delta-definition";
import type { ProfileDocumentV3 } from "../../../overlay/core/profile-document";

function buildDocument(): ProfileDocumentV3 {
  return {
    schemaVersion: 3,
    id: "profile-1",
    name: "Test",
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

const client: StudioProfileClient = {
  load: async () => ({ document: buildDocument(), revision: "rev-1" }),
  save: async () => ({ status: "saved", document: buildDocument(), revision: "rev-2" }),
};

function SnapshotProbe(): React.ReactElement {
  const snapshot = useStudioTelemetrySnapshot();
  return <div data-testid="telemetry-probe">{snapshot.session.type}</div>;
}

function SourceSwitcher(): React.ReactElement {
  const { setPreview } = useStudioPreview();
  return (
    <button
      type="button"
      data-testid="use-live-source"
      onClick={() => setPreview({ source: "live" })}
    />
  );
}

describe("StudioTelemetryProvider", () => {
  afterEach(() => cleanup());

  it("serves the mock store snapshot while preview source is mock", () => {
    const mockStore = createTelemetryStore(
      buildMockTelemetry({ session: "qualifying", location: "track", state: "ready" }),
    );
    const liveStore = createTelemetryStore(
      buildMockTelemetry({ session: "race", location: "pits", state: "ready" }),
    );

    render(
      <StudioProvider client={client} initialFile="profiles/a.json">
        <StudioTelemetryProvider mockStore={mockStore} liveStore={liveStore} liveAvailable>
          <SnapshotProbe />
        </StudioTelemetryProvider>
      </StudioProvider>,
    );

    expect(screen.getByTestId("telemetry-probe").textContent).toBe("qualifying");
  });

  it("serves the live store snapshot when preview source is live and live is available", async () => {
    const mockStore = createTelemetryStore(
      buildMockTelemetry({ session: "practice", location: "track", state: "ready" }),
    );
    const liveStore = createTelemetryStore(
      buildMockTelemetry({ session: "race", location: "pits", state: "ready" }),
    );

    render(
      <StudioProvider client={client} initialFile="profiles/a.json">
        <StudioTelemetryProvider mockStore={mockStore} liveStore={liveStore} liveAvailable>
          <SourceSwitcher />
          <SnapshotProbe />
        </StudioTelemetryProvider>
      </StudioProvider>,
    );

    screen.getByTestId("use-live-source").click();
    await waitFor(() => {
      expect(screen.getByTestId("telemetry-probe").textContent).toBe("race");
    });
  });

  it("keeps live source on the live store when LMU is unavailable", async () => {
    const mockStore = createTelemetryStore(
      buildMockTelemetry({ session: "qualifying", location: "track", state: "ready" }),
    );
    const liveStore = createTelemetryStore(
      buildMockTelemetry({ session: "race", location: "track", state: "disconnected" }),
    );

    render(
      <StudioProvider client={client} initialFile="profiles/a.json">
        <StudioTelemetryProvider mockStore={mockStore} liveStore={liveStore} liveAvailable={false}>
          <SourceSwitcher />
          <SnapshotProbe />
        </StudioTelemetryProvider>
      </StudioProvider>,
    );

    fireEvent.click(screen.getByTestId("use-live-source"));
    await waitFor(() => {
      expect(screen.getByTestId("telemetry-probe").textContent).toBe("race");
    });
  });
});

describe("ConnectedStudioTelemetryProvider", () => {
  afterEach(() => cleanup());

  it("republishes mock telemetry when mock session or location changes", async () => {
    function SessionProbe(): React.ReactElement {
      const snapshot = useStudioTelemetrySnapshot();
      return <div data-testid="session-type">{snapshot.session.type}</div>;
    }

    function PreviewChanger(): React.ReactElement {
      const { setPreview } = useStudioPreview();
      return (
        <button
          type="button"
          data-testid="set-race"
          onClick={() => setPreview({ mockSession: "race" })}
        />
      );
    }

    render(
      <StudioProvider client={client} initialFile="profiles/a.json">
        <ConnectedStudioTelemetryProvider>
          <PreviewChanger />
          <SessionProbe />
        </ConnectedStudioTelemetryProvider>
      </StudioProvider>,
    );

    expect(screen.getByTestId("session-type").textContent).toBe("practice");
    fireEvent.click(screen.getByTestId("set-race"));
    await waitFor(() => {
      expect(screen.getByTestId("session-type").textContent).toBe("race");
    });
  });
});