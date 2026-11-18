import { useCallback, useId, useRef, useState } from "react";
import type { StrategyComputeForm } from "../../../contract/generated/strategy";
import { strategyLimits } from "../../../contract/generated/strategy";
import { strategy as t } from "../../i18n/strategy";

type Field = keyof typeof t.labels;
type Values = Record<Field, string>;
type Errors = Partial<Values>;

const initial: Values = {
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
};
const combo = ["track", "class"] as const;
const race = [
  "name",
  "startAt",
  "durationMinutes",
  "raceLaps",
  "formationSeconds",
] as const;
const fuel = [
  "fuelCapacityLiters",
  "fuelPerLapLiters",
  "reserveLaps",
  "veCapacityPercent",
  "vePerLapPercent",
] as const;
const advanced = [
  "tyreLifeLaps",
  "degradationSeconds",
  "pitTransitSeconds",
  "refuelRate",
  "veRate",
  "tyreServiceSeconds",
  "fuelStep",
  "veStep",
] as const;
const pilot = ["driverName", "driverInitials", "basePaceSeconds"] as const;
const variant = ["variantName", "variantNote"] as const;
const byStep: readonly (readonly Field[])[] = [
  [],
  combo,
  [...race, ...fuel, ...advanced],
  pilot,
  variant,
];
const units: Partial<Values> = {
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
const decimal = (value: string) => value.trim().replace(",", ".");

function validation(field: Field, value: string): string | undefined {
  const text = value.trim();
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

function toForm(v: Values, serviceMode: string): StrategyComputeForm {
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
      variantMode: "dry",
      team: "",
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
      serviceMode,
    },
  };
}

