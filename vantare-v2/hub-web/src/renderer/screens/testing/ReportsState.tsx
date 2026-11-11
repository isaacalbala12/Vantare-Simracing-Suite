import { useQuery } from "@tanstack/react-query";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  type HostError,
  type LegacyMigration,
  type ReportFields,
  type ReportPreviewView,
  type ReportReceiptView,
  type Request,
  reportAutosaveMs,
  reportModules,
  type TestingView,
} from "../../../contract/generated/contract";
import { isReportFields } from "../../../contract/testing-validation";
import { coreKey, offline, useHost } from "../../app/Host";
import { HostFailure } from "../../bridge/client";
import { Button } from "../../ui/Button";
import { CloseUnsavedReportDialog } from "../../ui/DiscardReportDialog";
import { useToastManager } from "../../ui/Layers";
import { testingText as text } from "./es";
import { testingRequest } from "./TestingRequests";

const empty = (): ReportFields => ({
  module: reportModules[0][0],
  actionText: "",
  expectedText: "",
  observedText: "",
  contextText: "",
});
function useReportsState() {
  const { client } = useHost();
  const toast = useToastManager();
  const { data: core = offline } = useQuery({
    queryKey: coreKey,
    queryFn: async () => offline,
    enabled: false,
  });
  const available =
    core.access.verified &&
    !core.access.blocked &&
    core.services === "connected";
  const [fields, setFields] = useState(empty);
  const [saved, setSaved] = useState(JSON.stringify(fields));
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [failure, setFailure] = useState<HostError["kind"]>();
  const [preview, setPreview] = useState<ReportPreviewView>();
  const [receipt, setReceipt] = useState<ReportReceiptView>();
  const [sessionReceipts, setSessionReceipts] = useState<{ value: ReportReceiptView; title: string; module: string }[]>([]);
  const [participation, setParticipation] = useState<TestingView>({
    reports: [],
    questionnaires: [],
  });
  const [legacy, setLegacy] = useState<LegacyMigration>("none");
  const [consent, setConsent] = useState(false);
  const [localNotes, setLocalNotes] = useState({ title: "", body: "" });
  const failedRequest = useRef<
    Exclude<Request, { method: "window.close" }> | undefined
  >(undefined);
  const sending = useRef(false);
  const closePermit = useRef<{ epoch: number; fields: string } | undefined>(
    undefined,
  );
  const [closeBlocked, setCloseBlocked] = useState(false);
  const [closeConfirmation, setCloseConfirmation] = useState(false);
  const state = useRef({ fields, saved, loaded, available });
  state.current = { fields, saved, loaded, available };
  const inflight = useRef<Promise<unknown> | undefined>(undefined);
  const attempt = useRef<string | undefined>(undefined);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const cancellation = useRef(new AbortController());
  const [message, setMessage] = useState("");
  const generation = useRef(0);
  const identity = useRef(client);
  const dirty = JSON.stringify(fields) !== saved;
  const askCloseWithoutSave = useCallback(() => {
    if (JSON.stringify(state.current.fields) !== state.current.saved)
      setCloseConfirmation(true);
    else client?.closeWindow();
  }, [client]);
  function request(request: Exclude<Request, { method: "window.close" }>) {
    const epoch = generation.current;
    const signal = cancellation.current.signal;
    const operation = queue.current
      .catch(() => {})
      .then(async () => {
        if (!client || !state.current.available || epoch !== generation.current)
          throw new HostFailure({ kind: "coreUnavailable" });
        setBusy(true);
        setError(false);
        setFailure(undefined);
        failedRequest.current = undefined;
        try {
          const reply = await testingRequest(client, request, signal);
          if (epoch !== generation.current)
            throw new Error("report session changed");
          return reply;
        } catch (error) {
          if (epoch === generation.current) {
            failedRequest.current = request;
            setError(true);
            if (
              request.method.startsWith("report.") ||
              request.method.startsWith("draft.")
            ) {
              setPreview(undefined);
              setConsent(false);
            }
            setFailure(
              error instanceof HostFailure ? error.detail.kind : "rejected",
            );
          }
          throw error;
        } finally {
          if (epoch === generation.current) setBusy(false);
        }
      });
    queue.current = operation;
    inflight.current = operation;
    return operation;
  }
  async function load() {
    const baseline = JSON.parse(state.current.saved) as ReportFields;
    const reply = await request({ method: "draft.load" });
    if (reply.method !== "draft.load")
      throw new Error("unexpected report reply");
    const fields = { ...reply.value.fields };
    for (const key of Object.keys(fields) as (keyof ReportFields)[]) {
      if (state.current.fields[key] !== baseline[key])
        fields[key] = state.current.fields[key];
    }
    setFields(fields);
    setSaved(JSON.stringify(reply.value.fields));
    setLoaded(true);
    setMessage(reply.value.message);
    setLegacy(reply.value.legacy);
  }
  async function save() {
    if (
      !state.current.loaded ||
      JSON.stringify(state.current.fields) === state.current.saved
    )
      return;
    const fields = structuredClone(state.current.fields);
    if (!isReportFields(fields)) {
      setError(true);
      setFailure("rejected");
      throw new HostFailure({ kind: "rejected" });
    }
    const reply = await request({ method: "draft.save", fields });
    if (reply.method !== "draft.save")
      throw new Error("unexpected report reply");
    setMessage(reply.value.message);
    setLegacy(reply.value.legacy);
    state.current.saved = JSON.stringify(fields);
    setSaved(state.current.saved);
    setPreview(undefined);
    setConsent(false);
  }
  const saveCurrent = useRef(save);
  saveCurrent.current = save;
  useEffect(() => {
    if (!loaded || !dirty || busy || error || !available) return;
    const snapshot = JSON.stringify(fields);
    const timer = setTimeout(() => {
      if (JSON.stringify(state.current.fields) !== snapshot) return;
      void saveCurrent.current().catch(() => setMessage(text.autosaveFailed));
    }, reportAutosaveMs);
    return () => clearTimeout(timer);
  }, [loaded, dirty, busy, error, available, fields]);
  useEffect(
    () =>
      client?.onCloseSettled(() => {
        closePermit.current = undefined;
      }),
    [client],
  );
  useEffect(() => {
    if (!client) return;
    return client.addCloseGuard(async (reason) => {
      const permitted = closePermit.current;
      closePermit.current = undefined;
      if (reason === "live" || reason === "controlEof") return true;
      await inflight.current?.catch(() => {});
      if (
        permitted?.epoch === generation.current &&
        permitted.fields === JSON.stringify(state.current.fields)
      )
        return true;
      const clean =
        JSON.stringify(state.current.fields) === state.current.saved;
      if (!clean) {
        setCloseBlocked(true);
        setMessage(text.closeUnsaved);
        const epoch = generation.current;
        toast.add({
          title: text.closeUnsaved,
          type: "warn",
          description: (
            <Button
              onClick={() => {
                if (epoch === generation.current) askCloseWithoutSave();
              }}
            >
              {text.closeWithoutSave}
            </Button>
          ),
        });
      }
      return clean;
    });
  }, [client, toast, askCloseWithoutSave]);
  useEffect(() => {
    const flush = () => {
      if (!state.current.available || !state.current.loaded) return;
      void saveCurrent.current().catch(() => setMessage(text.autosaveFailed));
    };
    const hidden = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("blur", flush);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      window.removeEventListener("blur", flush);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, []);
  useEffect(() => {
    if (
      identity.current === client &&
      core.access.verified &&
      !core.access.blocked
    )
      return;
    cancellation.current.abort();
    cancellation.current = new AbortController();
    identity.current = client;
    generation.current++;
    sending.current = false;
    closePermit.current = undefined;
    setCloseBlocked(false);
    setCloseConfirmation(false);
    failedRequest.current = undefined;
    setBusy(false);
    setLocalNotes({ title: "", body: "" });
    setFields(empty());
    setSaved(JSON.stringify(empty()));
    setLoaded(false);
    setPreview(undefined);
    setReceipt(undefined);
    setConsent(false);
    setParticipation({ reports: [], questionnaires: [] });
    setSessionReceipts([]);
    setLegacy("none");
    setMessage("");
    setError(false);
  }, [client, core.access.verified, core.access.blocked]);
  useEffect(() => () => cancellation.current.abort(), []);
  function edit(patch: Partial<ReportFields>) {
    closePermit.current = undefined;
    attempt.current = undefined;
    failedRequest.current = undefined;
    setError(false);
    setFields((current) => ({ ...current, ...patch }));
    setPreview(undefined);
    setConsent(false);
    setReceipt(undefined);
  }
  function editLocal(patch: Partial<typeof localNotes>) {
    setLocalNotes((current) => ({ ...current, ...patch }));
    attempt.current = undefined;
    setConsent(false);
  }
  async function refresh() {
    const reply = await request({ method: "testing.refresh" });
    if (reply.method === "testing.refresh") setParticipation(reply.value);
  }
  async function contribute() {
    if (!consent) return;
    const id = attempt.current ?? crypto.randomUUID();
    attempt.current = id;
    setConsent(false);
    const reply = await request({
      method: "testing.contribute",
      id,
      consent: true,
    });
    if (reply.method === "testing.contribute") {
      setParticipation(reply.value);
      attempt.current = undefined;
    }
  }
  async function credit(id: string, consent: boolean) {
    const reply = await request({ method: "testing.credit", id, consent });
    if (reply.method === "testing.credit") setParticipation(reply.value);
  }
  async function notice(id: string, updatedAt: string) {
    const reply = await request({
      method: "testing.noticeRead",
      id,
      updatedAt,
    });
    if (reply.method === "testing.noticeRead") setParticipation(reply.value);
  }
  async function discard() {
    const reply = await request({ method: "draft.discard" });
    if (reply.method !== "draft.discard")
      throw new Error("unexpected report reply");
    setFields(reply.value.fields);
    setSaved(JSON.stringify(reply.value.fields));
    setLegacy(reply.value.legacy);
    setPreview(undefined);
    setConsent(false);
  }
  async function prepare(retry = false) {
    await save();
    const reply = await request({
      method: retry ? "report.retryPrepare" : "report.prepare",
    });
    if (
      reply.method === "report.prepare" ||
      reply.method === "report.retryPrepare"
    ) {
      setPreview(reply.value);
      setConsent(false);
    }
  }
  async function send() {
    if (sending.current || !preview || !consent || dirty) return;
    sending.current = true;
    const epoch = generation.current;
    try {
      const sentFields = JSON.stringify(state.current.fields);
      const { actionText: title, module } = state.current.fields;
      setConsent(false);
      const reply = await request({
        method: "report.send",
        previewId: preview.id,
        consent: true,
      });
      if (reply.method !== "report.send")
        throw new Error("unexpected report reply");
      setReceipt(reply.value);
      setSessionReceipts(current => current.some(item => item.value.id === reply.value.id) ? current.map(item => item.value.id === reply.value.id ? { ...item, value: reply.value } : item) : [...current, { value: reply.value, title, module }]);
      setPreview(undefined);
      if (reply.value.draftState === "cleared") {
        if (JSON.stringify(state.current.fields) === sentFields)
          setFields(empty());
        setSaved(JSON.stringify(empty()));
      }
    } finally {
      if (epoch === generation.current) sending.current = false;
    }
  }
  useEffect(() => {
    if (!dirty) setCloseBlocked(false);
  }, [dirty]);

  function confirmCloseWithoutSave() {
    if (!client) return;
    closePermit.current = {
      epoch: generation.current,
      fields: JSON.stringify(state.current.fields),
    };
    setCloseConfirmation(false);
    // Start a new close negotiation after the veto. The guard only consumes this one-shot permission.
    client.closeWindow();
  }
  async function retry() {
    const failed = failedRequest.current;
    setError(false);
    setFailure(undefined);
    failedRequest.current = undefined;
    switch (failed?.method) {
      case "draft.load":
        return load();
      case "draft.save":
        return save();
      case "testing.refresh":
        return refresh();
      case "report.prepare":
        return prepare();
      case "report.retryPrepare":
        return prepare(true);
      default:
        setMessage(text.reviewAgain);
    }
  }

  return {
    access: core.access,
    closeBlocked,
    closeConfirmation,
    askCloseWithoutSave,
    confirmCloseWithoutSave,
    cancelCloseWithoutSave: () => setCloseConfirmation(false),
    localNotes,
    editLocal,
    retry,
    legacy,
    message,
    fields,
    edit,
    loaded,
    available,
    busy,
    dirty,
    error,
    failure,
    load,
    save,
    refresh,
    contribute,
    credit,
    notice,
    discard,
    prepare,
    send,
    preview,
    receipt,
    sessionReceipts,
    consent,
    setConsent,
    participation,
  };
}
const Context = createContext<ReturnType<typeof useReportsState> | undefined>(
  undefined,
);
export function ReportsProvider({ children }: { children: ReactNode }) {
  const state = useReportsState();
  return (
    <Context.Provider value={state}>
      {children}
      <CloseUnsavedReportDialog
        open={state.closeConfirmation}
        disabled={state.busy}
        onCancel={state.cancelCloseWithoutSave}
        onConfirm={state.confirmCloseWithoutSave}
      />
    </Context.Provider>
  );
}
export function useReports() {
  const state = useContext(Context);
  if (!state) throw new Error("ReportsProvider missing");
  return state;
}
