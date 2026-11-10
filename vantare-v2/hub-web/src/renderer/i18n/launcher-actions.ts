export const actionText = {
  duplicate: "Duplicar", remove: "Eliminar", favorite: "Marcar como favorito", unfavorite: "Quitar de favoritos",
  trigger: "Al abrir LMU", triggered: "LMU · activado", cancel: "Cancelar", retry: "Reintentar guardado", discard: "Descartar",
  removeTitle: "Eliminar perfil", removeMessage: (name: string) => `Se eliminará el perfil ${name}. No se borra ninguna aplicación de tu disco.`,
  conflict: "El Launcher ha cambiado en otro proceso. Revisa el estado antes de reintentar.", failed: "No se pudo guardar el cambio. Vuelve a intentarlo.",
  retryFailed: "Reintentar si no abre", closeOnExit: "Cerrar mis apps al salir de Vantare", startup: "Iniciar con Windows",
} as const;
