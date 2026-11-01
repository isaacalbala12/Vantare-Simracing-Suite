//! Presentación de cuenta compartida con el primer arranque.
use super::Remote;

impl Remote {
    pub(crate) fn onboarding_session(&self) -> (bool, &str) {
        (self.access.signed_in(), &self.message)
    }
}
