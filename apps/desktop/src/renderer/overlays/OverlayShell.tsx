import React, { Suspense, useEffect, useState } from 'react';
import './overlay.css';

type OverlayId = 'standings' | 'relative' | '';

function getOverlayId(): OverlayId {
  if (typeof window === 'undefined') return '';
  const params = new URLSearchParams(window.location.search);
  const overlay = params.get('overlay');
  if (overlay === 'standings' || overlay === 'relative') return overlay;
  return '';
}

function loadOverlayComponent(id: OverlayId): React.LazyExoticComponent<React.ComponentType<unknown>> | null {
  if (!id) return null;
  try {
    switch (id) {
      case 'standings':
        return React.lazy(() => import('./Standings'));
      case 'relative':
        return React.lazy(() => import('./Relative'));
      default:
        return null;
    }
  } catch {
    return null;
  }
}

export default function OverlayShell() {
  const [overlayId, setOverlayId] = useState<OverlayId>(() => getOverlayId());
  const [LazyComponent, setLazyComponent] = useState<React.LazyExoticComponent<React.ComponentType<unknown>> | null>(() =>
    loadOverlayComponent(overlayId),
  );

  useEffect(() => {
    const handlePopState = () => {
      const nextId = getOverlayId();
      setOverlayId(nextId);
      setLazyComponent(loadOverlayComponent(nextId));
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

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

  if (!overlayId || !LazyComponent) {
    return null;
  }

  return (
    <div data-testid="overlay-shell" className="overlay-mode">
      <Suspense fallback={<div className="p-4 text-white/50 text-sm">Loading overlay...</div>}>
        <LazyComponent />
      </Suspense>
    </div>
  );
}
