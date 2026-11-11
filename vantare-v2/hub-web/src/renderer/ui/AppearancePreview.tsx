import { Icon } from "../assets/icons/Icon";
import { appearanceText as text } from "../i18n/appearance.es";
import "./appearance-controls.css";
export function AppearancePreview({
  palette,
  profile,
  applications,
  live,
}: {
  palette: string;
  profile?: string;
  applications?: number;
  live: boolean;
}) {
  return (
    <div className="v-appearance-preview">
      <div className="v-appearance-preview-palette">{palette}</div>
      <div className="v-appearance-preview-body">
        <div className="v-appearance-preview-nav">
          <span>{text.brand}</span>
          {(
            [
              [text.home, "v-home"],
              [text.launcher, "v-launch"],
              [text.studio, "v-studio"],
            ] as const
          ).map(([name, icon], index) => (
            <div key={name} data-active={index === 0 || undefined}>
              <Icon name={icon} />
              <span>{name}</span>
            </div>
          ))}
        </div>
        <div className="v-appearance-preview-main">
          <strong>{text.profile}</strong>
          <div className="v-appearance-preview-hero">
            <strong>{profile ?? text.noProfile}</strong>
            {applications !== undefined && (
              <small>{text.apps(applications)}</small>
            )}
          </div>
          <span
            className="v-appearance-preview-sim"
            data-live={live || undefined}
          >
            {live ? text.connected : text.waiting}
          </span>
        </div>
      </div>
    </div>
  );
}
