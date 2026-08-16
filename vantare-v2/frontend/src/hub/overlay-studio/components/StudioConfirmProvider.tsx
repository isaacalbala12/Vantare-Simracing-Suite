import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useI18n } from "../../../i18n/I18nProvider";
import {
  DELETE_WIDGET_CONFIRM_STORAGE_KEY,
  readConfirmEnabled,
  writeConfirmEnabled,
} from "../state/studio-confirm-preferences";
import { StudioConfirmDialog, type StudioConfirmTone } from "./StudioConfirmDialog";

export type StudioConfirmRequest = {
  title: string;
  body: string;
  targets?: readonly string[];
  moreTargetsLabel?: string;
  hint?: string;
  confirmLabel: string;
  cancelLabel: string;
  tone?: StudioConfirmTone;
  /** Con `storageKey`, el dialogo ofrece "no volver a preguntar" y lo recuerda. */
  remember?: { label: string; storageKey: string };
  testIdPrefix: string;
  commit(): void;
};

export type StudioConfirmApi = {
  request(input: StudioConfirmRequest): void;
  isEnabled(storageKey: string): boolean;
  setEnabled(storageKey: string, enabled: boolean): void;
};

const StudioConfirmContext = createContext<StudioConfirmApi | null>(null);

/**
 * Las confirmaciones se piden desde sitios que no comparten padre cercano --
 * la barra del lienzo, el menu contextual, el inspector -- mas la tecla Supr.
 * Un contexto evita bajar el dialogo por props por toda esa rama y garantiza
 * que solo haya un dialogo montado.
 *
 * Sin proveedor el hook devuelve null y quien llama se queda con su
 * `window.confirm` de siempre, que es lo que usan los tests unitarios de los
 * componentes sueltos.
 */
export function useStudioConfirm(): StudioConfirmApi | null {
  return useContext(StudioConfirmContext);
}

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

export type DeleteWidgetConfirmApi = {
  request(input: { widgetNames: readonly string[]; commit(): void }): void;
  enabled: boolean;
  setEnabled(enabled: boolean): void;
};

/**
 * El borrado de widget, con sus textos ya resueltos. Vive aqui y no en el
 * dialogo para que este siga sin saber que es un widget.
 */
export function useDeleteWidgetConfirm(): DeleteWidgetConfirmApi | null {
  const confirm = useStudioConfirm();
  const { t } = useI18n();

  return useMemo(() => {
    if (!confirm) {
      return null;
    }
    return {
      request: ({ widgetNames, commit }) => {
        const count = widgetNames.length;
        confirm.request({
          title: t("studio.v3.deleteWidget.title"),
          body:
            count === 1
              ? t("studio.v3.deleteWidget.bodyOne").replace("{name}", widgetNames[0] ?? "")
              : t("studio.v3.deleteWidget.bodyMany").replace("{count}", String(count)),
          targets: count > 1 ? widgetNames : undefined,
          moreTargetsLabel: t("studio.v3.deleteWidget.moreTargets").replace(
            "{count}",
            String(Math.max(0, count - 5)),
          ),
          hint: t("studio.v3.deleteWidget.hint"),
          confirmLabel: t("studio.v3.deleteWidget.confirm"),
          cancelLabel: t("studio.v3.deleteWidget.cancel"),
          tone: "danger",
          remember: {
            label: t("studio.v3.deleteWidget.dontAskAgain"),
            storageKey: DELETE_WIDGET_CONFIRM_STORAGE_KEY,
          },
          testIdPrefix: "studio-delete-widget",
          commit,
        });
      },
      enabled: confirm.isEnabled(DELETE_WIDGET_CONFIRM_STORAGE_KEY),
      setEnabled: (enabled: boolean) =>
        confirm.setEnabled(DELETE_WIDGET_CONFIRM_STORAGE_KEY, enabled),
    };
  }, [confirm, t]);
}
