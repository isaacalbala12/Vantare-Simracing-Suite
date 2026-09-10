import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { lazy, Suspense, useEffect, type ComponentType } from 'react';
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

  it('resuelve el hijo lazy al activarse y lo conserva montado al ocultarse', async () => {
    // La shell monta las páginas con React.lazy dentro del keep-alive: el
    // import() no debe dispararse antes de la primera visita, la primera
    // activación suspende en el fallback y, una vez resuelto, la vista queda
    // montada (inert) aunque el usuario navegue a otra pestaña.
    let resolveModule: ((mod: { default: ComponentType }) => void) | undefined;
    let requested = false;
    const LazyView = lazy(
      () =>
        new Promise<{ default: ComponentType }>((resolve) => {
          requested = true;
          resolveModule = resolve;
        }),
    );

    const view = render(
      <OrbitKeepAlive active={false}>
        <Suspense fallback={<div data-testid="page-fallback" />}>
          <LazyView />
        </Suspense>
      </OrbitKeepAlive>,
    );

    expect(requested).toBe(false);

    view.rerender(
      <OrbitKeepAlive active>
        <Suspense fallback={<div data-testid="page-fallback" />}>
          <LazyView />
        </Suspense>
      </OrbitKeepAlive>,
    );

    await waitFor(() => expect(requested).toBe(true));
    expect(screen.getByTestId('page-fallback')).toBeTruthy();

    resolveModule?.({
      default: () => <div data-testid="lazy-view">lista</div>,
    });
    const lazyView = await screen.findByTestId('lazy-view');

    view.rerender(
      <OrbitKeepAlive active={false}>
        <Suspense fallback={<div data-testid="page-fallback" />}>
          <LazyView />
        </Suspense>
      </OrbitKeepAlive>,
    );

    expect(screen.getByTestId('lazy-view')).toBe(lazyView);
    expect(lazyView.closest('[data-orbit-keep-alive]')?.hasAttribute('inert')).toBe(true);
  });
});
