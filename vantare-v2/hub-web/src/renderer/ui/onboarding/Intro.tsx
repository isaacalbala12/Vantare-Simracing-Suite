import type { ReactNode } from "react";
import {
  onboardingKits,
  onboardingWidgetKinds,
  type WidgetKind,
} from "../../../contract/generated/onboarding";
import { onboardingText as t } from "../../i18n/onboarding";
import { SimulatorArt, WelcomeArt } from "./Art";
import { SimulatorChoices, StyleChoices } from "./Choices";
import { KitArt } from "./KitArt";
export type IntroStep = 0 | 1 | 2;
export type Simulators = [boolean, boolean];
export type Styles = [boolean, boolean, boolean, boolean];
export function kitForStyles(styles: readonly boolean[]): WidgetKind[] {
  const selected = new Set(
    onboardingKits.flatMap((kit, index) => (styles[index] ? [...kit] : [])),
  );
  return onboardingWidgetKinds.filter((kind) => selected.has(kind));
}
export function OnboardingViewport({ children }: { children: ReactNode }) {
  return <div className="v-ob-viewport">{children}</div>;
}
export function IntroBody({
  step,
  simulators,
  styles,
  found,
  toggleSimulator,
  toggleStyle,
}: {
  step: IntroStep;
  simulators: Simulators;
  styles: Styles;
  found: readonly [boolean, boolean];
  toggleSimulator: (id: 0 | 1) => void;
  toggleStyle: (id: 0 | 1 | 2 | 3) => void;
}) {
  if (step === 0) return <p className="v-ob-change-later">{t.changeLater}</p>;
  return step === 1 ? (
    <SimulatorChoices
      selected={simulators}
      found={found}
      toggle={toggleSimulator}
    />
  ) : (
    <StyleChoices selected={styles} toggle={toggleStyle} />
  );
}
export function IntroArt({
  step,
  simulators,
  styles,
  found,
  reducedMotion,
}: {
  step: IntroStep;
  simulators: Simulators;
  styles: Styles;
  found: readonly [boolean, boolean];
  reducedMotion: boolean;
}) {
  if (step === 0) return <WelcomeArt reducedMotion={reducedMotion} />;
  return step === 1 ? (
    <SimulatorArt selected={simulators} found={found} />
  ) : (
    <KitArt kit={kitForStyles(styles)} />
  );
}
