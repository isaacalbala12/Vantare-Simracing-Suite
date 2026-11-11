import {
  type TriageItem,
  type TriagePreview,
  triageItems,
} from "../../contract/generated/triage";
import { testingTriageText as text } from "../i18n/testing-triage";
import { Button } from "./Button";
import { Checkbox, Input, Textarea } from "./Forms";
import { TestingCard, TestingFinePrint } from "./TestingLayout";
import "./testing-triage.css";

export function TriageEditorView({
  title,
  body,
  items,
  consent,
  preview,
  blocked,
  onTitle,
  onBody,
  onChoice,
  onConsent,
  onPrepare,
  onSend,
}: {
  title: string;
  body: string;
  items: TriageItem[];
  consent: boolean;
  preview?: TriagePreview;
  blocked: boolean;
  onTitle: (value: string) => void;
  onBody: (value: string) => void;
  onChoice: (item: TriageItem, checked: boolean) => void;
  onConsent: (value: boolean) => void;
  onPrepare: () => void;
  onSend: () => void;
}) {
  return (
    <div className="v-testing-triage">
      <TestingCard title={text.title}>
        <Input
          label={text.localTitle}
          placeholder={text.localTitle}
          value={title}
          onChange={(event) => onTitle(event.currentTarget.value)}
        />
        <Textarea
          label={text.localBody}
          placeholder={text.localBody}
          value={body}
          onChange={(event) => onBody(event.currentTarget.value)}
        />
        {triageItems.map((item) => (
          <Checkbox
            key={item}
            label={text.choices[item]}
            checked={items.includes(item)}
            onCheckedChange={(checked) => onChoice(item, checked)}
          />
        ))}
        <TestingFinePrint>{text.help}</TestingFinePrint>
        <Checkbox
          label={text.consent}
          checked={consent}
          onCheckedChange={onConsent}
        />
        <Button
          disabled={blocked || !consent}
          onClick={onPrepare}
          title={!consent ? text.waiting : undefined}
        >
          {text.prepare}
        </Button>
        {preview && (
          <>
            <pre className="v-testing-triage-preview" aria-label={text.preview}>
              {preview.payload}
            </pre>
            <Button
              variant="primary"
              disabled={blocked || !consent}
              onClick={onSend}
            >
              {text.send}
            </Button>
          </>
        )}
      </TestingCard>
    </div>
  );
}