function SummaryRows({
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

export function Wizard({
  close,
  create,
  pending,
}: {
  close: () => void;
  create: (form: StrategyComputeForm) => void;
  pending: boolean;
}) {
  const [step, setStep] = useState(0);
  const [values, setValues] = useState(initial);
  const [service, setService] = useState<"parallel" | "sequential">("parallel");
  const [errors, setErrors] = useState<Errors>({});

  const focusTitle = useCallback(
    (node: HTMLHeadingElement | null) => node?.focus(),
    [],
  );
  const focusErrors = useCallback(
    (node: HTMLDivElement | null) => node?.focus(),
    [],
  );
  const [attempt, setAttempt] = useState(0);
  const advancedSection = useRef<HTMLDetailsElement>(null);
  const id = useId();
  const v = values;
  const issueCount = Object.values(errors).filter(Boolean).length;

  function go(next: number) {
    setErrors({});
    setStep(next);
  }
  function submit() {
    if (pending) return;
    const issues: Errors = {};
    for (const field of byStep[step]) {
      const error = validation(field, v[field]);
      if (error) issues[field] = error;
    }
    if (Object.keys(issues).length) {
      if (advancedSection.current && advanced.some((key) => issues[key]))
        advancedSection.current.open = true;
      setErrors(issues);
      setAttempt((last) => last + 1);
    } else if (step < 4) go(step + 1);
    else create(toForm(v, service));
  }
  function field(key: Field) {
    const help = errors[key] || (t.help as Partial<Values>)[key];
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
            aria-describedby={help ? `${inputId}-help` : undefined}
            aria-invalid={errors[key] ? true : undefined}
            placeholder={key === "variantNote" ? t.optional : undefined}
            onChange={(event) => {
              const value = event.currentTarget.value;
              setValues((prev) => ({ ...prev, [key]: value }));
              if (errors[key] && !validation(key, value))
                setErrors((prev) => ({ ...prev, [key]: undefined }));
            }}
          />
          {units[key] && <span>{units[key]}</span>}
        </div>
        {help && (
          <small id={`${inputId}-help`} data-error={!!errors[key]}>
            {help}
          </small>
        )}
      </div>
    );
  }
  const lapDuration = `${v.durationMinutes} min · ${v.raceLaps} vueltas`;
  const fuelUsage = `${v.fuelCapacityLiters} L · ${v.fuelPerLapLiters} L/v`;
  const review = [
    [
      t.race,
      2,
      [
        [t.reviewLabels.name, v.name],
        [t.reviewLabels.combo, `${v.track} · ${v.class}`],
        [t.reviewLabels.duration, lapDuration],
        [t.labels.startAt, v.startAt],
      ],
    ],
    [
      t.car,
      2,
      [
        [t.reviewLabels.fuel, fuelUsage],
        [
          t.reviewLabels.energy,
          `${v.veCapacityPercent} % · ${v.vePerLapPercent} %/v`,
        ],
        [t.labels.reserveLaps, v.reserveLaps],
        [
          t.reviewLabels.tyres,
          `${v.tyreLifeLaps} vueltas · ${v.degradationSeconds} s/vuelta`,
        ],
      ],
    ],
    [
      t.pits,
      2,
      [
        [t.reviewLabels.transit, `${v.pitTransitSeconds} s`],
        [t.reviewLabels.service, `${v.refuelRate} L/s · ${v.veRate} %/s`],
        [t.reviewLabels.wheels, `${v.tyreServiceSeconds} s`],
        [t.service, service === "parallel" ? t.parallel : t.sequential],
      ],
    ],
    [
      t.driver,
      3,
      [
        [t.reviewLabels.name, `${v.driverName} (${v.driverInitials})`],
        [t.reviewLabels.pace, `${v.basePaceSeconds} s`],
      ],
    ],
  ] as const;
  return (
    <form
      className="strategy-wizard"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div className="strategy-wizard-head">
        <button
          type="button"
          className="v-button"
          disabled={pending}
          onClick={close}
        >
          {t.collection}
        </button>
        <span>{t.new}</span>
      </div>
      <ol className="strategy-steps" aria-label={t.stepsLabel}>
        {t.steps.map((label, index) => (
          <li key={label} aria-current={step === index ? "step" : undefined}>
            <span aria-hidden="true">{index < step ? "✓" : index + 1}</span>
            {label}
          </li>
        ))}
      </ol>
      <div className="strategy-wizard-body">
        <div className="strategy-wizard-main">
          <div className="strategy-kicker">{t.stepHeading(step + 1)}</div>
          <h2 key={step} ref={focusTitle} tabIndex={-1}>
            {t.headings[step]}
          </h2>
          {issueCount > 0 && (
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
          )}
          {step === 0 && (
            <>
              <p>{t.introduction}</p>
              <label className="strategy-manual">
                <input type="radio" name={`${id}-manual`} defaultChecked />
                <span>
                  <strong>{t.manual}</strong>
                  <small>{t.manualDetail}</small>
                </span>
              </label>
            </>
          )}
          {step === 1 && (
            <>
              <p>{t.combination}</p>
              <div className="strategy-grid strategy-grid-two">
                {combo.map(field)}
              </div>
            </>
          )}
          {step === 2 && (
            <>
              <fieldset>
                <legend>{t.race}</legend>
                <div className="strategy-grid">{race.map(field)}</div>
              </fieldset>
              <fieldset>
                <legend>{t.fuelAndEnergy}</legend>
                <div className="strategy-grid">{fuel.map(field)}</div>
              </fieldset>
              <details ref={advancedSection} className="strategy-advanced">
                <summary>{t.advanced}</summary>
                <div className="strategy-grid">
                  {advanced.map(field)}
                  <fieldset className="strategy-field strategy-service">
                    <legend>{t.service}</legend>
                    <div>
                      {(["parallel", "sequential"] as const).map((option) => (
                        <label key={option}>
                          <input
                            type="radio"
                            name={`${id}-service`}
                            checked={option === service}
                            onChange={() => setService(option)}
                          />
                          {t[option]}
                        </label>
                      ))}
                    </div>
                    <small>{t.serviceHelp}</small>
                  </fieldset>
                </div>
              </details>
            </>
          )}
          {step === 3 && (
            <>
              <p>{t.driverDetail}</p>
              <div className="strategy-card strategy-pilot">
                <span className="strategy-avatar" aria-hidden="true">
                  {v.driverInitials || "—"}
                </span>
                <div className="strategy-grid">{pilot.map(field)}</div>
              </div>
            </>
          )}
          {step === 4 && (
            <>
              <p>
                {t.review} <strong>{t.unsaved}</strong>
              </p>
              <div className="strategy-grid strategy-grid-two">
                {review.map(([label, target, rows]) => (
                  <section
                    key={label}
                    className="strategy-card strategy-review"
                  >
                    <div className="strategy-review-head">
                      <h3>{label}</h3>
                      <button
                        type="button"
                        className="v-button"
                        aria-label={t.editBlock(label)}
                        onClick={() => go(target)}
                      >
                        {t.edit}
                      </button>
                    </div>
                    <SummaryRows rows={rows} />
                  </section>
                ))}
              </div>
              <div className="strategy-grid strategy-grid-two">
                {variant.map(field)}
              </div>
            </>
          )}
        </div>
        <aside
          className="strategy-card strategy-summary"
          aria-label={t.yourRace}
        >
          <div className="strategy-kicker">{t.yourRace}</div>
          <SummaryRows
            rows={[
              [t.labels.track, v.track],
              [t.labels.class, v.class],
              [t.race, v.name ? `${v.name} · ${v.durationMinutes} min` : ""],
              [t.reviewLabels.laps, v.raceLaps],
              [
                t.labels.fuelCapacityLiters,
                v.fuelCapacityLiters ? fuelUsage : "",
              ],
              [
                t.driver,
                v.driverName ? `${v.driverName} · ${v.basePaceSeconds} s` : "",
              ],
            ]}
          />
        </aside>
      </div>
      <div className="strategy-wizard-foot">
        <button
          className="v-button"
          type="button"
          disabled={pending}
          onClick={() => (step ? go(step - 1) : close())}
        >
          {t.back}
        </button>
        <span>{t.step(step + 1)}</span>
        <button
          className="v-button v-button--primary"
          type="submit"
          disabled={pending}
        >
          {step === 4 ? t.create : t.continue}
        </button>
      </div>
    </form>
  );
}
