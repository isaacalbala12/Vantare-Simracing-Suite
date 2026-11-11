import { useEffect, useRef, useState } from "react";
import { reportModules } from "../../../contract/generated/contract";
import { testingSummaryText } from "../../i18n/testing-summary";
import { Button } from "../../ui/Button";
import { Callout } from "../../ui/Data";
import { DiscardReportDialog } from "../../ui/DiscardReportDialog";
import { Checkbox, Input, Select, Textarea } from "../../ui/Forms";
import { SessionReportReceipts } from "../../ui/SessionReportReceipts";
import { ActionGroup, ContentStack } from "../../ui/ShellLayout";
import {
  TestingCard,
  TestingFinePrint,
  TestingLayout,
  TestingNotes,
  TestingToolbar,
} from "../../ui/TestingLayout";
import { testingText as text } from "./es";
import { LocalDiagnostic } from "./LocalDiagnostic";
import { useReports } from "./ReportsState";
import { TriageEditor } from "./TriageEditor";

export type ReportsView = "local" | "compose" | "list" | "diagnostic";

export function Reports({
  view: selectedView,
  onViewChange,
}: {
  view?: ReportsView;
  onViewChange?: (view: ReportsView) => void;
} = {}) {
  const state = useReports();
  const [discardOpen, setDiscardOpen] = useState(false);
  const [internalView, setInternalView] = useState<ReportsView>("local");
  const view = selectedView ?? internalView;
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
    setInternalView(value);
    onViewChange?.(value);
  }
  const run = (action: () => Promise<void>) => {
    void action().catch(() => {});
  };
  const blocked = !state.available || state.busy;
  return (
    <TestingLayout
      title={state.access.tester ? text.sectionTitle : text.title}
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
      <DiscardReportDialog
        open={discardOpen}
        disabled={blocked}
        onCancel={() => setDiscardOpen(false)}
        onConfirm={() => {
          setDiscardOpen(false);
          run(state.discard);
        }}
      />
      {state.legacy !== "none" && <Callout title={text.legacy[state.legacy]} />}
      {state.message && (
        <Callout
          title={state.message}
          actions={
            state.closeBlocked ? (
              <Button onClick={state.askCloseWithoutSave}>
                {text.closeWithoutSave}
              </Button>
            ) : undefined
          }
        />
      )}
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
              <Button disabled={blocked} onClick={() => run(state.retry)}>
                {text.retry}
              </Button>
              <Button disabled={blocked} onClick={() => setDiscardOpen(true)}>
                {text.discard}
              </Button>
            </ActionGroup>
          }
        />
      )}
      {view === "diagnostic" ? (
        <LocalDiagnostic />
      ) : view === "list" ? (
        <ReportsPanel />
) : view === "local" && state.access.tester ? (
          <TriageEditor />
      ) : view === "local" ? (
        <>
          <TestingCard title={text.helpTitle}>
            <p>
              {state.participationLoaded
                ? testingSummaryText.loaded
                : text.reloadHelp}
            </p>
            <Button disabled={blocked} onClick={() => run(state.refresh)}>
              {text.reload}
            </Button>
          </TestingCard>
          <TestingCard>
            <TestingNotes>
              <Input
                label={text.localTitle}
                value={state.localNotes.title}
                disabled={state.busy}
                onChange={(event) =>
                  state.editLocal({ title: event.currentTarget.value })
                }
              />
              <Textarea
                label={text.localBody}
                value={state.localNotes.body}
                disabled={state.busy}
                onChange={(event) =>
                  state.editLocal({ body: event.currentTarget.value })
                }
              />
            </TestingNotes>
            <ActionGroup>
              <Button
                variant="primary"
                disabled={blocked || !state.consent || state.access.tester}
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
            <Button disabled={blocked} onClick={() => setDiscardOpen(true)}>
              {text.discard}
            </Button>
          </ActionGroup>
          {state.preview && (
            <ContentStack>
              <strong>{text.preview}</strong>
              <p>{`${text.module}: ${reportModules.find(([id]) => id === state.preview?.fields.module)?.[1] ?? state.preview.fields.module}`}</p>
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
                variant="primary"
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

export function ReportsPanel() {
  const state = useReports();
  const blocked = !state.available || state.busy;
  const run = (action: () => Promise<void>) => {
    void action().catch(() => {});
  };
  return (
    <TestingCard title={text.listTitle}>
      <TestingFinePrint>{text.listHelp}</TestingFinePrint>
      <p>
        {state.participationLoaded
          ? testingSummaryText.loaded
          : text.reloadHelp}
      </p>
      {state.error && (
        <Callout
          tone="err"
          title={
            state.failure === "coreUnavailable"
              ? text.offline
              : state.failure === "denied"
                ? text.denied
                : text.failed
          }
        />
      )}
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
      {state.sessionReceipts.length > 0 && (
        <SessionReportReceipts
          receipts={state.sessionReceipts}
          reports={state.participation.reports}
          blocked={blocked}
          onRefresh={() => run(state.refresh)}
        />
      )}
    </TestingCard>
  );
}
