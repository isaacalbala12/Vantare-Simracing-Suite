import { type FormEvent, useEffect, useRef, useState } from "react";
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
export function EmailForm({ value }: { value: EmailView }) {
  const { pending, act } = useAccount();
  const root = useRef<HTMLFormElement>(null);
  const focused = useRef("");
  const secretStage = useRef("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [signOutOthers, setSignOutOthers] = useState(false);
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
  }, [value.stage, value.mode, value.restarted]);
  useEffect(() => {
    const key = `${value.mode}:${value.stage}`;
    if (!pending && key !== focused.current) {
      focused.current = key;
      root.current
        ?.querySelector<HTMLElement>("[data-access-initial]")
        ?.focus();
    }
  }, [value.mode, value.stage, pending]);
  function submit(event: FormEvent) {
    event.preventDefault();
    if (pending || cooling) return;
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
    setPassword("");
    setCode("");
    void act({ method: "account.email", action });
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
            disabled={pending}
          />
          {passwordMode && (
            <Input
              label={text.password}
              aria-label={text.password}
              placeholder={text.password}
              type="password"
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
              disabled={pending}
            />
          )}
        </>
      )}
      {value.stage === "code" && (
        <>
          <OtpField
            label={text.code}
            value={code}
            onChange={setCode}
            disabled={pending}
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
            placeholder={text.newPassword}
            data-access-initial=""
            type="password"
            autoComplete="new-password"
            spellCheck={false}
            required
            maxLength={accountLimits.password}
            value={password}
            onChange={(event) => setPassword(event.currentTarget.value)}
            onCopy={(event) => event.preventDefault()}
            onCut={(event) => event.preventDefault()}
            disabled={pending}
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
          disabled={pending || cooling}
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
