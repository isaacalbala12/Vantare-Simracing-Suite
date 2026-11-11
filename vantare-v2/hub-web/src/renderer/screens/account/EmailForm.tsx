import {
  type FormEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  accountLimits,
  accountOptions,
  type EmailIntent,
  type EmailView,
} from "../../../contract/generated/account";
import { useAccount } from "../../app/AccountState";
import { accessText as text } from "../../i18n/access.es";
import {
  AccessButton,
  AccessCallout,
  AccessForm,
  AccessMessage,
  AccessModes,
  AccessWaiting,
} from "../../ui/AccessForm";
import { Button } from "../../ui/Button";
import { Input } from "../../ui/Forms";
import { OtpField } from "../../ui/OtpField";
import { useSecretInput } from "../../ui/useSecretInput";
export function EmailForm({ value }: { value: EmailView }) {
  const { pending, act, error } = useAccount();
  const root = useRef<HTMLFormElement>(null);
  const focused = useRef("");
  const wasPending = useRef(false);
  const secretStage = useRef("");
  const [email, setEmail] = useState("");
  const [password, setPassword, passwordRef] = useSecretInput();
  const [code, setCode, codeRef] = useSecretInput();
  const [signOutOthers, setSignOutOthers] = useState(false);
  const clearSecrets = useCallback(() => {
    setPassword("");
    setCode("");
  }, [setPassword, setCode]);
  useLayoutEffect(() => {
    const form = root.current;
    return () => {
      form
        ?.querySelectorAll<HTMLInputElement>("[data-access-secret]")
        .forEach((input) => {
          input.value = "";
        });
    };
  }, []);
  const passwordMode =
    value.mode === "signInPassword" || value.mode === "signUpPassword";
  const cooling = value.stage === "form" && value.retryAfterSeconds > 0;
  const canSubmit =
    value.stage !== "authorizing" && value.stage !== "hostedRequired";
  const label = pending
    ? text.submit.waiting
    : value.stage === "code"
      ? text.submit.verify
      : value.stage === "newPassword"
        ? text.submit.password
        : value.stage === "consent"
          ? text.submit.authorize
          : value.restarted && !passwordMode
            ? text.submit.newCode
            : value.mode === "signInPassword"
              ? text.submit.enter
              : text.submit.continue;
  useEffect(() => {
    const key = `${value.mode}:${value.stage}:${value.restarted}`;
    if (secretStage.current !== key) {
      secretStage.current = key;
      setPassword("");
      setCode("");
    }
  }, [value.stage, value.mode, value.restarted, setPassword, setCode]);
  useEffect(() => {
    const key = `${value.mode}:${value.stage}:${value.message}:${error ?? ""}`;
    if (pending) {
      wasPending.current = true;
      return;
    }
    if (wasPending.current || key !== focused.current) {
      focused.current = key;
      wasPending.current = false;
      const selector =
        error === text.reenterPassword
          ? "input[type=password]"
          : "[data-access-initial]";
      root.current?.querySelector<HTMLElement>(selector)?.focus();
    }
  }, [value.mode, value.stage, value.message, pending, error]);
  function submit(event: FormEvent) {
    event.preventDefault();
    if (
      pending ||
      cooling ||
      (value.stage === "code" && code.length !== accountLimits.code)
    )
      return;
    let action: EmailIntent;
    switch (value.stage) {
      case "form":
        action = { action: "begin", mode: value.mode, email, password };
        break;
      case "code":
        action = { action: "verify", code };
        break;
      case "newPassword":
        action = { action: "reset", password, signOutOthers };
        break;
      case "consent":
        action = { action: "finish" };
        break;
      default:
        return;
    }
    void act({ method: "account.email", action }, clearSecrets);
  }
  return (
    <AccessForm
      formRef={root}
      noValidate
      title={text.titles[value.mode]}
      onSubmit={submit}
    >
      {value.stage === "form" && (
        <>
          <Input
            label={text.emailLabel}
            aria-label={text.emailLabel}
            placeholder={text.emailLabel}
            data-access-initial=""
            type="email"
            autoComplete="email"
            spellCheck={false}
            required
            maxLength={accountLimits.email}
            value={email}
            onChange={(event) => setEmail(event.currentTarget.value)}
            readOnly={pending}
            aria-disabled={pending || undefined}
          />
          {passwordMode && (
            <Input
              label={text.password}
              aria-label={text.password}
              data-access-secret=""
              type="password"
              ref={passwordRef}
              autoComplete={
                value.mode === "signInPassword"
                  ? "current-password"
                  : "new-password"
              }
              spellCheck={false}
              required
              maxLength={accountLimits.password}
              value={password}
              onChange={(event) => setPassword(event.currentTarget.value)}
              onCopy={(event) => event.preventDefault()}
              onCut={(event) => event.preventDefault()}
              readOnly={pending}
              aria-disabled={pending || undefined}
            />
          )}
        </>
      )}
      {value.stage === "code" && (
        <>
          <OtpField
            label={text.code}
            fieldRef={codeRef}
            value={code}
            onChange={setCode}
            readOnly={pending}
          />
          <Button
            type="button"
            disabled={pending || value.retryAfterSeconds > 0}
            onClick={() =>
              void act({
                method: "account.email",
                action: { action: "resend" },
              })
            }
          >
            {text.resend}
          </Button>
        </>
      )}
      {value.stage === "newPassword" && (
        <>
          <Input
            label={text.newPassword}
            aria-label={text.newPassword}
            data-access-initial=""
            data-access-secret=""
            type="password"
            ref={passwordRef}
            autoComplete="new-password"
            spellCheck={false}
            required
            maxLength={accountLimits.password}
            value={password}
            onChange={(event) => setPassword(event.currentTarget.value)}
            onCopy={(event) => event.preventDefault()}
            onCut={(event) => event.preventDefault()}
            readOnly={pending}
            aria-disabled={pending || undefined}
          />
          <Button
            type="button"
            aria-pressed={signOutOthers}
            disabled={pending}
            onClick={() => setSignOutOthers((current) => !current)}
          >
            {signOutOthers ? "✓ " : ""}
            {text.signOutOthers}
          </Button>
        </>
      )}
      {value.stage === "consent" && (
        <AccessMessage kind="consent">{text.consent}</AccessMessage>
      )}
      {value.message && <AccessCallout>{value.message}</AccessCallout>}
      {value.stage === "authorizing" && (
        <AccessMessage kind="authorizing">{text.authorizing}</AccessMessage>
      )}
      {value.stage === "hostedRequired" && (
        <AccessButton
          data-access-initial=""
          type="button"
          kind="choice"
          disabled={pending}
          onClick={() => void act({ method: "account.begin" })}
        >
          {text.hosted}
        </AccessButton>
      )}
      {canSubmit && (
        <AccessButton
          type="submit"
          data-access-initial={value.stage === "consent" ? "" : undefined}
          variant="primary"
          kind="submit"
          disabled={
            pending ||
            cooling ||
            (value.stage === "code" && code.length !== accountLimits.code)
          }
          aria-describedby={pending ? "access-waiting" : undefined}
        >
          {label}
        </AccessButton>
      )}
      {value.stage === "form" && (
        <AccessModes>
          {accountOptions.modes
            .filter((mode) => mode !== value.mode)
            .map((mode) => (
              <AccessButton
                key={mode}
                type="button"
                kind="mode"
                disabled={pending}
                onClick={() =>
                  void act({
                    method: "account.email",
                    action: { action: "open", mode },
                  })
                }
              >
                {text.modes[mode]}
              </AccessButton>
            ))}
        </AccessModes>
      )}
      <AccessButton
        type="button"
        kind="back"
        onClick={() => {
          setPassword("");
          setCode("");
          void act({ method: "account.email", action: { action: "cancel" } });
        }}
      >
        {text.back}
      </AccessButton>
      {pending && <AccessWaiting>{text.waiting}</AccessWaiting>}
    </AccessForm>
  );
}
