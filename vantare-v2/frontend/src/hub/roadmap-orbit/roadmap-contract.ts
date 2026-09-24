export type RoadmapSection = "now" | "next" | "done";
export type RoadmapLocale = "es" | "en" | "pt" | "it";
export const ROADMAP_LOCALES: readonly RoadmapLocale[] = ["es", "en", "pt", "it"];
export const ROADMAP_SECTIONS: readonly RoadmapSection[] = ["now", "next", "done"];

type LocalizedText = Record<RoadmapLocale, string>;
export type RoadmapItem = {
  id: string;
  section: RoadmapSection;
  title: LocalizedText;
  body: LocalizedText;
};
export type RoadmapDocument = { schemaVersion: 1; items: RoadmapItem[] };
export type RoadmapPublication = {
  id: string;
  document: RoadmapDocument;
  published_at?: string;
};

export function emptyDocument(): RoadmapDocument {
  return { schemaVersion: 1, items: [] };
}

export function newItem(): RoadmapItem {
  const blank = (): LocalizedText => ({ es: "", en: "", pt: "", it: "" });
  return { id: crypto.randomUUID(), section: "next", title: blank(), body: blank() };
}

export function validateDocument(document: RoadmapDocument): string | null {
  if (!document || document.schemaVersion !== 1 || !Array.isArray(document.items) || document.items.length > 40) return "size";
  const ids = new Set<string>();
  for (const item of document.items) {
    if (!item || typeof item.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(item.id) || ids.has(item.id)) return "id";
    ids.add(item.id);
    if (!ROADMAP_SECTIONS.includes(item.section)) return "section";
    for (const locale of ROADMAP_LOCALES) {
      if (typeof item.title?.[locale] !== "string" || item.title[locale].length > 120 || (locale === "es" && !item.title.es.trim())) return "title";
      if (typeof item.body?.[locale] !== "string" || item.body[locale].length > 600) return "body";
    }
  }
  if (JSON.stringify(document).length > 40000) return "size";
  return null;
}

export function parsePublication(value: unknown): RoadmapPublication | null {
  if (!value || typeof value !== "object") return null;
  const publication = value as RoadmapPublication;
  if (typeof publication.id !== "string" || !publication.document) return null;
  if (!Array.isArray(publication.document.items)) return null;
  if (validateDocument(publication.document)) return null;
  return publication;
}
