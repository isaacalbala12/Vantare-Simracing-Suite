import { Fragment } from "react";
import { cx } from "./cx";

export interface KbdProps {
  keys: string[];
  /** Keycap físico de Atajos (30×28, borde inferior 2.5px). */
  physical?: boolean;
  empty?: boolean;
  conflict?: boolean;
  className?: string;
}

export function Kbd({ keys, physical, empty, conflict, className }: KbdProps) {
  const classes = cx("orbit-kbd", physical ? "orbit-kbd--physical" : null, empty ? "orbit-kbd--empty" : null, conflict ? "orbit-kbd--conflict" : null, className);

  return (
    <span className={classes}>
      {keys.map((key, index) => (
        <Fragment key={`${key}-${index}`}>
          {index > 0 ? (
            <i aria-hidden="true" className="orbit-kbd__sep">
              +
            </i>
          ) : null}
          <kbd>{key}</kbd>
        </Fragment>
      ))}
    </span>
  );
}
