// deno-lint-ignore-file no-import-prefix
import {
  assertEquals,
  assertMatch,
  assertNotMatch,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

import {
  buildTestingCenterUntrustedBlock,
  sanitizeTestingCenterTesterText,
  sha256Hex,
} from "./testing-center-projection-sanitization.ts";

Deno.test("sanitizer redacts secrets, PII, URLs, paths and mentions", () => {
  const jwt = `${"a".repeat(12)}.${"b".repeat(12)}.${"c".repeat(12)}`;
  const value = `Email: pilot@example.com
Path: C:\\Users\\Isaac\\secret.txt
ghp_1234567890123456
URL: https://evil.invalid/repo
@owner`;
  const result = sanitizeTestingCenterTesterText(value);
  assertEquals(result.redactedValues > 0, true);
  assertEquals(result.truncated, false);
  assertNotMatch(result.value, /pilot@example\.com|Isaac|ghp_|https:\/\/evil/);
  assertMatch(result.value, /redacted-email/);
  assertMatch(result.value, /redacted-path/);
  assertMatch(result.value, /redacted-token/);
  assertMatch(result.value, /redacted-url/);
  assertMatch(result.value, /@\u200b/);
});

Deno.test("sanitizer truncates by UTF-8 bytes and keeps valid characters", () => {
  const value = "🏁".repeat(100);
  const result = sanitizeTestingCenterTesterText(value, 80);
  assertEquals(result.truncated, true);
  assertEquals(new TextEncoder().encode(result.value).length <= 80, true);
  assertNotMatch(result.value, /�/);
});

Deno.test("sanitizer removes RTL/control attacks while preserving inertness markers", () => {
  const attack = "`\u202ecmd` @everyone \u0007";
  const result = sanitizeTestingCenterTesterText(attack);
  assertNotMatch(result.value, /@everyone|\u202e|\u0007/);
  assertMatch(result.value, /redacted-control/);
  assertMatch(result.value, /@\u200b/);
  assertMatch(result.value, /cmd/);
});

Deno.test("untrusted block is deterministic and opaque for Markdown injection", () => {
  const block = buildTestingCenterUntrustedBlock(
    "Payload",
    sanitizeTestingCenterTesterText("attack <script>1</script>").value,
  );
  assertMatch(block, /vantare-untrusted-begin/);
  assertMatch(block, /vantare-untrusted-end/);
  assertNotMatch(block, /<script>/);
});

Deno.test("hash helper is deterministic over UTF-8 JSON", async () => {
  const payload = '{"value":"abc"}';
  const first = await sha256Hex(payload);
  const second = await sha256Hex(payload);
  assertEquals(first, second);
});
