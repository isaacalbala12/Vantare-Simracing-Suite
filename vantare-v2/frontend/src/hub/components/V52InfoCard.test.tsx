import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { V52InfoCard } from "./V52InfoCard";

afterEach(() => cleanup());

describe("V52InfoCard", () => {
  it("renders title, label and body", () => {
    render(<V52InfoCard label="Beta" title="Novedad" body="Texto real" />);
    expect(screen.getByText("Beta")).toBeTruthy();
    expect(screen.getByText("Novedad")).toBeTruthy();
    expect(screen.getByText("Texto real")).toBeTruthy();
  });
});
