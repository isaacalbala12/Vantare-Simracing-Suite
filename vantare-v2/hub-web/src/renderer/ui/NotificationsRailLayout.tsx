import type { LauncherView } from "../../contract/generated/launcher";
import { notices as text } from "../i18n/notifications";
export function NotificationsRailLayout({
  tester,
  allowed,
  view,
  failed,
  retry,
}: {
  tester: boolean;
  allowed: boolean;
  view?: LauncherView;
  failed: boolean;
  retry: () => void;
}) {
  return (
    <div className="v-notifications-rail">
      <h2>{text.center}</h2>
      {tester && (
        <section>
          <h3>{text.races}</h3>
          <p>{text.noRaces}</p>
        </section>
      )}
      <section>
        <h3>{text.overlay}</h3>
        <p>{text.noOverlay}</p>
      </section>
      {allowed && (
        <section>
          <h3>{text.launcher.toUpperCase()}</h3>
          {failed || view?.protected ? (
            <p role="status">
              {text.profilesFailed}{" "}
              <button type="button" onClick={retry}>
                {text.retry}
              </button>
            </p>
          ) : view ? (
            view.profiles.length ? (
              view.profiles.map((profile) => (
                <div className="v-notifications-profile" key={profile.id}>
                  <span aria-hidden="true">
                    {profile.id === "creator"
                      ? text.creatorBadge
                      : text.profileBadge}
                  </span>
                  <div>
                    <strong>{profile.name}</strong>
                    <small>{text.steps(profile.apps.length)}</small>
                  </div>
                </div>
              ))
            ) : (
              <p>{text.noProfiles}</p>
            )
          ) : (
            <p role="status">{text.loadingProfiles}</p>
          )}
        </section>
      )}
    </div>
  );
}
