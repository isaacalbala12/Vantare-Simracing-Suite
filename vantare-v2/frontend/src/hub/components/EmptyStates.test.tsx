import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { EmptyActivity } from "./EmptyActivity";

afterEach(() => {
  cleanup();
});

describe("EmptyActivity", () => {
  it("shows sin carreras registradas", () => {
    render(<EmptyActivity />);
    expect(screen.getByText(/sin carreras registradas/i)).toBeTruthy();
  });

  it("explains future behavior", () => {
    render(<EmptyActivity />);
    expect(screen.getByText(/LMU.*conectado/i)).toBeTruthy();
  });
});
