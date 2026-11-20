import { useEffect, useState } from "react";
import type {
  StrategyEditView,
  StrategyServiceSteps,
} from "../../../contract/generated/strategy";
import { Icon } from "../../assets/icons/Icon";
import { strategy } from "../../i18n/strategy";
import { amounts } from "../../i18n/strategyAmounts";
import { stopIsFixed, tyreLines } from "../../screens/strategy/stopAmounts";
import { Button } from "../Button";
import { Choices } from "./PlanAdjust";
import { type AmountActions, PinMark, StopAmounts } from "./StopAmounts";

const t = strategy.calc;

// What the screen shows when a recalculation with fixed amounts found no plan:
// there is no timeline to draw, so only the way out (the stop the crate points at,
// or a generic line) and the amounts of each stop, to change them in place.
export function FixedNoPlan({
  edit,
  steps,
  edited,
  locked,
  set,
  back,
}: {
  edit: StrategyEditView;
  steps: StrategyServiceSteps;
  // something changed since the recalculation that found no plan
  edited: boolean;
  locked: boolean;
  set: AmountActions["setStopService"];
  // the stop the host points at goes back to automatic
  back: (stop: number) => void;
}) {
  const cause = edit.cause?.stop;
  const [selected, setSelected] = useState(
    cause ?? Math.max(0, edit.stops.findIndex(stopIsFixed)),
  );
  // the host may point at another stop after another recalculation
  useEffect(() => {
    if (cause !== undefined) setSelected(cause);
  }, [cause]);
  const index = Math.min(selected, edit.stops.length - 1);
  const n = amounts.noPlan;
  // Where the crate points at is the tyres when that stop cannot keep them (the host
  // marks it): the sentence says it; otherwise it is an amount.
  const culprit = cause === undefined ? undefined : edit.stops[cause];
  const tyres =
    culprit?.tyres.issue === "beyondLife" && cause !== undefined
      ? tyreLines(edit, cause)
      : null;
  return (
    <>
      {edited ? (
        <section
          className="strategy-notice strategy-pending"
          data-tone="warn"
          aria-label={t.adjust.pending.title}
        >
          <span className="strategy-icon">
            <Icon name="warn" />
          </span>
          <div>
            <strong>{t.adjust.pending.title}</strong>
            <p>{n.pending}</p>
          </div>
        </section>
      ) : (
        <div className="strategy-notice" data-tone="error" role="alert">
          <span className="strategy-icon">
            <Icon name="alert" />
          </span>
          <div>
            <strong>{n.title}</strong>
            <p>
              {cause === undefined
                ? n.generic
                : (tyres?.noPlan ?? n.stop(cause + 1))}
            </p>
            {cause !== undefined && (
              <div className="strategy-actions">
                <Button
                  size="sm"
                  variant="primary"
                  disabled={locked}
                  onClick={() => back(cause)}
                >
                  {n.backStop(cause + 1)}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
      <div className="strategy-card strategy-editor">
        <div className="strategy-editor-row">
          <span>{n.pick}</span>
          <Choices
            label={n.pick}
            value={index}
            onChange={setSelected}
            choices={edit.stops.map((stop, position) => ({
              label: `${t.stop(position + 1)}, ${t.lap(stop.lap).toLowerCase()}${stopIsFixed(stop) ? `, ${amounts.pinnedStop}` : ""}`,
              text: (
                <>
                  <b>{position + 1}</b>
                  {` v. ${stop.lap}`}
                  {stopIsFixed(stop) && <PinMark />}
                </>
              ),
            }))}
          />
        </div>
        <StopAmounts
          key={index}
          edit={edit}
          index={index}
          steps={steps}
          stale={false}
          locked={locked}
          set={set}
        />
        <p className="strategy-help">{amounts.foot}</p>
      </div>
    </>
  );
}
