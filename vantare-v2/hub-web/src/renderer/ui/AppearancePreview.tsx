import type { ComponentProps, ReactNode } from "react";
import { Icon } from "../assets/icons/Icon";
import { appearanceText as text } from "../i18n/appearance.es";
import "./appearance-controls.css";
export function AppearancePreview({
  palette,
  profile,
  applications,
  live,
  navigation,
  brand,
  children,
}: {
  palette: string;
  navigation?: readonly {
    label: string;
    icon?: ComponentProps<typeof Icon>["name"];
  }[];
  brand?: ReactNode;
  children?: ReactNode;
  profile?: string;
  applications?: number;
  live: boolean;
}) {
  return (
    <div className="v-appearance-preview">
      <div className="v-appearance-preview-palette">{palette}</div>
      <div className="v-appearance-preview-body">
        <div className="v-appearance-preview-nav">
          <span>{brand ?? text.brand}</span>
          {(
            navigation ?? [
              { label: text.home, icon: "v-home" },
              { label: text.launcher, icon: "v-launch" },
              { label: text.studio, icon: "v-studio" },
            ]
          ).map(({ label, icon }, index) => (
            <div key={label} data-active={index === 0 || undefined}>
              {icon && <Icon name={icon} />}
              <span>{label}</span>
            </div>
          ))}
        </div>
        <div className="v-appearance-preview-main">
          {children ?? (
            <>
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}
