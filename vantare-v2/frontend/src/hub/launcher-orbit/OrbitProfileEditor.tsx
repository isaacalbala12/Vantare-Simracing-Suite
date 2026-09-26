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
import type { LaunchPolicy, LaunchProfile, LauncherAppEntry } from "../launcher/launcher-state";
import {
  hasDuplicateSteps,
  isHotkeyAllowed,
  isProfileLaunchable,
} from "../launcher/launcher-state";
import { hotkeyKeys } from "./launcher-orbit-model";
import { registerHubSuspendBlocker } from "../hub-suspend-guard";
import "../../styles/orbit-launcher.css";
import "../../styles/orbit-launcher-policy.css";

export type OrbitProfileEditorProps = {
  profile: LaunchProfile;
  open: boolean;
  onClose: () => void;
  onSave: (profile: LaunchProfile) => void;
  apps: LauncherAppEntry[];
};

const defaultPolicy: LaunchPolicy = {
  alreadyRunning: "ask",
  failure: "ask",
  cancel: "ask",
  exit: "ask",
  retry: "ask",
  maxRetries: 0,
};

/**
 * Editor de perfil de lanzamiento en Orbit.
 *
 * Conserva el borrador local, las reglas de validación de `launcher-state` y
 * un único `onSave(draft)`. Los controles del kit editan el contrato real de
 * políticas sin mantener otro estado para cada elección.
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
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(profile), [draft, profile]);

  useEffect(() => {
    if (!open || !dirty) return;
    return registerHubSuspendBlocker(
      "launcher-profile-draft",
      "El editor de perfiles del Launcher tiene un borrador sin guardar",
    );
  }, [dirty, open]);

  const advanced = draft.advanced === true;
  const launchable = useMemo(() => isProfileLaunchable(draft, apps), [draft, apps]);
  const validDelay = (seconds: number) => Number.isSafeInteger(seconds) && seconds >= 0;
  const invalidSteps = draft.steps.some((step) => !step.appId || !validDelay(step.delay)) ||
    !validDelay(draft.policy?.firstStepDelay ?? 0) ||
    !Number.isSafeInteger(draft.policy?.maxRetries ?? 0) ||
    (draft.policy?.maxRetries ?? 0) < 0 || (draft.policy?.maxRetries ?? 0) > 3;
  const duplicateSteps = hasDuplicateSteps(draft);
  const hotkeyInvalid = Boolean(draft.hotkey) && !isHotkeyAllowed(draft.hotkey as string);
  const canSave =
    draft.name.trim().length > 0 &&
    !hotkeyInvalid &&
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
      setDraft((current) => ({ ...current, hotkey: combo.split("+").map((part) => part === "meta" ? "win" : part).join("+") }));
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

  const setPolicy = <K extends keyof LaunchPolicy>(key: K, value: LaunchPolicy[K]) =>
    setDraft((current) => ({
      ...current,
      policy: { ...defaultPolicy, ...current.policy, [key]: value },
    }));

  const policy = draft.policy ?? defaultPolicy;

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
              step={1}
              onChange={(event) => {
                const delay = Number(event.target.value) || 0;
                if (index === 0) {
                  setPolicy("firstStepDelay", delay);
                  return;
                }
                const next = [...draft.steps];
                next[index] = { ...step, delay };
                setSteps(next);
              }}
              type="number"
              value={index === 0 ? (draft.policy?.firstStepDelay ?? 0) : step.delay}
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

      {advanced ? (
        <section className="orbit-profile-editor__policies" aria-label={t("launcher.editor.policies")}>
          <span className="orbit-eyebrow">{t("launcher.editor.policies")}</span>
          <div className="orbit-profile-editor__policy-grid">
            <Field htmlFor="orbit-profile-already-running" label={t("launcher.editor.alreadyRunning")}>
              <Select
                id="orbit-profile-already-running"
                label={t("launcher.editor.alreadyRunning")}
                onChange={(value) => setPolicy("alreadyRunning", value)}
                options={[
                  { value: "ask", label: t("launcher.editor.ask") },
                  { value: "reuse", label: t("launcher.editor.reuse") },
                  { value: "restart", label: t("launcher.editor.restart") },
                ]}
                value={policy.alreadyRunning}
              />
            </Field>
            <Field htmlFor="orbit-profile-failure" label={t("launcher.editor.failure")}>
              <Select
                id="orbit-profile-failure"
                label={t("launcher.editor.failure")}
                onChange={(value) => setPolicy("failure", value)}
                options={[
                  { value: "ask", label: t("launcher.editor.ask") },
                  { value: "stop", label: t("launcher.editor.stop") },
                  { value: "continue", label: t("launcher.editor.continue") },
                ]}
                value={policy.failure}
              />
            </Field>
            <Field htmlFor="orbit-profile-cancel" label={t("launcher.editor.cancelPolicy")}>
              <Select
                id="orbit-profile-cancel"
                label={t("launcher.editor.cancelPolicy")}
                onChange={(value) => setPolicy("cancel", value)}
                options={[
                  { value: "ask", label: t("launcher.editor.ask") },
                  { value: "leave", label: t("launcher.editor.leave") },
                  { value: "close-started", label: t("launcher.editor.closeStarted") },
                ]}
                value={policy.cancel}
              />
            </Field>
            <Field htmlFor="orbit-profile-exit" label={t("launcher.editor.exitPolicy")}>
              <Select
                id="orbit-profile-exit"
                label={t("launcher.editor.exitPolicy")}
                onChange={(value) => setPolicy("exit", value)}
                options={[
                  { value: "ask", label: t("launcher.editor.ask") },
                  { value: "leave", label: t("launcher.editor.leave") },
                  { value: "close-started", label: t("launcher.editor.closeStarted") },
                ]}
                value={policy.exit}
              />
            </Field>
            <Field htmlFor="orbit-profile-retry" label={t("launcher.editor.retryPolicy")}>
              <Select
                id="orbit-profile-retry"
                label={t("launcher.editor.retryPolicy")}
                onChange={(value) => setDraft((current) => ({
                  ...current,
                  policy: {
                    ...defaultPolicy,
                    ...current.policy,
                    retry: value as LaunchPolicy["retry"],
                    maxRetries: value === "ask" ? 0 : Math.max(1, current.policy?.maxRetries ?? 0),
                  },
                }))}
                options={[
                  { value: "ask", label: t("launcher.editor.ask") },
                  { value: "failed", label: t("launcher.editor.retryFailed") },
                  { value: "all", label: t("launcher.editor.retryAll") },
                ]}
                value={policy.retry}
              />
            </Field>
            {policy.retry !== "ask" ? (
              <Field htmlFor="orbit-profile-max-retries" label={t("launcher.editor.maxRetries")}>
                <Input
                  aria-label={t("launcher.editor.maxRetries")}
                  id="orbit-profile-max-retries"
                  max={3}
                  min={1}
                  numeric
                  onChange={(event) => setPolicy("maxRetries", Number(event.target.value))}
                  step={1}
                  type="number"
                  value={policy.maxRetries}
                />
              </Field>
            ) : null}
          </div>
        </section>
      ) : null}

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
