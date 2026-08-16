export type ReleaseNews = {
  tag: string;
  channel: "nightly" | "testers" | "master";
  title: string;
  summary: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function normalizeReleaseNews(value: unknown): ReleaseNews | null {
  if (!isRecord(value) || value.schemaVersion !== 1) return null;
  if (value.channel !== "nightly" && value.channel !== "testers" && value.channel !== "master") return null;
  if (typeof value.tag !== "string" || !value.tag.trim()) return null;
  if (typeof value.title !== "string" || !value.title.trim()) return null;
  if (typeof value.summary !== "string" || !value.summary.trim()) return null;

  return {
    tag: value.tag.trim(),
    channel: value.channel,
    title: value.title.trim(),
    summary: value.summary.trim(),
  };
}

export function sortReleaseNews(releases: ReadonlyArray<ReleaseNews>): ReleaseNews[] {
  return [...releases].sort((a, b) =>
    b.tag.localeCompare(a.tag, undefined, { numeric: true, sensitivity: "base" }),
  );
}

const releaseManifestModules = import.meta.glob("../../../docs/releases/*.json", {
  eager: true,
  import: "default",
});

export const RELEASE_NEWS: ReadonlyArray<ReleaseNews> = sortReleaseNews(
  Object.values(releaseManifestModules)
    .map(normalizeReleaseNews)
    .filter((release): release is ReleaseNews => release !== null),
);
