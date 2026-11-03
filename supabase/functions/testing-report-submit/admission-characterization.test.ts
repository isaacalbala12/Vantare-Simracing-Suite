import { handleTestingReportSubmit } from "./index.ts";

const valid = {
  p_id: "16100000-0000-4000-8000-000000000099",
  p_channel: "master",
  p_title: "Synthetic",
  p_body: "Synthetic",
  p_consent: true,
};

function request(account: string, body: unknown = valid) {
  return new Request("https://example.invalid/functions/v1/testing-report-submit", {
    method: "POST",
    headers: {
      authorization: `Bearer ${account}`,
      "cf-connecting-ip": "192.0.2.131",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

Deno.test("VANTA-131 step 2: malformed body and exact retry currently spend both quotas", async () => {
  const counts = new Map<string, number>();
  const deps = {
    now: () => new Date("2026-10-14T12:00:00Z"),
    salt: "synthetic-test-salt-only-32-characters",
    account: (req: Request) => Promise.resolve(req.headers.get("authorization")!.slice(7)),
    admit: (scope: string, subject: string, _week: string) => {
      const key = `${scope}:${subject}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
      return Promise.resolve(true);
    },
    submit: () => Promise.resolve(),
  };
  if ((await handleTestingReportSubmit(request("account-a", { ...valid, p_consent: false }), deps)).status !== 400) {
    throw new Error("malformed body must be rejected");
  }
  if ((await handleTestingReportSubmit(request("account-a"), deps)).status !== 200) {
    throw new Error("first report must be accepted");
  }
  if ((await handleTestingReportSubmit(request("account-a"), deps)).status !== 200) {
    throw new Error("exact retry must be accepted");
  }
  const ip = [...counts.entries()].find(([key]) => key.startsWith("ip:"))?.[1];
  if (ip !== 3 || counts.get("account:account-a") !== 3) {
    throw new Error(`current admission must count every request: ip=${ip}, account=${counts.get("account:account-a")}`);
  }
});
