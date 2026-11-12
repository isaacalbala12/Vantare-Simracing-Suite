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
import { TestingCard, TestingFinePrint } from "./TestingLayout";
import "./testing-report.css";

interface Props {
  fields: ReportFields;
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
  return (
    <div className="v-testing-report">
      <div className="v-testing-report-draft-actions">
        <Button disabled={p.requestBlocked} onClick={p.onLoad}>
          {text.loadDraft}
        </Button>
        <Button disabled={p.requestBlocked} onClick={p.onRetry}>
          {text.pending}
        </Button>
      </div>
      <TestingCard title={text.compose}>
        <div className="v-testing-report-module">
          <Select
            label={text.module}
            value={p.fields.module}
            options={reportModules.map(([value, label]) => ({ value, label }))}
            disabled={p.editBlocked}
            onChange={(module) => p.onEdit({ module })}
          />
          <fieldset className="v-testing-report-kind" aria-label={text.kind}>
            <Button
              aria-pressed={!p.suggestion}
              disabled={p.editBlocked || !p.canChooseBug}
              title={!p.canChooseBug ? text.kindLimit : undefined}
              onClick={() => p.onKind(false)}
            >
              {text.bug}
            </Button>
            <Button
              aria-pressed={p.suggestion}
              disabled={p.editBlocked || !p.canChooseSuggestion}
              title={!p.canChooseSuggestion ? text.kindLimit : undefined}
              onClick={() => p.onKind(true)}
            >
              {text.suggestion}
            </Button>
          </fieldset>
        </div>
        <Input
          label={text.action}
          value={p.fields.actionText}
          disabled={p.editBlocked}
          onChange={(e) => p.onEdit({ actionText: e.currentTarget.value })}
        />
        <Textarea
          label={text.observed}
          value={p.fields.observedText}
          disabled={p.editBlocked}
          onChange={(e) => p.onEdit({ observedText: e.currentTarget.value })}
        />
        <TestingFinePrint>{text.notes}</TestingFinePrint>
        <div className="v-testing-report-pair">
          <Textarea
            label={text.expected}
            value={p.fields.expectedText}
            disabled={p.editBlocked}
            onChange={(e) => p.onEdit({ expectedText: e.currentTarget.value })}
          />
          <Textarea
            label={text.context}
            value={p.fields.contextText}
            disabled={p.editBlocked}
            onChange={(e) => p.onEdit({ contextText: e.currentTarget.value })}
          />
        </div>
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
                    disabled={p.requestBlocked}
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
          <div className="v-testing-report-preview">
            <strong>{text.preview}</strong>
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
          </div>
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
      </TestingCard>
    </div>
  );
}
