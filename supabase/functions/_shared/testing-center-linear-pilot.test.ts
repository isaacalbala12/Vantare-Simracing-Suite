import {
  handleTestingCenterLinearPilotRequest,
  type TestingCenterLinearPilotStore,
} from "./testing-center-linear-pilot.ts";
import { TESTING_CENTER_LINEAR_PROJECTION_VERSION } from "./testing-center-linear-projection.ts";

const effectId = `effect_${"1".repeat(64)}`;
const issueId = `issue_${"2".repeat(64)}`;
const reportId = `report_${"4".repeat(64)}`;

function source() {
  return {
    contractVersion: TESTING_CENTER_LINEAR_PROJECTION_VERSION,
    effectId,
    technicalIssueId: issueId,
    sourceDigest: "3".repeat(64),
    occurrenceCount: 2,
    replayAvailable: false,
    report: {
      reportId,
      channel: "nightly" as const,
      appVersion: "0.1.0-nightly",
      osFamily: "windows" as const,
      osVersion: "Windows 11",
      module: "testing_center" as const,
      actionText: "Abrir el Testing Center",
      expectedText: "Ver la candidatura",
      observedText: "La lista queda vacía",
      contextText: null,
      errorCode: null,
      candidateSha: "5".repeat(40),
    },
  };
}

