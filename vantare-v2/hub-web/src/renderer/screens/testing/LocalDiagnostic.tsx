import { useEffect, useRef, useState } from "react";
import type { LocalReportView } from "../../../contract/generated/contract";
import { reportDigest } from "../../../contract/report-digest";
import { useHost } from "../../app/Host";
import { localDiagnosticText as text } from "../../i18n/testing-local";
import { LocalDiagnosticView } from "../../ui/LocalDiagnosticView";
import { useReports } from "./ReportsState";
import { testingRequest } from "./TestingRequests";

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
      setView(undefined);
      const reply = await testingRequest(
        client,
        { method: "report.localPrepare", fields },
        signal,
      );
      if (reply.method !== "report.localPrepare")
        throw new Error("unexpected local report reply");
      if ((await reportDigest(reply.value.report)) !== reply.value.preparedHash || signal.aborted) throw new Error("local report digest mismatch");
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
      try {
      const reply = await testingRequest(
        client,
        { method: "report.localExport", preparedHash: view.preparedHash },
        signal,
      );
      if (reply.method !== "report.localExport")
        throw new Error("unexpected local export reply");
      setView(undefined);
      if (reply.status === "saved") setStatus(text.saved);
      if (reply.status === "cancelled") setStatus(text.prepareFirst);
      if (reply.status === "conflict") setError(text.conflict);
      } finally { if (!signal.aborted) setView(undefined); }
    });
  }
  return (
    <LocalDiagnosticView
      view={view}
      busy={busy}
      status={status}
      error={error}
      allowed={allowed}
      prepare={prepare}
      exportReport={exportReport}
    />
  );
}
