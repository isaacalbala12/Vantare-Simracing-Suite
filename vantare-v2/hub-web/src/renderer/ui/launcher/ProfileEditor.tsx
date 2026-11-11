import { AlertDialog as BaseAlertDialog } from "@base-ui/react/alert-dialog";
import type {
  LauncherApp,
  ProfileDraft,
  ProfilePolicy,
} from "../../../contract/generated/contract";
import {
  profileCloses,
  profileFailures,
  profileLimits,
  profileRetries,
  profileRunning,
} from "../../../contract/generated/contract";
import { oneOf } from "../../../contract/validation-common";
import { Icon } from "../../assets/icons/Icon";
import { profileText as text } from "../../i18n/profile-editor";
import { Button } from "../Button";
import { Callout, Keycap } from "../Data";
import { Checkbox, Input, Select, Switch, Textarea } from "../Forms";
import { Tooltip } from "../Layers";
import { AppMark, Circuit } from "./Profiles";
import "./editor.css";
export function ProfileEditorFields({
  draft,
  apps,
  rowKeys,
  pending,
  error,
  onChange,
  onMove,
  onRemove,
  onAdd,
  onSave,
  onCancel,
  onRetry,
  onDiscard,
}: {
  draft: ProfileDraft;
  apps: LauncherApp[];
  rowKeys: string[];
  pending: boolean;
  error?: string;
  onChange: (patch: Partial<ProfileDraft>) => void;
  onMove: (index: number, direction: -1 | 1) => void;
  onRemove: (index: number) => void;
  onAdd: () => void;
  onSave: () => void;
  onCancel: () => void;
  onRetry: () => void;
  onDiscard: () => void;
}) {
  function delay(index: number, value: number) {
    if (!Number.isInteger(value) || value < 0 || value > profileLimits.delay)
      return;
    onChange({
      steps: draft.steps.map((step, i) =>
        i === index ? { ...step, delaySeconds: value } : step,
      ),
    });
  }
  return (
    <div className="v-profile-editor">
      <header className="v-launcher-heading">
        <div>
          <h1>{text.title}</h1>
          <p>{text.help}</p>
        </div>
        <div className="v-launcher-actions">
          <Button disabled={pending} onClick={onCancel}>
            {text.cancel}
          </Button>
          <Button variant="primary" busy={pending} onClick={onSave}>
            <Icon name="play" />
            {text.save}
          </Button>
        </div>
      </header>
      {error && (
        <Callout
          tone="err"
          title={error}
          actions={
            <div className="v-launcher-actions">
              <Button disabled={pending} onClick={onRetry}>
                {text.retry}
              </Button>
              <Button variant="ghost" disabled={pending} onClick={onDiscard}>
                {text.discard}
              </Button>
            </div>
          }
        />
      )}
      <section
        className="v-profile-form"
        aria-label={text.title}
        aria-busy={pending}
      >
        <Input
          label={text.name}
          value={draft.name}
          maxLength={profileLimits.name}
          disabled={pending}
          onChange={(event) => onChange({ name: event.currentTarget.value })}
        />
        <div className="v-profile-favorite">
          <Switch
            label={text.favorite}
            checked={draft.favorite}
            disabled={pending}
            onCheckedChange={(favorite) => onChange({ favorite })}
          />
        </div>
        <div className="v-profile-decorations">
          <div>
            <span>{text.color}</span>
            <Tooltip label={text.colorSoon}>
              <span>
                <Button disabled>{text.soon}</Button>
              </span>
            </Tooltip>
          </div>
          <div>
            <span>{text.circuit}</span>
            <Tooltip label={text.circuitSoon}>
              <span>
                <Button disabled>{text.soon}</Button>
              </span>
            </Tooltip>
          </div>
        </div>
        <Input
          label={text.description}
          value={draft.description}
          maxLength={profileLimits.description}
          disabled={pending}
          onChange={(event) =>
            onChange({ description: event.currentTarget.value })
          }
        />
        {draft.advanced && (
          <Textarea
            label={text.notes}
            value={draft.notes}
            maxLength={profileLimits.notes}
            disabled={pending}
            onChange={(event) => onChange({ notes: event.currentTarget.value })}
          />
        )}
        <div className="v-profile-step-heading">
          <h2>{text.steps}</h2>
          <Button
            variant="ghost"
            aria-label={text.mode}
            aria-pressed={draft.advanced}
            disabled={pending}
            onClick={() => onChange({ advanced: !draft.advanced })}
          >
            {draft.advanced ? text.basic : text.advanced}
          </Button>
        </div>
        <div className="v-profile-step-list">
          {draft.steps.map((step, index) => (
            <fieldset
              key={rowKeys[index]}
              disabled={pending}
              className="v-profile-step"
            >
              <legend>{text.step(index)}</legend>
              <Select
                label={text.stepApp}
                value={step.appId}
                disabled={pending}
                options={apps.map((app) => ({
                  value: app.id,
                  label: app.name,
                  disabled: !app.available,
                }))}
                onChange={(appId) =>
                  onChange({
                    steps: draft.steps.map((step, i) =>
                      i === index ? { ...step, appId } : step,
                    ),
                  })
                }
              />
              <Input
                label={text.stepDelay}
                type="number"
                min={0}
                max={profileLimits.delay}
                value={step.delaySeconds}
                onChange={(event) =>
                  delay(index, Number(event.currentTarget.value))
                }
              />
              {draft.advanced && (
                <p className="v-muted">
                  {step.hasCustomArguments
                    ? text.customArguments
                    : text.defaultArguments}
                </p>
              )}
              <div className="v-launcher-actions">
                <Button
                  disabled={pending || index === 0}
                  onClick={() => onMove(index, -1)}
                >
                  {text.up}
                </Button>
                <Button
                  disabled={pending || index === draft.steps.length - 1}
                  onClick={() => onMove(index, 1)}
                >
                  {text.down}
                </Button>
                <Button
                  variant="ghost"
                  disabled={pending}
                  onClick={() => onRemove(index)}
                >
                  {text.remove}
                </Button>
              </div>
            </fieldset>
          ))}
        </div>
        <Button
          variant="ghost"
          disabled={pending || draft.steps.length >= profileLimits.steps}
          onClick={onAdd}
        >
          {text.addStep}
        </Button>
      </section>
    </div>
  );
}
export function ProfileEditorRailFields({
  draft,
  apps,
  pending,
  resident,
  onChange,
  onPolicy,
}: {
  draft: ProfileDraft;
  apps: LauncherApp[];
  pending: boolean;
  resident: boolean;
  onChange: (patch: Partial<ProfileDraft>) => void;
  onPolicy: (patch: Partial<ProfilePolicy>) => void;
}) {
  const running = { ask: text.ask, reuse: text.reuse, restart: text.restart };
  const failure = { ask: text.ask, stop: text.stop, continue: text.keepGoing };
  const close = {
    ask: text.ask,
    leave: text.leave,
    closeStarted: text.closeStarted,
  };
  const retry = {
    ask: text.ask,
    failed: text.failedSteps,
    all: text.wholeChain,
  };
  return (
    <div className="v-profile-rail">
      <section>
        <h2>
          <Icon name="v-launch" />
          {text.preview}
        </h2>
        <div className="v-profile-preview">
          <Circuit />
          <strong>{draft.name}</strong>
          <p>{draft.description}</p>
          <div className="v-profile-preview-apps">
            {draft.steps.map((step, index) => {
              const app = apps.find((app) => app.id === step.appId);
              return app ? (
                // biome-ignore lint/suspicious/noArrayIndexKey: Stateless preview badges describe each occurrence of an application.
                <AppMark app={app} small key={`${index}-${app.id}`} />
              ) : null;
            })}
          </div>
          <div className="v-profile-preview-keys">
            {draft.hotkey
              .split("+")
              .map((key) => key.trim().toLowerCase())
              .filter(Boolean)
              .map((key, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: Read-only keycap slots may repeat while the shortcut text is being edited.
                <Keycap key={`${index}-${key}`}>
                  {(
                    {
                      ctrl: "Ctrl",
                      control: "Ctrl",
                      alt: "Alt",
                      shift: "Shift",
                      meta: "Win",
                      win: "Win",
                    } as Record<string, string>
                  )[key] ?? key.toUpperCase()}
                </Keycap>
              ))}
          </div>
        </div>
      </section>
      <section>
        <h2>
          <Icon name="v-sliders" />
          {text.behavior}
        </h2>
        <div className="v-profile-behavior">
          <p>{text.launchOptions}</p>
          <Input
            label={text.hotkey}
            value={draft.hotkey}
            maxLength={profileLimits.hotkey}
            disabled={pending}
            onChange={(event) =>
              onChange({ hotkey: event.currentTarget.value })
            }
          />
          <div>
            <p>{text.startup}</p>
            <Checkbox
              label={text.startup}
              checked={draft.startup}
              disabled={pending}
              onCheckedChange={(startup) =>
                onChange({ startup: startup === true })
              }
            />
          </div>
          <Select
            label={text.failure}
            value={draft.policy.failure}
            options={profileFailures.map((value) => ({
              value,
              label: failure[value],
            }))}
            disabled={pending}
            onChange={(value) => {
              if (oneOf(value, profileFailures)) onPolicy({ failure: value });
            }}
          />
          <Select
            label={text.running}
            value={draft.policy.alreadyRunning}
            options={profileRunning.map((value) => ({
              value,
              label: running[value],
            }))}
            disabled={pending}
            onChange={(value) => {
              if (oneOf(value, profileRunning))
                onPolicy({ alreadyRunning: value });
            }}
          />
          <Select
            label={text.cancelPolicy}
            value={draft.policy.cancel}
            options={profileCloses.map((value) => ({
              value,
              label: close[value],
            }))}
            disabled={pending}
            onChange={(value) => {
              if (oneOf(value, profileCloses)) onPolicy({ cancel: value });
            }}
          />
          <Select
            label={text.exitPolicy}
            value={draft.policy.exit}
            options={profileCloses.map((value) => ({
              value,
              label: close[value],
            }))}
            disabled={pending}
            onChange={(value) => {
              if (oneOf(value, profileCloses)) onPolicy({ exit: value });
            }}
          />
          <Select
            label={text.retryPolicy}
            value={draft.policy.retry}
            options={profileRetries.map((value) => ({
              value,
              label: retry[value],
            }))}
            disabled={pending}
            onChange={(value) => {
              if (oneOf(value, profileRetries)) onPolicy({ retry: value });
            }}
          />
          <Input
            label={text.retries}
            description={text.retriesHelp}
            type="number"
            min={0}
            max={profileLimits.retries}
            value={draft.policy.retries}
            disabled={pending}
            onChange={(event) => {
              const retries = Number(event.currentTarget.value);
              if (
                Number.isInteger(retries) &&
                retries >= 0 &&
                retries <= profileLimits.retries
              )
                onPolicy({ retries });
            }}
          />
          <Input
            label={text.firstDelay}
            type="number"
            min={0}
            max={profileLimits.delay}
            value={draft.policy.firstStepDelay}
            disabled={pending}
            onChange={(event) => {
              const firstStepDelay = Number(event.currentTarget.value);
              if (
                Number.isInteger(firstStepDelay) &&
                firstStepDelay >= 0 &&
                firstStepDelay <= profileLimits.delay
              )
                onPolicy({ firstStepDelay });
            }}
          />
          <p>{resident ? text.resident : text.noResident}</p>
        </div>
      </section>
    </div>
  );
}

