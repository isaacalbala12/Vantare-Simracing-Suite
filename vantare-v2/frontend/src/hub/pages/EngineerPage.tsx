import { useEffect, useState } from 'react';
import { Events } from '@wailsio/runtime';
import type { EngineerStatus, EngineerNotification, EngineerOutputMode } from '../../engineer/engineer-types';

const OUTPUT_CATEGORIES = [
  ['spotter', 'Spotter'],
  ['fuel', 'Combustible'],
  ['penalties', 'Penalizaciones'],
  ['laps', 'Vueltas'],
  ['timings', 'Diferencias'],
  ['pitstops', 'Boxes'],
] as const;

const OUTPUT_MODES: ReadonlyArray<{ value: EngineerOutputMode; label: string }> = [
  { value: 'both', label: 'Audio y visual' },
  { value: 'visual', label: 'Solo visual' },
  { value: 'audio', label: 'Solo audio' },
  { value: 'disabled', label: 'Desactivado' },
];

const INITIAL_STATUS: EngineerStatus = {
  enabled: true,
  connected: false,
  source: 'telemetry-core',
  presentationLifecycle: 0,
  spotterEnabled: true,
  sensitivity: 'normal',
  ttsCacheCount: 0,
  recentMessages: [],
  outputModes: Object.fromEntries(OUTPUT_CATEGORIES.map(([category]) => [category, 'both'])),
  subtitlesEnabled: true,
};

