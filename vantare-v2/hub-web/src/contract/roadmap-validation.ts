import { roadmapMaxDocumentBytes, roadmapMaxItems } from "./generated/contract";
import { exact, record } from "./validation-common";
export function isRoadmap(value: unknown): boolean {
  if (
    !record(value) ||
    !exact(value, ["publication", "stale"]) ||
    typeof value.stale !== "boolean"
  )
    return false;
  if (value.publication === null) return true;
  const p = value.publication;
  return (
    record(p) &&
    exact(p, ["id", "publishedAt", "items"]) &&
    typeof p.id === "string" &&
    typeof p.publishedAt === "string" &&
    Array.isArray(p.items) &&
    p.items.length <= roadmapMaxItems &&
    new TextEncoder().encode(JSON.stringify(p)).length <=
      roadmapMaxDocumentBytes &&
    p.items.every(
      (item) =>
        record(item) &&
        exact(item, [
          "id",
          "section",
          "title",
          "body",
          "area",
          "version",
          "dueDate",
        ]) &&
        [item.id, item.title, item.body].every((v) => typeof v === "string") &&
        ["next", "later", "now", "done"].some(
          (section) => section === item.section,
        ) &&
        [item.area, item.version, item.dueDate].every(
          (v) => v === null || typeof v === "string",
        ),
    )
  );
}
