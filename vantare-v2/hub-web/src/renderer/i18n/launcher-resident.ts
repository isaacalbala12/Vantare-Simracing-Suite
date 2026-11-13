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
  readOnly: "Responder desde el Hub estará disponible próximamente.",
  answerHelp:
    "Elige una respuesta para la pregunta actual. Cerrar este panel no responde ni cancela la secuencia.",
  trustUnavailable:
    "La autorización de aplicaciones requiere revisar el perfil en el editor. No se puede conceder desde esta pregunta.",
  answerUnavailable:
    "Esta pregunta no está disponible para responder con la cuenta y el residente actuales.",
  answerState: {
    sending: "Enviando la respuesta al residente…",
    queued: "Respuesta enviada. Esperando el recibo del residente…",
    accepted: "Respuesta aceptada. La secuencia sigue en curso.",
    rejected: "El residente ha rechazado la respuesta. No se ha aplicado.",
    unknown:
      "Resultado desconocido: no se ha podido confirmar la respuesta. No se repetirá automáticamente.",
    finished: "La secuencia ha terminado.",
    failed: "La secuencia ha terminado con un fallo.",
    cancelled: "La secuencia se ha cancelado.",
  },
  failed: "El residente ha informado de un error.",
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
