const MODIFIER_KEYS = new Set(['Control', 'Shift', 'Alt', 'Meta']);

const KEY_ALIASES: Record<string, string> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ' ': 'space',
};

function normalizeKey(key: string): string {
  const alias = KEY_ALIASES[key];
  if (alias) return alias;
  return key.toLowerCase();
}

export interface HotkeyCaptureResult {
  combo: string | null;
  isCancel: boolean;
}

export function parseKeyEvent(event: KeyboardEvent): HotkeyCaptureResult {
  if (event.key === 'Escape') {
    return { combo: null, isCancel: true };
  }

  const parts: string[] = [];
  if (event.ctrlKey) parts.push('ctrl');
  if (event.shiftKey) parts.push('shift');
  if (event.altKey) parts.push('alt');
  if (event.metaKey) parts.push('meta');

  if (MODIFIER_KEYS.has(event.key)) {
    return { combo: null, isCancel: false };
  }

  const key = normalizeKey(event.key);
  parts.push(key);

  return { combo: parts.join('+'), isCancel: false };
}
