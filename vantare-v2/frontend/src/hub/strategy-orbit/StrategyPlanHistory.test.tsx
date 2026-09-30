import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { StrategyApplicationClient, StrategyApplicationResultV1, StrategyPlanSummaryV1 } from "../../strategy/strategy-application-client";
import type { PlanRevisionV1, RevisionRefV1 } from "../../strategy/strategy-contract-v1";
import { StrategyPlanHistory } from "./StrategyPlanHistory";

afterEach(cleanup);

const refA: RevisionRefV1 = { planId: "recorded-plan:race", variantId: "recorded-main", revisionId: "revision-a", contentHash: "a".repeat(64) };
const refB: RevisionRefV1 = { planId: "recorded-plan:race", variantId: "recorded-main", revisionId: "revision-b", contentHash: "b".repeat(64) };
const plan: StrategyPlanSummaryV1 = { planId: refA.planId, variantId: refA.variantId, name: "Le Mans", mode: "manual", updatedAt: "2026-09-14T12:00:00Z", hasDraft: false, revisionCount: 2, revisionRefs: [refA, refB], latestRevision: refB };
const revision = (ref: RevisionRefV1, payload: unknown): PlanRevisionV1<unknown> => ({
  contractVersion: "strategy.v1", hashAlgorithm: "sha256", sourceDraftId: "recorded-draft:race", name: "Le Mans A", mode: "manual",
  capabilities: [], provenance: { kind: "manual" }, confidence: { level: "unknown" }, createdAt: "2026-09-14T11:00:00Z", payload,
  ...ref,
}) as PlanRevisionV1<unknown>;
const result = (opened: PlanRevisionV1<unknown>): StrategyApplicationResultV1<unknown> => ({ protocolVersion: "strategy.application.v1", commandId: "result", repositoryVersion: 8, recoveredFromBackup: false, closed: false, revision: opened });
const t = (key: string) => key === "strategy.planHistory.revisionLabel" ? "Revision {{n}}" : key;

function setup(execute: StrategyApplicationClient<unknown>["execute"], summary: StrategyPlanSummaryV1 = plan) {
  const application: StrategyApplicationClient<unknown> = { execute, cancel: vi.fn(), dispose: vi.fn() };
  const onClose = vi.fn();
  const view = render(<StrategyPlanHistory plan={summary} application={application} onClose={onClose} t={t} />);
  return { ...view, onClose };
}

it("does not open automatically and loads the exact revision selected by the person", async () => {
  let resolveOpen!: (value: StrategyApplicationResultV1<unknown>) => void;
  const execute = vi.fn(() => new Promise<StrategyApplicationResultV1<unknown>>(resolve => { resolveOpen = resolve; }));
  setup(execute);
  expect(execute).not.toHaveBeenCalled();
  expect(screen.getByText("strategy.planHistory.latest").closest("li")?.textContent).toContain("Revision 2");
  fireEvent.click(screen.getAllByRole("button", { name: "strategy.planHistory.choose" })[0]);
  expect(execute).toHaveBeenCalledWith(expect.objectContaining({ operation: "open", revision: refA }));
  expect(screen.getByRole("status").textContent).toBe("strategy.planHistory.loading");
  resolveOpen(result(revision(refA, { contractVersion: "strategy.orbit.revision.v1", calculatedPlan: { totalLaps: 139, total: 14_560.4, stops: 3 } })));
  expect(await screen.findByText("4:02:40")).toBeTruthy();
  expect(screen.getByText("139")).toBeTruthy();
  expect(screen.getByText("3")).toBeTruthy();
});

it("shows a recoverable error and retries the same complete reference", async () => {
  const execute = vi.fn()
    .mockRejectedValueOnce(new Error("unavailable"))
    .mockResolvedValueOnce(result(revision(refA, { contractVersion: "strategy.orbit.revision.v1", calculatedPlan: { totalLaps: 10, total: 900, stops: 1 } })));
  setup(execute);
  fireEvent.click(screen.getAllByRole("button", { name: "strategy.planHistory.choose" })[0]);
  expect(await screen.findByRole("alert")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "strategy.planHistory.retry" }));
  await screen.findByText("15:00");
  expect(execute).toHaveBeenNthCalledWith(2, expect.objectContaining({ revision: refA }));
});

it("rejects a revision whose complete reference differs and retries it", async () => {
  const execute = vi.fn()
    .mockResolvedValueOnce(result(revision({ ...refA, contentHash: refB.contentHash }, { contractVersion: "strategy.orbit.revision.v1", calculatedPlan: { totalLaps: 99, total: 999, stops: 9 } })))
    .mockResolvedValueOnce(result(revision(refA, { contractVersion: "strategy.orbit.revision.v1", calculatedPlan: { totalLaps: 10, total: 900, stops: 1 } })));
  setup(execute);
  fireEvent.click(screen.getAllByRole("button", { name: "strategy.planHistory.choose" })[0]);
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(screen.queryByText("16:39")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "strategy.planHistory.retry" }));
  expect(await screen.findByText("15:00")).toBeTruthy();
  expect(execute).toHaveBeenNthCalledWith(2, expect.objectContaining({ revision: refA }));
});

it("ignores a late response after the screen closes", async () => {
  let resolveOpen!: (value: StrategyApplicationResultV1<unknown>) => void;
  const execute = vi.fn(() => new Promise<StrategyApplicationResultV1<unknown>>(resolve => { resolveOpen = resolve; }));
  const { onClose } = setup(execute);
  fireEvent.click(screen.getAllByRole("button", { name: "strategy.planHistory.choose" })[0]);
  fireEvent.click(screen.getByRole("button", { name: "strategy.planHistory.close" }));
  expect(onClose).toHaveBeenCalledOnce();
  resolveOpen(result(revision(refA, { contractVersion: "strategy.orbit.revision.v1", calculatedPlan: { totalLaps: 99, total: 999, stops: 9 } })));
  await waitFor(() => expect(screen.queryByText("16:39")).toBeNull());
});

it("ignores a pending revision read when navigation unmounts the screen", async () => {
  let resolveOpen!: (value: StrategyApplicationResultV1<unknown>) => void;
  const execute = vi.fn(() => new Promise<StrategyApplicationResultV1<unknown>>(resolve => { resolveOpen = resolve; }));
  const view = setup(execute);
  fireEvent.click(screen.getAllByRole("button", { name: "strategy.planHistory.choose" })[0]);
  view.unmount();
  await act(async () => resolveOpen(result(revision(refA, { contractVersion: "strategy.orbit.revision.v1", calculatedPlan: { totalLaps: 99, total: 999, stops: 9 } }))));
  expect(screen.queryByTestId("strategy-plan-history")).toBeNull();
  expect(view.onClose).not.toHaveBeenCalled();
});

it("explains legacy references and keeps incompatible payload metadata readable", async () => {
  const legacy = { ...plan, revisionRefs: undefined, latestRevision: undefined };
  const execute = vi.fn();
  const view = setup(execute, legacy);
  expect(screen.getByText("strategy.planHistory.legacyUnavailable")).toBeTruthy();
  view.rerender(<StrategyPlanHistory plan={plan} application={{ execute: vi.fn().mockResolvedValue(result(revision(refA, { contractVersion: "another.v1" }))), cancel: vi.fn(), dispose: vi.fn() }} onClose={view.onClose} t={t} />);
  fireEvent.click(screen.getAllByRole("button", { name: "strategy.planHistory.choose" })[0]);
  expect(await screen.findByText("strategy.planHistory.detailsUnavailable")).toBeTruthy();
  expect(screen.getByText("Le Mans A")).toBeTruthy();
});
