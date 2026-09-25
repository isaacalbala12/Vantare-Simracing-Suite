import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { initializeDensity } from './lib/density';
import { applyTheme, type VantareTheme } from './lib/theme';
import orbitThemeJson from './themes/vantare-orbit.json';
import { I18nProvider } from './i18n/I18nProvider';
import { LicenseProvider } from './lib/license';
import { LauncherStoreProvider } from './hub/launcher/launcher-store';
import { OrbitShell } from './hub/components/orbit/OrbitShell';
import type { Section } from './hub/navigation';
import type { AnalysisClient, AnalysisLapRequest, AnalysisPageRequest, AnalysisRevisionRequest, AnalysisSaveRequest } from './strategy/analysis-client';
import type { AnalysisBase, AnalysisStoreResult } from './strategy/analysis-contract';
import { defaultTyreCondition, type StrategyTyre } from './strategy/strategy-tyre';

const SHA_A = 'a'.repeat(64);
const SHA_B = 'b'.repeat(64);
const SHA_C = 'c'.repeat(64);
const REVISION = { sessionId: 'imola-race', baseDigest: SHA_C, revisionId: SHA_A, snapshotId: SHA_B };
const PRACTICE_REVISION = { sessionId: 'imola-practice', baseDigest: SHA_C, revisionId: SHA_B, snapshotId: SHA_C };
const COMBINATION = { id: 'lmu:imola-lmgt3', simId: 'lmu', trackName: 'Imola', trackLayout: 'GP', carName: 'Ford Mustang GT3', carClass: 'LMGT3' };
const BASE: AnalysisBase = { sessionId: REVISION.sessionId, contentSha256: SHA_A, sizeBytes: 184_320_000, parserId: 'lmu-duckdb', parserVersion: '1', schemaFingerprint: 'lmu-2026.09', analysisVersion: 'lap-validity.v1', segmentationDigest: SHA_B };
const CHANNEL = { id: 'fuel', source_name: 'Fuel level', unit: { symbol: 'L', quality: 'valid' as const }, sampling: { kind: 'event_timestamped' as const, origin: 'source_timestamp' as const }, columns: [{ name: 'value', type: 'number' as const }] };

function tyre(id: string, compound: 'medium' | 'hard'): StrategyTyre {
  return { id, compound, origin: 'event_allocation', condition: defaultTyreCondition('event_allocation'), state: 'free', stints: 0 };
}

function seedRecordedDraft() {
  const params = new URLSearchParams(location.search);
  localStorage.setItem('vantare.locale', params.get('locale') || 'es');
  const tyres = [
    tyre('medium-fl', 'medium'), tyre('medium-fr', 'medium'), tyre('medium-rl', 'medium'), tyre('medium-rr', 'medium'),
    tyre('hard-fl', 'hard'), tyre('hard-fr', 'hard'), tyre('hard-rl', 'hard'), tyre('hard-rr', 'hard'),
  ];
  const now = '2026-09-15T12:00:00Z';
  const eventId = 'visual-imola-4h';
  const document = {
    contractVersion: 'strategy.v1', draftId: `recorded-draft:${eventId}`, planId: `recorded-plan:${eventId}`, variantId: 'recorded-main',
    name: '4 Horas de Imola · LMGT3', mode: 'manual', updatedAt: now,
    capabilities: ['manual_inputs', 'telemetry_import'], provenance: { kind: 'manual', sourceId: 'strategy-recorded-visual-harness' }, confidence: { level: 'unknown' },
    payload: { contractVersion: 'strategy.recorded.draft.v1', eventId, draft: {
      step: 'sessions', mode: 'manual', calculationMode: 'dry', combination: { combinationId: COMBINATION.id, simId: COMBINATION.simId, trackName: COMBINATION.trackName, trackLayout: COMBINATION.trackLayout, carName: COMBINATION.carName, carClass: COMBINATION.carClass },
      name: '4 Horas de Imola · LMGT3', race: { format: 'laps', laps: 69 }, tankLiters: 110, initialFuelLiters: 106, fuelReserveLiters: 3,
      pitLossSeconds: 47.4, formationSeconds: 42,
      pitServices: { transitSeconds: 22.4, refuelRateLPerS: 2.5, veRatePPerS: 4.5, tyreSeconds: 14, serviceMode: 'parallel' },
      virtualEnergy: { applicability: 'applicable', capacityPercent: 100, initialPercent: 96, reservePercent: 4 },
      rules: { minPitStops: 2, maxPitStops: 3, requiredWindows: [{ fromLap: 20, toLap: 26 }, { fromLap: 43, toLap: 50 }], mandatoryCompounds: ['medium', 'hard'], allowedCompoundsByClimate: { dry: ['medium', 'hard'], wet: ['wet'] }, driverLimits: { isaac: { minLaps: 15, maxLaps: 30, maxContinuousTimeSeconds: 3300, maxTotalTimeSeconds: 7200 }, sol: { minLaps: 15, maxLaps: 30, maxContinuousTimeSeconds: 3300, maxTotalTimeSeconds: 7200 }, diego: { minLaps: 15, maxLaps: 30, maxContinuousTimeSeconds: 3300, maxTotalTimeSeconds: 7200 } } },
      tyreInventory: { maximum: tyres.length, tyres },
      compoundPace: [
        { compound: 'medium', presence: 'valid', provenance: { kind: 'manual', sourceId: 'event-allocation' }, confidence: { sampleSize: 48, computationVersion: 'visual-harness.v1' }, paceDeltaSeconds: 0, degradationPerLapSeconds: 0.045 },
        { compound: 'hard', presence: 'valid', provenance: { kind: 'manual', sourceId: 'event-allocation' }, confidence: { sampleSize: 32, computationVersion: 'visual-harness.v1' }, paceDeltaSeconds: 0.32, degradationPerLapSeconds: 0.028 },
      ],
      drivers: [{ id: 'isaac', name: 'Isaac Albalá' }, { id: 'sol', name: 'Sol Martín', referenceDriverId: 'isaac', paceDeltaSeconds: 0.42 }, { id: 'diego', name: 'Diego Ferrer', referenceDriverId: 'isaac', paceDeltaSeconds: 0.78 }],
      driverOrder: { mode: 'fixed', ids: ['isaac', 'sol', 'diego'] }, sessions: [REVISION], invalidatedSessionCount: 0,
    } },
  };
  localStorage.setItem('vantare.strategy.harness.repository.v1', JSON.stringify({ version: 7, drafts: { [document.draftId]: document }, revisions: {}, events: {} }));
}

