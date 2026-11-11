import { Icon } from "../../assets/icons/Icon";
import {
  onboardingChoicesText as c,
  onboardingText as t,
} from "../../i18n/onboarding";
import { Helmet } from "./Helmet";
export function WelcomeArt({ reducedMotion }: { reducedMotion: boolean }) {
  return (
    <div className="v-ob-welcome-art">
      <span className="v-ob-watermark" aria-hidden="true">
        {t.helmet.toUpperCase()}
      </span>
      <Helmet width={330} reducedMotion={reducedMotion} />
      <span className="v-ob-art-caption">{t.assistantCaption}</span>
    </div>
  );
}
// Same ten static quarter cones as radar_beam() in frozen GPUI art.rs.
function RadarBeam() {
  return (
    <svg className="v-ob-radar-beam" viewBox="0 0 520 520" aria-hidden="true">
      {Array.from({ length: 10 }, (_, index) => {
        const r = 260 - index * 23;
        const d = r * Math.SQRT1_2;
        return (
          <path
            key={r}
            d={`M260 260 L${260 + d} ${260 + d} C${260 + d * 0.44} ${260 + r * 1.12} ${260 - d * 0.44} ${260 + r * 1.12} ${260 - d} ${260 + d} Z`}
            fill="currentColor"
            opacity={0.017}
          />
        );
      })}
    </svg>
  );
}
export function SimulatorArt({
  selected,
  found,
}: {
  selected: readonly [boolean, boolean];
  found: readonly [boolean, boolean];
}) {
  return (
    <div className="v-ob-radar-art">
      <div className="v-ob-radar">
        <RadarBeam />
        <span className="v-ob-radar-ring v-ob-radar-ring--outer" />
        <span className="v-ob-radar-ring v-ob-radar-ring--middle" />
        <span className="v-ob-radar-ring v-ob-radar-ring--inner" />
        <div className="v-ob-radar-pc">
          <Icon name="monitor" />
          <strong>{c.computer}</strong>
        </div>
        {c.simulators.map(
          ({ id }) =>
            selected[id] && (
              <div
                key={id}
                className={`v-ob-radar-note v-ob-radar-note--${id}`}
              >
                <small>{found[id] ? c.found : c.added}</small>
                <strong>{id === 0 ? c.radarLmu : c.radarAcc}</strong>
                <span className="v-ob-radar-dot" aria-hidden="true" />
              </div>
            ),
        )}
      </div>
    </div>
  );
}
