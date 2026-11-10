// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { UpcomingLayout } from "../src/renderer/ui/UpcomingLayout";

afterEach(cleanup);
it("shows only the production Engineer teaser and opens Roadmap by keyboard", async () => {
  const onRoadmap = vi.fn();
  const user = userEvent.setup();
  render(<UpcomingLayout module="engineer" onRoadmap={onRoadmap} />);
  expect(
    screen.getByRole("heading", { name: "Ingeniero", level: 1 }),
  ).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Spotter" })).toBeTruthy();
  expect(screen.queryByRole("textbox")).toBeNull();
  expect(screen.getAllByText("Próximamente")).toHaveLength(2);
  await user.tab();
  await user.keyboard("{Enter}");
  expect(onRoadmap).toHaveBeenCalledOnce();
});
it("keeps Strategy limited to the same teaser composition", () => {
  render(<UpcomingLayout module="strategy" onRoadmap={() => {}} />);
  expect(
    screen.getByRole("heading", { name: "Estrategia", level: 1 }),
  ).toBeTruthy();
  for (const name of [
    "Plan de paradas",
    "Combustible y desgaste",
    "Ajustes en carrera",
  ])
    expect(screen.getByRole("heading", { name })).toBeTruthy();
  expect(screen.queryByRole("spinbutton")).toBeNull();
  expect(screen.queryByRole("textbox")).toBeNull();
  expect(screen.getAllByRole("button")).toHaveLength(1);
});
