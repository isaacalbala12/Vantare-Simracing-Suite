import type { ControlRejection } from "../screens/launcher/resident-control-model";
import { residentText } from "./launcher-resident.ts";
export const controlText = {
  title: "Estado de la orden del Launcher",
  rehearse: "Prueba sin el juego",
  cancel: "CancelaciÃ³n",
  cancelAction: "Cancelar secuencia actual",
  rehearseHelp:
    "Prueba los pasos del perfil salvo Le Mans Ultimate. No cambia el perfil ni sus disparadores. Puede pedirte una decisiÃ³n.",
  cancelHelp:
    "Solicita cancelar la secuencia actual. Puede pedirte quÃ© aplicaciones dejar abiertas o cerrar.",
  sending: "Enviando la orden al residenteâ€¦",
  queued: "Orden enviada. Esperando el recibo del residenteâ€¦",
  accepted: "Orden aceptada. La secuencia sigue en curso.",
  rejected: "Orden rechazada. No se ha aplicado.",
  unknown:
    "Resultado desconocido: no se ha podido confirmar la orden. No se repetirÃ¡ automÃ¡ticamente.",
  completed: "La secuencia ha terminado.",
  cancelled: "La secuencia ha terminado cancelada.",
  failed: "La secuencia ha terminado con un fallo.",
  cleanupFailed:
    "La secuencia ha terminado con un fallo al cerrar aplicaciones.",
  unavailable: "No se puede comprobar el residente o la conexiÃ³n actual.",
  unsupported:
    "El residente actual no admite cancelar ni probar perfiles de forma comprobada.",
  account: "La ejecuciÃ³n pertenece a otra sesiÃ³n de cuenta.",
  denied:
    "Necesitas permisos vigentes y estar fuera de pista para probar el perfil.",
  busy: "Hay una orden pendiente o una secuencia en curso. Espera antes de volver a probar.",
  changed: "El perfil o la ejecuciÃ³n han cambiado. Revisa el estado actual.",
  scanning: "Espera a que termine la detecciÃ³n de aplicaciones.",
  active: "No hay una ejecuciÃ³n comprobada que se pueda cancelar.",
  rejection: {
    ...residentText.rejection,
    "document-unavailable":
      "No se puede leer el perfil guardado. No se ha iniciado la prueba.",
    "no-steps": "Este perfil no tiene pasos que probar sin Le Mans Ultimate.",
    "start-failed": "No se pudo iniciar la secuencia.",
  } satisfies Record<ControlRejection, string>,
};
