import { handleLicenseCredentialRequest } from "./index.ts";
import type { CredentialDeps } from "../_shared/license-credential.ts";

for (const method of ["POST", "GET", "PUT", "PATCH", "DELETE", "HEAD"]) {
  for (const bearer of [false, true]) {
    Deno.test(`retired license-credential: ${method}, bearer=${bearer}, no account I/O or signing`, async () => {
      let calls = 0;
      const forbidden = () => { calls++; throw new Error("retired route reached dependencies"); };
      const deps: CredentialDeps = { store: { load: forbidden }, sign: forbidden, now: forbidden,
        get environment() { return forbidden(); } };
      const response = await handleLicenseCredentialRequest(new Request("https://local.invalid/license-credential", {
        method, headers: bearer ? { Authorization: "Bearer fixture-only" } : {},
        ...(["POST", "PUT", "PATCH"].includes(method) ? { body: "invalid JSON" } : {}),
      }), deps);
      const value = await response.json();
      if (response.status !== 410 || response.headers.get("Cache-Control") !== "no-store" ||
        value.error !== "endpoint_retired" || value.credential !== undefined || calls !== 0) {
        throw new Error("tombstone contract failed");
      }
    });
  }
}

Deno.test("retired route preserves CORS preflight so browsers can receive Gone", async () => {
  const response = await handleLicenseCredentialRequest(new Request("https://local.invalid/license-credential", { method: "OPTIONS" }));
  if (response.status !== 200 || response.headers.get("Access-Control-Allow-Origin") !== "*") {
    throw new Error("CORS preflight failed");
  }
});
