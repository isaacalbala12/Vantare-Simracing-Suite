import { OTPField } from "@base-ui/react/otp-field";
import { useId } from "react";
import { accountLimits } from "../../contract/generated/account";
export function OtpField({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const slots = Array.from({ length: accountLimits.code }, (_, position) => ({
    position,
    id: `${id}-${position}`,
  }));
  return (
    <div className="v-field v-access-otp-field">
      <label id={id} htmlFor={`${id}-input`}>
        {label}
      </label>
      <OTPField.Root
        id={`${id}-input`}
        className="v-input v-access-otp"
        length={accountLimits.code}
        value={value}
        onValueChange={onChange}
        validationType="numeric"
        autoSubmit={false}
        disabled={disabled}
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
            className="v-access-otp-slot"
            aria-label={index ? `${label} ${index + 1}` : label}
            data-access-initial={index === 0 ? "" : undefined}
            onCopy={(event) => event.preventDefault()}
            onCut={(event) => event.preventDefault()}
          />
        ))}
      </OTPField.Root>
    </div>
  );
}
