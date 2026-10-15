import {
  executeMail,
  mailContent,
  type MailRun,
  renderMail,
  validateMail,
} from "./mail.ts";
import { NativeError } from "../_shared/native-auth.ts";
import { handleUnsubscribe } from "../mail-unsubscribe/index.ts";
import {
  unsubscribeToken,
  verifyUnsubscribe,
} from "../mail-unsubscribe/tokens.ts";
import { handleMailWebhook } from "../mail-webhook/index.ts";
import { handleNativeAdmin } from "./index.ts";
import {
  account,
  assert,
  authDeps,
  request,
} from "../native-account-authorize/testdata/auth.ts";
const id = "00000000-0000-4000-8000-000000001636";
const p = { campaign_id: id, revision: 1 };
const content = Object.fromEntries(
  ["es", "en", "it", "pt-BR"].map(
    (l) => [l, { subject: "Hello", body: "Body <script>" }],
  ),
);
const secret = "local-fixture-key-not-a-real-secret-1636";
const vars: Record<string, string> = {
  MARKETING_SEND_ENABLED: "true",
  MARKETING_AI_ENABLED: "true",
  BREVO_API_KEY: "local-fake",
  ANTHROPIC_API_KEY: "local-fake",
  BREVO_MARKETING_SENDER: "sender@example.invalid",
  MARKETING_UNSUBSCRIBE_URL:
    "https://project.invalid/functions/v1/mail-unsubscribe",
  MARKETING_UNSUBSCRIBE_KEY: secret,
  BREVO_MARKETING_LISTS: JSON.stringify({
    free: 1,
    pro: 2,
    pro_plus: 3,
    launch: 4,
    testers: 5,
    creators: 6,
    waitlist: 7,
  }),
};
const env = (k: string) => vars[k];
async function rejects(f: () => unknown) {
  let threw = false;
  try {
    await f();
  } catch {
    threw = true;
  }
  assert(threw);
}
Deno.test("mail closed request schema, confirmation, languages and header injection", async () => {
  for (
    const [a, args] of [
      ["mail_claim", p],
      ["mail_approve", { ...p, confirm: false }],
      ["mail_draft", { ...p, brief: "b", template: "wrong" }],
      ["mail_send_batch", { ...p, to: "victim@example.invalid" }],
    ] as const
  ) await rejects(() => validateMail(a, args));
  assert(mailContent(content));
  assert(!mailContent({ ...content, fr: content.en }));
  assert(
    !mailContent({ ...content, es: { subject: "S\r\nBcc: x", body: "B" } }),
  );
  const html = renderMail(
    '<script>alert("x")</script>',
    "https://example.invalid/?t=abc&x=1",
    "it",
  );
  assert(
    !html.includes("<script>") && html.includes("&lt;script&gt;") &&
      html.includes("Annulla tutte"),
  );
});
Deno.test("mail requires SQL Owner and explicit enabled configuration before any SaaS", async () => {
  let http = 0;
  const fetcher: typeof fetch = () => {
    http++;
    return Promise.resolve(Response.json({}));
  };
  await rejects(() =>
    executeMail(
      "mail_send_batch",
      p,
      () => Promise.reject(new NativeError(403, "forbidden")),
      { env, fetch: fetcher },
    )
  );
  assert(http === 0);
  await rejects(() =>
    executeMail("mail_send_batch", p, () => Promise.resolve({}), {
      env: () => undefined,
      fetch: fetcher,
    })
  );
  assert(http === 0);
});
Deno.test("mail Edge checks native OAuth and Owner budget before mail SQL", async () => {
  let calls = 0;
  const response = await handleNativeAdmin(
    request({ version: 1, action: "mail_list" }),
    {
      ...authDeps(),
      environment: "sandbox",
      resolve: () => Promise.resolve(account),
      begin: () => Promise.reject(new NativeError(403, "forbidden")),
      mailExecute: () => {
        calls++;
        return Promise.resolve({});
      },
    },
  );
  assert(response.status === 403 && calls === 0);
  const valid = await handleNativeAdmin(
    request({ version: 1, action: "mail_list" }),
    {
      ...authDeps(),
      environment: "sandbox",
      resolve: () => Promise.resolve(account),
      begin: () => Promise.resolve(true),
      mailExecute: (actor, action) => {
        assert(actor === account && action === "mail_list");
        calls++;
        return Promise.resolve({
          campaigns: [],
          counts: {},
          quota_remaining: 300,
        });
      },
    },
  );
  assert(valid.status === 200 && Number(calls) === 1);
});
Deno.test("mail only claimed and still consented recipient sent; receipt and unsubscribe headers", async () => {
  let claimed = false, sent = 0, finished = false;
  const run: MailRun = (a, args) => {
    if (a === "mail_claim") {
      if (claimed) return Promise.resolve({ delivery: null });
      claimed = true;
      return Promise.resolve({
        delivery: { id, email: "yes@example.invalid", locale: "pt-BR" },
        content: content["pt-BR"],
      });
    }
    if (a === "mail_can_send") return Promise.resolve({ allowed: true });
    if (a === "mail_finish") {
      assert(args.status === "accepted" && args.provider_id === "fake-receipt");
      finished = true;
    }
    return Promise.resolve({});
  };
  await executeMail("mail_send_batch", p, run, {
    env,
    fetch: (_url, init) => {
      const b = JSON.parse(String(init?.body));
      assert(
        b.to.length === 1 && b.to[0].email === "yes@example.invalid" &&
          b.headers["List-Unsubscribe-Post"] === "List-Unsubscribe=One-Click" &&
          b.htmlContent.includes("Cancelar todos"),
      );
      sent++;
      return Promise.resolve(Response.json({ messageId: "fake-receipt" }));
    },
  });
  assert(sent === 1 && finished);
});
Deno.test("mail no remaining quota or pending consent means no provider HTTP", async () => {
  let http = 0;
  await executeMail(
    "mail_send_batch",
    p,
    () => Promise.resolve({ delivery: null }),
    {
      env,
      fetch: () => {
        http++;
        throw new Error("unexpected network");
      },
    },
  );
  assert(http === 0);
  let calls = 0;
  await executeMail("mail_send_batch", p, (a) => {
    if (a === "mail_claim") {
      return Promise.resolve({
        delivery: ++calls === 1
          ? { id, email: "gone@example.invalid", locale: "es" }
          : null,
        content: content.es,
      });
    }
    return Promise.resolve({ allowed: false });
  }, {
    env,
    fetch: () => {
      http++;
      throw new Error("unexpected network");
    },
  });
  assert(http === 0);
});
Deno.test("mail transport timeout records uncertain and never retries", async () => {
  let sent = 0, finish = 0;
  await executeMail("mail_send_batch", p, (a, args) => {
    if (a === "mail_claim") {
      return Promise.resolve({
        delivery: { id, email: "yes@example.invalid", locale: "es" },
        content: content.es,
      });
    }
    if (a === "mail_can_send") return Promise.resolve({ allowed: true });
    if (a === "mail_finish") {
      assert(args.status === "uncertain");
      finish++;
    }
    return Promise.resolve({});
  }, {
    env,
    fetch: () => {
      sent++;
      throw new TypeError("connection lost");
    },
  });
  assert(sent === 1 && finish === 1);
});
Deno.test("mail AI exact model/high/four locales, review only, no save approve or send", async () => {
  const actions: string[] = [];
  const result = await executeMail("mail_draft", {
    ...p,
    brief: "Novedades",
    template: "news",
  }, (a) => {
    actions.push(a);
    return Promise.resolve({ campaign: { revision: 1, state: "draft" } });
  }, {
    env,
    fetch: (url, init) => {
      assert(String(url) === "https://api.anthropic.com/v1/messages");
      const b = JSON.parse(String(init?.body));
      assert(
        b.model === "claude-opus-5-5" && b.output_config.effort === "high",
      );
      return Promise.resolve(
        Response.json({
          stop_reason: "end_turn",
          content: [{ type: "text", text: JSON.stringify(content) }],
        }),
      );
    },
  });
  assert(
    mailContent(result.content) && actions.join(",") === "mail_list,mail_get",
  );
});
Deno.test("mail AI malformed/truncated JSON and stale draft are refused", async () => {
  for (
    const output of [{ stop_reason: "max_tokens", content: [] }, {
      stop_reason: "end_turn",
      content: [{ type: "text", text: '{"es":{}}' }],
    }]
  ) {
    await rejects(() =>
      executeMail(
        "mail_draft",
        { ...p, brief: "B", template: "offer" },
        () => Promise.resolve({ campaign: { revision: 1, state: "draft" } }),
        {
          env,
          fetch: () => Promise.resolve(Response.json(output)),
        },
      )
    );
  }
  await rejects(() =>
    executeMail(
      "mail_draft",
      { ...p, brief: "B", template: "offer" },
      () => Promise.resolve({ campaign: { revision: 2, state: "draft" } }),
      {
        env,
        fetch: () => {
          throw new Error("no HTTP");
        },
      },
    )
  );
});
Deno.test("mail sync exact groups, removal and suppression, no implicit recipients", async () => {
  let calls = 0;
  await executeMail(
    "mail_sync",
    {},
    (a, args) =>
      Promise.resolve(
        a === "mail_sync_page"
          ? {
            contacts: [{
              email: "yes@example.invalid",
              revision: 2,
              consent: true,
              groups: ["pro"],
            }, {
              email: "no@example.invalid",
              revision: 3,
              consent: false,
              groups: null,
            }],
          }
          : a === "mail_sync_lease"
          ? {
            allowed: true,
            lease: id,
            consent: args.email === "yes@example.invalid",
            groups: args.email === "yes@example.invalid" ? ["pro"] : null,
          }
          : {},
      ),
    {
      env,
      fetch: (url, init) => {
        calls++;
        const b = JSON.parse(String(init?.body));
        if (init?.method === "PUT") {
          assert(!("email" in b));
          if (String(url).includes("yes%40")) {
            assert(
              !b.emailBlacklisted && b.listIds.join() === "2" &&
                b.unlinkListIds.length === 6,
            );
          } else {assert(
              b.emailBlacklisted && b.listIds.length === 0 &&
                b.unlinkListIds.length === 7,
            );}
        }
        return Promise.resolve(new Response(null, { status: 204 }));
      },
    },
  );
  assert(calls === 4);
});
Deno.test("mail signed one-click unsubscribe: GET and RFC8058 POST; tampering/missing token refused", async () => {
  const t = await unsubscribeToken("yes@example.invalid", secret);
  assert(await verifyUnsubscribe(t, secret) === "yes@example.invalid");
  assert(await verifyUnsubscribe(t + "x", secret) === null);
  assert(
    await verifyUnsubscribe(t, "different-local-key-with-at-least-32-chars") ===
      null,
  );
  let changes = 0;
  for (const method of ["GET", "POST"]) {
    const r = await handleUnsubscribe(
      new Request(`https://project.invalid/?t=${t}`, { method }),
      {
        env,
        unsubscribe: (email) => {
          assert(email === "yes@example.invalid");
          changes++;
          return Promise.resolve();
        },
      },
    );
    assert(r.status === 200 && !r.headers.get("Location"));
  }
  assert(Number(changes) === 2);
  const bad = await handleUnsubscribe(
    new Request("https://project.invalid/?email=yes@example.invalid"),
    {
      env,
      unsubscribe: () => {
        throw new Error("no");
      },
    },
  );
  assert(bad.status === 400);
});
Deno.test("mail Brevo webhook authentication, duplicate withdrawals and failure retry", async () => {
  const key = "local-webhook-fixture-longer-than-32-characters";
  let changes = 0;
  const make = (header: string) =>
    new Request("https://project.invalid/", {
      method: "POST",
      headers: { "X-Vantare-Webhook-Key": header },
      body: JSON.stringify({
        event: "unsubscribe",
        email: "yes@example.invalid",
      }),
    });
  const deps = {
    env: () => key,
    unsubscribe: () => {
      changes++;
      return Promise.resolve();
    },
  };
  assert(
    (await handleMailWebhook(make("bad"), deps)).status === 401 &&
      changes === 0,
  );
  for (let i = 0; i < 2; i++) {
    assert((await handleMailWebhook(make(key), deps)).status === 204);
  }
  assert(Number(changes) === 2);
  assert(
    (await handleMailWebhook(make(key), {
      env: () => key,
      unsubscribe: () => Promise.reject(new Error("SQL down")),
    })).status === 503,
  );
});

Deno.test("mail byte caps preserve legacy malformed rejection and cancel oversized streams", async () => {
  const base = request({ version: 1, action: "mail_list" });
  const raw = new Request(base.url, {
    method: "POST",
    headers: base.headers,
    body: "x".repeat(9000),
  });
  assert((await handleNativeAdmin(raw)).status === 413);
  const large = new Request(base.url, {
    method: "POST",
    headers: base.headers,
    body: new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode("x".repeat(140000)));
        c.close();
      },
    }),
  });
  assert((await handleNativeAdmin(large)).status === 413);
  const result = await handleNativeAdmin(
    request({
      version: 1,
      action: "mail_save",
      ...p,
      name: "Large draft",
      template: "news",
      target_group: "testers",
      content: Object.fromEntries(
        ["es", "en", "it", "pt-BR"].map(
          (l) => [l, { subject: "S", body: "a".repeat(4000) }],
        ),
      ),
    }),
    {
      ...authDeps(),
      environment: "sandbox",
      resolve: () => Promise.resolve(account),
      begin: () => Promise.resolve(true),
      mailExecute: () => Promise.resolve({}),
    },
  );
  assert(result.status === 200);
});
