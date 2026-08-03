import type { EngineerPresentation } from "./engineer-presentation-store";
import { buildEngineerVisualViewModel } from "./engineer-visual-view-model";
import "./engineer-subtitles.css";

export function EngineerSubtitles(props: { presentation: EngineerPresentation }): React.ReactElement {
  const model = buildEngineerVisualViewModel(props.presentation);
  return (
    <section
      className={`engineer-subtitles engineer-subtitles--${model.severity}`}
      data-engineer-subtitles
      data-message-id={model.messageId}
      lang={model.locale}
      role={model.severity === "critical" ? "alert" : "status"}
      aria-live={model.severity === "critical" ? "assertive" : "polite"}
      aria-atomic="true"
    >
      <span className="engineer-subtitles__speaker">{model.speaker}</span>
      <span className="engineer-subtitles__text">{model.text}</span>
    </section>
  );
}
