import { useLayoutEffect, useState, type ReactNode } from 'react';
import {
  createOrbitActivityGate,
  OrbitKeepAliveActivityContext,
} from './orbit-keep-alive-activity';

export type OrbitKeepAliveProps = {
  active: boolean;
  children: ReactNode;
};

/** Monta una vista al visitarla por primera vez y conserva su estado al ocultarla. */
export function OrbitKeepAlive(props: OrbitKeepAliveProps): React.ReactElement | null {
  const { active, children } = props;
  const [visited, setVisited] = useState(active);
  const [activityGate] = useState(() => createOrbitActivityGate(active));
  if (active && !visited) setVisited(true);

  useLayoutEffect(() => {
    activityGate.setActive(active);
  }, [active, activityGate]);

  if (!active && !visited) return null;

  return (
    <OrbitKeepAliveActivityContext.Provider value={activityGate}>
      <div
        aria-hidden={!active}
        className="orbit-keep-alive"
        data-active={active}
        data-orbit-keep-alive
        inert={!active}
      >
        {children}
      </div>
    </OrbitKeepAliveActivityContext.Provider>
  );
}
