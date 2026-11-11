import { OTPField } from "@base-ui/react/otp-field";
import { type Ref, useId } from "react";
import { accountLimits } from "../../contract/generated/account";
import { accessText as text } from "../i18n/access.es";
export function OtpField({
  label,
  value,
  onChange,
  disabled = false,
  readOnly = false,
  fieldRef,
}: {
  fieldRef?: Ref<HTMLDivElement>;
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  readOnly?: boolean;
}) {
  const id = useId();
  const slots = Array.from({ length: accountLimits.code }, (_, position) => ({
    position,
    id: `${id}-${position}`,
  }));
  return (
    <div className="v-field v-access-otp-field">
      <span id={id} className="v-access-otp-label">
        {label}
      </span>
      <OTPField.Root
        ref={fieldRef}
        id={`${id}-input`}
        className="v-input v-access-otp"
        length={accountLimits.code}
        value={value}
        onValueChange={onChange}
        validationType="numeric"
        autoSubmit={false}
        disabled={disabled}
        readOnly={readOnly}
        aria-disabled={readOnly || disabled || undefined}
        role="group"
        autoComplete="one-time-code"
        aria-labelledby={id}
      >
        {!value && (
          <span className="v-access-otp-placeholder" aria-hidden="true">
            {label}
          </span>
        )}
        {slots.map(({ id: slotId, position: index }) => (
          <OTPField.Input
            key={slotId}
            id={slotId}
            className="v-access-otp-slot"
            data-access-secret=""
            render={(props) => (
              <input
                {...props}
                aria-labelledby={undefined}
                aria-label={text.codeDigit(index + 1, accountLimits.code)}
              />
            )}
            data-access-initial={index === 0 ? "" : undefined}
            onCopy={(event) => event.preventDefault()}
            onCut={(event) => event.preventDefault()}
          />
        ))}
      </OTPField.Root>
    </div>
  );
}
