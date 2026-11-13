// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("../src/measurement", () => ({ measurementHome: true }));

import { UiProvider, useUi } from "../src/renderer/app/UiState";

afterEach(cleanup);
function Probe() {
  const section = useUi((s) => s.section);
  const navigate = useUi((s) => s.navigate);
  return (
    <>
      <output>{section}</output>
      <button type="button" onClick={() => navigate("roadmap")}>
        Roadmap
      </button>
      <button type="button" onClick={() => navigate("home")}>
        Inicio
      </button>
    </>
  );
}
it("starts directly at Home and preserves real navigation", async () => {
  render(
    <UiProvider>
      <Probe />
    </UiProvider>,
  );
  expect(screen.getByRole("status").textContent).toBe("home");
  await userEvent.click(screen.getByRole("button", { name: "Roadmap" }));
  expect(screen.getByRole("status").textContent).toBe("roadmap");
  await userEvent.click(screen.getByRole("button", { name: "Inicio" }));
  expect(screen.getByRole("status").textContent).toBe("home");
});
