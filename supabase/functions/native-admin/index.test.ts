import { type AdminDeps, handleNativeAdmin } from "./index.ts";
import { NativeError } from "../_shared/native-auth.ts";
import {
  account,
  assert,
  authDeps,
  claims,
  now,
  request,
  subject,
  user,
} from "../native-account-authorize/testdata/auth.ts";

function deps(overrides: AdminDeps = {}): AdminDeps {
  return {
    ...authDeps(),
    environment: "production",
    resolve: () => Promise.resolve(account),
    begin: () => Promise.resolve(true),
    execute: () => Promise.resolve({}),
    ...overrides,
  };
}
const module = "vantare.module.engineer";
const reportId = "report-beta-test";
const imagePath = `v1/${"a".repeat(32)}/${account}/${account}`;
Deno.test("empty query lists mapped accounts with cursor and no Clerk search", async () => {
  let directoryCalls = 0;
  let profileCalls = 0;
  const response = await handleNativeAdmin(
    request({
      version: 1,
      action: "search_accounts",
      query: "",
      limit: 1,
      cursor: account,
    }),
    deps({
      fetch: (url) => {
        if (String(url).includes("users?")) directoryCalls++;
        if (String(url).includes("users/")) profileCalls++;
        return Promise.resolve(
          Response.json(String(url).endsWith("verify") ? claims : user),
        );
      },
      execute: (_actor, _issuer, action, params) => {
        assert(
          action === "search_accounts" && params.query === "" &&
            params.cursor === account && !("subjects" in params),
        );
        return Promise.resolve({
          accounts: [{ account_id: account, clerk_subject: subject }],
          next_cursor: account,
        });
      },
    }),
  );
  assert(response.status === 200);
  const body = await response.json();
  assert(
    body.accounts.length === 1 && body.next_cursor === account &&
      body.accounts[0].email === user.email_addresses[0].email_address,
  );
  assert(directoryCalls === 0 && profileCalls === 1);
});
Deno.test("own account reuses the validated actor profile", async () => {
  let profileCalls = 0;
  const response = await handleNativeAdmin(
    request({ version: 1, action: "get_account", account_id: account }),
    deps({
      fetch: (url) => {
        if (!String(url).endsWith("verify")) profileCalls++;
        return Promise.resolve(Response.json(
          String(url).endsWith("verify")
            ? claims
            : String(url).includes("users?")
            ? [user]
            : user,
        ));
      },
      execute: () =>
        Promise.resolve({
          account: { account_id: account, clerk_subject: subject },
        }),
    }),
  );
  assert(response.status === 200);
  assert(
    (await response.json()).account.email ===
      user.email_addresses[0].email_address,
  );
  assert(profileCalls === 1);
});
Deno.test("cached actor profile does not add owner to an unmatched search", async () => {
  const response = await handleNativeAdmin(
    request({
      version: 1,
      action: "search_accounts",
      query: "unmatched",
      limit: 50,
    }),
    deps({
      fetch: (url) =>
        Promise.resolve(Response.json(
          String(url).endsWith("verify")
            ? claims
            : String(url).includes("users?")
            ? []
            : user,
        )),
      execute: (_actor, _issuer, _action, params) => {
        assert(Array.isArray(params.subjects) && params.subjects.length === 0);
        return Promise.resolve({ accounts: [] });
      },
    }),
  );
  assert(
    response.status === 200 && (await response.json()).accounts.length === 0,
  );
});
const happy = [
  ["search_accounts", { query: "tester", limit: 50 }, {
    accounts: [{
      account_id: account,
      clerk_subject: subject,
      roles: ["tester"],
      modules: [],
      reports_count: 1,
    }],
  }],
  ["get_account", { account_id: account }, {
    account: { account_id: account, clerk_subject: subject },
  }],
  ["set_tester", { account_id: account, enabled: true }, {
    account_id: account,
    enabled: true,
  }],
  ["set_tester", { account_id: account, enabled: false }, {
    account_id: account,
    enabled: false,
  }],
  ["set_module", { account_id: account, module, enabled: true }, {
    account_id: account,
    module,
    enabled: true,
  }],
  ["set_module", { account_id: account, module, enabled: false }, {
    account_id: account,
    module,
    enabled: false,
  }],
  ["get_rollout", {}, { rollout: [{ module, enabled_for_all: false }] }],
  ["set_rollout", { module, enabled_for_all: true }, {
    rollout: { module, enabled_for_all: true },
  }],
  ["list_reports", { limit: 100, status: "submitted" }, {
    reports: [{
      report_id: reportId,
      clerk_subject: subject,
      has_screenshots: true,
    }],
    next_cursor: reportId,
  }],
  ["get_report", { report_id: reportId }, {
    report: {
      report_id: reportId,
      clerk_subject: subject,
      screenshots: [{ object_path: imagePath }],
    },
  }],
  ["set_report_status", { report_id: reportId, status: "closed" }, {
    report_id: reportId,
    status: "closed",
  }],
] as const;

