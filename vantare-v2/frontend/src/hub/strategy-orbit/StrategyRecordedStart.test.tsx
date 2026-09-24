import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { StrategyRecordedStart } from "./StrategyRecordedStart";

afterEach(cleanup);
it("shows real filenames without inferred identity and keeps manual independent", () => {
  const onChoose = vi.fn(), onManual = vi.fn(), onLibrary = vi.fn();
  const candidate = { id: "candidate", displayName: "Lusail_Ford_8laps.duckdb", state: "ready" as const, size: 1024, modifiedAt: "2026-09-09T12:00:00Z", walPresent: false };
  render(<StrategyRecordedStart candidates={[candidate]} busy={false} onChoose={onChoose} onLibrary={onLibrary} onManual={onManual} onCancel={vi.fn()} t={key => key} />);
  expect(screen.getByRole("heading", { name: "strategy.entry.title" })).toBeTruthy();
  expect(screen.getByText("strategy.entry.new")).toBeTruthy();
  expect(screen.queryByText("Lusail", { exact: true })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /strategy.entry.useSession/ }));
  expect(onChoose).toHaveBeenCalledExactlyOnceWith(candidate);
  fireEvent.click(screen.getByRole("button", { name: /strategy.entry.startManual/ }));
  expect(onManual).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: "strategy.entry.openTelemetry" }));
  expect(onLibrary).toHaveBeenCalledOnce();
});

it("labels the source menu as a change when returning to an existing race", () => {
  render(<StrategyRecordedStart candidates={[]} busy={false} onChoose={vi.fn()} onLibrary={vi.fn()} onManual={vi.fn()} onCancel={vi.fn()} onResume={vi.fn()} t={key => key} />);
  expect(screen.getByText("strategy.entry.changeSource")).toBeTruthy();
  expect(screen.queryByText("strategy.entry.new")).toBeNull();
});

it("shows saved drafts and plans separately with direct actions and a full-library link", () => {
  const onOpenDraft = vi.fn(), onOpenPlan = vi.fn(), onSaved = vi.fn();
  const summary = { planId: "recorded-plan:imola", variantId: "recorded-main", draftId: "recorded-draft:imola", name: "Imola 6h", mode: "manual" as const, updatedAt: "2026-09-10T00:00:00Z", hasDraft: true, revisionCount: 2 };
  render(<StrategyRecordedStart candidates={[]} busy={false} onChoose={vi.fn()} onLibrary={vi.fn()} onManual={vi.fn()} onCancel={vi.fn()} onSaved={onSaved}
    saved={{ status: "ready", opening: false, drafts: [summary], plans: [summary], recoveredFromBackup: false, onRetry: vi.fn(), onOpenDraft, onOpenPlan }} t={key => key} />);
  const saved = screen.getByTestId("strategy-entry-saved");
  expect(saved.textContent).toContain("Imola 6h");
  fireEvent.click(screen.getByRole("button", { name: "strategy.workspace.open" }));
  expect(onOpenDraft).toHaveBeenCalledExactlyOnceWith(summary.draftId);
  fireEvent.click(screen.getByRole("button", { name: "strategy.planHistory.open" }));
  expect(onOpenPlan).toHaveBeenCalledExactlyOnceWith(summary);
  fireEvent.click(screen.getByRole("button", { name: /strategy.entry.viewAll/ }));
  expect(onSaved).toHaveBeenCalledOnce();
});

it("shows saved loading, error retry, and empty states without making up entries", () => {
  const onRetry = vi.fn();
  const common = { opening: false, drafts: [], plans: [], recoveredFromBackup: false, onRetry, onOpenDraft: vi.fn(), onOpenPlan: vi.fn() };
  const props = { candidates: [], busy: false, onChoose: vi.fn(), onLibrary: vi.fn(), onManual: vi.fn(), onCancel: vi.fn(), t: (key: string) => key };
  const view = render(<StrategyRecordedStart {...props} saved={{ ...common, status: "loading" }} />);
  expect(screen.getByTestId("strategy-entry-saved").textContent).toContain("strategy.workspace.loading");
  view.rerender(<StrategyRecordedStart {...props} saved={{ ...common, status: "error", error: "unavailable" }} />);
  fireEvent.click(screen.getByRole("button", { name: "strategy.workspace.refresh" }));
  expect(onRetry).toHaveBeenCalledOnce();
  view.rerender(<StrategyRecordedStart {...props} saved={{ ...common, status: "ready" }} />);
  expect(screen.getByTestId("strategy-entry-saved").textContent).toContain("strategy.entry.noSaved");
});
