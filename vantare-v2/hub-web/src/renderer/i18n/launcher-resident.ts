import type {
  RegistrationState,
  ResidentQuestionKind,
} from "../../contract/generated/contract";
export const residentText = {
  title: "Decisión de lanzamiento",
  close: "Cerrar",
  closeSymbol: "×",
  pending: "Hay una decisión de lanzamiento pendiente.",
  open: "Ver decisión",
  readOnly:
    "Responder a decisiones desde el Hub estará disponible próximamente.",
  failed: "El lanzamiento no se completó.",
  question: {
    authorization:
      "El residente solicita tu autorización antes de lanzar una aplicación.",
    alreadyRunning: "Una aplicación de este perfil ya está abierta.",
    failure: "Un paso del lanzamiento necesita una decisión.",
    closing:
      "El residente necesita saber qué hacer con las aplicaciones iniciadas.",
    generic: "El residente está esperando una decisión.",
  } satisfies Record<ResidentQuestionKind, string>,
  registration: {
    registered: "Registrado en Windows",
    inactive: "Sin registro activo",
    error: "No se pudo registrar el atajo en Windows.",
    unconfirmed: "Registro no confirmado · abre Vantare desde el instalador",
  } satisfies Record<RegistrationState, string>,
};
