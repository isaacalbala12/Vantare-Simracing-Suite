import { type ReactNode, useEffect, useRef } from "react";
import { Icon } from "../assets/icons/Icon";
import { accessText as text } from "../i18n/access.es";
import { EmailForm } from "../screens/account/EmailForm";
import { AccessBoundary } from "../ui/AccessBoundary";
import { AccessCallout } from "../ui/AccessForm";
import { Button } from "../ui/Button";
import { useAccount } from "./AccountState";
import { WindowControls } from "./WindowControls";
import "../screens/account/access.css";
export function AccountGate({ children }: { children: ReactNode }) {
  const { value, pending, error, act, reload } = useAccount();
  const content = useRef<HTMLDivElement>(null);
  const gate = value?.gate;
  const canBack =
    gate === "choose" &&
    (value?.session === "signedIn" || value?.session === "needsSignIn");
  useEffect(() => {
    if (gate && gate !== "none" && gate !== "email")
      content.current
        ?.querySelector<HTMLElement>("button:not(:disabled)")
        ?.focus();
  }, [gate]);
  const failure = error || value?.error;
  return (
    <AccessBoundary
      active={gate !== "none"}
      label={text.title}
      controls={<WindowControls />}
      onEscape={
        canBack && !pending
          ? () => {
              void act({ method: "account.back" });
            }
          : undefined
      }
      content={
        <div className="v-access" ref={content}>
          <header className="v-access-heading">
            <span className="v-access-logo">
              <Icon name="i-vantare" />
            </span>
            <h1>{text.title}</h1>
            <p>{text.subtitle}</p>
          </header>
          <div className="v-access-body">
            {!value ? (
              <p className="v-access-status">{text.checking}</p>
            ) : gate === "email" && value.email ? (
              <EmailForm key={value.email.mode} value={value.email} />
            ) : gate === "canceling" ? (
              <p className="v-access-status">{text.canceling}</p>
            ) : gate === "logoutFailed" ? (
              <p className="v-access-status">{text.logoutFailed}</p>
            ) : gate === "loggingOut" ? (
              <p className="v-access-status">{text.loggingOut}</p>
            ) : gate === "waitingBrowser" ? (
              <div className="v-access-waiting">
                <p className="v-access-status">{text.waitingBrowser}</p>
                <Button onClick={() => void act({ method: "account.cancel" })}>
                  {text.cancel}
                </Button>
              </div>
            ) : gate === "checking" && !failure ? (
              <p className="v-access-status">{text.checking}</p>
            ) : (
              <>
                <div className="v-access-providers">
                  <Button
                    variant="primary"
                    className="v-access-choice"
                    disabled={pending}
                    onClick={() => void act({ method: "account.begin" })}
                  >
                    {text.google}
                  </Button>
                  <Button
                    className="v-access-choice"
                    disabled={pending}
                    onClick={() => void act({ method: "account.begin" })}
                  >
                    {text.discord}
                  </Button>
                </div>
                <div className="v-access-separator">
                  <i />
                  {text.or}
                  <i />
                </div>
                <Button
                  className="v-access-choice"
                  disabled={pending}
                  onClick={() =>
                    void act({
                      method: "account.email",
                      action: { action: "open", mode: "signInCode" },
                    })
                  }
                >
                  {text.email}
                </Button>
                <div className="v-access-links">
                  <Button
                    role="link"
                    variant="ghost"
                    className="v-access-link"
                    disabled={pending}
                    onClick={() =>
                      void act({
                        method: "account.email",
                        action: { action: "open", mode: "signUpCode" },
                      })
                    }
                  >
                    {text.create}
                  </Button>
                  <Button
                    role="link"
                    variant="ghost"
                    className="v-access-link v-access-recover"
                    disabled={pending}
                    onClick={() =>
                      void act({
                        method: "account.email",
                        action: { action: "open", mode: "recovery" },
                      })
                    }
                  >
                    {text.recover}
                  </Button>
                </div>
                <p className="v-access-browser-note">{text.browserNote}</p>
              </>
            )}
            {canBack && (
              <Button
                disabled={pending}
                onClick={() => void act({ method: "account.back" })}
              >
                {text.back}
              </Button>
            )}
            {failure && (
              <>
                <AccessCallout>{failure}</AccessCallout>
                <Button
                  disabled={pending}
                  onClick={() =>
                    value && gate !== "email"
                      ? void act({ method: "account.retry" })
                      : reload()
                  }
                >
                  {gate === "logoutFailed" ? text.retryLogout : text.retry}
                </Button>
              </>
            )}
            {gate === "logoutFailed" && value?.canReturnAfterLogout && (
              <Button
                disabled={pending}
                onClick={() => void act({ method: "account.back" })}
              >
                {text.back}
              </Button>
            )}
            {value?.copyLink.available && (
              <div className="v-access-copy">
                <Button
                  disabled={pending}
                  onClick={() => void act({ method: "account.copyLink" })}
                >
                  {text.copy}
                </Button>
                {value.copyLink.copied && <p>{text.copied}</p>}
              </div>
            )}
          </div>
          <footer>{text.footer}</footer>
        </div>
      }
    >
      {children}
    </AccessBoundary>
  );
}
