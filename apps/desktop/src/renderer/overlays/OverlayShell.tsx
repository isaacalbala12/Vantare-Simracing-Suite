import React, { useEffect, useState } from 'react';
import { useTelemetryStore } from '@vantare/ui-core';
import { loadBundle } from '../bundles/registry';
import type { Bundle } from '../bundles/types';
import type { OverlayId } from '../bundles/types';

const ROUTABLE_OVERLAYS: readonly OverlayId[] = [
  'standings',
  'relative',
  'delta',
  'stream-alerts',
] as const;

function isOverlayId(value: string | null): value is OverlayId {
  return value !== null && (ROUTABLE_OVERLAYS as readonly string[]).includes(value);
}

function getOverlayId(): OverlayId | '' {
  if (typeof window === 'undefined') return '';
  const params = new URLSearchParams(window.location.search);
  const overlay = params.get('overlay');
  return isOverlayId(overlay) ? overlay : '';
}

export default function OverlayShell() {
  const [overlayId, setOverlayId] = useState<OverlayId | ''>(() => getOverlayId());
  const [themeId, setThemeId] = useState('default');
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const telemetry = useTelemetryStore((s) => s.telemetry);

  // Fetch the active theme from IPC on mount
  useEffect(() => {
    window.vantare.getActiveTheme().then((t) => {
      setThemeId(t?.id || 'default');
    }).catch(() => {
      // Graceful degradation — keep default
    });
  }, []);

  // Load the active theme bundle. The registry caches the resolved Promise,
  // so concurrent mounts (e.g. strict-mode double-render) share the same load.
  useEffect(() => {
    let mounted = true;
    loadBundle(themeId).then((b) => {
      if (mounted) setBundle(b);
    });
    return () => {
      mounted = false;
    };
  }, [themeId]);

  // Re-resolve the overlay id from the URL on history navigation. The active
  // component is derived in render below.
  useEffect(() => {
    const handlePopState = () => {
      setOverlayId(getOverlayId());
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Toggle the body class so the renderer can hide chrome in overlay mode.
  useEffect(() => {
    if (!overlayId) {
      document.body.classList.remove('overlay-mode');
      return;
    }
    document.body.classList.add('overlay-mode');
    return () => {
      document.body.classList.remove('overlay-mode');
    };
  }, [overlayId]);

  if (!overlayId || !bundle) {
    return null;
  }

  const OverlayComponent = bundle.components[overlayId];

  return (
    <div data-testid="overlay-shell" className="overlay-mode">
      <OverlayComponent telemetry={telemetry} />
    </div>
  );
}
