export const onboardingText = {
  brand: "VANTARE",
  setup: "Configuración inicial",
  lessMinute: "MENOS DE 1 MINUTO",
  skip: "Saltar",
  back: "← Atrás",
  enter: "Enter",
  start: "Empezar",
  next: "Continuar",
  later: "Ahora no",
  finish: "Terminar",
  ready: "LISTO",
  loading: "Cargando configuración",
  privateExit: "Entrar sin guardar",
  assistant: "VANTA · ASISTENTE",
  cursor: "▌",
  progress: (step: number) =>
    step === 0
      ? "6 PASOS · MENOS DE 1 MINUTO"
      : step === 7
        ? "LISTO"
        : `PASO ${step} DE 6`,
  titles: [
    "LO QUE NECESITAS\nVER EN PISTA.",
    "¿A QUÉ CORRES?",
    "¿CÓMO CORRES?",
    "GUARDA TU\nCONFIGURACIÓN.",
    "SIN QUITARTE FPS.",
    "A TU GUSTO.",
    "TÚ DECIDES.",
    "TODO LISTO.",
  ],
  leads: [
    "Seis preguntas rápidas y tu overlay queda hecho a tu medida.",
    "Hemos mirado tu PC. Marca los simuladores que usas.",
    "Elige uno o varios. Te preparamos los widgets.",
    "Entra con tu cuenta. Tu configuración se guarda en este PC.",
    "Elige la cadencia de los widgets para que el juego vaya siempre fluido.",
    "Elige los colores del Hub. Lo ves al momento y puedes cambiarlo en Ajustes.",
    "¿Nos ayudas a mejorar Vantare con datos de uso anónimos? Viene apagado.",
    "Tu overlay está preparado. Ábrelo o ajústalo a tu gusto.",
  ],
  usageOn:
    "¿Nos ayudas a mejorar Vantare con datos de uso anónimos? Está activado.",
  welcome: "Soy Vanta. Te ayudo a configurar Vantare en menos de un minuto.",
  changeLater: "Puedes cambiarlo todo después en Ajustes.",
  helmet: "Vanta",
  assistantCaption: "VANTA · ASISTENTE DE CONFIGURACIÓN",
};

export const onboardingChoicesText = {
  simulators: [
    { id: 0, abbr: "LMU", name: "Le Mans Ultimate" },
    { id: 1, abbr: "ACC", name: "Assetto Corsa Competizione" },
  ],
  styles: [
    {
      id: 0,
      name: "Carreras online",
      description: "Servidores públicos y ránking",
    },
    {
      id: 1,
      name: "Ligas",
      description: "Campeonatos con tus rivales de siempre",
    },
    {
      id: 2,
      name: "Resistencia",
      description: "Carreras largas, relevos y combustible",
    },
    { id: 3, name: "Streaming", description: "Emites en Twitch o YouTube" },
  ],
  found: "ENCONTRADO",
  missing: "NO ENCONTRADO",
  library: "En tu biblioteca",
  installLater: "Márcalo si lo vas a instalar",
  check: "✓",
  radarLmu: "Le Mans Ultimate",
  radarAcc: "ACC",
  added: "AÑADIDO",
  computer: "TU PC",
} as const;
