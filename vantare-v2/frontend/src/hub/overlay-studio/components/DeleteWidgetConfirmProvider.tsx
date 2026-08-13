import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import {
  readDeleteWidgetConfirmEnabled,
  writeDeleteWidgetConfirmEnabled,
} from "../state/delete-widget-confirm";
import { DeleteWidgetDialog } from "./DeleteWidgetDialog";

export type DeleteWidgetConfirmRequest = {
  widgetNames: readonly string[];
  commit(): void;
};

export type DeleteWidgetConfirmApi = {
  /** Confirma y ejecuta, o ejecuta directo si la persona apago el aviso. */
  request(input: DeleteWidgetConfirmRequest): void;
  enabled: boolean;
  setEnabled(enabled: boolean): void;
};

const DeleteWidgetConfirmContext = createContext<DeleteWidgetConfirmApi | null>(null);

/**
 * El borrado se pide desde tres sitios que no comparten padre cercano -- la
 * barra del lienzo, el menu contextual y el inspector -- mas la tecla Supr.
 * Un contexto evita bajar el dialogo por props por toda esa rama y garantiza
 * que solo haya un dialogo montado.
 *
 * Sin proveedor el hook devuelve null y quien llama se queda con su
 * `confirmDelete` de siempre, que es lo que usan los tests unitarios de los
 * componentes sueltos.
 */
export function useDeleteWidgetConfirm(): DeleteWidgetConfirmApi | null {
  return useContext(DeleteWidgetConfirmContext);
}

export type DeleteWidgetConfirmProviderProps = {
  children: ReactNode;
  storage?: Storage | null;
};

export function DeleteWidgetConfirmProvider(
  props: DeleteWidgetConfirmProviderProps,
): React.ReactElement {
  const { children, storage } = props;
  const [enabled, setEnabledState] = useState(() => readDeleteWidgetConfirmEnabled(storage));
  const [pending, setPending] = useState<DeleteWidgetConfirmRequest | null>(null);

  const setEnabled = useCallback(
    (next: boolean) => {
      setEnabledState(next);
      writeDeleteWidgetConfirmEnabled(next, storage);
    },
    [storage],
  );

  const request = useCallback(
    (input: DeleteWidgetConfirmRequest) => {
      if (!enabled) {
        input.commit();
        return;
      }
      setPending(input);
    },
    [enabled],
  );

  const api = useMemo<DeleteWidgetConfirmApi>(
    () => ({ request, enabled, setEnabled }),
    [enabled, request, setEnabled],
  );

  const handleConfirm = useCallback(
    (dontAskAgain: boolean) => {
      if (dontAskAgain) {
        setEnabled(false);
      }
      pending?.commit();
      setPending(null);
    },
    [pending, setEnabled],
  );

  return (
    <DeleteWidgetConfirmContext.Provider value={api}>
      {children}
      <DeleteWidgetDialog
        open={pending !== null}
        widgetNames={pending?.widgetNames ?? []}
        onCancel={() => setPending(null)}
        onConfirm={handleConfirm}
      />
    </DeleteWidgetConfirmContext.Provider>
  );
}
