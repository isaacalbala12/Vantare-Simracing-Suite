import {
  type RoadmapView,
  roadmapRefreshMs,
} from "../../../contract/generated/contract";
import type { Client } from "../../bridge/client";

const refreshBudget = { lastRefresh: -Infinity };
// One request at a time. Disposing prevents scheduling or publishing late replies.
export function pollRoadmap(
  client: Pick<Client, "request">,
  publish: (
    value: RoadmapView | null,
    failed: boolean,
    loading: boolean,
  ) => void,
  visible = () => !document.hidden,
  budget = refreshBudget,
) {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let busy = false;
  async function run(cached: boolean) {
    if (stopped || busy || !visible()) return;
    if (!cached && Date.now() - budget.lastRefresh < roadmapRefreshMs) {
      timer = setTimeout(
        () => void run(false),
        roadmapRefreshMs - (Date.now() - budget.lastRefresh),
      );
      return;
    }
    busy = true;
    publish(null, false, true);
    if (!cached) budget.lastRefresh = Date.now();
    try {
      const reply = await client.request({
        method: cached ? "roadmap.cached" : "roadmap.refresh",
      });
      if (
        !stopped &&
        (reply.method === "roadmap.cached" ||
          reply.method === "roadmap.refresh")
      )
        publish(reply.value, false, false);
    } catch {
      if (!stopped) publish(null, true, false);
    } finally {
      busy = false;
      if (!stopped) {
        if (cached && visible()) void run(false);
        else
          timer = setTimeout(() => {
            void run(false);
          }, roadmapRefreshMs);
      }
    }
  }
  const wake = () => {
    if (
      visible() &&
      !busy &&
      Date.now() - budget.lastRefresh >= roadmapRefreshMs
    ) {
      clearTimeout(timer);
      void run(false);
    }
  };
  void run(true);
  document.addEventListener("visibilitychange", wake);
  return () => {
    stopped = true;
    clearTimeout(timer);
    document.removeEventListener("visibilitychange", wake);
  };
}
