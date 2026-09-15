import { useEffect, useRef, type ReactNode } from "react";
import "./strategy-recorded-frame.css";

export type RecordedFrameStep = {
  readonly id: string;
  readonly label: string;
  readonly available: boolean;
};

/** Productive presentation only. The caller owns the draft and navigation. */
export function StrategyRecordedFrame({ steps, currentStep, onStep, title, description, children, actions, preservationLabel, progressLabel }: {
  readonly steps: readonly RecordedFrameStep[];
  readonly currentStep: string;
  readonly onStep: (id: string) => void;
  readonly title: string;
  readonly description?: string;
  readonly children: ReactNode;
  readonly actions: ReactNode;
  readonly preservationLabel: string;
  readonly progressLabel: string;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const index = steps.findIndex(step => step.id === currentStep);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, [currentStep]);
  return <section className="strategy-recorded-frame" aria-labelledby="strategy-recorded-heading" data-step={currentStep} data-testid="orbit-strategy-wizard">
    <nav className="strategy-recorded-frame__progress" aria-label={title}>
      <span className="strategy-recorded-frame__progress-label">{progressLabel}</span>
      <ol>{steps.map((step, position) => <li key={step.id} data-state={position < index ? "done" : position === index ? "now" : "next"} data-testid={`orbit-strategy-wizard-step-${step.id}`}>
        <button type="button" disabled={!step.available} aria-current={step.id === currentStep ? "step" : undefined} onClick={() => onStep(step.id)}>
          <span aria-hidden="true">{position < index ? "✓" : position + 1}</span>
          <b>{step.label}</b>
        </button>
      </li>)}</ol>
    </nav>
    <div className="strategy-recorded-frame__stage">
      <header>
        <span className="strategy-recorded-frame__eyebrow">{steps[index]?.label}</span>
        <h2 id="strategy-recorded-heading" ref={heading} tabIndex={-1}>{title}</h2>
        {description ? <p>{description}</p> : null}
      </header>
      <div className="strategy-recorded-frame__form">{children}</div>
    </div>
    <footer className="strategy-recorded-frame__footer">
      <span><span aria-hidden="true">✓</span>{preservationLabel}</span>
      <div>{actions}</div>
    </footer>
  </section>;
}
