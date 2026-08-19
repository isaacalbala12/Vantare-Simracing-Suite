import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { initializeDensity } from './lib/density';
import { applyTheme, type VantareTheme } from './lib/theme';
import orbitThemeJson from './themes/vantare-orbit.json';
import { I18nProvider } from './i18n/I18nProvider';
import { LicenseProvider } from './lib/license';
import { LauncherStoreProvider } from './hub/launcher/launcher-store';
import { OrbitShell } from './hub/components/orbit/OrbitShell';
import type { Section } from './hub/navigation';

/**
 * Harness visual de Telemetría (briefing 09).
 *
 * Monta la shell Orbit real en la vista `telemetria`. Sin `?telemetryDemo=1` la
 * pantalla enseña el estado vacío honesto (no hay fuente de sesiones expuesta);
 * con el flag entra el generador sintético de `13.6`, siempre etiquetado.
 */
applyTheme(orbitThemeJson as unknown as VantareTheme);
initializeDensity();

export function Harness() {
  const [section, setSection] = useState<Section>('telemetry');

  return (
    <LicenseProvider>
      <I18nProvider>
        <LauncherStoreProvider>
          <OrbitShell
            activeSection={section}
            onNavigate={(next) => setSection(next as Section)}
            sourceStatus={{ name: 'LMU', live: true, available: true } as never}
            testingCenterChannel={null}
            version="v0.3.9"
          />
        </LauncherStoreProvider>
      </I18nProvider>
    </LicenseProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Harness />
  </StrictMode>,
);
