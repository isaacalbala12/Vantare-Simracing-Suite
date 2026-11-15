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
import { canRetryStudio } from "./retry";
import { initialStudioSelection } from "./selection";

type StudioRequest = Extract<Request, { method: `studio.${string}` }>;
type StudioFailureContext = { readRequired: true; confirmFromRead: boolean };
function useStateValue() {
  const { client } = useHost();
  const remembered = useUi((state) => state.studioLastSelected);
  const remember = useUi((state) => state.rememberStudio);
  const lastSelected = useRef(remembered);
  lastSelected.current = remembered;
  const [view, setView] = useState<StudioView>(),
    [canvasMode, setCanvasMode] = useState(false),
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
    [needsRead, setNeedsRead] = useState(false),
    [readVersion, setReadVersion] = useState(0),
    [failure, setFailure] = useState<{
      message: string;
      request: StudioRequest;
    }>();
  const focusAfter = useRef<{ id: string; index: number } | undefined>(
    undefined,
  );
  const busy = useRef(false),
    mustRead = useRef(false),
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
    async (
      request: StudioRequest,
      onFailure?: (error: unknown, context?: StudioFailureContext) => void,
    ) => {
      if (
        !client ||
        busy.current ||
        (mustRead.current && request.method !== "studio.get")
      ) {
        onFailure?.(
          new HostFailure({ kind: client ? "busy" : "coreUnavailable" }),
        );
        return;
      }
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
          response.method === request.method
        ) {
          update(response.value as StudioView);
          if (response.method === "studio.get") {
            mustRead.current = false;
            setNeedsRead(false);
            setReadVersion((value) => value + 1);
          }
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
          if (response.method === "studio.duplicate") {
            setSelected(response.added);
            setAdded({
              id: response.added,
              name: "",
              revision: response.value.revision,
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
        if (alive.current) throw new HostFailure({ kind: "coreUnavailable" });
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
        if (
          request.method === "studio.duplicate" &&
          (!(error instanceof HostFailure) ||
            error.detail.kind === "studioConflict" ||
            error.detail.kind === "coreUnavailable" ||
            error.detail.kind === "io")
        ) {
          // Read the current document after an uncertain write. Never replay it.
          if (
            !(error instanceof HostFailure) ||
            error.detail.kind !== "studioConflict"
          )
            message = t.duplicateUncertain;
          try {
            const fresh = await client.request({ method: "studio.get" });
            if (alive.current && fresh.method === "studio.get")
              update(fresh.value);
          } catch {
            // Keep the original failure; reading did not confirm duplication.
          }
        }
        if (request.method === "studio.geometry") {
          // An uncertain result may already be on disk. Fence all Studio writes
          // until a fresh read, including if Canvas is closed in the meantime.
          mustRead.current = true;
          setNeedsRead(true);
          onFailure?.(error, {
            readRequired: true,
            confirmFromRead:
              !(error instanceof HostFailure) ||
              error.detail.kind === "coreUnavailable" ||
              error.detail.kind === "io",
          });
          if (!onFailure) setFailure({ message, request });
          try {
            const fresh = await client.request({ method: "studio.get" });
            if (fresh.method !== "studio.get")
              throw new HostFailure({ kind: "coreUnavailable" });
            if (alive.current) {
              update(fresh.value);
              mustRead.current = false;
              setNeedsRead(false);
              setReadVersion((value) => value + 1);
            }
          } catch {
            if (alive.current)
              setFailure({
                message: t.offline,
                request: { method: "studio.get" },
              });
          }
        } else if (onFailure) onFailure(error);
        else if (alive.current) setFailure({ message, request });
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
    if (!failure || !canRetryStudio(failure.request)) return;
    void execute(
      "baseRevision" in failure.request && view
        ? { ...failure.request, baseRevision: view.revision }
        : failure.request,
    );
  };
  return {
    canvasMode,
    setCanvasMode,
    needsRead,
    readVersion,
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
    canRetry: failure !== undefined && canRetryStudio(failure.request),
    discard: () => {
      if (!mustRead.current) setFailure(undefined);
    },
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
