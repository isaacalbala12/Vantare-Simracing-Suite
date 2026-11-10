import { Checkbox as BaseCheckbox } from "@base-ui/react/checkbox";
import { Field } from "@base-ui/react/field";
import { Radio as BaseRadio } from "@base-ui/react/radio";
import { RadioGroup as BaseRadioGroup } from "@base-ui/react/radio-group";
import { Select as BaseSelect } from "@base-ui/react/select";
import { Slider as BaseSlider } from "@base-ui/react/slider";
import { Switch as BaseSwitch } from "@base-ui/react/switch";
import { Tabs as BaseTabs } from "@base-ui/react/tabs";
import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import { type ReactNode, useId } from "react";
import { Icon } from "../assets/icons/Icon";
import { Button } from "./Button";
export interface Option {
  value: string;
  label: string;
  disabled?: boolean;
}
export function Input({
  label,
  description,
  error,
  ...props
}: Field.Control.Props & {
  label: string;
  description?: string;
  error?: string;
}) {
  return (
    <Field.Root className="v-field" invalid={Boolean(error)}>
      <Field.Label>{label}</Field.Label>
      <Field.Control {...props} className="v-input" />
      {description && (
        <Field.Description className="v-muted">{description}</Field.Description>
      )}
      {error && (
        <Field.Error match={true} className="v-error">
          {error}
        </Field.Error>
      )}
    </Field.Root>
  );
}
export function Textarea(props: Parameters<typeof Input>[0]) {
  return <Input {...props} render={<textarea />} />;
}
export function SearchInput({
  label,
  clearLabel,
  value,
  onChange,
}: {
  label: string;
  clearLabel: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="v-search">
      <Input
        label={label}
        aria-label={label}
        placeholder={label}
        type="search"
        value={value}
        onChange={(e) => onChange(e.currentTarget.value)}
      />
      {value && (
        <Button
          size="sm"
          variant="ghost"
          aria-label={clearLabel}
          onClick={() => onChange("")}
        >
          <Icon name="i-chevron" />
        </Button>
      )}
    </div>
  );
}
export function Select({
  label,
  pending = false,
  options,
  value,
  onChange,
  disabled = false,
  hideLabel = false,
}: {
  hideLabel?: boolean;
  label: string;
  pending?: boolean;
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="v-field">
      <label
        id={id}
        htmlFor={`${id}-control`}
        className={hideLabel ? "v-sr-only" : undefined}
      >
        {label}
      </label>
      <BaseSelect.Root
        items={options}
        value={value}
        onValueChange={(v) => {
          if (!pending && v !== null) onChange(v);
        }}
        disabled={disabled}
      >
        <BaseSelect.Trigger
          id={`${id}-control`}
          aria-labelledby={id}
          aria-busy={pending || undefined}
          aria-disabled={disabled || pending || undefined}
          className="v-input v-select-trigger"
        >
          <BaseSelect.Value />
          <BaseSelect.Icon>
            <Icon name="i-chevron" />
          </BaseSelect.Icon>
        </BaseSelect.Trigger>
        <BaseSelect.Portal>
          <BaseSelect.Positioner className="v-positioner" sideOffset={6}>
            <BaseSelect.Popup className="v-popup">
              <BaseSelect.List>
                {options.map((option) => (
                  <BaseSelect.Item
                    className="v-option"
                    key={option.value}
                    value={option.value}
                    disabled={option.disabled}
                  >
                    <BaseSelect.ItemText>{option.label}</BaseSelect.ItemText>
                    <BaseSelect.ItemIndicator>
                      <Icon name="check" />
                    </BaseSelect.ItemIndicator>
                  </BaseSelect.Item>
                ))}
              </BaseSelect.List>
            </BaseSelect.Popup>
          </BaseSelect.Positioner>
        </BaseSelect.Portal>
      </BaseSelect.Root>
    </div>
  );
}
export function Switch({
  label,
  pending = false,
  hideLabel = false,
  ...props
}: BaseSwitch.Root.Props & {
  label: string;
  pending?: boolean;
  hideLabel?: boolean;
}) {
  const id = useId();
  return (
    <div className="v-switch-field">
      <label htmlFor={id} className={hideLabel ? "v-sr-only" : undefined}>
        {label}
      </label>
      <BaseSwitch.Root
        {...props}
        id={id}
        className="v-switch"
        disabled={props.disabled}
        aria-disabled={props.disabled || pending || undefined}
        onCheckedChange={(checked, details) => {
          if (!pending) props.onCheckedChange?.(checked, details);
        }}
        aria-busy={pending || undefined}
      >
        <BaseSwitch.Thumb className="v-switch-thumb" />
        {pending && <span className="v-spinner" aria-hidden="true" />}
      </BaseSwitch.Root>
    </div>
  );
}
export function Slider({
  label,
  pending = false,
  value,
  min,
  max,
  onChange,
  onValueCommitted,
  disabled = false,
  hideLabel = false,
}: {
  hideLabel?: boolean;
  label: string;
  pending?: boolean;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  onValueCommitted: (value: number) => void;
  disabled?: boolean;
}) {
  return (
    <BaseSlider.Root
      className="v-slider"
      value={value}
      min={min}
      max={max}
      aria-busy={pending || undefined}
      aria-disabled={disabled || pending || undefined}
      onValueChange={(value) => {
        if (!pending) onChange(value);
      }}
      onValueCommitted={(value) => {
        if (!pending) onValueCommitted(value);
      }}
      disabled={disabled}
    >
      <BaseSlider.Label className={hideLabel ? "v-sr-only" : undefined}>
        {label}
      </BaseSlider.Label>
      <BaseSlider.Value />
      <BaseSlider.Control className="v-slider-control">
        <BaseSlider.Track className="v-slider-track">
          <BaseSlider.Indicator className="v-slider-indicator" />
          <BaseSlider.Thumb className="v-slider-thumb" aria-label={label} />
        </BaseSlider.Track>
      </BaseSlider.Control>
    </BaseSlider.Root>
  );
}
export function Segmented({
  label,
  pending = false,
  options,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  pending?: boolean;
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <ToggleGroup
      className="v-segmented"
      aria-label={label}
      aria-busy={pending || undefined}
      aria-disabled={disabled || pending || undefined}
      value={[value]}
      disabled={disabled}
      onValueChange={(v) => {
        if (!pending && v[0]) onChange(v[0]);
      }}
    >
      {options.map((option) => (
        <Toggle
          className="v-segment"
          key={option.value}
          value={option.value}
          disabled={option.disabled}
        >
          {option.label}
        </Toggle>
      ))}
    </ToggleGroup>
  );
}
export function Checkbox({
  label,
  ...props
}: BaseCheckbox.Root.Props & { label: string }) {
  const id = useId();
  return (
    <label className="v-choice" htmlFor={id}>
      <BaseCheckbox.Root {...props} id={id} className="v-checkbox">
        <BaseCheckbox.Indicator>
          <Icon name="check" />
        </BaseCheckbox.Indicator>
      </BaseCheckbox.Root>
      <span>{label}</span>
    </label>
  );
}
export function RadioGroup({
  label,
  pending = false,
  options,
  value,
  onChange,
}: {
  label: string;
  pending?: boolean;
  options: Option[];
  value: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <BaseRadioGroup
      className="v-radio-group"
      aria-label={label}
      aria-busy={pending || undefined}
      aria-disabled={pending || undefined}
      value={value}
      onValueChange={(v) => {
        if (!pending) onChange(String(v));
      }}
    >
      {options.map((option) => (
        <label
          className="v-choice"
          key={option.value}
          htmlFor={`${id}-${option.value}`}
        >
          <BaseRadio.Root
            id={`${id}-${option.value}`}
            className="v-radio"
            value={option.value}
            disabled={option.disabled}
          >
            <BaseRadio.Indicator className="v-radio-indicator" />
          </BaseRadio.Root>
          {option.label}
        </label>
      ))}
    </BaseRadioGroup>
  );
}
export function Tabs({
  label,
  value,
  onChange,
  items,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  items: (Option & { content: ReactNode })[];
}) {
  return (
    <BaseTabs.Root value={value} onValueChange={(v) => onChange(String(v))}>
      <BaseTabs.List className="v-tabs" aria-label={label} activateOnFocus>
        {items.map((item) => (
          <BaseTabs.Tab
            className="v-tab"
            key={item.value}
            value={item.value}
            disabled={item.disabled}
          >
            {item.label}
          </BaseTabs.Tab>
        ))}
        <BaseTabs.Indicator className="v-tab-indicator" />
      </BaseTabs.List>
      {items.map((item) => (
        <BaseTabs.Panel
          className="v-tab-panel"
          key={item.value}
          value={item.value}
        >
          {item.content}
        </BaseTabs.Panel>
      ))}
    </BaseTabs.Root>
  );
}
