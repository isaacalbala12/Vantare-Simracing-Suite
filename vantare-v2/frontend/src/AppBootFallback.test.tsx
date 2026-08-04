import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppBootFallback } from "./AppBootFallback";

describe("AppBootFallback", () => {
  it("shows an accessible boot state instead of a blank screen while a lazy route loads", () => {
    render(<AppBootFallback />);

    expect(screen.getByRole("status").textContent).toContain("Cargando Vantare…");
  });
});
