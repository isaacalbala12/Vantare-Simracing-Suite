import { Icon, type IconName } from "../assets/icons/Icon";
import { upcoming as text } from "../i18n/upcoming";
import "./upcoming.css";

const icons: Record<"strategy" | "engineer", [IconName, IconName, IconName]> = {
  strategy: ["v-launch", "v-gauge", "v-sliders"],
  engineer: ["v-engineer", "v-side", "v-testing"],
};
export function UpcomingLayout({
  module,
  onRoadmap,
}: {
  module: "strategy" | "engineer";
  onRoadmap: () => void;
}) {
  const content = text[module];
  const icon = module === "strategy" ? "v-strategy" : "v-engineer";
  return (
    <div className="v-upcoming">
      <section className="v-upcoming-intro">
        <div>
          <Icon name={icon} />
          <h1>{content.title}</h1>
          <span className="v-upcoming-pill">{text.soon}</span>
        </div>
        <p>{content.description}</p>
      </section>
      <h2>{text.canDo}</h2>
      <div className="v-upcoming-features">
        {content.features.map((feature, index) => (
          <section key={feature.title}>
            <Icon name={icons[module][index]} />
            <h3>{feature.title}</h3>
            <p>{feature.description}</p>
          </section>
        ))}
      </div>
      <section className="v-upcoming-roadmap">
        <h2>
          <Icon name="v-roadmap" />
          {text.follow}
        </h2>
        <div className="v-upcoming-preview">
          <Icon name={icon} />
          <div>
            <h3>{content.title}</h3>
            <p>{text.phases}</p>
            <span className="v-upcoming-pill">{text.soon}</span>
          </div>
        </div>
        <p>{text.help}</p>
        <button type="button" onClick={onRoadmap}>
          {text.roadmap}
        </button>
      </section>
    </div>
  );
}
