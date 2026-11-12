import { useQuery } from "@tanstack/react-query";
import { coreKey, offline } from "../../app/Host";
import { useUi } from "../../app/UiState";
import { notices as text } from "../../i18n/notifications";
import { NotificationPopover } from "../../ui/NotificationPopover";
import { filtered } from "./center";
import { Notifications } from "./Notifications";
import { useNotifications } from "./NotificationsState";
export function NotificationsPopover() {
  const center = useNotifications();
  const { data: core = offline } = useQuery({
    queryKey: coreKey,
    queryFn: async () => offline,
    enabled: false,
  });
  const tester =
    core.access.verified && !core.access.blocked && core.access.tester;
  const unread = filtered(center.records, "unread", tester).length;
  const open = useUi((state) => state.noticesOpen);
  const setOpen = useUi((state) => state.notices);
  return (
    <NotificationPopover
      label={text.title}
      open={open}
      onOpenChange={setOpen}
      unread={unread}
    >
      <Notifications compact />
    </NotificationPopover>
  );
}
