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
import { seedAccountIdentity } from './hub/orbit/use-account-identity';
import type { Section } from './hub/navigation';

/**
 * Harness visual de Ajustes (briefing 11).
 *
 * Monta la shell Orbit real en la vista `ajustes`; la sección inicial la decide
 * `?settings=` porque la lee la propia pantalla. No se siembra ningún dato: lo
 * que se ve es lo que la app puede saber sin backend (licencia anónima,
 * actualizador sin respuesta, atajos por defecto), que es justo lo que la
 * pantalla debe declarar con honestidad.
 */
applyTheme(orbitThemeJson as unknown as VantareTheme);
initializeDensity();

// Sin runtime ni Supabase configurado no hay sesión: se siembra una identidad de
// prueba (con foto embebida) para que el avatar del rail se vea como en la app
// y no salga vacío en la captura.
seedAccountIdentity({
  displayName: 'Isaac Albalá',
  email: 'isaac@vantare.app',
  avatarUrl:
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96">' +
        '<rect width="96" height="96" fill="#3a3f52"/>' +
        '<circle cx="48" cy="38" r="17" fill="#c9cbd6"/>' +
        '<path d="M14 96c4-22 17-32 34-32s30 10 34 32z" fill="#c9cbd6"/>' +
        '</svg>',
    ),
});

export function Harness() {
  const [section, setSection] = useState<Section>('setup');

  return (
    <LicenseProvider>
      <I18nProvider>
        <LauncherStoreProvider>
          <OrbitShell
            activeSection={section}
            onNavigate={(next) => setSection(next as Section)}
            sourceStatus={{ name: 'LMU', live: true, available: true } as never}
            testingCenterChannel={null}
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
