import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { installHubSuspendGuard } from "../hub-suspend-guard";
import { createManualWeatherScenario } from "./strategy-weather-scenarios";
import { StrategyWeatherPanel } from "./StrategyWeatherPanel";

afterEach(() => cleanup());

describe("StrategyWeatherPanel suspend blocker", () => {
  it("publica el borrador al escribir sin esperar al blur", () => {
    const snapshots: Array<{ other?: string[] }> = [];
    const disposeGuard = installHubSuspendGuard({
      on: () => () => undefined,
      emit: (event, payload) => {
        if (event === "hub:blockers") snapshots.push(payload as { other?: string[] });
      },
    }, "weather-generation");

    render(
      <StrategyWeatherPanel
        eventId="event-1"
        onSave={() => undefined}
        saving="idle"
        scenarios={[createManualWeatherScenario("event-1", "combo-1", "weather-1")]}
        t={(key) => key}
      />,
    );
    fireEvent.input(screen.getByLabelText("strategy.weather.weight"), {
      target: { value: "75" },
    });

    expect(snapshots.at(-1)?.other).toHaveLength(1);
    disposeGuard();
  });

  it("conserva la revision B cuando termina el guardado anterior A", async () => {
    const snapshots: Array<{ other?: string[] }> = [];
    const disposeGuard = installHubSuspendGuard({
      on: () => () => undefined,
      emit: (event, payload) => {
        if (event === "hub:blockers") snapshots.push(payload as { other?: string[] });
      },
    }, "weather-generation");
    const deferred = [Promise.withResolvers<void>(), Promise.withResolvers<void>()];
    let saveIndex = 0;
    const scenarios = [createManualWeatherScenario("event-1", "combo-1", "weather-1")];
    const view = (saving: "idle" | "saving") => (
      <StrategyWeatherPanel
        eventId="event-1"
        onSave={() => deferred[saveIndex++].promise}
        saving={saving}
        scenarios={scenarios}
        t={(key) => key}
      />
    );
    const { rerender } = render(view("idle"));
    const weight = screen.getByLabelText("strategy.weather.weight");

    fireEvent.input(weight, { target: { value: "60" } });
    fireEvent.blur(weight);
    rerender(view("saving"));
    fireEvent.input(weight, { target: { value: "70" } });
    fireEvent.blur(weight);

    await act(async () => {
      deferred[0].resolve();
      await deferred[0].promise;
      rerender(view("idle"));
    });
    expect(snapshots.at(-1)?.other).toHaveLength(1);

    await act(async () => {
      deferred[1].resolve();
      await deferred[1].promise;
    });
    expect(snapshots.at(-1)?.other).toHaveLength(0);
    disposeGuard();
  });
});
