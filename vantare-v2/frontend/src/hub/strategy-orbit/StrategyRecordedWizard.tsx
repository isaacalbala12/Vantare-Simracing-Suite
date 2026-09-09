import { useState, type ReactNode } from "react";
import type { Calendar } from "../../calendar/calendar-types";
import { formatMessage } from "../orbit/format-message";
import { StrategyRecordedFrame } from "./StrategyRecordedFrame";
import { StrategyRecordedStart } from "./StrategyRecordedStart";
import { StrategyRecordedCombination } from "./StrategyRecordedCombination";
import { StrategyRecordedRules } from "./StrategyRecordedRules";
import { StrategyRecordedDrivers } from "./StrategyRecordedDrivers";
import { RECORDED_WIZARD_STEPS, moveRecordedWizard, selectRecordedCalendar, selectRecordedCombination, snapshotRecordedCalendar, type RecordedCombination, type RecordedWizardDraft } from "./strategy-recorded-wizard";
import { recordedWizardErrors } from "./strategy-recorded-validation";

export function StrategyRecordedWizard({ draft, onChange, catalog, catalogState, calendar, onDiscover, sessions, onOpenDraft, onExit, busy = false, canOpenDraft = true, openDraftHint, onRetryOpenDraft, error, t }: {
  readonly draft: RecordedWizardDraft; readonly onChange: (draft: RecordedWizardDraft) => void;
  readonly catalog: readonly RecordedCombination[]; readonly catalogState: "loading" | "available" | "unavailable";
  readonly calendar: Calendar | null; readonly onDiscover: () => void; readonly sessions: ReactNode;
  readonly onOpenDraft: () => void; readonly onExit: () => void; readonly busy?: boolean; readonly error?: string; readonly t: (key: string) => string;
  readonly canOpenDraft?: boolean; readonly openDraftHint?: string; readonly onRetryOpenDraft?: () => void;
}) {
  const [errors, setErrors] = useState<string[]>([]);
  const index = RECORDED_WIZARD_STEPS.indexOf(draft.step);
  const change = (next: RecordedWizardDraft) => { setErrors([]); onChange(next); };
  const advance = () => {
    if (draft.step === "sessions" && !canOpenDraft) return;
    const invalid = recordedWizardErrors(draft, draft.step);
    setErrors(invalid);
    if (invalid.length > 0) return;
    if (draft.step === "sessions") { onOpenDraft(); return; }
    change(moveRecordedWizard(draft, RECORDED_WIZARD_STEPS[index + 1]));
    if (draft.step === "start" && draft.mode === "automatic") onDiscover();
  };
  return <form className="strategy-recorded-wizard" onSubmit={event => { event.preventDefault(); advance(); }}>
    <fieldset disabled={busy}>
      <StrategyRecordedFrame steps={RECORDED_WIZARD_STEPS.map((id, position) => ({ id, label: t(`strategy.journey.step.${id}`), available: position <= index }))}
        currentStep={draft.step} onStep={id => { const step = RECORDED_WIZARD_STEPS.find(item => item === id); if (step) change(moveRecordedWizard(draft, step)); }}
        title={t(`strategy.journey.${draft.step}.title`)} description={t(`strategy.journey.${draft.step}.description`)}
        preservationLabel={t("strategy.recorded.originals")} progressLabel={formatMessage(t("strategy.journey.progress"), { step: index + 1, total: RECORDED_WIZARD_STEPS.length })}
        actions={<>
          <button type="button" className="orbit-btn orbit-btn--ghost" onClick={() => index === 0 ? onExit() : change(moveRecordedWizard(draft, RECORDED_WIZARD_STEPS[index - 1]))}>← {t("strategy.journey.back")}</button>
          <button type="submit" className="orbit-btn orbit-btn--primary" disabled={draft.step === "sessions" && !canOpenDraft}>{t(busy ? "strategy.journey.opening" : draft.step === "sessions" ? "strategy.journey.openDraft" : "strategy.journey.next")} →</button>
        </>}
      >
        {draft.step === "start" ? <StrategyRecordedStart mode={draft.mode} onMode={mode => change({ ...draft, mode })} t={t} /> : null}
        {draft.step === "combination" ? <StrategyRecordedCombination draft={draft} catalog={catalog} catalogState={catalogState} calendar={calendar} onDiscover={onDiscover} t={t}
          onCombination={id => change(selectRecordedCombination(draft, id, catalog))}
          onCalendar={id => {
            if (id && !calendar) return;
            const snapshot = id && calendar ? snapshotRecordedCalendar(calendar, id, "lmu", new Date().toISOString()) : undefined;
            change(selectRecordedCalendar(draft, snapshot, catalog));
          }} /> : null}
        {draft.step === "rules" ? <StrategyRecordedRules draft={draft} onChange={change} t={t} /> : null}
        {draft.step === "drivers" ? <StrategyRecordedDrivers drivers={draft.drivers} onChange={drivers => change({ ...draft, drivers })} onAdd={() => change({ ...draft, drivers: [...draft.drivers, { id: globalThis.crypto.randomUUID(), name: "" }] })} t={t} /> : null}
        {draft.step === "sessions" ? sessions : null}
        {draft.step === "sessions" && !canOpenDraft && openDraftHint ? <div role="status" className="strategy-recorded-wizard__errors"><p>{openDraftHint}</p>{onRetryOpenDraft ? <button type="button" className="orbit-btn orbit-btn--ghost" onClick={onRetryOpenDraft}>{t("strategy.workspace.refresh")}</button> : null}</div> : null}
        {errors.length > 0 ? <div className="strategy-recorded-wizard__errors" role="alert">{errors.map(code => <p key={code}>{t(`strategy.journey.error.${code}`)}</p>)}</div> : null}
        {error ? <p className="strategy-recorded-wizard__errors" role="alert">{error}</p> : null}
      </StrategyRecordedFrame>
    </fieldset>
  </form>;
}
