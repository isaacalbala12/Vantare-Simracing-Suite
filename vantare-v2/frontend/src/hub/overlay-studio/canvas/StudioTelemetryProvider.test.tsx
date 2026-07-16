import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { buildMockTelemetry } from "../../../overlay/core/mock-scenarios";
import { createTelemetryRateCoordinator } from "../../../overlay/core/telemetry-rate-coordinator";
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

  it("serves mock telemetry while preview source is mock", () => {
    const coordinator = createTelemetryRateCoordinator();
    coordinator.publish(
      buildMockTelemetry({ session: "qualifying", location: "track", state: "ready" }),
    );

    render(
      <StudioProvider client={client} initialFile="profiles/a.json">
        <StudioTelemetryProvider coordinator={coordinator} liveAvailable>
          <SnapshotProbe />
        </StudioTelemetryProvider>
      </StudioProvider>,
    );

    expect(screen.getByTestId("telemetry-probe").textContent).toBe("qualifying");
  });

  it("republishes mock telemetry when mock session changes", async () => {
    const coordinator = createTelemetryRateCoordinator();
    coordinator.publish(
      buildMockTelemetry({ session: "practice", location: "track", state: "ready" }),
    );

    function SessionChanger(): React.ReactElement {
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
        <StudioTelemetryProvider coordinator={coordinator} liveAvailable={false}>
          <SessionChanger />
          <SnapshotProbe />
        </StudioTelemetryProvider>
      </StudioProvider>,
    );

    expect(screen.getByTestId("telemetry-probe").textContent).toBe("practice");
    fireEvent.click(screen.getByTestId("set-race"));
    await waitFor(() => {
      expect(screen.getByTestId("telemetry-probe").textContent).toBe("race");
    });
  });

  it("starts the live adapter only when preview source is live", async () => {
    const coordinator = createTelemetryRateCoordinator();
    let started = 0;
    let stopped = 0;
    const telemetryAdapter = {
      coordinator,
      start() {
        started += 1;
        coordinator.publish(
          buildMockTelemetry({ session: "race", location: "pits", state: "ready" }),
        );
      },
      stop() {
        stopped += 1;
      },
    };

    render(
      <StudioProvider client={client} initialFile="profiles/a.json">
        <StudioTelemetryProvider
          coordinator={coordinator}
          liveAvailable
          telemetryAdapter={telemetryAdapter}
        >
          <SourceSwitcher />
          <SnapshotProbe />
        </StudioTelemetryProvider>
      </StudioProvider>,
    );

    expect(started).toBe(0);
    fireEvent.click(screen.getByTestId("use-live-source"));
    await waitFor(() => {
      expect(started).toBe(1);
      expect(screen.getByTestId("telemetry-probe").textContent).toBe("race");
    });
    expect(stopped).toBeGreaterThanOrEqual(0);
  });
});

describe("ConnectedStudioTelemetryProvider", () => {
  afterEach(() => cleanup());

  it("wires coordinator and live availability through the connected provider", () => {
    const coordinator = createTelemetryRateCoordinator();
    coordinator.publish(
      buildMockTelemetry({ session: "qualifying", location: "track", state: "ready" }),
    );

    render(
      <StudioProvider client={client} initialFile="profiles/a.json">
        <ConnectedStudioTelemetryProvider coordinator={coordinator} liveAvailable={false}>
          <SnapshotProbe />
        </ConnectedStudioTelemetryProvider>
      </StudioProvider>,
    );

    expect(screen.getByTestId("telemetry-probe").textContent).toBe("qualifying");
  });
});