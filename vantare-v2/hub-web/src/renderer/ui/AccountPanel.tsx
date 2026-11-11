import { type ReactNode, useState } from "react";
import type {
  AccountRequest,
  AccountView,
  Product,
} from "../../contract/generated/account";
import { accountOptions } from "../../contract/generated/account";
import type { ReleaseNote } from "../../contract/generated/updates";
import { Icon } from "../assets/icons/Icon";
import {
  accountModules,
  type FoundersLanguage,
  foundersCopy,
  accountText as text,
} from "../i18n/account.es";
import { Button } from "./Button";
import { Avatar } from "./Data";
import { initials } from "./initials";
import { TrackedCaps } from "./TrackedCaps";
import "./account-panel.css";
export interface AccountPanelProps {
  value: AccountView;
  pending: boolean;
  demo: boolean;
  act: (request: AccountRequest) => Promise<void>;
  error?: string;
}
export function AccountNotice({ children }: { children: ReactNode }) {
  return (
    <p className="v-account-notice" role="status">
      {children}
    </p>
  );
}
export function AccountPanel({
  value,
  pending,
  demo,
  act,
  error,
  news = [],
}: { news?: readonly ReleaseNote[] } & AccountPanelProps) {
  const [language, setLanguage] = useState<FoundersLanguage>("ES");
  const copy = foundersCopy[language];
  const signedIn = value.session === "signedIn";
  const known = signedIn || value.session === "needsSignIn";
  const verified = value.verified && !value.blocked;
  const plan =
    value.plan.kind === "founders"
      ? copy.owned
      : value.plan.kind === "denied"
        ? value.plan.text
        : value.plan.kind === "verified"
          ? text.verified
          : text.unverified;
  const label = value.name || (known ? text.connected : text.signedOut);
  const purchases: Record<Product, string> = {
    proMonthly: text.monthly,
    proAnnual: text.annual,
    founders: copy.button,
  };
  const action = (request: AccountRequest) => {
    if (!pending && !demo) void act(request);
  };
  return (
    <div className={`v-account-page${demo ? " is-demo" : ""}`}>
      {error && <AccountNotice>{error}</AccountNotice>}
      {value.error && value.error !== error && (
        <AccountNotice>{value.error}</AccountNotice>
      )}
      {value.notice && value.notice !== value.error && (
        <AccountNotice>{value.notice}</AccountNotice>
      )}
      <section className="v-account-hero" aria-label={label}>
        <div className="v-account-avatar">
          <Avatar
            label={label}
            initials={initials(value.name)}
            src={value.photo ?? undefined}
          />
        </div>
        <div className="v-account-identity">
          <h1>{label}</h1>
          <p>{demo ? text.privateEmail : text.sessionHelp}</p>
          <span className={`v-account-pill${verified ? " is-success" : ""}`}>
            {verified ? text.active : plan}
          </span>
          <div className="v-account-photo-actions">
            {!demo && signedIn && (
              <>
                {value.portal && (
                  <Button
                    size="sm"
                    disabled={pending}
                    onClick={() =>
                      action({ method: "account.portal", page: "profile" })
                    }
                  >
                    {text.photo}
                  </Button>
                )}
                <Button
                  size="sm"
                  disabled={pending}
                  onClick={() => action({ method: "account.photoRefresh" })}
                >
                  {text.refreshPhoto}
                </Button>
              </>
            )}
          </div>
        </div>
        <div className="v-account-identity-actions">
          <Button
            size="sm"
            disabled={pending}
            aria-disabled={demo || undefined}
            tabIndex={demo ? -1 : undefined}
            onClick={() => action({ method: "account.check" })}
          >
            {pending ? text.checking : text.check}
          </Button>
          {!demo &&
            accountOptions.products.map((product) => (
              <Button
                key={product}
                size="sm"
                disabled={pending || !signedIn}
                title={
                  !signedIn
                    ? text.buySignedOut
                    : pending
                      ? text.busy
                      : undefined
                }
                onClick={() => action({ method: "account.purchase", product })}
              >
                {purchases[product]}
              </Button>
            ))}
          {known || demo ? (
            <Button
              size="sm"
              disabled={pending}
              aria-disabled={demo || undefined}
              tabIndex={demo ? -1 : undefined}
              onClick={() => action({ method: "account.logout" })}
            >
              {text.logout}
            </Button>
          ) : (
            <Button
              size="sm"
              disabled={pending || !value.configured}
              onClick={() => action({ method: "account.choose" })}
            >
              {text.login}
            </Button>
          )}
        </div>
      </section>
      <div className="v-account-purchase">
        {value.purchase.message && (
          <>
            <AccountNotice>{value.purchase.message}</AccountNotice>
            {value.purchase.waiting && (
              <Button
                size="sm"
                disabled={pending}
                onClick={() => action({ method: "account.purchaseStop" })}
              >
                {text.stopPurchase}
              </Button>
            )}
          </>
        )}
      </div>
      <div className="v-account-overview">
        <section className="v-account-card">
          <h2>{text.beta}</h2>
          <p>{text.betaHelp}</p>
          <span className="v-account-pill">{plan}</span>
          <div className="v-account-founders">
            <strong>{copy.button}</strong>
            <p>{copy.included}</p>
            <p>{copy.subscription}</p>
            <div>
              {(Object.keys(foundersCopy) as FoundersLanguage[]).map((lang) => (
                <Button key={lang} size="sm" onClick={() => setLanguage(lang)}>
                  {lang}
                </Button>
              ))}
            </div>
          </div>
        </section>
        <section className="v-account-card v-account-contribution">
          <h2>{text.contribution}</h2>
          <p>{text.contributionHelp}</p>
          <p>{text.contributionSoon}</p>
        </section>
      </div>
      <section className="v-account-card v-account-modules">
        <h2 className="v-account-card-title">
          <Icon name="v-studio" />
          <TrackedCaps>{text.modules}</TrackedCaps>
        </h2>
        <p>{text.modulesHelp}</p>
        <div>
          {value.modules.map((module) => {
            const copy = accountModules[module.id];
            return (
              <div className="v-account-module" key={module.id}>
                <span className="v-account-module-icon">
                  <Icon name={copy.icon} />
                </span>
                <div>
                  <strong>{copy.title}</strong>
                  <p>{copy.description}</p>
                </div>
                <span
                  className={`v-account-pill${module.status === "included" ? " is-success" : ""}`}
                >
                  {module.status === "included"
                    ? text.included
                    : module.status === "soon"
                      ? text.soon
                      : text.unverified}
                </span>
              </div>
            );
          })}
        </div>
      </section>
      <section className="v-account-card">
        <h2 className="v-account-card-title">
          <Icon name="v-download" />
          <TrackedCaps>{text.news}</TrackedCaps>
        </h2>
        {news.length ? (
          news.map((note) => (
            <div className="v-account-news" key={`${note.channel}:${note.tag}`}>
              <strong>{note.title}</strong>
              <p>{note.summary}</p>
            </div>
          ))
        ) : (
          <p>{text.noNews}</p>
        )}
      </section>
    </div>
  );
}
