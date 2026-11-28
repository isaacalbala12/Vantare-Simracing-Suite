export const shellText = {
  brand: "VANTARE",
  sidebarCollapse: "Contraer barra",
  sidebarExpand: "Expandir barra",
  profiles: "Perfiles",
  testerBadge: "TESTER",
  testerAccess: "Acceso de tester",
  freeBeta: "Beta gratuita",
  studioName: "Overlays Studio",
  strategyName: "Estrategia",
  engineerName: "Ingeniero",
  launchProfile: (name: string) => `Lanzar perfil ${name}`,
  waitingSimulator: "Esperando simulador",
  simulatorConnected: "LMU conectado",
  sectionTabs: "Pestañas de la sección",
  // Issue 2896 · texto aprobado por la raíz: «Más pestañas de Ajustes» y el
  // mismo símbolo «⋯» de Estrategia. Lleva el título de la pantalla.
  moreSectionTabs: (section: string) => `Más pestañas de ${section}`,
  moreSymbol: "⋯",
} as const;