function request(secret = "s".repeat(32)) {
  return new Request("https://example.test/pilot", {
    method: "POST",
    headers: {
      authorization: `Bearer ${secret}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      contractVersion: "testing-center.linear-pilot.v1",
      reportId,
    }),
  });
}

function store(events: string[]): TestingCenterLinearPilotStore {
  return {
    triage() {
      events.push("triage");
      return Promise.resolve({ effectId });
    },
    prepare() {
      events.push("prepare");
      return Promise.resolve({ status: "prepared", source: source() });
    },
    claim() {
      events.push("claim");
      return Promise.resolve({ status: "claimed", fencingToken: 7 });
    },
    assertDispatch() {
      events.push("assert");
      return Promise.resolve();
    },
    complete() {
      events.push("complete");
      return Promise.resolve();
    },
    retry() {
      events.push("retry");
      return Promise.resolve();
    },
    ambiguous() {
      events.push("ambiguous");
      return Promise.resolve();
    },
  };
}

Deno.test("pilot gates projection before one external create and atomic completion", async () => {
  const events: string[] = [];
  const response = await handleTestingCenterLinearPilotRequest(request(), {
    store: store(events),
    pilotSecret: "s".repeat(32),
    workerId: "isa243-linear-pilot",
    dispatch() {
      events.push("dispatch");
      return Promise.resolve({
        status: "created",
        issue: {
          externalIssueId: "10000000-0000-4000-8000-000000000001",
          organizationId: "10000000-0000-4000-8000-000000000002",
          identifier: "ISA-999",
          url: "https://linear.app/vantareapp/issue/ISA-999/testing-center",
        },
      });
    },
  });
  if (response.status !== 200) throw new Error(await response.text());
  if (events.join(",") !== "triage,prepare,claim,assert,dispatch,complete") {
    throw new Error(`unexpected sequence: ${events.join(",")}`);
  }
});

Deno.test("pause prevents claim and external side effect", async () => {
  const events: string[] = [];
  const paused = store(events);
  paused.claim = () => Promise.resolve({ status: "paused", fencingToken: 0 });
  const response = await handleTestingCenterLinearPilotRequest(request(), {
    store: paused,
    pilotSecret: "s".repeat(32),
    workerId: "isa243-linear-pilot",
    dispatch() {
      throw new Error("must not dispatch");
    },
  });
  if (response.status !== 409 || events.join(",") !== "triage,prepare") {
    throw new Error("pause did not stop the pilot");
  }
});

Deno.test("post-create uncertainty is terminal and never retried", async () => {
  const events: string[] = [];
  const response = await handleTestingCenterLinearPilotRequest(request(), {
    store: store(events),
    pilotSecret: "s".repeat(32),
    workerId: "isa243-linear-pilot",
    dispatch: () =>
      Promise.resolve({
        status: "ambiguous",
        errorCode: "linear_response_ambiguous",
        diagnostic: {
          contractVersion: "testing-center.linear-diagnostic.v1",
          detailCode: "issue_create_graphql_rejected",
          httpStatus: 400,
          graphqlErrorCodes: ["UNKNOWN"],
        },
      }),
  });
  const body = await response.json();
  if (
    response.status !== 409 || events.at(-1) !== "ambiguous" ||
    events.includes("retry") || body.code !== "linear_response_ambiguous" ||
    body.diagnostic?.detailCode !== "issue_create_graphql_rejected" ||
    body.diagnostic?.httpStatus !== 400 ||
    body.diagnostic?.graphqlErrorCodes?.join(",") !== "UNKNOWN"
  ) throw new Error("ambiguous create was retried");
});

Deno.test("ambiguous diagnostic is canonicalized at the HTTP boundary", async () => {
  const events: string[] = [];
  const response = await handleTestingCenterLinearPilotRequest(request(), {
    store: store(events),
    pilotSecret: "s".repeat(32),
    workerId: "isa243-linear-pilot",
    dispatch: () =>
      Promise.resolve({
        status: "ambiguous",
        errorCode: "linear_response_ambiguous",
        diagnostic: {
          contractVersion: "malicious-contract",
          detailCode: "private_detail_code",
          httpStatus: 999,
          graphqlErrorCodes: ["PRIVATE", "RATELIMITED", "PRIVATE_2"],
          message: "private tester text",
          path: ["issueCreate"],
          extensions: { token: "private-token" },
        },
      } as never),
  });
  const body = await response.json();
  const serialized = JSON.stringify(body);
  const diagnosticKeys = Object.keys(body.diagnostic ?? {}).sort().join(",");
  if (
    response.status !== 409 || events.at(-1) !== "ambiguous" ||
    events.includes("retry") ||
    diagnosticKeys !==
      "contractVersion,detailCode,graphqlErrorCodes,httpStatus" ||
    body.diagnostic?.contractVersion !==
      "testing-center.linear-diagnostic.v1" ||
    body.diagnostic?.detailCode !== "dispatch_exception" ||
    body.diagnostic?.httpStatus !== null ||
    body.diagnostic?.graphqlErrorCodes?.join(",") !== "RATELIMITED,UNKNOWN" ||
    serialized.includes("private tester text") ||
    serialized.includes("private-token") || serialized.includes("issueCreate")
  ) {
    throw new Error(
      "diagnostic crossed the HTTP boundary without sanitization",
    );
  }
});

Deno.test("unexpected dispatch exception is also terminal ambiguity", async () => {
  const events: string[] = [];
  const privateError = "private dispatch error with tester text";
  const response = await handleTestingCenterLinearPilotRequest(request(), {
    store: store(events),
    pilotSecret: "s".repeat(32),
    workerId: "isa243-linear-pilot",
    dispatch: () => Promise.reject(new Error(privateError)),
  });
  const body = await response.json();
  if (
    response.status !== 409 || events.at(-1) !== "ambiguous" ||
    events.includes("retry") || body.code !== "linear_response_ambiguous" ||
    body.diagnostic?.detailCode !== "dispatch_exception" ||
    body.diagnostic?.httpStatus !== null ||
    JSON.stringify(body).includes(privateError)
  ) throw new Error("unexpected dispatch failure was allowed to retry");
});

Deno.test("token acquisition failure schedules bounded retry before mutation", async () => {
  const events: string[] = [];
  const response = await handleTestingCenterLinearPilotRequest(request(), {
    store: store(events),
    pilotSecret: "s".repeat(32),
    workerId: "isa243-linear-pilot",
    dispatch: () =>
      Promise.resolve({
        status: "retryable",
        errorCode: "linear_token_transport_unavailable",
      }),
  });
  if (response.status !== 503 || events.at(-1) !== "retry") {
    throw new Error("safe token failure did not schedule retry");
  }
});

Deno.test("pilot requires its dedicated secret before reading the outbox", async () => {
  const events: string[] = [];
  const response = await handleTestingCenterLinearPilotRequest(
    request("x".repeat(32)),
    {
      store: store(events),
      pilotSecret: "s".repeat(32),
      workerId: "isa243-linear-pilot",
      dispatch: () => Promise.reject(new Error("must not dispatch")),
    },
  );
  if (response.status !== 401 || events.length !== 0) {
    throw new Error("unauthorized pilot reached durable state");
  }
});
