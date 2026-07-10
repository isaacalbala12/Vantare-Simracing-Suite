// Datos de la pestaña "Desarrollo por features".
//
// Fuente de verdad MANUAL: docs/features-source.json (editado por Isaac). La app
// lo trae por fetch en runtime (ver fetchFeaturesDataset). NO hay script que
// regenere estos datos: se transcriben a mano.
//
// El texto de cada feature vive INLINE en el JSON fuente (es/en/pt/it). El
// "chrome" de la UI (eyebrows, badges, iconos) sigue en TIPO_META / STATUS_META.
// FEATURES_FALLBACK es una copia empaquetada para uso sin red.
//
// Procedimiento y flujo manual: docs/roadmap-maintenance.md.

import {
  pickText,
  type LocalizedText,
} from "./roadmap-data";

export type FeatureStatus = "in-development" | "research" | "future";

export type FeatureTipo = "feature" | "bugfix" | "improve" | "component";

export type FeatureCategory = {
  id: string;
  label: LocalizedText;
  order: number;
};

export type RoadmapSubtask = {
  label: LocalizedText;
  done: boolean;
};

export type RoadmapFeature = {
  id: string;
  category: string;
  label: LocalizedText;
  description: LocalizedText;
  tipo: FeatureTipo;
  status: FeatureStatus;
  subtasks: RoadmapSubtask[];
};

/** % derivado del ratio done/total de las subtasks. */
export function featurePercent(f: RoadmapFeature): number {
  if (f.subtasks.length === 0) return 0;
  const done = f.subtasks.filter((s) => s.done).length;
  return Math.round((done / f.subtasks.length) * 100);
}

export type FeaturesDataset = {
  categories: ReadonlyArray<FeatureCategory>;
  features: ReadonlyArray<RoadmapFeature>;
};

export const FEATURES_SOURCE_URL =
  "https://raw.githubusercontent.com/isaacalbala12/Vantare-Simracing-Suite/main/docs/features-source.json";

const VALID_STATUS: ReadonlyArray<FeatureStatus> = [
  "in-development",
  "research",
  "future",
];
const VALID_TIPO: ReadonlyArray<FeatureTipo> = [
  "feature",
  "bugfix",
  "improve",
  "component",
];

function isStatus(s: string): s is FeatureStatus {
  return (VALID_STATUS as ReadonlyArray<string>).includes(s);
}

function isTipo(s: string): s is FeatureTipo {
  return (VALID_TIPO as ReadonlyArray<string>).includes(s);
}

function asText(v: unknown): LocalizedText {
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return {
      es: String(o.es ?? ""),
      en: String(o.en ?? ""),
      pt: String(o.pt ?? ""),
      it: String(o.it ?? ""),
    };
  }
  const s = String(v ?? "");
  return { es: s, en: s, pt: s, it: s };
}

export async function fetchFeaturesDataset(
  signal?: AbortSignal,
): Promise<FeaturesDataset> {
  try {
    const res = await fetch(FEATURES_SOURCE_URL, { signal, cache: "no-store" });
    if (!res.ok) throw new Error(`features source HTTP ${res.status}`);
    const raw = (await res.json()) as unknown;
    const parsed = normalizeFeaturesSource(raw);
    if (!parsed) throw new Error("features source shape invalid");
    return parsed;
  } catch {
    return FEATURES_FALLBACK;
  }
}

function normalizeFeaturesSource(raw: unknown): FeaturesDataset | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.categories) || !Array.isArray(obj.features)) {
    return null;
  }

  const categories = obj.categories
    .filter((c): c is Record<string, unknown> => !!c && typeof c === "object")
    .map((c) => ({
      id: String(c.id ?? "").trim(),
      label: asText(c.label),
      order: Number(c.order) || 0,
    }))
    .filter((c) => c.id.length > 0);
  if (categories.length === 0) return null;
  const catIds = new Set(categories.map((c) => c.id));

  const features = obj.features
    .filter((f): f is Record<string, unknown> => !!f && typeof f === "object")
    .map((f) => {
      const rawSubtasks = Array.isArray(f.subtasks) ? f.subtasks : [];
      const subtasks: RoadmapSubtask[] = rawSubtasks
        .filter((s): s is Record<string, unknown> => !!s && typeof s === "object")
        .map((s) => ({ label: asText(s.label), done: Boolean(s.done) }));
      return {
        id: String(f.id ?? "").trim(),
        category: String(f.category ?? "").trim(),
        label: asText(f.label),
        description: asText(f.description),
        tipo: String(f.tipo ?? ""),
        status: String(f.status ?? ""),
        subtasks,
      };
    })
    .filter((f): f is RoadmapFeature => {
      if (!f.id) return false;
      if (!catIds.has(f.category)) return false;
      if (!isStatus(f.status)) return false;
      if (!isTipo(f.tipo)) return false;
      return true;
    }) as RoadmapFeature[];

  if (features.length === 0) return null;
  return { categories, features };
}

