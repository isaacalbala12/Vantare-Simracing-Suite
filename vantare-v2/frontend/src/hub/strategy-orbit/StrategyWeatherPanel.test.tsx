import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

  it.each([
    ["strategy.weather.rain", "35"],
    ["strategy.weather.air", "22"],
    ["strategy.weather.track", "31"],
  ])("Escape cancela y libera %s", (label, changedValue) => {
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
    const input = screen.getAllByLabelText(label)[0] as HTMLInputElement;
    const original = input.value;

    fireEvent.input(input, { target: { value: changedValue } });
    expect(snapshots.at(-1)?.other).toHaveLength(1);
    fireEvent.keyDown(input, { key: "Escape" });

    expect(input.value).toBe(original);
    expect(snapshots.at(-1)?.other).toHaveLength(0);
    disposeGuard();
  });

  it("confirmar lluvia libera solo después de persistir", async () => {
    const snapshots: Array<{ other?: string[] }> = [];
    const disposeGuard = installHubSuspendGuard({
      on: () => () => undefined,
      emit: (event, payload) => {
        if (event === "hub:blockers") snapshots.push(payload as { other?: string[] });
      },
    }, "weather-generation");
    const saved = Promise.withResolvers<void>();
    render(
      <StrategyWeatherPanel
        eventId="event-1"
        onSave={() => saved.promise}
        saving="idle"
        scenarios={[createManualWeatherScenario("event-1", "combo-1", "weather-1")]}
        t={(key) => key}
      />,
    );
    const rain = screen.getAllByLabelText("strategy.weather.rain")[0];

    fireEvent.input(rain, { target: { value: "35" } });
    fireEvent.blur(rain);
    expect(snapshots.at(-1)?.other).toHaveLength(1);

    await act(async () => {
      await Promise.resolve();
    });
    expect(snapshots.at(-1)?.other).toHaveLength(1);

    saved.resolve();

    await waitFor(() => expect(snapshots.at(-1)?.other).toHaveLength(0));
    disposeGuard();
  });
});
