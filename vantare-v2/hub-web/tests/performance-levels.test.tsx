// @vitest-environment jsdom

import { CSPProvider } from "@base-ui/react/csp-provider";

import { cleanup, render, screen } from "@testing-library/react";

import userEvent from "@testing-library/user-event";

import { afterEach, expect, it, vi } from "vitest";

import {
  FrequencyTable,
  PerformanceLevels,
} from "../src/renderer/ui/PerformanceLevels";

afterEach(cleanup);

it("preserves keyboard focus while saving and only emits valid levels", async () => {
  const onChange = vi.fn();

  const props = {
    value: "balanced" as const,
    disabled: false,
    pending: false,
    onChange,
    onStudio: vi.fn(),
  };

  const view = render(
    <CSPProvider disableStyleElements>
      <PerformanceLevels {...props} />
    </CSPProvider>,
  );

  const selected = screen.getByRole("radio", { name: "Equilibrado" });
  selected.focus();

  await userEvent.setup().keyboard("{ArrowRight}");

  expect(onChange).toHaveBeenLastCalledWith("economy");

  view.rerender(
    <CSPProvider disableStyleElements>
      <PerformanceLevels {...props} pending />
    </CSPProvider>,
  );

  expect(document.activeElement?.getAttribute("role")).toBe("radio");

  onChange.mockClear();

  await userEvent.setup().keyboard("{ArrowRight}");

  expect(onChange).not.toHaveBeenCalled();
});

it("opens Studio from the entire custom card and respects its access lock", async () => {
  const onStudio = vi.fn();
  const props = {
    value: "balanced" as const,
    disabled: false,
    pending: false,
    onChange: vi.fn(),
    onStudio,
  };

  const view = render(
    <CSPProvider disableStyleElements>
      <PerformanceLevels {...props} />
    </CSPProvider>,
  );

  await userEvent
    .setup()
    .click(
      screen.getByRole("button", { name: "Personalizado · Abrir Studio" }),
    );

  expect(onStudio).toHaveBeenCalledTimes(1);

  view.rerender(
    <CSPProvider disableStyleElements>
      <PerformanceLevels {...props} studioLock="Sin acceso" />
    </CSPProvider>,
  );

  await userEvent
    .setup()
    .click(
      screen.getByRole("button", { name: "Personalizado · Abrir Studio" }),
    );

  expect(onStudio).toHaveBeenCalledTimes(1);
});

it("presents each cadence and highlights the current column including its heading", () => {
  render(<FrequencyTable value="balanced" />);

  const table = screen.getByRole("table", { name: "Qué cambia en cada nivel" });

  expect(table.querySelectorAll("[data-current]").length).toBe(4);

  expect(table.querySelector("[data-current]")?.textContent).toBe(
    "Equilibrado",
  );

  expect(screen.getByText("40 Hz")).toBeTruthy();

  expect(screen.getAllByText("Al instante")).toHaveLength(5);
});
