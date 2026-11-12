import { Dialog as Base } from "@base-ui/react/dialog";
import {
  createContext,
  forwardRef,
  type ReactNode,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { dialogSafety } from "./dialog-safety";

const Safety = createContext<ReturnType<typeof dialogSafety> | null>(null);
const Mode = createContext({
  scope: "screen" as "screen" | "gate" | "notice",
  open: false,
  close: () => {},
  outsideDismiss: true,
});
export function WindowDialogProvider({ children }: { children: ReactNode }) {
  const safety = useMemo(() => dialogSafety(document), []);
  useLayoutEffect(() => safety.listen(), [safety]);
  return <Safety.Provider value={safety}>{children}</Safety.Provider>;
}
type RootProps = Omit<Base.Root.Props, "modal"> & {
  scope?: "screen" | "gate" | "notice";
  modal?: false;
};
function Root({ scope = "screen", ...props }: RootProps) {
  const safety = useContext(Safety);
  const [local, setLocal] = useState(props.defaultOpen ?? false);
  const actions = useRef<Base.Root.Actions>(null);
  const actionRef = props.actionsRef ?? actions;
  const close = useCallback(() => actionRef.current?.close(), [actionRef]);
  const open = props.open ?? local;
  if (!safety)
    return (
      <WindowDialogProvider>
        <Root scope={scope} {...props} />
      </WindowDialogProvider>
    );
  return (
    <Mode.Provider
      value={{
        scope,
        open,
        close,
        outsideDismiss: !props.disablePointerDismissal,
      }}
    >
      <Base.Root
        {...props}
        actionsRef={actionRef}
        open={open}
        modal={false}
        disablePointerDismissal={
          scope === "screen" || props.disablePointerDismissal
        }
        onOpenChange={(value, event) => {
          props.onOpenChange?.(value, event);
          if (!event.isCanceled) setLocal(value);
        }}
      />
    </Mode.Provider>
  );
}
const Popup = forwardRef<HTMLDivElement, Base.Popup.Props>(
  function Popup(props, ref) {
    const safety = useContext(Safety),
      mode = useContext(Mode);
    const node = useRef<HTMLDivElement>(null);
    const setNode = useCallback(
      (element: HTMLDivElement | null) => {
        node.current = element;
        if (typeof ref === "function") ref(element);
        else if (ref) ref.current = element;
      },
      [ref],
    );
    useLayoutEffect(() => {
      if (mode.scope === "screen" && mode.open && node.current)
        return safety?.register({ node: node.current, close: mode.close });
    }, [safety, mode.scope, mode.open, mode.close]);
    return (
      <Base.Popup {...props} ref={setNode} data-window-dialog={mode.scope} />
    );
  },
);
function Backdrop(props: Base.Backdrop.Props) {
  const mode = useContext(Mode);
  return (
    <Base.Backdrop
      {...props}
      onPointerDown={(event) => {
        props.onPointerDown?.(event);
        if (
          !event.defaultPrevented &&
          mode.scope === "screen" &&
          mode.outsideDismiss &&
          event.target === event.currentTarget
        )
          mode.close();
      }}
    />
  );
}
/** Only the screen is modal. Caption controls and native drag remain available. */
export const WindowDialog = { ...Base, Root, Popup, Backdrop };
export const WindowAlertDialog = {
  ...Base,
  Root: (props: RootProps) => <Root {...props} disablePointerDismissal />,
  Popup: forwardRef<HTMLDivElement, Base.Popup.Props>(
    function AlertPopup(props, ref) {
      return <Popup {...props} ref={ref} role="alertdialog" />;
    },
  ),
  Backdrop,
};
