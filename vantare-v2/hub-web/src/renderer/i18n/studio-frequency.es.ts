export const studioFrequencyText = {
  title: "Rendimiento",
  choices: "Frecuencia del widget",
  inherit: "Usar nivel",
  inheritHelp: "Heredar del nivel de rendimiento de Ajustes.",
  hz: (value: number) => `${value} Hz`,
  snapshot: "cada foto",
  applied: (value: string, level: string) =>
    `Frecuencia aplicada: ${value} · ${level}`,
  flags:
    "Las banderas se actualizan con cada foto para conservar los avisos inmediatos.",
  preserved:
    "Se conserva la frecuencia guardada. Puedes elegir otro límite o usar el nivel.",
};
