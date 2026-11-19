import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type {
  StrategyComputeForm,
  StrategyField,
  StrategyPlanView,
} from "../../../contract/generated/strategy";
import { Icon } from "../../assets/icons/Icon";
import { strategy as t } from "../../i18n/strategy";
import { isTrialPlan, planCard } from "../../screens/strategy/planText";
import { Button } from "../Button";
import {
  decimal,
  type Field,
  formValues,
  SummaryRows,
  toForm,
  useStrategyForm,
} from "./StrategyForm";

const sections = [
  [
    t.race,
    [
      "name",
      "track",
      "class",
      "startAt",
      "durationMinutes",
      "raceLaps",
      "formationSeconds",
    ],
  ],
  [
    t.car,
    [
      "fuelCapacityLiters",
      "fuelPerLapLiters",
      "reserveLaps",
      "basePaceSeconds",
      "veCapacityPercent",
      "vePerLapPercent",
      "tyreLifeLaps",
      "degradationSeconds",
    ],
  ],
  [
    t.pits,
    [
      "pitTransitSeconds",
      "refuelRate",
      "veRate",
      "tyreServiceSeconds",
      "fuelStep",
      "veStep",
      "serviceMode",
    ],
  ],
  [
    t.driverAndStrategy,
    ["driverName", "driverInitials", "variantName", "variantNote"],
  ],
] as const satisfies readonly (readonly [string, readonly Field[]])[];
const editable: readonly Field[] = sections.flatMap(([, fields]) => [
  ...fields,
]);
const dateTime = new Intl.DateTimeFormat("es-ES", {
  dateStyle: "medium",
  timeStyle: "short",
});
const whole = new Intl.NumberFormat("es-ES");
const join = (...values: string[]) => values.filter(Boolean).join(" · ");
const withUnit = (value: string, unit: string) =>
  value ? `${value} ${unit}` : "";

function lapCount(value: string) {
  return withUnit(
    value,
    value === "1" ? t.reviewLabels.lap : t.reviewLabels.laps.toLowerCase(),
  );
}

function paceText(input: string) {
  const seconds = Number(decimal(input));
  if (!input || !Number.isFinite(seconds) || seconds <= 0) return "";
  const milliseconds = Math.round(seconds * 1000);
  if (!Number.isSafeInteger(milliseconds)) return withUnit(input, "s");
  const minutes = Math.floor(milliseconds / 60000);
  const remaining = ((milliseconds % 60000) / 1000).toFixed(3).padStart(6, "0");
  return `${minutes}:${remaining.replace(".", ",")}`;
}

function lapEstimate(duration: string, pace: string) {
  const minutes = Number(decimal(duration));
  const seconds = Number(decimal(pace));
  const laps = Math.round((minutes * 60) / seconds);
  if (!Number.isSafeInteger(laps) || minutes <= 0 || seconds <= 0) return "";
  return t.lapEstimate(whole.format(laps));
}

export function raceLength(form: StrategyComputeForm) {
  const { durationMinutes, raceLaps } = formValues(form);
  return join(withUnit(durationMinutes, "min"), lapCount(raceLaps));
}

