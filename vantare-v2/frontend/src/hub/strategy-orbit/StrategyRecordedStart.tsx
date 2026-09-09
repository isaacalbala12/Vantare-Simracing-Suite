import { Icon } from "../../ui/orbit";
import type { RecordedWizardDraft } from "./strategy-recorded-wizard";
import "./strategy-recorded-choices.css";

export function StrategyRecordedStart({ mode, onMode, t }: {
  readonly mode: RecordedWizardDraft["mode"];
  readonly onMode: (mode: RecordedWizardDraft["mode"]) => void;
  readonly t: (key: string) => string;
}) {
  return <div className="strategy-recorded-choices" role="group" aria-label={t("strategy.journey.start.title")}>
    {(["manual", "automatic"] as const).map(value => <button
      type="button" key={value} className="strategy-recorded-choice"
      aria-pressed={mode === value} onClick={() => onMode(value)}
    >
      <span className="strategy-recorded-choice__check" aria-hidden="true">{mode === value ? "✓" : "○"}</span>
      <Icon name={value === "manual" ? "i-estrategia" : "i-comando"} size={34} />
      <span><strong>{t(`strategy.journey.${value}`)}</strong><small>{t(`strategy.journey.${value}.description`)}</small></span>
    </button>)}
  </div>;
}
