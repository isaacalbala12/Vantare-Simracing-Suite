import {
  testPrivateJwk,
  testPublicJwk,
} from "../native-account-authorize/testdata/signing.ts";
import {
  handleTestingReportSubmit,
  ipDigest,
  requireHostedGateway,
  verifyBridgeAccount,
} from "./index.ts";
import { signDataToken } from "../native-account-authorize/index.ts";
import { NativeError } from "../_shared/native-auth.ts";

function eq(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `expected ${JSON.stringify(expected)}, received ${
        JSON.stringify(actual)
      }`,
    );
  }
}
const week = "2026-10-12";
const payload = {
  p_id: "16100000-0000-4000-8000-000000000011",
  p_channel: "master",
  p_title: "Synthetic",
  p_body: "Synthetic",
  p_consent: true,
};
function fixture() {
  const counts = new Map<string, number>();
  const reports: unknown[] = [];
  return {
    counts,
    reports,
    deps: {
      now: () => new Date("2026-10-14T12:00:00Z"),
      salt: "synthetic-test-salt-only-32-characters",
      account: (request: Request) =>
        Promise.resolve(request.headers.get("authorization")!.slice(7)),
      admit: (scope: string, key: string, _week: string) => {
        const k = scope + key;
        const n = (counts.get(k) ?? 0) + 1;
        counts.set(k, n);
        return Promise.resolve(n <= 5);
      },
      submit: (account: string, body: Record<string, unknown>) => {
        reports.push({ account, body });
        return Promise.resolve();
      },
    },
  };
}
function request(
  account: string,
  ip = "192.0.2.10",
  body: unknown = payload,
  forwarded = "198.51.100.1",
) {
  return new Request(
    "https://example.invalid/functions/v1/testing-report-submit",
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${account}`,
        "cf-connecting-ip": ip,
        "x-forwarded-for": forwarded,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
}
Deno.test("F1: two accounts share IP; spoofed XFF cannot reset budget; normal submission works", async () => {
  const f = fixture();
  for (let i = 0; i < 5; i++) {
    eq(
      (await handleTestingReportSubmit(
        request(
          i % 2 ? "account-b" : "account-a",
          undefined,
          payload,
          `198.51.100.${i}`,
        ),
        f.deps,
      )).status,
      200,
    );
  }
  eq(
    (await handleTestingReportSubmit(request("account-c"), f.deps)).status,
    429,
  );
  eq(f.reports.length, 5);
});

Deno.test("actual backend only accepts the managed Supabase project origin", () => {
  requireHostedGateway("https://" + "a".repeat(20) + ".supabase.co");
  for (
    const url of [
      "http://localhost:54321",
      "https://example.invalid",
      "https://" + "a".repeat(20) + ".supabase.co/path",
      "https://" + "a".repeat(20) + ".supabase.co.attacker.invalid",
    ]
  ) {
    try {
      requireHostedGateway(url);
      throw new Error("unsupported origin accepted");
    } catch (error) {
      eq(error instanceof NativeError && error.status === 503, true);
    }
  }
});
Deno.test("F1: one account cannot reset quota with multiple IPs", async () => {
  const f = fixture();
  for (let i = 1; i <= 6; i++) {
    eq(
      (await handleTestingReportSubmit(
        request("account-a", `192.0.2.${i}`),
        f.deps,
      )).status,
      i <= 5 ? 200 : 429,
    );
  }
  eq(f.reports.length, 5);
});
Deno.test("invalid bodies and exact retries consume durable admission before validation", async () => {
  const f = fixture();
  for (let i = 0; i < 5; i++) {
    eq(
      (await handleTestingReportSubmit(
        request("account-a", undefined, { ...payload, p_consent: false }),
        f.deps,
      )).status,
      400,
    );
  }
  eq(
    (await handleTestingReportSubmit(request("account-a"), f.deps)).status,
    429,
  );
  eq(f.reports.length, 0);
});
Deno.test("missing trustworthy origin fails closed even with XFF", async () => {
  const f = fixture();
  const req = request("account-a");
  req.headers.delete("cf-connecting-ip");
  eq((await handleTestingReportSubmit(req, f.deps)).status, 503);
  eq(f.reports.length, 0);
});
Deno.test("salt/window rotate HMAC; canonical IPv6; no clear IP passed to store", async () => {
  const hash = await ipDigest(
    "192.0.2.10",
    "synthetic-salt-32-characters-minimum",
    week,
  );
  eq(/^[a-f0-9]{64}$/.test(hash), true);
  eq(
    hash ===
      await ipDigest("192.0.2.10", "other-synthetic-salt-32-characters", week),
    false,
  );
  eq(
    hash ===
      await ipDigest(
        "192.0.2.10",
        "synthetic-salt-32-characters-minimum",
        "2026-10-19",
      ),
    false,
  );
  eq(
    await ipDigest("2001:db8::1", "synthetic-salt-32-characters-minimum", week),
    await ipDigest(
      "2001:0db8:0:0:0:0:0:1",
      "synthetic-salt-32-characters-minimum",
      week,
    ),
  );
  const f = fixture();
  await handleTestingReportSubmit(request("account-a"), f.deps);
  eq([...f.counts.keys()].some((key) => key.includes("192.0.2.10")), false);
});

Deno.test("bridge signature, issuer, expiry and identity are checked before accepting account", async () => {
  const now = new Date("2026-10-14T12:00:00Z");
  const publicJwk = testPublicJwk;
  const url = "https://fixture.supabase.co";
  const issuer = "https://clerk.fixture.invalid";
  const user = "16100000-0000-4000-8000-000000000001";
  const subject = "user_" + "A".repeat(27);
  const signed = await signDataToken(user, now, now.getTime() / 1000 + 300, {
    privateJwk: testPrivateJwk,
    supabaseUrl: url,
  }, { issuer, subject });
  const req = new Request("https://example.invalid", {
    headers: { authorization: `Bearer ${signed.token}` },
  });
  eq(await verifyBridgeAccount(req, now, { publicJwk, url, issuer }), {
    account: user,
    subject,
  });
  for (
    const [r, time, cfg] of [
      [req, new Date(now.getTime() + 300000), { publicJwk, url, issuer }],
      [req, now, {
        publicJwk: JSON.stringify({ ...JSON.parse(publicJwk), kid: "wrong" }),
        url,
        issuer,
      }],
      [req, now, { publicJwk, url, issuer: issuer + "wrong" }],
      [
        new Request("https://example.invalid", {
          headers: {
            authorization: `Bearer ${
              signed.token.split(".").slice(0, 2).join(".")
            }.AAAA`,
          },
        }),
        now,
        { publicJwk, url, issuer },
      ],
    ] as const
  ) {
    try {
      await verifyBridgeAccount(r, time, cfg);
      throw new Error("unverified account accepted");
    } catch (error) {
      eq(error instanceof NativeError && error.status === 401, true);
    }
  }
});

Deno.test("JWT failure spends IP admission; upstream failure spends account admission", async () => {
  const f = fixture();
  const deny = {
    ...f.deps,
    account: () => {
      throw new NativeError(401, "unauthorized");
    },
  };
  for (let i = 0; i < 5; i++) {
    eq(
      (await handleTestingReportSubmit(request("account-a"), deny)).status,
      401,
    );
  }
  eq((await handleTestingReportSubmit(request("account-a"), deny)).status, 429);
  const g = fixture();
  const offline = {
    ...g.deps,
    submit: () => {
      throw new Error("synthetic upstream failure");
    },
  };
  for (let i = 1; i <= 5; i++) {
    eq(
      (await handleTestingReportSubmit(
        request("account-a", `192.0.2.${i}`),
        offline,
      )).status,
      503,
    );
  }
  eq(
    (await handleTestingReportSubmit(
      request("account-a", "192.0.2.6"),
      offline,
    )).status,
    429,
  );
});

Deno.test("client account/IP fields and oversized bodies are denied before service submission", async () => {
  const f = fixture();
  eq(
    (await handleTestingReportSubmit(
      request("account-a", undefined, { ...payload, p_account: "account-b" }),
      f.deps,
    )).status,
    400,
  );
  eq(
    (await handleTestingReportSubmit(
      request("account-a", undefined, { ...payload, ip: "192.0.2.1" }),
      f.deps,
    )).status,
    400,
  );
  eq(
    (await handleTestingReportSubmit(
      request("account-a", undefined, { ...payload, p_body: "x".repeat(9000) }),
      f.deps,
    )).status,
    413,
  );
  eq(f.reports.length, 0);
});

Deno.test("missing salt/admission failure/malformed origin never silently bypass limits", async () => {
  const f = fixture();
  eq(
    (await handleTestingReportSubmit(request("account-a"), {
      ...f.deps,
      salt: "",
    })).status,
    503,
  );
  eq(
    (await handleTestingReportSubmit(request("account-a"), {
      ...f.deps,
      admit: () => {
        throw new Error("synthetic database failure");
      },
    })).status,
    503,
  );
  for (
    const ip of [
      "192.0.2.10, 192.0.2.11",
      "garbage",
      "999.0.0.1",
      "192.000.2.1",
      "2001:db8:::1",
    ]
  ) {
    eq(
      (await handleTestingReportSubmit(request("account-a", ip), f.deps))
        .status,
      503,
    );
  }
  eq(f.reports.length, 0);
});

const structured = {
  p_id: payload.p_id,
  p_channel: "testers",
  p_title: "[contenido retirado por privacidad]",
  p_body: "[contenido retirado por privacidad]",
  p_context: {
    app_version: "1.2.3",
    app_channel: "testers",
    game: "none",
    game_version: null,
    system: {},
    telemetry_summary: null,
    posthog_session_id: null,
    consent: {
      version: "triage-v2",
      items: ["app_log"],
      accepted_at: "2026-10-14T00:00:00Z",
    },
  },
  p_attachments: [{ kind: "app_log", content: "[]", sha256: "a".repeat(64) }],
};
Deno.test("F8: structured preview and exact retries retain all fields after IP/account admission", async () => {
  const f = fixture();
  for (let i = 0; i < 2; i++) {
    eq(
      (await handleTestingReportSubmit(
        request("account-a", undefined, structured),
        f.deps,
      )).status,
      200,
    );
  }
  eq(f.reports, [{ account: "account-a", body: structured }, {
    account: "account-a",
    body: structured,
  }]);
  eq([...f.counts.values()], [2, 2]);
});
Deno.test("F8: structured preview without IP/account admission never reaches storage", async () => {
  for (const denied of ["ip", "account"]) {
    const f = fixture();
    eq(
      (await handleTestingReportSubmit(
        request("account-a", undefined, structured),
        {
          ...f.deps,
          admit: (scope) => Promise.resolve(scope !== denied),
        },
      )).status,
      429,
    );
    eq(f.reports.length, 0);
  }
});
Deno.test("F8: partial structured fields, account injection and missing consent fail closed", async () => {
  for (
    const body of [
      { ...structured, p_attachments: undefined },
      { ...structured, p_account: "account-b" },
      { ...structured, p_consent: true },
      { ...structured, p_title: "OrdinaryPrivateTesterNote" },
      { ...structured, p_context: { ...structured.p_context, consent: null } },
    ]
  ) {
    const f = fixture();
    eq(
      (await handleTestingReportSubmit(
        request("account-a", undefined, body),
        f.deps,
      )).status,
      400,
    );
    eq(f.reports.length, 0);
  }
});

Deno.test("F8: production submit dispatches the full package only to the service admission RPC", async () => {
  const f = fixture();
  const calls: unknown[] = [];
  const deps = {
    ...f.deps,
    submit: undefined,
    rpc: (name: string, body: Record<string, unknown>) => {
      calls.push({ name, body });
      return Promise.resolve({ error: null });
    },
  };
  eq(
    (await handleTestingReportSubmit(
      request("verified-account", undefined, structured),
      deps,
    )).status,
    200,
  );
  eq(calls, [{
    name: "testing_contribution_submit_admitted",
    body: { ...structured, p_account: "verified-account" },
  }]);
  eq(
    (await handleTestingReportSubmit(request("verified-account"), deps)).status,
    200,
  );
  eq(calls[1], {
    name: "testing_report_submit_admitted",
    body: { ...payload, p_account: "verified-account" },
  });
});

Deno.test({
  name:
    "F8: exact native preview crosses Edge admission unchanged for the combined SQL runner",
  ignore: !Deno.env.get("VANTARE_TRIAGE_TEST_PREVIEW"),
  fn: async () => {
    const preview = JSON.parse(
      await Deno.readTextFile(Deno.env.get("VANTARE_TRIAGE_TEST_PREVIEW")!),
    );
    const f = fixture();
    const calls: unknown[] = [];
    const account = "15940000-0000-4000-8000-000000000001";
    eq(
      (await handleTestingReportSubmit(request(account, undefined, preview), {
        ...f.deps,
        submit: undefined,
        rpc: (name, body) => {
          calls.push({ name, body });
          return Promise.resolve({ error: null });
        },
      })).status,
      200,
    );
    const expected = {
      name: "testing_contribution_submit_admitted",
      body: { ...preview, p_account: account },
    };
    eq(calls, [expected]);
    const output = Deno.env.get("VANTARE_TRIAGE_TEST_ADMITTED");
    if (output) await Deno.writeTextFile(output, JSON.stringify(expected));
  },
});
