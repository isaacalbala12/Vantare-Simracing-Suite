export const upcoming = {
  soon: "Próximamente",
  canDo: "Qué podrás hacer",
  follow: "Síguelo en el Roadmap",
  phases: "Preparar · En pista · Revisar",
  help: "Consulta los avances y las novedades del módulo.",
  roadmap: "Ver Roadmap",
  strategy: {
    title: "Estrategia",
    description: "Prepara tus decisiones antes de salir a pista.",
    features: [
      {
        title: "Plan de paradas",
        description:
          "Organiza tus pasos por boxes. Prepara la secuencia de paradas antes de salir a pista.",
      },
      {
        title: "Combustible y desgaste",
        description:
          "Compara lo que necesitas para cada stint. Revisa el consumo y la duración prevista.",
      },
      {
        title: "Ajustes en carrera",
        description:
          "Revisa el plan cuando cambie la carrera. Adapta tus decisiones a lo que ocurre en pista.",
      },
    ],
  },
  engineer: {
    title: "Ingeniero",
    description: "Una ayuda para concentrarte en la carrera.",
    features: [
      {
        title: "Avisos de voz en pista",
        description:
          "La información clave, sin apartar la vista. Escucha los avisos mientras te concentras en conducir.",
      },
      {
        title: "Spotter",
        description:
          "Una ayuda para situar los coches a tu alrededor. Sigue el tráfico cercano durante la carrera.",
      },
      {
        title: "Informes de carrera",
        description:
          "Repasa lo ocurrido al terminar. Consulta los momentos clave de tu sesión.",
      },
    ],
  },
} as const;
