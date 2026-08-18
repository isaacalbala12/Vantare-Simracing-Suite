import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

export interface SelectOption<T extends string> {
  value: T;
  label: string;
  disabled?: boolean;
  /** Slot delante de la etiqueta (p. ej. el punto de color del piloto). */
  leading?: ReactNode;
  /** Agrupador opcional: las opciones con el mismo texto se dibujan juntas. */
  group?: string;
}

export interface SelectProps<T extends string> {
  value: T;
  options: SelectOption<T>[];
  onChange(v: T): void;
  label: string;
  width?: number;
  id?: string;
  disabled?: boolean;
  className?: string;
  /**
   * Vía nativa (`<select>`), solo para entornos que necesiten el control del
   * sistema. El desplegable propio es el camino por defecto del kit.
   */
  native?: boolean;
}

/** Filas de 38 px: a partir de 8 opciones la lista hace scroll interno. */
const ROW_H = 38;
const MAX_VISIBLE = 8;
const LIST_PAD = 12;
const GROUP_H = 26;
const GAP = 6;
const TYPEAHEAD_MS = 700;

type Placement = { left: number; top: number; width: number; up: boolean; maxHeight: number };

function nextEnabled<T extends string>(
  options: SelectOption<T>[],
  from: number,
  step: number,
): number {
  if (options.length === 0) return -1;
  let index = from;
  for (let i = 0; i < options.length; i += 1) {
    index += step;
    if (index < 0) index = options.length - 1;
    if (index >= options.length) index = 0;
    if (!options[index]?.disabled) return index;
  }
  return from;
}

function firstEnabled<T extends string>(options: SelectOption<T>[], step: 1 | -1): number {
  const start = step === 1 ? -1 : options.length;
  return nextEnabled(options, start, step);
}

/**
 * Combobox del kit Orbit: mismo aspecto de trigger que el `<select>` nativo
 * (altura, chevrón, ancho opcional) pero con lista flotante propia, para que el
 * desplegable no sea el del sistema operativo.
 *
 * Roles ARIA `combobox`/`listbox`/`option`, teclado completo (↑↓ Home End
 * Enter Esc y typeahead) y cierre por clic fuera o `Esc` (`08-accesibilidad`).
 */
