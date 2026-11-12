import type {
  HostToUi,
  Preferences,
  Reply,
  ResidentView,
  TestingView,
  UpdatesView,
} from "../../../contract/generated/contract";
import type { AccountSession } from "../../app/AccountSession";
import type { Client, RequestObservation } from "../../bridge/client";
import { notices as text } from "../../i18n/notifications";
import type { Notice, NoticeInput } from "./center";

interface Sink {
  resetReports: () => void;
  add: (notice: NoticeInput) => void;
  changeReports: (update: (records: Notice[]) => Notice[]) => void;
}
// Requires AccountProvider's synchronous session boundary, including access intents
// before transport dispatch. One lifetime per connection; no identity is retained.
export function connectEmitters(
  client: Client,
  sink: Sink,
  session: AccountSession,
) {
  let active = true;
  let preferences: Pick<Preferences, "updates" | "launcher"> | undefined;
  let resident: ResidentView | undefined;
  let generation = session.getSnapshot().generation;
  let failureSequence = 0;
  let launcherFailure = false;
  let pendingResidentError = false;
  const requests = new Map<
    number,
    { generation: number; confirmed: boolean }
  >();
  const failures = new Set<number>();
  const unsession = session.subscribe(() => {
    if (generation !== session.getSnapshot().generation) {
      generation = session.getSnapshot().generation;
      sink.resetReports();
    }
  });
  function launcherFailed(residentError = false) {
    if (launcherFailure) return;
    launcherFailure = true;
    if (preferences?.launcher)
      sink.add({
        source: "launcher",
        severity: "error",
        dedupeKey: `launcher.failed:${++failureSequence}`,
        title: text.launchFailed,
        text: residentError ? text.residentFailure : text.launchFailure,
        action: "launcher",
      });
  }
  function flushResidentError() {
    if (!pendingResidentError || !preferences) return;
    pendingResidentError = false;
    launcherFailed(true);
  }
  function execution(value: ResidentView) {
    if (value.online && !value.protected) {
      if (value.error && !resident?.error) pendingResidentError = true;
      if (!value.error) {
        pendingResidentError = false;
        if (
          resident &&
          (!resident.online || resident.protected || resident.error)
        )
          launcherFailure = false;
      }
    }
    resident = value;
    flushResidentError();
  }
  function updates(value: UpdatesView) {
    if (preferences?.updates && value.beta?.state === "ready")
      sink.add({
        source: "updater",
        severity: "info",
        dedupeKey: `updater.ready:${value.beta.version}`,
        title: text.updateReady,
        text: text.updateReadyBody(value.beta.version),
        action: "settings:updates",
      });
  }
  function reports(value: TestingView) {
    sink.changeReports((records) =>
      records.map((record) =>
        record.source === "report" &&
        value.reports.some(
          (report) =>
            !report.notice &&
            record.dedupeKey.startsWith(`report:${report.id}:`),
        )
          ? { ...record, unread: false }
          : record,
      ),
    );
    for (const report of value.reports) {
      if (
        !report.notice ||
        (report.state !== "accepted" && report.state !== "fixed")
      )
        continue;
      sink.add({
        source: "report",
        severity: "info",
        dedupeKey: `report:${report.id}:${report.state}`,
        title:
          report.state === "fixed" ? text.reportFixed : text.reportAccepted,
        text:
          report.state === "fixed"
            ? text.reportFixedBody(report.fixedVersion)
            : text.reportAcceptedBody,
        action: "testing:reports",
      });
    }
  }
  function reply(value: Reply) {
    switch (value.method) {
      case "settings.get":
      case "settings.update":
      case "settings.retry":
      case "settings.discard":
        preferences = value.value.protected ? undefined : value.value.general;
        flushResidentError();
        break;
      case "updates.get":
        updates(value.value);
        break;
      case "launcher.resident.get":
        execution(value.value);
        break;
    }
  }
  const unobserve = client.observeRequests((event: RequestObservation) => {
    if (!active) return;
    if (event.phase === "start") {
      if (
        event.method.startsWith("testing.") ||
        event.method.startsWith("account.") ||
        event.method === "triage.send"
      )
        requests.set(event.id, session.getSnapshot());
      return;
    }
    const started = requests.get(event.id);
    requests.delete(event.id);
    if (event.method === "settings.update" && event.error?.kind === "conflict")
      reply({ method: "settings.get", value: event.error.current });
    if (
      (event.reply?.method === "launcher.launch" ||
        event.reply?.method === "launcher.favorite") &&
      event.reply.accepted
    )
      launcherFailure = false;
    if (
      (event.method === "launcher.launch" ||
        event.method === "launcher.favorite") &&
      event.error
    ) {
      // Conflict/busy/denied already have an explanation in the initiating screen.
      if (
        ["io", "coreUnavailable", "incompatible", "unsupported"].includes(
          event.error.kind,
        )
      ) {
        if (event.error && event.error.kind !== "coreUnavailable")
          failures.add(event.id);
        launcherFailed();
      }
    }
    if (
      event.reply &&
      session.getSnapshot().confirmed &&
      started?.confirmed &&
      started.generation === generation
    ) {
      switch (event.reply.method) {
        case "testing.refresh":
        case "testing.answer":
        case "testing.contribute":
        case "testing.credit":
        case "testing.noticeRead":
        case "triage.send":
          reports(event.reply.value);
      }
    }
  });
  const unlisten = client.listen((message: HostToUi) => {
    if (!active) return;
    if (message.kind === "event") {
      switch (message.event.topic) {
        case "launcherResident":
          execution(message.event.value);
          break;
        case "updates":
          updates(message.event.value);
          break;
      }
    } else if (message.kind === "response") {
      reply(message.result);
    }
  });
  const disposers = [
    client.subscribe("launcherResident"),
    client.subscribe("updates"),
  ];
  // Preferences must arrive before reading ready states; do not guess defaults.
  void client
    .request({ method: "settings.get" })
    .then(async () => {
      if (!active) return;
      await client.request({ method: "updates.get" });
    })
    .catch(() => {});
  return {
    ownsFailure: (id: number) => failures.delete(id),
    dispose: () => {
      active = false;
      requests.clear();
      unsession();
      unobserve();
      unlisten();
      for (const dispose of disposers) dispose();
    },
  };
}
