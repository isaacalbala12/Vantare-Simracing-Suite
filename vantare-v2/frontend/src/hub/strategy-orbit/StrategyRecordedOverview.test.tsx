import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { StrategyRecordedOverview } from "./StrategyRecordedOverview";
import { createRecordedWizardDraft } from "./strategy-recorded-wizard";

afterEach(cleanup);
const props = { draft: createRecordedWizardDraft(), dirty: true, busy: false, onEdit: vi.fn(), onSources: vi.fn(), onSave: vi.fn(), t: (key: string) => key };
it("keeps missing configuration and uncalculated status explicit", () => {
  render(<StrategyRecordedOverview {...props} />);
  expect(screen.getByText("strategy.workspace.noSources")).toBeTruthy();
  expect(screen.getByText("strategy.workspace.notCalculated")).toBeTruthy();
  expect((screen.getByRole("button", { name: "strategy.workspace.calculate" }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getAllByText("strategy.workspace.pending").length).toBeGreaterThan(0);
  expect(screen.getByRole("status").textContent).toBe("strategy.workspace.unsaved");
});
it("routes editing and review to their actual owner callbacks", () => {
  render(<StrategyRecordedOverview {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "strategy.workspace.edit strategy.journey.step.rules" }));
  expect(props.onEdit).toHaveBeenCalledWith("rules");
  fireEvent.click(screen.getByRole("button", { name: "strategy.workspace.review" }));
  expect(props.onSources).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: "strategy.workspace.save" }));
  expect(props.onSave).toHaveBeenCalledOnce();
});
it("does not offer save while clean or busy, and reports a write failure", () => {
  const { rerender } = render(<StrategyRecordedOverview {...props} dirty={false} />);
  expect((screen.getByRole("button", { name: "strategy.workspace.save" }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByRole("status").textContent).toBe("strategy.workspace.saved");
  rerender(<StrategyRecordedOverview {...props} busy error="Storage failed" />);
  expect((screen.getByRole("button", { name: "strategy.workspace.save" }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByRole("alert").textContent).toBe("Storage failed");
});
