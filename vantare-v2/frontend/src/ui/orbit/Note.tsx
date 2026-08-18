import type { ReactNode } from "react";

export interface NoteProps {
  title?: string;
  children: ReactNode;
  className?: string;
}

/** Nota ámbar de fixture o limitación conocida (honestidad de datos). */
export function Note({ title, children, className }: NoteProps) {
  return (
    <p className={["orbit-note", className].filter(Boolean).join(" ")}>
      {title ? <b>{title} </b> : null}
      {children}
    </p>
  );
}
