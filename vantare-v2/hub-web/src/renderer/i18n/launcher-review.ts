export const residentReviewText = {
  description:
    "Este perfil viene de fuera de Vantare. Antes de abrir nada, revisa qué hará.",
  profileLabel: "Perfil por revisar",
  chip: "Importado · origen no verificado",
  meta: (apps: string[]) =>
    `${apps.length} ${apps.length === 1 ? "paso" : "pasos"} · ${apps.join(", ")}`,
  names:
    "Los nombres de los pasos los escribió quien creó el perfil y pueden no coincidir con lo que se abre. La revisión te enseña, en una ventana de Windows, el programa y los argumentos reales de cada paso.",
  review: "Revisar el perfil…",
  reviewAgain: "Revisar otra vez…",
  cancel: "Cancelar",
  help: "Todavía no se ha abierto ninguna aplicación. Cerrar este panel no responde ni cancela la secuencia.",
  unavailableReason:
    "No se puede revisar con el residente y el Hub actuales. Puedes cancelar el lanzamiento.",
  tooLongWayOut:
    "Si lo necesitas, crea desde el editor un perfil tuyo con esas aplicaciones: los perfiles que creas tú no piden esta revisión.",
  states: {
    reviewing: {
      tone: "info",
      title: "Revisión abierta en una ventana de Windows",
      text: "Lee los pasos y responde allí. Hasta que respondas, no se abre nada.",
    },
    unconfirmed: {
      tone: "info",
      title: "Confirmación pendiente",
      text: "El resultado de la revisión está pendiente de confirmación. Consulta los resultados del lanzamiento.",
    },
    trusted: {
      tone: "info",
      title: "Confianza aceptada",
      text: "El residente sigue con el lanzamiento de este contenido exacto. Todavía no ha terminado: el progreso aparece en los resultados del perfil.",
    },
    declined: {
      tone: "warn",
      title: "No has confiado en el perfil",
      text: "Se ha pedido cancelar el lanzamiento. No se ha abierto ninguna aplicación.",
    },
    changed: {
      tone: "warn",
      title: "El perfil ha cambiado",
      text: "Lo que revisaste ya no coincide con lo que se iba a abrir, así que no se ha confiado en nada. Revísalo otra vez.",
    },
    expired: {
      tone: "warn",
      title: "La revisión ha caducado",
      text: "Ha pasado demasiado tiempo sin respuesta y no se ha confiado en nada. Si sigues aquí, ábrela otra vez.",
    },
    unavailable: {
      tone: "warn",
      title: "La revisión no está disponible",
      text: "Este Hub no puede abrir la revisión ahora mismo. No se ha confiado en nada.",
    },
    "too-long": {
      tone: "warn",
      title: "Demasiado largo para revisarlo aquí",
      text: "Este perfil tiene más pasos o argumentos más largos de los que caben en la revisión. Vantare no te deja confiar en algo que no puedes ver entero.",
    },
  },
  live: {
    question: "",
    reviewing: "",
    unconfirmed: "El resultado de la revisión está pendiente de confirmación.",
    trusted: "Confianza aceptada. El lanzamiento sigue en curso.",
    declined:
      "No has confiado en el perfil. Se cancela el lanzamiento; no se ha abierto ninguna aplicación.",
    changed:
      "El perfil ha cambiado. No se ha confiado en nada. Revísalo otra vez.",
    expired: "La revisión ha caducado. No se ha confiado en nada.",
    unavailable: "La revisión no está disponible. No se ha confiado en nada.",
    "too-long": "Este perfil es demasiado largo para revisarlo aquí.",
  },
} as const;
