import { BrowserRouter, Routes, Route, useSearchParams } from 'react-router-dom';
import { useTelemetry } from '@vantare/ui-core';
import { useTelemetryStore } from '@vantare/ui-core';
import { DebugOverlay } from './DebugOverlay';
import { PreviewOverlay } from './PreviewOverlay';
import HubLayout from './hub/HubLayout';
import OverlaySettingsPage from './hub/pages/OverlaySettingsPage';
import SettingsPage from './hub/pages/SettingsPage';
import ProfilesPage from './hub/pages/ProfilesPage';
import DashboardPage from './hub/pages/DashboardPage';
import TelemetryInspectorPage from './hub/pages/TelemetryInspectorPage';
import InspectorOverlayStandalone from './InspectorOverlayStandalone';

/** Handles the `?overlay=inspector` standalone window param */
function AppRouter() {
  const [searchParams] = useSearchParams();
  const overlayParam = searchParams.get('overlay');

  if (overlayParam === 'inspector') {
    return <InspectorOverlayStandalone />;
  }

  return (
    <Routes>
      <Route path="/" element={<HubLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="overlays" element={<OverlaySettingsPage />} />
        <Route path="profiles" element={<ProfilesPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="inspector" element={<TelemetryInspectorPage />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  const { telemetry } = useTelemetry();
  const isMock = useTelemetryStore((s) => s.isMock);

  return (
    <BrowserRouter>
      <div className="w-screen h-screen bg-transparent relative">
        <DebugOverlay />
        {isMock && (
          <div className="fixed top-2 right-2 z-50 px-3 py-1 rounded-full bg-yellow-500/20 border border-yellow-500/40 text-yellow-400 text-xs font-mono">
            DEMO MODE
          </div>
        )}
        {telemetry && (
          <div className="fixed bottom-2 left-2 z-50 text-[10px] font-mono text-white/30">
            SIM: {telemetry.sim} | RPM: {telemetry.player.rpm}
          </div>
        )}
        <PreviewOverlay />

        <AppRouter />
      </div>
    </BrowserRouter>
  );
}
