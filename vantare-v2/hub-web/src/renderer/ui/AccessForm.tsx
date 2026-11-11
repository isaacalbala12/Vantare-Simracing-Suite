import type { ComponentProps, ReactNode, Ref } from "react";
import { Button } from "./Button";
export function AccessForm({
  title,
  formRef,
  children,
  ...props
}: ComponentProps<"form"> & { title: string; formRef: Ref<HTMLFormElement> }) {
  return (
    <form {...props} ref={formRef} className="v-access-form">
      <h2>{title}</h2>
      {children}
    </form>
  );
}
export function AccessModes({ children }: { children: ReactNode }) {
  return <div className="v-access-modes">{children}</div>;
}
export function AccessMessage({
  kind,
  children,
}: {
  kind: "consent" | "authorizing";
  children: ReactNode;
}) {
  return <p className={`v-access-${kind}`}>{children}</p>;
}
export function AccessButton({
  kind,
  ...props
}: ComponentProps<typeof Button> & {
  kind: "choice" | "submit" | "mode" | "back";
}) {
  return <Button {...props} className={`v-access-${kind}`} />;
}
export function AccessWaiting({ children }: { children: ReactNode }) {
  return (
    <span id="access-waiting" className="v-sr-only">
      {children}
    </span>
  );
}

export function AccessCallout({ children }: { children: ReactNode }) {
  return (
    <p className="v-access-callout" role="status">
      {children}
    </p>
  );
}
