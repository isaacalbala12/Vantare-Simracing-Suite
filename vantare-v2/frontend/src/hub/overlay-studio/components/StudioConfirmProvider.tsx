import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { readConfirmEnabled, writeConfirmEnabled } from '../state/studio-confirm-preferences';
import { StudioConfirmDialog } from './StudioConfirmDialog';
import {
  StudioConfirmContext,
  type StudioConfirmApi,
  type StudioConfirmRequest,
} from './studio-confirm';

export type StudioConfirmProviderProps = {
  children: ReactNode;
  storage?: Storage | null;
};

export function StudioConfirmProvider(props: StudioConfirmProviderProps): React.ReactElement {
  const { children, storage } = props;
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [pending, setPending] = useState<StudioConfirmRequest | null>(null);

  const isEnabled = useCallback(
    (storageKey: string) => overrides[storageKey] ?? readConfirmEnabled(storageKey, storage),
    [overrides, storage],
  );

  const setEnabled = useCallback(
    (storageKey: string, enabled: boolean) => {
      setOverrides((current) => ({ ...current, [storageKey]: enabled }));
      writeConfirmEnabled(storageKey, enabled, storage);
    },
    [storage],
  );

  const request = useCallback(
    (input: StudioConfirmRequest) => {
      if (input.remember && !isEnabled(input.remember.storageKey)) {
        input.commit();
        return;
      }
      setPending(input);
    },
    [isEnabled],
  );

  const api = useMemo<StudioConfirmApi>(
    () => ({ request, isEnabled, setEnabled }),
    [isEnabled, request, setEnabled],
  );

  const handleConfirm = useCallback(
    (dontAskAgain: boolean) => {
      if (dontAskAgain && pending?.remember) {
        setEnabled(pending.remember.storageKey, false);
      }
      pending?.commit();
      setPending(null);
    },
    [pending, setEnabled],
  );

  return (
    <StudioConfirmContext.Provider value={api}>
      {children}
      {pending ? (
        <StudioConfirmDialog
          open
          title={pending.title}
          body={pending.body}
          targets={pending.targets}
          moreTargetsLabel={pending.moreTargetsLabel}
          hint={pending.hint}
          confirmLabel={pending.confirmLabel}
          cancelLabel={pending.cancelLabel}
          tone={pending.tone}
          rememberLabel={pending.remember?.label}
          testIdPrefix={pending.testIdPrefix}
          onCancel={() => setPending(null)}
          onConfirm={handleConfirm}
        />
      ) : null}
    </StudioConfirmContext.Provider>
  );
}
