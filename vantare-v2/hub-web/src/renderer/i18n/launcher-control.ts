import type { ControlRejection } from "../screens/launcher/resident-control-model";
import { residentText } from "./launcher-resident.ts";
export const controlText = {
  title: "Estado de la orden del Launcher",
  rehearse: "Prueba sin el juego",
  cancel: "Cancelación",
  retryFailed: "Reintentar fallidos",
  retryAll: "Repetir los mismos pasos",
  resultUnknown:
    "No se conserva una terminación comprobada de esta secuencia. No se puede repetir.",
  noFailed: "No hay pasos fallidos que se puedan reintentar.",
  cancelAction: "Cancelar secuencia actual",
  rehearseHelp:
    "Prueba los pasos del perfil salvo Le Mans Ultimate. No cambia el perfil ni sus disparadores. Puede pedirte una decisión.",
  cancelHelp:
    "Solicita cancelar la secuencia actual. Puede pedirte qué aplicaciones dejar abiertas o cerrar.",
  sending: "Enviando la orden al residente…",
  queued: "Orden enviada. Esperando el recibo del residente…",
  accepted: "Orden aceptada. La secuencia sigue en curso.",
  rejected: "Orden rechazada. No se ha aplicado.",
  unknown:
    "Resultado desconocido: no se ha podido confirmar la orden. No se repetirá automáticamente.",
  completed: "La secuencia ha terminado.",
  cancelled: "La secuencia ha terminado cancelada.",
  failed: "La secuencia ha terminado con un fallo.",
  cleanupFailed:
    "La secuencia ha terminado con un fallo al cerrar aplicaciones.",
  unavailable: "No se puede comprobar el residente o la conexión actual.",
  unsupported:
    "El residente actual no admite cancelar ni probar perfiles de forma comprobada.",
  account: "La ejecución pertenece a otra sesión de cuenta.",
  denied:
    "Necesitas permisos vigentes y estar fuera de pista para probar el perfil.",
  busy: "Hay una orden pendiente o una secuencia en curso. Espera antes de volver a probar.",
  changed: "El perfil o la ejecución han cambiado. Revisa el estado actual.",
  scanning: "Espera a que termine la detección de aplicaciones.",
  active: "No hay una ejecución comprobada que se pueda cancelar.",
  rejection: {
    ...residentText.rejection,
    "document-unavailable":
      "No se puede leer el perfil guardado. No se ha iniciado la prueba.",
    "no-steps": "Este perfil no tiene pasos que probar sin Le Mans Ultimate.",
    "start-failed": "No se pudo iniciar la secuencia.",
    "unknown-run":
      "No se puede comprobar la secuencia anterior. No se ha repetido.",
    "no-failed-steps": "No hay pasos fallidos que se puedan reintentar.",
  } satisfies Record<
    ControlRejection | "unknown-run" | "no-failed-steps",
    string
  >,
};
