import type {
  AccountView,
  HostToUi,
  Preferences,
  Reply,
  ResidentView,
  TestingView,
  UpdatesView,
} from "../../../contract/generated/contract";
import type { Client, RequestObservation } from "../../bridge/client";
import { notices as text } from "../../i18n/notifications";
import type { Notice, NoticeInput } from "./center";

interface Sink {
  add: (notice: NoticeInput) => void;
  changeReports: (update: (records: Notice[]) => Notice[]) => void;
}
// One lifetime per connection. No identity, free-form service error or credential is retained.
export function connectEmitters(client: Client, sink: Sink) {
  let active = true;
  let preferences: Pick<Preferences, "updates" | "launcher"> | undefined;
  let resident: ResidentView | undefined;
  let generation = 0;
  let reportReady = false;
  const requests = new Map<number, number>();
  const failures = new Set<number>();
  const reset = () => {
    generation++;
    reportReady = false;
    sink.changeReports((records) =>
      records.filter((record) => record.source !== "report"),
    );
  };
  function account(value: AccountView) {
    const ready =
      value.gate === "none" &&
      value.session === "signedIn" &&
      value.verified &&
      !value.blocked;
    if (!ready && reportReady) reset();
    reportReady = ready;
  }
  function launcherFailed() {
    if (preferences?.launcher)
      sink.add({
        source: "launcher",
        severity: "error",
        dedupeKey: "launcher.failed",
        title: text.launchFailed,
        text: text.launchFailure,
        action: "launcher",
      });
  }
  function execution(value: ResidentView) {
    if (value.online && !value.protected) {
      if (value.error && !resident?.error) launcherFailed();
      else if (
        resident?.running &&
        !value.running &&
        !value.error &&
        !value.decision &&
        preferences?.launcher
      )
        sink.add({
          source: "launcher",
          severity: "info",
          dedupeKey: "launcher.ready",
          title: text.launchReady,
          text: text.launchReadyBody,
          action: "launcher",
        });
    }
    resident = value;
  }
  function updates(value: UpdatesView) {
    if (preferences?.updates && value.beta?.state === "ready")
      sink.add({
        source: "updater",
        severity: "info",
        dedupeKey: "updater.ready",
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
        event.method === "account.begin" ||
        event.method === "account.logout" ||
        event.method === "account.email"
      )
        reset();
      if (
        event.method.startsWith("testing.") ||
        event.method.startsWith("account.") ||
        event.method === "triage.send"
      )
        requests.set(event.id, generation);
      return;
    }
    const ownGeneration = requests.get(event.id);
    requests.delete(event.id);
    if (
      (event.method === "launcher.launch" ||
        event.method === "launcher.favorite") &&
      (event.error ||
        (event.reply && "accepted" in event.reply && !event.reply.accepted))
    ) {
      // Conflict/busy/denied already have an explanation in the initiating screen.
      if (
        !event.error ||
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
      event.method.startsWith("account.") &&
      ownGeneration === generation &&
      "value" in event.reply
    )
      account(event.reply.value as AccountView);
    if (event.reply && reportReady && ownGeneration === generation) {
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
        case "account":
          account(message.event.value);
          break;
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
  void client.request({ method: "account.get" }).catch(() => {});
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
      unobserve();
      unlisten();
      for (const dispose of disposers) dispose();
    },
  };
}
