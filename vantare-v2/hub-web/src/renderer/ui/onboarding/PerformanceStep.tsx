import type {
  Equipment,
  PerformanceLevel,
} from "../../../contract/generated/contract";
import { performanceLevels } from "../../../contract/generated/settings";
import { Icon } from "../../assets/icons/Icon";
import { t } from "../../i18n/es";
import { onboardingChoicesText } from "../../i18n/onboarding";
import { onboardingStepsText as text } from "../../i18n/onboarding-pasos";
import { Button } from "../Button";
import { PerformanceLevels } from "../PerformanceLevels";
import "./performance-step.css";

export function PerformanceStep({
  equipment,
  automatic,
  level,
  onAutomatic,
  onLevel,
  disabled = false,
}: {
  equipment: Equipment;
  automatic: boolean;
  level: PerformanceLevel;
  onAutomatic: () => void;
  onLevel: (level: PerformanceLevel) => void;
  disabled?: boolean;
}) {
  return (
    <>
      <div className="v-ob-equipment">
        <span>
          <Icon name="v-gauge" />
          {equipment.cpu ?? text.cpuMissing}
          {equipment.cores ? text.cores(equipment.cores) : ""}
        </span>
        <span>
          <Icon name="monitor" />
          {equipment.ramGb ? text.ram(equipment.ramGb) : text.ramMissing}
        </span>
      </div>
      <Button
        className="v-ob-auto-card"
        disabled={disabled}
        aria-pressed={automatic}
        onClick={onAutomatic}
      >
        <span className="v-ob-auto-icon">
          <Icon name="v-gauge" />
        </span>
        <span className="v-ob-auto-copy">
          <strong>
            {text.automatic}
            <small>{text.recommended}</small>
          </strong>
          <span>{text.automaticHelp}</span>
        </span>
        <span
          className="v-ob-check"
          data-selected={automatic}
          aria-hidden="true"
        >
          {automatic ? onboardingChoicesText.check : null}
        </span>
      </Button>
      <PerformanceLevels
        variant="onboarding"
        automatic={automatic}
        value={level}
        disabled={disabled}
        pending={false}
        onChange={onLevel}
        onStudio={() => {}}
      />
      <p className="v-ob-manual-help">{text.manualHelp}</p>
    </>
  );
}
export function PerformanceArt({
  automatic,
  level,
}: {
  automatic: boolean;
  level: PerformanceLevel;
}) {
  const selected = performanceLevels.indexOf(level);
  const segmentAngle = 180 / performanceLevels.length;
  const angle =
    ((-180 + segmentAngle / 2 + selected * segmentAngle) * Math.PI) / 180;
  return (
    <div className="v-ob-performance-art">
      <svg viewBox="0 0 560 330" className="v-ob-gauge" aria-hidden="true">
        {performanceLevels.map((kind, index) => {
          const points = Array.from({ length: 25 }, (_, p) => {
            const angle =
              Math.PI +
              ((index + (p / 24) * 0.9 + 0.05) * Math.PI) /
                performanceLevels.length;
            return `${280 + 230 * Math.cos(angle)},${290 + 230 * Math.sin(angle)}`;
          }).join(" ");
          return (
            <polyline
              key={kind}
              points={points}
              fill="none"
              stroke="currentColor"
              strokeWidth={34}
              opacity={index === selected ? 1 : 0.35}
            />
          );
        })}
        <path
          d={`M271 290 L${280 + 180 * Math.cos(angle)} ${290 + 180 * Math.sin(angle)} L289 290 Z`}
          fill="currentColor"
        />
        <circle cx={280} cy={290} r={18} fill="currentColor" />
        <circle cx={280} cy={290} r={7} className="v-ob-gauge-center" />
      </svg>
      <h2>{automatic ? text.automaticTitle : t(`track.${level}`)}</h2>
      <p>
        {automatic
          ? text.recommendedLevel(t(`track.${level}`))
          : text.levelCaption}
      </p>
    </div>
  );
}
