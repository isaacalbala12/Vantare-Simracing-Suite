import {
  useIsMutating,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import type { CoreStatus, Request } from "../../contract/generated/contract";
import { HostFailure } from "../bridge/client";
import { coreKey, useHost } from "./Host";

const launchKey = ["launcher", "launch-request"] as const;
type Launch = Extract<Request, { method: "launcher.launchChecked" }>;
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
    request: (request: Omit<Launch, "armedGeneration">) => {
      if (busy()) return Promise.reject(new HostFailure({ kind: "busy" }));
      const generation =
        cache.getQueryData<CoreStatus>(coreKey)?.accountGeneration;
      if (!generation)
        return Promise.reject(new HostFailure({ kind: "coreUnavailable" }));
      return mutation.mutateAsync({ ...request, armedGeneration: generation });
    },
  };
}
