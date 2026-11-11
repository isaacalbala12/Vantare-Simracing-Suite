import { useCallback, useEffect, useRef, useState } from "react";
import type { CalendarConfigView } from "../../../contract/generated/calendar";
import type { HostError, Request } from "../../../contract/generated/contract";
import { useHost } from "../../app/Host";
import { HostFailure } from "../../bridge/client";

type Intent =
  | { kind: "utc"; value: boolean }
  | { kind: "notifyWeek"; value: boolean }
  | { kind: "follow"; id: string; value: boolean };
export function useCalendarPreferences(allowed: boolean) {
  const { client } = useHost();
  const [config, setConfig] = useState<CalendarConfigView>();
  const [busy, setBusy] = useState(false),
    [failure, setFailure] = useState<HostError["kind"]>();
  const current = useRef<CalendarConfigView | undefined>(undefined),
    intent = useRef<Intent | undefined>(undefined),
    generation = useRef(0),
    pending = useRef(false),
    access = useRef(allowed);
  access.current = allowed;
  const apply = useCallback(
    async (action?: Intent) => {
      if (!client || !access.current || pending.current) return;
      const epoch = generation.current,
        snapshot = current.current;
      if (action && !snapshot) return;
      let request: Request = { method: "calendar.configLoad" };
      if (action && snapshot) {
        const document =
          action.kind === "utc"
            ? "prefs"
            : action.kind === "notifyWeek"
              ? "alerts"
              : "following";
        const revision =
          action.kind === "utc"
            ? snapshot.prefsRevision
            : action.kind === "notifyWeek"
              ? snapshot.alertsRevision
              : snapshot.followingRevision;
        if (snapshot.documents[document] !== "ready" || revision === null) {
          intent.current = action;
          setFailure(
            snapshot.documents[document] === "unavailable"
              ? "coreUnavailable"
              : "rejected",
          );
          return;
        }
        if (action.kind === "utc")
          request = {
            method: "calendar.utcSet",
            utc: action.value,
            expectedRevision: revision,
          };
        else if (action.kind === "notifyWeek")
          request = {
            method: "calendar.notifyWeekSet",
            enabled: action.value,
            expectedRevision: revision,
          };
        else
          request = {
            method: "calendar.followSet",
            seriesId: action.id,
            followed: action.value,
            expectedRevision: revision,
          };
      }
      intent.current = action;
      pending.current = true;
      setBusy(true);
      setFailure(undefined);
      try {
        const reply = await client.request(request);
        if (epoch !== generation.current || !access.current) return;
        if (
          reply.method !== request.method ||
          (reply.method !== "calendar.configLoad" &&
            reply.method !== "calendar.utcSet" &&
            reply.method !== "calendar.notifyWeekSet" &&
            reply.method !== "calendar.followSet")
        )
          throw new HostFailure({ kind: "rejected" });
        current.current = reply.value;
        setConfig(reply.value);
        intent.current = undefined;
      } catch (error) {
        if (epoch !== generation.current || !access.current) return;
        if (error instanceof HostFailure) {
          if (error.detail.kind === "calendarConflict") {
            current.current = error.detail.current;
            setConfig(error.detail.current);
          }
          setFailure(error.detail.kind);
        } else setFailure("coreUnavailable");
      } finally {
        if (epoch === generation.current) {
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
    intent.current = undefined;
    current.current = undefined;
    setConfig(undefined);
    setBusy(false);
    setFailure(undefined);
    if (allowed) void apply();
    return () => {
      generation.current++;
    };
  }, [allowed, apply]);
  return {
    config,
    busy,
    failure,
    canUtc:
      allowed &&
      !busy &&
      config?.documents.prefs === "ready" &&
      config.prefsRevision !== null,
    canNotifyWeek:
      allowed &&
      !busy &&
      config?.documents.alerts === "ready" &&
      config.alertsRevision !== null,
    canFollow:
      allowed &&
      !busy &&
      config?.documents.following === "ready" &&
      config.followingRevision !== null,
    reload: () => apply(),
    utc: (value: boolean) => apply({ kind: "utc", value }),
    notifyWeek: (value: boolean) => apply({ kind: "notifyWeek", value }),
    follow: (id: string, value: boolean) =>
      apply({ kind: "follow", id, value }),
    retry: () => apply(intent.current),
    discard: () => {
      intent.current = undefined;
      setFailure(undefined);
    },
  };
}
