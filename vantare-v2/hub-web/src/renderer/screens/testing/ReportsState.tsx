import { useQuery } from "@tanstack/react-query";
import { createContext, type ReactNode, useContext, useEffect, useRef, useState } from "react";
import { reportAutosaveMs, reportModules, type ReportFields, type ReportPreviewView, type ReportReceiptView, type Request, type TestingView } from "../../../contract/generated/contract";
import { coreKey, offline, useHost } from "../../app/Host";

const empty = (): ReportFields => ({ module: reportModules[0][0], actionText: "", expectedText: "", observedText: "", contextText: "" });
function useReportsState() {
  const { client } = useHost();
  const { data: core = offline } = useQuery({ queryKey: coreKey, queryFn: async () => offline, enabled: false });
  const available = core.access.verified && !core.access.blocked && core.services === "connected";
  const [fields, setFields] = useState(empty);
  const [saved, setSaved] = useState(JSON.stringify(fields));
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [preview, setPreview] = useState<ReportPreviewView>();
  const [receipt, setReceipt] = useState<ReportReceiptView>();
  const [participation, setParticipation] = useState<TestingView>({ reports: [], questionnaires: [] });
  const [consent, setConsent] = useState(false);
  const state = useRef({ fields, saved, loaded, available });
  state.current = { fields, saved, loaded, available };
  const inflight = useRef<Promise<unknown> | undefined>(undefined);
  const attempt = useRef<string | undefined>(undefined);
  const saving = useRef(false);
  const generation = useRef(0);
  const dirty = JSON.stringify(fields) !== saved;
  async function request(request: Exclude<Request, { method: "window.close" }>) {
    if (!client || !state.current.available || saving.current) throw new Error("report unavailable");
    saving.current = true;
    setBusy(true);
    setError(false);
    const epoch = generation.current;
    try {
      const operation = client.request(request);
      inflight.current = operation;
      const reply = await operation;
      if (epoch !== generation.current) throw new Error("report session changed");
      return reply;
    } catch (error) {
      if (epoch === generation.current) setError(true);
      throw error;
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  async function load() {
    const original = JSON.stringify(state.current.fields);
    const reply = await request({ method: "draft.load" });
    if (reply.method !== "draft.load") throw new Error("unexpected report reply");
    if (JSON.stringify(state.current.fields) === original) setFields(reply.value.fields);
    setSaved(JSON.stringify(reply.value.fields));
    setLoaded(true);
  }
  async function save() {
    if (!state.current.loaded || JSON.stringify(state.current.fields) === state.current.saved) return;
    const fields = structuredClone(state.current.fields);
    const reply = await request({ method: "draft.save", fields });
    if (reply.method !== "draft.save") throw new Error("unexpected report reply");
    state.current.saved = JSON.stringify(fields);
    setSaved(state.current.saved);
    setPreview(undefined);
    setConsent(false);
  }
  const saveCurrent = useRef(save);
  saveCurrent.current = save;
  useEffect(() => {
    if (!loaded || !dirty || busy || error || !available) return;
    const timer = setTimeout(() => { void saveCurrent.current().catch(() => {}); }, reportAutosaveMs);
    return () => clearTimeout(timer);
  }, [loaded, dirty, busy, error, available, fields]);
  useEffect(() => {
    if (!client) return;
    return client.addCloseGuard(async (reason) => {
      if (reason !== "window") return true;
      try {
        await inflight.current;
        await saveCurrent.current();
        return JSON.stringify(state.current.fields) === state.current.saved;
      } catch { return false; }
    });
  }, [client]);
  useEffect(() => {
    generation.current++;
    setFields(empty()); setSaved(JSON.stringify(empty())); setLoaded(false);
    setPreview(undefined); setReceipt(undefined); setConsent(false);
    setParticipation({ reports: [], questionnaires: [] }); setError(false);
  }, [client, available]);
  function edit(patch: Partial<ReportFields>) {
    attempt.current = undefined;
    setFields(current => ({ ...current, ...patch })); setPreview(undefined); setConsent(false); setReceipt(undefined);
  }
  async function refresh() {
    const reply = await request({ method: "testing.refresh" });
    if (reply.method === "testing.refresh") setParticipation(reply.value);
  }
  async function contribute() {
    if (!consent || dirty) return;
    const id = attempt.current ?? crypto.randomUUID();
    attempt.current = id;
    setConsent(false);
    const reply = await request({ method: "testing.contribute", id, consent: true });
    if (reply.method === "testing.contribute") { setParticipation(reply.value); attempt.current = undefined; }
  }
  async function discard() {
    const reply = await request({ method: "draft.discard" });
    if (reply.method !== "draft.discard") throw new Error("unexpected report reply");
    setFields(reply.value.fields); setSaved(JSON.stringify(reply.value.fields)); setPreview(undefined); setConsent(false);
  }
  async function prepare(retry = false) {
    await save();
    const reply = await request({ method: retry ? "report.retryPrepare" : "report.prepare" });
    if (reply.method === "report.prepare" || reply.method === "report.retryPrepare") { setPreview(reply.value); setConsent(false); }
  }
  async function send() {
    if (!preview || !consent || dirty) return;
    setConsent(false);
    const reply = await request({ method: "report.send", previewId: preview.id, consent: true });
    if (reply.method !== "report.send") throw new Error("unexpected report reply");
    setReceipt(reply.value); setPreview(undefined);
    if (reply.value.draftCleared) { setFields(empty()); setSaved(JSON.stringify(empty())); }
  }
  return { fields, edit, loaded, available, busy, dirty, error, load, save, refresh, contribute, discard, prepare, send, preview, receipt, consent, setConsent, participation };
}
const Context = createContext<ReturnType<typeof useReportsState> | undefined>(undefined);
export function ReportsProvider({ children }: { children: ReactNode }) {
  return <Context.Provider value={useReportsState()}>{children}</Context.Provider>;
}
export function useReports() {
  const state = useContext(Context);
  if (!state) throw new Error("ReportsProvider missing");
  return state;
}
