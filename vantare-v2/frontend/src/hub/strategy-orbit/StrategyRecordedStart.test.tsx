import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { StrategyRecordedStart } from "./StrategyRecordedStart";

afterEach(cleanup);
it("shows real filenames without inferred identity and keeps manual independent", () => {
  const onChoose = vi.fn(), onManual = vi.fn(), onLibrary = vi.fn();
  const candidate = { id: "candidate", displayName: "Lusail_Ford_8laps.duckdb", state: "ready" as const, size: 1024, modifiedAt: "2026-09-09T12:00:00Z", walPresent: false };
  render(<StrategyRecordedStart candidates={[candidate]} busy={false} onChoose={onChoose} onLibrary={onLibrary} onManual={onManual} onCancel={vi.fn()} t={key => key} />);
  expect(screen.getByRole("heading", { name: "strategy.entry.title" })).toBeTruthy();
  expect(screen.queryByText("Lusail", { exact: true })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /strategy.entry.useSession/ }));
  expect(onChoose).toHaveBeenCalledExactlyOnceWith(candidate);
  fireEvent.click(screen.getByRole("button", { name: /strategy.entry.startManual/ }));
  expect(onManual).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: "strategy.entry.openTelemetry" }));
  expect(onLibrary).toHaveBeenCalledOnce();
});
