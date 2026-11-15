import { useQuery } from "@tanstack/react-query";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { StudioView } from "../../../contract/generated/studio";
import { coreKey, offline } from "../../app/Host";
import { HostFailure } from "../../bridge/client";
import {
  type CanvasAction,
  type CanvasState,
  canvasReducer,
  projectedBox,
} from "./gesture-state";
import { useStudio } from "./state";

export function useCanvas(view: StudioView) {
  const studio = useStudio();
  const { execute } = studio;
  const { data: core = offline } = useQuery({
    queryKey: coreKey,
    queryFn: async () => offline,
    enabled: false,
  });
  const enabled =
    !core.live &&
    core.rights === "connected" &&
    core.access.verified &&
    view.state === "ready" &&
    view.plan !== "unverified" &&
    view.canvas !== null;
  const [snapshot, setSnapshot] = useState<CanvasState>({
    view,
    serial: 0,
    disabled: !enabled,
  });
  const current = useRef(snapshot),
    alive = useRef(true),
    sent = useRef(0);
  const dispatch = useCallback((action: CanvasAction) => {
    const next = canvasReducer(current.current, action);
    current.current = next;
    if (alive.current) setSnapshot(next);
    return next;
  }, []);
  useLayoutEffect(() => {
    dispatch({ type: "view", view });
  }, [dispatch, view]);
  useLayoutEffect(() => {
    dispatch({ type: enabled ? "enable" : "disable" });
  }, [dispatch, enabled]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const pending = snapshot.pending;
  useEffect(() => {
    if (!pending || sent.current === pending.token) return;
    sent.current = pending.token;
    void (async () => {
      let failure: unknown;
      const value = await execute(pending.request, (error) => {
        failure = error;
      });
      if (!alive.current) return;
      if (value) dispatch({ type: "reply", token: pending.token, view: value });
      else {
        const conflict =
          failure instanceof HostFailure &&
          failure.detail.kind === "studioConflict"
            ? failure.detail.current
            : undefined;
        dispatch({ type: "error", token: pending.token, conflict });
        // Read the host after a conflict; never resend the discarded gesture.
        if (conflict) void execute({ method: "studio.get" });
      }
    })();
  }, [pending, execute, dispatch]);
  const begin = (id: string, mode: "move" | "resize") => {
    if (!enabled || (studio.pending && !current.current.pending)) return false;
    return !!dispatch({ type: "begin", id, mode }).gesture;
  };
  return {
    snapshot,
    current,
    dispatch,
    begin,
    enabled,
    pending: !!pending,
    box: (id: string) => projectedBox(snapshot, id),
  };
}
