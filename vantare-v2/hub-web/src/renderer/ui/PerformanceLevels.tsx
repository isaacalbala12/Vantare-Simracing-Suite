import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";
import {
  type PerformanceLevel,
  performanceLevels,
  type TrackView,
  tableHz,
  widgetHz,
} from "../../contract/generated/contract";
import { Icon } from "../assets/icons/Icon";
import { t } from "../i18n/es";
import { performanceText as text } from "../i18n/performance.es";
import { TrackedCaps } from "./TrackedCaps";

import "./performance.css";

export function PerformanceLevels({
  value,
  disabled,
  pending,
  studioLock,
  onChange,
  onStudio,
}: {
  value: PerformanceLevel;
  disabled: boolean;
  pending: boolean;
  studioLock?: string;

  onChange: (value: PerformanceLevel) => void;
  onStudio: () => void;
}) {
  return (
    <RadioGroup
      className="v-performance-levels"
      aria-label={t("track.level")}
      value={value}
      disabled={disabled}
      aria-busy={pending || undefined}
      aria-disabled={disabled || pending || undefined}
      onValueChange={(next) => {
        const level = performanceLevels.find((level) => level === next);

        if (!pending && level) onChange(level);
      }}
    >
      <div className="v-performance-level v-performance-auto">
        <strong>{t("track.automatic")}</strong>
        <small>{text.automaticHelp}</small>
      </div>
      {performanceLevels.map((level, index) => {
        const cadence = `${widgetHz[index] === 0 ? text.everyPhoto : `${text.upTo} ${widgetHz[index]} Hz`} · ${text.tablesAt} ${tableHz[index]} Hz`;

        return (
          <Radio.Root
            className="v-performance-level"
            key={level}
            value={level}
            aria-label={t(`track.${level}`)}
            aria-description={cadence}
          >
            <span className="v-performance-level-title">
              <strong>{t(`track.${level}`)}</strong>
              <span>{index + 1}</span>
            </span>
            <small className="v-performance-cadence">{cadence}</small>
            <span className="v-performance-meter" aria-hidden="true">
              {performanceLevels.map((segment, position) => (
                <i
                  key={segment}
                  data-filled={
                    position < performanceLevels.length - index || undefined
                  }
                />
              ))}
            </span>
          </Radio.Root>
        );
      })}
      <button
        type="button"
        className="v-performance-level v-performance-custom"
        disabled={Boolean(studioLock)}
        aria-label={text.customAction}
        aria-description={studioLock}
        onClick={onStudio}
      >
        <strong>{t("track.custom")}</strong>
        <small>{text.customHelp}</small>
      </button>
    </RadioGroup>
  );
}

export function FrequencyTable({ value }: { value: PerformanceLevel }) {
  const rows = [
    {
      label: "",
      values: performanceLevels.map((level) => t(`track.${level}`)),
    },

    {
      label: t("track.widgets"),
      values: widgetHz.map((hz) => (hz === 0 ? t("track.photo") : `${hz} Hz`)),
    },

    { label: t("track.tables"), values: tableHz.map((hz) => `${hz} Hz`) },

    {
      label: t("track.flags"),
      values: performanceLevels.map(() => t("track.instant")),
    },
  ];

  return (
    <table className="v-frequency-table" aria-label={text.table}>
      <thead>
        <tr>
          <td />
          {performanceLevels.map((level) => (
            <th
              key={level}
              scope="col"
              data-current={level === value || undefined}
            >
              {t(`track.${level}`)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.slice(1).map((row) => (
          <tr key={row.label}>
            <th scope="row">{row.label}</th>
            {row.values.map((cell, index) => (
              <td
                key={performanceLevels[index]}
                data-current={performanceLevels[index] === value || undefined}
              >
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function PerformancePanel({
  track,
  ...props
}: Omit<Parameters<typeof PerformanceLevels>[0], "value"> & {
  track: TrackView;
}) {
  return (
    <div className="v-performance">
      <section className="v-performance-card" aria-label={t("track.level")}>
        <header className="v-performance-header">
          <h2>
            <Icon name="pulse" />
            <TrackedCaps>{t("track.level")}</TrackedCaps>
          </h2>
          <span>
            {text.applied} {t(`track.${track.level}`)}
          </span>
        </header>
        <PerformanceLevels {...props} value={track.level} />
      </section>
      <section
        className="v-performance-card v-performance-table-card"
        aria-label={text.table}
      >
        <header className="v-performance-header">
          <h2>
            <Icon name="v-sliders" />
            <TrackedCaps>{text.table}</TrackedCaps>
          </h2>
        </header>
        <FrequencyTable value={track.level} />
      </section>
      <p className="v-performance-note">{text.note}</p>
    </div>
  );
}

export function PerformanceStatus({ track }: { track: TrackView }) {
  return (
    <>
      <span className="v-performance-pill">{t(`track.${track.level}`)}</span>
      <p className="v-performance-count">
        {track.customWidgets}{" "}
        {track.customWidgets === 1
          ? text.ownFrequencySingular
          : text.ownFrequency}
      </p>
    </>
  );
}
