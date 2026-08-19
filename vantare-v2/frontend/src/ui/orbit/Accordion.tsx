import type { ReactNode } from "react";

export interface AccordionProps {
  title: string;
  /** Resumen mono a la derecha; al abrir baja al 55 % de opacidad. */
  summary?: string;
  open?: boolean;
  onToggle?(o: boolean): void;
  children: ReactNode;
  className?: string;
}

function Chevron() {
  return (
    <svg
      aria-hidden="true"
      className="orbit-acc__chev"
      fill="none"
      focusable="false"
      height={14}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.6}
      viewBox="0 0 14 14"
      width={14}
    >
      <path d="M3 5.25 7 9.25l4-4" />
    </svg>
  );
}

/** `<details>/<summary>` nativos (`08`): teclado y `aria-expanded` gratis. */
export function Accordion({ title, summary, open, onToggle, children, className }: AccordionProps) {
  return (
    <details
      className={["orbit-acc", className].filter(Boolean).join(" ")}
      onToggle={(event) => onToggle?.((event.currentTarget as HTMLDetailsElement).open)}
      open={open}
    >
      <summary aria-expanded={open ?? false}>
        <span className="orbit-acc__title">{title}</span>
        {summary ? <span className="orbit-acc__sum">{summary}</span> : null}
        <Chevron />
      </summary>
      <div className="orbit-acc__body">{children}</div>
    </details>
  );
}
