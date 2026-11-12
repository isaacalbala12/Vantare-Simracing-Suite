import { useId, useLayoutEffect, useRef } from "react";
import type {
  ReportFields,
  ReportPreviewView,
  ReportScreenshot,
} from "../../contract/generated/testing";
import {
  reportModules,
  reportScreenshotLimits,
  reportScreenshotsAvailable,
} from "../../contract/generated/testing";
import { reportText as text } from "../i18n/testing-report";
import { Button } from "./Button";
import { Checkbox, Input, Select, Textarea } from "./Forms";
import {
  TestingComposeCard,
  TestingFieldPair,
  TestingFinePrint,
} from "./TestingLayout";
import "./testing-report.css";

interface Props {
  fields: ReportFields;
  errors: Partial<Record<keyof ReportFields, string>>;
  screenshots: ReportScreenshot[];
  preview?: ReportPreviewView;
  consent: boolean;
  dirty: boolean;
  draftExists: boolean;
  editBlocked: boolean;
  requestBlocked: boolean;
  saveBlocked: boolean;
  prepareBlocked: boolean;
  suggestion: boolean;
  canChooseBug: boolean;
  canChooseSuggestion: boolean;
  onEdit: (patch: Partial<ReportFields>) => void;
  onKind: (suggestion: boolean) => void;
  onLoad: () => void;
  onRetry: () => void;
  onSave: () => void;
  onPrepare: () => void;
  onDiscard: () => void;
  onConsent: (consent: boolean) => void;
  onSend: () => void;
  onRemove: (id: string) => void;
}
export function ReportComposerView(p: Props) {
  const kindHelp = useId();
  const loadHelp = useId();
  const root = useRef<HTMLDivElement>(null);
  const lastFocus = useRef<HTMLElement | null>(null);
  const previousPreview = useRef(p.preview);
  useLayoutEffect(() => {
    const newPreview = p.preview && previousPreview.current !== p.preview;
    const lostFocus =
      lastFocus.current &&
      document.activeElement === document.body &&
      !p.requestBlocked;
    const removedControl = lastFocus.current && !lastFocus.current.isConnected;
    if (newPreview || removedControl || lostFocus) {
      const target = root.current?.querySelector<HTMLElement>(
        newPreview
          ? ".v-testing-report-preview"
          : ".v-testing-report-preview, .v-input:not(:disabled)",
      );
      target?.focus();
    }
    previousPreview.current = p.preview;
  });
  return (
    <div
      className="v-testing-report"
      ref={root}
      onFocusCapture={(event) => {
        lastFocus.current = event.target as HTMLElement;
      }}
    >
      <div className="v-testing-report-draft-actions">
        <Button
          disabled={p.requestBlocked || p.dirty}
          aria-describedby={p.dirty ? loadHelp : undefined}
          onClick={p.onLoad}
        >
          {text.loadDraft}
        </Button>
        <Button disabled={p.requestBlocked} onClick={p.onRetry}>
          {text.pending}
        </Button>
      </div>
      {p.dirty && (
        <p className="v-testing-fine-print" id={loadHelp}>
          {text.loadDirty}
        </p>
      )}
      <TestingComposeCard title={text.compose}>
        <div className="v-testing-report-module">
          <Select
            label={text.module}
            value={p.fields.module}
            options={reportModules.map(([value, label]) => ({ value, label }))}
            disabled={p.editBlocked}
            onChange={(module) => p.onEdit({ module })}
          />
          <fieldset
            className="v-testing-report-kind"
            aria-label={text.kind}
            aria-describedby={
              !p.canChooseBug || !p.canChooseSuggestion ? kindHelp : undefined
            }
          >
            <Button
              aria-pressed={!p.suggestion}
              disabled={p.editBlocked || !p.canChooseBug}
              aria-describedby={!p.canChooseBug ? kindHelp : undefined}
              onClick={() => p.onKind(false)}
            >
              {text.bug}
            </Button>
            <Button
              aria-pressed={p.suggestion}
              disabled={p.editBlocked || !p.canChooseSuggestion}
              aria-describedby={!p.canChooseSuggestion ? kindHelp : undefined}
              onClick={() => p.onKind(true)}
            >
              {text.suggestion}
            </Button>
          </fieldset>
        </div>
        {(!p.canChooseBug || !p.canChooseSuggestion) && (
          <p id={kindHelp} className="v-error">
            {text.kindLimit}
          </p>
        )}
        <Input
          error={p.errors.actionText}
          label={text.action}
          value={p.fields.actionText}
          disabled={p.editBlocked}
          onChange={(e) => p.onEdit({ actionText: e.currentTarget.value })}
        />
        <Textarea
          error={p.errors.observedText}
          label={text.observed}
          value={p.fields.observedText}
          disabled={p.editBlocked}
          onChange={(e) => p.onEdit({ observedText: e.currentTarget.value })}
        />
        <TestingFinePrint>{text.notes}</TestingFinePrint>
        <TestingFieldPair>
          <Textarea
            error={p.errors.expectedText}
            label={text.expected}
            value={p.fields.expectedText}
            disabled={p.editBlocked}
            onChange={(e) => p.onEdit({ expectedText: e.currentTarget.value })}
          />
          <Textarea
            error={p.errors.contextText}
            label={text.context}
            value={p.fields.contextText}
            disabled={p.editBlocked}
            onChange={(e) => p.onEdit({ contextText: e.currentTarget.value })}
          />
        </TestingFieldPair>
        {p.dirty ? (
          <div className="v-testing-report-inline-action">
            <Button disabled={p.saveBlocked} onClick={p.onSave}>
              {text.save}
            </Button>
          </div>
        ) : p.fields.actionText.trim() && !p.preview ? (
          <div className="v-testing-report-inline-action">
            <Button disabled={p.prepareBlocked} onClick={p.onPrepare}>
              {text.prepare}
            </Button>
          </div>
        ) : null}
        <div className="v-testing-report-screenshots">
          <h3>{`${text.screenshots} · ${p.screenshots.length}/${reportScreenshotLimits.count}`}</h3>
          {p.screenshots.length > 0 && (
            <div className="v-testing-report-images">
              {p.screenshots.map((shot, index) => (
                <div key={shot.id}>
                  <img
                    src={`data:image/jpeg;base64,${shot.jpeg}`}
                    alt={`${text.screenshot} ${index + 1}`}
                  />
                  <TestingFinePrint>{`${shot.width} × ${shot.height} · ${Math.ceil(shot.byteSize / 1024)} KiB`}</TestingFinePrint>
                  <Button
                    disabled={p.saveBlocked}
                    onClick={() => p.onRemove(shot.id)}
                  >
                    {text.removeScreenshot}
                  </Button>
                </div>
              ))}
            </div>
          )}
          {!reportScreenshotsAvailable && (
            <TestingFinePrint>{text.screenshotsUnavailable}</TestingFinePrint>
          )}
        </div>
        <div className="v-testing-report-metadata">
          <TestingFinePrint>
            {p.preview
              ? `${p.preview.appVersion} · ${p.preview.osVersion} · ${text.metadata}`
              : text.metadataPending}
          </TestingFinePrint>
          <Button disabled title={text.logsHelp}>
            {text.logs}
          </Button>
        </div>
        {p.preview && (
          <section
            className="v-testing-report-preview"
            aria-label={text.preview}
            aria-live="polite"
            tabIndex={-1}
          >
            <strong>{text.preview}</strong>
            <TestingFinePrint>{`${text.screenshots} · ${p.preview.screenshots.length}/${reportScreenshotLimits.count}`}</TestingFinePrint>
            {p.preview.retry && (
              <TestingFinePrint>{text.retryOriginal}</TestingFinePrint>
            )}
            <p>{`${text.module}: ${reportModules.find(([id]) => id === p.preview?.fields.module)?.[1] ?? p.preview.fields.module}`}</p>
            <p>{p.preview.fields.actionText}</p>
            <p>{p.preview.fields.expectedText}</p>
            <p>{p.preview.fields.observedText}</p>
            <p>{p.preview.fields.contextText}</p>
            <TestingFinePrint>{`${p.preview.channel} · ${p.preview.appVersion} · ${p.preview.osVersion}`}</TestingFinePrint>
            <Checkbox
              label={text.consent}
              checked={p.consent}
              disabled={p.requestBlocked || p.dirty}
              onCheckedChange={p.onConsent}
            />
          </section>
        )}
        <div className="v-testing-report-final-actions">
          <Button
            disabled={p.requestBlocked || (!p.dirty && !p.draftExists)}
            onClick={p.onDiscard}
          >
            {text.discard}
          </Button>
          <Button
            className="v-testing-report-send"
            variant="primary"
            disabled={p.requestBlocked || !p.preview || !p.consent || p.dirty}
            onClick={p.onSend}
          >
            {text.send}
          </Button>
        </div>
      </TestingComposeCard>
    </div>
  );
}
