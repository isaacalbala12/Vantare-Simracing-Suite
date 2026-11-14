import type { RemovalReason } from "../screens/launcher/resident-removal-model";
export const removalText = {
  scope:
    "Solo se comprueban las aplicaciones que pertenecen a este residente. No incluye procesos externos ni otros Hubs.",
  sending: "Enviando la solicitud de borrado…",
  queued: "Solicitud en cola; todavía no se ha confirmado el borrado.",
  accepted: "Solicitud aceptada; esperando la confirmación del borrado.",
  unknown:
    "Borrado desconocido. Falta la confirmación del residente; no se volverá a enviar automáticamente.",
  removed: "El residente ha confirmado el borrado del perfil.",
  close: "Cerrar",
  confirm: "Eliminar",
  title: "Eliminar perfil",
  message: (name: string) =>
    `¿Eliminar «${name}»? Esta acción no se puede deshacer.`,
  reasons: {
    "wrong-instance":
      "El residente ha cambiado. Cierra este diálogo y revisa el perfil de nuevo.",
    "account-changed":
      "La cuenta ha cambiado. Cierra este diálogo y revisa el perfil de nuevo.",
    "authority-unavailable":
      "No se ha podido comprobar la cuenta. No se ha confirmado el borrado.",
    denied: "No tienes permiso para eliminar este perfil en este momento.",
    busy: "Hay una operación pendiente. No se puede solicitar otro borrado.",
    "revision-mismatch":
      "El perfil ha cambiado. Cierra este diálogo y revisa la versión actual.",
    "document-unavailable":
      "El documento de perfiles está protegido o no se ha podido leer.",
    "ownership-unknown":
      "Propiedad desconocida. No se puede comprobar si quedan aplicaciones propias abiertas.",
    "owned-live":
      "Este residente aún conserva aplicaciones propias abiertas de este perfil. Ciérralas antes de eliminarlo.",
    "write-conflict":
      "Los perfiles han cambiado desde otro sitio. No se ha confirmado el borrado.",
    io: "No se ha podido guardar el borrado del perfil.",
    unsupported: "Este residente no admite el borrado comprobado de perfiles.",
    rejected: "La solicitud de borrado no se ha aceptado.",
    unavailable:
      "No se puede conectar con el residente para comprobar el borrado.",
  } satisfies Record<RemovalReason, string>,
};
