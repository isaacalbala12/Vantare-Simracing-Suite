import { useCallback, useEffect, useRef, useState } from "react";
import type { StrategyApplicationClient } from "../../strategy/strategy-application-client";
import type { RevisionRefV1 } from "../../strategy/strategy-contract-v1";
import type { RecordedDraftPayload } from "./strategy-recorded-payload";
import type { RecordedWizardDraft } from "./strategy-recorded-wizard";
import type { RecordedCalculationState } from "./use-recorded-calculation";
import { recordedRevisionPayload } from "./strategy-recorded-result";
import {
  acknowledgeOrbitRevisionRecovery,
  loadOrbitRevisionRecovery,
  resolveOrbitRevisionRecovery,
  retryOrbitRevisionRecovery,
  saveOrbitRevision,
  type OrbitRevisionRecovery,
  type StrategyOrbitRevisionPayloadV1,
} from "./strategy-orbit-lifecycle";

export type RecordedAcceptanceState =
  | { readonly status: "idle" | "loading" | "accepting" }
  | { readonly status: "accepted"; readonly revision: RevisionRefV1; readonly key: string }
  | { readonly status: "recovery"; readonly pending: OrbitRevisionRecovery }
  | { readonly status: "error" };

export type RecordedAcceptanceController = ReturnType<typeof useRecordedAcceptance>;

export function useRecordedAcceptance(
  eventId: string,
  draft: RecordedWizardDraft,
  calculation: RecordedCalculationState,
  application: StrategyApplicationClient<RecordedDraftPayload>,
  enabled = true,
) {
  const client = application as StrategyApplicationClient<StrategyOrbitRevisionPayloadV1>;
  const currentKey = calculation.status === "success"
    ? JSON.stringify(recordedRevisionPayload(eventId, draft, calculation))
    : "";
  const [state, setState] = useState<RecordedAcceptanceState>({ status: "loading" });
  const alive = useRef(true);
  const busy = useRef(false);

  const loadRecovery = useCallback(async () => {
    try {
      const pending = await loadOrbitRevisionRecovery(client, globalThis.crypto.randomUUID());
      if (alive.current) setState(pending ? { status: "recovery", pending } : { status: "idle" });
    } catch {
      if (alive.current) setState({ status: "error" });
    }
  }, [client]);

  useEffect(() => {
    if (!enabled) return;
    alive.current = true;
    void loadOrbitRevisionRecovery(client, globalThis.crypto.randomUUID()).then(
      pending => { if (alive.current) setState(pending ? { status: "recovery", pending } : { status: "idle" }); },
      () => { if (alive.current) setState({ status: "error" }); },
    );
    return () => { alive.current = false; };
  }, [client, enabled]);

  const accept = useCallback(async () => {
    if (!enabled || busy.current || calculation.status !== "success") return;
    busy.current = true;
    setState({ status: "accepting" });
    try {
      const payload = recordedRevisionPayload(eventId, draft, calculation);
      const saved = await saveOrbitRevision(client, payload, draft.name.trim() || draft.combination?.trackName || "Recorded strategy", undefined, {
        mode: "assisted",
        capabilities: ["fuel_strategy", "telemetry_import", "virtual_energy_strategy"],
        provenance: { kind: "derived", sourceId: "strategy-recorded" },
        confidence: { level: "unknown" },
      });
      if (alive.current) setState({ status: "accepted", revision: saved.revision, key: currentKey });
    } catch {
      if (alive.current) await loadRecovery();
    } finally {
      busy.current = false;
    }
  }, [calculation, client, currentKey, draft, enabled, eventId, loadRecovery]);

  const resolve = useCallback(async () => {
    if (busy.current || state.status !== "recovery") return;
    busy.current = true;
    setState({ status: "loading" });
    try {
      const result = await resolveOrbitRevisionRecovery(client, globalThis.crypto.randomUUID());
      if (!alive.current) return;
      setState(result.stored && result.revision ? { status: "accepted", revision: result.revision, key: recoveryKey(state.pending) } : { status: "recovery", pending: state.pending });
    } catch {
      if (alive.current) setState({ status: "recovery", pending: state.pending });
    } finally { busy.current = false; }
  }, [client, state]);

  const retry = useCallback(async () => {
    if (busy.current || state.status !== "recovery") return;
    busy.current = true;
    setState({ status: "accepting" });
    try {
      const revision = await retryOrbitRevisionRecovery(client, state.pending, globalThis.crypto.randomUUID());
      if (alive.current) setState({ status: "accepted", revision, key: recoveryKey(state.pending) });
    } catch {
      if (alive.current) setState({ status: "recovery", pending: state.pending });
    } finally { busy.current = false; }
  }, [client, state]);

  const dismiss = useCallback(async () => {
    if (busy.current || state.status !== "recovery") return;
    busy.current = true;
    try {
      await acknowledgeOrbitRevisionRecovery(client, state.pending, globalThis.crypto.randomUUID());
      if (alive.current) setState({ status: "idle" });
    } catch {
      if (alive.current) setState({ status: "recovery", pending: state.pending });
    } finally { busy.current = false; }
  }, [client, state]);

  const visibleState = !enabled || state.status === "accepted" && state.key !== currentKey ? { status: "idle" as const } : state;
  return { state: visibleState, accept, resolve, retry, dismiss };
}

function recoveryKey(pending: OrbitRevisionRecovery): string {
  return JSON.stringify(pending.command.draft.payload);
}
