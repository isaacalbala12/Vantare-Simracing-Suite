import { useEffect, useState } from "react";
import type { StrategyApplicationClient, StrategyColdStartProgressV1, StrategyColdStartStatusV1 } from "../../strategy/strategy-application-client";
import { Button } from "../../ui/orbit";
import { formatMessage } from "../orbit/format-message";
import { importColdStartSessions, loadColdStartStatus, rejectColdStart } from "./strategy-cold-start";

export function StrategyColdStartBanner({ client, onImported, t }: { client: StrategyApplicationClient<unknown>; onImported: () => void; t: (key: string) => string }) {
  const [status, setStatus] = useState<StrategyColdStartStatusV1 | null>(null);
  const [progress, setProgress] = useState<StrategyColdStartProgressV1 | null>(null);
  const [busy, setBusy] = useState(false);
  const [queryFailed, setQueryFailed] = useState(false);
  const [importFailed, setImportFailed] = useState(false);
  const [queryRevision, setQueryRevision] = useState(0);

  useEffect(() => {
    let current = true;
    const load = async () => {
      setQueryFailed(false);
      try {
        for (;;) {
          const value = await loadColdStartStatus(client);
          if (!current) return;
          setStatus(value);
          if (!value.checking) return;
          await new Promise((resolve) => globalThis.setTimeout(resolve, 250));
          if (!current) return;
        }
      } catch {
        if (current) setQueryFailed(true);
      }
    };
    void load();
    return () => { current = false; };
  }, [client, queryRevision]);

  if (status && !status.shouldShow && !queryFailed) return null;
  const accept = async () => {
    setBusy(true);
    setImportFailed(false);
    if (status) {
      setProgress({ imported: status.imported, skipped: status.skipped, total: status.found, done: false, failures: status.failures });
    }
    try {
      let finalProgress: StrategyColdStartProgressV1 | null = null;
      await importColdStartSessions(client, (value) => { finalProgress = value; setProgress(value); });
      const completed = finalProgress as StrategyColdStartProgressV1 | null;
      if (!completed) throw new Error("Cold start import returned no final progress");
      setStatus({ shouldShow: completed.skipped > 0, checking: false, found: completed.total, imported: completed.imported, skipped: completed.skipped, failures: completed.failures, decision: "accepted" });
      onImported();
      setBusy(false);
    } catch {
      setImportFailed(true);
      setBusy(false);
    }
  };
  const reject = async () => {
    setBusy(true);
    try {
      await rejectColdStart(client);
      setStatus({ ...(status ?? { checking: false, found: 0, imported: 0, skipped: 0, failures: [] }), shouldShow: false, decision: "rejected" });
    } catch {
      setImportFailed(true);
      setBusy(false);
    }
  };
  const retryStatus = () => {
    setStatus(null);
    setQueryRevision((value) => value + 1);
  };
  const checking = status?.checking ?? !queryFailed;
  const failures = progress?.failures ?? status?.failures ?? [];
  return (
    <section className="orbit-cold-start" data-testid="orbit-cold-start" role="status">
      <div>
        {queryFailed ? <b>{t("strategy.coldStart.statusErrorTitle")}</b> : checking ? <b>{t("strategy.coldStart.checking")}</b> : <b>{formatMessage(t("strategy.coldStart.title"), { n: status?.found ?? 0 })}</b>}
        {queryFailed ? <p className="orbit-cold-start__error">{t("strategy.coldStart.statusError")}</p> : checking ? <p>{t("strategy.coldStart.checkingLead")}</p> : <p>{t("strategy.coldStart.lead")}</p>}
        {progress ? <span>{formatMessage(t("strategy.coldStart.progress"), { done: progress.imported + progress.skipped, imported: progress.imported, skipped: progress.skipped, total: progress.total })}</span> : null}
        {importFailed ? <span className="orbit-cold-start__error">{t("strategy.coldStart.error")}</span> : null}
        {failures.length > 0 ? <div><b>{t("strategy.coldStart.failureReasons")}</b><ul>{failures.map((failure) => <li key={failure.locator}>{formatMessage(t("strategy.coldStart.failureReason"), { session: failure.locator, reason: failure.reason })}</li>)}</ul></div> : null}
      </div>
      <div className="orbit-cold-start__actions">
        {queryFailed ? <Button onClick={retryStatus} variant="primary">{t("strategy.coldStart.retryStatus")}</Button> : null}
        {!queryFailed && !checking ? <Button disabled={busy} onClick={() => void reject()} variant="ghost">{status?.skipped ? t("strategy.coldStart.dismiss") : t("strategy.coldStart.reject")}</Button> : null}
        {!queryFailed && !checking ? <Button disabled={busy} onClick={() => void accept()} variant="primary">{busy ? t("strategy.coldStart.importing") : status?.skipped ? t("strategy.coldStart.retrySkipped") : t("strategy.coldStart.import")}</Button> : null}
      </div>
    </section>
  );
}
