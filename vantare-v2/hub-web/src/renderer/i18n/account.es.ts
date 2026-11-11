export const accountText = {
  title: "Cuenta",
  connected: "Cuenta conectada",
  signedOut: "Sin sesión",
  privateEmail: "Correo oculto por privacidad",
  sessionHelp: "Tu sesión de Vantare",
  active: "Acceso verificado · activo",
  verified: "Acceso verificado",
  unverified: "Acceso sin verificar",
  photo: "Cambiar foto",
  refreshPhoto: "Actualizar foto",
  check: "Comprobar acceso",
  checking: "Comprobando…",
  logout: "Cerrar sesión",
  loggingOut: "Cerrando sesión…",
  login: "Iniciar sesión",
  waiting: "Esperando…",
  checkoutNotice: "Se abrirá tu navegador en la página de pago de Polar",
  purchaseWaiting: "Ya hay una compra en espera de comprobación.",
  foundersOwned: "Tu cuenta ya tiene Founders; no necesitas otra compra.",
  notConfigured: "El acceso no está configurado en esta versión.",
  buySignedOut: "Inicia sesión para comprar",
  busy: "Operación en curso",
  beta: "Acceso beta",
  betaHelp:
    "Acceso gratuito durante la beta para testers. La sesión valida tu acceso; no muestra ni copia claves privadas.",
  contribution: "Tu aporte a la beta",
  contributionHelp: "Los informes y cuestionarios viven en Testing Center.",
  contributionSoon: "Totales de tu cuenta · Próximamente",
  modules: "Módulos",
  modulesHelp:
    "Acceso gratuito durante la beta. Estrategia e Ingeniero estarán disponibles próximamente.",
  included: "Incluido",
  soon: "Próximamente",
  news: "Novedades de la beta",
  newsFailed: "No se pudieron cargar las novedades. Vuelve a intentarlo.",
  newsLoading: "Cargando novedades…",
  noNews: "Sin notas publicadas para este canal",
  failed: "No se pudo cargar la cuenta.",
  reload: "Volver a cargar",
  sessionTitle: "Estado de la cuenta",
  yourSession: "Tu sesión",
  state: "Estado",
  demoActive: "Activo",
  reauthenticate: "Vuelve a iniciar sesión",
  sessionConnected: "Conectada",
  lastAccess: "Último acceso",
  duringBeta: "Durante la beta",
  freeBeta: "Acceso gratuito para testers",
  channel: "Canal",
  devices: "Dispositivos",
  thisComputer: "Este equipo",
  device: "Este dispositivo",
  deviceVerified: "Acceso verificado en este equipo",
  deviceUnverified: "Acceso sin verificar",
  deviceHelp:
    "Restablecer libera la activación de este equipo (una vez cada 24 h). La lista de otros dispositivos no está disponible aquí.",
  reset: "Restablecer dispositivo",
  resetSignIn: "Inicia sesión para restablecer este dispositivo.",
  resetConfirm: "Restablecer",
  cancel: "Cancelar",
  resetDescription:
    "Restablecer libera la activación de este equipo y solo se puede hacer una vez cada 24 h. ¿Quieres continuar?",
  mail: "Avisos por email",
  mailSoon: "Preferencias de email · Próximamente",
  data: "Tus datos",
  dataSoon:
    "Perfiles y ajustes locales. Exportación y borrado de cuenta · Próximamente",
  stopPurchase: "Dejar de comprobar",
  pc: "PC",
  unknown: "—",
  demoDisabled: "Datos de demostración; acciones deshabilitadas",
  // Fuente: docs/vantare-program/product-contract.md:81,102,170 y native/hub/src/services/view/founders.rs:26,151-152.
  monthly: "Pro · 5,99 €/mes",
  annual: "Pro · 59,99 €/año",
} as const;
export const accountModules = {
  studio: {
    title: "Editor de overlays",
    description: "Editor de diseños y widgets",
    icon: "v-studio",
  },
  launcher: {
    title: "Lanzador",
    description: "Perfiles y aplicaciones",
    icon: "v-launch",
  },
  calendar: {
    title: "Carreras y recordatorios",
    description: "Horario y recordatorios para testers",
    icon: "v-calendar",
  },
  strategy: {
    title: "Estrategia",
    description: "Plan de paradas y combustible",
    icon: "v-strategy",
  },
  engineer: {
    title: "Ingeniero",
    description: "Ingeniero de radio con voz",
    icon: "v-engineer",
  },
} as const;
// Precios y copia: native/hub/src/services/view/founders.rs; catálogo futuro en el contrato.
export const foundersCopy = {
  ES: {
    button: "Founders · 50 € · precio de fundador",
    included:
      "Todos los módulos y widgets presentes y futuros, para siempre. Incluye Nightly. Pago único. Disponible desde la beta pública. Este precio subirá más adelante, sin fecha prevista.",
    subscription:
      "Founders se activa al instante. Si tienes Pro o Pro Plus, se desactiva su renovación al terminar el periodo pagado, sin reembolso automático. El servidor confirma la disponibilidad.",
    owned: "Founders · todo para siempre",
  },
  EN: {
    button: "Founders · €50 · founder price",
    included:
      "All current and future modules and widgets, forever. Includes Nightly. One-time payment. Available from the public beta. This price will rise later, with no date set.",
    subscription:
      "Founders activates immediately. If you have Pro or Pro Plus, renewal stops at the end of the paid period, with no automatic refund. The server confirms availability.",
    owned: "Founders · everything forever",
  },
  IT: {
    button: "Founders · 50 € · prezzo fondatore",
    included:
      "Tutti i moduli e widget presenti e futuri, per sempre. Include Nightly. Pagamento unico. Disponibile dalla beta pubblica. Il prezzo aumenterà in futuro, senza una data prevista.",
    subscription:
      "Founders si attiva subito. Con Pro o Pro Plus, il rinnovo termina alla fine del periodo pagato, senza rimborso automatico. Il server conferma la disponibilità.",
    owned: "Founders · tutto per sempre",
  },
  "PT-BR": {
    button: "Founders · € 50 · preço de fundador",
    included:
      "Todos os módulos e widgets atuais e futuros, para sempre. Inclui Nightly. Pagamento único. Disponível a partir da beta pública. O preço aumentará no futuro, sem data prevista.",
    subscription:
      "Founders é ativado imediatamente. Com Pro ou Pro Plus, a renovação termina ao final do período pago, sem reembolso automático. O servidor confirma a disponibilidade.",
    owned: "Founders · tudo para sempre",
  },
} as const;
export type FoundersLanguage = keyof typeof foundersCopy;

export const foundersLanguages = {
  ES: "es",
  EN: "en",
  IT: "it",
  "PT-BR": "pt-BR",
} as const;
