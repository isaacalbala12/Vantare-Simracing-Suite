import { useCallback, useRef, useState } from "react";
import type { StrategyComputeForm } from "../../../contract/generated/strategy";
import { Icon } from "../../assets/icons/Icon";
import { strategy as t } from "../../i18n/strategy";

import {
  type Field,
  initial,
  SummaryRows,
  toForm,
  useStrategyForm,
} from "./StrategyForm";

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
  [...race, ...fuel, ...advanced, "serviceMode"],
  pilot,
  variant,
];
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
  const { v, id, field, errorSummary, validate, clearErrors } =
    useStrategyForm(initial);
  const advancedSection = useRef<HTMLDetailsElement>(null);
  const focusTitle = useCallback(
    (node: HTMLHeadingElement | null) => node?.focus(),
    [],
  );

  function go(next: number) {
    clearErrors();
    setStep(next);
  }

  function submit() {
    if (
      pending ||
      !validate(byStep[step], (issues) => {
        if (advancedSection.current && advanced.some((key) => issues[key]))
          advancedSection.current.open = true;
      })
    )
      return;
    if (step < 4) go(step + 1);
    else create(toForm(v));
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
        [t.service, v.serviceMode === "parallel" ? t.parallel : t.sequential],
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
          className="strategy-breadcrumb"
          disabled={pending}
          onClick={close}
        >
          <Icon name="chevron-left" />
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
          {errorSummary}
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
                {combo.map((key) => field(key))}
              </div>
            </>
          )}
          {step === 2 && (
            <>
              <fieldset>
                <legend>{t.race}</legend>
                <div className="strategy-grid">
                  {race.map((key) => field(key))}
                </div>
              </fieldset>
              <fieldset>
                <legend>{t.fuelAndEnergy}</legend>
                <div className="strategy-grid">
                  {fuel.map((key) => field(key))}
                </div>
              </fieldset>
              <details ref={advancedSection} className="strategy-advanced">
                <summary>
                  <Icon name="down" />
                  {t.advanced}
                </summary>
                <div className="strategy-grid">
                  {advanced.map((key) => field(key))}
                  {field("serviceMode")}
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
                <div className="strategy-grid">
                  {pilot.map((key) => field(key))}
                </div>
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
                {variant.map((key) => field(key))}
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
          <p className="strategy-summary-note">{t.summaryHelp}</p>
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
