import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { Request, StudioView } from "../../../contract/generated/contract";
import { useHost } from "../../app/Host";
import { HostFailure } from "../../bridge/client";
import { studioText as t } from "../../i18n/studio";

type StudioRequest = Extract<Request, { method: `studio.${string}` }>;
function useStateValue() {
  const { client } = useHost();
  const [view, setView] = useState<StudioView>(),
    [selected, setSelected] = useState<string | null>(null),
    [pending, setPending] = useState(false),
    [failure, setFailure] = useState<{
      message: string;
      request: StudioRequest;
    }>();
  const busy = useRef(false),
    alive = useRef(true),
    opened = useRef(false);
  const update = useCallback((value: StudioView) => {
    setView(value);
    if (!opened.current && value.instances.length) {
      opened.current = true;
      setSelected(value.instances[0].id);
    }
  }, []);
  const execute = useCallback(
    async (request: StudioRequest) => {
      if (!client || busy.current) return;
      busy.current = true;
      setPending(true);
      setFailure(undefined);
      try {
        const response = await client.request(request);
        if (
          alive.current &&
          "value" in response &&
          response.method.startsWith("studio.")
        ) {
          update(response.value as StudioView);
          return response.value as StudioView;
        }
      } catch (error) {
        if (!alive.current) return;
        let message = t.failed;
        if (error instanceof HostFailure) {
          switch (error.detail.kind) {
            case "studioConflict":
              update(error.detail.current);
              message = t.conflict;
              break;
            case "busy":
              message = t.busy;
              break;
            case "coreUnavailable":
              message = t.offline;
              break;
            case "protected":
              message = t.protected;
              break;
          }
        }
        setFailure({ message, request });
      } finally {
        busy.current = false;
        if (alive.current) setPending(false);
      }
    },
    [client, update],
  );
  useEffect(() => {
    alive.current = true;
    if (!client) return;
    void execute({ method: "studio.get" });
    const off = client.listen((message) => {
      if (message.kind === "event" && message.event.topic === "studio")
        update(message.event.value);
    });
    const unsubscribe = client.subscribe("studio");
    return () => {
      alive.current = false;
      off();
      unsubscribe();
    };
  }, [client, execute, update]);
  const retry = () => {
    if (
      !failure ||
      !["studio.visibility", "studio.instance", "studio.track"].includes(
        failure.request.method,
      )
    )
      return;
    void execute(
      "baseRevision" in failure.request && view
        ? { ...failure.request, baseRevision: view.revision }
        : failure.request,
    );
  };
  return {
    view,
    selected,
    setSelected,
    pending,
    failure,
    execute,
    retry,
    canRetry:
      failure !== undefined &&
      ["studio.visibility", "studio.instance", "studio.track"].includes(
        failure.request.method,
      ),
    discard: () => setFailure(undefined),
  };
}
const Context = createContext<ReturnType<typeof useStateValue> | undefined>(
  undefined,
);
export function StudioProvider({ children }: { children: ReactNode }) {
  return (
    <Context.Provider value={useStateValue()}>{children}</Context.Provider>
  );
}
export function useStudio() {
  const value = useContext(Context);
  if (!value) throw Error("Studio provider missing");
  return value;
}
