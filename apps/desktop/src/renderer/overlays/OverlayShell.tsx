import React, { useEffect, useState } from 'react';
import Standings from './Standings';
import Relative from './Relative';
import './overlay.css';

type OverlayId = 'standings' | 'relative' | '';

function getOverlayId(): OverlayId {
  if (typeof window === 'undefined') return '';
  const params = new URLSearchParams(window.location.search);
  const overlay = params.get('overlay');
  if (overlay === 'standings' || overlay === 'relative') return overlay;
  return '';
}

type OverlayComponent = React.ComponentType;

function loadOverlayComponent(id: OverlayId): OverlayComponent | null {
  if (!id) return null;
  switch (id) {
    case 'standings':
      return Standings as OverlayComponent;
    case 'relative':
      return Relative as OverlayComponent;
    default:
      return null;
  }
}

export default function OverlayShell() {
  const [overlayId, setOverlayId] = useState<OverlayId>(() => getOverlayId());
  const [OverlayComponent, setOverlayComponent] = useState<OverlayComponent | null>(() =>
    loadOverlayComponent(overlayId),
  );

  useEffect(() => {
    const handlePopState = () => {
      const nextId = getOverlayId();
      setOverlayId(nextId);
      setOverlayComponent(loadOverlayComponent(nextId));
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

  if (!overlayId || !OverlayComponent) {
    return null;
  }

  return (
    <div data-testid="overlay-shell" className="overlay-mode">
      <OverlayComponent />
    </div>
  );
}
