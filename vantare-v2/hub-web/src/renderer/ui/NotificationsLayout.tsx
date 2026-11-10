import { notificationHistoryLimit } from "../../contract/generated/contract";
import { Icon, type IconName } from "../assets/icons/Icon";
import { notices as text } from "../i18n/notifications";
import {
  type Destination,
  dateGroup,
  type Filter,
  filtered,
  type Notice,
} from "../screens/notifications/center";
import { Segmented } from "./Forms";
import "./notifications.css";

const icons: Record<Notice["source"], IconName> = {
  launcher: "v-launch",
  updater: "v-download",
  system: "v-bell",
  beta: "v-testing",
  report: "v-testing",
};
export function NotificationsLayout({
  records,
  tester,
  compact,
  filter,
  onFilter,
  onRead,
  onClear,
  onOpen,
  onFull,
  now = new Date(),
}: {
  records: Notice[];
  tester: boolean;
  compact: boolean;
  filter: Filter;
  onFilter: (filter: Filter) => void;
  onRead: (id?: string) => void;
  onClear: () => void;
  onOpen: (id: string, action?: Destination) => void;
  onFull: () => void;
  now?: Date;
}) {
  const visible = filtered(records, filter, tester);
  const unread = filtered(records, "unread", tester).length;
  const groups = (["today", "yesterday", "week", "earlier", "undated"] as const)
    .map((group) => ({
      group,
      items: visible.filter(
        (record) => dateGroup(record.occurredAt, now) === group,
      ),
    }))
    .filter((group) => group.items.length);
  return (
    <section
      className={`v-notifications ${compact ? "v-notifications--compact" : "v-notifications--full"}`}
      aria-label={text.title}
    >
      <header>
        <h1>{text.title}</h1>
        <span className="v-notification-count" data-unread={unread > 0}>
          {text.count(unread)}
        </span>
        <button type="button" disabled={!unread} onClick={() => onRead()}>
          {text.readAll}
        </button>
      </header>
      {compact && (
        <div className="v-notifications-filters">
          <Segmented
            label={text.filters}
            value={filter}
            onChange={(value) => {
              if (
                [
                  "all",
                  "unread",
                  "launcher",
                  "beta",
                  "report",
                  "system",
                ].includes(value) &&
                (value !== "beta" || tester)
              )
                onFilter(value as Filter);
            }}
            options={(
              ["all", "unread", "launcher", "beta", "report", "system"] as const
            )
              .filter((value) => value !== "beta" || tester)
              .map((value) => ({
                value,
                label:
                  value === "unread"
                    ? `${text.unread} · ${unread}`
                    : text[value],
              }))}
          />
        </div>
      )}
      <div className="v-notifications-history">
        {!visible.length ? (
          <div className="v-notifications-empty">
            <span>
              <Icon name="v-bell" />
            </span>
            <strong>{text.empty}</strong>
            <p>{records.length ? text.emptyFilter : text.emptyHelp}</p>
          </div>
        ) : (
          groups.map(({ group, items }) => (
            <div key={group}>
              <h2>{text[group]}</h2>
              {items.map((record) => (
                <article
                  key={record.id}
                  className={`v-notification v-notification--${record.severity}`}
                  data-unread={record.unread}
                >
                  <span className="v-notification-icon">
                    <Icon name={icons[record.source]} />
                  </span>
                  <div className="v-notification-body">
                    <header>
                      <strong>{record.title}</strong>
                      <time
                        dateTime={new Date(record.occurredAt).toISOString()}
                      >
                        {new Date(record.occurredAt).toLocaleTimeString("es", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                        {record.unread && (
                          <i role="img" aria-label={text.unread} />
                        )}
                      </time>
                    </header>
                    <p>{record.text}</p>
                    <div className="v-notification-actions">
                      {record.action && (
                        <button
                          type="button"
                          onClick={() => onOpen(record.id, record.action)}
                        >
                          {record.action === "launcher"
                            ? text.openLauncher
                            : record.action === "settings:updates"
                              ? text.openSettings
                              : text.openReport}
                        </button>
                      )}
                      {record.unread ? (
                        <button type="button" onClick={() => onRead(record.id)}>
                          {text.read}
                        </button>
                      ) : (
                        !record.action && <span>{text.readState}</span>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ))
        )}
      </div>
      <footer>
        <span>{text.history(notificationHistoryLimit)}</span>
        <button type="button" disabled={!records.length} onClick={onClear}>
          {text.clear}
        </button>
      </footer>
      {compact && records.length > 0 && (
        <button type="button" onClick={onFull}>
          {text.full}
        </button>
      )}
    </section>
  );
}
