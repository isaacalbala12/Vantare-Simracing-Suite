import { type ReactNode, useEffect, useRef, useState } from "react";
import { studioContentText as text } from "../../i18n/studio-content.es";
import type { useAppearance } from "../../screens/studio/appearance";
import { Input } from "../Forms";

type Model = ReturnType<typeof useAppearance>;
export function ContentNumber({
  label,
  value,
  min,
  max,
  model,
  integer = true,
  normalize = Number,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  model: Model;
  integer?: boolean;
  normalize?: (value: number) => number;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  const [error, setError] = useState(false);
  const edited = useRef(false);
  const submitted = useRef<number | undefined>(undefined);
  useEffect(() => {
    // A conflict can publish another Hub's value. It does not confirm this edit.
    if (!edited.current || submitted.current === normalize(value)) {
      edited.current = false;
      submitted.current = undefined;
      setDraft(String(value));
      setError(false);
    }
  }, [value, normalize]);
  function commit() {
    if (model.disabled || model.pending) return;
    const number = Number(draft);
    if (
      !draft.trim() ||
      !Number.isFinite(number) ||
      (integer && !Number.isInteger(number)) ||
      number < min ||
      number > max
    ) {
      setError(true);
      return;
    }
    const normalized = normalize(number);
    if (normalized !== normalize(value)) {
      submitted.current = normalized;
      onCommit(normalized);
    } else {
      edited.current = false;
      submitted.current = undefined;
      setDraft(String(value));
    }
  }
  return (
    <Input
      label={label}
      value={draft}
      inputMode={integer ? "numeric" : "decimal"}
      disabled={model.disabled}
      readOnly={model.pending}
      error={
        error
          ? integer
            ? text.invalidNumber(min, max)
            : text.invalidDecimal(min, max)
          : undefined
      }
      onChange={(event) => {
        edited.current = true;
        submitted.current = undefined;
        setDraft(event.target.value);
        setError(false);
      }}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter" && !event.nativeEvent.isComposing) {
          event.preventDefault();
          commit();
        }
      }}
    />
  );
}
export function Group({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="v-studio-appearance-group" aria-label={title}>
      <h3>{title}</h3>
      {children}
    </section>
  );
}
