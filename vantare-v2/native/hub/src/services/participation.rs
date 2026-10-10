use super::Remote;
use crate::services::protocol::Command;
use gpui::Context;

impl Remote {
    pub(super) fn clear_participation(&mut self) {
        self.participation = crate::services::protocol::testing_document::Participation::default();
        self.participation_pending = None;
        self.participation_generation = self.participation_generation.wrapping_add(1);
        self.participation_message = "Inicia sesión y recarga para consultar tus datos".into();
    }
    pub(crate) fn participation_ready(&self) -> bool {
        self.account.signed_in
            && !self.account.pending
            && !self.account.cancel_login
            && !self.busy()
            && self.queued.is_none()
            && !self.stop.load(std::sync::atomic::Ordering::Acquire)
            && self.participation_pending.is_none()
    }
    pub(crate) fn participation_request(&mut self, command: Command, cx: &mut Context<Self>) {
        if !self.participation_ready() {
            self.participation_message =
                "Inicia sesión o espera a que termine la operación actual".into();
            cx.notify();
            return;
        }
        self.participation_pending = Some(self.participation_generation);
        self.participation_message = "Consultando el servicio…".into();
        self.request(command, cx);
        if !self.busy() {
            self.participation_pending = None;
            self.participation_message.clone_from(&self.message);
            cx.notify();
        }
    }
}
