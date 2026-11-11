export const actionText = {
  duplicate: "Duplicar",
  duplicateTitle: "Duplicar perfil",
  duplicateMessage: (name: string) => `¿Duplicar el perfil ${name}?`,
  reconfirm:
    "Para repetir esta acción, vuelve a abrirla y confírmala de nuevo.",
  remove: "Eliminar",
  favorite: "Marcar como favorito",
  unfavorite: "Quitar de favoritos",
  trigger: "Al abrir LMU",
  triggered: "LMU · activado",
  cancel: "Cancelar",
  retry: "Reintentar guardado",
  discard: "Descartar",
  removeTitle: "Eliminar perfil",
  removeMessage: (id: string) =>
    `Eliminar perfil ${id}? Esta accion no se puede deshacer.`,
  conflict:
    "El Launcher ha cambiado en otro proceso. Revisa el estado antes de reintentar.",
  failed: "No se pudo guardar el cambio. Vuelve a intentarlo.",
  retryFailed: "Reintentar si no abre",
  closeOnExit: "Cerrar mis apps al salir de Vantare",
  startup: "Iniciar con Windows",
} as const;
