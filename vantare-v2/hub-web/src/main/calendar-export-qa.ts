import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { calendarReferenceNow } from "../mock/calendar-reference";
// Trusted QA bootstrap only. No renderer path, native picker or real user file.
export function calendarExportQa(
  qa: boolean,
  host: string | undefined,
  scene: string | undefined,
  dataDirectory: string,
) {
  if (
    !qa ||
    host !== "mock" ||
    !/^visual-(dark|light):calendar-ics-replace-reference$/.test(scene ?? "")
  )
    return undefined;
  return {
    now: () => calendarReferenceNow,
    async pick() {
      const directory = join(dataDirectory, "qa-calendar-replacement");
      await mkdir(directory, { recursive: true });
      const path = join(directory, "calendar.ics");
      await writeFile(path, "BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n", {
        flag: "wx",
      }).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "EEXIST") throw error;
      });
      return path;
    },
  };
}
