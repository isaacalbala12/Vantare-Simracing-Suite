import { useEffect, useRef, useState } from "react";
import { reportModules } from "../../../contract/generated/contract";
import { Button } from "../../ui/Button";
import { Callout } from "../../ui/Data";
import { Checkbox, Input, Select, Textarea } from "../../ui/Forms";
import { ActionGroup, ContentStack } from "../../ui/ShellLayout";
import {
  TestingCard,
  TestingFinePrint,
  TestingLayout,
  TestingNotes,
  TestingToolbar,
} from "../../ui/TestingLayout";
import { Diagnostics } from "../settings/Diagnostics";
import { testingText as text } from "./es";
import { useReports } from "./ReportsState";

export function Reports() {
  const state = useReports();
  const [view, setView] = useState<"local" | "compose" | "list" | "diagnostic">(
    "local",
  );
  const { available, loaded, load } = state;
  const loadCurrent = useRef(load);
  loadCurrent.current = load;
  useEffect(() => {
    let active = true;
    if (available && !loaded)
      queueMicrotask(() => {
        if (active) void loadCurrent.current().catch(() => {});
      });
    return () => {
      active = false;
    };
  }, [available, loaded]);
  function choose(value: typeof view) {
    state.setConsent(false);
    setView(value);
  }
  const run = (action: () => Promise<void>) => {
    void action().catch(() => {});
  };
  const blocked = !state.available || state.busy;
  return (
    <TestingLayout
      title={text.title}
      description={text.description}
      tools={
        <Button
          onClick={() => choose(view === "diagnostic" ? "local" : "diagnostic")}
        >
          {text.diagnostic}
        </Button>
      }
      toolbar={
        view !== "diagnostic" && (
          <TestingToolbar title={text.title}>
            <Button
              onClick={() => {
                choose(view === "list" ? "local" : "list");
                if (view !== "list") run(state.refresh);
              }}
            >
              {view === "list" ? text.newReport : text.myReports}
            </Button>
            <Button size="sm" onClick={() => choose("compose")}>
              {text.withScreenshots}
            </Button>
          </TestingToolbar>
        )
      }
    >
      {state.message && <Callout title={state.message} />}
      {state.error && (
        <Callout
          tone="err"
          title={
            state.failure === "coreUnavailable"
              ? text.offline
              : state.failure === "denied"
                ? text.denied
                : state.failure === "evidencePending"
                  ? text.evidencePending
                  : text.failed
          }
          actions={
            <ActionGroup>
              <Button
                disabled={blocked}
                onClick={() => run(state.loaded ? state.save : state.load)}
              >
                {text.retry}
              </Button>
              <Button disabled={blocked} onClick={() => run(state.discard)}>
                {text.discard}
              </Button>
            </ActionGroup>
          }
        />
      )}
      {view === "diagnostic" ? (
        <Diagnostics />
      ) : view === "list" ? (
        <TestingCard title={text.listTitle}>
          <TestingFinePrint>{text.listHelp}</TestingFinePrint>
          <Button disabled={blocked} onClick={() => run(state.refresh)}>
            {text.reload}
          </Button>
          {state.participation.reports.length ? (
            state.participation.reports.map((report) => (
              <TestingCard key={report.id} title={report.title}>
                <TestingFinePrint>{report.id}</TestingFinePrint>
                <p>
                  {text.states[report.state as keyof typeof text.states] ??
                    text.unknownState}
                </p>
                {report.fixedVersion && (
                  <p>{`${text.fixedIn} ${report.fixedVersion}`}</p>
                )}
                {state.access.tester && (
                  <>
                    <Checkbox
                      label={text.credit}
                      checked={report.credit}
                      disabled={blocked}
                      onCheckedChange={(consent) =>
                        run(() => state.credit(report.id, consent))
                      }
                    />
                    <TestingFinePrint>{text.creditHelp}</TestingFinePrint>
                  </>
                )}
                {report.notice && (
                  <Callout
                    title={
                      report.state === "fixed"
                        ? text.fixedNotice
                        : text.acceptedNotice
                    }
                    actions={
                      state.access.tester &&
                      report.updatedAt && (
                        <Button
                          disabled={blocked}
                          onClick={() =>
                            run(() =>
                              state.notice(report.id, report.updatedAt ?? ""),
                            )
                          }
                        >
                          {text.understood}
                        </Button>
                      )
                    }
                  />
                )}
              </TestingCard>
            ))
          ) : (
            <ContentStack>
              <strong>{text.empty}</strong>
              <p>{text.emptyHelp}</p>
            </ContentStack>
          )}
        </TestingCard>
      ) : view === "local" ? (
        <>
          <TestingCard title={text.helpTitle}>
            <p>{text.reloadHelp}</p>
            <Button disabled={blocked} onClick={() => run(state.refresh)}>
              {text.reload}
            </Button>
          </TestingCard>
          <TestingCard>
            <TestingNotes>
              <Input
                label={text.localTitle}
                value={state.fields.actionText}
                disabled={state.busy}
                onChange={(event) =>
                  state.edit({ actionText: event.currentTarget.value })
                }
              />
              <Textarea
                label={text.localBody}
                value={state.fields.observedText}
                disabled={state.busy}
                onChange={(event) =>
                  state.edit({ observedText: event.currentTarget.value })
                }
              />
            </TestingNotes>
            <ActionGroup>
              <Button
                disabled={
                  blocked || !state.consent || !state.loaded || state.dirty
                }
                onClick={() => run(state.contribute)}
              >
                {text.send}
              </Button>
            </ActionGroup>
            <Checkbox
              label={text.localConsent}
              checked={state.consent}
              onCheckedChange={state.setConsent}
              disabled={state.busy}
            />
            <TestingFinePrint>{text.localHelp}</TestingFinePrint>
          </TestingCard>
        </>
      ) : (
        <TestingCard title={text.compose}>
          <Select
            label={text.module}
            value={state.fields.module}
            options={reportModules.map(([value, label]) => ({ value, label }))}
            disabled={blocked}
            onChange={(module) => state.edit({ module })}
          />
          <Input
            label={text.action}
            value={state.fields.actionText}
            disabled={blocked}
            onChange={(event) =>
              state.edit({ actionText: event.currentTarget.value })
            }
          />
          <Textarea
            label={text.observed}
            value={state.fields.observedText}
            disabled={blocked}
            onChange={(event) =>
              state.edit({ observedText: event.currentTarget.value })
            }
          />
          <Textarea
            label={text.expected}
            value={state.fields.expectedText}
            disabled={blocked}
            onChange={(event) =>
              state.edit({ expectedText: event.currentTarget.value })
            }
          />
          <Textarea
            label={text.context}
            value={state.fields.contextText}
            disabled={blocked}
            onChange={(event) =>
              state.edit({ contextText: event.currentTarget.value })
            }
          />
          <ActionGroup>
            <Button
              disabled={blocked || !loaded}
              onClick={() => run(state.dirty ? state.save : state.prepare)}
            >
              {state.dirty ? text.save : text.prepare}
            </Button>
            <Button disabled={blocked} onClick={() => run(state.discard)}>
              {text.discard}
            </Button>
          </ActionGroup>
          {state.preview && (
            <ContentStack>
              <strong>{text.preview}</strong>
              <p>{state.preview.fields.actionText}</p>
              <p>{state.preview.fields.expectedText}</p>
              <p>{state.preview.fields.observedText}</p>
              <p>{state.preview.fields.contextText}</p>
              <TestingFinePrint>{`${state.preview.channel} · ${state.preview.appVersion} · ${state.preview.osVersion}`}</TestingFinePrint>
              <Checkbox
                label={text.consent}
                checked={state.consent}
                onCheckedChange={state.setConsent}
              />
              <Button
                disabled={blocked || !state.consent || state.dirty}
                onClick={() => run(state.send)}
              >
                {text.send}
              </Button>
            </ContentStack>
          )}
          <Button
            disabled={blocked}
            onClick={() => run(() => state.prepare(true))}
          >
            {text.retryPrepare}
          </Button>
        </TestingCard>
      )}
      {state.receipt && (
        <Callout title={text.received}>
          {state.receipt.id}
          {state.receipt.draftState === "cleanupPending"
            ? ` · ${text.cleanupPending}`
            : state.receipt.draftState === "preserved"
              ? ` · ${text.preserved}`
              : ""}
        </Callout>
      )}
    </TestingLayout>
  );
}
