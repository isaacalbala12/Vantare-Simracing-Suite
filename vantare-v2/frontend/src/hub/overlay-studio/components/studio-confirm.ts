import { createContext, useContext, useMemo } from 'react';
import { useI18n } from '../../../i18n/I18nProvider';
import { DELETE_WIDGET_CONFIRM_STORAGE_KEY } from '../state/studio-confirm-preferences';
import type { StudioConfirmTone } from './StudioConfirmDialog';

export type StudioConfirmRequest = {
  title: string;
  body: string;
  targets?: readonly string[];
  moreTargetsLabel?: string;
  hint?: string;
  confirmLabel: string;
  cancelLabel: string;
  tone?: StudioConfirmTone;
  remember?: { label: string; storageKey: string };
  testIdPrefix: string;
  commit(): void;
};

export type StudioConfirmApi = {
  request(input: StudioConfirmRequest): void;
  isEnabled(storageKey: string): boolean;
  setEnabled(storageKey: string, enabled: boolean): void;
};

export const StudioConfirmContext = createContext<StudioConfirmApi | null>(null);

export function useStudioConfirm(): StudioConfirmApi | null {
  return useContext(StudioConfirmContext);
}

export type DeleteWidgetConfirmApi = {
  request(input: { widgetNames: readonly string[]; commit(): void }): void;
  enabled: boolean;
  setEnabled(enabled: boolean): void;
};

export function useDeleteWidgetConfirm(): DeleteWidgetConfirmApi | null {
  const confirm = useStudioConfirm();
  const { t } = useI18n();

  return useMemo(() => {
    if (!confirm) return null;
    return {
      request: ({ widgetNames, commit }: { widgetNames: readonly string[]; commit(): void }) => {
        const count = widgetNames.length;
        confirm.request({
          title: t('studio.v3.deleteWidget.title'),
          body:
            count === 1
              ? t('studio.v3.deleteWidget.bodyOne').replace('{name}', widgetNames[0] ?? '')
              : t('studio.v3.deleteWidget.bodyMany').replace('{count}', String(count)),
          targets: count > 1 ? widgetNames : undefined,
          moreTargetsLabel: t('studio.v3.deleteWidget.moreTargets').replace(
            '{count}',
            String(Math.max(0, count - 5)),
          ),
          hint: t('studio.v3.deleteWidget.hint'),
          confirmLabel: t('studio.v3.deleteWidget.confirm'),
          cancelLabel: t('studio.v3.deleteWidget.cancel'),
          tone: 'danger',
          remember: {
            label: t('studio.v3.deleteWidget.dontAskAgain'),
            storageKey: DELETE_WIDGET_CONFIRM_STORAGE_KEY,
          },
          testIdPrefix: 'studio-delete-widget',
          commit,
        });
      },
      enabled: confirm.isEnabled(DELETE_WIDGET_CONFIRM_STORAGE_KEY),
      setEnabled: (enabled: boolean) =>
        confirm.setEnabled(DELETE_WIDGET_CONFIRM_STORAGE_KEY, enabled),
    };
  }, [confirm, t]);
}
