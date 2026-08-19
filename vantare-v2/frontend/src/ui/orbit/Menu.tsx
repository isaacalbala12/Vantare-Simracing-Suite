import { cloneElement, useEffect, useId, useRef, useState, type ReactElement } from "react";

export interface MenuItem {
  id: string;
  title: string;
  description?: string;
  onSelect(): void;
}

export interface MenuProps {
  trigger: ReactElement<{
    onClick?: () => void;
    "aria-haspopup"?: string;
    "aria-expanded"?: boolean;
    "aria-controls"?: string;
  }>;
  items: MenuItem[];
  label: string;
  className?: string;
}

/** Menú ⚙: cierra con clic fuera **y** con `Esc` (deuda del prototipo, `08`). */
export function Menu({ trigger, items, label, className }: MenuProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className={["orbit-menu-wrap", className].filter(Boolean).join(" ")} ref={wrapRef}>
      {cloneElement(trigger, {
        onClick: () => setOpen((value) => !value),
        "aria-haspopup": "menu",
        "aria-expanded": open,
        "aria-controls": menuId,
      })}
      {open ? (
        <div aria-label={label} className="orbit-menu" id={menuId} role="menu">
          {items.map((item) => (
            <button
              className="orbit-menu__item"
              key={item.id}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              role="menuitem"
              type="button"
            >
              <b>{item.title}</b>
              {item.description ? <span>{item.description}</span> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
