import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type {
  CalendarLaunchMode,
  CalendarLaunchView,
} from "../../../contract/generated/calendar";
import type { HostError, Request } from "../../../contract/generated/contract";
import { coreKey, offline, useHost } from "../../app/Host";
import { HostFailure } from "../../bridge/client";
import { launcherKey } from "../launcher/state";
export type CalendarLaunchCapture = Pick<
  Extract<Request, { method: "calendar.launchArm" }>,
  "profile" | "baseRevision" | "armedGeneration"
>;
export function useCalendarLaunch(
  allowed: boolean,
  capture: () => CalendarLaunchCapture | undefined,
  reloadConfig: () => void,
) {
  const { client } = useHost();
  const cache = useQueryClient();
  const { data: core = offline } = useQuery({
    queryKey: coreKey,
    queryFn: async () => offline,
    enabled: false,
  });
  const [view, setView] = useState<CalendarLaunchView>();
  const [failure, setFailure] = useState<HostError["kind"]>();
  const [busy, setBusy] = useState(false);
  const pending = useRef(false),
    epoch = useRef(0),
    updates = useRef(0);
  const callbacks = useRef({ capture, reloadConfig });
  callbacks.current = { capture, reloadConfig };
  useEffect(() => {
    const generation = ++epoch.current;
    setView(undefined);
    setFailure(undefined);
    setBusy(false);
    pending.current = false;
    if (!client || !allowed) return;
    const off = client.listen((message) => {
      if (epoch.current !== generation) return;
      if (
        message.kind === "event" &&
        message.event.topic === "calendarLaunch"
      ) {
        updates.current++;
        setView(message.event.value);
      }
    });
    const unsubscribe = client.subscribe("calendarLaunch");
    return () => {
      epoch.current++;
      off();
      unsubscribe();
    };
  }, [client, allowed]);
  async function mutate(
    request: Extract<
      Request,
      { method: "calendar.launchArm" | "calendar.launchCancel" }
    >,
  ) {
    if (!client || !allowed || pending.current) return;
    const generation = epoch.current,
      update = updates.current,
      account = core.accountGeneration;
    pending.current = true;
    setBusy(true);
    setFailure(undefined);
    const current = () =>
      generation === epoch.current &&
      cache.getQueryData<typeof core>(coreKey)?.accountGeneration === account;
    try {
      const reply = await client.request(request);
      if (!current()) return;
      if (
        reply.method !== request.method ||
        (reply.method !== "calendar.launchArm" &&
          reply.method !== "calendar.launchCancel")
      )
        throw new HostFailure({ kind: "rejected" });
      if (update === updates.current) setView(reply.value);
      if (reply.method === "calendar.launchArm" && reply.config)
        callbacks.current.reloadConfig();
    } catch (error) {
      if (current()) {
        if (
          error instanceof HostFailure &&
          error.detail.kind === "launcherConflict"
        )
          cache.setQueryData(launcherKey, error.detail.current);

        if (
          error instanceof HostFailure &&
          error.detail.kind === "calendarConflict"
        )
          callbacks.current.reloadConfig();
        setFailure(
          error instanceof HostFailure ? error.detail.kind : "coreUnavailable",
        );
      }
    } finally {
      if (generation === epoch.current) {
        pending.current = false;
        setBusy(false);
      }
    }
  }
  return {
    view,
    failure,
    busy,
    arm: (mode: CalendarLaunchMode) => {
      const scope = callbacks.current.capture();
      return scope
        ? mutate({ method: "calendar.launchArm", ...scope, mode })
        : Promise.resolve();
    },
    cancel: (armId: string) =>
      mutate({ method: "calendar.launchCancel", armId }),
  };
}
