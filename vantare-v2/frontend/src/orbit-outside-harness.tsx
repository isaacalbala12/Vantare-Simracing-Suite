import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import './overlay/edit/inplace-edit.css';
import { initializeDensity } from './lib/density';
import { applyTheme, type VantareTheme } from './lib/theme';
import orbitThemeJson from './themes/vantare-orbit.json';
import { I18nProvider } from './i18n/I18nProvider';
import { LanguageSelector } from './i18n/LanguageSelector';
import { HubToast } from './hub/launcher/HubToast';
import { EngineerSubtitles } from './engineer/EngineerSubtitles';
import type { EngineerPresentation } from './engineer/engineer-presentation-store';
import { buildEngineerPresentationFixture } from './engineer/engineer-presentation-fixtures';

applyTheme(orbitThemeJson as unknown as VantareTheme);
initializeDensity();

const params = new URLSearchParams(location.search);
const scene = params.get('scene') ?? 'toast-error';

function presentationFixture(text: string, severity: EngineerPresentation['severity']): EngineerPresentation {
  const fixture = buildEngineerPresentationFixture('es', severity);
  return { ...fixture, id: 'msg-1', text, voiceText: text };
}

function sceneContent() {
  switch (scene) {
    case 'toast-success':
      return <HubToast variant="success" message="Perfil «GT3 Sprint» aplicado a OBS" profileId="p1" onClose={() => {}} />;
    case 'toast-partial':
      return <HubToast variant="partial" message="2 de 5 widgets no pudieron colocarse" profileId="p1" onClose={() => {}} />;
    case 'toast-error':
      return <HubToast variant="error" message="No se pudo aplicar el perfil «Endurance»" profileId="p1" onClose={() => {}} />;
    case 'subtitles-info':
      return <EngineerSubtitles presentation={presentationFixture('Box box. Entramos a boxes esta vuelta.', 'info')} />;
    case 'subtitles-warning':
      return <EngineerSubtitles presentation={presentationFixture('Cuidado: tráfico delante en la curva 3.', 'warning')} />;
    case 'subtitles-critical':
      return <EngineerSubtitles presentation={presentationFixture('¡Bandera amarilla! Accidente en sector 2.', 'critical')} />;
    case 'language':
      return (
        <div style={{ padding: 24 }}>
          <LanguageSelector />
        </div>
      );
    case 'inplace':
      return (
        <>
          <div className="inplace-toolbar">
            <span className="inplace-toolbar__chip"><span className="inplace-toolbar__dot" />EDITANDO</span>
            <span className="inplace-toolbar__divider" />
            <select className="inplace-toolbar__select"><option>GT3 Sprint</option></select>
            <button className="inplace-toolbar__btn">Deshacer</button>
            <button className="inplace-toolbar__btn inplace-toolbar__btn--accent">Guardar</button>
            <button className="inplace-toolbar__btn">Salir</button>
          </div>
          <aside className="inplace-inspector-panel">
            <div className="inplace-inspector-panel__header">
              <span className="inplace-inspector-panel__title">Torre de posiciones</span>
              <span className="inplace-inspector-panel__session">autosave</span>
              <button className="inplace-inspector-panel__eye" aria-pressed="true">👁</button>
            </div>
            <div className="inplace-inspector-panel__tabs">
              <button className="inplace-inspector-panel__tab inplace-inspector-panel__tab--active">Layout</button>
              <button className="inplace-inspector-panel__tab">Contenido</button>
              <button className="inplace-inspector-panel__tab">Apariencia</button>
            </div>
            <div className="inplace-inspector-panel__history">
              <button>↶</button><button>↷</button>
              <span className="inplace-inspector-panel__dirty">●</span>
              <span className="inplace-inspector-panel__conflict">conflicto remoto</span>
            </div>
          </aside>
        </>
      );
    default:
      return null;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      {sceneContent()}
    </I18nProvider>
  </StrictMode>,
);
