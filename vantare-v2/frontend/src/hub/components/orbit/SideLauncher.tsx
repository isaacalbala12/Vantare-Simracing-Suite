import { ListRow } from "../../../ui/orbit/ListRow";
import { formatMessage } from "../../orbit/format-message";
import { profileInitials } from "../../launcher-orbit/launcher-orbit-model";

export interface SideLauncherProfile {
  id: string;
  name: string;
  steps: number;
}

export interface SideLauncherProps {
  profiles: SideLauncherProfile[];
  onManage(): void;
  onRun(profileId: string): void;
  labels: { title: string; manage: string; steps: string; empty: string };
  className?: string;
}

/** Bloque persistente "Launcher": los 2 primeros perfiles con ▶. */
export function SideLauncher({ profiles, onManage, onRun, labels, className }: SideLauncherProps) {
  return (
    <section
      aria-label={labels.title}
      className={["orbit-block", className].filter(Boolean).join(" ")}
    >
      <div className="orbit-block__head">
        <span className="orbit-eyebrow">{labels.title}</span>
        <button className="orbit-link" onClick={onManage} type="button">
          {labels.manage}
        </button>
      </div>
      <div className="orbit-list" data-testid="orbit-side-launcher">
        {profiles.length === 0 ? (
          <p className="orbit-row__copy">{labels.empty}</p>
        ) : (
          profiles.slice(0, 2).map((profile) => (
            <ListRow
              key={profile.id}
              leading={
                <span aria-hidden="true" className="orbit-mono">
                  {profileInitials(profile.name)}
                </span>
              }
              onClick={() => onRun(profile.id)}
              subtitle={formatMessage(labels.steps, { n: profile.steps })}
              title={profile.name}
              trailing={
                <span aria-hidden="true" className="orbit-play">
                  ▶
                </span>
              }
            />
          ))
        )}
      </div>
    </section>
  );
}
