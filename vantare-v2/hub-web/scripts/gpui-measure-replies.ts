import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

/** Contract data for the existing local ui-quality peers; no account or credential. */
export async function gpuiReplies() {
  const control = await readFile(
    resolve("../native/ipc/src/control.rs"),
    "utf8",
  );
  const version = control.match(/pub const VERSION: u32 = (\d+);/);
  assert.ok(version, "control version must come from Rust");
  const protocol = await readFile(
    resolve("../native/ipc/src/services_protocol.rs"),
    "utf8",
  );
  const commands = protocol.slice(
    protocol.indexOf("pub enum Command"),
    protocol.indexOf("pub enum Reply"),
  );
  const replies: Record<string, unknown> = Object.fromEntries(
    [...commands.matchAll(/^ {4}([A-Z][A-Za-z0-9_]*)[, {]/gm)].map((match) => [
      match[1],
      { result: "Error", message: "QA local: operación no usada en medición" },
    ]),
  );
  const policy = {
    version: Number(version[1]),
    epoch: 1,
    revision: 1,
    checked_at_ms: Date.now(),
    state: { kind: "active" },
    signed_until_ms: null,
    grace_until_ms: null,
    catalog: "pro",
    engineer: false,
    strategy: false,
    analysis: false,
    calendar: false,
    tester: false,
    live: false,
    error: null,
  };
  const account = {
    result: "Account",
    session: "SignedIn",
    copy_link: false,
    signed_in: true,
    profile: { name: "Piloto QA", image_url: null, image_jpeg: null },
    expires_at: null,
    pending: false,
    message: "QA local, sin cuenta real",
    error: null,
  };
  return {
    ...replies,
    fresh_policy: true,
    core_policy: policy,
    Status: { result: "Status", account_configured: true, message: "QA local" },
    AccountPoll: account,
    AccountProfileRefresh: account,
    LicenseStatus: {
      result: "LicenseStatus",
      policy,
      session: "SignedIn",
      notice: null,
    },
    MailConsentGet: {
      result: "MailConsent",
      consent: false,
      locale: null,
      revision: 0,
    },
    CalendarRefresh: { result: "Calendar", schedule: null, fallback: null },
    RoadmapCached: {
      result: "Roadmap",
      publication: null,
      fetched_at: null,
      stale: true,
      message: "QA sin red",
    },
  };
}
