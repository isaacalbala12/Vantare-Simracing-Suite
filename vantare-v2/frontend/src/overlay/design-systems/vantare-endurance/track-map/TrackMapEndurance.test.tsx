import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TrackMapEndurance } from "./TrackMapEndurance";

describe("TrackMapEndurance", () => {
  it("identifies classes and the player without inventing missing class data", () => {
    const { container } = render(<TrackMapEndurance settings={{}} model={{
      type: "track-map", status: "ready", synthetic: false, showTrackLabel: true,
      outlinePath: "M 0 0 L 100 100", viewBox: "0 0 320 220", trackLabel: "Monza",
      markers: [
        { id: "p1", x: 20, y: 20, isPlayer: true, classId: "GT3" },
        { id: "p2", x: 40, y: 40, isPlayer: false },
      ],
    }} />);
    expect(screen.getByText("GT3")).toBeDefined();
    expect(screen.getByText("Class unavailable")).toBeDefined();
    expect(screen.getByText("YOU")).toBeDefined();
    expect(container.querySelector('[data-track-map-car="p1"]')?.getAttribute("r")).toBe("7");
  });
});
