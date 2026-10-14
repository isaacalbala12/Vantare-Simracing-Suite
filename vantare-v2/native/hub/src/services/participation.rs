use super::Remote;
use crate::services::protocol::Command;
use gpui::Context;

impl Remote {
    pub(super) fn complete_participation(
        &mut self,
        data: crate::services::protocol::testing_document::Participation,
    ) {
        if self.participation_pending == Some(self.participation_generation)
            && self.account.signed_in
            && !self.account.cancel_login
        {
            self.participation = data;
            self.participation_message = "Datos confirmados por el servicio".into();
            self.triage.preview = None;
        }
        self.participation_pending = None;
    }
    pub(super) fn complete_triage(
        &mut self,
        preview: crate::services::protocol::triage_document::Preview,
    ) {
        if self.participation_pending == Some(self.participation_generation)
            && self.account.signed_in
            && !self.account.cancel_login
        {
            self.triage.receive(preview);
            self.participation_message = "Revisa el contenido exacto antes de enviarlo".into();
        }
        self.participation_pending = None;
    }
    pub(super) fn clear_participation(&mut self, cx: &mut Context<Self>) {
        self.participation = crate::services::protocol::testing_document::Participation::default();
        self.participation_pending = None;
        self.participation_generation = self.participation_generation.wrapping_add(1);
        self.participation_message = "Inicia sesión y recarga para consultar tus datos".into();
        self.triage.clear(cx);
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
