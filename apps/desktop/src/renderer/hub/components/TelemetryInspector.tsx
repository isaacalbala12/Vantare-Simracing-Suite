import { memo } from 'react';
import type { Telemetry, PlayerData, EngineData, InputData, LapData, SessionData, WeatherData, TyreData, TyreInfo } from '@vantare/sim-core';

// ── Types ────────────────────────────────────────────────────────

export interface TelemetryInspectorProps {
  data: Telemetry | null;
  compact?: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────

function formatTime(ms: number): string {
  if (ms <= 0) return '—';
  const totalSec = ms / 1000;
  const min = Math.floor(totalSec / 60);
  const sec = (totalSec % 60).toFixed(3);
  return min > 0 ? `${min}:${sec.padStart(7, '0')}` : `${sec}s`;
}

function formatTemp(celsius: number): string {
  return `${celsius.toFixed(1)}°C`;
}

function formatPressure(kpa: number): string {
  return `${kpa.toFixed(0)} kPa`;
}

function formatWear(pct: number): string {
  return `${(pct * 100).toFixed(0)}%`;
}

function formatPercent(val: number): string {
  return `${(val * 100).toFixed(1)}%`;
}

function formatSpeed(kmh: number): string {
  return `${kmh.toFixed(1)} km/h`;
}

function formatDelta(sec: number): string {
  if (sec === 0) return '0.000';
  const prefix = sec < 0 ? '-' : '+';
  return `${prefix}${Math.abs(sec).toFixed(3)}`;
}

function flagLabel(flags: { type: string; active: boolean }[]): string {
  const active = flags.filter((f) => f.active).map((f) => f.type.toUpperCase());
  return active.length > 0 ? active.join(', ') : 'None';
}

// ── Field Row ────────────────────────────────────────────────────

interface FieldProps {
  label: string;
  value: string;
  compact?: boolean;
  highlight?: 'good' | 'bad' | 'neutral';
}

const FieldRow = memo(function FieldRow({ label, value, compact, highlight }: FieldProps) {
  const colorClass = highlight === 'good'
    ? 'text-green-400'
    : highlight === 'bad'
      ? 'text-red-400'
      : 'text-white/90';

  if (compact) {
    return (
      <div className="flex items-center justify-between gap-1">
        <span className="text-white/50 text-[10px] uppercase tracking-wider">{label}</span>
        <span className={`text-[11px] font-mono tabular-nums ${colorClass}`}>{value}</span>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-between gap-2 px-2 py-0.5 rounded hover:bg-white/5">
      <span className="text-white/40 text-xs uppercase tracking-wider">{label}</span>
      <span className={`text-sm font-mono tabular-nums ${colorClass}`}>{value}</span>
    </div>
  );
});

// ── Section Wrapper ──────────────────────────────────────────────

interface SectionProps {
  title: string;
  compact?: boolean;
  children: React.ReactNode;
}

const Section = memo(function Section({ title, compact, children }: SectionProps) {
  if (compact) {
    return (
      <div className="space-y-0.5">
        <div className="text-[10px] font-semibold text-white/30 uppercase tracking-wider mb-1 pb-0.5 border-b border-white/10">
          {title}
        </div>
        {children}
      </div>
    );
  }
  return (
    <div className="glass-panel p-3 space-y-1">
      <div className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-2 pb-1 border-b border-white/10">
        {title}
      </div>
      {children}
    </div>
  );
});

// ── Player Section ───────────────────────────────────────────────

interface PlayerSectionProps {
  data: PlayerData;
  compact?: boolean;
}

const PlayerSection = memo(function PlayerSection({ data, compact }: PlayerSectionProps) {
  return (
    <Section title="Player" compact={compact}>
      <FieldRow label="Speed" value={formatSpeed(data.speed)} compact={compact} />
      <FieldRow label="RPM" value={`${data.rpm.toFixed(0)}`} compact={compact} />
      <FieldRow label="Gear" value={data.gear < 0 ? 'R' : data.gear === 0 ? 'N' : `${data.gear}`} compact={compact} />
      <FieldRow label="Position" value={`P${data.position}`} compact={compact} />
      <FieldRow label="Class Pos" value={`P${data.classPosition}`} compact={compact} />
      <FieldRow label="Lap Dist" value={`${data.lapDistance.toFixed(1)}m`} compact={compact} />
      <FieldRow label="Driver" value={data.driverName || '—'} compact={compact} />
      <FieldRow label="Car #" value={data.carNumber || '—'} compact={compact} />
      <FieldRow label="Team" value={data.teamName || '—'} compact={compact} />
    </Section>
  );
});

// ── Engine Section ───────────────────────────────────────────────

interface EngineSectionProps {
  data: EngineData;
  compact?: boolean;
}

const EngineSection = memo(function EngineSection({ data, compact }: EngineSectionProps) {
  const rpmPct = data.maxRpm > 0 ? data.rpm / data.maxRpm : 0;
  const rpmHighlight = rpmPct > 0.95 ? 'bad' : rpmPct > 0.85 ? 'neutral' : 'good' as const;
  const fuelPct = data.fuelCapacity > 0 ? (data.fuelLevel / data.fuelCapacity) * 100 : 0;
  const fuelHighlight = fuelPct < 15 ? 'bad' : fuelPct < 30 ? 'neutral' : 'good' as const;

  return (
    <Section title="Engine" compact={compact}>
      <FieldRow label="RPM" value={`${data.rpm.toFixed(0)} / ${data.maxRpm.toFixed(0)}`} compact={compact} highlight={rpmHighlight} />
      <FieldRow label="Fuel" value={`${data.fuelLevel.toFixed(1)}L / ${data.fuelCapacity.toFixed(1)}L`} compact={compact} highlight={fuelHighlight} />
      <FieldRow label="Fuel Press" value={formatPressure(data.fuelPressure)} compact={compact} />
      <FieldRow label="Water Temp" value={formatTemp(data.waterTemp)} compact={compact} highlight={data.waterTemp > 100 ? 'bad' : data.waterTemp > 90 ? 'neutral' : 'good'} />
      <FieldRow label="Oil Temp" value={formatTemp(data.oilTemp)} compact={compact} highlight={data.oilTemp > 120 ? 'bad' : data.oilTemp > 110 ? 'neutral' : 'good'} />
      <FieldRow label="Oil Press" value={formatPressure(data.oilPressure)} compact={compact} />
      <FieldRow label="Warnings" value={`0x${data.engineWarnings.toString(16).toUpperCase()}`} compact={compact} highlight={data.engineWarnings !== 0 ? 'bad' : 'good'} />
    </Section>
  );
});

// ── Inputs Section ───────────────────────────────────────────────

interface InputsSectionProps {
  data: InputData;
  compact?: boolean;
}

const InputsSection = memo(function InputsSection({ data, compact }: InputsSectionProps) {
  return (
    <Section title="Inputs" compact={compact}>
      <FieldRow label="Throttle" value={formatPercent(data.throttle)} compact={compact} />
      <FieldRow label="Brake" value={formatPercent(data.brake)} compact={compact} />
      <FieldRow label="Clutch" value={formatPercent(data.clutch)} compact={compact} />
      <FieldRow label="Steering" value={`${(data.steering * 100).toFixed(1)}%`} compact={compact} />
    </Section>
  );
});

// ── Lap Section ──────────────────────────────────────────────────

interface LapSectionProps {
  data: LapData;
  compact?: boolean;
}

const LapSection = memo(function LapSection({ data, compact }: LapSectionProps) {
  return (
    <Section title="Lap" compact={compact}>
      <FieldRow label="Current Lap" value={`${data.currentLap}${data.totalLaps > 0 ? ` / ${data.totalLaps}` : ''}`} compact={compact} />
      <FieldRow label="Last Lap" value={formatTime(data.lastLaptime)} compact={compact} />
      <FieldRow label="Best Lap" value={formatTime(data.bestLaptime)} compact={compact} />
      <FieldRow label="Sector 1" value={formatTime(data.sector1)} compact={compact} />
      <FieldRow label="Sector 2" value={formatTime(data.sector2)} compact={compact} />
      <FieldRow label="Sector 3" value={formatTime(data.sector3)} compact={compact} />
      <FieldRow label="Estimated" value={formatTime(data.estimatedLaptime)} compact={compact} />
      <FieldRow label="Delta" value={formatDelta(data.delta)} compact={compact} highlight={data.delta < 0 ? 'good' : data.delta > 0 ? 'bad' : 'neutral'} />
      <FieldRow label="Personal Best" value={data.isPersonalBest ? '✓' : '—'} compact={compact} highlight={data.isPersonalBest ? 'good' : undefined} />
      <FieldRow label="Session Best" value={data.isSessionBest ? '✓' : '—'} compact={compact} highlight={data.isSessionBest ? 'good' : undefined} />
    </Section>
  );
});

// ── Session Section ──────────────────────────────────────────────

interface SessionSectionProps {
  data: SessionData;
  compact?: boolean;
}

const SessionSection = memo(function SessionSection({ data, compact }: SessionSectionProps) {
  const timeRem = data.timeRemaining > 0 ? `${Math.floor(data.timeRemaining / 60)}:${(data.timeRemaining % 60).toFixed(0).padStart(2, '0')}` : '—';
  const timeElapsed = data.timeElapsed > 0 ? `${Math.floor(data.timeElapsed / 60)}:${(data.timeElapsed % 60).toFixed(0).padStart(2, '0')}` : '—';

  return (
    <Section title="Session" compact={compact}>
      <FieldRow label="Type" value={data.type || '—'} compact={compact} />
      <FieldRow label="State" value={data.state || '—'} compact={compact} />
      <FieldRow label="Time Rem" value={timeRem} compact={compact} />
      <FieldRow label="Time Elapsed" value={timeElapsed} compact={compact} />
      <FieldRow label="Total Laps" value={data.totalLaps > 0 ? `${data.totalLaps}` : '—'} compact={compact} />
      <FieldRow label="Flags" value={flagLabel(data.flags)} compact={compact} />
      <FieldRow label="Track" value={data.trackName || '—'} compact={compact} />
      <FieldRow label="Track Length" value={data.trackLength > 0 ? `${data.trackLength.toFixed(2)} km` : '—'} compact={compact} />
      <FieldRow label="Weather" value={`${data.weather?.airTemp?.toFixed(0) ?? '?'}°C / ${data.weather?.trackTemp?.toFixed(0) ?? '?'}°C`} compact={compact} />
    </Section>
  );
});

// ── Weather Section ──────────────────────────────────────────────

interface WeatherSectionProps {
  data: WeatherData;
  compact?: boolean;
}

const WeatherSection = memo(function WeatherSection({ data, compact }: WeatherSectionProps) {
  const windDirLabels = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const windDirIndex = data.windDirection !== 0 ? Math.round(((data.windDirection * 180 / Math.PI) % 360) / 45) % 8 : 0;
  const windLabel = `${windDirLabels[windDirIndex]} ${data.windSpeed.toFixed(1)} m/s`;

  return (
    <Section title="Weather" compact={compact}>
      <FieldRow label="Air Temp" value={formatTemp(data.airTemp)} compact={compact} />
      <FieldRow label="Track Temp" value={formatTemp(data.trackTemp)} compact={compact} />
      <FieldRow label="Humidity" value={`${data.humidity.toFixed(0)}%`} compact={compact} />
      <FieldRow label="Precip" value={`${data.precipitation.toFixed(0)}%`} compact={compact} />
      <FieldRow label="Wind" value={windLabel} compact={compact} />
    </Section>
  );
});

// ── Tyre Info ────────────────────────────────────────────────────

interface TyreCornerProps {
  label: string;
  data: TyreInfo;
  compact?: boolean;
}

const TyreCorner = memo(function TyreCorner({ label, data, compact }: TyreCornerProps) {
  return (
    <div className={compact ? '' : 'px-2 py-1 rounded hover:bg-white/5'}>
      <div className={`font-semibold text-white/50 ${compact ? 'text-[10px]' : 'text-xs'} uppercase tracking-wider mb-0.5`}>
        {label}
      </div>
      <div className={`space-y-0.5 ${compact ? 'text-[10px]' : 'text-xs'} font-mono tabular-nums text-white/80`}>
        <div className="flex justify-between gap-1">
          <span className="text-white/40">Temp</span>
          <span>{formatTemp(data.temp)}</span>
        </div>
        <div className="flex justify-between gap-1">
          <span className="text-white/40">Pressure</span>
          <span>{formatPressure(data.pressure)}</span>
        </div>
        <div className="flex justify-between gap-1">
          <span className="text-white/40">Wear</span>
          <span>{formatWear(data.wear)}</span>
        </div>
      </div>
    </div>
  );
});

interface TyresSectionProps {
  data: TyreData;
  compact?: boolean;
}

const TyresSection = memo(function TyresSection({ data, compact }: TyresSectionProps) {
  if (compact) {
    return (
      <Section title="Tyres" compact={compact}>
        <div className="grid grid-cols-2 gap-1">
          <TyreCorner label="FL" data={data.fl} compact={compact} />
          <TyreCorner label="FR" data={data.fr} compact={compact} />
          <TyreCorner label="RL" data={data.rl} compact={compact} />
          <TyreCorner label="RR" data={data.rr} compact={compact} />
        </div>
      </Section>
    );
  }
  return (
    <Section title="Tyres" compact={compact}>
      <div className="grid grid-cols-2 gap-1">
        <TyreCorner label="FL" data={data.fl} compact={compact} />
        <TyreCorner label="FR" data={data.fr} compact={compact} />
        <TyreCorner label="RL" data={data.rl} compact={compact} />
        <TyreCorner label="RR" data={data.rr} compact={compact} />
      </div>
    </Section>
  );
});

// ── No Data State ────────────────────────────────────────────────

function NoData({ compact }: { compact?: boolean }) {
  if (compact) {
    return (
      <div className="text-[10px] text-white/30 font-mono text-center py-2">
        No telemetry data
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center justify-center h-full gap-2 p-8">
      <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center">
        <svg className="w-5 h-5 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      </div>
      <p className="text-sm text-white/40 font-mono">Awaiting telemetry data...</p>
      <p className="text-xs text-white/20">Connect to a simulator to begin</p>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────

export function TelemetryInspector({ data, compact }: TelemetryInspectorProps) {
  if (!data || !data.isConnected) {
    return <NoData compact={compact} />;
  }

  const containerClass = compact
    ? 'font-sans text-white bg-[#0a0a0a]/90 p-2 space-y-1.5 min-h-0'
    : 'font-sans text-white bg-transparent';

  const contentClass = compact
    ? 'space-y-1.5'
    : 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-4';

  return (
    <div className={containerClass} data-testid="telemetry-inspector">
      <div className={contentClass}>
        <PlayerSection data={data.player} compact={compact} />
        <EngineSection data={data.engine} compact={compact} />
        <InputsSection data={data.inputs} compact={compact} />
        <LapSection data={data.lap} compact={compact} />
        <SessionSection data={data.session} compact={compact} />
        <WeatherSection data={data.weather} compact={compact} />
        <TyresSection data={data.tyres} compact={compact} />
      </div>
    </div>
  );
}