export function EngineerPage() {
  const [status, setStatus] = useState<EngineerStatus>(INITIAL_STATUS);
  const [notifications, setNotifications] = useState<EngineerNotification[]>([]);

  useEffect(() => {
    Events.Emit('engineer:status:get');

    const unsubStatus = Events.On('engineer:status', (event: { data: EngineerStatus }) => {
      setStatus(event.data);
      if (event.data.recentMessages) {
        setNotifications(event.data.recentMessages);
      }
    });

    const unsubNotification = Events.On('engineer:notification', (event: { data: EngineerNotification }) => {
      setNotifications((prev) => {
        const next = [event.data, ...prev];
        return next.length > 50 ? next.slice(0, 50) : next;
      });
    });

    return () => {
      unsubStatus?.();
      unsubNotification?.();
    };
  }, []);

  const handleToggleEnabled = () => {
    Events.Emit('engineer:enabled:set', !status.enabled);
  };

  const handleToggleSpotter = () => {
    Events.Emit('engineer:spotter:set', !status.spotterEnabled);
  };

  const handleSensitivityChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    Events.Emit('engineer:sensitivity:set', e.target.value);
  };

  const handleOutputChange = (category: string, mode: EngineerOutputMode) => {
    Events.Emit('engineer:output:set', { category, mode });
  };

  const handleToggleSubtitles = () => {
    Events.Emit('engineer:subtitles:set', !status.subtitlesEnabled);
  };

  const formatTime = (timestamp: number) => {
    try {
      return new Date(timestamp).toLocaleTimeString();
    } catch {
      return '';
    }
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Development banner */}
      <div className="relative rounded-2xl overflow-hidden border border-amber-500/20 bg-gradient-to-r from-amber-950/20 via-amber-900/10 to-amber-950/20 opacity-0 animate-fade-in-up">
        <div className="flex items-center gap-3 px-5 py-3">
          <span className="text-[10px] font-bold font-mono uppercase tracking-[.28em] text-amber-400 shrink-0">
            En desarrollo
          </span>
          <div className="h-px flex-1 bg-gradient-to-r from-amber-500/20 to-transparent" />
          <span className="text-[11px] text-amber-300/60">
            Módulo de ingeniero — funcionalidad activa bajo el banner
          </span>
        </div>
      </div>

      {/* Header */}
      <header className="opacity-0 animate-fade-in-up flex items-start justify-between gap-4">
        <div>
          <h1 className="font-bold text-3xl text-white tracking-tight">Ingeniero Vantare</h1>
          <p className="text-sm text-vantare-textMuted mt-2 leading-relaxed">
            Configura el ingeniero de pista y el spotter. En beta, el módulo trabaja con el estado real que emite el backend.
          </p>
        </div>
        <button
          disabled
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-[11px] font-bold text-white/40 uppercase tracking-[.22em] cursor-not-allowed shrink-0"
          title="Voz IA y perfiles de voz disponibles en futura actualización"
        >
          Opciones avanzadas
          <span>→</span>
        </button>
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
        {/* Left Column: Configuration Panels */}
        <section className="xl:col-span-1 flex flex-col gap-4 opacity-0 animate-fade-in-up delay-100">
          <div className="card-sleek rounded-xl p-5 flex flex-col gap-5">
            <div className="flex items-center justify-between">
              <span className="v52-eyebrow">Estado</span>
              <span
                data-testid="connection-badge"
                className={`text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1.5 ${
                  status.connected
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : 'bg-red-500/10 text-red-400 border border-red-500/20'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${status.connected ? 'bg-emerald-400' : 'bg-red-400'}`} />
                {status.connected ? 'CONECTADO' : 'DESCONECTADO'}
              </span>
            </div>

            <div className="h-px bg-white/5" />

            {/* Toggles */}
            <div className="flex flex-col gap-4">
              <label className="flex items-center justify-between cursor-pointer group">
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-bold text-white group-hover:text-vantare-red-400 transition-colors">
                    Ingeniero de pista activo
                  </span>
                  <span className="text-xs text-vantare-textMuted">
                    Habilita o deshabilita la suite del ingeniero.
                  </span>
                </div>
                <input
                  type="checkbox"
                  data-testid="toggle-enabled"
                  checked={status.enabled}
                  onChange={handleToggleEnabled}
                  className="w-4 h-4 rounded border-white/10 bg-[#0a0a0a] text-vantare-red-500 focus:ring-vantare-red-500"
                />
              </label>

              <label className="flex items-center justify-between cursor-pointer group">
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-bold text-white group-hover:text-vantare-red-400 transition-colors">
                    Spotter activo
                  </span>
                  <span className="text-xs text-vantare-textMuted">
                    Anuncios geométricos de coches alrededor.
                  </span>
                </div>
                <input
                  type="checkbox"
                  data-testid="toggle-spotter"
                  checked={status.spotterEnabled}
                  onChange={handleToggleSpotter}
                  className="w-4 h-4 rounded border-white/10 bg-[#0a0a0a] text-vantare-red-500 focus:ring-vantare-red-500"
                />
              </label>

              <label className="flex items-center justify-between cursor-pointer group">
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-bold text-white group-hover:text-vantare-red-400 transition-colors">
                    Subtítulos independientes
                  </span>
                  <span className="text-xs text-vantare-textMuted">
                    Muestra el mensaje aunque el layout no incluya el widget de radio.
                  </span>
                </div>
                <input
                  type="checkbox"
                  data-testid="toggle-subtitles"
                  checked={status.subtitlesEnabled}
                  onChange={handleToggleSubtitles}
                  className="w-4 h-4 rounded border-white/10 bg-[#0a0a0a] text-vantare-red-500 focus:ring-vantare-red-500"
                />
              </label>
            </div>

            <div className="h-px bg-white/5" />

            {/* Selects */}
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <span className="v52-eyebrow">Fuente de Telemetría</span>
                <div
                  data-testid="select-source"
                  className="w-full bg-[#0a0a0a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                >
                  Telemetry Core · LMU
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <span className="v52-eyebrow">Sensibilidad del Spotter</span>
                <select
                  data-testid="select-sensitivity"
                  value={status.sensitivity}
                  onChange={handleSensitivityChange}
                  className="w-full bg-[#0a0a0a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-vantare-red-500 transition-colors"
                >
                  <option value="conservative">Conservadora (Mayor margen lateral)</option>
                  <option value="normal">Normal (Estándar)</option>
                  <option value="aggressive">Agresiva (Margen lateral estrecho)</option>
                </select>
              </div>
              <div className="flex flex-col gap-2">
                <span className="v52-eyebrow">Salidas por categoría</span>
                <p className="text-[11px] text-vantare-textDim leading-relaxed">
                  El modo visual alimenta subtítulos y el widget de radio. Si no hay audio disponible, la salida visual sigue funcionando.
                </p>
                <div className="grid gap-2">
                  {OUTPUT_CATEGORIES.map(([category, label]) => (
                    <label key={category} className="grid grid-cols-[1fr_150px] items-center gap-3">
                      <span className="text-xs text-vantare-textMuted">{label}</span>
                      <select
                        data-testid={`output-mode-${category}`}
                        value={status.outputModes?.[category] ?? 'both'}
                        onChange={(event) => handleOutputChange(category, event.target.value as EngineerOutputMode)}
                        className="w-full bg-[#0a0a0a] border border-white/10 rounded-lg px-2.5 py-2 text-xs text-white focus:outline-none focus:border-vantare-red-500 transition-colors"
                      >
                        {OUTPUT_MODES.map((mode) => <option key={mode.value} value={mode.value}>{mode.label}</option>)}
                      </select>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Right Column: Live Notifications Timeline */}
        <section className="xl:col-span-2 flex flex-col gap-4 opacity-0 animate-fade-in-up delay-150">
          <div className="card-sleek rounded-xl p-5 flex flex-col overflow-hidden border border-white/5" style={{ maxHeight: '520px' }}>
            <div className="flex items-center justify-between mb-4 flex-shrink-0">
              <span className="v52-eyebrow">Mensajes recientes</span>
              <span className="font-mono text-xs text-vantare-textMuted">
                {notifications.length} mensajes
              </span>
            </div>

            <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-3 min-h-[200px]">
              {notifications.map((msg) => (
                <div
                  key={msg.id}
                  data-testid={`notification-${msg.id}`}
                  className="bg-black/25 border border-white/5 rounded-lg p-3 flex items-start gap-4 hover:bg-white/5 hover:border-vantare-red-500/20 transition-all"
                >
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-vantare-red-950/40 border border-vantare-red-500/20 flex items-center justify-center text-vantare-red-400">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M8 9h8m-8 4h6m2 5a2 2 0 11-4 0h-5V7a2 2 0 012-2h10a2 2 0 012 2v7a2 2 0 01-2 2h-3l-4 4z"
                      />
                    </svg>
                  </div>
                  <div className="flex-1 flex flex-col gap-1">
                    <div className="flex items-center justify-between w-full">
                      <span className="text-xs font-bold uppercase tracking-wider text-vantare-textMuted">
                        {msg.role === 'spotter' ? 'Spotter' : 'Ingeniero'}
                      </span>
                      <span className="font-mono text-[10px] text-vantare-textDim">
                        {formatTime(msg.createdAt)}
                      </span>
                    </div>
                    <span className="text-sm font-medium text-white">{msg.text}</span>
                    <span className="font-mono text-[9px] text-vantare-textDim mt-1">
                      clave: {msg.textKey} · fuente: {msg.source}
                    </span>
                  </div>
                </div>
              ))}

              {notifications.length === 0 && (
                <div className="flex flex-col items-center justify-center h-[300px] text-center gap-2">
                  <svg className="w-12 h-12 text-white/10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="1.5"
                      d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                    />
                  </svg>
                  <span className="text-xs text-vantare-textDim font-mono">
                    Esperando mensajes de telemetría...
                  </span>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>

      {/* Footer */}
      <p className="text-[10px] text-vantare-textDim font-mono text-center mt-2">
        Configuración aplicada localmente · guardado automático
      </p>
    </div>
  );
}
