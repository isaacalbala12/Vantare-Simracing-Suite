import { VALID_POLAR_PRODUCT_MAP_JSON } from "../_shared/test-fixtures.ts";
import { type PolarProductMap } from "../_shared/mapping.ts";
import {
  type AdminDeps,
  handleNativeAdmin,
  validateAdminRequest,
} from "./index.ts";
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
  const execute = overrides.execute ?? (() => Promise.resolve({}));
  return {
    ...authDeps(),
    environment: "production",
    resolve: () => Promise.resolve(account),
    begin: () => Promise.resolve(true),
    ...overrides,
    execute: (...args) =>
      args[2] === "get_payment_sync"
        ? Promise.resolve({ needs_sync: false })
        : execute(...args),
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
  ["set_report_status", {
    report_id: reportId,
    status: "closed",
    reason: "Revisado por Isaac",
  }, {
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

Deno.test("r1: report review accepts the closed request and forwards status", async () => {
  const response = await handleNativeAdmin(
    request({
      version: 1,
      action: "set_report_status",
      report_id: reportId,
      status: "in_review",
    }),
    deps({
      execute: (_a, _i, action, params) => {
        assert(action === "set_report_status" && params.status === "in_review");
        return Promise.resolve({});
      },
    }),
  );
  assert(response.status === 200);
});

const target = "00000000-0000-4000-8000-000000001628";
Deno.test("r1: blocking persists before Clerk ban and cancels sandbox subscriptions", async () => {
  const calls: string[] = [];
  const response = await handleNativeAdmin(
    request({
      version: 1,
      action: "set_blocked",
      account_id: target,
      blocked: true,
    }),
    deps({
      environment: "sandbox",
      execute: (_a, _i, action) => {
        calls.push(action);
        return Promise.resolve(
          action === "get_account"
            ? {
              account: {
                account_id: target,
                clerk_subject: subject,
                owner: false,
                subscriptions: ["subscription-test"],
              },
            }
            : {},
        );
      },
      fetch: (url, init) => {
        const path = String(url);
        if (path.endsWith("/ban")) {
          calls.push("ban");
          return Promise.resolve(Response.json(user));
        }
        return authDeps().fetch!(url, init);
      },
      polar: {
        getAccessToken: () => "fake-polar",
        fetchFn: (url, init) => {
          assert(
            String(url) ===
                "https://sandbox-api.polar.sh/v1/subscriptions/subscription-test" &&
              ["GET", "DELETE"].includes(String(init?.method)),
          );
          if (init?.method === "GET") {
            return Promise.resolve(
              Response.json({ id: "subscription-test", status: "active" }),
            );
          }
          calls.push("cancel");
          return Promise.resolve(
            Response.json({ id: "subscription-test", status: "canceled" }),
          );
        },
      },
    }),
  );
  assert(response.status === 200);
  assert(calls.join(",") === "get_account,set_blocked,ban,cancel");
});
Deno.test("r1: owner protection and production containment precede all external writes", async () => {
  for (const scenario of ["owner", "production", "denied"]) {
    let writes = 0;
    const response = await handleNativeAdmin(
      request({
        version: 1,
        action: "set_blocked",
        account_id: target,
        blocked: true,
      }),
      deps({
        environment: scenario === "production" ? "production" : "sandbox",
        begin: () => {
          if (scenario === "denied") throw new NativeError(403, "forbidden");
          return Promise.resolve(true);
        },
        execute: () => Promise.resolve({ account: { owner: true } }),
        polar: {
          fetchFn: () => {
            writes++;
            throw Error("external write");
          },
        },
        fetch: (url, init) => {
          if (
            init?.method === "POST" && !String(url).endsWith("verify")
          ) writes++;
          return authDeps().fetch!(url, init);
        },
      }),
    );
    assert(
      response.status ===
        (scenario === "production" ? 503 : scenario === "denied" ? 403 : 409),
    );
    assert(writes === 0);
  }
});
Deno.test("r1: failed cancellation preserves the local ban and returns an incomplete action", async () => {
  let blocked = false;
  const response = await handleNativeAdmin(
    request({
      version: 1,
      action: "set_blocked",
      account_id: target,
      blocked: true,
    }),
    deps({
      environment: "sandbox",
      execute: (_a, _i, action) => {
        if (action === "set_blocked") blocked = true;
        return Promise.resolve(
          action === "get_account"
            ? {
              account: {
                owner: false,
                clerk_subject: subject,
                subscriptions: ["sub-test"],
              },
            }
            : {},
        );
      },
      polar: {
        getAccessToken: () => "fake",
        fetchFn: () => Promise.resolve(new Response(null, { status: 503 })),
      },
    }),
  );
  assert(response.status === 503 && blocked);
});
Deno.test("r1: creator creation reserves a stable id before Polar and activates after ACK", async () => {
  let called = 0;
  const response = await handleNativeAdmin(
    request({
      version: 1,
      action: "create_creator",
      name: "Carlos GT",
      email: "carlos@example.invalid",
      code: "CARLOSGT",
    }),
    deps({
      environment: "sandbox",
      execute: (_a, _i, action, params) => {
        called++;
        assert(action === "create_creator");
        assert(params.code === "CARLOSGT");
        return Promise.resolve({
          creator: {
            creator_id: target,
            status: "active",
            code: "CARLOSGT",
            annual_discount_id: "00000000-0000-4000-8000-000000001684",
          },
        });
      },
    }),
  );
  assert(response.status === 200 && called === 1);
});

Deno.test("r1: owner can read creators through the existing boundary", async () => {
  const response = await handleNativeAdmin(
    request({ version: 1, action: "list_creators" }),
    deps({ execute: () => Promise.resolve({ creators: [], totals: {} }) }),
  );
  assert(response.status === 200);
});

Deno.test("r1: miniapp creates a scoped Polar discount and retries it without duplication", async () => {
  const raw = JSON.parse(VALID_POLAR_PRODUCT_MAP_JSON);
  for (
    const [i, key] of [
      "pro_monthly",
      "pro_annual",
      "pro_plus_monthly",
      "pro_plus_annual",
    ].entries()
  ) {
    raw.checkout_keys[key] = {
      ...raw.checkout_keys.pro_monthly,
      plan_sku: key,
      polar_product_id: `normal-${i}`,
    };
  }
  const map = raw as PolarProductMap;
  let active = false;
  let created = 0;
  let stored: Record<string, unknown> | null = null;
  const allStored: Record<string, unknown>[] = [];
  const fake = deps({
    environment: "sandbox",
    productMap: map,
    execute: (_a, _i, action, params) => {
      if (action === "activate_creator") {
        assert(params.discount_id === "00000000-0000-4000-8000-000000001683");
        assert(
          params.annual_discount_id === "00000000-0000-4000-8000-000000001684",
        );
        active = true;
      }
      return Promise.resolve({
        creator: {
          creator_id: target,
          code: "CARLOSGT",
          status: active ? "active" : "pending",
        },
      });
    },
    polar: {
      getAccessToken: () => "fake",
      fetchFn: (_url, init) => {
        if (String(_url).includes("/organizations/")) {
          return Promise.resolve(
            Response.json({
              id: map.organization_id,
              customer_portal_settings: {
                subscription: { update_plan: false },
              },
            }),
          );
        }
        if (init?.method === "GET") {
          return Promise.resolve(
            Response.json({
              items: allStored,
              pagination: { max_page: 1 },
            }),
          );
        }
        created++;
        assert(!("organization_id" in JSON.parse(String(init?.body))));
        stored = {
          ...JSON.parse(String(init?.body)),
          id: created === 1
            ? "00000000-0000-4000-8000-000000001683"
            : "00000000-0000-4000-8000-000000001684",
          organization_id: map.organization_id,
        };
        allStored.push(stored!);
        return Promise.resolve(Response.json(stored));
      },
    },
  });
  const input = {
    version: 1,
    action: "create_creator",
    name: "Carlos GT",
    email: "carlos@example.invalid",
    code: "CARLOSGT",
  };
  assert(
    (await handleNativeAdmin(request(input), fake)).status === 200 && active,
  );
  // Re-simulate the lost DB ACK: reconciliation reads the matching remote code.
  active = false;
  assert((await handleNativeAdmin(request(input), fake)).status === 200);
  assert(
    created === 2 &&
      (stored as Record<string, unknown> | null)?.basis_points === 2000 &&
      (stored as Record<string, unknown> | null)?.duration_in_months === 12,
  );
});

Deno.test("r1: first read synchronizes historical invoices and refunds before showing creator debt", async () => {
  const map = JSON.parse(VALID_POLAR_PRODUCT_MAP_JSON) as PolarProductMap;
  const writes: Record<string, unknown>[] = [];
  let finished = false;
  const actorDeps = deps({
    environment: "sandbox",
    productMap: map,
    polar: {
      getAccessToken: () => "fake",
      fetchFn: (url) => {
        const path = new URL(String(url)).pathname;
        if (path.includes("organizations")) {
          return Promise.resolve(Response.json({ id: map.organization_id }));
        }
        if (path.includes("refunds")) {
          return Promise.resolve(Response.json({
            items: [{
              id: "refund-old",
              order_id: "order-old",
              amount: 264,
              tax_amount: 55,
              currency: "eur",
              status: "succeeded",
              modified_at: "2026-09-20T00:00:00Z",
            }],
            pagination: { max_page: 1, total_count: 1 },
          }));
        }
        assert(path.includes("orders"));
        return Promise.resolve(Response.json({
          items: [{
            id: "order-old",
            customer_id: "customer-old",
            product_id: map.checkout_keys.pro_monthly!.polar_product_id,
            subscription_id: "sub-old",
            status: "refunded",
            paid: true,
            created_at: "2026-08-31T00:00:00Z",
            modified_at: "2026-09-20T00:00:00Z",
            total_amount: 319,
            refunded_amount: 264,
            refunded_tax_amount: 55,
            currency: "eur",
            applied_balance_amount: 0,
            discount_id: "discount-old",
          }],
          pagination: { max_page: 1, total_count: 1 },
        }));
      },
    },
  });
  actorDeps.execute = (_a, _i, action, params) => {
    if (action === "get_payment_sync") {
      return Promise.resolve({ needs_sync: true });
    }
    if (action === "resolve_payment_account") {
      return Promise.resolve({ account_id: target });
    }
    if (action === "sync_admin_payment") {
      writes.push(params.payment as Record<string, unknown>);
      return Promise.resolve({});
    }
    if (action === "sync_admin_refund") {
      assert((params.refund as Record<string, unknown>).amount_cents === 319);
      return Promise.resolve({});
    }
    if (action === "finish_payment_sync") {
      assert((params.account_ids as string[])[0] === target);
      finished = true;
      return Promise.resolve({});
    }
    assert(action === "list_creators" && finished);
    return Promise.resolve({ creators: [], totals: {} });
  };
  const response = await handleNativeAdmin(
    request({ version: 1, action: "list_creators" }),
    actorDeps,
  );
  assert(
    response.status === 200 && writes.length === 1 &&
      writes[0].refunded_cents === 319 &&
      writes[0].paid_at === "2026-08-31T00:00:00Z",
  );
});
Deno.test("r1: incomplete Polar pagination never certifies payment history or records a payout", async () => {
  let finalized = false;
  const map = JSON.parse(VALID_POLAR_PRODUCT_MAP_JSON) as PolarProductMap;
  const actorDeps = deps({
    environment: "sandbox",
    productMap: map,
    polar: {
      getAccessToken: () => "fake",
      fetchFn: (url) =>
        Promise.resolve(
          Response.json(
            String(url).includes("organizations")
              ? { id: map.organization_id }
              : { items: [], pagination: { max_page: 101 } },
          ),
        ),
    },
  });
  actorDeps.execute = (_a, _i, action) => {
    if (action === "get_payment_sync") {
      return Promise.resolve({ needs_sync: true });
    }
    finalized = true;
    throw Error("must not finish or pay");
  };
  const response = await handleNativeAdmin(
    request({
      version: 1,
      action: "record_creator_payout",
      creator_id: target,
      amount_cents: 1,
    }),
    actorDeps,
  );
  assert(response.status === 503 && !finalized);
});

Deno.test("r1: duplicated pages cannot certify historical invoices", async () => {
  const { polarPages } = await import("./payment-sync.ts");
  let rejected = false;
  try {
    await polarPages("orders", "00000000-0000-4000-8000-000000001627", {
      getAccessToken: () => "fake",
      fetchFn: () =>
        Promise.resolve(
          Response.json({
            items: [{ id: "same-order" }],
            pagination: { max_page: 2 },
          }),
        ),
    });
  } catch {
    rejected = true;
  }
  assert(rejected);
});
Deno.test("r1: foreign organization or editable portal cannot create creator codes", async () => {
  const { ensureCreatorCode } = await import("./creator-code.ts");
  const map = JSON.parse(VALID_POLAR_PRODUCT_MAP_JSON) as PolarProductMap;
  for (
    const organization of [
      {
        id: "another-organization",
        customer_portal_settings: { subscription: { update_plan: false } },
      },
      {
        id: map.organization_id,
        customer_portal_settings: { subscription: { update_plan: true } },
      },
    ]
  ) {
    let writes = 0, rejected = false;
    try {
      await ensureCreatorCode(target, "CARLOSGT", map, {
        getAccessToken: () => "fake",
        fetchFn: (_url, init) => {
          if (init?.method !== "GET") writes++;
          return Promise.resolve(Response.json(organization));
        },
      });
    } catch {
      rejected = true;
    }
    assert(rejected && writes === 0);
  }
});
Deno.test("r1: blocking retry accepts an already canceled Polar subscription", async () => {
  let deletes = 0;
  const response = await handleNativeAdmin(
    request({
      version: 1,
      action: "set_blocked",
      account_id: target,
      blocked: true,
    }),
    deps({
      environment: "sandbox",
      execute: (_a, _i, action) =>
        Promise.resolve(
          action === "get_account"
            ? {
              account: {
                account_id: target,
                clerk_subject: subject,
                owner: false,
                subscriptions: ["subscription-test"],
              },
            }
            : {},
        ),
      fetch: (url, init) =>
        String(url).endsWith("/ban")
          ? Promise.resolve(Response.json(user))
          : authDeps().fetch!(url, init),
      polar: {
        getAccessToken: () => "fake",
        fetchFn: (_url, init) => {
          if (init?.method === "DELETE") deletes++;
          return Promise.resolve(
            Response.json({ id: "subscription-test", status: "canceled" }),
          );
        },
      },
    }),
  );
  assert(response.status === 200 && deletes === 0);
});

Deno.test("r3: spam and acceptance require a human note at the public boundary", () => {
  for (const status of ["spam", "validated", "rejected"]) {
    let rejected = false;
    try {
      validateAdminRequest({
        version: 1,
        action: "set_report_status",
        report_id: "report-1",
        status,
      });
    } catch {
      rejected = true;
    }
    assert(rejected);
    const request = validateAdminRequest({
      version: 1,
      action: "set_report_status",
      report_id: "report-1",
      status,
      reason: "Revisado por Isaac",
    });
    assert(request.params.status === status);
  }
});

function deletionFixture(options: {
  pending?: boolean;
  wrongHash?: boolean;
  owner?: boolean;
  sqlFailure?: boolean;
  deleteStatus?: number;
  cleanupFailure?: boolean;
  subscriptions?: string[];
  polarFailure?: boolean;
  polarMissing?: boolean;
  lateSubscription?: boolean;
  latePolarSubscription?: boolean;
  polarStateFailure?: number;
} = {}) {
  const calls: string[] = [];
  const job = {
    account_id: target,
    clerk_subject: subject,
    deleted_at: now.toISOString(),
  };
  let pending = options.pending ?? false;
  const fake = deps({
    environment: "sandbox",
    execute: (_actor, _issuer, action, params) => {
      calls.push(action);
      if (action === "get_account") {
        return Promise.resolve({
          account: {
            account_id: target,
            owner: options.owner ?? false,
            clerk_subject: subject,
            subscriptions: options.lateSubscription
              ? (pending ? ["sub-target"] : [])
              : options.subscriptions ?? [],
          },
        });
      }
      if (action === "get_account_deletion") {
        if (options.wrongHash) {
          throw new Error("native_admin_confirmation_mismatch");
        }
        return Promise.resolve({ deletion: pending ? job : null });
      }
      assert(action === "prepare_account_deletion");
      assert(
        params.clerk_subject === subject &&
          /^[a-f0-9]{64}$/.test(String(params.confirmation_hash)),
      );
      assert(
        !JSON.stringify(params).includes("@"),
        "SQL never receives the email",
      );
      if (options.sqlFailure) throw new Error("unavailable");
      pending = true;
      return Promise.resolve({ deletion: job });
    },
    fetch: (url, init) => {
      if (String(url).endsWith("/verify")) {
        return Promise.resolve(Response.json(claims));
      }
      if (init?.method === "DELETE") {
        assert(pending && init.redirect === "error");
        calls.push("clerk-delete");
        return Promise.resolve(
          new Response(null, { status: options.deleteStatus ?? 200 }),
        );
      }
      calls.push("clerk-get");
      return Promise.resolve(Response.json(user));
    },
    polar: {
      getAccessToken: () => "fake",
      fetchFn: (_url, init) => {
        if (String(_url).includes("/customers/external/")) {
          assert(pending, "remote subscriptions must be read after tombstone");
          calls.push("polar-state");
          return Promise.resolve(
            options.polarStateFailure
              ? new Response(null, { status: options.polarStateFailure })
              : Response.json({
                id: "customer-target",
                external_id: target,
                active_subscriptions: options.latePolarSubscription
                  ? [{
                    id: "sub-target",
                    product_id: "product",
                    modified_at: now.toISOString(),
                  }]
                  : [],
                granted_benefits: [],
              }),
          );
        }
        assert(pending, "tombstone must precede external writes");
        calls.push(`polar-${init?.method}`);
        return Promise.resolve(
          options.polarMissing
            ? new Response(null, { status: 404 })
            : options.polarFailure
            ? new Response(null, { status: 503 })
            : Response.json({
              id: "sub-target",
              status: init?.method === "DELETE" ? "canceled" : "active",
            }),
        );
      },
    },
    cleanupDeletion: () => {
      calls.push("cleanup");
      if (options.cleanupFailure) throw new Error("cleanup failed");
      return Promise.resolve();
    },
  });
  return { calls, fake };
}
function deleteRequest(email = "TESTER@EXAMPLE.INVALID") {
  return request({
    version: 1,
    action: "delete_account",
    account_id: target,
    confirm_email: email,
  });
}
Deno.test("r4: deletion checks current email before tombstone, then cancels and drains #1622", async () => {
  const { calls, fake } = deletionFixture({ subscriptions: ["sub-target"] });
  const response = await handleNativeAdmin(deleteRequest(), fake);
  assert(
    response.status === 200 &&
      (await response.json()).deleted_at === now.toISOString(),
  );
  const events = calls.filter((call) => call !== "clerk-get");
  assert(
    JSON.stringify(events) === JSON.stringify([
      "get_account",
      "get_account_deletion",
      "prepare_account_deletion",
      "get_account",
      "polar-state",
      "polar-GET",
      "polar-DELETE",
      "clerk-delete",
      "cleanup",
    ]),
  );
});
Deno.test("r4: wrong email and Owner never initiate deletion or external writes", async () => {
  for (const owner of [false, true]) {
    const { calls, fake } = deletionFixture({ owner });
    const response = await handleNativeAdmin(
      deleteRequest("wrong@example.invalid"),
      fake,
    );
    assert(response.status === (owner ? 409 : 422));
    assert(
      !calls.includes("prepare_account_deletion") &&
        !calls.includes("clerk-delete") && !calls.includes("cleanup"),
    );
  }
});
Deno.test("r4: failed tombstone never performs external deletion", async () => {
  const { calls, fake } = deletionFixture({ sqlFailure: true });
  const response = await handleNativeAdmin(deleteRequest(), fake);
  assert(
    response.status === 503 && !calls.includes("clerk-delete") &&
      !calls.includes("cleanup"),
  );
});
Deno.test("r4: pending deletion retries after lost Clerk ACK without looking up erased PII", async () => {
  const { calls, fake } = deletionFixture({ pending: true, deleteStatus: 404 });
  const response = await handleNativeAdmin(deleteRequest(), fake);
  assert(
    response.status === 200 && !calls.includes("prepare_account_deletion"),
  );
  assert(
    calls.filter((call) => call === "clerk-get").length === 1,
    "only actor profile is read",
  );
  assert(calls.includes("cleanup"));
});
Deno.test("r4: pending deletion rejects another confirmation", async () => {
  const { calls, fake } = deletionFixture({ pending: true, wrongHash: true });
  const response = await handleNativeAdmin(
    deleteRequest("different@example.invalid"),
    fake,
  );
  assert(
    response.status === 422 &&
      (await response.json()).error === "confirmation_mismatch",
  );
  assert(!calls.includes("clerk-delete"));
});
Deno.test("r4: failures after tombstone remain explicit and retryable", async () => {
  for (
    const options of [
      { deleteStatus: 503 },
      { cleanupFailure: true },
      { subscriptions: ["sub-target"], polarFailure: true },
    ]
  ) {
    const { calls, fake } = deletionFixture(options);
    const response = await handleNativeAdmin(deleteRequest(), fake);
    assert(
      response.status === 503 &&
        (await response.json()).error === "account_change_incomplete",
    );
    if (options.polarFailure) assert(!calls.includes("clerk-delete"));
    if (options.deleteStatus) assert(!calls.includes("cleanup"));
  }
});
Deno.test("r4: internal deletion actions are not client commands", () => {
  for (const action of ["get_account_deletion", "prepare_account_deletion"]) {
    let rejected = false;
    try {
      validateAdminRequest({
        version: 1,
        action,
        account_id: target,
        confirmation_hash: "a".repeat(64),
      });
    } catch (e) {
      rejected = e instanceof NativeError && e.status === 400;
    }
    assert(rejected);
  }
});

Deno.test("r5: deletion cancels a purchase committed between initial read and tombstone", async () => {
  const { calls, fake } = deletionFixture({ lateSubscription: true });
  const response = await handleNativeAdmin(deleteRequest(), fake);
  assert(response.status === 200);
  assert(calls.includes("polar-DELETE"), "late subscription must be canceled");
});
Deno.test("r5: missing Polar subscription is recorded and deletion completes", async () => {
  const { calls, fake } = deletionFixture({
    subscriptions: ["sub-target"],
    polarMissing: true,
  });
  const events: string[] = [];
  const info = console.info;
  console.info = (...values) => events.push(values.join(" "));
  try {
    const response = await handleNativeAdmin(deleteRequest(), fake);
    assert(response.status === 200 && calls.includes("cleanup"));
    assert(!calls.includes("polar-DELETE"));
    assert(
      events.some((event) =>
        JSON.parse(event).event === "native_admin_subscription_missing"
      ),
    );
    assert(
      !events.join().includes("sub-target"),
      "log must not expose subscription identity",
    );
  } finally {
    console.info = info;
  }
});

Deno.test("r5: deletion cancels a completed Polar purchase even before its webhook arrives", async () => {
  const { calls, fake } = deletionFixture({ latePolarSubscription: true });
  const response = await handleNativeAdmin(deleteRequest(), fake);
  assert(response.status === 200 && calls.includes("polar-DELETE"));
});

Deno.test("r5: transient Polar state failure keeps deletion retryable before Clerk", async () => {
  const { calls, fake } = deletionFixture({ polarStateFailure: 503 });
  const response = await handleNativeAdmin(deleteRequest(), fake);
  assert(response.status === 503 && !calls.includes("clerk-delete"));
});
Deno.test("r5: missing Polar customer still cancels known local subscriptions", async () => {
  const { calls, fake } = deletionFixture({
    subscriptions: ["sub-target"],
    polarStateFailure: 404,
  });
  const response = await handleNativeAdmin(deleteRequest(), fake);
  assert(response.status === 200 && calls.includes("polar-DELETE"));
});
