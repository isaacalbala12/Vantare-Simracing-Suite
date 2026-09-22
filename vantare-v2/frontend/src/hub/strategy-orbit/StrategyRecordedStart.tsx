import type { AnalysisCandidate } from "../../strategy/analysis-contract";
import { Icon } from "../../ui/orbit";
import "./strategy-recorded-entry.css";

/** The filename is only a locator. Car, track and lap count are unknown here. */
export function StrategyRecordedStart({ candidates, busy, error, onChoose, onLibrary, onManual, onResume, onSaved, onCancel, t }: {
  readonly candidates: readonly AnalysisCandidate[] | null;
  readonly busy: boolean;
  readonly error?: string;
  readonly onChoose: (candidate: AnalysisCandidate) => void;
  readonly onLibrary: () => void;
  readonly onManual: () => void;
  readonly onResume?: () => void;
  readonly onSaved?: () => void;
  readonly onCancel: () => void;
  readonly t: (key: string) => string;
}) {
  const recent = [...(candidates ?? [])].sort((a, b) => Date.parse(b.modifiedAt) - Date.parse(a.modifiedAt) || a.id.localeCompare(b.id)).slice(0, 2);
  return <section className="strategy-entry" aria-labelledby="strategy-entry-title">
    <header className="strategy-entry__heading"><div><span className="strategy-entry__micro">{t("strategy.entry.new")}</span><h2 id="strategy-entry-title">{t("strategy.entry.title")}</h2><p>{t("strategy.entry.description")}</p></div><div className="strategy-entry__head-actions">{onSaved ? <button type="button" className="orbit-btn orbit-btn--ghost" onClick={onSaved}>{t("strategy.home.saved")}</button> : null}{onResume ? <button type="button" className="orbit-btn orbit-btn--ghost" onClick={onResume}>{t("strategy.entry.resume")} ↗</button> : <Icon name="i-estrategia" size={54} />}</div></header>
    <div className="strategy-entry__choices">
      <section className="strategy-entry__telemetry" aria-labelledby="strategy-entry-telemetry">
        <header className="strategy-entry__section-head"><div><span className="strategy-entry__micro">{t("strategy.entry.fromLaps")}</span><h3 id="strategy-entry-telemetry">{t("strategy.entry.telemetry")}</h3></div><small>LMU | .duckdb</small></header>
        <div className="strategy-entry__sessions">
          {recent.map(candidate => {
            const ready = candidate.state === "ready" && !candidate.walPresent;
            return <button key={candidate.id} type="button" className="strategy-entry__session" disabled={busy || !ready} onClick={() => onChoose(candidate)} aria-label={`${t("strategy.entry.useSession")} ${candidate.displayName || t("strategy.recorded.unnamed")}`}>
              <span className="strategy-entry__poster" aria-hidden="true"><small>.DUCKDB</small><b>LMU</b><i /></span>
              <span className="strategy-entry__session-copy"><span><small>{t("strategy.entry.recordedSession")}</small><strong>{candidate.displayName || t("strategy.recorded.unnamed")}</strong><small>{ready ? t("strategy.recorded.ready") : t("strategy.recorded.waiting")}</small></span><span className="strategy-entry__open" aria-hidden="true">↗</span></span>
              <span className="strategy-entry__session-foot"><span><Icon name="i-telemetria" size={12} />{new Date(candidate.modifiedAt).toLocaleString()}</span><span>{(candidate.size / 1048576).toFixed(1)} MB</span></span>
            </button>;
          })}
          {recent.length === 0 ? <p className="strategy-entry__empty" role="status">{candidates === null ? t("strategy.entry.searching") : t("strategy.recorded.empty")}</p> : null}
        </div>
        <footer className="strategy-entry__telemetry-foot"><div><b>{t("strategy.entry.anotherSession")}</b><span>{t("strategy.entry.anotherSessionHint")}</span></div><button type="button" className="orbit-btn orbit-btn--primary" onClick={onLibrary}>{t("strategy.entry.openTelemetry")}</button></footer>
      </section>
      <section className="strategy-entry__manual" aria-labelledby="strategy-entry-manual"><div className="strategy-entry__manual-top"><span className="strategy-entry__micro">{t("strategy.entry.fromReferences")}</span><span>{t("strategy.journey.manual")}</span></div>
        <div className="strategy-entry__manual-art" aria-hidden="true"><div className="strategy-entry__ring"><Icon name="i-ajustes" size={42} /></div><i /><i /><i /></div>
        <div className="strategy-entry__manual-copy"><h3 id="strategy-entry-manual">{t("strategy.entry.manualTitle")}</h3><p>{t("strategy.entry.manualDescription")}</p><div><span>{t("strategy.entry.pace")}</span><span>{t("strategy.entry.fuel")}</span><span>{t("strategy.entry.energy")}</span></div></div>
        <button type="button" className="orbit-btn orbit-btn--ghost" disabled={busy} onClick={onManual}>{t("strategy.entry.startManual")} ↗</button><small>{t("strategy.entry.noTelemetry")}</small>
      </section>
    </div>
    {busy ? <p role="status" className="strategy-entry__status">{t("strategy.recorded.busy")} <button type="button" onClick={onCancel}>{t("strategy.recorded.cancel")}</button></p> : null}
    {error ? <p role="alert" className="strategy-entry__status">{error}</p> : null}
    <footer className="strategy-entry__foot"><span>{t("strategy.entry.rulesHint")}</span><span>{t("strategy.recorded.originals")}</span></footer>
  </section>;
}
