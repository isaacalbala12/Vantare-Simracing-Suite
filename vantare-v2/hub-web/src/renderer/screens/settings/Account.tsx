import { useEffect, useRef, useState } from "react";
import {
  type PilotFields,
  pilotCountries,
  pilotLimits,
} from "../../../contract/generated/contract";
import { isPilotFields } from "../../../contract/pilot-validation";
import { useHost } from "../../app/Host";
import { usePilot } from "../../app/PilotState";
import { t } from "../../i18n/es";
import { Button } from "../../ui/Button";
import { Avatar, Callout, Card, SettingRow, Skeleton } from "../../ui/Data";
import { Input, Select, Textarea } from "../../ui/Forms";
import { ActionGroup, ContentStack } from "../../ui/ShellLayout";
import { cropPilotPhoto } from "./pilot-photo";

export function Account() {
  const state = usePilot();
  const { client } = useHost();
  const [photoError, setPhotoError] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);
  const attempted = useRef(false);
  useEffect(() => {
    if (client && !attempted.current && !state.view) {
      attempted.current = true;
      void state.load();
    }
  }, [client, state.view, state.load]);
  const draft = state.draft;
  if (!draft)
    return state.busy || !state.error ? (
      <Skeleton label={t("settings.loading")} />
    ) : (
      <Callout
        tone="warn"
        title={t("pilot.unavailable")}
        actions={
          <Button onClick={() => void state.load()}>
            {t("settings.reload")}
          </Button>
        }
      />
    );
  const valid = isPilotFields(draft);
  function edit<K extends keyof PilotFields>(field: K, value: PilotFields[K]) {
    if (draft) state.edit((current) => ({ ...current, [field]: value }));
  }
  const names = new Intl.DisplayNames(["es"], { type: "region" });
  return (
    <ContentStack>
      <Card
        title={t("pilot.title")}
        footer={t("pilot.local")}
        actions={
          <ActionGroup>
            <Button
              busy={state.busy}
              disabled={!state.dirty || !valid || photoBusy}
              onClick={() => void state.save()}
            >
              {t("pilot.save")}
            </Button>
            <Button
              disabled={state.busy || !state.dirty}
              onClick={state.discard}
            >
              {t("pilot.discard")}
            </Button>
          </ActionGroup>
        }
      >
        {state.error && (
          <Callout
            tone="err"
            title={t("pilot.failed")}
            actions={
              <Button disabled={state.busy} onClick={() => void state.load()}>
                {t("pilot.reload")}
              </Button>
            }
          >
            {t("pilot.failedHelp")}
          </Callout>
        )}
        {state.dirty && <Callout title={t("pilot.unsaved")} />}
        {!valid && <Callout tone="warn" title={t("pilot.invalid")} />}
        <SettingRow
          label={t("pilot.photo")}
          description={`${t("pilot.photoHelp")} ${pilotLimits.sourceBytes / (1024 * 1024)} MiB · ${pilotLimits.sourceSide} × ${pilotLimits.sourceSide} px`}
        >
          <Avatar
            label={draft.publicName || t("pilot.title")}
            initials={draft.publicName.slice(0, 2).toUpperCase() || "?"}
            src={
              draft.photo ? `data:image/jpeg;base64,${draft.photo}` : undefined
            }
          />
          <Button
            disabled={state.busy || photoBusy}
            onClick={() => photoInput.current?.click()}
          >
            {t("pilot.choosePhoto")}
          </Button>
          <input
            hidden
            ref={photoInput}
            aria-label={t("pilot.choosePhoto")}
            type="file"
            accept="image/jpeg,image/png"
            aria-disabled={state.busy}
            onChange={async (event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              if (!file || state.busy || photoBusy) return;
              setPhotoBusy(true);
              setPhotoError(false);
              try {
                edit("photo", await cropPilotPhoto(file));
              } catch {
                setPhotoError(true);
              } finally {
                setPhotoBusy(false);
              }
            }}
          />
          <Button
            disabled={!draft.photo || state.busy}
            onClick={() => edit("photo", null)}
          >
            {t("pilot.removePhoto")}
          </Button>
        </SettingRow>
        {photoError && <Callout tone="err" title={t("pilot.photoFailed")} />}
        <Input
          label={t("pilot.name")}
          value={draft.publicName}
          aria-disabled={state.busy}
          onChange={(e) => edit("publicName", e.currentTarget.value)}
          description={t("pilot.private")}
        />
        <Textarea
          label={t("pilot.description")}
          value={draft.description}
          aria-disabled={state.busy}
          onChange={(e) => edit("description", e.currentTarget.value)}
        />
        <Select
          label={t("pilot.country")}
          value={draft.country ?? ""}
          pending={state.busy}
          onChange={(value) => edit("country", value || null)}
          options={[
            { value: "", label: t("pilot.noCountry") },
            ...pilotCountries.map((value) => ({
              value,
              label: names.of(value) ?? value,
            })),
          ]}
        />
        <Input
          label={t("pilot.simulators")}
          description={t("pilot.simulatorsHelp")}
          value={draft.simulators.join(", ")}
          aria-disabled={state.busy}
          onChange={(e) =>
            edit(
              "simulators",
              e.currentTarget.value
                ? e.currentTarget.value.split(",").map((s) => s.trim())
                : [],
            )
          }
        />
        <Input
          label={t("pilot.car")}
          value={draft.favoriteCar}
          aria-disabled={state.busy}
          onChange={(e) => edit("favoriteCar", e.currentTarget.value)}
        />
        <Input
          label={t("pilot.team")}
          value={draft.favoriteTeam}
          aria-disabled={state.busy}
          onChange={(e) => edit("favoriteTeam", e.currentTarget.value)}
        />
      </Card>
    </ContentStack>
  );
}
