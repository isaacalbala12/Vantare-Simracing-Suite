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
import { useUi } from "../../app/UiState";
import { HostFailure } from "../../bridge/client";
import { studioText as t } from "../../i18n/studio";
import { initialStudioSelection } from "./selection";

type StudioRequest = Extract<Request, { method: `studio.${string}` }>;
function useStateValue() {
  const { client } = useHost();
  const remembered = useUi((state) => state.studioLastSelected);
  const remember = useUi((state) => state.rememberStudio);
  const lastSelected = useRef(remembered);
  lastSelected.current = remembered;
  const [view, setView] = useState<StudioView>(),
    [selected, setSelected] = useState<string | null>(null),
    [added, setAdded] = useState<{
      id: string;
      name: string;
      revision: string;
    }>(),
    [notice, setNotice] = useState<{
      kind: "added" | "removed" | "preset";
      name: string;
      revision: string;
    }>(),
    [removing, setRemoving] = useState<string | null>(null),
    [pending, setPending] = useState(false),
    [failure, setFailure] = useState<{
      message: string;
      request: StudioRequest;
    }>();
  const focusAfter = useRef<{ id: string; index: number } | undefined>(
    undefined,
  );
  const busy = useRef(false),
    alive = useRef(true),
    opened = useRef(false);
  const update = useCallback((value: StudioView) => {
    setView(value);
    if (!opened.current) {
      opened.current = true;
      setSelected(initialStudioSelection(value, lastSelected.current));
    }
  }, []);
  useEffect(() => {
    if (selected) remember(selected);
  }, [selected, remember]);
  const execute = useCallback(
    async (request: StudioRequest) => {
      if (!client || busy.current) return;
      if (
        request.method === "studio.instance" ||
        request.method === "studio.visibility"
      )
        remember(request.id);
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
          if (
            request.method === "studio.instance" &&
            request.patch.field === "settings" &&
            "tablePreset" in request.patch.value &&
            request.patch.value.tablePreset &&
            (response.value as StudioView).revision !== request.baseRevision
          ) {
            const name = {
              compact: t.formatCompact,
              standard: t.formatStandard,
              expanded: t.formatExpanded,
            }[request.patch.value.tablePreset];
            setNotice({
              kind: "preset",
              name,
              revision: (response.value as StudioView).revision,
            });
          }
          if (response.method === "studio.add") {
            const item = response.value.instances.find(
              (item) => item.id === response.added,
            );
            const name =
              response.value.catalog.find(
                (widget) => widget.kind === item?.kind,
              )?.name ?? item?.kind;
            if (name) {
              setNotice({
                kind: "added",
                name,
                revision: response.value.revision,
              });
              setAdded({
                id: response.added,
                name,
                revision: response.value.revision,
              });
            }
          }
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
    [client, update, remember],
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
    removing,
    setRemoving,
    added,
    notice,
    setNotice,
    focusAfter,
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
