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
  const [isExporting, setExporting] = useState(false);
  const [failure, setFailure] = useState<HostError["kind"]>();
  const [status, setStatus] = useState<CalendarIcsStatus>();
  const [confirmationId, setConfirmationId] = useState<string>();
  const confirmation = useRef<string | undefined>(undefined);
  const prepared = useRef<CalendarIcsView | undefined>(undefined);
  const epoch = useRef(0),
    exporting = useRef(false),
    authority = useRef(false);
  authority.current = open && allowed;
  useEffect(() => {
    const generation = ++epoch.current;
    prepared.current = undefined;
    confirmation.current = undefined;
    setConfirmationId(undefined);
    setView(undefined);
    setFailure(undefined);
    setBusy(exporting.current);
    if (exporting.current || !open || !allowed || !client) return;
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
    return await exportRequest({
      method: "calendar.icsExport",
      preparedHash: snapshot.preparedHash,
    });
  }
  async function replace(replace: boolean) {
    const id = confirmation.current;
    if (!client || !authority.current || !id || exporting.current) return false;
    confirmation.current = undefined;
    setConfirmationId(undefined);
    return await exportRequest({
      method: "calendar.icsReplace",
      confirmationId: id,
      replace,
    });
  }
  async function exportRequest(
    request: Extract<
      import("../../../contract/generated/contract").Request,
      { method: "calendar.icsExport" | "calendar.icsReplace" }
    >,
  ) {
    if (!client) return false;
    const owner = client;
    const generation = epoch.current;
    exporting.current = true;
    setExporting(true);
    prepared.current = undefined;
    setBusy(true);
    setFailure(undefined);
    setStatus(undefined);
    try {
      const reply = await owner.request(request);
      setView(undefined);
      if (
        reply.method !== request.method ||
        (reply.method !== "calendar.icsExport" &&
          reply.method !== "calendar.icsReplace")
      ) {
        setFailure("rejected");
        return false;
      }
      setStatus(reply.status);
      if (
        reply.status === "replacementRequired" &&
        typeof reply.confirmationId === "string"
      ) {
        if (!authority.current || generation !== epoch.current) return false;
        confirmation.current = reply.confirmationId;
        setConfirmationId(reply.confirmationId);
      } else if (reply.status !== "saved")
        setOptions((value) => ({ ...value, attempt: value.attempt + 1 }));
      return reply.status === "saved";
    } catch (error: unknown) {
      setView(undefined);
      setFailure(
        error instanceof HostFailure ? error.detail.kind : "coreUnavailable",
      );
      return false;
    } finally {
      exporting.current = false;
      setExporting(false);
      setBusy(false);
    }
  }
  return {
    scope: options.scope,
    alarm: options.alarm,
    view: allowed && open ? view : undefined,
    busy,
    exporting: isExporting,
    canClose: () => !exporting.current && !confirmation.current,
    confirmationId: allowed && open ? confirmationId : undefined,
    replace,
    failure,
    status,
    download,
    setScope(value: CalendarIcsScope) {
      if (!exporting.current && !confirmation.current) {
        prepared.current = undefined;
        setView(undefined);
        setStatus(undefined);
        setOptions((current) => ({ ...current, scope: value }));
      }
    },
    setAlarm(value: boolean) {
      if (!exporting.current && !confirmation.current) {
        prepared.current = undefined;
        setView(undefined);
        setStatus(undefined);
        setOptions((current) => ({ ...current, alarm: value }));
      }
    },
    retry() {
      if (!busy && !exporting.current && !confirmation.current)
        setOptions((value) => ({ ...value, attempt: value.attempt + 1 }));
    },
  };
}
