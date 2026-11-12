import {
  useIsMutating,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import type { Request } from "../../contract/generated/contract";
import { HostFailure } from "../bridge/client";
import { useHost } from "./Host";

const launchKey = ["launcher", "launch-request"] as const;
type Launch = Extract<
  Request,
  { method: "launcher.launch" | "launcher.favorite" }
>;
/** One synchronous pending lease across the rail, palette and Launcher screen. */
export function useLauncherRequest() {
  const { client } = useHost();
  const cache = useQueryClient();
  const mutation = useMutation({
    mutationKey: launchKey,
    mutationFn: (request: Launch) => {
      if (!client) throw new HostFailure({ kind: "coreUnavailable" });
      return client.request(request);
    },
  });
  const busy = () => cache.isMutating({ mutationKey: launchKey }) > 0;
  return {
    pending: useIsMutating({ mutationKey: launchKey }) > 0,
    busy,
    request: (request: Launch) => {
      if (busy()) return Promise.reject(new HostFailure({ kind: "busy" }));
      return mutation.mutateAsync(request);
    },
  };
}
