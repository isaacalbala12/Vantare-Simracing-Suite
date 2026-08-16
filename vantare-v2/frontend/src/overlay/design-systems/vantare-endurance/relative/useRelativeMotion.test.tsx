import { createRef } from "react";
import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type {
  RelativeRowViewModel,
  RelativeViewModel,
} from "../../../widget-types/relative/relative-view-model";
import { useRelativeMotion } from "./useRelativeMotion";

function row(id: string, gapSeconds: number, isPlayer = false): RelativeRowViewModel {
  return {
    id,
    position: 10,
    vehicleClass: "GT3",
    driverNumber: "51",
    driverName: `Driver ${id}`,
    gapText: `${gapSeconds}`,
    bestLapText: "1:38.0",
    lastLapText: "1:38.4",
    isPlayer,
    side: isPlayer ? "player" : gapSeconds > 0 ? "ahead" : "behind",
    tone: isPlayer ? "player" : gapSeconds > 0 ? "ahead" : "behind",
    gapSeconds,
  };
}

function model(rows: RelativeRowViewModel[]): RelativeViewModel {
  return { type: "relative", status: "ready", columns: [], rowHeightMode: "auto", rows };
}

const player = row("me", 0, true);

function renderMotion(initial: RelativeViewModel) {
  const rootRef = createRef<HTMLElement>();
  return renderHook(({ value }) => useRelativeMotion(value, true, rootRef), {
    initialProps: { value: initial },
  });
}

describe("rows leaving the visible window", () => {
  it("reports no ghosts while the field is stable", () => {
    const { result } = renderMotion(model([row("a", 1), player]));
    expect(result.current.ghosts).toHaveLength(0);
  });

  // Held in the render that drops the row, not a beat later: otherwise the list
  // closes over the gap first and the fold plays where the row never was.
  it("holds a departed row as a ghost in the render that drops it", () => {
    const { result, rerender } = renderMotion(model([row("a", 1), player, row("b", -1)]));
    rerender({ value: model([row("a", 1), player]) });

    expect(result.current.ghosts).toHaveLength(1);
    expect(result.current.ghosts[0]?.row.id).toBe("b");
  });

  it("remembers where the row sat, so the fold happens in its place", () => {
    const { result, rerender } = renderMotion(model([row("a", 1), player, row("b", -1)]));
    rerender({ value: model([row("a", 1), player]) });
    expect(result.current.ghosts[0]?.index).toBe(2);
  });

  it("never ghosts the player", () => {
    const { result, rerender } = renderMotion(model([row("a", 1), player]));
    rerender({ value: model([row("a", 1)]) });
    expect(result.current.ghosts).toHaveLength(0);
  });

  it("drops the ghost as soon as the row comes back", () => {
    const rows = [row("a", 1), player, row("b", -1)];
    const { result, rerender } = renderMotion(model(rows));
    rerender({ value: model([row("a", 1), player]) });
    expect(result.current.ghosts).toHaveLength(1);

    rerender({ value: model(rows) });
    expect(result.current.ghosts).toHaveLength(0);
  });
});
