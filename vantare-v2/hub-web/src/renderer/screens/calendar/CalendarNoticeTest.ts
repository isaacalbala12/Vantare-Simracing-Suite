import { useEffect, useRef, useState } from "react";
import type { HostError } from "../../../contract/generated/contract";
import { useHost } from "../../app/Host";
import { HostFailure } from "../../bridge/client";
/** Fixed host example only. No notification contents enter through the renderer. */
export function useCalendarNoticeTest(allowed: boolean) {
  const { client } = useHost();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<"accepted" | "unavailable">();
  const [failure, setFailure] = useState<HostError["kind"]>();
  const epoch = useRef(0),
    pending = useRef<symbol | undefined>(undefined),
    current = useRef({ client, allowed });
  current.current = { client, allowed };
  useEffect(() => {
    current.current = { client, allowed };
    ++epoch.current;
    pending.current = undefined;
    setBusy(false);
    setStatus(undefined);
    setFailure(undefined);
    return () => {
      ++epoch.current;
    };
  }, [client, allowed]);
  async function test() {
    if (!client || !current.current.allowed || pending.current) return;
    const sequence = epoch.current,
      token = Symbol();
    pending.current = token;
    setBusy(true);
    setFailure(undefined);
    setStatus(undefined);
    const active = () =>
      sequence === epoch.current &&
      current.current.allowed &&
      current.current.client === client &&
      pending.current === token;
    try {
      const reply = await client.request({ method: "calendar.noticeTest" });
      if (!active()) return;
      if (reply.method !== "calendar.noticeTest") {
        setFailure("rejected");
        return;
      }
      setStatus(reply.accepted ? "accepted" : "unavailable");
    } catch (error: unknown) {
      if (active())
        setFailure(
          error instanceof HostFailure ? error.detail.kind : "coreUnavailable",
        );
    } finally {
      if (active()) {
        pending.current = undefined;
        setBusy(false);
      }
    }
  }
  return { busy, status, failure, test };
}
