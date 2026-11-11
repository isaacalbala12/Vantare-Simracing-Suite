import { useEffect, useState } from "react";
import type { CalendarHistoryView } from "../../../contract/generated/calendar";
import type { HostError } from "../../../contract/generated/contract";
import { useHost } from "../../app/Host";
import { HostFailure } from "../../bridge/client";

export function useCalendarHistory(allowed: boolean, publication: string) {
  const { client } = useHost();
  const [result, setResult] = useState<{
    key: string;
    view?: CalendarHistoryView;
    failure?: HostError["kind"];
  }>();
  const [attempt, setAttempt] = useState(0);
  const key = `${publication}:${attempt}`;
  useEffect(() => {
    let active = true;
    setResult(undefined);
    if (allowed && client) {
      void client
        .request({ method: "calendar.historyLoad" })
        .then((reply) => {
          if (!active) return;
          if (reply.method !== "calendar.historyLoad") {
            setResult({ key, failure: "rejected" });
            return;
          }
          setResult({ key, view: reply.value });
        })
        .catch((error: unknown) => {
          if (active)
            setResult({
              key,
              failure:
                error instanceof HostFailure
                  ? error.detail.kind
                  : "coreUnavailable",
            });
        });
    }
    return () => {
      active = false;
    };
  }, [allowed, client, key]);
  return {
    view: result?.key === key ? result.view : undefined,
    failure: result?.key === key ? result.failure : undefined,
    reload: () => setAttempt((value) => value + 1),
  };
}
