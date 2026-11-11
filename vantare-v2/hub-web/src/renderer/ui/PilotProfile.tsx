import { Checkbox } from "@base-ui/react/checkbox";
import { Field } from "@base-ui/react/field";
import type { ReactNode } from "react";
import type { PilotFields } from "../../contract/generated/contract";
import {
  pilotCountryOptions,
  pilotEditorLimits,
  pilotSimulatorOptions,
} from "../../contract/generated/contract";
import { Icon } from "../assets/icons/Icon";
import { t } from "../i18n/es";
import { pilotText as text } from "../i18n/pilot.es";
import { Button } from "./Button";
import { type Option, Select } from "./Forms";
import { RailBlock } from "./Frame";
import { initials } from "./initials";
import { TrackedCaps } from "./TrackedCaps";
import "./pilot-profile.css";

export function PilotLayout({
  children,
  preview,
}: {
  children: ReactNode;
  preview: ReactNode;
}) {
  return (
    <div className="v-pilot-layout">
      <div className="v-pilot-editor">{children}</div>
      {preview}
    </div>
  );
}
export function PilotCard({ children }: { children: ReactNode }) {
  return <div className="v-pilot-card">{children}</div>;
}
export function PilotAvatar({
  fields,
  large = false,
}: {
  fields: PilotFields;
  large?: boolean;
}) {
  return (
    <div className={`v-pilot-avatar${large ? " v-pilot-avatar--large" : ""}`}>
      {fields.photo ? (
        <img
          alt={fields.publicName || t("pilot.photo")}
          src={`data:image/jpeg;base64,${fields.photo}`}
        />
      ) : (
        <span aria-hidden="true">{initials(fields.publicName)}</span>
      )}
    </div>
  );
}
export function PilotPhoto({
  fields,
  children,
}: {
  fields: PilotFields;
  children: ReactNode;
}) {
  return (
    <div className="v-pilot-photo">
      <PilotAvatar fields={fields} />
      <div className="v-pilot-photo-description">
        <strong>{t("pilot.photo")}</strong>
        <p>{text.photoHelp}</p>
      </div>
      <div className="v-pilot-photo-actions">{children}</div>
    </div>
  );
}
function PilotField({
  label,
  value,
  limit,
  multiline = false,
  showCount = false,
  pending,
  onChange,
}: {
  label: string;
  value: string;
  limit: number;
  multiline?: boolean;
  showCount?: boolean;
  pending: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <Field.Root className="v-pilot-field">
      <div className="v-pilot-caption">
        <Field.Label>{label}</Field.Label>
        {showCount && (
          <span>{`${Array.from(value.trim()).length}/${limit}`}</span>
        )}
      </div>
      <Field.Control
        className="v-input"
        render={multiline ? <textarea /> : <input />}
        value={value}
        aria-disabled={pending || undefined}
        readOnly={pending}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    </Field.Root>
  );
}
export function PilotDetails({
  fields,
  pending,
  edit,
}: {
  fields: PilotFields;
  pending: boolean;
  edit: <K extends keyof PilotFields>(field: K, value: PilotFields[K]) => void;
}) {
  const countries: Option[] = pilotCountryOptions.map(([value, label]) => ({
    value,
    label,
  }));
  if (
    fields.country &&
    !countries.some((item) => item.value === fields.country)
  )
    countries.push({
      value: fields.country,
      label: fields.country,
    });
  return (
    <div className="v-pilot-details">
      <div className="v-pilot-name-country">
        <PilotField
          label={t("pilot.name")}
          value={fields.publicName}
          limit={pilotEditorLimits.name}
          showCount
          pending={pending}
          onChange={(value) => edit("publicName", value)}
        />
        <Select
          label={t("pilot.country")}
          value={fields.country ?? ""}
          pending={pending}
          options={[{ value: "", label: t("pilot.noCountry") }, ...countries]}
          onChange={(value) => edit("country", value || null)}
        />
      </div>
      <PilotField
        label={t("pilot.description")}
        value={fields.description}
        limit={pilotEditorLimits.description}
        showCount
        multiline
        pending={pending}
        onChange={(value) => edit("description", value)}
      />
      <div className="v-pilot-favorites">
        <PilotField
          label={t("pilot.car")}
          value={fields.favoriteCar}
          limit={pilotEditorLimits.favorite}
          pending={pending}
          onChange={(value) => edit("favoriteCar", value)}
        />
        <PilotField
          label={t("pilot.team")}
          value={fields.favoriteTeam}
          limit={pilotEditorLimits.favorite}
          pending={pending}
          onChange={(value) => edit("favoriteTeam", value)}
        />
      </div>
    </div>
  );
}
export function PilotSimulators({
  fields,
  pending,
  onChange,
}: {
  fields: PilotFields;
  pending: boolean;
  onChange: (values: string[]) => void;
}) {
  return (
    <div className="v-pilot-simulators">
      <p>{t("pilot.simulatorsHelp")}</p>
      <div>
        {pilotSimulatorOptions.map(([id, label]) => (
          <Checkbox.Root
            key={id}
            className="v-pilot-simulator"
            checked={fields.simulators.includes(id)}
            aria-disabled={pending || undefined}
            onCheckedChange={(checked) => {
              if (pending) return;
              const selected = checked
                ? [...fields.simulators, id]
                : fields.simulators.filter((value) => value !== id);
              const known = pilotSimulatorOptions.map(([value]) => value);
              onChange([
                ...known.filter((value) => selected.includes(value)),
                ...selected.filter(
                  (value) => !known.some((id) => id === value),
                ),
              ]);
            }}
          >
            <span className="v-pilot-simulator-check">
              <Checkbox.Indicator>
                <Icon name="check" />
              </Checkbox.Indicator>
            </span>
            {label}
          </Checkbox.Root>
        ))}
      </div>
    </div>
  );
}
export function PilotPreview({ fields }: { fields: PilotFields }) {
  const country =
    pilotCountryOptions.find(([id]) => id === fields.country)?.[1] ??
    fields.country;
  const sims = fields.simulators.map((id) => ({
    id,
    label: pilotSimulatorOptions.find(([value]) => value === id)?.[1] ?? id,
  }));
  return (
    <aside className="v-pilot-preview">
      <div className="v-pilot-preview-heading">
        <strong>{text.preview}</strong>
        <span>
          <Icon name="v-lock" />
          {text.onlyYou}
        </span>
      </div>
      <div className="v-pilot-preview-avatar">
        <PilotAvatar fields={fields} large />
      </div>
      <div className="v-pilot-preview-identity">
        <h3 data-empty={!fields.publicName.trim() || undefined}>
          {fields.publicName.trim() || text.namePlaceholder}
        </h3>
        <div className="v-pilot-preview-country">
          <TrackedCaps>{country ?? text.countryPlaceholder}</TrackedCaps>
        </div>
      </div>
      <p data-empty={!fields.description.trim() || undefined}>
        {fields.description.trim() || text.descriptionPlaceholder}
      </p>
      <div className="v-pilot-preview-sims">
        {sims.length ? (
          sims.map((sim) => <span key={sim.id}>{sim.label}</span>)
        ) : (
          <span>{text.noSimulators}</span>
        )}
      </div>
      <dl>
        <div>
          <dt>
            <TrackedCaps>{text.car}</TrackedCaps>
          </dt>
          <dd>{fields.favoriteCar.trim() || text.empty}</dd>
        </div>
        <div>
          <dt>
            <TrackedCaps>{text.team}</TrackedCaps>
          </dt>
          <dd>{fields.favoriteTeam.trim() || text.empty}</dd>
        </div>
      </dl>
    </aside>
  );
}
export function PilotSaveBar({
  message,
  dirty,
  children,
}: {
  message: string;
  dirty: boolean;
  children: ReactNode;
}) {
  return (
    <div className="v-pilot-savebar">
      <span className="v-pilot-save-dot" data-dirty={dirty || undefined} />
      <span role="status">{message}</span>
      {children}
    </div>
  );
}
export function PilotAccountLink({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="v-pilot-account-link">
      <Icon name="v-shield" />
      <div>
        <strong>{text.accountTitle}</strong>
        <p>{text.accountHelp}</p>
      </div>
      <Button size="sm" onClick={onOpen}>
        {text.openAccount}
      </Button>
    </div>
  );
}
export function PilotRail() {
  return (
    <>
      <RailBlock title={text.privateTitle} icon="v-helmet">
        <p>{text.privateHelp}</p>
      </RailBlock>
      <RailBlock title={text.flagTitle} icon="flag">
        <p>{text.flagHelp}</p>
      </RailBlock>
    </>
  );
}
