import { useId, useLayoutEffect, useState } from "react";
import type { TestingView } from "../../contract/generated/contract";
import { testingAnswerNoteMaxChars } from "../../contract/generated/contract";
import { testingQuestionnairesText as text } from "../i18n/testing-questionnaires";
import { Button } from "./Button";
import { Textarea } from "./Forms";
import {
  TestingCard,
  TestingFinePrint,
  TestingRailLayout,
  TestingRailSection,
} from "./TestingLayout";
import "./testing-questionnaires.css";

export function TestingQuestionnairesView({
  data,
  selected,
  score,
  note,
  blocked,
  onSelect,
  onScore,
  onNote,
  onSave,
}: {
  data: TestingView["questionnaires"];
  selected?: string;
  score: number;
  note: string;
  blocked: boolean;
  onSelect: (id: string) => void;
  onScore: (score: number) => void;
  onNote: (note: string) => void;
  onSave: () => void;
}) {
  const item = data.find((item) => item.id === selected);
  const noteId = useId();
  const [invalidQuestion, setInvalidQuestion] = useState<string>();
  const [validationAttempt, setValidationAttempt] = useState(0);
  const tooLong = Array.from(note).length > testingAnswerNoteMaxChars;
  useLayoutEffect(() => {
    if (validationAttempt) document.getElementById(noteId)?.focus();
  }, [validationAttempt, noteId]);
  return (
    <div className="v-testing-questionnaires">
      <TestingCard>
        {data.length ? (
          data.map((item) => (
            <Button
              key={item.id}
              onClick={() => onSelect(item.id)}
            >{`${item.version} · ${item.title} · ${item.score === null ? text.unanswered : text.answered}`}</Button>
          ))
        ) : (
          <p>{text.empty}</p>
        )}
      </TestingCard>
      {item && (
        <TestingCard>
          <h3>{item.question}</h3>
          <TestingFinePrint>{text.scale}</TestingFinePrint>
          <div className="v-testing-questionnaire-scores">
            {text.scores.map((value) => (
              <Button
                key={value}
                aria-pressed={score === value}
                onClick={() => onScore(value)}
              >{`${value}${score === value ? " ✓" : ""}`}</Button>
            ))}
          </div>
          <Textarea
            id={noteId}
            label={text.note}
            value={note}
            description={text.noteLimit(testingAnswerNoteMaxChars)}
            error={
              invalidQuestion === selected && tooLong
                ? text.noteTooLong(testingAnswerNoteMaxChars)
                : undefined
            }
            onChange={(event) => onNote(event.currentTarget.value)}
          />
          <Button
            variant="primary"
            disabled={blocked}
            onClick={() => {
              if (tooLong) {
                setInvalidQuestion(selected);
                setValidationAttempt((attempt) => attempt + 1);
                return;
              }
              onSave();
            }}
          >
            {text.save}
          </Button>
          <TestingFinePrint>{text.help}</TestingFinePrint>
        </TestingCard>
      )}
    </div>
  );
}
export function TestingQuestionnairesRail({ count }: { count: number }) {
  return (
    <TestingRailLayout>
      <TestingRailSection title={text.openClosed}>
        <p>{`${count} ${text.count}`}</p>
      </TestingRailSection>
      <TestingRailSection title={text.results} icon="pulse">
        <p>{text.resultsHelp}</p>
      </TestingRailSection>
    </TestingRailLayout>
  );
}
