import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { V52CalendarStrip } from "./V52CalendarStrip";

vi.mock("./NextRaceCard", () => ({
  NextRaceCard: () => <div data-testid="next-race-card">next</div>,
}));

afterEach(() => cleanup());

describe("V52CalendarStrip", () => {
  it("renders the dashboard calendar heading", () => {
    render(<V52CalendarStrip />);
    expect(screen.getByText(/Próximas carreras/i)).toBeTruthy();
  });

  it("uses the real NextRaceCard component slot", () => {
    render(<V52CalendarStrip />);
    expect(screen.getByTestId("next-race-card")).toBeTruthy();
  });

  it("does not render fake bronze silver gold race names", () => {
    render(<V52CalendarStrip />);
    expect(screen.queryByText(/Sebring/i)).toBeNull();
    expect(screen.queryByText(/COTA/i)).toBeNull();
    expect(screen.queryByText(/Paul Ricard/i)).toBeNull();
  });
});
