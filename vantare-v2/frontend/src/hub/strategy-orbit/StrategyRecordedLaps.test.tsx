import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AnalysisLapInspection, AnalysisLapPage } from "../../strategy/analysis-contract";
import { RecordedLapDetail, RecordedLapList } from "./StrategyRecordedLaps";
afterEach(cleanup);
const t = (key: string) => key;
const family = "combined_stint_pace_curve" as const;
function fixture() {
  const target = { number: 2, start: "2026-09-10T12:00:00.000000001Z", end: "2026-09-10T12:01:30Z" };
  const use = { family, included: true, exclusionReasons: [] };
  const original = { ...target, complete: true, lapTimeSeconds: 0, labels: [], familyUse: [use] };
  const row: AnalysisLapInspection = { original, effective: original, target, capabilities: [{ family, automaticIncluded: false, effectiveIncluded: true, canInclude: false, canExclude: true, reason: "inclusion_requires_complete_coverage" }] };
  const page = { revisionId: "a".repeat(64), headId: "a".repeat(64), page: { start: 0, total: 1, laps: [row] } } as AnalysisLapPage;
  return { row, page };
}
describe("recorded lap review", () => {
  it("shows native automatic/effective differences, zero time and no invented first stint", () => {
    const { row, page } = fixture(), onSelect = vi.fn();
    render(<RecordedLapList page={page} family={family} proposals={[]} locked={false} onFamily={vi.fn()} onSelect={onSelect} onPage={vi.fn()} t={t} />);
    expect(screen.getByText("0.000 s")).toBeTruthy();
    expect(screen.getByText("strategy.laps.noBoundary")).toBeTruthy();
    expect(screen.getByText("strategy.laps.excluded")).toBeTruthy();
    expect(screen.getByText("strategy.laps.included")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "strategy.laps.lap 2" }));
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(row, undefined);
  });
  it("preserves a blocked inclusion option and a required reason without claiming missing identity is false", () => {
    const { row } = fixture(), onApply = vi.fn();
    render(<RecordedLapDetail form={{ row, family, choice: "include", reason: "Checked" }} dirty locked={false} onChange={vi.fn()} onApply={onApply} onCancel={vi.fn()} t={t} />);
    expect((screen.getByRole("option", { name: "strategy.laps.include" }) as HTMLOptionElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "strategy.data.apply" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("strategy.laps.reason.inclusion_requires_complete_coverage")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "strategy.data.apply" }));
    expect(onApply).not.toHaveBeenCalled();
  });
  it("matches proposals by full temporal identity rather than lap number", () => {
    const { row, page } = fixture(), onSelect = vi.fn();
    const proposal = { base: {} as AnalysisLapPage["page"]["base"], target: { ...row.target!, start: "2026-09-10T14:00:00.000000001+02:00" }, family, expected: row.original.familyUse![0], included: false, reason: "Reviewed" };
    const props = { page, family, locked: false, onFamily: vi.fn(), onSelect, onPage: vi.fn(), t };
    const { rerender } = render(<RecordedLapList {...props} proposals={[proposal]} />);
    fireEvent.click(screen.getByRole("button", { name: "strategy.laps.lap 2" }));
    expect(onSelect).toHaveBeenLastCalledWith(row, proposal);
    rerender(<RecordedLapList {...props} proposals={[{ ...proposal, target: { ...proposal.target, start: "2026-09-10T14:00:00.000000002+02:00" } }]} />);
    fireEvent.click(screen.getByRole("button", { name: "strategy.laps.lap 2" }));
    expect(onSelect).toHaveBeenLastCalledWith(row, undefined);
  });
});
