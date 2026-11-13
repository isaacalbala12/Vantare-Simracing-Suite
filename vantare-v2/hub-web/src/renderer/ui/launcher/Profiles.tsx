import { useEffect, useId, useRef } from "react";
import type {
  LauncherApp,
  LauncherProfile,
  LauncherView,
} from "../../../contract/generated/contract";
import {
  launcherLimits,
  profileCopySuffix,
  profileLimits,
} from "../../../contract/generated/contract";
import { Icon, type IconName } from "../../assets/icons/Icon";
import { launcherText as text } from "../../i18n/launcher";
import { controlText } from "../../i18n/launcher-control";
import type { ResidentControlController } from "../../screens/launcher/resident-control";
import { Button } from "../Button";
import { Callout } from "../Data";
import { Tooltip } from "../Layers";
import { circuit } from "./generated/circuit";
import { type ProfileCardAction, ProfileCardActions } from "./ProfileActions";
import "./profiles.css";

const glyphs: Record<string, IconName> = {
  lmu: "v-helmet",
  obs: "v-camera",
  spotify: "v-music",
  crewchief: "headset",
  discord: "v-chat",
  simhub: "v-sliders",
  "custom:vantare": "mark",
};
export function AppMark({
  app,
  small = false,
}: {
  app: LauncherApp;
  small?: boolean;
}) {
  return (
    <span
      className={`v-launcher-app-mark${small ? " v-launcher-app-mark--small" : ""}`}
      data-app={app.id}
      aria-hidden="true"
    >
      {glyphs[app.id] ? <Icon name={glyphs[app.id]} /> : app.name.slice(0, 1)}
    </span>
  );
}
export function Circuit() {
  return (
    <svg className="v-launcher-circuit" viewBox={circuit[0]} aria-hidden="true">
      <path
        className="v-launcher-circuit-halo"
        d={circuit[1]}
        vectorEffect="non-scaling-stroke"
      />
      <path
        className="v-launcher-circuit-line"
        d={circuit[1]}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
export function LauncherProfiles({
  view,
  selected,
  pending,
  error,
  accepted,
  onSelect,
  onLaunch,
  onReload,
  onEdit,
  onNew,
  onApplications,
  onAction,
  control,
}: {
  view: LauncherView;
  selected?: string;
  pending: boolean;
  error?: string;
  accepted: boolean;
  control?: ResidentControlController;
  onEdit?: (id: string) => void;
  onNew?: () => void;
  onApplications?: () => void;
  onAction: (profile: LauncherProfile, action: ProfileCardAction) => void;
  onSelect: (id: string) => void;
  onLaunch: (profile: LauncherProfile) => void;
  onReload: () => void;
}) {
  const help = useId();
  const rehearseButton = useRef<HTMLButtonElement>(null);
  const cancelledHere = useRef(false);
  const showCancel = !!(view.running || control?.cancelTarget);
  useEffect(() => {
    if (showCancel) return;
    const restore = cancelledHere.current;
    cancelledHere.current = false;
    if (restore && document.activeElement === document.body)
      rehearseButton.current?.focus();
  }, [showCancel]);
  const profile =
    view.profiles.find((item) => item.id === selected) ??
    view.profiles.find((item) => item.favorite) ??
    view.profiles[0];
  const cancelTarget = control?.cancelTarget;
  const rehearseTarget =
    profile && control?.scope
      ? { ...control.scope, profile: profile.id, revision: view.revision }
      : undefined;
  const cancelReason =
    control && cancelTarget
      ? control.reason({ kind: "cancel", target: cancelTarget })
      : control?.capable
        ? "active"
        : "unsupported";
  const rehearseReason =
    control && rehearseTarget
      ? control.reason({ kind: "rehearse", target: rehearseTarget })
      : control?.capable
        ? "unavailable"
        : "unsupported";
  const apps = (item: LauncherProfile) =>
    item.apps.flatMap((id) => {
      const app = view.apps.find((app) => app.id === id);
      return app ? [app] : [];
    });
  const missing = profile ? apps(profile).filter((app) => !app.available) : [];
  return (
    <div className="v-launcher-page">
      <header className="v-launcher-heading">
        <div>
          <h1>{text.title}</h1>
          <p>{text.description}</p>
        </div>
        <Button disabled={!onNew || pending || view.protected} onClick={onNew}>
          {text.newProfile}
        </Button>
      </header>
      {error && (
        <Callout
          tone="err"
          title={error}
          actions={
            <Button disabled={pending} onClick={onReload}>
              {text.reload}
            </Button>
          }
        />
      )}
      {view.protected && <Callout tone="warn" title={text.protected} />}
      {accepted && <Callout title={text.queued} />}
      {profile ? (
        <>
          <div className="v-launcher-warning">
            <p>
              {view.scanning
                ? text.scanning
                : missing.length
                  ? text.missing(missing.map((app) => app.name))
                  : !view.resident
                    ? text.residentMissing
                    : view.running
                      ? text.running
                      : ""}
            </p>
            <Button
              disabled={!onApplications || pending}
              onClick={onApplications}
            >
              {text.applications}
            </Button>
          </div>
          <section className="v-launcher-hero" aria-label={profile.name}>
            <Circuit />
            <div className="v-launcher-meta">
              {view.running
                ? text.runningHeading
                : profile.favorite
                  ? text.favoriteHeading
                  : text.selectedHeading}
            </div>
            <h2>{profile.name}</h2>
            <p>{profile.description || text.defaultDescription}</p>
            <div className="v-launcher-actions">
              {showCancel && (
                <Tooltip
                  label={
                    cancelReason
                      ? controlText[cancelReason]
                      : controlText.cancelHelp
                  }
                >
                  <span>
                    <Button
                      disabled={!control}
                      aria-disabled={!!cancelReason}
                      aria-describedby={control ? `${help}-cancel` : undefined}
                      onBlur={(event) => {
                        if (
                          event.relatedTarget instanceof HTMLElement &&
                          event.relatedTarget !== document.body
                        )
                          cancelledHere.current = false;
                      }}
                      onClick={() => {
                        if (control && cancelTarget && !cancelReason) {
                          cancelledHere.current = true;
                          void control.cancel(cancelTarget);
                        }
                      }}
                    >
                      {text.cancel}
                    </Button>
                  </span>
                </Tooltip>
              )}
              <Tooltip label={text.launchUnavailable}>
                <span>
                  <Button
                    variant="primary"
                    className="v-launcher-launch"
                    disabled={
                      !!control?.busy ||
                      !profile.launchable ||
                      view.protected ||
                      pending ||
                      accepted
                    }
                    busy={pending}
                    onClick={() => onLaunch(profile)}
                  >
                    <Icon name="play" />
                    {text.launch}
                    {profile.favorite && <kbd>{text.favoriteKey}</kbd>}
                  </Button>
                </span>
              </Tooltip>
              <Button
                data-launcher-edit
                disabled={
                  !onEdit ||
                  pending ||
                  view.running ||
                  view.protected ||
                  control?.busy
                }
                onClick={() => onEdit?.(profile.id)}
              >
                {text.edit}
              </Button>
              <Tooltip
                label={
                  rehearseReason
                    ? controlText[rehearseReason]
                    : controlText.rehearseHelp
                }
              >
                <span>
                  <Button
                    ref={rehearseButton}
                    disabled={!control}
                    aria-disabled={!!rehearseReason || pending}
                    aria-describedby={control ? `${help}-rehearse` : undefined}
                    onClick={() => {
                      if (
                        control &&
                        rehearseTarget &&
                        !rehearseReason &&
                        !pending
                      )
                        void control.rehearse(rehearseTarget);
                    }}
                  >
                    {text.rehearse}
                  </Button>
                </span>
              </Tooltip>
            </div>
            {control && (
              <div className="v-launcher-control-help">
                <p
                  id={`${help}-rehearse`}
                  className={rehearseReason ? undefined : "v-resident-live"}
                >
                  {rehearseReason
                    ? controlText[rehearseReason]
                    : controlText.rehearseHelp}
                </p>
                {showCancel && (
                  <p
                    id={`${help}-cancel`}
                    className={cancelReason ? undefined : "v-resident-live"}
                  >
                    {cancelReason
                      ? controlText[cancelReason]
                      : controlText.cancelHelp}
                  </p>
                )}
              </div>
            )}
            <ol className="v-launcher-chain">
              {apps(profile).map((app, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: Read-only sequence slots; repeated apps are valid.
                <li key={`${index}-${app.id}`}>
                  <AppMark app={app} />
                  <strong>{app.name}</strong>
                  <small>{text.noPriorState}</small>
                </li>
              ))}
            </ol>
          </section>
          <section
            className="v-launcher-profiles"
            aria-label={text.yourProfiles}
          >
            <h2>{text.yourProfiles}</h2>
            <div className="v-launcher-profile-grid">
              {view.profiles.map((item) => (
                <ProfileCardActions
                  key={item.id}
                  profile={item}
                  canDuplicate={
                    view.profiles.length < launcherLimits.profiles &&
                    new TextEncoder().encode(item.name + profileCopySuffix)
                      .length <= profileLimits.name
                  }
                  triggered={view.lmuTrigger === item.id}
                  disabled={pending || view.protected || view.running}
                  onAction={(action) => onAction(item, action)}
                >
                  <button
                    type="button"
                    className="v-launcher-profile"
                    aria-label={item.name}
                    aria-pressed={item.id === profile.id}
                    disabled={pending || view.running}
                    onClick={() => onSelect(item.id)}
                    onDoubleClick={() => {
                      if (!view.protected) onEdit?.(item.id);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && onEdit && !view.protected) {
                        event.preventDefault();
                        onEdit(item.id);
                      }
                    }}
                  >
                    <div
                      className={`v-launcher-cover${item.favorite ? " v-launcher-cover--favorite" : ""}`}
                    >
                      <Circuit />
                      {item.favorite && (
                        <span className="v-launcher-favorite">
                          {text.favorite}
                        </span>
                      )}
                      <div className="v-launcher-chips">
                        {apps(item).map((app, index) => (
                          // biome-ignore lint/suspicious/noArrayIndexKey: Stateless badge for each occurrence of an app.
                          <AppMark app={app} small key={`${index}-${app.id}`} />
                        ))}
                      </div>
                    </div>
                    <strong>{item.name}</strong>
                    <small>
                      {text.appCount(item.apps.length, item.favorite)}
                    </small>
                  </button>
                </ProfileCardActions>
              ))}
              <button
                type="button"
                className="v-launcher-profile v-launcher-profile--new"
                onClick={onNew}
                disabled={!onNew || pending || view.protected}
              >
                {text.newProfile}
              </button>
            </div>
          </section>
        </>
      ) : (
        view.exists && !view.protected && <Callout title={text.empty} />
      )}
    </div>
  );
}
