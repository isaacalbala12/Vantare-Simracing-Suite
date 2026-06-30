import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { V52SectionHeader } from "./V52SectionHeader";

afterEach(() => cleanup());

describe("V52SectionHeader", () => {
  it("renders heading and description", () => {
    render(<V52SectionHeader title="Launcher" description="Configura apps." />);
    expect(screen.getByRole("heading", { name: "Launcher" })).toBeTruthy();
    expect(screen.getByText("Configura apps.")).toBeTruthy();
  });
});
