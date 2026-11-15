import { useId } from "react";
import type { OverlayInstance } from "../../../contract/generated/studio";
import { studioFrequencyOptions } from "../../../contract/generated/studio";
import { t } from "../../i18n/es";
import { studioFrequencyText as text } from "../../i18n/studio-frequency.es";
import type { useTrack } from "../../screens/studio/track";
import { Button } from "../Button";
import "./studio-frequency.css";

export function FrequencyControls({
  item,
  model,
}: {
  item: OverlayInstance;
  model: ReturnType<typeof useTrack>;
}) {
  const help = useId();
  const { overrideHz, appliedHz, level, source } = item.frequency;
  const preserved =
    overrideHz !== null &&
    !studioFrequencyOptions.choices.some((value) => value === overrideHz);
  return (
    <section
      className="v-studio-track-group v-studio-frequency"
      aria-label={text.title}
      data-active={model.saving === "frequency"}
    >
      <h3>{text.title}</h3>
      {source === "snapshot" ? (
        <p>{text.flags}</p>
      ) : (
        <>
          <div role="status" className="v-studio-track-group-summary">
            {text.applied(
              appliedHz === 0 ? text.snapshot : text.hz(appliedHz),
              t(`track.${level}`),
            )}
          </div>
          <fieldset
            aria-describedby={help}
            className="v-studio-frequency-choices"
          >
            <legend className="v-sr-only">{text.choices}</legend>
            {[null, ...studioFrequencyOptions.choices].map((value) => (
              <Button
                key={value ?? "level"}
                size="sm"
                variant="ghost"
                disabled={model.disabled}
                aria-disabled={model.pending || undefined}
                aria-pressed={value === overrideHz}
                onClick={() => {
                  if (!model.pending && value !== overrideHz)
                    void model.patch({ field: "frequency", value });
                }}
              >
                {value === null ? text.inherit : text.hz(value)}
              </Button>
            ))}
          </fieldset>
          <p id={help}>{preserved ? text.preserved : text.inheritHelp}</p>
        </>
      )}
    </section>
  );
}
