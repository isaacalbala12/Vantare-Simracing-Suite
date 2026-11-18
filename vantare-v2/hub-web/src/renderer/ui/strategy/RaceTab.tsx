import { useCallback, useLayoutEffect, useRef } from "react";
import type { StrategyComputeForm } from "../../../contract/generated/strategy";
import { Icon } from "../../assets/icons/Icon";
import { strategy as t } from "../../i18n/strategy";
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

export function RaceTab({
  form,
  editing,
  pending,
  edit,
  cancel,
  confirm,
}: {
  form: StrategyComputeForm | null;
  editing: boolean;
  pending: boolean;
  edit: () => void;
  cancel: () => void;
  confirm: (form: StrategyComputeForm) => void;
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
        pending={pending}
        cancel={cancel}
        confirm={confirm}
      />
    );
  return (
    <div className="strategy-grid strategy-grid-two strategy-race-cards">
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
  pending,
  cancel,
  confirm,
}: {
  form: StrategyComputeForm;
  pending: boolean;
  cancel: () => void;
  confirm: (form: StrategyComputeForm) => void;
}) {
  const original = formValues(form);
  const { v, field, errorSummary, validate } = useStrategyForm(original);
  const focusTitle = useCallback(
    (node: HTMLHeadingElement | null) => node?.focus(),
    [],
  );
  const estimate = lapEstimate(v.durationMinutes, v.basePaceSeconds);
  const changes = editable.filter((key) => v[key] !== original[key]).length;
  return (
    <form
      className="strategy-race-editor"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (!pending && validate(editable)) confirm(toForm(v));
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
        <Button type="submit" variant="primary" disabled={pending}>
          <Icon name="check" />
          {t.confirm}
        </Button>
      </div>
    </form>
  );
}
