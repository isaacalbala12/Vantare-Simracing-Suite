//! Proceso Hub de ADR 0099: edición local, sin dependencia del runtime.
#![forbid(unsafe_code)]

pub mod document;
pub mod files;
pub mod lifecycle;
pub mod scene;
pub mod shell;
pub mod studio;
pub mod workshop;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum Section {
    #[default]
    Home,
    Workshop,
    Studio,
    Launcher,
    Calendar,
    Strategy,
    Engineer,
    Analysis,
    Testing,
    Roadmap,
    Account,
    Licenses,
    Notifications,
    Settings,
}

impl Section {
    pub const ALL: &[Self] = &[
        Self::Home,
        Self::Workshop,
        Self::Studio,
        Self::Launcher,
        Self::Calendar,
        Self::Strategy,
        Self::Engineer,
        Self::Analysis,
        Self::Testing,
        Self::Roadmap,
        Self::Account,
        Self::Licenses,
        Self::Notifications,
        Self::Settings,
    ];

    pub fn label(self) -> &'static str {
        match self {
            Self::Home => "Inicio",
            Self::Workshop => "Workshop",
            Self::Studio => "Overlay Studio",
            Self::Launcher => "Launcher",
            Self::Calendar => "Calendario",
            Self::Strategy => "Strategy",
            Self::Engineer => "Engineer / Spotter",
            Self::Analysis => "Telemetría / Análisis",
            Self::Testing => "Testing Center",
            Self::Roadmap => "Roadmap",
            Self::Account => "Cuenta",
            Self::Licenses => "Licencias",
            Self::Notifications => "Notificaciones",
            Self::Settings => "Ajustes",
        }
    }

    pub fn pending(self) -> &'static str {
        match self {
            Self::Home => "Hub nativo local · fase 5 en desarrollo. Selecciona una sección.",
            Self::Workshop => "Pendiente: catálogo y escenas sobre vantare-ui.",
            Self::Studio => "Pendiente: edición y persistencia de layouts locales.",
            Self::Launcher => {
                "Pendiente: integración con el propietario de procesos. No se lanza el juego desde esta shell."
            }
            Self::Calendar => {
                "Pendiente: contrato de calendario, series, zonas horarias y recordatorios. No se consulta Discord ni servicios remotos."
            }
            Self::Strategy => {
                "Pendiente: documento V2 y worker solver/storage. No se fabrican planes ni resultados."
            }
            Self::Engineer => "Pendiente: worker de Engineer/voz y eventos de fase 3.",
            Self::Analysis => "Pendiente: worker de almacenamiento/análisis de fase 4.",
            Self::Testing => {
                "Pendiente: worker de diagnóstico/reportes y política por canal. Sin automatización."
            }
            Self::Roadmap => {
                "Pendiente: publicación compartida de Supabase. Sin copia editable local."
            }
            Self::Account => {
                "Sin sesión: integración de autenticación y almacén protegido pendiente."
            }
            Self::Licenses => {
                "Sin credencial: validación firmada pertenece al núcleo. Este Hub no concede permisos."
            }
            Self::Notifications => {
                "Pendiente: fuentes y acciones del centro de notificaciones. Sin mensajes de producto ficticios."
            }
            Self::Settings => "Pendiente: ajustes locales y contratos con los otros procesos.",
        }
    }
}
