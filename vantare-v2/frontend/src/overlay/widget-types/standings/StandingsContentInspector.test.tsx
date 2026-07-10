import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { standingsDefinition } from "./standings-definition";
import { StandingsContentInspector } from "./StandingsContentInspector";

describe("StandingsContentInspector", () => {
  afterEach(() => cleanup());

  it("toggles and reorders columns through onContentChange", () => {
    const widget = standingsDefinition.createDefault("standings-main");
    const onContentChange = vi.fn();
    render(<StandingsContentInspector widget={widget} onContentChange={onContentChange} />);

    expect(screen.getByTestId("studio-inspector-section-content")).toBeTruthy();
    fireEvent.click(screen.getByTestId("studio-standings-column-up-driverName"));
    expect(onContentChange).toHaveBeenCalled();
    const reordered = onContentChange.mock.calls.at(-1)?.[0] as { columns: { id: string }[] };
    expect(reordered.columns[1]?.id).toBe("driverName");

    fireEvent.click(
      screen.getByTestId("studio-standings-column-driverName").querySelector("input")!,
    );
    const toggled = onContentChange.mock.calls.at(-1)?.[0] as {
      columns: { id: string; enabled: boolean }[];
    };
    expect(toggled.columns.find((column) => column.id === "driverName")?.enabled).toBe(false);
  });

  it("updates width presets without exposing metric id editing", () => {
    const widget = standingsDefinition.createDefault("standings-main");
    const onContentChange = vi.fn();
    render(<StandingsContentInspector widget={widget} onContentChange={onContentChange} />);

    fireEvent.change(screen.getByTestId("studio-standings-column-width-gap"), {
      target: { value: "lg" },
    });
    const updated = onContentChange.mock.calls.at(-1)?.[0] as {
      columns: { id: string; widthPreset: string }[];
    };
    expect(updated.columns.find((column) => column.id === "gap")?.widthPreset).toBe("lg");
    expect(screen.queryByRole("combobox", { name: /metric/i })).toBeNull();
  });
});