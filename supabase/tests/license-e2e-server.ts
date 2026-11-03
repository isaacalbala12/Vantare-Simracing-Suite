// QA-only executable, never imported by a deployed function. Network permission is loopback only.
import { createClient } from "@supabase/supabase-js";
import { handleNativeLicenseRequest } from "../functions/native-license/index.ts";
import {
  loadCredentialAccount,
  signCredential,
} from "../functions/_shared/license-credential.ts";
import { handleNativeAccountAuthorize } from "../functions/native-account-authorize/index.ts";
import { resolveNativeAccount } from "../functions/_shared/native-auth.ts";
import { testToken } from "../functions/native-account-authorize/testdata/signing.ts";
import { handleWebhookRequest } from "../functions/billing-webhook/index.ts";
import { processPolarWebhookEvent } from "../functions/billing-webhook/process.ts";
import { verifyStandardWebhook } from "../functions/_shared/webhook-verify.ts";
import { loadPolarProductMap } from "../functions/_shared/mapping.ts";
import { VALID_POLAR_PRODUCT_MAP_JSON } from "../functions/_shared/test-fixtures.ts";

const [readyPath, initialClock, portText] = Deno.args;
const safeRoot = "/mnt/d/VantareServer/qa/licencias-e2e/";
if (
  ![readyPath, initialClock].every((p) => p.startsWith(safeRoot)) ||
  !/^\d+$/.test(portText)
) throw Error("qa_arguments");
const ready = JSON.parse(await Deno.readTextFile(readyPath));
const origin = `http://127.0.0.1:${Number(portText)}`;
if (new URL(ready.postgrest).hostname !== "127.0.0.1") {
  throw Error("qa_postgrest");
}
const logicalIssuer = "https://fixture.clerk.invalid";
let clockPath = initialClock;
let currentSubject = "user_" + "a".repeat(27);
let mode = "normal";
let licenseRequests = 0;
let held = false;
let release: (() => void) | undefined;
const codes = new Map<
  string,
  { subject: string; challenge: string; redirect: string }
