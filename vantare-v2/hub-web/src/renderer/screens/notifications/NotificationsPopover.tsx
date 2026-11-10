import { useUi } from "../../app/UiState";
import { notices as text } from "../../i18n/notifications";
import { NotificationPopover } from "../../ui/NotificationPopover";
import { Notifications } from "./Notifications";
export function NotificationsPopover() {
  const open = useUi((state) => state.noticesOpen);
  const setOpen = useUi((state) => state.notices);
  return (
    <NotificationPopover label={text.title} open={open} onOpenChange={setOpen}>
      <Notifications compact />
    </NotificationPopover>
  );
}
