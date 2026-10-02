import { cx } from "./cx";
export interface TyreChipProps {
  compound: "soft" | "medium" | "hard";
  className?: string;
}

const LETTER: Record<TyreChipProps["compound"], string> = {
  soft: "S",
  medium: "M",
  hard: "H",
};

/** El color nunca va solo (`08`): el compuesto también se escribe. */
export function TyreChip({ compound, className }: TyreChipProps) {
  return (
    <span
      className={cx("orbit-tyre-chip", `orbit-tyre-chip--${compound}`, className)}
    >
      <i aria-hidden="true" />
      {LETTER[compound]}
    </span>
  );
}
