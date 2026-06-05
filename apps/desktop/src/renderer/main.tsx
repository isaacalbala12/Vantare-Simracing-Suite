import React from 'react';
import ReactDOM from 'react-dom/client';
import { ThemeProvider } from '@vantare/ui-core/themes';
import App from './App';
import { TelemetryBridge } from './TelemetryBridge';
import OverlayShell from './overlays/OverlayShell';
import './styles/globals.css';

function hasOverlayParam(): boolean {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  return params.has('overlay');
}

const root = document.getElementById('root');
if (root) {
  const content = hasOverlayParam() ? (
    <ThemeProvider>
      <OverlayShell />
    </ThemeProvider>
  ) : (
    <App />
  );
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <TelemetryBridge />
      {content}
    </React.StrictMode>,
  );
}
