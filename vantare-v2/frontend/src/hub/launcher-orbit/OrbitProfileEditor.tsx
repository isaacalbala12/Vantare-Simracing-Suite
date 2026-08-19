import { useEffect, useMemo, useState } from "react";
import { useI18n } from "../../i18n/I18nProvider";
import {
  Button,
  Drawer,
  Field,
  Input,
  KeycapRow,
  Select,
  Textarea,
  Toggle,
} from "../../ui/orbit";
import { formatMessage } from "../orbit/format-message";
import { parseKeyEvent } from "../settings/hotkey-capture";
import type { LaunchProfile, LauncherAppEntry } from "../launcher/launcher-state";
import {
  hasDuplicateSteps,
  isHotkeyAllowed,
  isProfileLaunchable,
} from "../launcher/launcher-state";
import { hotkeyKeys } from "./launcher-orbit-model";
import "../../styles/orbit-launcher.css";

export type OrbitProfileEditorProps = {
  profile: LaunchProfile;
  open: boolean;
  onClose: () => void;
  onSave: (profile: LaunchProfile) => void;
  apps: LauncherAppEntry[];
};

/**
 * Editor de perfil de lanzamiento en Orbit.
 *
 * Es el mismo formulario y **la misma lógica** que el `ProfileEditor` legado
 * (borrador local, reglas de validación de `launcher-state`, un único
 * `onSave(draft)`): lo que cambia es el envoltorio, que pasa de Tailwind suelto
 * al `Drawer` del kit y a `Field`/`Input`/`Select`/`Textarea`/`Toggle`. No se
 * toca el contrato ni se añade ninguna regla nueva.
 */
