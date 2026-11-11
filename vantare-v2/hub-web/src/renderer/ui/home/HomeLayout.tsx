import type {
  CoreStatus,
  HomeView,
} from "../../../contract/generated/contract";
import type { Section } from "../../app/sections";
import { Icon, type IconName } from "../../assets/icons/Icon";
import { homeText as t } from "../../i18n/home";
import type { Notice } from "../../screens/notifications/center";
import { Button } from "../Button";
import { Skeleton } from "../Data";
import { Select } from "../Forms";
import { TrackedCaps } from "../TrackedCaps";
import { Circuit } from "./Circuit";
import { LayoutPreview, widgetAsset } from "./LayoutPreview";
import { activityDate, greeting } from "./model";
import "./home.css";
export interface HomeProps {
  view?: HomeView;
  core: CoreStatus;
  name: string;
  now: Date;
  selected: string;
  pending: boolean;
  error?: string;
  records: Notice[];
  select: (id: string) => void;
  launch: (favorite: boolean) => void;
  navigate: (section: Section) => void;
  commands: () => void;
  retry: () => void;
}
function Heading({
  icon,
  title,
  action,
}: {
  icon: IconName;
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="v-home-heading">
      <Icon name={icon} />
      <TrackedCaps>{title}</TrackedCaps>
      {action}
    </header>
  );
}
export function HomeLayout(p: HomeProps) {
  const { view: v, core, now, navigate } = p;
  const favorite = v?.profiles.find((item) => item.id === v.favorite);
  const empty = !!v && !v.profiles.length;
  const running = p.pending || v?.launch.kind === "running";
  const allowed = core.access.verified && !core.access.blocked && !core.live;
  const connected = v?.sim.connected;
  const sim = connected ? t.connected : t.waiting;
  const date = `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}`;
  const activity = [
    ...(v?.profiles.flatMap((profile) =>
      profile.lastLaunchedAt
        ? [
            {
              id: `profile:${profile.id}`,
              text: t.lastLaunch(profile.name),
              date: Date.parse(profile.lastLaunchedAt),
              source: t.sources.launcher,
            },
          ]
        : [],
    ) ?? []),
    ...p.records.map((n) => ({
      id: `notice:${n.id}`,
      text: n.title,
      date: n.occurredAt,
      source:
        n.severity === "error"
          ? t.errorTag
          : n.severity === "warning"
            ? t.warningTag
            : t.sources[n.source],
    })),
  ]
    .sort(
      (a, b) =>
        (Number.isFinite(b.date) ? b.date : 0) -
        (Number.isFinite(a.date) ? a.date : 0),
    )
    .slice(0, 8);
  return (
    <div className={`v-home ${!v ? "v-home--loading" : ""}`}>
      <div className="v-home-composer">
        <button type="button" className="v-home-search" onClick={p.commands}>
          <Icon name="search" />
          <span>{t.search}</span>
          <small>{t.hints}</small>
        </button>
        <Select
          label={t.profile}
          hideLabel
          value={p.selected}
          onChange={p.select}
          disabled={!v?.profiles.length}
          options={
            v?.profiles.length
              ? v.profiles.map((profile) => ({
                  value: profile.id,
                  label: profile.name,
                }))
              : [{ value: "", label: t.selectProfile }]
          }
        />

        <kbd>{t.ctrlK}</kbd>
        <Button
          variant="primary"
          className="v-home-play"
          aria-label={t.selectedLaunch}
          disabled={!allowed || !p.selected || running || v?.protected}
          title={
            !p.selected
              ? t.selectAvailable
              : !allowed || running || v?.protected
                ? t.unavailable
                : undefined
          }
          onClick={() => p.launch(false)}
        >
          <Icon name="play" />
        </Button>
      </div>
      <section className="v-home-hero">
        <Circuit track={v?.sim.track} />
        <div className="v-home-hero-content">
          <div className="v-home-session">
            <i />
            {date}
            {" · "}
            {sim}
            {v?.sim.track ? ` · ${v.sim.track}` : ""}
          </div>
          <h1
            title={greeting(empty ? "" : (p.name.split(/\s+/)[0] ?? ""), now)}
          >
            {greeting(empty ? "" : (p.name.split(/\s+/)[0] ?? ""), now)}
          </h1>
          <p>
            {empty
              ? t.emptySubtitle
              : connected
                ? t.connectedSubtitle
                : t.subtitle}
          </p>
          <div className="v-home-hero-actions">
            <Button
              variant="primary"
              disabled={
                running || v?.protected || (!empty && (!favorite || !allowed))
              }
              onClick={() => (empty ? navigate("launcher") : p.launch(true))}
              title={
                running || v?.protected || (!empty && (!favorite || !allowed))
                  ? t.unavailable
                  : undefined
              }
            >
              <Icon name="play" />
              <span className="v-home-launch-label">
                {empty
                  ? t.create
                  : running
                    ? `${t.launching}${v?.launch.kind === "running" && v.launch.text ? ` ${v.launch.text}` : ""}`
                    : t.launch(favorite?.name ?? t.noFavorite)}
              </span>
              {!empty && <kbd>{t.ctrlL}</kbd>}
            </Button>
            <Button onClick={() => navigate("studio")}>{t.studio}</Button>
          </div>
        </div>
        <aside className="v-home-favorite">
          {!v ? (
            ["a", "b", "c", "d"].map((id) => (
              <Skeleton key={id} label={t.loading} />
            ))
          ) : empty ? (
            <>
              <span>{t.how}</span>
              {t.howSteps.map((step) => (
                <div className="v-home-how-step" key={step.title}>
                  <Icon name={step.icon} />
                  <div>
                    <strong>{step.title}</strong>
                    <p>{step.description}</p>
                  </div>
                </div>
              ))}
            </>
          ) : (
            <>
              <span>{t.favorite}</span>
              <strong>{favorite?.name ?? t.noFavorite}</strong>
              <p>{favorite ? t.steps(favorite.steps) : t.createProfileHint}</p>
              <small>
                {running
                  ? v.launch.kind === "running" && v.launch.text
                    ? v.launch.text
                    : t.launching
                  : favorite?.lastLaunchedAt
                    ? t.last(
                        activityDate(
                          Date.parse(favorite.lastLaunchedAt),
                        ).replace(" · ", " "),
                      )
                    : t.noLaunches}
              </small>
            </>
          )}
        </aside>
      </section>
      {(core.access.blocked || p.error || v?.protected) && (
        <div className="v-home-error" role="status">
          <span>{p.error ?? (v?.protected ? t.protected : t.accessError)}</span>
          <Button size="sm" onClick={p.retry}>
            {t.retry}
          </Button>
        </div>
      )}
      <div className="v-home-lower">
        <section className="v-home-card">
          {!empty && v && <Heading icon="v-studio" title={t.overlay} />}
          {!v ? (
            <div className="v-home-loading-overlay">
              <Skeleton label={t.loading} />
              <Skeleton label={t.loading} />
            </div>
          ) : empty && !connected ? (
            <div className="v-home-empty">
              <Icon name="v-studio" />
              <h2>{t.prepare}</h2>
              <p>{t.prepareDescription}</p>
              <Button onClick={() => navigate("studio")}>
                {t.templatesAction}
              </Button>
            </div>
          ) : (
            <>
              <LayoutPreview layout={v.layout} />
              <div className="v-home-layout-title">
                <h2>{t.layout}</h2>
                <span className="v-home-badge">{t.preview}</span>
              </div>
              <p className="v-home-muted">
                {connected ? t.telemetry : t.waiting}
              </p>
              <div className="v-home-chips">
                {v.layout.widgets.slice(0, 3).map((w, index) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: Stateless snapshot slots may contain identical widgets at identical coordinates.
                  <span className="v-home-badge" key={index}>
                    {t.widgets[w.kind] ?? w.kind}
                  </span>
                ))}
                {v.layout.widgets.length > 3 && (
                  <span className="v-home-badge">
                    {t.plus(v.layout.widgets.length - 3)}
                  </span>
                )}
              </div>
              <div className="v-home-metrics">
                {[
                  [t.dash, t.hz],
                  [String(v.layout.widgets.length), t.visible],
                  [t.dash, t.cpu],
                ].map(([value, label]) => (
                  <div key={label}>
                    <strong>{value}</strong>
                    <span>{label}</span>
                  </div>
                ))}
              </div>
              <div className="v-home-actions">
                <Button variant="primary" onClick={() => navigate("studio")}>
                  {t.edit}
                </Button>
                <span title={t.stopReason}>
                  <Button disabled>{t.stop}</Button>
                </span>
              </div>
            </>
          )}
        </section>
        <section className="v-home-card">
          <Heading
            icon="clock"
            title={t.activity}
            action={
              <button
                type="button"
                className="v-home-all"
                onClick={() => navigate("notifications")}
              >
                {t.all}
              </button>
            }
          />
          {!v ? (
            <div className="v-home-loading-activity">
              {["a", "b", "c", "d", "e"].map((id) => (
                <Skeleton key={id} label={t.loading} />
              ))}
            </div>
          ) : activity.length ? (
            <div className="v-home-activity-list">
              {activity.map((item) => (
                <div key={item.id}>
                  <Icon name="clock" />
                  <span>
                    <strong>{item.text}</strong>
                    <small>{activityDate(item.date)}</small>
                  </span>
                  <span className="v-home-badge">{item.source}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="v-home-empty">
              <Icon name="clock" />
              <h2>{t.noActivity}</h2>
              <p>{t.activityDescription}</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
function StatusRow({
  icon,
  title,
  subtitle,
  badge,
  tone,
}: {
  icon: IconName;
  title: string;
  subtitle: string;
  badge: string;
  tone?: "accent" | "success";
}) {
  return (
    <div className="v-home-status-row">
      <span className="v-home-status-icon">
        <Icon name={icon} />
      </span>
      <div>
        <strong>{title}</strong>
        <p>{subtitle}</p>
      </div>
      <span className={`v-home-badge ${tone ? `v-home-badge--${tone}` : ""}`}>
        {badge}
      </span>
    </div>
  );
}
export function HomeRail({
  view: v,
  core,
  navigate,
  error,
}: Pick<HomeProps, "view" | "core" | "navigate" | "error">) {
  const favorite = v?.profiles.find((p) => p.id === v.favorite);
  const empty = !!v && !v.profiles.length && !v.sim.connected;
  return (
    <div
      className={`v-home-rail ${core.access.blocked || error || v?.protected ? "v-home-rail--error" : ""}`}
    >
      <div className="v-home-rail-status">
        {!empty && <Heading icon="pulse" title={t.status} />}
        {!v ? (
          <div className="v-home-loading-status">
            {["a", "b", "c", "d"].map((id) => (
              <Skeleton key={id} label={t.loading} />
            ))}
          </div>
        ) : empty ? (
          <div className="v-home-empty v-home-rail-empty">
            <Icon name="v-helmet" />
            <h2>{t.waitingLmu}</h2>
            <p>{t.waitingDescription}</p>
          </div>
        ) : (
          <>
            <StatusRow
              icon="v-helmet"
              title={t.lmu}
              subtitle={v.sim.connected ? t.connected : t.waiting}
              badge={v.sim.connected ? t.connectedBadge : t.waitingBadge}
              tone={v.sim.connected ? "success" : undefined}
            />
            <StatusRow
              icon="v-launch"
              title={favorite?.name ?? t.noProfile}
              subtitle={t.favorite}
              badge={favorite ? t.saved : t.noProfile}
            />
            {core.access.verified &&
              !core.access.blocked &&
              core.access.tester && (
                <StatusRow
                  icon="v-testing"
                  title={t.testing}
                  subtitle={t.testerAccess}
                  badge={t.tester}
                  tone="accent"
                />
              )}
            <StatusRow
              icon="key"
              title={t.betaTitle}
              subtitle={v.version}
              badge={t.beta}
            />
          </>
        )}
      </div>
      <div className="v-home-template-section">
        <Heading icon="v-studio" title={t.templates} />
        <div className="v-home-templates">
          {["standings", "relative", "fuel-strategy", "delta"].map(
            (kind, i) => (
              <button
                type="button"
                key={kind}
                onClick={() => navigate("studio")}
              >
                <div>
                  {v ? (
                    <img src={widgetAsset(kind)} alt={t.decorative} />
                  ) : (
                    <Skeleton label={t.loading} />
                  )}
                </div>
                {v && (
                  <>
                    <strong>{t.templateNames[i]}</strong>
                    <small>{t.localTemplate}</small>
                  </>
                )}
              </button>
            ),
          )}
        </div>
      </div>
    </div>
  );
}
