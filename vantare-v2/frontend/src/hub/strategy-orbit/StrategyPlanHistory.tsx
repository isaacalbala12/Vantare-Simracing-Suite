import { useRef, useState } from "react";
import type { StrategyApplicationClient, StrategyPlanSummaryV1 } from "../../strategy/strategy-application-client";
import type { PlanRevisionV1, RevisionRefV1 } from "../../strategy/strategy-contract-v1";
import { Button, Drawer } from "../../ui/orbit";
import { clockTime } from "./strategy-orbit-model";

type PlanFacts = { readonly laps: number; readonly seconds: number; readonly stops: number };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function planFacts(payload: unknown): PlanFacts | undefined {
  if (!isRecord(payload) || payload.contractVersion !== "strategy.orbit.revision.v1" || !isRecord(payload.calculatedPlan)) return undefined;
  const { totalLaps, total, stops } = payload.calculatedPlan;
  if (!Number.isSafeInteger(totalLaps) || (totalLaps as number) < 0 || typeof total !== "number" || !Number.isFinite(total) || total < 0
    || !Number.isSafeInteger(stops) || (stops as number) < 0) return undefined;
  return { laps: totalLaps as number, seconds: total, stops: stops as number };
}

function sameRevision(left: RevisionRefV1 | undefined, right: RevisionRefV1): boolean {
  return left?.planId === right.planId && left.variantId === right.variantId
    && left.revisionId === right.revisionId && left.contentHash === right.contentHash;
}

export function StrategyPlanHistory<TPayload>({ plan, application, onClose, t }: {
  readonly plan: StrategyPlanSummaryV1;
  readonly application: StrategyApplicationClient<TPayload>;
  readonly onClose: () => void;
  readonly t: (key: string) => string;
}) {
  const request = useRef(0);
  const [selected, setSelected] = useState<RevisionRefV1>();
  const [revision, setRevision] = useState<PlanRevisionV1<unknown>>();
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");

  const load = async (ref: RevisionRefV1) => {
    const current = ++request.current;
    setSelected(ref);
    setRevision(undefined);
    setState("loading");
    try {
      const result = await application.execute({
        protocolVersion: "strategy.application.v1",
        commandId: `recorded-history:${globalThis.crypto.randomUUID()}`,
        operation: "open",
        expectedRepositoryVersion: 0,
        revision: ref,
      });
      if (request.current !== current) return;
      if (!result.revision) throw new Error("recorded_revision_unavailable");
      setRevision(result.revision);
      setState("idle");
    } catch {
      if (request.current === current) setState("error");
    }
  };
  const close = () => { request.current += 1; onClose(); };
  const facts = revision ? planFacts(revision.payload) : undefined;
  const refs = plan.revisionRefs ?? [];

  return <Drawer open title={t("strategy.planHistory.title")} closeLabel={t("strategy.planHistory.close")} onClose={close} data-testid="strategy-plan-history">
    <section className="strategy-plan-history">
      <header><p>{plan.name}</p><small>{t("strategy.planHistory.description")}</small></header>
      {refs.length ? <ul aria-label={t("strategy.planHistory.revisions")}>{refs.map(ref => <li key={`${ref.revisionId}:${ref.contentHash}`}>
        <div><strong>{ref.revisionId}</strong>{sameRevision(plan.latestRevision, ref) ? <small>{t("strategy.planHistory.latest")}</small> : null}</div>
        <Button variant="ghost" disabled={state === "loading"} onClick={() => void load(ref)}>{t("strategy.planHistory.choose")}</Button>
      </li>)}</ul> : plan.revisionCount > 0 ? <p>{t("strategy.planHistory.legacyUnavailable")}</p> : null}
      {state === "loading" ? <p role="status">{t("strategy.planHistory.loading")}</p> : null}
      {state === "error" ? <div role="alert"><p>{t("strategy.planHistory.error")}</p>{selected ? <Button variant="ghost" onClick={() => void load(selected)}>{t("strategy.planHistory.retry")}</Button> : null}</div> : null}
      {revision ? <article className="strategy-plan-history__details">
        <h4>{revision.name}</h4><time dateTime={revision.createdAt}>{new Date(revision.createdAt).toLocaleString()}</time>
        {facts ? <dl><div><dt>{t("strategy.planHistory.laps")}</dt><dd>{facts.laps}</dd></div><div><dt>{t("strategy.planHistory.duration")}</dt><dd>{clockTime(facts.seconds)}</dd></div><div><dt>{t("strategy.planHistory.stops")}</dt><dd>{facts.stops}</dd></div></dl>
          : <p>{t("strategy.planHistory.detailsUnavailable")}</p>}
      </article> : null}
    </section>
  </Drawer>;
}
