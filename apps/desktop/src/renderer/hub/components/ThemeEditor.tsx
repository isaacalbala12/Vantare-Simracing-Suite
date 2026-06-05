import { useTheme } from '@vantare/ui-core/themes';

const EDITABLE_COLORS = [
  { category: 'color' as const, token: 'surface' as const, label: 'Surface' },
  { category: 'color' as const, token: 'surfaceElevated' as const, label: 'Surface elevated' },
  { category: 'color' as const, token: 'primary' as const, label: 'Primary' },
  { category: 'color' as const, token: 'text' as const, label: 'Text' },
  { category: 'color' as const, token: 'textMuted' as const, label: 'Text muted' },
  { category: 'color' as const, token: 'border' as const, label: 'Border' },
];

export default function ThemeEditor() {
  const { theme, setToken } = useTheme();

  return (
    <div data-testid="theme-editor" className="space-y-4">
      <div>
        <h3 className="text-sm font-medium text-[var(--color-text)]">Color tokens</h3>
        <p className="text-xs text-[var(--color-text-muted)] mt-1">
          Adjust core colors for the active theme. Changes apply live.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {EDITABLE_COLORS.map(({ category, token, label }) => {
          const value = theme.tokens.color[token];
          return (
            <label key={token} className="flex items-center gap-3 rounded-lg border border-[var(--color-border)] p-3">
              <input
                type="color"
                data-testid={`theme-editor-${token}`}
                value={String(value).startsWith('#') ? String(value) : '#000000'}
                onChange={(e) => setToken(category, token, e.target.value)}
                className="h-8 w-8 rounded border border-[var(--color-border)] bg-transparent"
              />
              <div className="min-w-0">
                <div className="text-xs font-medium text-[var(--color-text)]">{label}</div>
                <div className="text-[10px] font-mono text-[var(--color-text-muted)] truncate">{String(value)}</div>
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );
}