for (const [action, params, result] of happy) {
  Deno.test(`admin happy action ${action} ${JSON.stringify(params)}`, async () => {
    let executed = false;
    let authorized = false;
    const response = await handleNativeAdmin(
      request({ version: 1, action, ...params }),
      deps({
        fetch: (url) =>
          Promise.resolve(Response.json(
            String(url).endsWith("verify")
              ? claims
              : String(url).includes("users?")
              ? [user]
              : user,
          )),
        begin: (actor) => {
          assert(actor === account);
          authorized = true;
          return Promise.resolve(true);
        },
        execute: (actor, _issuer, received, input) => {
          assert(authorized && actor === account && received === action);
          if (action === "search_accounts") {
            assert(
              JSON.stringify(input.subjects) === JSON.stringify([subject]) &&
                !("query" in input),
            );
          }
          executed = true;
          return Promise.resolve(structuredClone(result));
        },
        signUrl: (path, seconds) => {
          assert(path === imagePath && seconds === 600);
          return Promise.resolve("https://local.invalid/signed-test");
        },
      }),
    );
    assert(
      response.status === 200 && executed &&
        response.headers.get("Cache-Control") === "no-store",
    );
    const output = await response.json();
    assert(
      output.version === 1 && output.ok === true &&
        !JSON.stringify(output).includes(subject),
    );
    if (action === "get_report") {
      assert(output.report.email === user.email_addresses[0].email_address);
      assert(
        output.report.screenshots[0].url ===
            "https://local.invalid/signed-test" &&
          output.report.screenshots[0].expires_at ===
            now.getTime() / 1000 + 600,
      );
      assert(!("object_path" in output.report.screenshots[0]));
    }
  });
}
for (
  const [name, input] of [
    ["unknown", { action: "delete_account", account_id: account }],
    ["search limit", { action: "search_accounts", query: "a", limit: 51 }],
    ["reports limit", { action: "list_reports", limit: 101 }],
    ["fractional limit", { action: "list_reports", limit: 1.5 }],
    ["negative limit", { action: "list_reports", limit: -1 }],
    ["query limit", { action: "search_accounts", query: "é".repeat(101) }],
    ["module", {
      action: "set_module",
      account_id: account,
      module: "vantare.plan.pro",
      enabled: true,
    }],
    ["tester owner override", {
      action: "set_tester",
      account_id: account,
      enabled: true,
      role: "owner",
    }],
    ["actor override", { action: "get_rollout", actor: account }],
    ["report status", {
      action: "set_report_status",
      report_id: reportId,
      status: "invented",
    }],
    ["invalid account", { action: "get_account", account_id: subject }],
    ["string boolean", {
      action: "set_tester",
      account_id: account,
      enabled: "true",
    }],
    ["null limit", { action: "search_accounts", query: "a", limit: null }],
    ["invalid account cursor", {
      action: "search_accounts",
      query: "",
      cursor: "not-a-uuid",
    }],
    ["cursor on filtered search", {
      action: "search_accounts",
      query: "tester",
      cursor: account,
    }],
    ["whitespace-only search", { action: "search_accounts", query: " " }],
  ] as const
) {
  Deno.test(`admin rejects ${name}`, async () => {
    const response = await handleNativeAdmin(
      request({ version: 1, ...input }),
      deps({
        begin: () => {
          throw new Error("must not authorize malformed action");
        },
      }),
    );
    assert(response.status === 400);
  });
}
Deno.test("admin anonymous and invalid OAuth are 401 before owner query", async () => {
  for (
    const options of [{
      header: { Authorization: "" },
      fetch: authDeps().fetch,
    }, {
      header: {},
      fetch: () => Promise.resolve(Response.json({ active: false })),
    }, {
      header: {},
      fetch: () =>
        Promise.resolve(Response.json({ ...claims, client_id: "other" })),
    }]
  ) {
    const response = await handleNativeAdmin(
      request(
        { version: 1, action: "get_rollout" },
        options.header as Record<string, string>,
      ),
      deps({
        fetch: options.fetch,
        begin: () => {
          throw new Error("must not query owner");
        },
      }),
    );
    assert(response.status === 401);
  }
});
Deno.test("non-owner 403; denied actor never queries directory or executes", async () => {
  let calls = 0;
  const response = await handleNativeAdmin(
    request({ version: 1, action: "search_accounts", query: "tester" }),
    deps({
      fetch: (url) => {
        calls++;
        return Promise.resolve(
          Response.json(String(url).endsWith("verify") ? claims : user),
        );
      },
      begin: () => {
        throw { message: "native_admin_forbidden" };
      },
      execute: () => {
        throw new Error("must not execute");
      },
    }),
  );
  assert(response.status === 403 && calls === 2);
  assert(
    JSON.stringify(await response.json()) ===
      '{"version":1,"ok":false,"error":"forbidden"}',
  );
});
Deno.test("persistent per-actor budget rejection is 429 before action", async () => {
  const response = await handleNativeAdmin(
    request({ version: 1, action: "get_rollout" }),
    deps({
      begin: () => Promise.resolve(false),
      execute: () => {
        throw new Error("must not execute");
      },
    }),
  );
  assert(response.status === 429);
});
Deno.test("DB/audit failure never returns success or internal details", async () => {
  const response = await handleNativeAdmin(
    request({
      version: 1,
      action: "set_tester",
      account_id: account,
      enabled: true,
    }),
    deps({
      execute: () => {
        throw new Error(`audit failed ${account} test-oauth`);
      },
    }),
  );
  assert(response.status === 503);
  const output = await response.text();
  assert(
    !output.includes(account) && !output.includes("test-oauth") &&
      !output.includes("audit failed"),
  );
});
Deno.test("admin body and bearer enforce byte caps", async () => {
  for (
    const [body, headers] of [[{
      version: 1,
      action: "get_rollout",
      text: "é".repeat(4096),
    }, {}], [{ version: 1, action: "get_rollout" }, {
      "Content-Length": "8193",
    }], [{ version: 1, action: "get_rollout" }, {
      Authorization: `Bearer ${"a".repeat(16385)}`,
    }]] as const
  ) {
    assert(
      (await handleNativeAdmin(request(body, headers), deps())).status === 413,
    );
  }
});
Deno.test("get_report never signs removed or arbitrary client paths", async () => {
  const response = await handleNativeAdmin(
    request({ version: 1, action: "get_report", report_id: reportId }),
    deps({
      execute: () =>
        Promise.resolve({
          report: { screenshots: [{ object_path: "other-bucket/private" }] },
        }),
      signUrl: () => {
        throw new Error("must not sign arbitrary path");
      },
    }),
  );
  assert(response.status === 503);
});
Deno.test("Clerk/Storage failures remain unavailable, not successful empty data", async () => {
  const response = await handleNativeAdmin(
    request({ version: 1, action: "get_report", report_id: reportId }),
    deps({
      execute: () =>
        Promise.resolve({
          report: { screenshots: [{ object_path: imagePath }] },
        }),
      signUrl: () => {
        throw new NativeError(503, "bridge_unavailable");
      },
    }),
  );
  assert(response.status === 503);
});
