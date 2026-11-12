import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";
import { useRef, useState } from "react";
import { Icon } from "../../assets/icons/Icon";
import { studioText as t } from "../../i18n/studio";
import { Spinner } from "../Data";
import {
  type ChoiceIllustrationKind,
  choiceIllustrations,
} from "../widgets/illustrations";

export function ChoiceCards<T extends string>({
  label,
  options,
  value,
  onChange,
  disabled,
  pending,
  active,
  action = false,
}: {
  label: string;
  options: readonly { value: T; label: string; art: ChoiceIllustrationKind }[];
  value?: T;
  onChange: (value: T) => void;
  disabled: boolean;
  pending: boolean;
  active?: string | null;
  action?: boolean;
}) {
  const [requested, setRequested] = useState<T>();
  const root = useRef<HTMLFieldSetElement>(null);
  const [index, setIndex] = useState(0);
  const content = (option: (typeof options)[number]) => {
    const Art = choiceIllustrations[option.art];
    return (
      <>
        <span className="v-choice-picture">
          <Art aria-hidden="true" />
        </span>
        <strong>
          {option.label}
          {pending && (active ?? requested) === option.value ? (
            <Spinner label={t.saving} />
          ) : !action && value === option.value ? (
            <Icon name="check" />
          ) : null}
        </strong>
        {action && <span className="v-choice-apply">{t.apply}</span>}
      </>
    );
  };
  const classes = "v-visual-choices";
  if (action)
    return (
      <fieldset
        ref={root}
        className={classes}
        data-count={options.length}
        aria-label={label}
        aria-busy={pending || undefined}
      >
        {options.map((option, n) => (
          <button
            key={option.value}
            type="button"
            className="v-choice-card"
            data-action="true"
            disabled={disabled}
            aria-disabled={pending || undefined}
            aria-busy={
              (pending && (active ?? requested) === option.value) || undefined
            }
            aria-label={t.applyFormat(option.label)}
            tabIndex={n === index ? 0 : -1}
            onFocus={() => setIndex(n)}
            onClick={() => {
              if (!pending) {
                setRequested(option.value);
                onChange(option.value);
              }
            }}
            onKeyDown={(event) => {
              const next =
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? options.length - 1
                    : ["ArrowRight", "ArrowDown"].includes(event.key)
                      ? (n + 1) % options.length
                      : ["ArrowLeft", "ArrowUp"].includes(event.key)
                        ? (n + options.length - 1) % options.length
                        : -1;
              if (next < 0) return;
              event.preventDefault();
              root.current
                ?.querySelectorAll<HTMLButtonElement>("button")
                [next]?.focus();
            }}
          >
            {content(option)}
          </button>
        ))}
      </fieldset>
    );
  return (
    <RadioGroup
      className={classes}
      data-count={options.length}
      aria-label={label}
      value={value}
      disabled={disabled}
      aria-disabled={pending || undefined}
      aria-busy={pending || undefined}
      onValueChange={(next) => {
        const option = options.find((option) => option.value === next);
        if (!pending && option) {
          setRequested(option.value);
          onChange(option.value);
        }
      }}
    >
      {options.map((option) => (
        <Radio.Root
          key={option.value}
          value={option.value}
          className="v-choice-card"
          aria-label={option.label}
          aria-disabled={pending || undefined}
          aria-busy={
            (pending && (active ?? requested) === option.value) || undefined
          }
        >
          {content(option)}
        </Radio.Root>
      ))}
    </RadioGroup>
  );
}
