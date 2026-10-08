import { handleLicenseCredentialRequest } from "../_shared/license-credential.ts";
export * from "../_shared/license-credential.ts";
if (import.meta.main) {
  Deno.serve((request) => handleLicenseCredentialRequest(request));
}
