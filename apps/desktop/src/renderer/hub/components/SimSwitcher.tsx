import { useEffect, useState, useRef } from 'react';

interface SimItem {
  id: string;
  name: string;
  connected: boolean;
  isMock: boolean;
}

const SIM_LABELS: Record<string, string> = {
  iracing: 'iRacing',
  lmu: 'Le Mans Ultimate',
  ac: 'Assetto Corsa',
};

export default function SimSwitcher() {
  const [sims, setSims] = useState<SimItem[]>([]);
  const [activeSimId, setActiveSimId] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [isMock, setIsMock] = useState(false);
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Sync connected/isMock into sims entries when they change
  useEffect(() => {
    setSims((prev) =>
      prev.map((s) => ({
        ...s,
        connected: s.id === activeSimId ? connected : false,
        isMock: s.id === activeSimId ? isMock : s.isMock,
      })),
    );
  }, [connected, isMock, activeSimId]);

  // Fetch initial sims + subscribe to list/state changes
  useEffect(() => {
    const init = async () => {
      const [ids, activeSim] = await Promise.all([
        window.vantare.getAvailableSims(),
        window.vantare.getActiveSim(),
      ]);
      setActiveSimId(activeSim);
      setSims(
        ids.map((id) => ({
          id,
          name: SIM_LABELS[id] ?? id,
          connected: id === activeSim,
          isMock: false,
        })),
      );
    };
    init();

    const unsubList = window.vantare.onSimListChanged((ids) => {
      setSims((prev) =>
        ids.map((id) => {
          const existing = prev.find((s) => s.id === id);
          return (
            existing ?? {
              id,
              name: SIM_LABELS[id] ?? id,
              connected: false,
              isMock: false,
            }
          );
        }),
      );
    });

    const unsubState = window.vantare.onSimState((state) => {
      setConnected(state.connected);
      setIsMock(state.isMock);
      if (state.type) setActiveSimId(state.type);
    });

    return () => {
      unsubList();
      unsubState();
    };
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelect = (simId: string) => {
    window.vantare.setActiveSim(simId);
    setOpen(false);
  };

  const activeSim = sims.find((s) => s.id === activeSimId);

  return (
    <div ref={dropdownRef} className="relative">
      {/* Trigger button */}
      <button
        data-testid="sim-switcher-trigger"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2 py-1 text-xs rounded
                   bg-white/5 hover:bg-white/10 transition-colors min-w-0 max-w-[140px]"
      >
        {sims.length === 0 ? (
          <span className="text-white/40 truncate">No sim detected</span>
        ) : (
          <>
            <span
              className={`inline-block w-2 h-2 rounded-full shrink-0 ${
                connected
                  ? 'bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.6)]'
                  : 'bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.6)]'
              }`}
            />
            <span className="text-white/80 truncate">
              {activeSim?.name ?? 'Select sim'}
            </span>
            {isMock && (
              <span className="ml-0.5 px-1 py-0.5 text-[9px] font-medium leading-none rounded bg-yellow-500/20 text-yellow-400 uppercase">
                Mock
              </span>
            )}
            <svg
              className={`w-3 h-3 text-white/40 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div
          data-testid="sim-switcher-dropdown"
          className="absolute left-0 top-full mt-1 w-48 z-50
                     bg-[#2a2a2a] border border-white/10 rounded-md shadow-xl overflow-hidden"
        >
          {sims.length === 0 ? (
            <div className="px-3 py-2 text-xs text-white/40">No sim detected</div>
          ) : (
            sims.map((sim) => {
              const isActive = sim.id === activeSimId;
              return (
                <button
                  key={sim.id}
                  data-testid={`sim-option-${sim.id}`}
                  onClick={() => handleSelect(sim.id)}
                  className={`flex items-center gap-2 w-full px-3 py-2 text-xs text-left transition-colors
                    ${isActive ? 'bg-white/10 text-white' : 'text-white/60 hover:bg-white/5 hover:text-white/80'}`}
                >
                  <span
                    className={`inline-block w-2 h-2 rounded-full shrink-0 ${
                      sim.connected
                        ? 'bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.6)]'
                        : 'bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.6)]'
                    }`}
                  />
                  <span className="truncate flex-1">{sim.name}</span>
                  {sim.isMock && (
                    <span className="px-1 py-0.5 text-[9px] font-medium leading-none rounded bg-yellow-500/20 text-yellow-400 uppercase">
                      Mock
                    </span>
                  )}
                  {isActive && (
                    <svg className="w-3 h-3 text-blue-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
