import { useEffect, useState } from "react";
import type { StrategyApplicationClient, StrategyColdStartProgressV1, StrategyColdStartStatusV1 } from "../../strategy/strategy-application-client";
import { Button } from "../../ui/orbit";
import { formatMessage } from "../orbit/format-message";
import { importColdStartSessions, loadColdStartStatus, rejectColdStart } from "./strategy-cold-start";

export function StrategyColdStartBanner({ client, onImported, t }: { client: StrategyApplicationClient<unknown>; onImported: () => void; t: (key: string) => string }) {
  const [status, setStatus] = useState<StrategyColdStartStatusV1 | null>(null);
  const [progress, setProgress] = useState<StrategyColdStartProgressV1 | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let current = true;
    void loadColdStartStatus(client).then((value) => { if (current) setStatus(value); }, () => { if (current) setFailed(true); });
    return () => { current = false; };
  }, [client]);

  if (!status?.shouldShow) return null;
  const accept = async () => {
    setBusy(true);
    setFailed(false);
    try {
      await importColdStartSessions(client, setProgress);
      setStatus({ ...status, shouldShow: false, decision: "accepted", imported: status.found });
      onImported();
    } catch {
      setFailed(true);
      setBusy(false);
    }
  };
  const reject = async () => {
    setBusy(true);
    try {
      await rejectColdStart(client);
      setStatus({ ...status, shouldShow: false, decision: "rejected" });
    } catch {
      setFailed(true);
      setBusy(false);
    }
  };
  return (
    <section className="orbit-cold-start" data-testid="orbit-cold-start" role="status">
      <div>
        <b>{formatMessage(t("strategy.coldStart.title"), { n: status.found })}</b>
        <p>{t("strategy.coldStart.lead")}</p>
        {progress ? <span>{formatMessage(t("strategy.coldStart.progress"), { done: progress.imported, total: progress.total })}</span> : null}
        {failed ? <span className="orbit-cold-start__error">{t("strategy.coldStart.error")}</span> : null}
      </div>
      <div className="orbit-cold-start__actions">
        <Button disabled={busy} onClick={() => void reject()} variant="ghost">{t("strategy.coldStart.reject")}</Button>
        <Button disabled={busy} onClick={() => void accept()} variant="primary">{busy ? t("strategy.coldStart.importing") : t("strategy.coldStart.import")}</Button>
      </div>
    </section>
  );
}
