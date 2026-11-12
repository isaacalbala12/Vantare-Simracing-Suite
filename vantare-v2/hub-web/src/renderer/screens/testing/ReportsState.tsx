import { useQuery } from "@tanstack/react-query";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  type HostError,
  type LegacyMigration,
  type Reply,
  type ReportFields,
  type ReportPreviewView,
  type ReportReceiptView,
  type ReportScreenshot,
  type Request,
  reportAutosaveMs,
  reportModules,
  type TestingView,
} from "../../../contract/generated/contract";
import { isReportFields } from "../../../contract/testing-validation";
import { useAccountSession } from "../../app/AccountSession";
import { coreKey, offline, useHost } from "../../app/Host";
import { HostFailure } from "../../bridge/client";
import type { CloseDraftSave } from "../../bridge/report-close";
import {
  CloseReportSaveFailureDialog,
  CloseUnsavedReportDialog,
} from "../../ui/DiscardReportDialog";
import { testingText as text } from "./es";
import { reportSuggestion, withReportKind } from "./report-kind";
import { testingRequest } from "./TestingRequests";
import { useTriageState } from "./TriageState";

const empty = (): ReportFields => ({
  module: reportModules[0][0],
  actionText: "",
  expectedText: "",
  observedText: "",
  contextText: "",
});
function useReportsState() {
  const { client } = useHost();
  const accountSession = useAccountSession();
  const session = useSyncExternalStore(
    accountSession.subscribe,
    accountSession.getSnapshot,
  );
  const observedGeneration = useRef(session.generation);
  const clearTriage = useRef<(() => void) | undefined>(undefined);
  const triageHasText = useRef<(() => boolean) | undefined>(undefined);
  const [sessionDiscarded, setSessionDiscarded] = useState(false);
  const dismissSessionDiscarded = useCallback(
    () => setSessionDiscarded(false),
    [],
  );

  const { data: core = offline } = useQuery({
    queryKey: coreKey,
    queryFn: async () => offline,
    enabled: false,
  });
  const available =
    session.confirmed &&
    core.access.verified &&
    !core.access.blocked &&
    core.services === "connected";
  const [fields, setFields] = useState(empty);
  const [saved, setSaved] = useState(JSON.stringify(fields));
  const [loaded, setLoaded] = useState(false);
  const [draftExists, setDraftExists] = useState(false);
  const [screenshots, setScreenshots] = useState<ReportScreenshot[]>([]);
  const removingScreenshot = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [failure, setFailure] = useState<HostError["kind"]>();
  const [preview, setPreview] = useState<ReportPreviewView>();
  const [receipt, setReceipt] = useState<ReportReceiptView>();
  const [sessionReceipts, setSessionReceipts] = useState<
    { value: ReportReceiptView; title: string; module: string }[]
  >([]);
  const [participationLoaded, setParticipationLoaded] = useState(false);
  const [participation, setParticipation] = useState<TestingView>({
    reports: [],
    questionnaires: [],
  });
  const [legacy, setLegacy] = useState<LegacyMigration>("none");
  const [consent, setConsent] = useState(false);
  const [localNotes, setLocalNotes] = useState({ title: "", body: "" });
  const [answerDraft, setAnswerDraft] = useState<{
    id?: string;
    score: number;
    note: string;
  }>({ score: 3, note: "" });
  const answering = useRef(false);
  const failedRequest = useRef<
    Exclude<Request, { method: "window.close" }> | undefined
  >(undefined);
  const sending = useRef(false);
  const closePermit = useRef<{ epoch: number; fields: string } | undefined>(
    undefined,
  );
  const [closeBlocked, setCloseBlocked] = useState(false);
  const [closeConfirmation, setCloseConfirmation] = useState(false);
  const [closeSaveFailed, setCloseSaveFailed] = useState(false);
  const closeEpoch = useRef<number | undefined>(undefined);
  const state = useRef({
    fields,
    saved,
    loaded,
    available,
    localNotes,
    answerDraft,
  });
  state.current = { fields, saved, loaded, available, localNotes, answerDraft };
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
    if (JSON.stringify(state.current.fields) !== state.current.saved) return;
    const reply = await request({ method: "draft.load" });
    if (reply.method !== "draft.load")
      throw new Error("unexpected report reply");
    setPreview(undefined);
    setConsent(false);
    setFields(reply.value.fields);
    setSaved(JSON.stringify(reply.value.fields));
    setLoaded(true);
    setScreenshots(reply.value.screenshots);
    setDraftExists(reply.value.exists);
    setMessage(reply.value.message);
    setLegacy(reply.value.legacy);
  }
  async function saveWith(
    closeSave?: CloseDraftSave,
    closeSignal?: AbortSignal,
  ) {
    const epoch = generation.current;
    const sessionSignal = cancellation.current.signal;
    if (!state.current.loaded) return;
    const snapshot = JSON.stringify(state.current.fields);
    if (snapshot === state.current.saved) return;
    const fields = structuredClone(state.current.fields);
    const contextText = withReportKind(
      fields.contextText,
      reportSuggestion(fields.contextText),
    );
    if (contextText === undefined) {
      setError(true);
      setFailure("rejected");
      throw new HostFailure({ kind: "rejected" });
    }
    fields.contextText = contextText;
    if (JSON.stringify(fields) === state.current.saved) return;
    if (!isReportFields(fields)) {
      setError(true);
      setFailure("rejected");
      throw new HostFailure({ kind: "rejected" });
    }
    let reply: Reply;
    if (closeSave) {
      if (
        !state.current.available ||
        closeSignal?.aborted ||
        sessionSignal.aborted
      )
        throw new HostFailure({ kind: "coreUnavailable" });
      setBusy(true);
      try {
        reply = await closeSave(fields, sessionSignal);
      } finally {
        if (epoch === generation.current) setBusy(false);
      }
    } else reply = await request({ method: "draft.save", fields });
    if (
      epoch !== generation.current ||
      closeSignal?.aborted ||
      sessionSignal.aborted
    )
      throw new HostFailure({ kind: "coreUnavailable" });
    if (reply.method !== "draft.save")
      throw new Error("unexpected report reply");
    setScreenshots(reply.value.screenshots);
    setDraftExists(reply.value.exists);
    setMessage(reply.value.message);
    setLegacy(reply.value.legacy);
    if (JSON.stringify(state.current.fields) === snapshot) {
      state.current.fields = fields;
      setFields(fields);
    }
    state.current.saved = JSON.stringify(fields);
    setSaved(state.current.saved);
    setPreview(undefined);
    setConsent(false);
  }
  const save = () => saveWith();
  const saveCurrent = useRef(saveWith);
  saveCurrent.current = saveWith;
  useEffect(() => {
    if (!loaded || !dirty || busy || error || !available) return;
    const snapshot = JSON.stringify(fields);
    const epoch = generation.current;
    const timer = setTimeout(() => {
      if (JSON.stringify(state.current.fields) !== snapshot) return;
      void saveCurrent.current().catch(() => {
        if (epoch === generation.current) setMessage(text.autosaveFailed);
      });
    }, reportAutosaveMs);
    return () => clearTimeout(timer);
  }, [loaded, dirty, busy, error, available, fields]);
  useEffect(
    () =>
      client?.onCloseSettled((reason, allow) => {
        closePermit.current = undefined;
        if (allow && reason !== "window") {
          setCloseConfirmation(false);
          setCloseSaveFailed(false);
          setCloseBlocked(false);
        }
      }),
    [client],
  );
  useEffect(() => {
    if (!client) return;
    return client.setReportClosePreparation({
      async prepare(send, signal) {
        const epoch = generation.current;
        closeEpoch.current = epoch;
        const permitted = closePermit.current;
        if (
          permitted?.epoch === epoch &&
          permitted.fields === JSON.stringify(state.current.fields)
        )
          return "discard";
        const clean = () =>
          JSON.stringify(state.current.fields) === state.current.saved &&
          !state.current.localNotes.title &&
          !state.current.localNotes.body &&
          !state.current.answerDraft.note &&
          state.current.answerDraft.score === 3 &&
          !triageHasText.current?.();
        // No text to preserve: abandon only Testing's waits, not other screens.
        if (clean()) return "discard";
        const pending = inflight.current;
        if (pending) {
          const cancelled = AbortSignal.any([
            signal,
            cancellation.current.signal,
          ]);
          await new Promise<void>((resolve) => {
            const done = () => {
              cancelled.removeEventListener("abort", done);
              resolve();
            };
            if (cancelled.aborted) done();
            else {
              cancelled.addEventListener("abort", done, { once: true });
              void pending.then(done, done);
            }
          });
        }
        if (!signal.aborted && clean()) return "discard";
        if (epoch !== generation.current || signal.aborted) return false;
        await saveCurrent.current(send, signal);
        return epoch === generation.current &&
          !signal.aborted &&
          JSON.stringify(state.current.fields) === state.current.saved
          ? "saved"
          : false;
      },
      failed() {
        if (closeEpoch.current !== generation.current) return;
        setCloseBlocked(true);
        setMessage(text.closeUnsaved);
        setCloseSaveFailed(true);
      },
    });
  }, [client]);
  useEffect(() => {
    if (!client) return;
    return client.addCloseGuard((reason) => {
      if (reason !== "window") return true;
      const permitted = closePermit.current;
      closePermit.current = undefined;
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
        setCloseSaveFailed(true);
      }
      return clean;
    });
  }, [client]);
  useEffect(() => {
    const flush = () => {
      if (!state.current.available || !state.current.loaded) return;
      const epoch = generation.current;
      void saveCurrent.current().catch(() => {
        if (epoch === generation.current) setMessage(text.autosaveFailed);
      });
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
  const invalidate = useCallback(() => {
    const previous = state.current;
    if (
      JSON.stringify(previous.fields) !== previous.saved ||
      previous.localNotes.title ||
      previous.localNotes.body ||
      previous.answerDraft.note ||
      triageHasText.current?.()
    )
      setSessionDiscarded(true);
    cancellation.current.abort();
    cancellation.current = new AbortController();

    generation.current++;
    state.current = {
      fields: empty(),
      saved: JSON.stringify(empty()),
      loaded: false,
      available: false,
      localNotes: { title: "", body: "" },
      answerDraft: { score: 3, note: "" },
    };
    queue.current = Promise.resolve();
    inflight.current = undefined;
    attempt.current = undefined;
    removingScreenshot.current = false;
    clearTriage.current?.();
    setFailure(undefined);
    sending.current = false;
    answering.current = false;
    setAnswerDraft({ score: 3, note: "" });
    closePermit.current = undefined;
    setCloseBlocked(false);
    setCloseConfirmation(false);
    setCloseSaveFailed(false);
    closeEpoch.current = undefined;
    failedRequest.current = undefined;
    setBusy(false);
    setLocalNotes({ title: "", body: "" });
    setFields(empty());
    setSaved(JSON.stringify(empty()));
    setLoaded(false);
    setDraftExists(false);
    setScreenshots([]);
    setPreview(undefined);
    setReceipt(undefined);
    setConsent(false);
    setParticipation({ reports: [], questionnaires: [] });
    setParticipationLoaded(false);
    setSessionReceipts([]);
    setLegacy("none");
    setMessage("");
    setError(false);
  }, []);
  useLayoutEffect(() => {
    const observe = () => {
      const next = accountSession.getSnapshot();
      if (observedGeneration.current !== next.generation || !next.confirmed) {
        observedGeneration.current = next.generation;
        invalidate();
      }
    };
    observe();
    return accountSession.subscribe(observe);
  }, [accountSession, invalidate]);
  useLayoutEffect(() => {
    if (
      identity.current !== client ||
      !core.access.verified ||
      core.access.blocked
    ) {
      identity.current = client;
      invalidate();
    }
  }, [client, core.access.verified, core.access.blocked, invalidate]);
  useEffect(() => () => cancellation.current.abort(), []);
  function edit(patch: Partial<ReportFields>) {
    setSessionDiscarded(false);
    closePermit.current = undefined;
    attempt.current = undefined;
    failedRequest.current = undefined;
    setError(false);
    state.current.fields = { ...state.current.fields, ...patch };
    setFields(state.current.fields);
    setPreview(undefined);
    setConsent(false);
    setReceipt(undefined);
  }
  function editLocal(patch: Partial<typeof localNotes>) {
    setSessionDiscarded(false);
    state.current.localNotes = { ...state.current.localNotes, ...patch };
    setLocalNotes(state.current.localNotes);
    attempt.current = undefined;
    setConsent(false);
  }
  async function refresh() {
    const reply = await request({ method: "testing.refresh" });
    if (reply.method === "testing.refresh") {
      setParticipation(reply.value);
      setParticipationLoaded(true);
    }
  }
  function selectQuestionnaire(id: string) {
    const item = participation.questionnaires.find((item) => item.id === id);
    if (!item || !core.access.tester) return;
    setAnswerDraft({ id, score: item.score ?? 3, note: "" });
  }
  async function answer() {
    if (
      answering.current ||
      !core.access.tester ||
      !answerDraft.id ||
      !participation.questionnaires.some((item) => item.id === answerDraft.id)
    )
      return;
    answering.current = true;
    const epoch = generation.current;
    try {
      const reply = await request({
        method: "testing.answer",
        id: answerDraft.id,
        score: answerDraft.score,
      });
      if (reply.method === "testing.answer") setParticipation(reply.value);
    } finally {
      if (epoch === generation.current) answering.current = false;
    }
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
    dismissSessionDiscarded();
    setScreenshots(reply.value.screenshots);
    setDraftExists(reply.value.exists);
    setFields(reply.value.fields);
    setSaved(JSON.stringify(reply.value.fields));
    setLegacy(reply.value.legacy);
    setPreview(undefined);
    setConsent(false);
  }
  async function removeScreenshot(id: string) {
    if (
      removingScreenshot.current ||
      !screenshots.some((shot) => shot.id === id)
    )
      return;
    const epoch = generation.current;
    removingScreenshot.current = true;
    setPreview(undefined);
    setConsent(false);
    try {
      const fields = structuredClone(state.current.fields);
      if (!isReportFields(fields)) {
        setError(true);
        setFailure("rejected");
        throw new HostFailure({ kind: "rejected" });
      }
      const reply = await request({
        method: "report.removeScreenshot",
        id,
        fields,
      });
      if (reply.method !== "report.removeScreenshot")
        throw new Error("unexpected screenshot reply");
      setSaved(JSON.stringify(reply.value.fields));
      state.current.saved = JSON.stringify(reply.value.fields);
      setScreenshots(reply.value.screenshots);
      setDraftExists(reply.value.exists);
      setMessage(reply.value.message);
      setPreview(undefined);
      setConsent(false);
    } finally {
      if (epoch === generation.current) removingScreenshot.current = false;
    }
  }
  async function prepare(retry = false) {
    const epoch = generation.current;
    await save();
    if (epoch !== generation.current) throw new Error("report session changed");
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
    if (
      sending.current ||
      removingScreenshot.current ||
      !preview ||
      !consent ||
      dirty
    )
      return;
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
      setSessionReceipts((current) =>
        current.some((item) => item.value.id === reply.value.id)
          ? current.map((item) =>
              item.value.id === reply.value.id
                ? { ...item, value: reply.value }
                : item,
            )
          : [...current, { value: reply.value, title, module }],
      );
      setPreview(undefined);
      if (reply.value.draftState === "cleared") {
        setScreenshots([]);
        setDraftExists(false);
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
    setCloseSaveFailed(false);
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
      case "report.removeScreenshot":
        return removeScreenshot(failed.id);
      case "report.prepare":
        return prepare();
      case "report.retryPrepare":
        return prepare(true);
      default:
        setMessage(text.reviewAgain);
    }
  }

  const triage = useTriageState({
    session: client,
    allowed:
      session.confirmed &&
      core.access.verified &&
      !core.access.blocked &&
      core.access.tester,
    available,
    async prepare(selection) {
      const reply = await request({
        method: "triage.prepare",
        selection,
        consent: true,
      });
      if (reply.method !== "triage.prepare")
        throw new Error("unexpected triage reply");
      return reply.value;
    },
    async send(previewId) {
      const reply = await request({
        method: "triage.send",
        previewId,
        consent: true,
      });
      if (reply.method !== "triage.send")
        throw new Error("unexpected triage reply");
      setParticipation(reply.value);
      setParticipationLoaded(true);
    },
  });
  clearTriage.current = triage.reset;
  triageHasText.current = triage.hasLocalText;
  return {
    sessionDiscarded,
    dismissSessionDiscarded,
    sessionGeneration: session.generation,
    sessionConfirmed: session.confirmed,
    triage,
    access: core.access,
    closeBlocked,
    closeConfirmation,
    closeSaveFailed,
    retryCloseSave: () => {
      setCloseSaveFailed(false);
      client?.closeWindow();
    },
    dismissCloseSaveFailure: () => setCloseSaveFailed(false),
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
    draftExists,
    screenshots,
    removeScreenshot,
    available,
    busy,
    dirty,
    error,
    failure,
    load,
    save,
    refresh,
    answerDraft,
    setAnswerDraft,
    selectQuestionnaire,
    answer,
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
    participationLoaded,
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
      <CloseReportSaveFailureDialog
        open={state.closeSaveFailed}
        onRetry={state.retryCloseSave}
        onDiscard={state.confirmCloseWithoutSave}
        onDismiss={state.dismissCloseSaveFailure}
      />
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
