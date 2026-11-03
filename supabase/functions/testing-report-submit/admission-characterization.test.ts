import { handleTestingReportSubmit } from "./index.ts";
import { NativeError } from "../_shared/native-auth.ts";

const valid = {
  p_id: "16100000-0000-4000-8000-000000000099",
  p_channel: "master",
  p_title: "Synthetic",
  p_body: "Synthetic",
  p_consent: true,
};

function request(account: string, body: unknown = valid) {
  return new Request(
    "https://example.invalid/functions/v1/testing-report-submit",
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${account}`,
        "cf-connecting-ip": "192.0.2.131",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
}

Deno.test("VANTA-131 step 2: authenticated malformed body and exact retry spare IP and account quota", async () => {
  const counts = new Map<string, number>();
  const admitted = new Map<string, string>();
  const deps = {
    now: () => new Date("2026-10-14T12:00:00Z"),
    salt: "synthetic-test-salt-only-32-characters",
    account: (req: Request) =>
      Promise.resolve(req.headers.get("authorization")!.slice(7)),
    admit: (
      scope: string,
      subject: string,
      _week: string,
      key?: string,
      digest?: string,
    ) => {
      if (scope === "account") {
        const previous = admitted.get(`${subject}:${key}`);
        if (previous === digest) return Promise.resolve(true);
        if (previous !== undefined) throw new NativeError(409, "submit_failed");
        admitted.set(`${subject}:${key}`, digest!);
      }
      const counterKey = `${scope}:${subject}`;
      counts.set(counterKey, (counts.get(counterKey) ?? 0) + 1);
      return Promise.resolve(true);
    },
    submit: () => Promise.resolve(),
  };
  if (
    (await handleTestingReportSubmit(
      request("account-a", { ...valid, p_consent: false }),
      deps,
    )).status !== 400
  ) {
    throw new Error("malformed body must be rejected");
  }
  if (
    (await handleTestingReportSubmit(request("account-a"), deps)).status !== 200
  ) {
    throw new Error("first report must be accepted");
  }
  if (
    (await handleTestingReportSubmit(request("account-a"), deps)).status !== 200
  ) {
    throw new Error("exact retry must be accepted");
  }
  if (
    (await handleTestingReportSubmit(
      request("account-a", { ...valid, p_body: "Changed" }),
      deps,
    )).status !== 409
  ) {
    throw new Error("changed body must not borrow a previously admitted key");
  }
  const ip = [...counts.entries()].find(([key]) => key.startsWith("ip:"))?.[1];
  if (ip !== undefined || counts.get("account:account-a") !== 1) {
    throw new Error(
      `invalid body and exact retry must spare account quota: ip=${ip}, account=${
        counts.get("account:account-a")
      }`,
    );
  }
});
