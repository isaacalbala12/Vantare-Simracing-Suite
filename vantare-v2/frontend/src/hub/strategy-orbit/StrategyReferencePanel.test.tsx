import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { StrategyApplicationClient, StrategyReferenceCatalogResultV1 } from "../../strategy/strategy-application-client";
import type { StrategyEventRecord } from "./strategy-events-store";
import { strategyEventV2FromRecord } from "./strategy-session-selection";
import { StrategyReferencePanel } from "./StrategyReferencePanel";

afterEach(cleanup);
const event: StrategyEventRecord = { id: "event", name: "Race", source: "custom", track: "Spa", cls: "LMGT3", durationMin: 60, startAt: null, drivers: [], tankL: 100, pitLossSec: 40, strategies: [] };
const referenceCatalog: StrategyReferenceCatalogResultV1 = {
 source: "candidate", catalog: { contractVersion: "strategy.catalog.payload.v1", source: { minimumCohort: 3 }, combinations: ["matching", "other"].map((combinationId) => ({
 combinationId, strategies: [], referenceProfile: { targetContractVersion: "pilotprofile.v1", provenance: { kind: "reference", environment: "production-community" }, sample: { semanticBundles: 3, contributors: 3, sessions: 5 }, quality: { validSessions: 5, invalidSessions: 0, sampleSessions: 5, validRatio: 1 } },
 })) },
};

it.each([undefined, "absent", "matching"])("only offers references for the selected canonical combination: %s", async (combinationId) => {
 const execute = vi.fn<StrategyApplicationClient<unknown>["execute"]>(async (command) => ({ protocolVersion: "strategy.application.v1", commandId: command.commandId, repositoryVersion: 0, recoveredFromBackup: false, closed: false, referenceCatalog }));
 const client: StrategyApplicationClient<unknown> = { execute, cancel: () => false, dispose: () => undefined };
 const existing = { ...strategyEventV2FromRecord(event), ...(combinationId ? { combination: { combinationId, sessions: [] } } : {}) };
 await act(async () => { render(<StrategyReferencePanel client={client} event={event} existing={existing} repositoryVersion={0} onSaved={vi.fn()} t={(key) => key} />); });
 expect(execute).toHaveBeenCalledOnce();
 if (combinationId === "matching") {
  expect(await screen.findByRole("button", { name: "strategy.reference.use" })).toBeTruthy();
  expect(screen.queryByRole("heading", { name: /other/ })).toBeNull();
 } else {
  expect(await screen.findByText("strategy.reference.empty")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "strategy.reference.use" })).toBeNull();
 }
});
