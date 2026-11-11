import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { Request } from "../../../contract/generated/contract";
import {
  isProfileActionMethod,
  type profileActionMethods,
} from "../../../contract/profile-actions";
import { useHost } from "../../app/Host";
import { HostFailure } from "../../bridge/client";
import { launcherKey } from "./state";
export type ProfileActionRequest = Extract<
  Request,
  { method: (typeof profileActionMethods)[number] }
>;
export function useProfileAction() {
  const { client } = useHost();
  const cache = useQueryClient();
  const busy = useRef(false);
  const alive = useRef(true);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<{
    request: ProfileActionRequest;
    revision?: string;
  }>();
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  async function execute(request: ProfileActionRequest) {
    if (!client || busy.current) return;
    busy.current = true;
    setPending(true);
    setFailure(undefined);
    try {
      const result = await client.request(request);
      if (
        alive.current &&
        isProfileActionMethod(result.method) &&
        "value" in result
      )
        cache.setQueryData(launcherKey, result.value);
    } catch (error) {
      if (!alive.current) return;
      if (
        error instanceof HostFailure &&
        error.detail.kind === "launcherConflict"
      ) {
        cache.setQueryData(launcherKey, error.detail.current);
        setFailure({ request, revision: error.detail.current.revision });
      } else setFailure({ request });
    } finally {
      busy.current = false;
      if (alive.current) setPending(false);
    }
  }
  return {
    pending,
    failure,
    execute,
    retry: () => {
      if (failure)
        void execute({
          ...failure.request,
          baseRevision: failure.revision ?? failure.request.baseRevision,
        });
    },
    discard: () => setFailure(undefined),
  };
}
