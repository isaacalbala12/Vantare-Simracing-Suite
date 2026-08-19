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
import type { TestingCenterChannel } from './hub/testing-center/contracts';
import type { Section } from './hub/navigation';

/**
 * Harness visual del Testing Center (briefing 12).
 *
 * Monta la shell Orbit real en la vista `testing`. El canal lo decide
 * `?channel=` porque es lo único que la shell no puede resolver sin licencia:
 * con `nightly`/`testers` la vista existe, con cualquier otra cosa (o sin
 * parámetro) la shell devuelve a Inicio con su toast, que es justo el
 * comportamiento que la captura tiene que demostrar.
 */
applyTheme(orbitThemeJson as unknown as VantareTheme);
initializeDensity();

function channelFromSearch(search: string): TestingCenterChannel | null {
  const raw = new URLSearchParams(search).get('channel');
  return raw === 'nightly' || raw === 'testers' ? raw : null;
}

export function Harness() {
  const [section, setSection] = useState<Section>('testing-center');
  const [channel] = useState(() =>
    channelFromSearch(typeof window === 'undefined' ? '' : window.location.search),
  );

  return (
    <LicenseProvider>
      <I18nProvider>
        <LauncherStoreProvider>
          <OrbitShell
            activeSection={section}
            onNavigate={(next) => setSection(next as Section)}
            sourceStatus={{ name: 'LMU', live: true, available: true } as never}
            testingCenterChannel={channel}
            version="v0.3.10"
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
