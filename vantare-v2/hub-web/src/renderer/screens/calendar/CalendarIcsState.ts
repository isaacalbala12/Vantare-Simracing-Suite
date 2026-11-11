import { useEffect, useRef, useState } from "react";
import type {
  CalendarIcsScope,
  CalendarIcsStatus,
  CalendarIcsView,
} from "../../../contract/generated/calendar";
import type { HostError } from "../../../contract/generated/contract";
import { useHost } from "../../app/Host";
import { HostFailure } from "../../bridge/client";

export function useCalendarIcs(open: boolean, allowed: boolean) {
  const { client } = useHost();
  const [options, setOptions] = useState({
    scope: "favs" as CalendarIcsScope,
    alarm: true,
    attempt: 0,
  });
  const [view, setView] = useState<CalendarIcsView>();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<HostError["kind"]>();
  const [status, setStatus] = useState<CalendarIcsStatus>();
  const prepared = useRef<CalendarIcsView | undefined>(undefined);
  const epoch = useRef(0),
    exporting = useRef(false),
    authority = useRef(false);
  authority.current = open && allowed;
  useEffect(() => {
    const generation = ++epoch.current;
    exporting.current = false;
    prepared.current = undefined;
    setView(undefined);
    setFailure(undefined);
    setBusy(false);
    if (!open || !allowed || !client) return;
    setBusy(true);
    void client
      .request({
        method: "calendar.icsPrepare",
        scope: options.scope,
        alarm: options.alarm,
      })
      .then((reply) => {
        if (generation !== epoch.current || !authority.current) return;
        if (reply.method !== "calendar.icsPrepare") {
          setFailure("rejected");
          return;
        }
        prepared.current = reply.value;
        setView(reply.value);
      })
      .catch((error: unknown) => {
        if (generation === epoch.current && authority.current)
          setFailure(
            error instanceof HostFailure
              ? error.detail.kind
              : "coreUnavailable",
          );
      })
      .finally(() => {
        if (generation === epoch.current) setBusy(false);
      });
    return () => {
      ++epoch.current;
    };
  }, [open, allowed, client, options]);
  useEffect(() => {
    if (!open || !allowed || !client) setStatus(undefined);
  }, [open, allowed, client]);
  async function download() {
    const snapshot = prepared.current;
    if (!client || !authority.current || !snapshot || busy || exporting.current)
      return false;
    const generation = epoch.current;
    exporting.current = true;
    prepared.current = undefined;
    setBusy(true);
    setFailure(undefined);
    setStatus(undefined);
    try {
      const reply = await client.request({
        method: "calendar.icsExport",
        preparedHash: snapshot.preparedHash,
      });
      if (generation !== epoch.current || !authority.current) return false;
      setView(undefined);
      if (reply.method !== "calendar.icsExport") {
        setFailure("rejected");
        return false;
      }
      setStatus(reply.status);
      if (reply.status !== "saved")
        setOptions((value) => ({ ...value, attempt: value.attempt + 1 }));
      return reply.status === "saved";
    } catch (error: unknown) {
      if (generation === epoch.current && authority.current) {
        setView(undefined);
        setFailure(
          error instanceof HostFailure ? error.detail.kind : "coreUnavailable",
        );
      }
      return false;
    } finally {
      if (generation === epoch.current) {
        exporting.current = false;
        setBusy(false);
      }
    }
  }
  return {
    scope: options.scope,
    alarm: options.alarm,
    view: allowed && open ? view : undefined,
    busy,
    failure,
    status,
    download,
    setScope(value: CalendarIcsScope) {
      if (!exporting.current) {
        prepared.current = undefined;
        setView(undefined);
        setStatus(undefined);
        setOptions((current) => ({ ...current, scope: value }));
      }
    },
    setAlarm(value: boolean) {
      if (!exporting.current) {
        prepared.current = undefined;
        setView(undefined);
        setStatus(undefined);
        setOptions((current) => ({ ...current, alarm: value }));
      }
    },
    retry() {
      if (!busy && !exporting.current)
        setOptions((value) => ({ ...value, attempt: value.attempt + 1 }));
    },
  };
}
