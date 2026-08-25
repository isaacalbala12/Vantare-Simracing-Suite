import { useState } from 'react';
import { useI18n } from '../../../i18n/I18nProvider';
import type { InspectorControl } from '../../../overlay/core/inspector-control';
import { readControlValue } from '../../../overlay/core/inspector-control';
import { Field, Input, Select, Toggle } from '../../../ui/orbit';

export type InspectorControlFieldProps = {
  control: InspectorControl;
  values: Record<string, unknown>;
  /** `true` cuando el usuario ha sobrescrito el valor que trae el diseno. */
  modified?: boolean;
  onChange(value: unknown): void;
  /** Quita el override y devuelve el control al valor del diseno. */
  onReset?(): void;
};

function isValidControlValue(control: InspectorControl, value: unknown): boolean {
  switch (control.kind) {
    case 'toggle':
      return typeof value === 'boolean';
    case 'color':
      return typeof value === 'string' && value.trim() !== '';
    case 'range':
      return (
        typeof value === 'number' &&
        Number.isFinite(value) &&
        value >= control.min &&
        value <= control.max
      );
    case 'select':
      return control.options.some((option) => option.value === value);
    default:
      return false;
  }
}

/**
 * Etiqueta humana del control. Los descriptores ya traen `labelKey`; si el
 * catalogo no la tiene traducida se humaniza el id (`show-header` →
 * `Show header`) en vez de pintar la clave cruda.
 */
function humanize(id: string): string {
  const words = id.replace(/[-_]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function label(t: (key: string) => string, key: string, fallbackId: string): string {
  const translated = t(key);
  return translated === key || translated.trim() === '' ? humanize(fallbackId) : translated;
}

/** `#abc` y `abcdef` valen: se normaliza a `#aabbcc` en minusculas. */
function normalizeHex(raw: string): string | null {
  const value = raw.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(value)) {
    const [r, g, b] = value.toLowerCase().split('') as [string, string, string];
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  if (/^[0-9a-fA-F]{6}$/.test(value)) {
    return `#${value.toLowerCase()}`;
  }
  return null;
}

function ResetIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      focusable="false"
      height={13}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.5}
      viewBox="0 0 14 14"
      width={13}
    >
      <path d="M2.6 7a4.4 4.4 0 1 0 1.3-3.1" />
      <path d="M2.4 2.2v2.6h2.6" />
    </svg>
  );
}

/**
 * Fila compacta de color: rotulo a la izquierda y, a la derecha, la muestra
 * (que es el `input[type=color]` real), el hex editable y el boton de
 * restablecer. Antes era un `input[type=color]` a ancho completo por control:
 * seis de ellos convertian el inspector en un muro de barras.
 */
function ColorControlRow(props: {
  title: string;
  fieldId: string;
  testId: string;
  value: string;
  modified: boolean;
  resetLabel: string;
  onChange(next: string): void;
  onReset?(): void;
}) {
  const { title, fieldId, testId, value, modified, resetLabel, onChange, onReset } = props;
  const [draft, setDraft] = useState<string | null>(null);

  const commitDraft = () => {
    if (draft === null) return;
    const normalized = normalizeHex(draft);
    if (normalized && normalized !== value) {
      onChange(normalized);
    }
    setDraft(null);
  };

  return (
    <div className="orbit-color-row" data-modified={modified ? 'true' : undefined}>
      <label className="orbit-color-row__label" htmlFor={fieldId}>
        {title}
      </label>
      <div className="orbit-color-row__control">
        <span className="orbit-color-row__swatch" style={{ background: value }}>
          <input
            aria-label={title}
            data-testid={testId}
            id={fieldId}
            onChange={(event) => onChange(event.target.value)}
            type="color"
            value={value}
          />
        </span>
        <input
          aria-label={`${title} · hex`}
          className="orbit-color-row__hex"
          data-testid={`${testId}-hex`}
          onBlur={commitDraft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              commitDraft();
            }
            if (event.key === 'Escape') {
              setDraft(null);
            }
          }}
          spellCheck={false}
          type="text"
          value={draft ?? value}
        />
        {modified && onReset ? (
          <button
            aria-label={resetLabel}
            className="orbit-color-row__reset"
            data-testid={`${testId}-reset`}
            data-tip={resetLabel}
            data-tip-side="top"
            onClick={onReset}
            type="button"
          >
            <ResetIcon />
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function InspectorControlField(props: InspectorControlFieldProps): React.ReactElement {
  const { control, values, modified = false, onChange, onReset } = props;
  const { t } = useI18n();
  const currentValue = readControlValue(values, control.path);
  const value = currentValue ?? control.defaultValue;
  const testId = `studio-inspector-control-${control.id}`;

  {
    const title = label(t, control.labelKey, control.id);
    const fieldId = `orbit-control-${control.id}`;

    if (control.kind === 'toggle') {
      return (
        <Field className="orbit-studio-ins__field" label={title} row>
          <Toggle
            data-testid={testId}
            label={title}
            onChange={(next) => onChange(next)}
            pressed={Boolean(value)}
          />
        </Field>
      );
    }

    if (control.kind === 'select') {
      return (
        <Field className="orbit-studio-ins__field" htmlFor={fieldId} label={title}>
          <Select
            id={fieldId}
            data-testid={testId}
            label={title}
            onChange={(next) => {
              if (isValidControlValue(control, next)) onChange(next);
            }}
            options={control.options.map((option) => ({
              value: option.value,
              label: label(t, option.labelKey, option.value),
            }))}
            value={typeof value === 'string' ? value : control.defaultValue}
          />
        </Field>
      );
    }

    if (control.kind === 'range') {
      return (
        <Field className="orbit-studio-ins__field orbit-studio-ins__field--num" label={title} row>
          <Input
            aria-label={title}
            data-testid={testId}
            id={fieldId}
            max={control.max}
            min={control.min}
            numeric
            onChange={(event) => {
              const next = Number.parseFloat(event.target.value);
              if (isValidControlValue(control, next)) onChange(next);
            }}
            step={control.step}
            type="number"
            value={typeof value === 'number' ? value : control.defaultValue}
          />
        </Field>
      );
    }

    return (
      <ColorControlRow
        fieldId={fieldId}
        modified={modified}
        onChange={(next) => {
          if (isValidControlValue(control, next)) onChange(next);
        }}
        onReset={onReset}
        resetLabel={t('studio.inspector.appearance.resetControl')}
        testId={testId}
        title={title}
        value={typeof value === 'string' ? value : control.defaultValue}
      />
    );
  }
}
