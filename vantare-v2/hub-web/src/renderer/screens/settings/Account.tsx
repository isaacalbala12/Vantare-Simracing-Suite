import { useEffect, useRef, useState } from "react";
import {
  type PilotFields,
  pilotEditorLimits,
} from "../../../contract/generated/contract";
import { isPilotFields } from "../../../contract/pilot-validation";
import { useHost } from "../../app/Host";
import { usePilot } from "../../app/PilotState";
import { useUi } from "../../app/UiState";
import { t } from "../../i18n/es";
import { pilotText as text } from "../../i18n/pilot.es";
import { Button } from "../../ui/Button";
import { Callout, SettingGroup, Skeleton } from "../../ui/Data";
import {
  PilotAccountLink,
  PilotCard,
  PilotDetails,
  PilotLayout,
  PilotPhoto,
  PilotPreview,
  PilotSaveBar,
  PilotSimulators,
} from "../../ui/PilotProfile";
import { ActionGroup } from "../../ui/ShellLayout";
import { cropPilotPhoto } from "./pilot-photo";

export function Account() {
  const state = usePilot();
  const navigate = useUi((state) => state.navigate);
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
  const valid =
    isPilotFields(draft) &&
    !!draft.publicName.trim() &&
    Array.from(draft.publicName.trim()).length <= pilotEditorLimits.name &&
    Array.from(draft.description.trim()).length <=
      pilotEditorLimits.description &&
    Array.from(draft.favoriteCar.trim()).length <= pilotEditorLimits.favorite &&
    Array.from(draft.favoriteTeam.trim()).length <= pilotEditorLimits.favorite;
  function edit<K extends keyof PilotFields>(field: K, value: PilotFields[K]) {
    if (draft && !state.busy)
      state.edit((current) => ({ ...current, [field]: value }));
  }
  return (
    <PilotLayout preview={<PilotPreview fields={draft} />}>
      <SettingGroup number={1} title={text.photoGroup} surface={false}>
        <PilotCard>
          <PilotPhoto fields={draft}>
            <Button
              size="sm"
              aria-disabled={state.busy || photoBusy || undefined}
              onClick={() => {
                if (!state.busy && !photoBusy) photoInput.current?.click();
              }}
            >
              {draft.photo ? text.changePhoto : t("pilot.choosePhoto")}
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
            {draft.photo && (
              <Button
                size="sm"
                aria-disabled={state.busy || undefined}
                onClick={() => edit("photo", null)}
              >
                {t("pilot.removePhoto")}
              </Button>
            )}
          </PilotPhoto>
        </PilotCard>
      </SettingGroup>
      {photoError && <Callout tone="err" title={t("pilot.photoFailed")} />}
      <SettingGroup number={2} title={text.detailsGroup} surface={false}>
        <PilotCard>
          <PilotDetails fields={draft} pending={state.busy} edit={edit} />
        </PilotCard>
      </SettingGroup>
      <SettingGroup number={3} title={text.simulatorsGroup} surface={false}>
        <PilotCard>
          <PilotSimulators
            fields={draft}
            pending={state.busy}
            onChange={(value) => edit("simulators", value)}
          />
        </PilotCard>
      </SettingGroup>
      {state.error && (
        <Callout
          tone="err"
          title={t("pilot.failed")}
          actions={
            <ActionGroup>
              <Button busy={state.busy} onClick={() => void state.retry()}>
                {t("pilot.retry")}
              </Button>
              <Button disabled={state.busy} onClick={() => void state.load()}>
                {t("pilot.reload")}
              </Button>
            </ActionGroup>
          }
        >
          {t("pilot.failedHelp")}
        </Callout>
      )}
      {state.closeVeto && <Callout title={t("pilot.unsaved")} />}
      {state.dirty && !valid && (
        <Callout tone="warn" title={t("pilot.invalid")} />
      )}
      <PilotSaveBar
        dirty={state.dirty}
        message={
          state.lastSaved ? t("pilot.saved") : state.dirty ? text.unsaved : ""
        }
      >
        <Button
          size="sm"
          disabled={state.busy || !state.dirty}
          onClick={state.discard}
        >
          {t("pilot.discard")}
        </Button>
        <Button
          size="sm"
          variant="primary"
          busy={state.busy}
          disabled={!state.dirty || !valid || photoBusy}
          onClick={() => void state.save()}
        >
          {t("pilot.save")}
        </Button>
      </PilotSaveBar>
      <SettingGroup number={4} title={text.accountGroup} surface={false}>
        <PilotCard>
          <PilotAccountLink onOpen={() => navigate("account")} />
        </PilotCard>
      </SettingGroup>
    </PilotLayout>
  );
}
