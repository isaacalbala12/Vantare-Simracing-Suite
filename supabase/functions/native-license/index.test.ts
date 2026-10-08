import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleNativeLicenseRequest } from "./index.ts";
import {
  account,
  authDeps,
  request,
} from "../native-account-authorize/testdata/auth.ts";
const fingerprint = "a".repeat(64);
Deno.test("native license signs internal account and preserves one-device rule", async () => {
  for (const deviceMatches of [true, false]) {
    const response = await handleNativeLicenseRequest(
      request({ version: 1, deviceFingerprint: fingerprint }),
      {
        ...authDeps(),
        environment: "sandbox",
        load: async () => ({ accountId: account, deviceMatches, grants: [] }),
        sign: async (claims) => ({
          version: 1,
          algorithm: "Ed25519",
          key_id: "test-only",
          claims,
          signature: "test-only",
        }),
      },
    );
    assertEquals(response.status, deviceMatches ? 200 : 409);
    const body = await response.json();
    if (deviceMatches) assertEquals(body.credential.claims.subject, account);
    else assertEquals(body.error, "device_limit");
  }
});
Deno.test("banned Clerk user cannot issue an offline native credential", async () => {
  let loaded = false;
  const deps = authDeps();
  const verifiedFetch = deps.fetch!;
  const response = await handleNativeLicenseRequest(
    request({ version: 1, deviceFingerprint: fingerprint }),
    {
      ...deps,
      fetch: async (url, init) => {
        const response = await verifiedFetch(url, init);
        if (!String(url).endsWith("/verify")) {
          const user = await response.json();
          return Response.json({ ...user, banned: true });
        }
        return response;
      },
      load: () => {
        loaded = true;
        throw new Error("must not load");
      },
    },
  );
  assertEquals(response.status, 403);
  assertEquals(loaded, false);
});