export function OrbitProfileEditor({
  profile,
  open,
  onClose,
  onSave,
  apps,
}: OrbitProfileEditorProps) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(profile);
  const [recording, setRecording] = useState(false);

  const advanced = draft.advanced === true;
  const launchable = useMemo(() => isProfileLaunchable(draft, apps), [draft, apps]);
  const invalidSteps = draft.steps.some((step) => !step.appId || step.delay < 0);
  const duplicateSteps = hasDuplicateSteps(draft);
  const hotkeyInvalid = Boolean(draft.hotkey) && !isHotkeyAllowed(draft.hotkey as string);
  const canSave =
    !invalidSteps &&
    (draft.steps.length === 0 || (launchable && (advanced || !duplicateSteps)));

  // Grabación real de la combinación, con el mismo parseo que Ajustes.
  useEffect(() => {
    if (!recording) return;
    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const { combo, isCancel } = parseKeyEvent(event);
      if (isCancel) {
        setRecording(false);
        return;
      }
      if (!combo) return;
      setDraft((current) => ({ ...current, hotkey: combo }));
      setRecording(false);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [recording]);

  const appOptions = useMemo(
    () => [
      { value: "", label: t("launcher.editor.stepAppPlaceholder") },
      ...apps.map((app) => ({ value: app.id, label: app.displayName })),
    ],
    [apps, t],
  );

  const setSteps = (steps: LaunchProfile["steps"]) =>
    setDraft((current) => ({ ...current, steps }));

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= draft.steps.length) return;
    const next = [...draft.steps];
    [next[index], next[target]] = [next[target], next[index]];
    setSteps(next);
  };

  return (
    <Drawer
      className="orbit-profile-editor"
      closeLabel={t("launcher.editor.close")}
      data-testid="orbit-profile-editor"
      footer={
        <>
          <Button data-testid="orbit-profile-editor-cancel" onClick={onClose} variant="ghost">
            {t("launcher.editor.cancel")}
          </Button>
          <Button
            data-testid="orbit-profile-editor-save"
            disabled={!canSave}
            onClick={() => onSave(draft)}
            variant="primary"
          >
            {t("launcher.editor.save")}
          </Button>
        </>
      }
      onClose={onClose}
      open={open}
      title={t("launcher.editor.title")}
    >
      <Field htmlFor="orbit-profile-name" label={t("launcher.editor.name")}>
        <Input
          data-testid="orbit-profile-editor-name"
          id="orbit-profile-name"
          onChange={(event) => setDraft({ ...draft, name: event.target.value })}
          value={draft.name}
        />
      </Field>

      <Field htmlFor="orbit-profile-description" label={t("launcher.editor.description")}>
        <Input
          data-testid="orbit-profile-editor-description"
          id="orbit-profile-description"
          onChange={(event) => setDraft({ ...draft, description: event.target.value })}
          value={draft.description ?? ""}
        />
      </Field>

      <Field htmlFor="orbit-profile-notes" label={t("launcher.editor.notes")}>
        <Textarea
          data-testid="orbit-profile-editor-notes"
          id="orbit-profile-notes"
          onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
          rows={3}
          value={draft.notes ?? ""}
        />
      </Field>

      <section className="orbit-profile-editor__steps">
        <div className="orbit-profile-editor__steps-head">
          <span className="orbit-eyebrow">{t("launcher.editor.steps")}</span>
          <button
            aria-expanded={advanced}
            className="orbit-profile-editor__mode"
            data-testid="orbit-profile-editor-advanced-toggle"
            onClick={() => setDraft({ ...draft, advanced: !advanced })}
            type="button"
          >
            {advanced ? t("launcher.editor.basic") : t("launcher.editor.advanced")}
          </button>
        </div>

        {draft.steps.map((step, index) => (
          <div
            className="orbit-profile-editor__step"
            data-testid={`orbit-editor-step-${index}`}
            key={index}
          >
            <Select
              className="orbit-profile-editor__step-app"
              label={formatMessage(t("launcher.editor.stepApp"), { n: index + 1 })}
              onChange={(value) => {
                const next = [...draft.steps];
                next[index] = { ...step, appId: value };
                setSteps(next);
              }}
              options={appOptions}
              value={step.appId}
            />
            <Input
              aria-label={formatMessage(t("launcher.editor.stepDelay"), { n: index + 1 })}
              className="orbit-profile-editor__step-delay"
              data-testid={`orbit-editor-step-delay-${index}`}
              min={0}
              numeric
              onChange={(event) => {
                const next = [...draft.steps];
                next[index] = { ...step, delay: Number(event.target.value) || 0 };
                setSteps(next);
              }}
              type="number"
              value={step.delay}
            />
            {advanced ? (
              <Input
                aria-label={formatMessage(t("launcher.editor.stepArgs"), { n: index + 1 })}
                className="orbit-profile-editor__step-args"
                data-testid={`orbit-editor-step-args-${index}`}
                onChange={(event) => {
                  const next = [...draft.steps];
                  next[index] = { ...step, argsOverride: event.target.value || undefined };
                  setSteps(next);
                }}
                placeholder={t("launcher.editor.stepArgsPlaceholder")}
                value={step.argsOverride ?? ""}
              />
            ) : null}
            <span className="orbit-profile-editor__step-actions">
              <button
                aria-label={t("launcher.editor.stepUp")}
                className="orbit-icon-btn orbit-icon-btn--28"
                data-testid={`orbit-editor-step-up-${index}`}
                data-tip={t("launcher.editor.stepUp")}
                data-tip-side="top"
                disabled={index === 0}
                onClick={() => move(index, -1)}
                type="button"
              >
                ↑
              </button>
              <button
                aria-label={t("launcher.editor.stepDown")}
                className="orbit-icon-btn orbit-icon-btn--28"
                data-testid={`orbit-editor-step-down-${index}`}
                data-tip={t("launcher.editor.stepDown")}
                data-tip-side="top"
                disabled={index === draft.steps.length - 1}
                onClick={() => move(index, 1)}
                type="button"
              >
                ↓
              </button>
              <button
                aria-label={t("launcher.editor.stepRemove")}
                className="orbit-icon-btn orbit-icon-btn--28"
                data-testid={`orbit-editor-step-remove-${index}`}
                data-tip={t("launcher.editor.stepRemove")}
                data-tip-side="top"
                onClick={() => setSteps(draft.steps.filter((_, i) => i !== index))}
                type="button"
              >
                ✕
              </button>
            </span>
          </div>
        ))}

        <button
          className="orbit-profile-editor__add"
          data-testid="orbit-editor-step-add"
          onClick={() => setSteps([...draft.steps, { appId: "", delay: 2 }])}
          type="button"
        >
          {t("launcher.editor.addStep")}
        </button>

        {!launchable && draft.steps.length > 0 ? (
          <p
            className="orbit-profile-editor__error"
            data-testid="orbit-profile-editor-unlaunchable"
            role="status"
          >
            {t("launcher.editor.unlaunchable")}
          </p>
        ) : null}
        {duplicateSteps && !advanced ? (
          <p
            className="orbit-profile-editor__error"
            data-testid="orbit-profile-editor-duplicate-warning"
            role="status"
          >
            {t("launcher.editor.duplicate")}
          </p>
        ) : null}
      </section>

      <KeycapRow
        className="orbit-profile-editor__hotkey"
        description={t("launcher.editor.hotkeyHint")}
        emptyLabel={t("launcher.editor.hotkeyEmpty")}
        empty={!draft.hotkey}
        conflict={hotkeyInvalid}
        conflictLabel={t("launcher.editor.hotkeyReserved")}
        keys={hotkeyKeys(draft.hotkey)}
        onRecord={() => setRecording(true)}
        recording={recording}
        recordingLabel={t("launcher.editor.hotkeyRecording")}
        title={t("launcher.editor.hotkey")}
      />
      {draft.hotkey ? (
        <button
          className="orbit-profile-editor__hotkey-clear"
          data-testid="orbit-profile-editor-hotkey-clear"
          onClick={() => setDraft({ ...draft, hotkey: undefined })}
          type="button"
        >
          {t("launcher.editor.hotkeyClear")}
        </button>
      ) : null}

      <Field
        className="orbit-profile-editor__autostart"
        label={t("launcher.editor.autostart")}
        row
      >
        <Toggle
          className="orbit-profile-editor__autostart-toggle"
          disabled={draft.steps.length === 0}
          label={t("launcher.editor.autostart")}
          onChange={(value) => setDraft({ ...draft, launchOnWindowsStartup: value })}
          pressed={draft.launchOnWindowsStartup ?? false}
          title={draft.steps.length === 0 ? t("launcher.editor.autostartBlocked") : undefined}
        />
      </Field>
    </Drawer>
  );
}
