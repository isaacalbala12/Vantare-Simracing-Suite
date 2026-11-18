import { useCallback, useId, useState } from "react";
import type { StrategyComputeForm } from "../../../contract/generated/strategy";
import { strategyLimits } from "../../../contract/generated/strategy";
import { Icon } from "../../assets/icons/Icon";
import { strategy as t } from "../../i18n/strategy";

// Fields with a control. `team` and `variantMode` travel with the document but
// have no control: the manual calculation only supports the dry mode.
export type Field = keyof typeof t.labels;
type Values = Record<Field | "team" | "variantMode", string>;
type Errors = Partial<Record<Field, string>>;

export const initial: Values = {
  track: "",
  class: "",
  name: "",
  startAt: "",
  durationMinutes: "",
  raceLaps: "",
  formationSeconds: "0",
  fuelCapacityLiters: "",
  fuelPerLapLiters: "",
  reserveLaps: "0",
  veCapacityPercent: "0",
  vePerLapPercent: "0",
  tyreLifeLaps: "0",
  degradationSeconds: "0",
  pitTransitSeconds: "0",
  refuelRate: "4",
  veRate: "2.5",
  tyreServiceSeconds: "0",
  fuelStep: "1",
  veStep: "1",
  driverName: "",
  driverInitials: "",
  basePaceSeconds: "",
  variantName: "",
  variantNote: "",
  team: "",
  variantMode: "dry",
  serviceMode: "parallel",
};
const units: Partial<Record<Field, string>> = {
  durationMinutes: "min",
  raceLaps: "vueltas",
  formationSeconds: "s",
  fuelCapacityLiters: "L",
  fuelPerLapLiters: "L",
  reserveLaps: "vueltas",
  veCapacityPercent: "%",
  vePerLapPercent: "%",
  tyreLifeLaps: "vueltas",
  degradationSeconds: "s/vuelta",
  pitTransitSeconds: "s",
  refuelRate: "L/s",
  veRate: "%/s",
  tyreServiceSeconds: "s",
  fuelStep: "L",
  veStep: "%",
  basePaceSeconds: "s",
};
const positive = new Set<Field>([
  "durationMinutes",
  "raceLaps",
  "fuelCapacityLiters",
  "fuelPerLapLiters",
  "basePaceSeconds",
  "fuelStep",
  "veStep",
]);
const integers = new Set<Field>([
  "durationMinutes",
  "raceLaps",
  "tyreLifeLaps",
]);
const lapCounts = new Set<Field>(["raceLaps", "tyreLifeLaps"]);
const fractions = new Set<Field>([
  "veCapacityPercent",
  "vePerLapPercent",
  "veStep",
]);
const serviceModes = ["parallel", "sequential"] as const;

export const decimal = (value: string) => value.trim().replace(",", ".");

function validation(field: Field, value: string): string | undefined {
  const text = value.trim();
  if (field === "serviceMode")
    return (serviceModes as readonly string[]).includes(value)
      ? undefined
      : t.required;
  if (field === "startAt") {
    if (text && !Number.isFinite(Date.parse(text))) return t.date;
    return;
  }
  if (!units[field]) {
    if (!text && field !== "variantNote") return t.required;
    if (new TextEncoder().encode(text).length > strategyLimits.text)
      return t.length;
    return;
  }
  const normalized = decimal(text);
  const number = Number(normalized);
  if (
    integers.has(field) &&
    positive.has(field) &&
    (!/^\d+$/.test(normalized) || number < 1)
  )
    return t.integer;
  if (positive.has(field) && number <= 0) return t.positive;
  if (
    !/^\d+(?:\.\d+)?$/.test(normalized) ||
    !Number.isFinite(number) ||
    (integers.has(field) &&
      (!/^\d+$/.test(normalized) || number > 0xffffffff)) ||
    (lapCounts.has(field) && number > 100_000) ||
    (fractions.has(field) && number > 100)
  )
    return t.range;
}

export function toForm(v: Values): StrategyComputeForm {
  return {
    fields: {
      name: v.name.trim(),
      track: v.track.trim(),
      class: v.class.trim(),
      durationMinutes: decimal(v.durationMinutes),
      fuelCapacityLiters: decimal(v.fuelCapacityLiters),
      pitTransitSeconds: decimal(v.pitTransitSeconds),
      startAt: v.startAt.trim() ? new Date(v.startAt.trim()).toISOString() : "",
      driverName: v.driverName.trim(),
      driverInitials: v.driverInitials.trim(),
      variantName: v.variantName.trim(),
      variantNote: v.variantNote.trim(),
      variantMode: v.variantMode,
      team: v.team.trim(),
    },
    inputs: {
      basePaceSeconds: decimal(v.basePaceSeconds),
      fuelPerLapLiters: decimal(v.fuelPerLapLiters),
      raceLaps: decimal(v.raceLaps),
      formationSeconds: decimal(v.formationSeconds),
      reserveLaps: decimal(v.reserveLaps),
      veCapacityPercent: decimal(v.veCapacityPercent),
      vePerLapPercent: decimal(v.vePerLapPercent),
      tyreLifeLaps: decimal(v.tyreLifeLaps),
      degradationSeconds: decimal(v.degradationSeconds),
      refuelRate: decimal(v.refuelRate),
      veRate: decimal(v.veRate),
      tyreServiceSeconds: decimal(v.tyreServiceSeconds),
      fuelStep: decimal(v.fuelStep),
      veStep: decimal(v.veStep),
      serviceMode: v.serviceMode,
    },
  };
}

