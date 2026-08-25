import { describe, expect, it } from "vitest";
import { MAX_PENDING_RELEASES, parseReleaseBody, pendingReleases } from "./release-notes";
import type { Release, UpdateInfo } from "./settings-contract";

const BODY = [
  "**Notas de version legibles**",
  "",
  "Esta Nightly explica en castellano llano que cambia antes de descargarla.",
  "",
  "## Novedades",
  "- El aviso de actualizacion cuenta que trae la version.",
  "",
  "## Corregido",
  "- El panel ya no se queda en blanco al volver.",
  "",
  "## Limitaciones conocidas",
  "- Ninguna declarada para este corte.",
  "",
  "<details>",
  "<summary>Notas tecnicas</summary>",
  "",
  "**ISA-1**",
  "- El emisor deduplica por tag.",
  "",
  "</details>",
  "",
  "---",
  "",
  "Canal Nightly · `v0.1.0.7-nightly.12` · revisión `8a90c3a7abcd`",
].join("\n");

function release(tag: string, body = BODY): Release {
  return {
    tag_name: tag,
    name: `Vantare ${tag}`,
    body,
    prerelease: true,
    published_at: "2026-08-25T10:00:00Z",
    html_url: `https://example.invalid/${tag}`,
    assets: [],
  };
}

function info(overrides: Partial<UpdateInfo> = {}): UpdateInfo {
  return {
    currentVersion: "v0.1.0.7-nightly.10",
    hasUpdate: true,
    isDowngrade: false,
    ...overrides,
  };
}

describe("parseReleaseBody", () => {
  it("reads the headline and the summary that lead the notes", () => {
    const note = parseReleaseBody(BODY);
    expect(note.headline).toBe("Notas de version legibles");
    expect(note.summary).toBe(
      "Esta Nightly explica en castellano llano que cambia antes de descargarla.",
    );
  });

  it("keeps each heading with its own bullets", () => {
    const { sections } = parseReleaseBody(BODY);
    expect(sections.map((section) => section.heading)).toEqual([
      "Novedades",
      "Corregido",
      "Limitaciones conocidas",
    ]);
    expect(sections[0].items).toEqual(["El aviso de actualizacion cuenta que trae la version."]);
  });

  it("leaves the technical notes folded away", () => {
    const text = JSON.stringify(parseReleaseBody(BODY));
    expect(text).not.toContain("Notas tecnicas");
    expect(text).not.toContain("El emisor deduplica por tag.");
  });

  it("stops at the footer instead of announcing the revision as a change", () => {
    const text = JSON.stringify(parseReleaseBody(BODY));
    expect(text).not.toContain("Canal Nightly");
    expect(text).not.toContain("8a90c3a7abcd");
  });

  it("strips the markdown a plain reader should not see", () => {
    const { sections } = parseReleaseBody("## Novedades\n- **Delta** usa `Ctrl+Shift+D` ahora.");
    expect(sections[0].items).toEqual(["Delta usa Ctrl+Shift+D ahora."]);
  });

  it("turns a link into its own text", () => {
    const { sections } = parseReleaseBody("## Novedades\n- Ver el [manual](https://x.invalid).");
    expect(sections[0].items).toEqual(["Ver el manual."]);
  });

  it("shows an old hand-written release rather than nothing", () => {
    const note = parseReleaseBody("Correcciones varias\nY una segunda linea.");
    expect(note.summary).toBe("Correcciones varias");
    expect(note.sections).toEqual([{ heading: "", items: ["Y una segunda linea."] }]);
  });

  it("survives an empty body", () => {
    expect(parseReleaseBody("")).toEqual({ headline: "", summary: "", sections: [] });
  });

  it("drops a heading that carries no bullets", () => {
    const { sections } = parseReleaseBody("## Novedades\n\n## Corregido\n- Arreglado.");
    expect(sections.map((section) => section.heading)).toEqual(["Corregido"]);
  });
});

describe("pendingReleases", () => {
  it("lists every version published after the installed one", () => {
    const { notes } = pendingReleases(
      info({
        releases: [
          release("v0.1.0.7-nightly.12"),
          release("v0.1.0.7-nightly.11"),
          release("v0.1.0.7-nightly.10"),
          release("v0.1.0.7-nightly.9"),
        ],
      }),
    );
    expect(notes.map((note) => note.tag)).toEqual([
      "v0.1.0.7-nightly.12",
      "v0.1.0.7-nightly.11",
    ]);
  });

  it("returns nothing when the installed version is the latest", () => {
    expect(
      pendingReleases(
        info({
          currentVersion: "v0.1.0.7-nightly.12",
          releases: [release("v0.1.0.7-nightly.12"), release("v0.1.0.7-nightly.11")],
        }),
      ),
    ).toEqual({ notes: [], total: 0 });
  });

  it("announces nothing to a development build newer than everything published", () => {
    expect(
      pendingReleases(
        info({
          currentVersion: "v0.9.0.0",
          releases: [release("v0.1.0.7-nightly.12"), release("v0.1.0.7-nightly.11")],
        }),
      ),
    ).toEqual({ notes: [], total: 0 });
  });

  it("falls back to the latest release when the list is absent", () => {
    const { notes } = pendingReleases(info({ latestRelease: release("v0.1.0.7-nightly.12") }));
    expect(notes.map((note) => note.tag)).toEqual(["v0.1.0.7-nightly.12"]);
  });

  it("describes only the first versions but counts them all", () => {
    const releases = Array.from({ length: 9 }, (_, index) =>
      release(`v0.1.0.7-nightly.${20 - index}`),
    );
    const { notes, total } = pendingReleases(info({ releases }));
    expect(notes).toHaveLength(MAX_PENDING_RELEASES);
    expect(total).toBe(9);
  });

  it("has nothing to say without update info", () => {
    expect(pendingReleases(null)).toEqual({ notes: [], total: 0 });
    expect(pendingReleases(undefined)).toEqual({ notes: [], total: 0 });
    expect(pendingReleases(info())).toEqual({ notes: [], total: 0 });
  });
});
