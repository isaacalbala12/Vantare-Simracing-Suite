import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { isAppDraft } from "../../../contract/apps-validation";
import type {
  AppEditor,
  CatalogApp,
  CatalogView,
  PickedApp,
  Request,
} from "../../../contract/generated/contract";
import { useHost } from "../../app/Host";
import { HostFailure } from "../../bridge/client";
import { appText as text } from "../../i18n/launcher-apps";
import { Button } from "../../ui/Button";
import { Callout, Skeleton } from "../../ui/Data";
import { useToastManager } from "../../ui/Layers";
import {
  ApplicationCatalog,
  ApplicationFields,
  ApplicationRemoval,
  ApplicationArgumentReset,
} from "../../ui/launcher/Applications";
import { useProfileEditorState } from "./editor-state";
import { launcherKey, useLauncherSnapshot } from "./state";

type Mutation = Extract<
  Request,
  {
    method:
      | "launcher.app.save"
      | "launcher.app.remove"
      | "launcher.app.favorite";
  }
>;
export function Applications() {
  const { client } = useHost();
  const navigation = useProfileEditorState();
  const cache = useQueryClient();
  const toast = useToastManager();
  const original = useRef<string | undefined>(undefined);
  const { view } = useLauncherSnapshot();
  const [catalog, setCatalog] = useState<CatalogView>();
  const [query, setQuery] = useState("");
  const [editor, setEditor] = useState<AppEditor>();
  const [selected, setSelected] = useState<PickedApp | null>(null);
  const [removal, setRemoval] = useState<CatalogApp | null>(null);
  const [pending, setPending] = useState(false);
  const [argumentReset, setArgumentReset] = useState<string>();
  const [error, setError] = useState<string>();
  const retry = useRef<{ request: Mutation; revision: string } | undefined>(
    undefined,
  );
  const busy = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const load = useCallback(async () => {
    if (!client) return;
    const result = await client.request({ method: "launcher.catalog" });
    if (alive.current && result.method === "launcher.catalog")
      setCatalog(result.value);
  }, [client]);
  useEffect(() => {
    if (!client) return;
    const off = client.listen((message) => {
      if (message.kind === "event" && message.event.topic === "launcher")
        cache.setQueryData(launcherKey, message.event.value);
    });
    const unsubscribe = client.subscribe("launcher");
    return () => {
      unsubscribe();
      off();
    };
  }, [client, cache]);
  const observed = view ? `${view.revision}:${view.scanning}` : "initial";
  useEffect(() => {
    if (!observed) return;
    void load().catch(() => {
      if (alive.current) setError(text.failed);
    });
  }, [load, observed]);
  useEffect(() => {
    if (!client || !editor) return;
    return client.addCloseGuard((reason) => {
      if (reason !== "window") {
        setEditor(undefined);
        setSelected(null);
        return true;
      }
      const dirty =
        selected !== null || JSON.stringify(editor.draft) !== original.current;
      if (dirty) toast.add({ title: text.unsaved, type: "warn" });
      return !dirty;
    });
  }, [client, editor, selected, toast]);
  const open = useCallback(
    async (id: string | null) => {
      if (!client || busy.current) return;
      busy.current = true;
      setPending(true);
      try {
        const result = await client.request({ method: "launcher.app.get", id });
        if (alive.current && result.method === "launcher.app.get") {
          original.current = JSON.stringify(result.value.draft);
          setEditor(result.value);
          setSelected(null);
          setError(undefined);
          retry.current = undefined;
        }
      } catch {
        if (alive.current) setError(text.failed);
      } finally {
        busy.current = false;
        if (alive.current) setPending(false);
      }
    },
    [client],
  );
  useEffect(() => {
    if (!client || !navigation.createApplication) return;
    navigation.setCreateApplication(false);
    void open(null);
  }, [
    client,
    navigation.createApplication,
    navigation.setCreateApplication,
    open,
  ]);
  async function mutate(request: Mutation) {
    if (!client || busy.current) return;
    busy.current = true;
    setPending(true);
    setError(undefined);
    retry.current = { request, revision: request.baseRevision };
    try {
      const result = await client.request(request);
      if (!alive.current) return;
      if (
        result.method === "launcher.app.save" ||
        result.method === "launcher.app.remove" ||
        result.method === "launcher.app.favorite"
      ) {
        cache.setQueryData(launcherKey, result.value);
        setEditor(undefined);
        setSelected(null);
        setRemoval(null);
        retry.current = undefined;
        await load();
      }
    } catch (failure) {
      if (!alive.current) return;
      if (
        failure instanceof HostFailure &&
        failure.detail.kind === "launcherConflict"
      ) {
        retry.current = { request, revision: failure.detail.current.revision };
        cache.setQueryData(launcherKey, failure.detail.current);
        setError(text.conflict);
      } else setError(text.failed);
    } finally {
      busy.current = false;
      if (alive.current) setPending(false);
    }
  }
  async function pick() {
    if (!client || busy.current || !editor) return;
    busy.current = true;
    setPending(true);
    try {
      const result = await client.request({ method: "launcher.app.pick", id: editor.draft.id });
      if (
        alive.current &&
        result.method === "launcher.app.pick" &&
        result.value
      ) {
        setSelected(result.value);
        setEditor({
          ...editor,
          draft: {
            ...editor.draft,
            useDiscovery: false,
            name: editor.draft.name || result.value.name,
          },
        });
      }
    } catch {
      if (alive.current) setError(text.failed);
    } finally {
      busy.current = false;
      if (alive.current) setPending(false);
    }
  }
  function save(revision = editor?.revision, confirmed = false) {
    if (!editor || !revision) return;
    const draft = editor.draft;
    if (!isAppDraft(draft)) {
      setError(text.failed);
      return;
    }
    if (!draft.id && !selected) {
      setError(text.missing);
      return;
    }
    if (!confirmed && editor.hasCustomArguments && (selected !== null || (editor.hasExecutable && draft.useDiscovery))) {
      setArgumentReset(revision);
      return;
    }
    void mutate({
      method: "launcher.app.save",
      draft,
      pickToken: selected?.token ?? null,
      baseRevision: revision,
    });
  }
  async function scan() {
    if (!client || busy.current) return;
    busy.current = true;
    setPending(true);
    try {
      const result = await client.request({ method: "launcher.scan" });
      if (alive.current && result.method === "launcher.scan") {
        cache.setQueryData(launcherKey, result.value);
        await load();
      }
    } catch {
      if (alive.current) setError(text.failed);
    } finally {
      busy.current = false;
      if (alive.current) setPending(false);
    }
  }
  const discard = () => {
    if (pending) return;
    setError(undefined);
    setSelected(null);
    retry.current = undefined;
    if (editor?.draft.id) void open(editor.draft.id);
    else {
      setEditor(undefined);
      void load().catch(() => setError(text.failed));
    }
  };
  const again = () => {
    const value = retry.current;
    if (editor) save(value?.revision ?? editor.revision);
    else if (value)
      void mutate({ ...value.request, baseRevision: value.revision });
    else void load().catch(() => setError(text.failed));
  };
  if (!catalog)
    return error ? (
      <Callout
        tone="err"
        title={error}
        actions={
          <Button
            onClick={() => void load().catch(() => setError(text.failed))}
          >
            {text.reload}
          </Button>
        }
      />
    ) : (
      <Skeleton label={text.detecting} />
    );
  return (
    <>
      {editor ? (
        <ApplicationFields
          value={editor}
          selected={selected}
          pending={pending}
          error={error}
          official={catalog.apps.some(
            (app) => app.id === editor.draft.id && !app.removable,
          )}
          onChange={(draft) => setEditor({ ...editor, draft })}
          onPick={() => void pick()}
          onDiscovery={() => {
            setSelected(null);
            setEditor({
              ...editor,
              draft: { ...editor.draft, useDiscovery: true },
            });
          }}
          onSave={() => save()}
          onCancel={() => {
            setEditor(undefined);
            setSelected(null);
            setError(undefined);
          }}
          onRetry={again}
          onDiscard={discard}
        />
      ) : (
        <ApplicationCatalog
          value={catalog}
          query={query}
          onQuery={setQuery}
          pending={pending}
          error={error}
          onReload={() => void load().catch(() => setError(text.failed))}
          onScan={() => void scan()}
          onEdit={(id) => void open(id)}
          onFavorite={(app) =>
            void mutate({
              method: "launcher.app.favorite",
              id: app.id,
              favorite: !app.favorite,
              baseRevision: catalog.revision,
            })
          }
          onRemove={setRemoval}
          onRetry={again}
          onDiscard={discard}
        />
      )}
      <ApplicationArgumentReset open={argumentReset !== undefined} onCancel={() => setArgumentReset(undefined)} onConfirm={() => {const revision = argumentReset;setArgumentReset(undefined);if(revision) save(revision, true);}} />
      <ApplicationRemoval
        app={removal}
        pending={pending}
        onCancel={() => setRemoval(null)}
        onConfirm={() => {
          if (removal)
            void mutate({
              method: "launcher.app.remove",
              id: removal.id,
              baseRevision: catalog.revision,
            });
        }}
      />
    </>
  );
}
