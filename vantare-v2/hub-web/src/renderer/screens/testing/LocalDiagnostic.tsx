import { useEffect, useRef, useState } from "react";
import type { LocalReportView } from "../../../contract/generated/contract";
import { useHost } from "../../app/Host";
import { Button } from "../../ui/Button";
import { TrackedCaps } from "../../ui/TrackedCaps";
import { localDiagnosticText as text } from "./local-diagnostic.es";
import { useReports } from "./ReportsState";
import { testingRequest } from "./TestingRequests";
import "./local-diagnostic.css";

export function LocalDiagnostic() {
  const { client } = useHost();
  const { fields, access } = useReports();
  const allowed = access.verified && !access.blocked;
  const [view, setView] = useState<LocalReportView>();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string>(text.initialStatus);
  const [error, setError] = useState<string>();
  const lifetime = useRef(new AbortController());
  const running = useRef(false);
  const snapshot = useRef({ client, fields, allowed });
  useEffect(() => {
    snapshot.current = { client, fields, allowed };
    const controller = new AbortController();
    lifetime.current.abort();
    lifetime.current = controller;
    running.current = false;
    setView(undefined);
    setError(undefined);
    setBusy(false);
    setStatus(text.initialStatus);
    return () => controller.abort();
  }, [client, fields, allowed]);
  async function run(action: (signal: AbortSignal) => Promise<void>) {
    if (
      !client ||
      !allowed ||
      running.current ||
      snapshot.current.client !== client ||
      snapshot.current.fields !== fields ||
      snapshot.current.allowed !== allowed
    )
      return;
    running.current = true;
    setBusy(true);
    setError(undefined);
    const signal = lifetime.current.signal;
    try {
      await action(signal);
    } catch {
      if (!signal.aborted) setError(text.failed);
    } finally {
      if (!signal.aborted) {
        running.current = false;
        setBusy(false);
      }
    }
  }
  async function prepare() {
    await run(async (signal) => {
      if (!client) return;
      const reply = await testingRequest(
        client,
        { method: "report.localPrepare", fields },
        signal,
      );
      if (reply.method !== "report.localPrepare")
        throw new Error("unexpected local report reply");
      setView(reply.value);
      setStatus(text.prepared);
    });
  }
  async function exportReport() {
    if (!view) {
      setError(text.prepareFirst);
      return;
    }
    await run(async (signal) => {
      if (!client) return;
      const reply = await testingRequest(
        client,
        { method: "report.localExport" },
        signal,
      );
      if (reply.method !== "report.localExport")
        throw new Error("unexpected local export reply");
      if (reply.status === "saved") setStatus(text.saved);
      if (reply.status === "conflict") setError(text.conflict);
    });
  }
  return (
    <div className="v-testing-diagnostic">
      <div className="v-testing-diagnostic-note">{text.privacy}</div>
      <div className="v-testing-diagnostic-actions">
        <Button disabled={!allowed || busy} onClick={() => void prepare()}>
          {busy ? text.preparing : text.prepare}
        </Button>
        <Button disabled={!allowed || busy} onClick={() => void exportReport()}>
          {text.export}
        </Button>
      </div>
      <p className="v-testing-diagnostic-status" role="status">
        {status}
      </p>
      {error && (
        <div className="v-testing-diagnostic-note" role="alert">
          {error}
        </div>
      )}
      <section className="v-testing-diagnostic-card">
        <header>
          <h2>
            <TrackedCaps>{text.title}</TrackedCaps>
          </h2>
        </header>
        <div className="v-testing-diagnostic-body">
          {view ? (
            <>
              <p>{`${text.core}: ${text.links[view.core]}`}</p>
              <dl>
                {view.binaries.map((binary) => (
                  <div
                    className="v-testing-diagnostic-binary"
                    key={binary.name}
                  >
                    <dt>
                      <strong>{binary.name}</strong>
                      <span>{text.binaryStates[binary.state]}</span>
                    </dt>
                    <dd>{binary.sha256 ?? text.unavailable}</dd>
                  </div>
                ))}
              </dl>
              <p className="v-testing-diagnostic-uninstrumented">
                {text.uninstrumented}
              </p>
              <h3>
                <TrackedCaps>{text.payload}</TrackedCaps>
              </h3>
              <pre>{view.report}</pre>
            </>
          ) : (
            <p>{text.empty}</p>
          )}
        </div>
      </section>
    </div>
  );
}
