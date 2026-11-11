import type { ReactNode } from "react";
import {
  releaseChannels,
  type UpdatesView,
} from "../../contract/generated/contract";
import { Icon } from "../assets/icons/Icon";
import { t } from "../i18n/es";
import { updatesText as text } from "../i18n/updates.es";
import { TrackedCaps } from "./TrackedCaps";
import "./updates.css";
export function UpdatesLayout({ children }: { children: ReactNode }) {
  return <div className="v-updates">{children}</div>;
}
export function UpdateHero({ view }: { view: UpdatesView }) {
  const current =
    view.beta?.state === "current" && view.beta.version === view.version;
  return (
    <section className="v-update-hero" aria-label={t("updates.installed")}>
      <span className="v-update-hero-icon">
        <Icon name="v-download" />
      </span>
      <div>
        <p>{t("updates.installed")}</p>
        <strong>{view.version}</strong>
        <small>
          {view.installation === "invalid"
            ? text.invalid
            : view.previous
              ? text.previous
              : text.state}
        </small>
      </div>
      {current && (
        <span className="v-update-pill v-update-pill--success">
          {text.current}
        </span>
      )}
    </section>
  );
}
export function UpdateChannels({
  view,
  demo = false,
}: {
  view: UpdatesView;
  demo?: boolean;
}) {
  if (view.channel === "beta")
    return (
      <section className="v-update-beta" aria-label={t("updates.beta")}>
        <strong>{t("updates.beta")}</strong>
        <p>{text.betaHelp}</p>
      </section>
    );
  return (
    <section className="v-update-channels" aria-label={t("updates.channels")}>
      {releaseChannels.map((channel) => {
        const active =
          view.channel === channel ||
          (channel === "master" && view.channel === "stable");
        return (
          <div
            className="v-update-channel"
            key={channel}
            data-active={active || undefined}
          >
            <div>
              <strong>{t(`updates.channel.${channel}`)}</strong>
              <span
                className={`v-update-pill${active ? " v-update-pill--success" : ""}`}
              >
                {t(active ? "updates.selected" : "updates.notSelected")}
              </span>
            </div>
            <p>
              {text.channelHelp[channel]}
              {demo && channel !== "master" ? text.invitation : ""}
            </p>
          </div>
        );
      })}
    </section>
  );
}
export function ReleaseNews({ view }: { view: UpdatesView }) {
  const notes = [
    ...new Map(view.news.map((note) => [JSON.stringify(note), note] as const)),
  ];
  return (
    <section className="v-release-news" aria-label={t("updates.notes")}>
      <h2>
        <Icon name="v-download" />
        <TrackedCaps>{t("updates.notes")}</TrackedCaps>
      </h2>
      <div className="v-release-news-body">
        <div className="v-release-installed">
          <strong>{view.version}</strong>
          <span className="v-update-pill v-update-pill--success">
            {text.installed}
          </span>
        </div>
        {notes.map(([key, note]) => (
          <div className="v-release-note" key={key}>
            <p>
              <strong>{note.title}</strong>
              {text.noteSeparator}
              {note.summary}
            </p>
            <span
              className={`v-update-pill${note.kind === "Arreglo" ? " v-update-pill--success" : note.kind === "Nuevo" ? " v-update-pill--accent" : ""}`}
            >
              {note.kind}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
