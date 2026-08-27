export function isDowngrade(current: string, target: string): boolean {
  const parse = (v: string) =>
    v
      .replace(/^v/i, '')
      .split(/[-+]/)[0]
      .split('.')
      .map((n) => parseInt(n, 10) || 0);
  const cur = parse(current);
  const tgt = parse(target);
  for (let i = 0; i < Math.max(cur.length, tgt.length); i++) {
    const a = cur[i] ?? 0;
    const b = tgt[i] ?? 0;
    if (a !== b) return b < a;
  }
  return false;
}

/**
 * Puerto en TypeScript de `updater.ParseVersion` / `Version.Compare` (Go).
 *
 * `isDowngrade` se queda con la parte numérica, asi que dos nightlies de la
 * misma base ("v0.1.0.7-nightly.11" y "...nightly.12") le parecen la misma
 * version. Eso vale para avisar de un downgrade, pero no para decidir que
 * versiones tiene pendientes quien mira el aviso de actualizacion: ahi el
 * sufijo es lo unico que las distingue.
 */
type ParsedVersion = {
  major: number;
  minor: number;
  patch: number;
  build: number;
  suffix: string;
};

const SEMVER_RE = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:\.(\d+))?(?:[-+.]?(.*))?$/i;
// Separa el sufijo en tramos de digitos y de no-digitos para que
// "nightly.10" ordene despues de "nightly.9" y no antes.
const SUFFIX_PART_RE = /\d+|\D+/g;

export function parseVersion(tag: string): ParsedVersion {
  const match = SEMVER_RE.exec(String(tag ?? '').trim());
  if (!match) return { major: 0, minor: 0, patch: 0, build: 0, suffix: '' };
  const number = (value: string | undefined) => {
    const parsed = parseInt(value ?? '', 10);
    return Number.isNaN(parsed) ? 0 : parsed;
  };
  return {
    major: number(match[1]),
    minor: number(match[2]),
    patch: number(match[3]),
    build: number(match[4]),
    suffix: match[5] ?? '',
  };
}

function compareSuffix(a: string, b: string): number {
  const left = a.match(SUFFIX_PART_RE) ?? [];
  const right = b.match(SUFFIX_PART_RE) ?? [];
  for (let i = 0; i < left.length && i < right.length; i++) {
    const leftNumber = /^\d+$/.test(left[i]) ? parseInt(left[i], 10) : null;
    const rightNumber = /^\d+$/.test(right[i]) ? parseInt(right[i], 10) : null;
    if (leftNumber !== null && rightNumber !== null) {
      if (leftNumber !== rightNumber) return leftNumber < rightNumber ? -1 : 1;
      continue;
    }
    if (left[i] !== right[i]) return left[i] < right[i] ? -1 : 1;
  }
  if (left.length !== right.length) return left.length < right.length ? -1 : 1;
  return 0;
}

/** -1 si `a` es anterior a `b`, 0 si son la misma version, 1 si es posterior. */
export function compareVersions(a: string, b: string): number {
  const left = parseVersion(a);
  const right = parseVersion(b);
  for (const field of ['major', 'minor', 'patch', 'build'] as const) {
    if (left[field] !== right[field]) return left[field] < right[field] ? -1 : 1;
  }
  // Misma version numerica: una estable (sin sufijo) es posterior a cualquier
  // pre-release de la misma linea.
  if (left.suffix === right.suffix) return 0;
  if (left.suffix === '') return 1;
  if (right.suffix === '') return -1;
  return compareSuffix(left.suffix, right.suffix);
}

export function isNewerVersion(candidate: string, base: string): boolean {
  return compareVersions(candidate, base) > 0;
}