>();
const shutdown = new AbortController();
let networkServer: Deno.HttpServer<Deno.NetAddr> | undefined;
const tokens = new Map<string, string>();
const refreshes = new Map<string, string>();
const opaque = () => crypto.randomUUID();
async function now() {
  const tick = JSON.parse(await Deno.readTextFile(clockPath));
  return new Date(tick.wall_ms + Date.now() - tick.real_anchor_ms);
}
function base64(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll(
    "/",
    "_",
  ).replaceAll("=", "");
}
const service = await testToken(
  {
    role: "service_role",
    aud: "vantare-native-data",
    exp: Math.floor(Date.now() / 1000) + 7200,
  },
  { alg: "ES256", kid: JSON.parse(ready.privateJwk).kid, typ: "JWT" },
  ready.privateJwk,
);
const admin = createClient(ready.postgrest, "qa-public", {
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    headers: { Authorization: `Bearer ${service}` },
    fetch: (input, init) =>
      fetch(String(input).replace("/rest/v1/", "/"), init),
  },
});
// Public RFC8032 test seed; never a product signing key.
const seed = "9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60";
const der = "302e020100300506032b657004220420" + seed;
const key = await crypto.subtle.importKey(
  "pkcs8",
  Uint8Array.from(der.match(/../g)!.map((v) => parseInt(v, 16))),
  "Ed25519",
  false,
  ["sign"],
);
const nativeDeps = {
  config: {
    issuer: logicalIssuer,
    clientId: "qa-native",
    secretKey: "qa-fake-idp",
  },
  now,
  fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.origin !== "https://api.clerk.com") {
      throw Error(
        "external_provider_blocked",
      );
    }
    return await fetch(origin + "/clerk" + url.pathname, init);
  },
};
async function account(subject = currentSubject) {
  return await resolveNativeAccount(logicalIssuer, subject, admin);
}
async function checked<T>(
  query: PromiseLike<{ data: T; error: unknown }>,
): Promise<T> {
  const result = await query;
  if (result.error) throw Error("qa_database_operation_failed");
  return result.data;
}
async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const route = url.pathname;
  const time = await now();
  const native = { ...nativeDeps, now: () => time };
  if (route === "/qa/stop") {
    release?.();
    await networkServer?.shutdown();
    setTimeout(() => shutdown.abort(), 100);
    return Response.json({ ok: true });
  }
  if (route === "/qa/stats") {
    return Response.json({ licenseRequests, held, mode });
  }
  if (route === "/qa/control") {
    const body = await req.json();
    if (body.network === true) {
      if (networkServer) throw Error("qa_network_already_started");
      networkServer = Deno.serve({
        hostname: "127.0.0.1",
        port: 0,
        onListen: () => {},
      }, serve);
      return Response.json({
        origin: `http://127.0.0.1:${networkServer.addr.port}`,
      });
    }
    if (body.network === false) {
      await networkServer?.shutdown();
      networkServer = undefined;
    }
    if (body.clock) {
      if (
        !body.clock.startsWith(safeRoot) || !body.clock.endsWith("/clock.json")
      ) throw Error("qa_clock_path");
      await Deno.readTextFile(body.clock);
      clockPath = body.clock;
    }
    if (body.identity) {
      if (!["a", "b"].includes(body.identity)) throw Error("qa_identity");
      currentSubject = "user_" + body.identity.repeat(27);
    }
    if (body.mode) {
      if (!["normal", "offline", "unauthorized", "hold"].includes(body.mode)) {
        throw Error("qa_mode");
      }
      mode = body.mode;
      if (mode !== "hold") {
        release?.();
        release = undefined;
        held = false;
      }
    }
    if (body.grant) {
      const id = await account();
      await checked(
        admin.from("billing_access_grants").delete().eq("user_id", id),
      );
      await checked(
        admin.from("operational_access_assignments").delete().eq("user_id", id),
      );
      const duration = Number(body.seconds ?? 120);
      const end = new Date(time.getTime() + duration * 1000).toISOString();
      if (body.grant === "tester") {
        await checked(
          admin.from("operational_access_assignments").insert({
            user_id: id,
            role: "tester",
            status: "active",
            expires_at: end,
            policy_version: 1,
            granted_at: time.toISOString(),
            granted_by: "qa-e2e",
            grant_reason: "isolated fixture",
            correlation_id: "qa-e2e-" + opaque(),
          }),
        );
      } else if (["pro", "founders"].includes(body.grant)) {
        const founders = body.grant === "founders";
        await checked(
          admin.from("billing_access_grants").insert({
            user_id: id,
            provider: "polar",
            environment: "sandbox",
            source_type: founders ? "order" : "subscription",
            source_id: "qa-" + opaque(),
            capability: founders ? "vantare.plan.founders" : "vantare.plan.pro",
            status: "active",
            valid_until: founders ? null : end,
            resource_modified_at: time.toISOString(),
            snapshot_hash: "a".repeat(64),
          }),
        );
      } else if (body.grant !== "free") throw Error("qa_grant");
      if (body.customer) {
        await checked(
          admin.from("billing_customers").upsert({
            user_id: id,
            provider: "polar",
            environment: "sandbox",
            provider_customer_id: "qa-customer",
          }, { onConflict: "provider,environment,provider_customer_id" }),
        );
      }
    }
    return Response.json({ ok: true });
  }
  if (route === "/.well-known/openid-configuration") {
    return Response.json({
      issuer: origin,
      authorization_endpoint: origin + "/authorize",
      token_endpoint: origin + "/token",
      userinfo_endpoint: origin + "/userinfo",
      code_challenge_methods_supported: ["S256"],
    });
  }
  if (route === "/authorize") {
    const redirect = new URL(url.searchParams.get("redirect_uri")!);
    if (redirect.protocol !== "http:" || redirect.hostname !== "127.0.0.1") {
      return new Response(null, { status: 400 });
    }
    const code = opaque();
    codes.set(code, {
      subject: currentSubject,
      challenge: url.searchParams.get("code_challenge")!,
      redirect: redirect.href,
    });
    redirect.searchParams.set("code", code);
    redirect.searchParams.set("state", url.searchParams.get("state")!);
    return new Response(null, {
      status: 302,
      headers: { Location: redirect.href },
    });
  }
  if (route === "/token") {
    const body = new URLSearchParams(await req.text());
    let subject: string | undefined;
    if (body.get("grant_type") === "authorization_code") {
      const code = body.get("code")!;
      const entry = codes.get(code);
      codes.delete(code);
      const challenge = base64(
        new Uint8Array(
          await crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode(body.get("code_verifier")!),
          ),
        ),
      );
      if (
        entry && entry.challenge === challenge &&
        entry.redirect === body.get("redirect_uri")
      ) subject = entry.subject;
    } else subject = refreshes.get(body.get("refresh_token")!);
    if (!subject || body.get("client_id") !== "qa-native") {
      return Response.json({ error: "invalid_grant" }, { status: 400 });
    }
    const access = opaque(), refresh = opaque();
    tokens.set(access, subject);
    refreshes.set(refresh, subject);
    return Response.json({
      access_token: access,
      refresh_token: refresh,
      token_type: "Bearer",
      expires_in: 3600,
    });
  }
  const bearer = req.headers.get("Authorization")?.replace(/^Bearer /, "") ??
    "";
  if (route === "/userinfo") {
    const subject = tokens.get(bearer);
    return subject
      ? Response.json({ sub: subject, name: "QA fixture" })
      : new Response(null, { status: 401 });
  }
  if (route === "/clerk/oauth_applications/access_tokens/verify") {
    const body = await req.json();
    const subject = tokens.get(body.access_token);
    return subject
      ? Response.json({
        object: "clerk_idp_oauth_access_token",
        client_id: "qa-native",
        subject,
        scopes: ["openid", "profile", "offline_access"],
        revoked: false,
        expired: false,
        expiration: time.getTime() / 1000 + 3600,
      })
      : new Response(null, { status: 400 });
  }
  if (route.startsWith("/clerk/v1/users/")) {
    return Response.json({
      id: route.split("/").at(-1),
      banned: false,
      locked: false,
      primary_email_address_id: null,
      email_addresses: [],
      first_name: null,
      last_name: null,
      created_at: 1,
      last_sign_in_at: null,
    });
  }
  if (route === "/functions/v1/native-license") {
    licenseRequests++;
    if (mode === "offline") return new Response(null, { status: 503 });
    if (mode === "unauthorized") return new Response(null, { status: 401 });
    const response = await handleNativeLicenseRequest(req, {
      ...native,
      environment: "sandbox",
      load: async (issuer, subject, fingerprint, environment) => {
        const id = await checked(
          admin.rpc("native_claim_license_device", {
            issuer,
            subject,
            device_fingerprint: fingerprint,
          }),
        );
        return await loadCredentialAccount(
          admin,
          id as string,
          fingerprint,
          environment,
        );
      },
      sign: (claims) => signCredential(claims, "qa-rfc8032", key),
    });
    if (mode === "hold") {
      held = true;
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    }
    return response;
  }
  if (route === "/functions/v1/native-account-authorize") {
    return await handleNativeAccountAuthorize(req, {
      ...native,
      resolve: (issuer, subject) =>
        resolveNativeAccount(issuer, subject, admin),
      signing: { privateJwk: ready.privateJwk, supabaseUrl: origin },
    });
  }
  if (route.startsWith("/rest/v1/")) {
    return await fetch(ready.postgrest + route.slice(8), {
      method: req.method,
      headers: req.headers,
      body: req.method === "GET" ? undefined : await req.arrayBuffer(),
    });
  }
  if (route === "/functions/v1/native-billing-checkout") {
    return Response.json({
      url: "https://sandbox.polar.sh/checkout/qa-e2e-never-opened",
      reused: false,
    });
  }
  if (route === "/functions/v1/billing-webhook") {
    return await handleWebhookRequest(req, {
      getSecret: () => "qa-e2e-webhook-local-only",
      getSupabase: () => admin,
      now: () => time,
      verifyWebhook: (body, headers) =>
        verifyStandardWebhook(
          body,
          headers,
          new TextEncoder().encode("qa-e2e-webhook-local-only"),
          300,
          time.getTime() / 1000,
        ),
      processEvent: (event, id, deps) =>
        processPolarWebhookEvent(event, id, {
          ...deps,
          now: () => time,
          loadMap: () => loadPolarProductMap(VALID_POLAR_PRODUCT_MAP_JSON),
        }),
    });
  }
  return new Response(null, { status: 404 });
}
async function serve(req: Request): Promise<Response> {
  try {
    const response = await handler(req);
    const headers = new Headers(response.headers);
    headers.set("Date", (await now()).toUTCString());
    return new Response(response.body, { status: response.status, headers });
  } catch {
    console.error("qa-e2e handler failed", new URL(req.url).pathname);
    return Response.json({ error: "qa_handler_failed" }, { status: 500 });
  }
}
Deno.serve({
  signal: shutdown.signal,
  hostname: "127.0.0.1",
  port: Number(portText),
  onListen: () => console.log("qa-e2e local backend ready"),
}, serve);
