import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type {
  Reply,
  SettingsPatch,
  SettingsView,
} from "../../contract/generated/contract";
import { HostFailure } from "../bridge/client";
import { applySettings } from "../design/appearance";
import { t } from "../i18n/es";
import { useToastManager } from "../ui/Layers";
import { settingsKey, useHost } from "./Host";

function settingsReply(reply: Reply): SettingsView {
  switch (reply.method) {
    case "settings.get":
    case "settings.update":
    case "settings.retry":
    case "settings.discard":
      return reply.value;
    default:
      throw new HostFailure({ kind: "unsupported" });
  }
}
interface State {
  view?: SettingsView;
  loading: boolean;
  pending: boolean;
  field?: SettingsPatch["field"];
  error?: HostFailure;
  update: (patch: SettingsPatch) => void;
  retry: () => void;
  discard: () => void;
  reload: () => void;
}
const Context = createContext<State | undefined>(undefined);
export function useSettings() {
  const state = useContext(Context);
  if (!state) throw new Error("Settings provider missing");
  return state;
}
export function SettingsProvider({ children }: { children: ReactNode }) {
  const { client } = useHost();
  const toast = useToastManager();
  const cache = useQueryClient();
  const [error, setError] = useState<HostFailure>();
  const failed = useRef<SettingsPatch | undefined>(undefined);
  const inFlight = useRef<Promise<void>>(Promise.resolve());
  const busy = useRef(false);
  const query = useQuery({
    queryKey: settingsKey,
    enabled: !!client,
    queryFn: async () => {
      if (!client) throw new HostFailure({ kind: "coreUnavailable" });
      return settingsReply(await client.request({ method: "settings.get" }));
    },
  });
  const mutation = useMutation({
    mutationFn: async (
      action: { patch: SettingsPatch } | { retry: true } | { discard: true },
    ) => {
      if (!client || !query.data)
        throw new HostFailure({ kind: "coreUnavailable" });
      return settingsReply(
        await client.request(
          "discard" in action
            ? { method: "settings.discard" }
            : "retry" in action
              ? { method: "settings.retry" }
              : {
                  method: "settings.update",
                  patch: action.patch,
                  baseRevision: query.data.revision,
                },
        ),
      );
    },
    onSuccess: (view) => {
      failed.current = undefined;
      setError(undefined);
      cache.setQueryData(settingsKey, view);
    },
    onError: (cause: unknown, action) => {
      const failure =
        cause instanceof HostFailure ? cause : new HostFailure({ kind: "io" });
      if (query.data) applySettings(query.data);
      if ("patch" in action) failed.current = action.patch;
      if (failure.detail.kind === "conflict")
        cache.setQueryData(settingsKey, failure.detail.current);
      setError(failure);
      toast.add({
        title: t(
          failure.detail.kind === "conflict"
            ? "settings.conflict"
            : failure.detail.kind === "protected"
              ? "settings.protected"
              : "settings.failed",
        ),
        type: "err",
      });
    },
  });
  useEffect(() => {
    if (!client) return;
    client.setCloseGuard(async (reason) => {
      await inFlight.current;
      if (reason !== "window") {
        failed.current = undefined;
        setError(undefined);
        return true;
      }
      return failed.current === undefined;
    });
  }, [client]);
  useEffect(() => {
    if (!query.data) return;
    const view = query.data;
    applySettings(view);
    const media = matchMedia("(prefers-color-scheme: dark)");
    const refresh = () => applySettings(view);
    media.addEventListener("change", refresh);
    return () => media.removeEventListener("change", refresh);
  }, [query.data]);
  function run(
    action: { patch: SettingsPatch } | { retry: true } | { discard: true },
  ) {
    if (busy.current) return;
    busy.current = true;
    inFlight.current = mutation
      .mutateAsync(action)
      .then(
        () => undefined,
        () => undefined,
      )
      .finally(() => {
        busy.current = false;
      });
  }
  const state: State = {
    view: query.data,
    loading: query.isPending,
    pending: mutation.isPending,
    field:
      (mutation.variables && "patch" in mutation.variables
        ? mutation.variables.patch.field
        : undefined) ?? failed.current?.field,
    error,
    update: (patch) => {
      if (!failed.current) run({ patch });
    },
    retry: () => {
      if (query.data?.canRetry) run({ retry: true });
      else if (failed.current) run({ patch: failed.current });
      else void query.refetch();
    },
    discard: () => run({ discard: true }),
    reload: () => {
      void query.refetch();
    },
  };
  return <Context.Provider value={state}>{children}</Context.Provider>;
}
