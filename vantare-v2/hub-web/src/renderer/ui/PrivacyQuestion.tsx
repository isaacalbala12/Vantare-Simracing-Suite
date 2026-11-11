import { Dialog } from "@base-ui/react/dialog";
import { useRef } from "react";
import { privacyGateText as text } from "../i18n/privacy-gate.es";
import { Button } from "./Button";
import { Checkbox } from "./Forms";
import { TrackedCaps } from "./TrackedCaps";
export function PrivacyQuestion({
  usage,
  checked,
  pending,
  error,
  onChecked,
  onDecide,
  onPolicy,
}: {
  usage: boolean;
  checked: boolean;
  pending: boolean;
  error?: string;
  onChecked: (value: boolean) => void;
  onDecide: (value: boolean) => void;
  onPolicy: () => void;
}) {
  const reject = useRef<HTMLButtonElement>(null);
  return (
    <Dialog.Root
      open
      modal="trap-focus"
      disablePointerDismissal
      onOpenChange={(_open, event) => event.cancel()}
    >
      <Dialog.Popup
        className="v-privacy-question"
        initialFocus={reject}
        aria-label={usage ? text.usageLabel : text.crashesLabel}
      >
        <Dialog.Title className="v-privacy-question-title">
          <TrackedCaps>{text.title}</TrackedCaps>
        </Dialog.Title>
        <div className="v-privacy-question-body">
          <h2>{usage ? text.usageQuestion : text.crashesQuestion}</h2>
          <Dialog.Description>
            {usage ? text.usageDescription : text.crashesDescription}
          </Dialog.Description>
          <p>{text.optional}</p>
          {error && <p role="alert">{error}</p>}
          <div className="v-privacy-question-actions">
            <Button
              ref={reject}
              aria-busy={pending || undefined}
              onClick={() => {
                if (!pending) onDecide(false);
              }}
            >
              {text.reject}
            </Button>
            <Button
              aria-busy={pending || undefined}
              onClick={() => {
                if (!pending) onDecide(usage ? checked : true);
              }}
            >
              {usage ? text.continue : text.accept}
            </Button>
          </div>
          <div className="v-privacy-question-policy">
            <Button onClick={onPolicy}>{text.policy}</Button>
          </div>
          {usage && (
            <div className="v-privacy-question-check">
              <Checkbox
                label={text.usage}
                checked={checked}
                onCheckedChange={onChecked}
              />
            </div>
          )}
        </div>
      </Dialog.Popup>
    </Dialog.Root>
  );
}