function analysisRevision(revisionId = REVISION.revisionId, snapshotId = REVISION.snapshotId, base = BASE): AnalysisStoreResult {
  return { headId: revisionId, revision: { revisionId, parentRevisionId: '', command: { expectedRevision: '', commandId: '', reason: '', localAuthorId: '' }, commandDigest: '', createdAt: '', snapshot: { contractVersion: 'analysis.mixed-snapshot.v5' as const, base, snapshotId, corrections: [], familyUses: [], classifications: [], stintBoundaries: [] } } };
}

function createRecordedAnalysisClient(): AnalysisClient {
  let current = analysisRevision();
  let saveCount = 0;
  const opened = { sessionId: 'visual-handle-imola', session: { schema_version: 1, id: REVISION.sessionId, channels: [CHANNEL], metadata: [
    { key: 'SessionType', present: true, quality: 'valid', sensitive: false, value: 'race' },
    { key: 'WeatherConditions', present: true, quality: 'valid', sensitive: false, value: 'Dry' },
    { key: 'TrackName', present: true, quality: 'valid', sensitive: false, value: COMBINATION.trackName },
    { key: 'TrackLayout', present: true, quality: 'valid', sensitive: false, value: COMBINATION.trackLayout },
    { key: 'CarName', present: true, quality: 'valid', sensitive: false, value: COMBINATION.carName },
    { key: 'CarClass', present: true, quality: 'valid', sensitive: false, value: COMBINATION.carClass },
  ] } };
  const practice = { sessionId: 'visual-handle-practice', session: { ...opened.session, id: PRACTICE_REVISION.sessionId } };
  const forHandle = (sessionId: string) => sessionId === practice.sessionId
    ? { base: { ...BASE, sessionId: PRACTICE_REVISION.sessionId }, revision: PRACTICE_REVISION }
    : { base: BASE, revision: REVISION };
  const boundary = { stintNumber: 2, timestamp: '2026-09-15T12:42:00Z', cause: 'pit' as const, presence: 'valid' as const, provenance: { kind: 'observed' as const, sourceId: REVISION.sessionId }, confidence: { sampleSize: 1, computationVersion: 'lap-validity.v1' } };
  return {
    status: async () => ({ available: true, root: 'Vantare telemetry', parserCount: 1 }),
    discover: async () => ([
      { id: 'imola-complete', displayName: '2026-09-15_Imola_Race.duckdb', state: 'ready', size: BASE.sizeBytes, modifiedAt: '2026-09-15T10:32:00Z', walPresent: false },
      { id: 'imola-practice', displayName: '2026-09-14_Imola_Practice.duckdb', state: 'ready', size: 96_200_000, modifiedAt: '2026-09-14T19:10:00Z', walPresent: false },
      { id: 'imola-recording', displayName: '2026-09-15_Imola_Active.duckdb', state: 'recording', size: 21_400_000, modifiedAt: '2026-09-15T12:01:00Z', walPresent: true },
    ]),
    open: async (candidateId: string) => candidateId === 'imola-practice' ? practice : opened,
    prepare: async (sessionId: string) => { const source = forHandle(sessionId); return { base: source.base, baseRevisionId: source.revision.revisionId, baseDigest: source.revision.baseDigest, combination: COMBINATION, editableChannelIds: ['fuel'], stintBoundaries: [boundary], stintAnchors: [{ lapNumber: 25, timestamp: '2026-09-15T12:43:45Z' }] }; },
    load: async (request: AnalysisRevisionRequest) => request.sessionId === practice.sessionId
      ? analysisRevision(PRACTICE_REVISION.revisionId, PRACTICE_REVISION.snapshotId, forHandle(request.sessionId).base)
      : request.revisionId === current.revision.revisionId ? current : analysisRevision(request.revisionId, request.revisionId === REVISION.revisionId ? REVISION.snapshotId : request.revisionId),
    pending: async () => undefined,
    project: async (request: AnalysisRevisionRequest) => { const source = forHandle(request.sessionId); return { combinationId: COMBINATION.id, sourceRevisions: [{ ...source.revision, revisionId: request.revisionId }] }; },
    page: async (request: AnalysisPageRequest) => ({ channel_id: request.channelId, start: request.start, sampling: CHANNEL.sampling, samples: Array.from({ length: 12 }, (_, index) => ({ index: request.start + index, values: [{ column: 'value', present: true, quality: index === 7 ? 'unknown' : 'valid', scalar: { kind: 'number', number: 106 - index * 2.7 } }] })) }),
    laps: async (request: AnalysisLapRequest) => { const source = forHandle(request.sessionId); return { revisionId: request.revisionId, headId: request.sessionId === practice.sessionId ? PRACTICE_REVISION.revisionId : current.headId, page: { base: source.base, snapshotId: request.revisionId === current.revision.revisionId ? current.revision.snapshot.snapshotId : source.revision.snapshotId, start: request.start, total: 5, laps: Array.from({ length: 5 }, (_, index) => { const number = request.start + index + 21; const start = `2026-09-15T12:${String(index * 2).padStart(2, '0')}:00Z`; const end = `2026-09-15T12:${String(index * 2 + 1).padStart(2, '0')}:44Z`; const target = { number, start, end }; const familyUse = ['fuel_consumption', 'virtual_energy_consumption', 'combined_stint_pace_curve', 'tyre_degradation', 'saving_cost'].map((family) => ({ family, included: index !== 3, exclusionReasons: index === 3 ? ['incident_offtrack'] : [] })); return { original: { ...target, complete: true, labels: index === 3 ? ['incident_offtrack'] : [], familyUse }, effective: { ...target, complete: true, labels: index === 3 ? ['incident_offtrack'] : [], familyUse }, target, capabilities: familyUse.map((use) => ({ family: use.family, automaticIncluded: use.included, effectiveIncluded: use.included, canInclude: true, canExclude: true })) }; }) } }; },
    save: async (request: AnalysisSaveRequest) => {
      const revisionId = 'def0123456789abc'[Math.min(saveCount++, 15)].repeat(64);
      const preparedId = SHA_C;
      current = { headId: revisionId, revision: {
        revisionId, parentRevisionId: request.command.expectedRevision, command: request.command,
        commandDigest: SHA_C, createdAt: new Date().toISOString(), snapshot: {
          contractVersion: 'analysis.mixed-snapshot.v5', base: request.base, snapshotId: revisionId,
          corrections: request.corrections.map(item => ({ baseId: preparedId, correctionId: revisionId, request: item, original: item.expected, corrected: { ...item.expected, scalar: item.replacement } })),
          familyUses: (request.familyUses ?? []).map(item => ({ baseId: preparedId, correctionId: revisionId, request: item, original: item.expected, corrected: { ...item.expected, included: item.included, exclusionReasons: item.included ? [] : [...(item.expected.exclusionReasons ?? []), 'manual_exclusion'] } })),
          classifications: (request.classifications ?? []).map(item => ({ baseId: preparedId, correctionId: revisionId, request: item, original: item.expectedOriginal, corrected: item.replacement })),
          stintBoundaries: (request.stintBoundaries ?? []).map(item => ({ baseId: preparedId, correctionId: revisionId, request: item, original: item.expected })),
        },
      } };
      return current;
    },
    acknowledge: async () => undefined,
    resolve: async () => ({ found: false, headId: REVISION.revisionId }),
    close: async () => undefined,
  } as unknown as AnalysisClient;
}

applyTheme(orbitThemeJson as unknown as VantareTheme);
initializeDensity();
seedRecordedDraft();

export function RecordedStrategyHarness() {
  const [section, setSection] = useState<Section>('strategy');
  return <LicenseProvider><I18nProvider><LauncherStoreProvider><OrbitShell
    activeSection={section} onNavigate={(next) => setSection(next as Section)}
    sourceStatus={{ name: 'LMU', live: false, available: true } as never}
    testingCenterChannel={null} version="v0.3.9" strategyAnalysisClient={createRecordedAnalysisClient()}
  /></LauncherStoreProvider></I18nProvider></LicenseProvider>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><RecordedStrategyHarness /></StrictMode>);
