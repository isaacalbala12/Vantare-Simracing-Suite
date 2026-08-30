import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Events } from '@wailsio/runtime';
import type { OverlayPerformanceV2 } from '../../../generated/telemetry';
import { useI18n } from '../../../i18n/I18nProvider';
import type {
  ProfilePerformanceModeV4,
  ProfilePerformanceV4,
} from '../../../overlay/core/profile-document';
import { Button, Chip, Select } from '../../../ui/orbit';
import { profileTarget } from '../../state/overlay-workbench';
import { useOverlayState } from '../../orbit/use-overlay-state';
import type { StudioProfileEntry } from '../studio-profile-entry';
import { useStudioDocument } from '../state/studio-store';

/** Ancho del selector de perfil en la topbar (`06 § Overlays Studio`). */
const PROFILE_SELECT_WIDTH = 260;

export type StudioTopbarControlsProps = {
  profiles: StudioProfileEntry[];
  activeFile: string;
  onRequestProfileChange(file: string): void;
};

/**
 * Controles del Studio en la topbar de la shell (slot `children` de `Topbar`).
 *
 * El estado de guardado es el real del store (`dirty`/`saveState`), no una
 * copia: `state="dirty"` mientras haya cambios y `"saved"` cuando el store lo
 * confirma. Aqui tambien aterriza `studio:save`, la accion que la paleta de
 * comandos ya emitia sin que nadie la atendiera.
 */