export function Select<T extends string>({
  value,
  options,
  onChange,
  label,
  width,
  id,
  disabled,
  className,
  native,
}: SelectProps<T>) {
  const reactId = useId();
  const listId = `orbit-select-list-${reactId}`;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const typeahead = useRef({ text: "", at: 0 });
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [place, setPlace] = useState<Placement | null>(null);

  const selectedIndex = useMemo(
    () => options.findIndex((option) => option.value === value),
    [options, value],
  );
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;
  const style = width ? ({ "--orbit-select-w": `${width}px` } as CSSProperties) : undefined;

  // Los consumidores crean el array de opciones en cada render: `measure` no
  // puede depender de su identidad o el efecto se reengancharía sin fin. Basta
  // con el alto que necesita la lista, que sí es un número estable.
  const wanted = useMemo(() => {
    const rows = Math.min(options.length, MAX_VISIBLE);
    const groups = new Set(options.map((option) => option.group).filter(Boolean)).size;
    return rows * ROW_H + groups * GROUP_H + LIST_PAD;
  }, [options]);

  const measure = useCallback(() => {
    const node = triggerRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom - GAP - 8;
    const above = rect.top - GAP - 8;
    const up = below < Math.min(wanted, 160) && above > below;
    const maxHeight = Math.max(120, Math.min(wanted, up ? above : below));
    const next: Placement = {
      left: Math.max(8, Math.min(rect.left, window.innerWidth - rect.width - 8)),
      top: up ? rect.top - GAP - maxHeight : rect.bottom + GAP,
      width: rect.width,
      up,
      maxHeight,
    };
    setPlace((current) =>
      current &&
      current.left === next.left &&
      current.top === next.top &&
      current.width === next.width &&
      current.up === next.up &&
      current.maxHeight === next.maxHeight
        ? current
        : next,
    );
    // `setPlace` con un objeto nuevo solo re-renderiza si algo cambió.
  }, [wanted]);

  useLayoutEffect(() => {
    if (!open) return;
    measure();
  }, [measure, open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || listRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onReflow = () => measure();
    document.addEventListener("mousedown", onPointerDown);
    window.addEventListener("resize", onReflow);
    window.addEventListener("scroll", onReflow, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("resize", onReflow);
      window.removeEventListener("scroll", onReflow, true);
    };
  }, [measure, open]);

  // La opción activa se mantiene a la vista cuando la lista hace scroll interno.
  useEffect(() => {
    if (!open || active < 0) return;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const openList = useCallback(
    (start: "selected" | "first" | "last") => {
      if (disabled) return;
      setOpen(true);
      setActive(
        start === "selected" && selectedIndex >= 0
          ? selectedIndex
          : start === "last"
            ? firstEnabled(options, -1)
            : firstEnabled(options, 1),
      );
    },
    [disabled, options, selectedIndex],
  );

  const close = useCallback((focus = true) => {
    setOpen(false);
    setActive(-1);
    if (focus) triggerRef.current?.focus();
  }, []);

  const commit = useCallback(
    (index: number) => {
      const option = options[index];
      if (!option || option.disabled) return;
      if (option.value !== value) onChange(option.value);
      close();
    },
    [close, onChange, options, value],
  );

  const runTypeahead = useCallback(
    (key: string) => {
      const now = Date.now();
      const state = typeahead.current;
      state.text = now - state.at > TYPEAHEAD_MS ? key : state.text + key;
      state.at = now;
      const query = state.text.toLowerCase();
      const from = active >= 0 ? active : selectedIndex;
      const order = options.map((_, i) => (from + 1 + i) % options.length);
      const hit = (state.text.length === 1 ? order : options.map((_, i) => i)).find((index) => {
        const option = options[index];
        return !option.disabled && option.label.toLowerCase().startsWith(query);
      });
      if (hit === undefined) return;
      if (open) setActive(hit);
      else commit(hit);
    },
    [active, commit, open, options, selectedIndex],
  );

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      if (open) {
        event.preventDefault();
        close();
      }
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        openList(event.key === "ArrowDown" ? "selected" : "selected");
        return;
      }
      setActive((current) => nextEnabled(options, current, event.key === "ArrowDown" ? 1 : -1));
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      if (!open) return;
      event.preventDefault();
      setActive(firstEnabled(options, event.key === "Home" ? 1 : -1));
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (!open) {
        openList("selected");
        return;
      }
      commit(active);
      return;
    }
    if (event.key === "Tab") {
      if (open) close(false);
      return;
    }
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      runTypeahead(event.key);
    }
  };

  if (native) {
    return (
      <select
        aria-label={label}
        className={["orbit-select", className].filter(Boolean).join(" ")}
        disabled={disabled}
        id={id}
        onChange={(event) => onChange(event.target.value as T)}
        style={style}
        value={value}
      >
        {options.map((option) => (
          <option disabled={option.disabled} key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }

  const list =
    open && place ? (
      <div
        aria-label={label}
        className="orbit-select__list"
        data-testid={`orbit-select-list-${id ?? reactId}`}
        data-up={place.up ? "true" : undefined}
        id={listId}
        ref={listRef}
        role="listbox"
        style={{
          left: place.left,
          top: place.top,
          minWidth: place.width,
          maxHeight: place.maxHeight,
        }}
      >
        {options.map((option, index) => {
          const head =
            option.group && option.group !== options[index - 1]?.group ? option.group : null;
          return (
            <div key={option.value}>
              {head ? (
                <div className="orbit-select__group" role="presentation">
                  {head}
                </div>
              ) : null}
              <div
                aria-disabled={option.disabled ? true : undefined}
                aria-selected={option.value === value}
                className="orbit-select__option"
                data-active={index === active ? "true" : undefined}
                data-index={index}
                id={`${listId}-${index}`}
                onClick={() => commit(index)}
                onMouseEnter={() => {
                  if (!option.disabled) setActive(index);
                }}
                role="option"
              >
                {option.leading ? (
                  <span className="orbit-select__lead">{option.leading}</span>
                ) : null}
                <span className="orbit-select__label">{option.label}</span>
                <span aria-hidden="true" className="orbit-select__tick">
                  {option.value === value ? "✓" : null}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    ) : null;

  return (
    <>
      <button
        aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
        aria-controls={open ? listId : undefined}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={label}
        className={["orbit-select", className].filter(Boolean).join(" ")}
        data-open={open ? "true" : undefined}
        disabled={disabled}
        id={id}
        onClick={() => (open ? close() : openList("selected"))}
        onKeyDown={onKeyDown}
        ref={triggerRef}
        role="combobox"
        style={style}
        type="button"
      >
        {selected?.leading ? (
          <span className="orbit-select__lead">{selected.leading}</span>
        ) : null}
        <span className="orbit-select__value">{selected?.label ?? ""}</span>
      </button>
      {list && typeof document !== "undefined" ? createPortal(list, document.body) : null}
    </>
  );
}
