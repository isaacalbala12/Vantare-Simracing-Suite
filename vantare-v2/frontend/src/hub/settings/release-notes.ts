import { isNewerVersion } from "../../lib/version-compare";
import type { Release, UpdateInfo } from "./settings-contract";

/**
 * Las notas de una version que todavia no esta instalada.
 *
 * `RELEASE_NEWS` (docs/releases/*.json) se compila dentro del binario, asi que
 * solo conoce versiones hasta la que ya tienes: no sirve para contar que trae
 * la que aun no te has descargado. Eso solo puede venir de GitHub, y ya llega:
 * cada `Release` del updater trae su `body`, que genera
 * `.github/scripts/release_notes.py` desde el manifiesto del corte.
 */
export type ReleaseNoteSection = {
  /** Vacio en el bloque inicial y en releases antiguas sin encabezados. */
  heading: string;
  items: string[];
};

export type ReleaseNote = {
  tag: string;
  publishedAt: string;
  headline: string;
  summary: string;
  sections: ReleaseNoteSection[];
};

/** Cuantas versiones pendientes se describen antes de resumir el resto. */
export const MAX_PENDING_RELEASES = 5;

function stripInlineMarkdown(value: string): string {
  return value
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .trim();
}

/**
 * Lee el subconjunto de Markdown que genera `release_notes.py`, no Markdown
 * entero: encabezados `##`, vinetas y parrafos.
 *
 * Lo que va dentro de `<details>` son las notas tecnicas, que en GitHub estan
 * plegadas por algo; aqui sencillamente no se muestran. La linea de `---` en
 * adelante es el pie con canal y revision, que el aviso ya dice por su cuenta.
 * Una release antigua, escrita a mano y sin encabezados, no se pierde: sus
 * lineas caen en una seccion sin titulo y se muestran igual.
 */
export function parseReleaseBody(body: string): Omit<ReleaseNote, "tag" | "publishedAt"> {
  const lines = String(body ?? "")
    .replace(/\r\n/g, "\n")
    .split("\n");
  const sections: ReleaseNoteSection[] = [];
  let headline = "";
  let summary = "";
  let folded = false;
  let paragraph: string[] = [];

  const section = (): ReleaseNoteSection => {
    const last = sections[sections.length - 1];
    if (last) return last;
    const opened: ReleaseNoteSection = { heading: "", items: [] };
    sections.push(opened);
    return opened;
  };

  // Un parrafo puede venir repartido en varias lineas, que es como se escribe
  // Markdown a mano: se junta antes de decidir si es el resumen o un punto mas
  // de la seccion en curso. Tratar cada linea por separado partia la frase.
  const flush = () => {
    if (!paragraph.length) return;
    const text = paragraph.join(" ");
    paragraph = [];
    if (!summary && !sections.length) {
      summary = text;
      return;
    }
    section().items.push(text);
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (folded) {
      if (/^<\/details>/i.test(line)) folded = false;
      continue;
    }
    if (/^<details/i.test(line)) {
      flush();
      folded = true;
      continue;
    }
    if (!line) {
      flush();
      continue;
    }
    if (/^-{3,}$/.test(line)) break;

    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      sections.push({ heading: stripInlineMarkdown(heading[1]), items: [] });
      continue;
    }

    const bullet = /^[-*+]\s+(.*)$/.exec(line);
    if (bullet) {
      flush();
      const text = stripInlineMarkdown(bullet[1]);
      if (text) section().items.push(text);
      continue;
    }

    const text = stripInlineMarkdown(line);
    if (!text) continue;
    const leading = !headline && !summary && !sections.length && !paragraph.length;
    if (leading && /^\*\*.+\*\*$/.test(line)) {
      headline = text;
      continue;
    }
    paragraph.push(text);
  }
  flush();

  return {
    headline,
    summary,
    sections: sections.filter((item) => item.items.length > 0),
  };
}

export function toReleaseNote(release: Release): ReleaseNote {
  return {
    tag: release.tag_name,
    publishedAt: release.published_at,
    ...parseReleaseBody(release.body),
  };
}

/**
 * Las versiones publicadas por delante de la instalada, de la mas nueva a la
 * mas antigua.
 *
 * `releases` ya llega ordenada y filtrada por el canal del usuario desde Go, y
 * aqui se vuelve a comprobar que cada una sea posterior a la instalada: un
 * binario de desarrollo mas nuevo que todo lo publicado no debe anunciar como
 * pendiente media lista de releases.
 *
 * `total` cuenta todas las pendientes aunque `notes` solo describa las
 * primeras: quien lleva un mes sin actualizar tiene que poder ver que se deja
 * fuera, en vez de creer que la lista esta completa.
 */
export function pendingReleases(
  info: UpdateInfo | null | undefined,
  limit: number = MAX_PENDING_RELEASES,
): { notes: ReleaseNote[]; total: number } {
  if (!info) return { notes: [], total: 0 };
  const current = info.currentVersion ?? "";
  const candidates =
    info.releases && info.releases.length
      ? info.releases
      : info.latestRelease
        ? [info.latestRelease]
        : [];

  const notes: ReleaseNote[] = [];
  let total = 0;
  for (const release of candidates) {
    if (!release?.tag_name) continue;
    if (current && !isNewerVersion(release.tag_name, current)) break;
    total += 1;
    if (notes.length < limit) notes.push(toReleaseNote(release));
  }
  return { notes, total };
}