export function formValues(form: StrategyComputeForm): Values {
  const values = { ...form.fields, ...form.inputs };
  for (const key of Object.keys(units) as (keyof typeof units)[]) {
    values[key] = values[key]
      .replace(/(\.\d*?)0+$/, "$1")
      .replace(/\.$/, "")
      .replace(".", ",");
  }
  return values;
}

export function SummaryRows({
  rows,
}: {
  rows: readonly (readonly [string, string])[];
}) {
  return (
    <dl className="strategy-summary-rows">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function useStrategyForm(initialValues: Values) {
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState<Errors>({});

  const focusErrors = useCallback(
    (node: HTMLDivElement | null) => node?.focus(),
    [],
  );
  const [attempt, setAttempt] = useState(0);
  const id = useId();
  const v = values;
  const issueCount = issueCountFor(errors);

  function validate(
    fields: readonly Field[],
    reveal?: (issues: Errors) => void,
  ) {
    const issues: Errors = {};
    for (const field of fields) {
      const error = validation(field, v[field]);
      if (error) issues[field] = error;
    }
    if (Object.keys(issues).length) {
      reveal?.(issues);
      setErrors(issues);
      setAttempt((last) => last + 1);
    }
    return issueCountFor(issues) === 0;
  }

  function change(key: Field, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
    if (errors[key] && !validation(key, value))
      setErrors((prev) => ({ ...prev, [key]: undefined }));
  }

  function field(key: Field, before?: string) {
    if (key === "serviceMode") return choiceField();
    const help = [
      errors[key] || (t.help as Partial<Record<Field, string>>)[key],
      before && t.before(before),
    ].filter(Boolean);
    const inputId = `${id}-${key}`;
    return (
      <div
        className="strategy-field"
        data-wide={key === "name" || key === "driverName" || undefined}
        key={key}
      >
        <label htmlFor={inputId}>{t.labels[key]}</label>
        <div className="strategy-input">
          <input
            id={inputId}
            value={v[key]}
            inputMode={
              units[key]
                ? integers.has(key)
                  ? "numeric"
                  : "decimal"
                : undefined
            }
            aria-describedby={help.length ? `${inputId}-help` : undefined}
            aria-invalid={errors[key] ? true : undefined}
            placeholder={key === "variantNote" ? t.optional : undefined}
            onChange={(event) => change(key, event.currentTarget.value)}
          />
          {units[key] && <span>{units[key]}</span>}
        </div>
        {help.length > 0 && (
          <small id={`${inputId}-help`} data-error={!!errors[key]}>
            {errors[key] && <Icon name="alert" />}
            {help.join(" · ")}
          </small>
        )}
      </div>
    );
  }

  function choiceField() {
    const key = "serviceMode";
    const help = errors[key] || t.serviceHelp;
    const helpId = `${id}-${key}-help`;
    return (
      <fieldset
        className="strategy-field strategy-service"
        key={key}
        aria-describedby={helpId}
        aria-invalid={errors[key] ? true : undefined}
      >
        <legend>{t.labels[key]}</legend>
        <div>
          {serviceModes.map((option) => (
            <label key={option}>
              <input
                type="radio"
                name={`${id}-${key}`}
                checked={option === v[key]}
                onChange={() => change(key, option)}
              />
              {t[option]}
            </label>
          ))}
        </div>
        <small id={helpId} data-error={!!errors[key]}>
          {help}
        </small>
      </fieldset>
    );
  }

  const errorSummary = issueCount > 0 && (
    <div
      className="strategy-notice"
      data-tone="error"
      role="alert"
      key={attempt}
      ref={focusErrors}
      tabIndex={-1}
    >
      <strong>{t.issue(issueCount)}</strong>
      <p>{t.issueDetail}</p>
    </div>
  );

  return {
    v,
    id,
    field,
    errorSummary,
    validate,
    clearErrors: () => setErrors({}),
  };
}

function issueCountFor(errors: Errors) {
  return Object.values(errors).filter(Boolean).length;
}
