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
 * Harness visual de Estrategia (briefing 07).
 *
 * Monta la shell Orbit real contra el runtime simulado: el evento y los
 * pilotos llegan por `strategy:roster` y el inventario de neumáticos por el
 * store real del editor (`strategy:application:command`), igual que en el hub.
 */
applyTheme(orbitThemeJson as unknown as VantareTheme);
initializeDensity();

export function Harness() {
  const [section, setSection] = useState<Section>('strategy');

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
