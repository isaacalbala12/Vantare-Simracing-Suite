import type {
  RegistrationState,
  ResidentQuestionKind,
} from "../../contract/generated/contract";
import type { AnswerRejection } from "../screens/launcher/resident-answer-model";
export const residentText = {
  title: "Decisión de lanzamiento",
  close: "Cerrar",
  closeSymbol: "×",
  pending: "Hay una decisión de lanzamiento pendiente.",
  open: "Ver decisión",
  readOnly: "El residente actual no permite responder desde este Hub.",
  answerStatusLabel: "Estado de la respuesta al residente",
  answerHelp:
    "Elige una respuesta para la pregunta actual. Cerrar este panel no responde ni cancela la secuencia.",
  trustUnavailable:
    "La autorización de aplicaciones requiere revisar el perfil en el editor. No se puede conceder desde esta pregunta.",
  answerUnavailable:
    "Esta pregunta no está disponible para responder con la cuenta y el residente actuales.",
  rejection: {
    "wrong-instance": "El residente ha cambiado. Revisa la pregunta actual.",
    "account-changed": "La cuenta ha cambiado. Revisa la pregunta actual.",
    "authority-unavailable": "No se pueden comprobar los permisos actuales.",
    denied: "Los permisos actuales no permiten esta respuesta.",
    "revision-mismatch": "El perfil ha cambiado. Revisa la pregunta actual.",
    "unscoped-run": "Esta ejecución no admite respuestas comprobadas.",
    "wrong-run": "La pregunta pertenece a otra ejecución.",
    "stale-question":
      "La pregunta ha cambiado o ha caducado. Revisa la pregunta actual.",
    "invalid-action": "Esta acción no está ofrecida en la pregunta actual.",
    "trust-requires-editor":
      "La autorización requiere revisar el perfil en el editor.",
    unavailable: "El residente no está disponible para recibir esta respuesta.",
    busy: "Hay otra orden pendiente. Espera antes de volver a responder.",
    unsupported: "El residente actual no admite esta operación.",
    rejected: "No se ha aceptado la respuesta. Revisa la pregunta actual.",
  } satisfies Record<AnswerRejection, string>,
  answerState: {
    sending: "Enviando la respuesta al residente…",
    queued: "Respuesta enviada. Esperando el recibo del residente…",
    accepted: "Respuesta aceptada. La secuencia sigue en curso.",
    rejected: "Respuesta rechazada. No se ha aplicado.",
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