function summary(form: StrategyComputeForm) {
  const v = formValues(form);
  const l = t.reviewLabels;
  const start = new Date(v.startAt);
  const pace = paceText(v.basePaceSeconds);
  return [
    [
      t.race,
      "flag",
      [
        [l.name, v.name],
        [l.combo, join(v.track, v.class)],
        [l.duration, raceLength(form)],
        [
          t.labels.startAt,
          Number.isNaN(start.getTime()) ? v.startAt : dateTime.format(start),
        ],
        [
          t.labels.formationSeconds,
          v.formationSeconds === "0"
            ? t.noFormation
            : withUnit(v.formationSeconds, "s"),
        ],
      ],
    ],
    [
      t.car,
      "v-gauge",
      [
        [
          l.fuel,
          join(
            withUnit(v.fuelCapacityLiters, "L"),
            withUnit(v.fuelPerLapLiters, "L/v"),
          ),
        ],
        [
          l.energy,
          join(
            withUnit(v.veCapacityPercent, "%"),
            withUnit(v.vePerLapPercent, "%/v"),
          ),
        ],
        [t.labels.reserveLaps, lapCount(v.reserveLaps)],
        [
          l.tyres,
          join(
            v.tyreLifeLaps === "0" ? t.noLimit : lapCount(v.tyreLifeLaps),
            v.degradationSeconds === "0"
              ? t.noWear
              : withUnit(v.degradationSeconds, "s/vuelta"),
          ),
        ],
      ],
    ],
    [
      t.pits,
      "gear",
      [
        [l.transit, withUnit(v.pitTransitSeconds, "s")],
        [
          l.service,
          join(withUnit(v.refuelRate, "L/s"), withUnit(v.veRate, "%/s")),
        ],
        [l.wheels, withUnit(v.tyreServiceSeconds, "s")],
        [l.loads, v.fuelStep && v.veStep ? t.loads(v.fuelStep, v.veStep) : ""],
        [
          t.service,
          v.serviceMode === "parallel"
            ? t.together
            : v.serviceMode === "sequential"
              ? t.sequential
              : "",
        ],
      ],
    ],
    [
      t.driver,
      "i-cuenta",
      [
        [
          l.name,
          v.driverName && v.driverInitials
            ? `${v.driverName} (${v.driverInitials})`
            : v.driverName || v.driverInitials,
        ],
        [l.pace, pace ? t.perLap(pace) : ""],
      ],
    ],
  ] as const;
}

// What the editor opens with after a calculation refused an input: the form
// that was sent and the field to mark.
export type Draft = { form: StrategyComputeForm; field: StrategyField };

type EditorActions = {
  pending: boolean;
  cancel: () => void;
  clearError: () => void;
  confirm: (form: StrategyComputeForm) => Promise<boolean>;
  calculate: (form: StrategyComputeForm) => Promise<boolean>;
};

export function RaceTab({
  form,
  plan,
  trial,
  viewPlan,
  editing,
  draft,
  pending,
  edit,
  cancel,
  clearError,
  confirm,
  calculate,
}: EditorActions & {
  form: StrategyComputeForm | null;
  // the plan, to say in a card what it is; `viewPlan` goes to the Plan tab
  plan: StrategyPlanView;
  // the plan is a recalculation of this session, not the file's
  trial: boolean;
  viewPlan: () => void;
  editing: boolean;
  draft?: Draft;
  edit: () => void;
}) {
  const restore = useRef<number | undefined>(undefined);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  useLayoutEffect(() => {
    if (!editing && restore.current !== undefined) {
      buttons.current[restore.current]?.focus();
      restore.current = undefined;
    }
  }, [editing]);
  if (!form) return <p>{t.noForm}</p>;
  if (editing)
    return (
      <RaceEditor
        form={form}
        draft={draft}
        pending={pending}
        cancel={cancel}
        clearError={clearError}
        confirm={confirm}
        calculate={calculate}
      />
    );
  const card = planCard(plan);
  return (
    <div className="strategy-grid strategy-grid-two strategy-race-cards">
      {card && (
        <section className="strategy-card strategy-plan-card">
          <div>
            <div className="strategy-kicker">{t.calc.card.eyebrow}</div>
            <h3>{card.title}</h3>
            {card.certificate && <p>{card.certificate}</p>}
            {isTrialPlan(plan, trial) && (
              <p className="strategy-trial">
                <Icon name="info" />
                {t.calc.adjust.trial}
              </p>
            )}
          </div>
          <Button disabled={pending} onClick={viewPlan}>
            {t.calc.card.view}
            <Icon name="right" />
          </Button>
        </section>
      )}
      {summary(form).map(([title, icon, rows], index) => (
        <section key={title} className="strategy-card strategy-review">
          <div className="strategy-review-head">
            <h3>
              <Icon name={icon} />
              {title}
            </h3>
            <Button
              ref={(node) => {
                buttons.current[index] = node;
              }}
              variant="ghost"
              size="sm"
              aria-label={t.editBlock(title)}
              disabled={pending}
              onClick={() => {
                restore.current = index;
                edit();
              }}
            >
              <Icon name="pencil" />
              {t.edit}
            </Button>
          </div>
          <SummaryRows rows={rows} />
        </section>
      ))}
    </div>
  );
}