export function StudioTopbarControls(props: StudioTopbarControlsProps): React.ReactElement {
  const { profiles, activeFile, onRequestProfileChange } = props;
  const { t } = useI18n();
  const { dirty, saveState, save } = useStudioDocument();
  const overlay = useOverlayState();
  const activeProfile = useMemo(
    () => profiles.find((profile) => profile.file === activeFile),
    [activeFile, profiles],
  );
  const [profilePerformanceEdit, setProfilePerformanceEdit] = useState<{
    file: string;
    performance?: ProfilePerformanceV4;
  } | null>(null);
  const profileSaveSequence = useRef(0);
  const pendingPerformanceSave = useRef<{
    requestId: string;
    file: string;
    previous?: ProfilePerformanceV4;
  } | null>(null);
  const profilePerformance =
    profilePerformanceEdit && profilePerformanceEdit.file === activeFile
      ? profilePerformanceEdit.performance
      : activeProfile?.performance;
  const [effectiveLevel, setEffectiveLevel] = useState<1 | 2 | 3 | 4 | 5>(1);

  useEffect(() => {
    const offLevel = Events.On('performance:level', (event: { data?: OverlayPerformanceV2 }) => {
      const level = event.data?.level;
      if (level && level >= 1 && level <= 5) setEffectiveLevel(level as 1 | 2 | 3 | 4 | 5);
    });
    const offSaved = Events.On(
      'studio:profile:performance:saved',
      (event: { data?: { requestId?: string; performance?: ProfilePerformanceV4 } }) => {
        const pending = pendingPerformanceSave.current;
        if (!pending || event.data?.requestId !== pending.requestId || pending.file !== activeFile) return;
        pendingPerformanceSave.current = null;
        setProfilePerformanceEdit({ file: activeFile, performance: event.data?.performance });
      },
    );
    const revertPendingSave = (event: { data?: { requestId?: string } }) => {
      const pending = pendingPerformanceSave.current;
      if (!pending || event.data?.requestId !== pending.requestId || pending.file !== activeFile) return;
      pendingPerformanceSave.current = null;
      setProfilePerformanceEdit({ file: pending.file, performance: pending.previous });
    };
    const offError = Events.On('studio:profile:error', revertPendingSave);
    const offConflict = Events.On('studio:profile:conflict', revertPendingSave);
    Events.Emit('settings:get');
    return () => {
      pendingPerformanceSave.current = null;
      offLevel?.();
      offSaved?.();
      offError?.();
      offConflict?.();
    };
  }, [activeFile]);

  const saveLabel =
    saveState === 'saving'
      ? t('studio.topbar.autoSaving')
      : saveState === 'error' || saveState === 'conflict'
        ? t('studio.topbar.retrySave')
        : dirty
          ? t('studio.topbar.savePending')
          : t('studio.topbar.autoSaved');

  const runSave = useCallback(() => {
    void save();
  }, [save]);

  useEffect(() => {
    const unsubscribe = Events.On('studio:save', () => runSave());
    return () => unsubscribe?.();
  }, [runSave]);

  const toggleOverlay = useCallback(() => {
    if (overlay.running) {
      Events.Emit('overlay:stop');
      return;
    }
    if (overlay.active) {
      Events.Emit('overlay:start', profileTarget(overlay.active));
      return;
    }
    Events.Emit('overlay:start-active');
  }, [overlay.active, overlay.running]);

  const savePerformance = useCallback((performance: ProfilePerformanceV4) => {
    profileSaveSequence.current += 1;
    const requestId = `studio-performance-${profileSaveSequence.current.toString(36)}`;
    pendingPerformanceSave.current = {
      requestId,
      file: activeFile,
      previous: profilePerformance,
    };
    Events.Emit('studio:profile:performance:save', {
      requestId,
      performance,
    });
  }, [activeFile, profilePerformance]);

  const performanceMode = profilePerformance?.mode ?? 'inherit';
  const selectedLevel = profilePerformance?.level ?? effectiveLevel;
  const setPerformanceMode = (mode: ProfilePerformanceModeV4) => {
    if (mode === 'inherit') {
      savePerformance({ mode: 'inherit' });
      return;
    }
    savePerformance({
      mode,
      level: selectedLevel,
      ...(mode === 'custom' ? { overrides: profilePerformance?.overrides ?? {} } : {}),
    });
  };

  const setPerformanceLevel = (value: string) => {
    const level = Number(value) as 1 | 2 | 3 | 4 | 5;
    savePerformance({
      mode: performanceMode === 'custom' ? 'custom' : 'level',
      level,
      ...(performanceMode === 'custom' ? { overrides: profilePerformance?.overrides ?? {} } : {}),
    });
  };

  return (
    <div className="orbit-studio-topbar" data-testid="orbit-studio-topbar-controls">
      <Select
        className="orbit-studio-topbar__profile"
        label={t('studio.topbar.profile')}
        onChange={(file) => onRequestProfileChange(file)}
        options={profiles.map((profile) => ({ value: profile.file, label: profile.name }))}
        value={activeFile}
        width={PROFILE_SELECT_WIDTH}
      />
      <div data-testid="studio-performance-mode">
        <Select
          label={t('studio.topbar.performanceMode')}
          onChange={setPerformanceMode}
          options={[
            { value: 'inherit', label: t('studio.topbar.performanceInherit') },
            { value: 'level', label: t('studio.topbar.performanceLevel') },
            { value: 'custom', label: t('settings.performance.custom') },
          ]}
          value={performanceMode}
        />
      </div>
      {performanceMode !== 'inherit' ? (
        <div data-testid="studio-performance-level">
          <Select
            label={t('studio.topbar.performanceLevel')}
            onChange={setPerformanceLevel}
            options={(['1', '2', '3', '4', '5'] as const).map((level) => ({
              value: level,
              label: t(`settings.performance.${level}`),
            }))}
            value={String(selectedLevel) as '1' | '2' | '3' | '4' | '5'}
          />
        </div>
      ) : null}
      <span data-testid="studio-performance-badge">
        <Chip tone="reference">
          {t('studio.topbar.performanceEffective')}: {t(`settings.performance.${effectiveLevel}`)}
        </Chip>
      </span>
      <Button
        data-save-state={saveState}
        data-testid="orbit-studio-save"
        onClick={runSave}
        state={dirty ? 'dirty' : 'saved'}
        variant="primary"
      >
        {saveLabel}
      </Button>
      <Button
        data-testid="orbit-studio-overlay-toggle"
        onClick={toggleOverlay}
        state={overlay.running ? 'running' : 'idle'}
      >
        {overlay.running ? t('studio.topbar.stopOverlay') : t('studio.topbar.openOverlay')}
      </Button>
    </div>
  );
}
