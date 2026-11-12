import { useEffect, useRef, useState } from "react";
import { calendarNoticeTestIntervalMs } from "../../../contract/generated/calendar";
import type { HostError } from "../../../contract/generated/contract";
import { useHost } from "../../app/Host";
import { HostFailure } from "../../bridge/client";
export type NoticeTestClock = {
  now: () => number;
  set: (callback: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clear: (timer: ReturnType<typeof setTimeout>) => void;
};
const noticeClock: NoticeTestClock = {
  now: () => performance.now(),
  set: (callback, ms) => setTimeout(callback, ms),
  clear: (timer) => clearTimeout(timer),
};
/** Fixed host example only. No notification contents enter through the renderer. */
export function useCalendarNoticeTest(
  allowed: boolean,
  clock: NoticeTestClock = noticeClock,
) {
  const { client } = useHost();
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(false);
  const until = useRef(0),
    timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const armCooldown = () => {
    until.current = clock.now() + calendarNoticeTestIntervalMs;
    if (timer.current !== undefined) clock.clear(timer.current);
    setCooldown(true);
    timer.current = clock.set(() => {
      timer.current = undefined;
      setCooldown(false);
    }, calendarNoticeTestIntervalMs);
  };
  useEffect(() => {
    until.current = 0;
    setCooldown(false);
    timer.current = undefined;
    if (!client) return;
    return () => {
      if (timer.current !== undefined) clock.clear(timer.current);
    };
  }, [client, clock]);
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
    if (
      !client ||
      !current.current.allowed ||
      pending.current ||
      clock.now() < until.current
    )
      return;
    const sequence = epoch.current,
      token = Symbol();
    pending.current = token;
    armCooldown();
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
      if (active()) {
        if (error instanceof HostFailure && error.detail.kind === "busy")
          armCooldown();
        else
          setFailure(
            error instanceof HostFailure
              ? error.detail.kind
              : "coreUnavailable",
          );
      }
    } finally {
      if (active()) {
        pending.current = undefined;
        setBusy(false);
      }
    }
  }
  return { busy, cooldown, status, failure, test };
}
