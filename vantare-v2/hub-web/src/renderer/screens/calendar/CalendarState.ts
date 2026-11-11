import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CalendarView } from "../../../contract/generated/calendar";
import type { HostError } from "../../../contract/generated/contract";
import { coreKey, offline, useHost } from "../../app/Host";
import { HostFailure } from "../../bridge/client";
export function useCalendar() {
  const { client } = useHost();
  const { data: core = offline } = useQuery({
    queryKey: coreKey,
    queryFn: async () => offline,
    enabled: false,
  });
  const allowed =
    core.access.verified && !core.access.blocked && core.access.calendar;
  const connected = core.services === "connected";
  const [view, setView] = useState<CalendarView>();
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [failure, setFailure] = useState<HostError["kind"]>();
  const [now, setNow] = useState(Date.now);
  const generation = useRef(0),
    pending = useRef(false),
    access = useRef(allowed),
    lastAttempt = useRef(0);
  access.current = allowed;
  const read = useCallback(
    async (method: "calendar.load" | "calendar.refresh") => {
      if (!client || !access.current || pending.current) return;
      const sequence = generation.current;
      if (method === "calendar.refresh") lastAttempt.current = Date.now();
      pending.current = true;
      setBusy(true);
      setFailure(undefined);
      try {
        const reply = await client.request({ method });
        if (sequence !== generation.current || !access.current) return;
        if (
          reply.method !== method ||
          (reply.method !== "calendar.load" &&
            reply.method !== "calendar.refresh")
        )
          throw new HostFailure({ kind: "rejected" });
        setView(reply.value);
        setLoaded(true);
      } catch (error) {
        if (sequence === generation.current && access.current)
          setFailure(
            error instanceof HostFailure
              ? error.detail.kind
              : "coreUnavailable",
          );
      } finally {
        if (sequence === generation.current) {
          pending.current = false;
          setBusy(false);
        }
      }
    },
    [client],
  );
  useEffect(() => {
    generation.current++;
    pending.current = false;
    lastAttempt.current = 0;
    setView(undefined);
    setLoaded(false);
    setFailure(undefined);
    setBusy(false);
    if (allowed) void read("calendar.load");
    return () => {
      generation.current++;
    };
  }, [allowed, read]);
  useEffect(() => {
    if (allowed && connected && loaded) void read("calendar.refresh");
  }, [allowed, connected, loaded, read]);
  useEffect(() => {
    if (!allowed) return;
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(clock);
  }, [allowed]);
  useEffect(() => {
    const date = new Date(now);
    const interval =
      (date.getUTCDay() === 1 && date.getUTCHours() < 12 ? 5 : 15) * 60_000;
    if (allowed && connected && loaded && now - lastAttempt.current >= interval)
      void read("calendar.refresh");
  }, [allowed, connected, loaded, now, read]);
  return {
    view,
    allowed,
    connected,
    busy,
    loaded,
    failure,
    now,
    refresh: () => read("calendar.refresh"),
    reload: () => read("calendar.load"),
  };
}
