import { Combobox } from "@base-ui/react/combobox";
import { type ReactNode, useRef, useState } from "react";
import {
  SectionRailSlot,
  SectionTabsSlot,
  SectionTitle,
} from "../app/SectionChrome";
import { Icon, type IconName } from "../assets/icons/Icon";
import { Button, IconButton } from "./Button";
import { Dialog } from "./Layers";
import { TrackedCaps } from "./TrackedCaps";
export function TitleBar({
  title,
  status,
  actions,
  controls,
}: {
  title: string;
  status: string;
  actions?: ReactNode;
  controls?: ReactNode;
}) {
  return (
    <header className="v-titlebar">
      <span className="v-section-title">
        <SectionTitle fallback={title} />
      </span>
      <SectionTabsSlot />
      <div className="v-titlebar-actions">
        {status && (
          <span role="status" className="v-simulator-pill">
            {status}
          </span>
        )}
        {actions}
      </div>
      {controls}
    </header>
  );
}
export interface NavItem {
  id: string;
  label: string;
  icon: IconName;
  locked?: string;
  lockBadge?: boolean;
  badge?: ReactNode;
}
export function Sidebar({
  label,
  groups,
  active,
  collapsed,
  onSelect,
  footer,
}: {
  label: string;
  groups: { label: string; items: NavItem[] }[];
  active: string;
  collapsed: boolean;
  onSelect: (id: string) => void;
  footer: ReactNode;
}) {
  const nav = useRef<HTMLElement>(null);
  const ids = groups.flatMap((group) => group.items.map((item) => item.id));
  const [cursor, setCursor] = useState({ active, id: active });
  const focused =
    cursor.active === active && ids.includes(cursor.id)
      ? cursor.id
      : ids.includes(active)
        ? active
        : ids[0];
  function navigate(event: React.KeyboardEvent<HTMLElement>) {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const buttons = Array.from(
      nav.current?.querySelectorAll<HTMLButtonElement>("button[data-nav]") ??
        [],
    );
    const index = buttons.indexOf(event.target as HTMLButtonElement);
    if (index < 0) return;
    event.preventDefault();
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? buttons.length - 1
          : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) %
            buttons.length;
    const target = buttons[next];
    if (target) {
      setCursor({ active, id: target.dataset.nav ?? active });
      target.focus();
    }
  }
  return (
    <nav
      aria-label={label}
      className={`v-sidebar${collapsed ? " v-sidebar--collapsed" : ""}`}
      ref={nav}
      onKeyDown={navigate}
    >
      <div className="v-sidebar-brand" aria-hidden="true">
        <Icon name="mark" />
      </div>
      {groups.map((group) => (
        <div className="v-nav-group" key={group.label}>
          {!collapsed && <div className="v-caption">{group.label}</div>}
          {group.items.map((item) => (
            <Button
              key={item.id}
              data-nav={item.id}
              variant="ghost"
              aria-current={active === item.id ? "page" : undefined}
              aria-label={item.label}
              aria-disabled={Boolean(item.locked)}
              title={item.locked}
              tabIndex={focused === item.id ? 0 : -1}
              onFocus={() => setCursor({ active, id: item.id })}
              onClick={() => {
                if (!item.locked) onSelect(item.id);
              }}
            >
              <span className="v-nav-symbol">
                <Icon name={item.icon} />
                {collapsed && (item.locked || item.lockBadge) && (
                  <span className="v-nav-lock">
                    <Icon name="v-lock" />
                  </span>
                )}
              </span>
              {!collapsed && <span>{item.label}</span>}
              {!collapsed && item.badge}
              {!collapsed && item.locked && <Icon name="v-lock" />}
            </Button>
          ))}
        </div>
      ))}
      <div className="v-sidebar-footer">{footer}</div>
    </nav>
  );
}
export function ContextRail({
  label,
  collapsed,
  onToggle,
  toggleLabel,
  children,
}: {
  label: string;
  collapsed: boolean;
  onToggle: () => void;
  toggleLabel: string;
  children: ReactNode;
}) {
  return (
    <aside
      aria-label={label}
      className={`v-context${collapsed ? " v-context--collapsed" : ""}`}
    >
      {collapsed && (
        <IconButton
          label={toggleLabel}
          variant="ghost"
          onClick={onToggle}
          aria-expanded={!collapsed}
        >
          <Icon name="i-panel" />
        </IconButton>
      )}
      {!collapsed && <SectionRailSlot fallback={children} />}
    </aside>
  );
}
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="v-page-header">
      <div>
        <h1 tabIndex={-1}>{title}</h1>
        {description && <p className="v-muted">{description}</p>}
      </div>
      {actions}
    </div>
  );
}
export function SectionPageHeader({
  title,
  description,
  search,
}: {
  title: string;
  description?: string;
  search?: ReactNode;
}) {
  return (
    <div className="v-settings-heading">
      <PageHeader title={title} description={description} />
      {search && <div className="v-settings-search">{search}</div>}
    </div>
  );
}
export function StatusAnnouncement({ children }: { children: ReactNode }) {
  return (
    <p className="v-sr-only" role="status" aria-live="polite">
      {children}
    </p>
  );
}
export function CommandPalette({
  title,
  description,
  trigger,
  closeLabel,
  empty,
  commands,
  open,
  onOpenChange,
}: {
  title: string;
  description: string;
  trigger: ReactNode;
  closeLabel: string;
  empty: string;
  commands: {
    id: string;
    label: string;
    disabled?: boolean;
    run: () => void;
  }[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog
      title={title}
      description={description}
      trigger={trigger}
      closeLabel={closeLabel}
      open={open}
      onOpenChange={onOpenChange}
    >
      <Combobox.Root<(typeof commands)[number]>
        items={commands}
        autoHighlight
        itemToStringLabel={(item) => item.label}
        onValueChange={(item) => {
          if (item && !item.disabled) {
            item.run();
            onOpenChange(false);
          }
        }}
        inline
      >
        <Combobox.Input className="v-input" aria-label={title} />
        <Combobox.Empty className="v-muted">{empty}</Combobox.Empty>
        <Combobox.List>
          {(item: (typeof commands)[number]) => (
            <Combobox.Item
              className="v-option"
              key={item.id}
              value={item}
              disabled={item.disabled}
            >
              {item.label}
            </Combobox.Item>
          )}
        </Combobox.List>
      </Combobox.Root>
    </Dialog>
  );
}

export function RailBlock({
  title,
  icon,
  children,
}: {
  title: string;
  icon: IconName;
  children: ReactNode;
}) {
  return (
    <section className="v-rail-block">
      <h2>
        <Icon name={icon} />
        <TrackedCaps>{title}</TrackedCaps>
      </h2>
      <div className="v-rail-block-body">{children}</div>
    </section>
  );
}
export function RailVersion({ children }: { children: ReactNode }) {
  return <strong className="v-rail-version">{children}</strong>;
}
export function RailShortcut({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="v-rail-shortcut">
      <span>{label}</span>
      {children}
    </div>
  );
}
