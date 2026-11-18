import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import type { UpdatesView } from "../../contract/generated/contract";
import { useHost } from "./Host";

export function useUpdates() {
  const { client } = useHost();
  const cache = useQueryClient();
  useEffect(() => {
    if (!client) return;
    const unlisten = client.listen((message) => {
      if (message.kind === "event" && message.event.topic === "updates")
        cache.setQueryData(["updates"], message.event.value);
    });
    const unsubscribe = client.subscribe("updates");
    return () => {
      unsubscribe();
      unlisten();
    };
  }, [client, cache]);
  return useQuery({
    queryKey: ["updates"],
    enabled: !!client,
    queryFn: async () => {
      const reply = await client?.request({ method: "updates.get" });
      if (reply?.method !== "updates.get")
        throw new Error("Updates unavailable");
      return reply.value;
    },
  });
}

// Shell loads and refreshes the updates view; settings only read the channel
// from that shared cache so the screen keeps working with partial hosts.
export function useUpdatesChannel() {
  const { data } = useQuery<UpdatesView>({
    queryKey: ["updates"],
    enabled: false,
  });
  return data?.channel;
}
