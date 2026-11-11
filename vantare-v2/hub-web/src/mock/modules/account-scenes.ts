import type { AccountView } from "../../contract/generated/account";
/** Closed, local QA states. They never contact authentication or billing services. */
export function accountScene(name: string, value: AccountView): AccountView {
  const waiting = {
    ...value,
    gate: "waitingBrowser" as const,
    session: "pending" as const,
    email: null,
    copyLink: { available: true, copied: false },
  };
  switch (name) {
    case "acceso-navegador":
      return waiting;
    case "acceso-enlace-copiado":
      return { ...waiting, copyLink: { available: true, copied: true } };
    case "acceso-comprobando":
      return { ...value, gate: "checking", session: "pending" };
    case "acceso-cancelando":
      return {
        ...waiting,
        gate: "canceling",
        working: true,
        copyLink: { available: false, copied: false },
      };
    case "acceso-cerrando":
      return {
        ...value,
        gate: "loggingOut",
        session: "signedIn",
        working: true,
      };
    case "acceso-cierre-incierto":
      return {
        ...value,
        gate: "logoutFailed",
        session: "signedIn",
        canReturnAfterLogout: true,
        error:
          "No se pudo cerrar la sesión: el estado debe comprobarse de nuevo.",
      };
    case "acceso-error":
      return {
        ...value,
        gate: "choose",
        error: "No se pudo completar el acceso: vuelve a intentarlo.",
      };
    default:
      return value;
  }
}
