import { lmuVirtualEnergyCapability, type RecordedWizardDraft } from "./strategy-recorded-wizard";

/** Both manual entry points edit the same draft, without a telemetry source. */
export function StrategyManualReferences({ draft, onChange, busy, t }: {
  readonly draft: RecordedWizardDraft;
  readonly onChange: (draft: RecordedWizardDraft) => void;
  readonly busy: boolean;
  readonly t: (key: string) => string;
}) {
  const showEnergy = lmuVirtualEnergyCapability(draft.combination) !== false && draft.virtualEnergy?.applicability === "applicable";
  const fields = (["paceSeconds", "fuelLitersPerLap", "virtualEnergyPercentPerLap"] as const)
    .filter(field => field !== "virtualEnergyPercentPerLap" || showEnergy);
  return <section className="strategy-preparation__manual-inputs" aria-label={t("strategy.entry.ownReferences")}>
    <header><h3>{t("strategy.entry.ownReferences")}</h3><span>{t("strategy.entry.estimated")}</span></header>
    <fieldset disabled={busy}><div>{fields.map(field => <label key={field}><span>{t(`strategy.entry.input.${field}`)}</span>
      <input type="number" inputMode="decimal" min={field === "virtualEnergyPercentPerLap" ? 0 : 0.001} step="any" value={draft.manualInputs?.[field] ?? ""} onChange={event => onChange({ ...draft, manualInputs: { ...draft.manualInputs, [field]: event.target.value === "" ? undefined : Number(event.target.value) } })} />
    </label>)}</div></fieldset>
    <p>{t("strategy.entry.estimatedHint")}</p>
  </section>;
}
