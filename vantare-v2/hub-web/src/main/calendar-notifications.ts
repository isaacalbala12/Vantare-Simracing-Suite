import { Notification, type NotificationConstructorOptions } from "electron";

type Text = Pick<NotificationConstructorOptions, "title" | "body">;
type Service = {
  platform: string;
  supported: () => boolean;
  show: (options: NotificationConstructorOptions) => void;
};
const windows: Service = {
  platform: process.platform,
  supported: () => Notification.isSupported(),
  show: (options) => new Notification(options).show(),
};
/** Only main's trusted native events may call this; it is not a renderer method.
 * Frozen shell.rs:1030-1040 ignores General > toasts for Calendar.
 * gpui_windows/system_notifications.rs:188-190 always emits silent audio.
 * Actions are empty in the actual GPUI path, regardless of its sample preview.
 */
export function notifyCalendar(
  value: Text,
  service: Service = windows,
): boolean {
  if (service.platform !== "win32") return false;
  try {
    if (!service.supported()) return false;
    service.show({ title: value.title, body: value.body, silent: true });
    return true;
  } catch {
    return false;
  }
}
