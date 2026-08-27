import { beforeEach, describe, expect, it } from "vitest";

import { createStrategyApplicationClient } from "../strategy/strategy-application-client";
import {
  activateOrbitRevision,
  loadOrbitLifecycle,
  saveOrbitRevision,
  type StrategyOrbitRevisionPayloadV1,
} from "../hub/strategy-orbit/strategy-orbit-lifecycle";
import { Events } from "./wails-runtime-mock";

const visible: StrategyOrbitRevisionPayloadV1 = {
  contractVersion: "strategy.orbit.revision.v1",
  event: { id: "reload-event", name: "Enduro", track: "Imola" },
  variant: { id: "strategy-a", name: "Base", mode: "dry", order: ["driver-1"] },
  calculatedPlan: { totalLaps: 139, stints: [{ laps: 28 }] },
};

function runtimeClient() {
  return createStrategyApplicationClient<StrategyOrbitRevisionPayloadV1>({
    emit: (name, payload) => Events.Emit(name, payload),
    on: (name, listener) => Events.On(name, listener),
  }, 2_000);
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("Wails runtime mock · persistencia Strategy", () => {
  it("una recarga conserva draft, revisión exacta y ActivePlan", async () => {
    const firstClient = runtimeClient();
    const saved = await saveOrbitRevision(firstClient, visible, "Enduro · Base", {
      id: () => "reload-save",
      now: () => "2026-08-21T18:00:00Z",
    });
    const activated = await activateOrbitRevision(firstClient, saved, {
      id: () => "reload-activate",
      now: () => "2026-08-21T18:01:00Z",
    });
    firstClient.dispose();

    const reloadedClient = runtimeClient();
    const reopened = await loadOrbitLifecycle(reloadedClient, visible, "after-reload");
    reloadedClient.dispose();

    expect(reopened.savedRevision).toEqual(saved.revision);
    expect(reopened.activePlan).toEqual(activated.activePlan);
    expect(reopened.activePlan?.revision).toEqual(saved.revision);
    expect(reopened.repositoryVersion).toBeGreaterThan(0);
  });
});