export function ArgumentLossDialog({
  count,
  changedRevision = false,
  onCancel,
  onConfirm,
}: {
  count: number;
  changedRevision?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <BaseAlertDialog.Root
      open={count > 0}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <BaseAlertDialog.Portal>
        <BaseAlertDialog.Backdrop className="v-backdrop" />
        <BaseAlertDialog.Popup className="v-dialog">
          <BaseAlertDialog.Title>
            {text.argumentLossTitle}
          </BaseAlertDialog.Title>
          <BaseAlertDialog.Description>
            {changedRevision
              ? text.argumentLossRevision(count)
              : text.argumentLoss(count)}
          </BaseAlertDialog.Description>
          <div className="v-launcher-actions">
            <Button onClick={onCancel}>{text.cancel}</Button>
            <Button variant="danger" onClick={onConfirm}>
              {text.confirmArgumentLoss}
            </Button>
          </div>
        </BaseAlertDialog.Popup>
      </BaseAlertDialog.Portal>
    </BaseAlertDialog.Root>
  );
}

export function DiscardProfileDialog({
  open,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <BaseAlertDialog.Root
      open={open}
      onOpenChange={(value) => {
        if (!value) onCancel();
      }}
    >
      <BaseAlertDialog.Portal>
        <BaseAlertDialog.Backdrop className="v-backdrop" />
        <BaseAlertDialog.Popup className="v-dialog">
          <BaseAlertDialog.Title>{text.discardTitle}</BaseAlertDialog.Title>
          <BaseAlertDialog.Description>
            {text.discardMessage}
          </BaseAlertDialog.Description>
          <div className="v-launcher-actions">
            <Button onClick={onCancel}>{text.keepEditing}</Button>
            <Button variant="danger" onClick={onConfirm}>
              {text.confirmDiscard}
            </Button>
          </div>
        </BaseAlertDialog.Popup>
      </BaseAlertDialog.Portal>
    </BaseAlertDialog.Root>
  );
}
