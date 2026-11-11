//! Navegación local de la shell. No verifica licencias ni concede derechos al núcleo.

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
// Capacidades independientes del contrato beta; no forman estados excluyentes.
#[allow(clippy::struct_excessive_bools)]
pub struct Access {
    pub verified: bool,
    pub catalog: vantare_ipc::control::CatalogAccess,
    pub engineer: bool,
    pub strategy: bool,
    pub analysis: bool,
    pub calendar: bool,
    pub tester: bool,
    pub blocked: bool,
}

impl Access {
    pub fn from_session_policy(
        session: vantare_ipc::services_protocol::Session,
        policy: &vantare_ipc::control::Policy,
        now_ms: u64,
    ) -> Self {
        use vantare_ipc::services_protocol::Session;
        match session {
            Session::SignedIn | Session::NeedsSignIn => Self::from_policy(policy, now_ms),
            Session::SignedOut | Session::Pending => Self::default(),
        }
    }
    pub fn from_policy(policy: &vantare_ipc::control::Policy, now_ms: u64) -> Self {
        if policy.state == vantare_ipc::control::AccessState::NoCredential {
            return Self::default();
        }
        if !policy.state.permits_access() {
            return Self {
                blocked: true,
                ..Self::default()
            };
        }
        if !policy.current_at(now_ms) {
            return Self::default();
        }
        Self {
            verified: policy.state.permits_access(),
            catalog: policy.catalog,
            engineer: policy.engineer,
            strategy: policy.strategy,
            analysis: policy.analysis,
            calendar: policy.calendar,
            tester: policy.tester,
            ..Self::default()
        }
    }
}
