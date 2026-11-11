import type { ReactNode } from "react";
import { Icon } from "../assets/icons/Icon";
import { calendarText as text } from "../i18n/calendar";
import { Button, IconButton } from "./Button";
import "./calendar-layout.css";
export function CalendarFrame({
  subtitle,
  count,
  busy,
  onAlerts,
  onExport,
  onRefresh,
  children,
}: {
  subtitle: string;
  count: number;
  busy: boolean;
  onAlerts: () => void;
  onExport: () => void;
  onRefresh: () => void;
  children: ReactNode;
}) {
  return (
    <div className="v-calendar">
      <header className="v-calendar-header">
        <div>
          <h1>{text.title}</h1>
          <p>{subtitle}</p>
        </div>
        <div className="v-calendar-header-actions">
          <Button onClick={onAlerts}>
            <Icon name="bell-fill" />
            {text.alerts}
            <span className="v-calendar-pill v-calendar-pill--accent">
              {count}
            </span>
          </Button>
          <Button onClick={onExport}>
            <Icon name="v-calendar" />
            {text.export}
          </Button>
          <IconButton
            label={text.refresh}
            variant="ghost"
            onClick={onRefresh}
            busy={busy}
          >
            <Icon name="refresh" />
          </IconButton>
        </div>
      </header>
      {children}
    </div>
  );
}
