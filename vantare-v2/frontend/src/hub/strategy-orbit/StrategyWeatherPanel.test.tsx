import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
});
