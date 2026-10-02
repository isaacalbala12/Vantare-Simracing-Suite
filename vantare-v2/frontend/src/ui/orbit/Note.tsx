import type { ReactNode } from "react";
import { cx } from "./cx";

export interface NoteProps {
  title?: string;
  children: ReactNode;
  className?: string;
}

/** Nota ámbar de fixture o limitación conocida (honestidad de datos). */
export function Note({ title, children, className }: NoteProps) {
  return (
    <p className={cx("orbit-note", className)}>
      {title ? <b>{title} </b> : null}
      {children}
    </p>
  );
}
