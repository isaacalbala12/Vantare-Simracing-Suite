//! Tipo de sesión visto por los widgets (#1564): pestañas de Standings y
//! visibilidad por sesión de cualquier instancia.
use vantare_domain::{Quality, SessionKind};

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum Session {
    Practice,
    Qualifying,
    #[default]
    Race,
}

impl Session {
    pub const ALL: [Self; 3] = [Self::Practice, Self::Qualifying, Self::Race];

    /// Warmup y tipos desconocidos cuentan como práctica. Un tipo obsoleto
    /// conserva su valor; solo la ausencia devuelve `None`.
    pub fn of(kind: &Quality<SessionKind>) -> Option<Self> {
        Some(match kind.last_known()? {
            SessionKind::Qualifying => Self::Qualifying,
            SessionKind::Race => Self::Race,
            SessionKind::Practice | SessionKind::Other(_) => Self::Practice,
        })
    }

    pub const fn label(self) -> &'static str {
        match self {
            Self::Practice => "Práctica",
            Self::Qualifying => "Qualy",
            Self::Race => "Carrera",
        }
    }

    /// Escena de ejemplo para la vista previa de esta pestaña.
    pub fn kind(self) -> SessionKind {
        match self {
            Self::Practice => SessionKind::Practice,
            Self::Qualifying => SessionKind::Qualifying,
            Self::Race => SessionKind::Race,
        }
    }
}

/// «Mostrar en»: sesiones en las que se dibuja una instancia. Todas por defecto.
#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct ShowIn {
    pub practice: bool,
    pub qualifying: bool,
    pub race: bool,
}

impl Default for ShowIn {
    fn default() -> Self {
        Self {
            practice: true,
            qualifying: true,
            race: true,
        }
    }
}

impl ShowIn {
    pub fn is_all(&self) -> bool {
        *self == Self::default()
    }

    /// Sin dato de sesión el widget se ve: nunca desaparece por falta de señal.
    pub fn allows(self, session: Option<Session>) -> bool {
        session.is_none_or(|session| *self.get(session))
    }

    pub fn get(&self, session: Session) -> &bool {
        match session {
            Session::Practice => &self.practice,
            Session::Qualifying => &self.qualifying,
            Session::Race => &self.race,
        }
    }

    pub fn get_mut(&mut self, session: Session) -> &mut bool {
        match session {
            Session::Practice => &mut self.practice,
            Session::Qualifying => &mut self.qualifying,
            Session::Race => &mut self.race,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn session_filter_requests_the_type_even_for_a_widget_without_session_data() {
        let mut layout: crate::layout::Layout = serde_json::from_value(serde_json::json!({
            "version": crate::layout::VERSION,
            "instances": [{"id":"pedals", "x":10, "y":20, "settings":{"kind":"pedals"}}]
        }))
        .unwrap();
        let original = layout.demand();
        assert!(!original.contains(vantare_ipc::Signal::SessionInfo));
        layout.instances[0].show_in.practice = false;
        let filtered = layout.demand();
        assert!(filtered.contains(vantare_ipc::Signal::SessionInfo));
        assert!(
            filtered.covers(&original),
            "other signals stay requested even when hidden by session"
        );
        layout.instances[0].visible = false;
        assert!(!layout.demand().contains(vantare_ipc::Signal::SessionInfo));
    }

    #[test]
    fn warmup_is_practice_stale_keeps_value_and_unknown_shows_widgets() {
        use Quality::{Reliable, Stale, Unavailable};
        assert_eq!(
            Session::of(&Reliable(SessionKind::Other("warmup".into()))),
            Some(Session::Practice)
        );
        assert_eq!(
            Session::of(&Stale(SessionKind::Qualifying)),
            Some(Session::Qualifying)
        );
        assert_eq!(Session::of(&Unavailable), None);
        let race_only = ShowIn {
            practice: false,
            qualifying: false,
            race: true,
        };
        assert!(!race_only.allows(Some(Session::Practice)));
        assert!(!race_only.allows(Some(Session::Qualifying)));
        assert!(race_only.allows(Some(Session::Race)));
        assert!(race_only.allows(None), "sin dato de sesión se ve");
    }
}