function RaceEditor({
  form,
  draft,
  pending,
  cancel,
  clearError,
  confirm,
  calculate,
}: EditorActions & { form: StrategyComputeForm; draft?: Draft }) {
  const confirmButton = useRef<HTMLButtonElement>(null);
  const calculateButton = useRef<HTMLButtonElement>(null);
  const [failures, setFailures] = useState<{
    count: number;
    last: "confirm" | "calculate";
  }>({ count: 0, last: "confirm" });
  // after a failed confirmation the focus goes back to the button that was used
  useEffect(() => {
    if (failures.count)
      (failures.last === "confirm"
        ? confirmButton
        : calculateButton
      ).current?.focus();
  }, [failures]);
  const original = formValues(form);
  // a field the calculation refused starts marked; one with no control is said apart
  const refused = draft && editable.includes(draft.field as Field);
  const { v, id, field, errorSummary, validate } = useStrategyForm(
    formValues(draft?.form ?? form),
    refused ? { [draft.field as Field]: t.calc.rejected.inField } : undefined,
  );
  useEffect(() => {
    if (refused)
      document
        .getElementById(`${id}-${draft.field}`)
        ?.scrollIntoView?.({ block: "nearest" });
  }, [refused, draft, id]);
  const focusTitle = useCallback(
    (node: HTMLHeadingElement | null) => node?.focus(),
    [],
  );
  const estimate = lapEstimate(v.durationMinutes, v.basePaceSeconds);
  const changes = editable.filter((key) => v[key] !== original[key]).length;
  // Validates and sends; a failure keeps the editor, with what was written.
  function send(
    action: (form: StrategyComputeForm) => Promise<boolean>,
    used: "confirm" | "calculate",
  ) {
    if (pending) return;
    clearError();
    if (validate(editable))
      void action(toForm(v, form)).then((done) => {
        if (!done)
          setFailures((last) => ({ count: last.count + 1, last: used }));
      });
  }
  return (
    <form
      className="strategy-race-editor"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        send(confirm, "confirm");
      }}
    >
      <div className="strategy-race-editor-body">
        <div className="strategy-notice strategy-edit-notice">
          <Icon name="pencil" />
          <div>
            <h3 ref={focusTitle} tabIndex={-1}>
              {t.editing}
            </h3>
            <p>{t.editingDetail}</p>
          </div>
        </div>
        {draft && !refused && (
          <div className="strategy-notice" data-tone="error" role="alert">
            {t.calc.rejected.general}
          </div>
        )}
        {errorSummary}
        {sections.map(([title, fields]) => (
          <fieldset key={title} disabled={pending}>
            <legend>{title}</legend>
            <div className="strategy-grid">
              {fields.map((key) =>
                field(
                  key,
                  v[key] !== original[key] ? original[key] : undefined,
                ),
              )}
            </div>
            {title === t.race && estimate && (
              <p className="strategy-lap-estimate">{estimate}</p>
            )}
          </fieldset>
        ))}
      </div>
      <div className="strategy-wizard-foot strategy-race-footer">
        {changes > 0 && <span>{t.unconfirmed(changes)}</span>}
        <Button
          type="button"
          variant="ghost"
          disabled={pending}
          onClick={cancel}
        >
          {t.cancelEdit}
        </Button>
        <Button ref={confirmButton} type="submit" disabled={pending}>
          <Icon name="check" />
          {t.confirm}
        </Button>
        <Button
          ref={calculateButton}
          type="button"
          variant="primary"
          disabled={pending}
          onClick={() => send(calculate, "calculate")}
        >
          <Icon name="play" />
          {t.calc.confirmAndCalculate}
        </Button>
      </div>
    </form>
  );
}
