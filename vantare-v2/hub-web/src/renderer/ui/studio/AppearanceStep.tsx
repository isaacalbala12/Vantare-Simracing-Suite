import { type ReactNode, useId } from "react";
import type {
  DeltaSize,
  DeltaTemplate,
  OverlayInstance,
  StandingsTemplate,
  TableSize,
} from "../../../contract/generated/studio";
import { studioWidgetOptions } from "../../../contract/generated/studio";
import { studioText as t } from "../../i18n/studio";
import { useAppearance } from "../../screens/studio/appearance";
import { Segmented, Switch } from "../Forms";
import { AccentSwatches } from "./AccentSwatches";
import { ChoiceCards } from "./ChoiceCards";

const formats: Record<TableSize, string> = {
  compact: t.formatCompact,
  standard: t.formatStandard,
  expanded: t.formatExpanded,
};
export function AppearanceStep({ item }: { item: OverlayInstance }) {
  const model = useAppearance(item);
  const transparentHelp = useId();
  const s = item.settings;
  if (!s || !model.readable) return <p>{t.appearanceUnavailable}</p>;
  const { disabled, pending, saving, patch } = model;
  const brand =
    s.kind === "standings" ? (
      <dl className="v-studio-appearance-brand">
        <dt>{t.widgetBrand}</dt>
        <dd>
          {s.brandVisible === undefined
            ? t.brandAuto
            : s.brandVisible
              ? t.brandShown
              : t.brandHidden}
        </dd>
        <dd>{t.brandReadOnly}</dd>
      </dl>
    ) : null;
  const color =
    s.designSystem === "vantare" ? (
      <Group
        title={t.colorGroup}
        active={["style", "accent", "transparent"].includes(saving ?? "")}
      >
        <div className="v-studio-appearance-row">
          <span>{t.styleLabel}</span>
          <Segmented
            label={t.widgetStyle}
            value={s.style}
            disabled={disabled}
            pending={pending}
            options={[
              { value: "neo", label: t.styleNeo },
              { value: "neutro", label: t.styleNeutral },
            ]}
            onChange={(style) => {
              if (style === "neo" || style === "neutro")
                void patch({ kind: s.kind, style }, "style");
            }}
          />
        </div>
        <div className="v-studio-appearance-row">
          <span>{t.accentLabel}</span>
          <AccentSwatches
            value={s.accent}
            disabled={disabled}
            pending={pending}
            onChange={(accent) =>
              void patch({ kind: s.kind, accent }, "accent")
            }
          />
        </div>
        {s.kind === "delta" && (
          <div className="v-studio-transparent-help">
            <Switch
              aria-describedby={transparentHelp}
              label={t.transparentBackground}
              checked={s.transparentBackground ?? false}
              disabled={disabled}
              pending={pending}
              onCheckedChange={(transparentBackground) =>
                void patch(
                  { kind: "delta", transparentBackground },
                  "transparent",
                )
              }
            />
            <small id={transparentHelp}>{t.transparentHelp}</small>
          </div>
        )}
        {s.kind === "standings" && brand}
      </Group>
    ) : null;
  let middle: ReactNode;
  if (
    s.designSystem === "eficiencia" &&
    (s.kind === "standings" || s.kind === "delta")
  ) {
    middle = (
      <Group
        title={t.widgetDesign}
        help={t.designHelp}
        active={saving === "design"}
      >
        {s.kind === "standings" ? (
          <ChoiceCards<StandingsTemplate>
            label={t.widgetDesign}
            value={studioWidgetOptions.standings.templates.find(
              (v) => v === s.templateId,
            )}
            options={studioWidgetOptions.standings.templates.map((value) => ({
              value,
              label:
                value === "signature" ? t.designSignature : t.designBroadcast,
              art: `design-${value}`,
            }))}
            disabled={disabled}
            pending={pending}
            onChange={(templateId) =>
              void patch({ kind: "standings", templateId }, "design")
            }
          />
        ) : (
          <ChoiceCards<DeltaTemplate>
            label={t.widgetDesign}
            value={studioWidgetOptions.delta.templates.find(
              (v) => v === s.templateId,
            )}
            options={studioWidgetOptions.delta.templates.map((value) => ({
              value,
              label:
                value === "instrument" ? t.designInstrument : t.designCapsule,
              art: `design-${value}`,
            }))}
            disabled={disabled}
            pending={pending}
            onChange={(templateId) =>
              void patch({ kind: "delta", templateId }, "design")
            }
          />
        )}
        {brand}
      </Group>
    );
  } else if (
    s.designSystem === "vantare" &&
    (s.kind === "standings" || s.kind === "relative")
  ) {
    const kind = s.kind;
    middle = (
      <Group
        title={t.tablePreset}
        help={t.tablePresetHint}
        active={saving === "preset"}
      >
        <ChoiceCards
          action
          label={t.tablePreset}
          options={studioWidgetOptions.tableSizes.map((value) => ({
            value,
            label: formats[value],
            art: `table-${value}`,
          }))}
          disabled={disabled}
          pending={pending}
          onChange={(tablePreset) =>
            void patch({ kind, tablePreset }, "preset")
          }
        />
        <p>{t.tablePresetHelp}</p>
      </Group>
    );
  } else if (s.kind === "delta" && s.designSystem === "vantare") {
    const labels = {
      pill: t.deltaPill,
      bar: t.deltaBarFormat,
      expanded: t.deltaExpanded,
    };
    middle = (
      <Group
        title={t.formatGroup}
        help={t.formatHelp}
        active={saving === "format" || saving === "bar"}
      >
        <ChoiceCards<DeltaSize>
          label={t.deltaFormat}
          value={studioWidgetOptions.delta.sizes.find((v) => v === s.size)}
          options={studioWidgetOptions.delta.sizes.map((value) => ({
            value,
            label: labels[value],
            art: `delta-${value}`,
          }))}
          disabled={disabled}
          pending={pending}
          onChange={(size) => void patch({ kind: "delta", size }, "format")}
        />
        {s.size !== "pill" && (
          <Switch
            label={t.deltaDifferenceBar}
            checked={s.showBar}
            disabled={disabled}
            pending={pending}
            onCheckedChange={(showBar) =>
              void patch({ kind: "delta", showBar }, "bar")
            }
          />
        )}
      </Group>
    );
  } else if (s.kind === "fuel-strategy" && s.designSystem === "vantare") {
    middle = (
      <Group
        title={t.formatGroup}
        help={t.formatHelp}
        active={saving === "format" || saving === "bar"}
      >
        <ChoiceCards<TableSize>
          label={t.fuelFormat}
          value={studioWidgetOptions.tableSizes.find((v) => v === s.size)}
          options={studioWidgetOptions.tableSizes.map((value) => ({
            value,
            label: formats[value],
            art: `fuel-${value}`,
          }))}
          disabled={disabled}
          pending={pending}
          onChange={(size) =>
            void patch({ kind: "fuel-strategy", size }, "format")
          }
        />
        <p>{t.fuelExpandedHelp}</p>
      </Group>
    );
  } else if (s.kind === "pedals") {
    middle = (
      <Group title={t.backgroundGroup} active={saving === "transparent"}>
        <Switch
          label={t.transparentBackground}
          checked={s.transparentBackground ?? false}
          disabled={disabled}
          pending={pending}
          onCheckedChange={(transparentBackground) =>
            void patch({ kind: "pedals", transparentBackground }, "transparent")
          }
        />
      </Group>
    );
  }
  return (
    <div
      className="v-studio-appearance-groups"
      aria-disabled={disabled || pending || undefined}
      data-pending={pending}
    >
      <Group title={t.widgetLook} help={t.lookHelp} active={saving === "look"}>
        <ChoiceCards
          label={t.widgetLook}
          value={s.designSystem}
          options={[
            { value: "vantare", label: t.lookVantare, art: "look-vantare" },
            {
              value: "eficiencia",
              label: t.lookEficiencia,
              art: "look-eficiencia",
            },
          ]}
          disabled={disabled}
          pending={pending}
          onChange={(designSystem) =>
            void patch({ kind: s.kind, designSystem }, "look")
          }
        />
        <p>
          {s.designSystem === "vantare" ? t.lookToEficiencia : t.lookToVantare}
        </p>
      </Group>
      {middle}
      {color}
      {s.kind === "standings" && s.designSystem === "eficiencia" && (
        <Group title={t.tablePreset}>
          <ChoiceCards<TableSize>
            action
            label={t.tablePreset}
            options={studioWidgetOptions.tableSizes.map((value) => ({
              value,
              label: formats[value],
              art: `table-${value}`,
            }))}
            disabled
            pending={false}
            onChange={() => {}}
          />
          <p>{t.tablePresetVantareOnly}</p>
        </Group>
      )}
    </div>
  );
}
function Group({
  title,
  help,
  children,
  active,
}: {
  active?: boolean;
  title: string;
  help?: string;
  children: ReactNode;
}) {
  return (
    <section
      className="v-studio-appearance-group"
      aria-label={title}
      data-active={active}
    >
      <h3>
        {title}
        {help && <small>{help}</small>}
      </h3>
      {children}
    </section>
  );
}
