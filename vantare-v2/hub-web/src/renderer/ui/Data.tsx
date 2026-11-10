import { Avatar as BaseAvatar } from "@base-ui/react/avatar";
import { Progress as BaseProgress } from "@base-ui/react/progress";
import { useVirtualizer } from "@tanstack/react-virtual";
import { type CSSProperties, type ReactNode, useRef } from "react";
import { TrackedCaps } from "./TrackedCaps";
export function SettingGroup({
  number,
  title,
  children,
}: {
  number: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="v-setting-group">
      <h2
        className="v-setting-group-title"
        aria-label={`${String(number).padStart(2, "0")} ${title}`}
      >
        <span>{String(number).padStart(2, "0")}</span>
        <TrackedCaps>{title}</TrackedCaps>
        <i aria-hidden="true" />
      </h2>
      <div className="v-card v-setting-group-card">{children}</div>
    </section>
  );
}
export function Card({
  title,
  actions,
  children,
  footer,
  variant = "neo",
}: {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  variant?: "neo" | "now" | "hero";
}) {
  return (
    <section className={`v-card v-card--${variant}`}>
      <div className="v-card-header">
        <h2>{title}</h2>
        {actions}
      </div>
      <div className="v-card-body">{children}</div>
      {footer && <footer className="v-card-footer">{footer}</footer>}
    </section>
  );
}
export function SettingRow({
  label,
  description,
  children,
  note,
}: {
  label: string;
  description?: string;
  children: ReactNode;
  note?: ReactNode;
}) {
  return (
    <div className="v-setting-row">
      <div>
        <div className="v-setting-label">{label}</div>
        {description && <p className="v-muted">{description}</p>}
        {note}
      </div>
      <div className="v-setting-control">{children}</div>
    </div>
  );
}
export function Badge({
  children,
  tone = "beta",
}: {
  children: ReactNode;
  tone?: "beta" | "tester" | "pro" | "locked" | "live" | "count";
}) {
  return <span className={`v-badge v-badge--${tone}`}>{children}</span>;
}
export const Chip = Badge;
export const Pill = Badge;
export function Keycap({ children }: { children: ReactNode }) {
  return <kbd className="v-keycap">{children}</kbd>;
}
export function Callout({
  title,
  children,
  actions,
  tone = "info",
}: {
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
  tone?: "info" | "warn" | "err";
}) {
  return (
    <div
      role={tone === "err" ? "alert" : "status"}
      className={`v-callout v-callout--${tone}`}
    >
      <strong>{title}</strong>
      {children && <div>{children}</div>}
      {actions}
    </div>
  );
}
export function Spinner({ label }: { label: string }) {
  return <span role="status" aria-label={label} className="v-spinner" />;
}
export function Skeleton({ label }: { label: string }) {
  return <span role="status" aria-label={label} className="v-skeleton" />;
}
export function Progress({
  label,
  value,
}: {
  label: string;
  value: number | null;
}) {
  return (
    <BaseProgress.Root value={value} className="v-progress">
      <BaseProgress.Label>{label}</BaseProgress.Label>
      <BaseProgress.Track className="v-progress-track">
        <BaseProgress.Indicator className="v-progress-indicator" />
      </BaseProgress.Track>
    </BaseProgress.Root>
  );
}
export function Avatar({
  label,
  initials,
  src,
}: {
  label: string;
  initials: string;
  src?: string;
}) {
  return (
    <BaseAvatar.Root className="v-avatar">
      <BaseAvatar.Image
        src={src?.startsWith("data:image/") ? src : undefined}
        alt={label}
      />
      <BaseAvatar.Fallback aria-label={label}>{initials}</BaseAvatar.Fallback>
    </BaseAvatar.Root>
  );
}
export function Table({
  caption,
  columns,
  rows,
  empty,
  error,
  loading = false,
}: {
  caption: string;
  columns: { key: string; label: string }[];
  rows: { id: string; cells: ReactNode[] }[];
  empty: string;
  error?: string;
  loading?: boolean;
}) {
  const scroll = useRef<HTMLElement>(null);
  const virtual = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scroll.current,
    estimateSize: () => {
      const height = Number.parseFloat(
        getComputedStyle(
          scroll.current ?? document.documentElement,
        ).getPropertyValue("--row-h"),
      );
      if (!Number.isFinite(height) || height <= 0)
        throw new Error("Missing --row-h token");
      return height;
    },
    overscan: 5,
    enabled: rows.length > 200,
  });
  const items = virtual.getVirtualItems();
  const shown =
    rows.length > 200
      ? items.map((item) => ({ row: rows[item.index], index: item.index }))
      : rows.map((row, index) => ({ row, index }));
  const before = items[0]?.start ?? 0;
  const after = items.length
    ? virtual.getTotalSize() - (items.at(-1)?.end ?? 0)
    : 0;
  return (
    <section
      className="v-table-scroll"
      aria-label={caption}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: A scrollable table region needs keyboard focus, verified by axe.
      tabIndex={0}
      ref={scroll}
      aria-busy={loading || undefined}
    >
      {error ? (
        <Callout title={error} tone="err" />
      ) : (
        <table className="v-table" aria-rowcount={rows.length + 1}>
          <caption>{caption}</caption>
          <thead>
            <tr>
              {columns.map((column) => (
                <th scope="col" key={column.key}>
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody
            className="v-table-body"
            style={
              {
                "--virtual-before": `${before}px`,
                "--virtual-after": `${after}px`,
              } as CSSProperties
            }
          >
            {rows.length ? (
              shown.map(({ row, index }) => (
                <tr key={row.id} aria-rowindex={index + 2}>
                  {columns.map((column, index) => (
                    <td key={column.key}>{row.cells[index]}</td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={columns.length}>
                  {loading ? <Skeleton label={caption} /> : empty}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </section>
  );
}
