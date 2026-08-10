import type { KeyboardEvent } from "react";

import {
  effectiveLapRows,
  effectiveValue,
  type StrategyLapField,
  type StrategyQuickField,
} from "../../strategy/strategy-manual-input";
import type { StrategyEditorDocument } from "../../strategy/strategy-editor";

type ManualInputPanelProps = {
  document: StrategyEditorDocument;
  mode: "quick" | "laps";
  onModeChange: (mode: "quick" | "laps") => void;
  onCorrectQuick: (field: StrategyQuickField, value: number) => boolean;
  onClearQuick: (field: StrategyQuickField) => boolean;
  onCorrectLap: (lap: number, field: StrategyLapField, value: number) => boolean;
  onClearLap: (lap: number, field: StrategyLapField) => boolean;
};

type QuickFieldDefinition = {
  field: StrategyQuickField;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
};

const QUICK_GROUPS: readonly { title: string; fields: readonly QuickFieldDefinition[] }[] = [
  {
    title: "Ritmo y desgaste",
    fields: [
      { field: "averageLapSeconds", label: "Ritmo medio", unit: "s/v", min: 0.001, max: 3600, step: 0.1 },
      { field: "tyreWearPerLapPercent", label: "Desgaste por vuelta", unit: "%/v", min: 0, max: 100, step: 0.01 },
      { field: "degradationPerLapSeconds", label: "Caída de ritmo", unit: "s/v", min: 0, max: 60, step: 0.01 },
    ],
  },
  {
    title: "Fuel",
    fields: [
      { field: "fuelCapacityLitres", label: "Capacidad Fuel", unit: "L", min: 0.001, max: 2000, step: 0.1 },
      { field: "fuelUsableLitres", label: "Fuel utilizable", unit: "L", min: 0.001, max: 2000, step: 0.1 },
      { field: "fuelStartLitres", label: "Fuel inicial", unit: "L", min: 0, max: 2000, step: 0.1 },
      { field: "fuelPerLapLitres", label: "Fuel por vuelta", unit: "L/v", min: 0.001, max: 2000, step: 0.01 },
      { field: "fuelFormationLitres", label: "Fuel formación", unit: "L", min: 0, max: 2000, step: 0.1 },
      { field: "fuelReserveLitres", label: "Reserva Fuel", unit: "L", min: 0, max: 2000, step: 0.1 },
    ],
  },
  {
    title: "Virtual Energy",
    fields: [
      { field: "virtualEnergyCapacityPercent", label: "Capacidad VE", unit: "%", min: 0.001, max: 100, step: 0.1 },
      { field: "virtualEnergyUsablePercent", label: "VE utilizable", unit: "%", min: 0.001, max: 100, step: 0.1 },
      { field: "virtualEnergyStartPercent", label: "VE inicial", unit: "%", min: 0, max: 100, step: 0.1 },
      { field: "virtualEnergyPerLapPercent", label: "VE por vuelta", unit: "%/v", min: 0.001, max: 100, step: 0.01 },
      { field: "virtualEnergyFormationPercent", label: "VE formación", unit: "%", min: 0, max: 100, step: 0.1 },
      { field: "virtualEnergyReservePercent", label: "Reserva VE", unit: "%", min: 0, max: 100, step: 0.1 },
    ],
  },
  {
    title: "Boxes y extras",
    fields: [
      { field: "pitLossPerStopSeconds", label: "Pérdida por parada", unit: "s/parada", min: 0, max: 86400, step: 0.1 },
      { field: "repairSeconds", label: "Reparaciones", unit: "s", min: 0, max: 86400, step: 0.1 },
      { field: "penaltySeconds", label: "Penalización", unit: "s", min: 0, max: 86400, step: 0.1 },
    ],
  },
];

const LAP_FIELDS: readonly (QuickFieldDefinition & { field: StrategyLapField })[] = [
  { field: "averageLapSeconds", label: "Ritmo", unit: "s", min: 0.001, max: 3600, step: 0.1 },
  { field: "fuelPerLapLitres", label: "Fuel", unit: "L", min: 0.001, max: 2000, step: 0.01 },
  { field: "virtualEnergyPerLapPercent", label: "VE", unit: "%", min: 0.001, max: 100, step: 0.01 },
  { field: "tyreWearPerLapPercent", label: "Desgaste", unit: "%", min: 0, max: 100, step: 0.01 },
];

