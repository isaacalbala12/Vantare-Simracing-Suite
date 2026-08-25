import { cleanup, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OrbitKeepAlive } from './OrbitKeepAlive';
import { useOrbitKeepAliveActivity } from './orbit-keep-alive-activity';

afterEach(() => cleanup());

describe('OrbitKeepAlive', () => {
  it('mounts lazily and preserves the same view while it is inactive', () => {
    const view = render(
      <OrbitKeepAlive active={false}>
        <div data-testid="persistent-view" />
      </OrbitKeepAlive>,
    );

    expect(screen.queryByTestId('persistent-view')).toBeNull();

    view.rerender(
      <OrbitKeepAlive active>
        <div data-testid="persistent-view" />
      </OrbitKeepAlive>,
    );

    const persistentView = screen.getByTestId('persistent-view');

    view.rerender(
      <OrbitKeepAlive active={false}>
        <div data-testid="persistent-view" />
      </OrbitKeepAlive>,
    );

    expect(screen.getByTestId('persistent-view')).toBe(persistentView);
    expect(persistentView.closest('[data-orbit-keep-alive]')?.getAttribute('aria-hidden')).toBe(
      'true',
    );
    expect(persistentView.closest('[data-orbit-keep-alive]')?.hasAttribute('inert')).toBe(true);

    view.rerender(
      <OrbitKeepAlive active>
        <div data-testid="persistent-view" />
      </OrbitKeepAlive>,
    );

    expect(screen.getByTestId('persistent-view')).toBe(persistentView);
  });

  it('gates background subscribers without remounting the view', () => {
    const onActivityChange = vi.fn();
    function ActivityProbe() {
      const activity = useOrbitKeepAliveActivity();
      useEffect(() => activity.subscribe(onActivityChange), [activity]);
      return <div data-testid="activity-probe" />;
    }

    const view = render(
      <OrbitKeepAlive active>
        <ActivityProbe />
      </OrbitKeepAlive>,
    );
    const probe = screen.getByTestId('activity-probe');

    view.rerender(
      <OrbitKeepAlive active={false}>
        <ActivityProbe />
      </OrbitKeepAlive>,
    );

    expect(screen.getByTestId('activity-probe')).toBe(probe);
    expect(onActivityChange).toHaveBeenLastCalledWith(false);

    view.rerender(
      <OrbitKeepAlive active>
        <ActivityProbe />
      </OrbitKeepAlive>,
    );

    expect(onActivityChange).toHaveBeenLastCalledWith(true);
  });
});
