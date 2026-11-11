import type { HomeProfile } from "../../../contract/generated/contract";
import { homeText as t } from "../../i18n/home";
export function greeting(name: string, now: Date): string {
  return name
    ? `${now.getHours() < 12 ? t.morning : now.getHours() < 20 ? t.afternoon : t.night}, ${name}`
    : t.welcome;
}
export function profileChoice(
  profiles: HomeProfile[],
  favorite: string | null,
  selected?: string,
): string {
  return selected !== undefined && profiles.some((p) => p.id === selected)
    ? selected
    : (favorite ?? profiles[0]?.id ?? "");
}
export function activityDate(value: number): string {
  const d = new Date(value);
  return Number.isFinite(d.getTime())
    ? `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")} · ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
    : t.noDate;
}
