import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { coreKey, offline } from "../../app/Host";
import { SectionChrome, SectionPanel } from "../../app/SectionChrome";
import { type Section, useUi } from "../../app/UiState";
import { notices as text } from "../../i18n/notifications";
import { NotificationsLayout } from "../../ui/NotificationsLayout";
import type { Destination, Filter } from "./center";
import { useNotifications } from "./NotificationsState";
export function Notifications({ compact = false }: { compact?: boolean }) {
  const center = useNotifications();
  const { filter, setFilter } = center;
  const ui = useUi((state) => state);
  const { data: core = offline } = useQuery({
    queryKey: coreKey,
    queryFn: async () => offline,
    enabled: false,
  });
  const tester =
    core.access.verified && !core.access.blocked && core.access.tester;
  useEffect(() => {
    if (!tester && filter === "beta") setFilter("all");
  }, [tester, filter, setFilter]);
  const canOpen = (action: Destination) =>
    action === "settings:updates" ||
    (core.access.verified && !core.access.blocked);
  function open(id: string, action?: Destination) {
    if (action && !canOpen(action)) return;
    center.read(id);
    if (!action) return;
    const section: Section =
      action === "launcher"
        ? "launcher"
        : action === "settings:updates"
          ? "settings"
          : "testing";
    ui.notices(false);
    ui.navigate(section);
  }
  const content = (
    <NotificationsLayout
      records={center.records.map((record) =>
        record.action && !canOpen(record.action)
          ? { ...record, action: undefined }
          : record,
      )}
      tester={tester}
      compact={compact}
      filter={filter === "beta" && !tester ? "all" : filter}
      onFilter={setFilter}
      onRead={center.read}
      onClear={center.clear}
      onOpen={open}
      onFull={() => {
        ui.notices(false);
        ui.navigate("notifications");
      }}
    />
  );
  if (compact) return content;
  const filters = [
    "all",
    "unread",
    "launcher",
    "beta",
    "report",
    "system",
  ] as const;
  const active = filter === "beta" && !tester ? "all" : filter;
  return (
    <>
      <SectionChrome
        title={text.title}
        tabs={filters.map((id) => ({
          id,
          etiqueta: text[id],
          visible: id !== "beta" || tester,
        }))}
        activeTab={active}
        onTabChange={(id) => {
          if (filters.includes(id as Filter) && (id !== "beta" || tester))
            setFilter(id as Filter);
        }}
      />
      <SectionPanel activeTab={active}>{content}</SectionPanel>
    </>
  );
}
