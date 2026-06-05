import { useRef } from 'react';
import { exportTheme, importTheme } from '@vantare/ui-core/themes';
import { useTheme } from '@vantare/ui-core/themes';
import { Feature } from '@vantare/auth';
import ThemeSelector from '../components/ThemeSelector';
import ThemeEditor from '../components/ThemeEditor';
import FeatureGate from '../components/FeatureGate';
import { useLicense } from '../../shared/hooks/useLicense';

export default function ThemesPage() {
  const { theme, setTheme } = useTheme();
  const { canAccess } = useLicense();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = () => {
    const json = exportTheme(theme);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${theme.id}.vantare-theme.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async (file: File) => {
    const text = await file.text();
    const imported = importTheme(text);
    await window.vantare.saveTheme(imported);
    setTheme(imported.id);
  };

  return (
    <div data-testid="themes-page" className="p-6 h-full flex flex-col gap-6 overflow-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-[var(--color-text)]">Themes</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">
            Choose a built-in theme or customize your overlay look.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid="theme-export-btn"
            onClick={handleExport}
            className="px-3 py-1.5 text-xs rounded-md border border-[var(--color-border)] text-[var(--color-text)] hover:bg-[var(--color-surface-elevated)]"
          >
            Export JSON
          </button>
          <button
            type="button"
            data-testid="theme-import-btn"
            onClick={() => fileInputRef.current?.click()}
            disabled={!canAccess(Feature.CUSTOM_THEMES)}
            className="px-3 py-1.5 text-xs rounded-md border border-[var(--color-border)] text-[var(--color-text)] hover:bg-[var(--color-surface-elevated)] disabled:opacity-50"
          >
            Import JSON
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleImport(file);
              e.target.value = '';
            }}
          />
        </div>
      </div>

      <section>
        <h2 className="text-sm font-medium text-[var(--color-text)] mb-3">Built-in themes</h2>
        <ThemeSelector />
      </section>

      <section>
        <FeatureGate feature={Feature.CUSTOM_THEMES} label="Theme editor">
          <ThemeEditor />
        </FeatureGate>
      </section>
    </div>
  );
}
