import {
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { GateFrame } from "./GateFrame";
import "./access-boundary.css";

/** A modal top layer keeps every existing Hub portal inert without dropping drafts. */
function AccessOverlay({
  label,
  controls,
  children,
  onEscape,
}: {
  onEscape?: () => void;
  label: string;
  controls: ReactNode;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const node = dialog.current;
    if (!node) return;
    node.showModal();
    return () => {
      if (node.open) node.close();
    };
  }, []);
  return createPortal(
    <dialog
      ref={dialog}
      className="v-access-overlay"
      aria-label={label}
      aria-modal="true"
      onCancel={(event) => event.preventDefault()}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onEscape?.();
        }
        event.stopPropagation();
      }}
    >
      <GateFrame controls={controls}>{children}</GateFrame>
    </dialog>,
    document.body,
  );
}
export function AccessBoundary({
  active,
  label,
  controls,
  content,
  children,
  onEscape,
}: {
  onEscape?: () => void;
  active: boolean;
  label: string;
  controls: ReactNode;
  content: ReactNode;
  children: ReactNode;
}) {
  const [entered, setEntered] = useState(!active);
  useEffect(() => {
    if (!active) setEntered(true);
  }, [active]);
  return (
    <>
      {(entered || !active) && (
        <div
          className="v-access-retained"
          inert={active || undefined}
          aria-hidden={active || undefined}
        >
          {children}
        </div>
      )}
      {active && (
        <AccessOverlay label={label} controls={controls} onEscape={onEscape}>
          {content}
        </AccessOverlay>
      )}
    </>
  );
}
