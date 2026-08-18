import { describe, expect, it } from "vitest";

import { RELEASE_NEWS, normalizeReleaseNews, sortReleaseNews } from "./release-news";

describe("release news", () => {
  it("discovers the latest canonical manifest without a manual list", () => {
    expect(RELEASE_NEWS[0]).toMatchObject({
      tag: "v0.1.0.7-nightly.10",
      channel: "nightly",
    });
  });

  it("rejects malformed manifest content", () => {
    expect(normalizeReleaseNews({ tag: "v1", channel: "nightly" })).toBeNull();
    expect(normalizeReleaseNews({
      schemaVersion: 1,
      tag: "v1.0.0-nightly.1",
      channel: "nightly",
      title: "Título",
      summary: "Resumen",
    })).toEqual({
      tag: "v1.0.0-nightly.1",
      channel: "nightly",
      title: "Título",
      summary: "Resumen",
    });
  });

  it("sorts release iterations numerically from newest to oldest", () => {
    const releases = [
      { tag: "v0.1.0.7-nightly.2", channel: "nightly", title: "2", summary: "2" },
      { tag: "v0.1.0.7-nightly.10", channel: "nightly", title: "10", summary: "10" },
    ] as const;

    expect(sortReleaseNews(releases).map((release) => release.tag)).toEqual([
      "v0.1.0.7-nightly.10",
      "v0.1.0.7-nightly.2",
    ]);
  });
});