export function StrategyManualInputPanel({
  document,
  mode,
  onModeChange,
  onCorrectQuick,
  onClearQuick,
  onCorrectLap,
  onClearLap,
}: ManualInputPanelProps) {
  return (
    <section className="strategy-panel strategy-manual-inputs" aria-label="Entrada manual">
      <header className="strategy-manual-inputs__header">
        <div><h2>Entrada manual</h2><span>Correcciones no destructivas</span></div>
        <div className="strategy-manual-inputs__modes" role="group" aria-label="Detalle de entrada manual">
          <button type="button" aria-pressed={mode === "quick"} onClick={() => onModeChange("quick")}>Entrada rápida</button>
          <button type="button" aria-pressed={mode === "laps"} onClick={() => onModeChange("laps")}>Tabla por vuelta</button>
        </div>
      </header>
      <p className="strategy-manual-inputs__help">
        El valor original se conserva. Cada cambio crea una corrección que puede deshacerse desde la barra inferior.
      </p>
      {mode === "quick" ? (
        <QuickInputs document={document} onCorrect={onCorrectQuick} onClear={onClearQuick} />
      ) : (
        <LapInputs document={document} onCorrect={onCorrectLap} onClear={onClearLap} />
      )}
    </section>
  );
}

function QuickInputs({ document, onCorrect, onClear }: {
  document: StrategyEditorDocument;
  onCorrect: (field: StrategyQuickField, value: number) => boolean;
  onClear: (field: StrategyQuickField) => boolean;
}) {
  return <div className="strategy-manual-inputs__quick">
    {QUICK_GROUPS.map((group) => <fieldset key={group.title}>
      <legend>{group.title}</legend>
      {group.fields.map((definition) => {
        const source = document.manualInputs.quick[definition.field];
        return <label key={definition.field}>
          <span>{definition.label}</span>
          <div>
            <input
              key={`${source.original}:${source.correction?.correctedAt ?? "original"}`}
              type="number"
              aria-label={definition.label}
              defaultValue={effectiveValue(source)}
              min={definition.min}
              max={definition.max}
              step={definition.step}
              onKeyDown={blurOnEnter}
              onBlur={(event) => commitNumber(event.currentTarget, effectiveValue(source), (value) => onCorrect(definition.field, value))}
            />
            <b>{definition.unit}</b>
          </div>
          <small>Rango {definition.min}–{definition.max} {definition.unit}</small>
          {source.correction && <em data-testid={`strategy-manual-original-${definition.field}`}>
            Original {source.original} {definition.unit}
            <button type="button" onClick={() => onClear(definition.field)} aria-label={`Restaurar ${definition.label}`}>↺</button>
          </em>}
        </label>;
      })}
    </fieldset>)}
  </div>;
}

function LapInputs({ document, onCorrect, onClear }: {
  document: StrategyEditorDocument;
  onCorrect: (lap: number, field: StrategyLapField, value: number) => boolean;
  onClear: (lap: number, field: StrategyLapField) => boolean;
}) {
  const rows = effectiveLapRows(document);
  return <div className="strategy-manual-inputs__table-wrap">
    <table className="strategy-manual-inputs__table">
      <caption>Valores efectivos por vuelta; los originales nunca se sobrescriben.</caption>
      <thead><tr><th>Vuelta</th>{LAP_FIELDS.map((field) => <th key={field.field}>{field.label}<small>{field.unit}</small></th>)}</tr></thead>
      <tbody>{rows.map((row) => <tr key={row.lapNumber}>
        <th scope="row">{row.lapNumber}</th>
        {LAP_FIELDS.map((definition) => {
          const source = row[definition.field];
          return <td key={definition.field}>
            <input
              key={`${source.original}:${source.value}:${source.reason ?? "original"}`}
              type="number"
              aria-label={`${definition.label} vuelta ${row.lapNumber}`}
              defaultValue={source.value}
              min={definition.min}
              max={definition.max}
              step={definition.step}
              onKeyDown={blurOnEnter}
              onBlur={(event) => commitNumber(event.currentTarget, source.value, (value) => onCorrect(row.lapNumber, definition.field, value))}
            />
            <span
              className={source.corrected ? "is-corrected" : ""}
              data-testid={`strategy-lap-source-${row.lapNumber}-${definition.field}`}
            >{source.corrected ? `Corregido · original ${source.original}` : "Original"}</span>
            {source.corrected && <button type="button" onClick={() => onClear(row.lapNumber, definition.field)} aria-label={`Restaurar ${definition.label} de la vuelta ${row.lapNumber}`}>↺</button>}
          </td>;
        })}
      </tr>)}</tbody>
    </table>
  </div>;
}

function commitNumber(input: HTMLInputElement, current: number, commit: (value: number) => boolean) {
  const value = Number(input.value);
  if (!Number.isFinite(value)) {
    input.value = String(current);
    return;
  }
  if (value !== current && !commit(value)) input.value = String(current);
}

function blurOnEnter(event: KeyboardEvent<HTMLInputElement>) {
  if (event.key === "Enter") event.currentTarget.blur();
}