export { pickText };

export const FEATURES_FALLBACK: FeaturesDataset = {
  categories: [
    { id: "widget-studio", label: { es: "Widget Studio", en: "Widget Studio", pt: "Widget Studio", it: "Widget Studio" }, order: 1 },
    { id: "launcher", label: { es: "Launcher", en: "Launcher", pt: "Launcher", it: "Launcher" }, order: 2 },
    { id: "calendar", label: { es: "Calendario", en: "Calendar", pt: "Calendário", it: "Calendario" }, order: 3 },
    { id: "engineer", label: { es: "Ingeniero", en: "Engineer", pt: "Engenheiro", it: "Engineer" }, order: 4 },
    { id: "onboarding", label: { es: "Onboarding", en: "Onboarding", pt: "Onboarding", it: "Onboarding" }, order: 5 },
    { id: "payments", label: { es: "Pagos", en: "Payments", pt: "Pagamentos", it: "Pagamenti" }, order: 6 },
    { id: "settings", label: { es: "Ajustes", en: "Settings", pt: "Configurações", it: "Impostazioni" }, order: 7 },
    { id: "strategy", label: { es: "Estrategia", en: "Strategy", pt: "Estratégia", it: "Strategia" }, order: 8 },
  ],
  features: [
    {
      id: "widget-studio-reform", category: "widget-studio",
      label: { es: "Widget Studio — En refactor", en: "Widget Studio — Under refactor", pt: "Widget Studio — Em reforma", it: "Widget Studio — In riforma" },
      description: { es: "Reformar Widget Studio de arriba a abajo: lienzo, inspector, catálogo, diseños, permisos, migraciones, pruebas visuales y conexión con la app real.", en: "Reform Widget Studio top to bottom: canvas, inspector, catalog, designs, permissions, migrations, visual tests and real app connection.", pt: "Reformar o Widget Studio de cima a baixo: canvas, inspetor, catálogo, design, permissões, migrações, testes visuais e conexão com a app real.", it: "Riformare Widget Studio dall'alto in basso: canvas, ispettore, catalogo, design, permessi, migrazioni, test visivi e connessione con l'app reale." },
      tipo: "feature", status: "in-development",
      subtasks: [
        { label: { es: "Cerrar fase del lienzo e interfaz base", en: "Close canvas and base interface phase", pt: "Fechar fase da canvas e interface base", it: "Chiudere fase della canvas e interfaccia base" }, done: false },
        { label: { es: "Construir el inspector de verdad", en: "Build the real inspector", pt: "Construir o inspetor de verdade", it: "Costruire l'ispettore vero" }, done: false },
        { label: { es: "Catálogo para añadir widgets", en: "Catalog to add widgets", pt: "Catálogo para adicionar widgets", it: "Catalogo per aggiungere widget" }, done: false },
        { label: { es: "Sistema de diseños oficiales y personalizados", en: "Official and custom designs system", pt: "Sistema de design oficiais e personalizados", it: "Sistema di design ufficiali e personalizzati" }, done: false },
        { label: { es: "Reglas de permisos y planes", en: "Permissions and plan rules", pt: "Regras de permissões e planos", it: "Regole di permessi e piani" }, done: false },
        { label: { es: "Migrar Clasificación (Standings)", en: "Migrate Standings", pt: "Migrar Classificação (Standings)", it: "Migrare Standings" }, done: false },
        { label: { es: "Migrar Relativo", en: "Migrate Relative", pt: "Migrar Relativo", it: "Migrare Relativo" }, done: false },
        { label: { es: "Migrar Pedals", en: "Migrate Pedals", pt: "Migrar Pedals", it: "Migrare Pedals" }, done: false },
        { label: { es: "Pruebas visuales de los cuatro widgets", en: "Visual tests for all four widgets", pt: "Testes visuais dos quatro widgets", it: "Test visivi dei quattro widget" }, done: false },
        { label: { es: "Conectar el estudio a la app real", en: "Connect studio to real app", pt: "Conectar o estúdio à app real", it: "Connettere lo studio all'app reale" }, done: false },
        { label: { es: "Telemetría en vivo con LMU", en: "Live telemetry with LMU", pt: "Telemetria ao vivo com LMU", it: "Telemetria in tempo reale con LMU" }, done: false },
        { label: { es: "Overlay de escritorio y OBS con motor nuevo", en: "Desktop and OBS overlay with new engine", pt: "Overlay de desktop e OBS com motor novo", it: "Overlay desktop e OBS con nuovo motore" }, done: false },
        { label: { es: "Vista Browser View y refresco tras guardar", en: "Browser View and refresh after save", pt: "Vista Browser View e atualização após salvar", it: "Vista Browser View e aggiornamento dopo salvataggio" }, done: false },
        { label: { es: "Pantalla cuando no hay perfil activo", en: "Screen when no active profile", pt: "Tela quando não há perfil ativo", it: "Schermata quando non c'è un profilo attivo" }, done: false },
        { label: { es: "Atajo de edición desde el escritorio", en: "Desktop edit shortcut", pt: "Atalho de edição da desktop", it: "Scorciatoia di modifica dal desktop" }, done: false },
        { label: { es: "Traducciones completas", en: "Full translations", pt: "Traduções completas", it: "Traduzioni complete" }, done: false },
        { label: { es: "Accesibilidad y teclado", en: "Accessibility and keyboard", pt: "Acessibilidade e teclado", it: "Accessibilità e tastiera" }, done: false },
        { label: { es: "Rendimiento y límites de actualización", en: "Performance and update limits", pt: "Desempenho e limites de atualização", it: "Prestazioni e limiti di aggiornamento" }, done: false },
        { label: { es: "Guías para crear nuevos estilos visuales", en: "Guides to create new visual styles", pt: "Guias para criar novos estilos visuais", it: "Guide per creare nuovi stili visivi" }, done: false },
        { label: { es: "Retirar el editor viejo", en: "Remove old editor", pt: "Remover o editor antigo", it: "Rimuovere il vecchio editor" }, done: false },
        { label: { es: "Revisión final de arquitectura y lanzamiento", en: "Final architecture review and launch", pt: "Revisão final de arquitetura e lançamento", it: "Revisione finale dell'architettura e lancio" }, done: false },
      ],
    },
    {
      id: "launcher-reform", category: "launcher",
      label: { es: "Launcher — Revisión visual y filtros", en: "Launcher — Visual review and filters", pt: "Launcher — Revisão visual e filtros", it: "Launcher — Revisione visiva e filtri" },
      description: { es: "Revisión visual parcial, filtros de aplicaciones y code-review extenso.", en: "Partial visual review, application filters, and extensive code review.", pt: "Revisão visual parcial, filtros de aplicações e code review extenso.", it: "Revisione visiva parziale, filtri delle applicazioni e code review esteso." },
      tipo: "feature", status: "future",
      subtasks: [
        { label: { es: "Revisión visual parcial", en: "Partial visual review", pt: "Revisão visual parcial", it: "Revisione visiva parziale" }, done: false },
        { label: { es: "Filtros de aplicaciones", en: "Application filters", pt: "Filtros de aplicações", it: "Filtri delle applicazioni" }, done: false },
        { label: { es: "Code-Review extenso", en: "Extensive code review", pt: "Code review extenso", it: "Code review esteso" }, done: false },
      ],
    },
    {
      id: "calendar-general-review", category: "calendar",
      label: { es: "Calendario — Revisión general", en: "Calendar — General review", pt: "Calendário — Revisão geral", it: "Calendario — Revisione generale" },
      description: { es: "Revisión general del calendario LMU.", en: "General review of the LMU calendar.", pt: "Revisão geral do calendário LMU.", it: "Revisione generale del calendario LMU." },
      tipo: "feature", status: "in-development",
      subtasks: [
        { label: { es: "Revisión general", en: "General review", pt: "Revisão geral", it: "Revisione generale" }, done: false },
      ],
    },
    {
      id: "engineer-spotter", category: "engineer",
      label: { es: "Ingeniero — Spotter", en: "Engineer — Spotter", pt: "Engenheiro — Spotter", it: "Engineer — Spotter" },
      description: { es: "Spotter, responsive y cambiar valores desde voz.", en: "Spotter, responsive and change values from voice.", pt: "Spotter, responsivo e alterar valores por voz.", it: "Spotter, responsive e cambiare valori dalla voce." },
      tipo: "feature", status: "in-development",
      subtasks: [
        { label: { es: "Spotter", en: "Spotter", pt: "Spotter", it: "Spotter" }, done: false },
        { label: { es: "Responsive", en: "Responsive", pt: "Responsivo", it: "Responsive" }, done: false },
        { label: { es: "Cambiar valores desde voz", en: "Change values from voice", pt: "Alterar valores por voz", it: "Cambiare valori dalla voce" }, done: false },
      ],
    },
    {
      id: "onboarding-login-review", category: "onboarding",
      label: { es: "Onboarding + Inicio de sesión", en: "Onboarding + Login", pt: "Onboarding + Login", it: "Onboarding + Login" },
      description: { es: "Revisión completa visual del flujo de onboarding e inicio de sesión.", en: "Complete visual review of the onboarding and login flow.", pt: "Revisão visual completa do fluxo de onboarding e login.", it: "Revisione visiva completa del flusso di onboarding e login." },
      tipo: "feature", status: "future",
      subtasks: [
        { label: { es: "Revisión completa visual", en: "Complete visual review", pt: "Revisão visual completa", it: "Revisione visiva completa" }, done: false },
      ],
    },
    {
      id: "payments-live", category: "payments",
      label: { es: "Pagos", en: "Payments", pt: "Pagamentos", it: "Pagamenti" },
      description: { es: "Esperando primer pago", en: "Awaiting first payment", pt: "Aguardando primeiro pagamento", it: "In attesa del primo pagamento" },
      tipo: "feature", status: "in-development",
      subtasks: [
        { label: { es: "Revisión completa del sistema", en: "Complete system review", pt: "Revisão completa do sistema", it: "Revisione completa del sistema" }, done: true },
        { label: { es: "Evaluar Polar vs Stripe", en: "Evaluate Polar vs Stripe", pt: "Avaliar Polar vs Stripe", it: "Valutare Polar vs Stripe" }, done: true },
        { label: { es: "Configurar productos", en: "Configure products", pt: "Configurar produtos", it: "Configurare prodotti" }, done: true },
        { label: { es: "Webhook de pagos", en: "Payment webhook", pt: "Webhook de pagamentos", it: "Webhook di pagamento" }, done: true },
        { label: { es: "Flujo de checkout", en: "Checkout flow", pt: "Fluxo de checkout", it: "Flusso di checkout" }, done: true },
        { label: { es: "Gestión de suscripciones", en: "Subscription management", pt: "Gestão de assinaturas", it: "Gestione abbonamenti" }, done: true },
        { label: { es: "Tests de integración", en: "Integration tests", pt: "Testes de integração", it: "Test di integrazione" }, done: true },
        { label: { es: "Documentación", en: "Documentation", pt: "Documentação", it: "Documentazione" }, done: true },
        { label: { es: "Deploy a staging", en: "Deploy to staging", pt: "Deploy para staging", it: "Deploy a staging" }, done: true },
        { label: { es: "Smoke test completo", en: "Full smoke test", pt: "Smoke test completo", it: "Smoke test completo" }, done: false },
      ],
    },
    {
      id: "settings-account", category: "settings",
      label: { es: "Ajustes + Cuenta de Vantare", en: "Settings + Vantare Account", pt: "Configurações + Conta Vantare", it: "Impostazioni + Account Vantare" },
      description: { es: "Configuraciones básicas y cuenta de Vantare. Dependiente de pagos.", en: "Basic settings and Vantare account. Dependent on payments.", pt: "Configurações básicas e conta Vantare. Dependente de pagamentos.", it: "Impostazioni di base e account Vantare. Dipendente dai pagamenti." },
      tipo: "feature", status: "future",
      subtasks: [
        { label: { es: "Configuraciones básicas", en: "Basic settings", pt: "Configurações básicas", it: "Impostazioni di base" }, done: false },
        { label: { es: "Cuenta de Vantare", en: "Vantare account", pt: "Conta Vantare", it: "Account Vantare" }, done: false },
      ],
    },
    {
      id: "strategy-review", category: "strategy",
      label: { es: "Panel de estrategia", en: "Strategy panel", pt: "Painel de estratégia", it: "Pannello strategia" },
      description: { es: "Revisar el cómo, el qué y el cuándo.", en: "Review the how, what and when.", pt: "Rever o como, o que e o quando.", it: "Rivedere il come, il cosa e il quando." },
      tipo: "feature", status: "research",
      subtasks: [
        { label: { es: "Revisar el cómo, el qué y el cuándo", en: "Review the how, what and when", pt: "Rever o como, o que e o quando", it: "Rivedere il come, il cosa e il quando" }, done: false },
      ],
    },
  ],
};
