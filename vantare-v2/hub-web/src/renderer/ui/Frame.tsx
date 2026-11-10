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
export function TitleBar({
  title,
  status,
  actions,
}: {
  title: string;
  status: string;
  actions?: ReactNode;
}) {
  return (
    <header className="v-titlebar">
      <span className="v-section-title">
        <SectionTitle fallback={title} />
      </span>
      <SectionTabsSlot />
      <div className="v-titlebar-actions">
        <span role="status" className="v-simulator-pill">
          {status}
        </span>
        {actions}
      </div>
    </header>
  );
}
export interface NavItem {
  id: string;
  label: string;
  icon: IconName;
  locked?: string;
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
              <Icon name={item.icon} />
              {!collapsed && <span>{item.label}</span>}
              {item.badge}
              {item.locked && <Icon name="i-lock" />}
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
      <IconButton
        label={toggleLabel}
        variant="ghost"
        onClick={onToggle}
        aria-expanded={!collapsed}
      >
        <Icon name="i-panel" />
      </IconButton>
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
