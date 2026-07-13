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
