import type { AccountRequest } from "../../contract/generated/account";
/** Called immediately after MessagePort has synchronously cloned the request. */
export function discardAccountSecrets(request: AccountRequest) {
  if (request.method !== "account.email") return;
  const action = request.action;
  switch (action.action) {
    case "begin":
    case "reset":
      action.password = "";
      break;
    case "verify":
      action.code = "";
      break;
    default:
      break;
  }
}
