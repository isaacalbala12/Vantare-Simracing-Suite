import { useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
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
function useActionState() {
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
    canRetry: failure !== undefined && retryable(failure.request.method),
    execute,
    retry: () => {
      if (failure && retryable(failure.request.method))
        void execute({
          ...failure.request,
          baseRevision: failure.revision ?? failure.request.baseRevision,
        });
    },
    discard: () => setFailure(undefined),
  };
}

function retryable(method: ProfileActionRequest["method"]) {
  return (
    method === "launcher.profile.favorite" ||
    method === "launcher.profile.option" ||
    method === "launcher.trigger"
  );
}
const Context = createContext<ReturnType<typeof useActionState> | undefined>(
  undefined,
);
export function ProfileActionProvider({ children }: { children: ReactNode }) {
  const value = useActionState();
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useProfileAction() {
  const value = useContext(Context);
  if (!value) throw Error("Profile actions require their shared provider");
  return value;
}
