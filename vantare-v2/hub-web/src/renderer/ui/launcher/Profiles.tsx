import type {
  LauncherApp,
  LauncherProfile,
  LauncherView,
} from "../../../contract/generated/contract";
import { Icon, type IconName } from "../../assets/icons/Icon";
import { launcherText as text } from "../../i18n/launcher";
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
}: {
  view: LauncherView;
  selected?: string;
  pending: boolean;
  error?: string;
  accepted: boolean;
  onEdit?: (id: string) => void;
  onNew?: () => void;
  onApplications?: () => void;
  onAction: (profile: LauncherProfile, action: ProfileCardAction) => void;
  onSelect: (id: string) => void;
  onLaunch: (profile: LauncherProfile) => void;
  onReload: () => void;
}) {
  const profile =
    view.profiles.find((item) => item.id === selected) ??
    view.profiles.find((item) => item.favorite) ??
    view.profiles[0];
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
        <Button disabled={!onNew || pending} onClick={onNew}>
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
              {view.running && (
                <Tooltip label={text.cancelUnavailable}>
                  <span>
                    <Button disabled>{text.cancel}</Button>
                  </span>
                </Tooltip>
              )}
              <Tooltip label={text.launchUnavailable}>
                <span>
                  <Button
                    variant="primary"
                    className="v-launcher-launch"
                    disabled={
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
                disabled={!onEdit || pending || view.running}
                onClick={() => onEdit?.(profile.id)}
              >
                {text.edit}
              </Button>
              <Tooltip label={text.rehearseUnavailable}>
                <span>
                  <Button disabled>{text.rehearse}</Button>
                </span>
              </Tooltip>
            </div>
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
                    onDoubleClick={() => onEdit?.(item.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && onEdit) {
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
                disabled={!onNew || pending}
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
