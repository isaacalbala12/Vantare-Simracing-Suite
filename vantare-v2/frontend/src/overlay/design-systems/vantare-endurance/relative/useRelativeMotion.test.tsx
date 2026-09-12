import { createRef } from "react";
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
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

function model(rows: RelativeRowViewModel[], presentationKey?: string): RelativeViewModel {
  return { type: "relative", status: "ready", columns: [], rowHeightMode: "auto", rows, presentationKey };
}

const player = row("me", 0, true);

function renderMotion(initial: RelativeViewModel) {
  const rootRef = createRef<HTMLElement>();
  return renderHook(({ value }) => useRelativeMotion(value, true, rootRef), {
    initialProps: { value: initial },
  });
}

describe("rows leaving the visible window", () => {
  afterEach(() => vi.useRealTimers());

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

  it("does not add a sixth row ghost when a departed rival is replaced in the same window", () => {
    const initial = model([
      row("far-ahead", 2),
      row("near-ahead", 1),
      player,
      row("near-behind", -1),
      row("far-behind", -2),
    ]);
    const replacement = model([
      row("near-ahead", 1),
      row("new-ahead", 0.5),
      player,
      row("near-behind", -1),
      row("far-behind", -2),
    ]);
    const { result, rerender } = renderMotion(initial);

    rerender({ value: replacement });

    expect(replacement.rows).toHaveLength(5);
    expect(replacement.rows.length + result.current.ghosts.length).toBe(5);
    expect(result.current.ghosts).toHaveLength(0);
  });

  it("does not let an old timer delete a later disappearance of the same row", () => {
    vi.useFakeTimers();
    const rows = [row("a", 1), player, row("b", -1)];
    const withoutB = model([row("a", 1), player]);
    const { result, rerender } = renderMotion(model(rows));

    rerender({ value: withoutB });
    expect(result.current.ghosts.map((ghost) => ghost.row.id)).toEqual(["b"]);
    act(() => vi.advanceTimersByTime(200));
    rerender({ value: model(rows) });
    rerender({ value: withoutB });
    expect(result.current.ghosts.map((ghost) => ghost.row.id)).toEqual(["b"]);

    act(() => vi.advanceTimersByTime(180));
    expect(result.current.ghosts.map((ghost) => ghost.row.id)).toEqual(["b"]);
  });

  it.each(["epoch", "session"])("does not create ghosts when the ready %s scope changes", (scope) => {
    const initialKey = "profile:widget:1:session-a";
    const nextKey = scope === "epoch" ? "profile:widget:2:session-a" : "profile:widget:1:session-b";
    const { result, rerender } = renderMotion(
      model([row("a", 1), player, row("b", -1)], initialKey),
    );

    rerender({ value: model([row("a", 1), player], nextKey) });

    expect(result.current.ghosts).toHaveLength(0);
  });
});
