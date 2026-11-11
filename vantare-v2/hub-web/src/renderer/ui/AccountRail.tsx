import { useEffect, useId, useRef, useState } from "react";
import { accountText as text } from "../i18n/account.es";
import { AccountNotice, type AccountPanelProps } from "./AccountPanel";
import { Button } from "./Button";
import { DeviceResetDialog } from "./DeviceResetDialog";
import { RailBlock } from "./Frame";
export function AccountRail({ value, pending, demo, act }: AccountPanelProps) {
  const verified = value.verified && !value.blocked;
  const signedIn = value.session === "signedIn";
  const [resetOpen, setResetOpen] = useState(false);
  const resetTrigger = useRef<HTMLButtonElement>(null);
  const resetDescription = useId();
  const resetDisabled = pending || demo || !signedIn;
  useEffect(() => {
    if (resetDisabled) setResetOpen(false);
  }, [resetDisabled]);
  const resetReason = demo
    ? text.demoDisabled
    : !signedIn
      ? text.resetSignIn
      : pending
        ? text.busy
        : "";
  const rows = [
    [
      text.state,
      demo
        ? text.demoActive
        : value.sessionNotice
          ? text.reauthenticate
          : signedIn
            ? text.sessionConnected
            : text.signedOut,
    ],
    [text.lastAccess, text.unknown],
    [text.duringBeta, text.freeBeta],
    [text.channel, value.channel],
  ];
  return (
    <div className="v-account-rail">
      <RailBlock title={text.sessionTitle} icon="key">
        <span className="v-account-meta">{text.yourSession}</span>
        <dl>
          {rows.map(([label, content], index) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>
                {index === 0 && (
                  <i className={signedIn || demo ? "is-active" : ""} />
                )}
                {content}
              </dd>
            </div>
          ))}
        </dl>
      </RailBlock>
      <RailBlock title={text.devices} icon="v-monitor">
        <span className="v-account-meta">{text.thisComputer}</span>
        <div className={`v-account-device${verified ? " is-verified" : ""}`}>
          <b>{text.pc}</b>
          <div>
            <strong>{text.device}</strong>
            <p>{verified ? text.deviceVerified : text.deviceUnverified}</p>
          </div>
          <i className={verified ? "is-active" : ""} />
        </div>
        {!demo && <AccountNotice>{text.deviceHelp}</AccountNotice>}
        <Button
          ref={resetTrigger}
          size="sm"
          variant={value.deviceLimit ? "primary" : "neutral"}
          disabled={resetDisabled}
          aria-describedby={resetDescription}
          onClick={() => {
            if (!resetDisabled) setResetOpen(true);
          }}
        >
          {text.reset}
        </Button>
        <span className="v-sr-only" id={resetDescription}>
          {resetReason}
        </span>
        <DeviceResetDialog
          open={resetOpen && !resetDisabled}
          disabled={resetDisabled}
          returnFocus={resetTrigger}
          onCancel={() => setResetOpen(false)}
          onConfirm={() => {
            if (resetDisabled) return;
            setResetOpen(false);
            void act({ method: "account.deviceReset" });
          }}
        />
      </RailBlock>
      <RailBlock title={text.mail} icon="v-bell">
        <p>{text.mailSoon}</p>
      </RailBlock>
      <RailBlock title={text.data} icon="v-shield">
        <p>{text.dataSoon}</p>
      </RailBlock>
    </div>
  );
}
