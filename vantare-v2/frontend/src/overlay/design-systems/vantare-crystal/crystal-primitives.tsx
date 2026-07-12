import type { ReactNode } from "react";

export type CrystalStatus =
  | "live"
  | "idle"
  | "missing"
  | "stale"
  | "disconnected"
  | "error";

type PrimitiveProps = {
  children?: ReactNode;
  className?: string;
  "aria-label"?: string;
};

function primitiveClass(baseClass: string, className?: string): string {
  return className ? `${baseClass} ${className}` : baseClass;
}

export function CrystalSurface({ children, className, "aria-label": ariaLabel }: PrimitiveProps) {
  return (
    <section
      data-widget-system="vantare-crystal"
      data-crystal-primitive="surface"
      className={primitiveClass("crystal-surface", className)}
      aria-label={ariaLabel}
    >
      {children}
    </section>
  );
}

type CrystalHeaderProps = PrimitiveProps & {
  title?: ReactNode;
  meta?: ReactNode;
};

export function CrystalHeader({ children, className, title, meta }: CrystalHeaderProps) {
  return (
    <header
      data-widget-system="vantare-crystal"
      data-crystal-primitive="header"
      className={primitiveClass("crystal-header", className)}
    >
      <div className="crystal-header-content">
        {children}
        {title !== undefined ? <span className="crystal-header-title">{title}</span> : null}
      </div>
      {meta !== undefined ? <span className="crystal-header-meta">{meta}</span> : null}
    </header>
  );
}

export function CrystalBrand({ children, className }: PrimitiveProps) {
  return (
    <span
      data-widget-system="vantare-crystal"
      data-crystal-primitive="brand"
      className={primitiveClass("crystal-brand", className)}
    >
      {children}
    </span>
  );
}

type CrystalPillProps = PrimitiveProps & {
  tone?: "gaining" | "losing" | "neutral";
};

export function CrystalPill({ children, className, tone = "neutral" }: CrystalPillProps) {
  return (
    <span
      data-widget-system="vantare-crystal"
      data-crystal-primitive="pill"
      data-tone={tone}
      className={primitiveClass("crystal-pill", className)}
    >
      {children}
    </span>
  );
}

export function CrystalFooter({ children, className }: PrimitiveProps) {
  return (
    <footer
      data-widget-system="vantare-crystal"
      data-crystal-primitive="footer"
      className={primitiveClass("crystal-footer", className)}
    >
      {children}
    </footer>
  );
}

type CrystalTableRowProps = PrimitiveProps & {
  selected?: boolean;
  status?: CrystalStatus;
};

export function CrystalTableRow({ children, className, selected = false, status }: CrystalTableRowProps) {
  return (
    <div
      data-widget-system="vantare-crystal"
      data-crystal-primitive="table-row"
      data-selected={selected ? "true" : undefined}
      data-status={status}
      className={primitiveClass("crystal-table-row", className)}
      role="row"
    >
      {children}
    </div>
  );
}

type CrystalStatusFrameProps = PrimitiveProps & {
  status: CrystalStatus;
  message?: ReactNode;
};

export function CrystalStatusFrame({ children, className, message, status }: CrystalStatusFrameProps) {
  return (
    <div
      data-widget-system="vantare-crystal"
      data-crystal-primitive="status-frame"
      data-status={status}
      className={primitiveClass("crystal-status-frame", className)}
      role="status"
    >
      {message !== undefined ? <span className="crystal-status-message">{message}</span> : children}
    </div>
  );
}

