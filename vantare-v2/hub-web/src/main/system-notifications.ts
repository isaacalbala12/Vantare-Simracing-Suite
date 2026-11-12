import { Notification } from "electron";
/** Trusted main-process input only. No renderer-facing API accepts this shape. */
export interface SystemNotice { title: string; body: string; silent: boolean }
export function presentSystemNotice(value: SystemNotice): boolean {
  if (process.platform !== "win32" || !Notification.isSupported()) return false;
  try {
    const notice = new Notification(value);
    notice.on("failed", () => console.error("System notification presentation failed"));
    notice.show();
    return true;
  } catch { return false; }
}
