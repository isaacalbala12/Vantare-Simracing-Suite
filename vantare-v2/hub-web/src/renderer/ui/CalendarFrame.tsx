import { type ReactNode, useId } from "react";
import { Icon } from "../assets/icons/Icon";
import { calendarText as text } from "../i18n/calendar";
import { Button, IconButton } from "./Button";
import "../design/generated/calendar-tokens.css";
import "./calendar-layout.css";
import "./calendar-density.css";
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
  onAlerts?: () => void;
  onExport?: () => void;
  onRefresh: () => void;
  children: ReactNode;
}) {
  const alertsCountId = useId();
  return (
    <div className="v-calendar">
      <header className="v-calendar-header">
        <div>
          <h1>{text.title}</h1>
          <p title={subtitle}>{subtitle}</p>
        </div>
        <div className="v-calendar-header-actions">
          <Button
            onClick={onAlerts}
            disabled={!onAlerts}
            aria-label={text.alerts}
            aria-describedby={alertsCountId}
          >
            <Icon name="bell-fill" />
            <span className="v-calendar-header-long">{text.alerts}</span>
            <span
              id={alertsCountId}
              className="v-calendar-pill v-calendar-pill--accent"
            >
              {count}
            </span>
          </Button>
          <Button
            onClick={onExport}
            disabled={!onExport}
            aria-label={text.export}
          >
            <Icon name="v-calendar" />
            <span className="v-calendar-header-long">{text.export}</span>
            <span className="v-calendar-header-short" aria-hidden="true">
              {text.calendar}
            </span>
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
