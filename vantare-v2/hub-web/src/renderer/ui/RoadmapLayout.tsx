import { useQuery } from "@tanstack/react-query";
import type {
  RoadmapItem,
  RoadmapPublication,
} from "../../contract/generated/contract";
import { Icon } from "../assets/icons/Icon";
import { roadmap as text } from "../i18n/roadmap";
import "./roadmap.css";

const lanes = ["next", "now", "done"] as const;
function items(p: RoadmapPublication | null, lane: string) {
  return (
    p?.items.filter(
      (item) =>
        item.section === lane || (lane === "next" && item.section === "later"),
    ) ?? []
  );
}
function Item({ item }: { item: RoadmapItem }) {
  return (
    <article className="v-roadmap-item">
      <strong>{item.title}</strong>
      <p>{item.body}</p>
      <p>
        {item.version ?? text.noVersion}
        {" · "}
        {item.dueDate ?? text.noDate}
      </p>
    </article>
  );
}
function Heading({
  children,
  icon = "v-roadmap",
}: {
  children: string;
  icon?: "v-roadmap" | "v-calendar" | "layers" | "check";
}) {
  return (
    <h2 className="v-roadmap-heading">
      <Icon name={icon} />
      {children}
    </h2>
  );
}
export function RoadmapLayout({
  publication: p,
  status,
  view,
}: {
  publication: RoadmapPublication | null;
  status: string;
  view: string;
}) {
  const hero = (
    <section className="v-roadmap-hero">
      <strong>{text.current}</strong>
      {items(p, "now")[0] ? (
        <h2>{items(p, "now")[0].title}</h2>
      ) : (
        <p>{text.noCurrent}</p>
      )}
      <div className="v-roadmap-counts">
        {lanes.map((lane) => (
          <div key={lane}>
            <span>{text[lane]}</span>
            <p>{p ? `${items(p, lane).length} ${text.tasks}` : text.dash}</p>
          </div>
        ))}
      </div>
    </section>
  );
  const board = (
    <section className="v-roadmap-board">
      <Heading>{text.coming}</Heading>
      <div className="v-roadmap-lanes">
        {lanes.map((lane) => (
          <section key={lane} className="v-roadmap-lane">
            <Heading>{text[lane]}</Heading>
            <div className="v-roadmap-list">
              {items(p, lane).length ? (
                items(p, lane).map((item) => <Item key={item.id} item={item} />)
              ) : (
                <p>{text.empty}</p>
              )}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
  const scheduled = (p?.items ?? [])
    .filter((item) => item.version || item.dueDate)
    .sort(
      (a, b) =>
        (a.dueDate ?? "~").localeCompare(b.dueDate ?? "~") ||
        (a.version ?? "").localeCompare(b.version ?? ""),
    );
  const season = (
    <section className="v-roadmap-lane v-roadmap-season">
      <Heading icon="v-calendar">{text.season}</Heading>
      <p>{text.schedule}</p>
      {p && (
        <p>
          {text.published} {p.publishedAt}
        </p>
      )}
      {scheduled.length ? (
        scheduled.map((item) => <Item key={item.id} item={item} />)
      ) : (
        <p>{text.noSchedule}</p>
      )}
    </section>
  );
  return (
    <div className="v-roadmap">
      <header className="v-roadmap-header">
        <h1>{text.title}</h1>
        <p>{text.subtitle}</p>
      </header>
      <p role="status">{status}</p>
      {view !== "board" && hero}
      {view === "season" ? season : board}
    </div>
  );
}

export function RoadmapRail() {
  const { data: p = null } = useQuery<RoadmapPublication | null>({
    queryKey: ["roadmap"],
    queryFn: async () => null,
    enabled: false,
  });
  const groups = new Map<string, { done: number; total: number }>();
  for (const item of p?.items ?? []) {
    const area = item.area ?? text.noAreas;
    const g = groups.get(area) ?? { done: 0, total: 0 };
    g.total++;
    if (item.section === "done") g.done++;
    groups.set(area, g);
  }
  return (
    <div className="v-roadmap-rail">
      <section>
        <Heading icon="layers">{text.areas}</Heading>
        {groups.size ? (
          [...groups]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([area, g]) => (
              <p
                key={area}
              >{`${area} · ${g.done}/${g.total} ${text.completed} · ${Math.floor((g.done * 100) / g.total)}%`}</p>
            ))
        ) : (
          <p>{text.noAreas}</p>
        )}
      </section>
      <section>
        <Heading icon="check">{text.delivered}</Heading>
        {items(p, "done").length ? (
          items(p, "done").map((item) => <Item key={item.id} item={item} />)
        ) : (
          <p>{text.noDelivered}</p>
        )}
      </section>
    </div>
  );
}
