import type { ProfileDocumentV3 } from "../../../overlay/core/profile-document";

/**
 * Cache local del ultimo documento conocido por fichero, para que el Studio
 * pinte los widgets al instante mientras el load fresco viaja por IPC
 * (stale-while-revalidate). Es SOLO una semilla visual: el load fresco manda
 * y el guardado reescribe la cache.
 *
 * Limites: 3 MB totales con expulsion LRU; cualquier error de storage se
 * traga — la cache es una optimizacion, nunca una dependencia.
 */
const PREFIX = "vantare.studio.doc.";
const INDEX_KEY = `${PREFIX}__index`;
const MAX_TOTAL_BYTES = 3 * 1024 * 1024;

type CacheIndexEntry = { file: string; bytes: number; at: number };

function readIndex(): CacheIndexEntry[] {
  try {
    const raw = window.localStorage.getItem(INDEX_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is CacheIndexEntry =>
        !!entry &&
        typeof (entry as CacheIndexEntry).file === "string" &&
        typeof (entry as CacheIndexEntry).bytes === "number" &&
        typeof (entry as CacheIndexEntry).at === "number",
    );
  } catch {
    return [];
  }
}

function writeIndex(entries: CacheIndexEntry[]): void {
  try {
    window.localStorage.setItem(INDEX_KEY, JSON.stringify(entries));
  } catch {
    // Sin indice la cache sigue funcionando entry a entry.
  }
}

export function readCachedStudioDocument(file: string): ProfileDocumentV3 | null {
  try {
    const raw = window.localStorage.getItem(PREFIX + file);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as ProfileDocumentV3;
    // Tocar el orden LRU sin coste visible.
    const index = readIndex().filter((entry) => entry.file !== file);
    index.push({ file, bytes: raw.length, at: Date.now() });
    writeIndex(index);
    return parsed;
  } catch {
    return null;
  }
}

export function writeCachedStudioDocument(file: string, document: ProfileDocumentV3): void {
  try {
    const raw = JSON.stringify(document);
    window.localStorage.setItem(PREFIX + file, raw);
    const index = readIndex().filter((entry) => entry.file !== file);
    index.push({ file, bytes: raw.length, at: Date.now() });
    // Expulsion LRU por bytes totales, sin tocar la entrada recien escrita.
    let total = index.reduce((sum, entry) => sum + entry.bytes, 0);
    const byAge = [...index].sort((a, b) => a.at - b.at);
    while (total > MAX_TOTAL_BYTES && byAge.length > 1) {
      const oldest = byAge.shift();
      if (!oldest || oldest.file === file) {
        continue;
      }
      window.localStorage.removeItem(PREFIX + oldest.file);
      total -= oldest.bytes;
    }
    writeIndex(byAge);
  } catch {
    // Cuota llena o storage no disponible: la cache simplemente no crece.
  }
}
