import type { ResidentStepState } from "../../contract/generated/launcher_resident";
export const resultsText = {
  title: "Última secuencia",
  unknown:
    "Resultado de la secuencia desconocido. No permite saber qué pasos fallaron.",
  unsupported:
    "El residente actual no ofrece resultados por paso ni reintentos comprobados.",
  unavailable: "No hay un resultado confirmado que se pueda repetir.",
  profile: "Lanzamiento del perfil",
  rehearsal: "Prueba sin el juego",
  running: "La secuencia sigue en curso.",
  completed: "La secuencia ha terminado.",
  failed: "La secuencia ha terminado con un fallo.",
  cancelled: "La secuencia ha terminado cancelada.",
  sameSteps:
    "Repite la selección original de esta secuencia. Si era una prueba sin el juego, conserva esa selección.",
  stale:
    "El perfil ha cambiado. Los nombres actuales no se atribuyen a esta secuencia.",
  step: (index: number) => `Paso ${index + 1}`,
  states: {
    "not-selected": "Sin seleccionar",
    pending: "En espera",
    waiting: "Esperando…",
    launching: "Abriendo…",
    ready: "Listo",
    failed: "Falló",
    cancelled: "Cancelado",
    "not-run": "No ejecutado",
  } satisfies Record<ResidentStepState, string>,
};
