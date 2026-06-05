import { useTheme } from '@vantare/ui-core/themes';

interface ThemeSelectorProps {
  onSelect?: (themeId: string) => void;
}

export default function ThemeSelector({ onSelect }: ThemeSelectorProps) {
  const { availableThemes, themeId, setTheme } = useTheme();

  return (
    <div data-testid="theme-selector" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {availableThemes.map((theme) => {
        const isActive = theme.id === themeId;
        return (
          <button
            key={theme.id}
            type="button"
            data-testid={`theme-card-${theme.id}`}
            onClick={() => {
              setTheme(theme.id);
              onSelect?.(theme.id);
            }}
            className={`text-left rounded-lg border p-4 transition-colors ${
              isActive
                ? 'border-[var(--color-primary)] bg-[var(--color-surface-elevated)]'
                : 'border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-primary-muted)]'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-[var(--color-text)]">{theme.name}</span>
              {isActive && (
                <span className="text-[10px] uppercase tracking-wide text-[var(--color-primary)]">Active</span>
              )}
            </div>
            <p className="text-xs text-[var(--color-text-muted)] mt-1">{theme.description}</p>
          </button>
        );
      })}
    </div>
  );
}
