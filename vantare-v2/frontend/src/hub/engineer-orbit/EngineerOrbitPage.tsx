import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "../../i18n/I18nProvider";
import { wailsEngineerBridge, type EngineerBridge } from "./engineer-orbit-bridge";
import { deliveriesFor, downloadDiagnostics, ENGINEER_CATEGORIES, ENGINEER_OUTPUT_MODES, prepareExport, SENSITIVITIES } from "./engineer-orbit-model";
import type { AudioTestResult, EngineerChange, EngineerDiagnostics } from "./engineer-orbit-types";
import type { EngineerOutputMode } from "../../engineer/engineer-types";
import "../../styles/orbit-engineer.css";

const copyDiagnostics = (payload: string) => navigator.clipboard.writeText(payload);
type Props = { bridge?: EngineerBridge; download?: (payload: string) => void; copy?: (payload: string) => Promise<void> };

export function EngineerOrbitPage({ bridge = wailsEngineerBridge, download = downloadDiagnostics, copy = copyDiagnostics }: Props) {
  const { t } = useI18n();
  const [snapshot, setSnapshot] = useState<EngineerDiagnostics | null>(null);
  const [stale, setStale] = useState(true);
  const [pending, setPending] = useState(false);
  const [actionResult, setActionResult] = useState("");
  const [audioResult, setAudioResult] = useState<AudioTestResult | null>(null);
  const [audioPending, setAudioPending] = useState(false);
  const [cycle, setCycle] = useState<"current" | "all">("current");
  const [family, setFamily] = useState("all");
  const [preview, setPreview] = useState<string | null>(null);
  const [exportResult, setExportResult] = useState("");
  const mounted = useRef(false);
  const receivedAt = useRef(0);
  const accept = useCallback((next: EngineerDiagnostics) => {
    if (!mounted.current) return;
    receivedAt.current = Date.now(); setStale(false);
    setSnapshot((current) => current && current.capturedAt > next.capturedAt ? current : next);
  }, []);
  useEffect(() => {
    mounted.current = true;
    const off = bridge.subscribe(accept);
    const refresh = () => {
      setStale(Date.now() - receivedAt.current > 4000);
      try { bridge.refresh(); } catch { setStale(true); }
    };
    refresh();
    const timer = setInterval(refresh, 1000);
    return () => { mounted.current = false; off(); clearInterval(timer); };
  }, [bridge, accept]);

  async function change(value: EngineerChange) {
    setPending(true); setActionResult("");
    try {
      const result = await bridge.change(value);
      if (!mounted.current) return;
      accept(result.diagnostics); setActionResult(result.outcome);
    } catch { if (mounted.current) setActionResult("timeout"); }
    finally { if (mounted.current) setPending(false); }
  }
  async function testAudio(kind: "tone" | "cached") {
    setAudioPending(true); setAudioResult(null);
    try { const result = await bridge.testAudio(kind); if (mounted.current) setAudioResult(result); }
    catch { if (mounted.current) setAudioResult({ kind, outcome: "timeout", finishedAt: Date.now() }); }
    finally { if (mounted.current) setAudioPending(false); }
  }
  async function exportReport(kind: "copy" | "download") {
    if (!preview) return;
    try {
      if (kind === "copy") await copy(preview); else download(preview);
      if (mounted.current) setExportResult(kind === "copy" ? "copied" : "downloaded");
    } catch { if (mounted.current) setExportResult("export_failed"); }
  }
  const label = (key: string) => t(`engineer.test.${key}`);
  const status = snapshot?.status;
  const disabled = !snapshot || stale || pending;
  const rows = snapshot ? deliveriesFor(snapshot, cycle, family) : [];
  const testDisabled = disabled || !snapshot?.running || !snapshot.playerAvailable || status?.enabled || audioPending || snapshot.audioTestActive;
  const modeLabel = (mode: string) => t(`engineer.outputs.${mode}Hint`);
  const valueLabel = (value: string) => {
    const key = `engineer.test.value.${value}`;
    const translated = t(key);
    return translated === key ? value : translated;
  };
  const time = (value: number) => new Date(value).toLocaleTimeString();

  return <main className="oe-page engineer-test">
    <header><h1>{t("engineer.title")}</h1><p>{label("intro")}</p></header>
    <section aria-labelledby="engineer-status-heading">
      <h2 id="engineer-status-heading">{label("status")}</h2>
      <p role="status">{!snapshot ? label("waiting") : stale ? label("stale") : label("fresh")}</p>
      {status?.lastError && <p role="alert" className="engineer-test-error">{label("runtime_error")}</p>}
      {snapshot && <dl className="engineer-test-facts">
        <div><dt>{label("service")}</dt><dd>{label(snapshot.running ? "running" : "stopped")}</dd></div>
        <div><dt>{label("connection")}</dt><dd>{label(status?.connected ? "connected" : "disconnected")}</dd></div>
        <div><dt>{t("engineer.modules.spotter")}</dt><dd>{valueLabel(status!.spotterAvailability.state)} {status!.spotterAvailability.reason && `· ${valueLabel(status!.spotterAvailability.reason)}`}</dd></div>
        <div><dt>{label("player")}</dt><dd>{label(snapshot.playerAvailable ? "available" : "unavailable")}</dd></div>
        <div><dt>{label("locale")}</dt><dd>{snapshot.locale} · {snapshot.spotterVoice || "—"} / {snapshot.engineerVoice || "—"}</dd></div>
        <div><dt>{label("cycle")}</dt><dd>{status!.presentationLifecycle} · {time(snapshot.capturedAt)}</dd></div>
      </dl>}
      <p>{label("cacheNote")}</p>
      {snapshot && !snapshot.visualPresentationEnabled && <p role="alert">{label("visualGated")}</p>}
    </section>

    <section aria-labelledby="engineer-controls-heading">
      <h2 id="engineer-controls-heading">{label("controls")}</h2>
      <fieldset disabled={disabled}>
        <legend>{label("modules")}</legend>
        <div className="engineer-test-controls">
          <label><input type="checkbox" checked={status?.enabled ?? false} onChange={(event) => void change({action:"enabled",enabled:event.target.checked})}/>{t("engineer.modules.engineer")}</label>
          <label><input type="checkbox" checked={status?.spotterEnabled ?? false} onChange={(event) => void change({action:"spotter",enabled:event.target.checked})}/>{t("engineer.modules.spotter")}</label>
          <label><input type="checkbox" checked={snapshot?.subtitlesPreference ?? false} onChange={(event) => void change({action:"subtitles",enabled:event.target.checked})}/>{t("engineer.modules.subtitles")}</label>
          <label>{t("engineer.voice.sensitivity")}<select aria-label={t("engineer.voice.sensitivity")} value={status?.sensitivity ?? "normal"} onChange={(event) => void change({action:"sensitivity",value:event.target.value})}>{SENSITIVITIES.map((value) => <option key={value} value={value}>{t(`engineer.voice.${value}`)}</option>)}</select></label>
        </div>
        <div className="engineer-test-outputs">{ENGINEER_CATEGORIES.map(([id,key]) => <label key={id}>{t(`engineer.outputs.${key}`)}<select aria-label={t(`engineer.outputs.${key}`)} value={status?.outputModes[id] ?? "both"} onChange={(event) => void change({action:"output",category:id,value:event.target.value as EngineerOutputMode})}>{ENGINEER_OUTPUT_MODES.map((mode) => <option key={mode} value={mode}>{modeLabel(mode)}</option>)}</select></label>)}</div>
      </fieldset>
      <p>{label("voiceNote")}</p>
      <p role="status">{pending ? label("saving") : actionResult ? label(actionResult) : label("confirmedOnly")}</p>
    </section>

    <section aria-labelledby="engineer-audio-heading">
      <h2 id="engineer-audio-heading">{label("audio")}</h2>
      <p>{label("audioHint")}</p>
      <div className="engineer-test-actions">
        <button disabled={Boolean(testDisabled)} onClick={() => void testAudio("tone")}>{label("testTone")}</button>
        <button disabled={Boolean(testDisabled)} onClick={() => void testAudio("cached")}>{label("testCached")}</button>
      </div>
      {(audioPending || snapshot?.audioTestActive) && <p role="status">{label("testing")}</p>}
      {audioResult && <p role="status">{label(`audioResult.${audioResult.outcome}`)} {audioResult.text}</p>}
      <p>{label("hearingNote")}</p>
    </section>

    <section aria-labelledby="engineer-history-heading">
      <h2 id="engineer-history-heading">{label("history")}</h2>
      <p>{label("historyHint")}</p>
      {snapshot && !snapshot.radioHistoryAvailable && <p role="alert">{label("legacyHistory")}</p>}
      <div className="engineer-test-actions">
        <label>{label("cycles")}<select aria-label={label("cycles")} value={cycle} onChange={(event) => setCycle(event.target.value as "current"|"all")}><option value="current">{label("current")}</option><option value="all">{label("allCycles")}</option></select></label>
        <label>{label("category")}<select aria-label={label("category")} value={family} onChange={(event) => setFamily(event.target.value)}><option value="all">{t("engineer.radio.all")}</option>{ENGINEER_CATEGORIES.map(([id,key])=><option key={id} value={id}>{t(`engineer.outputs.${key}`)}</option>)}</select></label>
        <button disabled={!snapshot} onClick={() => { if (snapshot) setPreview(prepareExport(snapshot)); setExportResult(""); }}>{label("prepare")}</button>
      </div>
      {rows.length === 0 ? <p>{label("empty")}</p> : <div className="engineer-test-table"><table>
        <thead><tr>{["when","message","configured","visual","audioColumn","result"].map((key)=><th key={key} scope="col">{label(key)}</th>)}</tr></thead>
        <tbody>{rows.map((item)=><tr key={item.id}>
          <td>{time(item.selectedAt)}<small>{label("cycle")} {item.lifecycle}</small></td>
          <td>{item.text || item.intent}<small>{item.family} · {item.intent}</small></td>
          <td>{modeLabel(item.mode)}</td><td>{label(item.visual ? "shown" : "notShown")}</td>
          <td>{valueLabel(item.audio)}</td><td>{valueLabel(item.state)}<small>{item.reason ? valueLabel(item.reason) : ""}</small><small>{Math.max(0,item.updatedAt-item.selectedAt)} ms</small></td>
        </tr>)}</tbody>
      </table></div>}
      {snapshot && <details><summary>{label("counters")}</summary><p>{label("counterHint")}</p><dl className="engineer-test-facts">
        {Object.entries(snapshot.health.policy).map(([key,value])=><div key={key}><dt>{valueLabel(key)}</dt><dd>{value}</dd></div>)}
        <div><dt>{label("latency")}</dt><dd>{snapshot.health.radioDelivery.p95MS} ms · {snapshot.health.radioDelivery.samples} {label("samples")}</dd></div>
        <div><dt>{label("drops")}</dt><dd>{snapshot.health.dropCount}</dd></div>
      </dl></details>}
    </section>
    {preview && <section aria-labelledby="engineer-export-heading">
      <h2 id="engineer-export-heading">{label("preview")}</h2><p>{label("exportHint")}</p>
      <pre aria-label={label("payload")}>{preview}</pre>
      <div className="engineer-test-actions"><button onClick={() => void exportReport("download")}>{label("download")}</button><button onClick={() => void exportReport("copy")}>{label("copy")}</button><button onClick={()=>setPreview(null)}>{label("close")}</button></div>
      {exportResult && <p role="status">{label(exportResult)}</p>}
    </section>}
  </main>;
}
