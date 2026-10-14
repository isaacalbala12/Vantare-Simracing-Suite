//! Proyección privada del piloto; no cambia sesión, derechos ni compras.
use super::{Area, Command, Inflight, Remote};
use crate::services::protocol::pilot_document::PilotState;

#[derive(Clone, Copy, Default, PartialEq, Eq)]
pub(crate) enum PilotResult {
    Loaded,
    #[default]
    Failed,
}
#[derive(Default)]
pub(crate) struct Projection {
    pub(crate) saved: Option<PilotState>,
    pub(crate) message: String,
    pub(crate) result: PilotResult,
    pub(crate) generation: u64,
}

pub(super) fn is_command(command: &Command) -> bool {
    matches!(
        command,
        Command::PilotLoad | Command::PilotSave { .. } | Command::PilotSync
    )
}

impl Remote {
    pub(crate) fn busy(&self) -> bool {
        self.inflight != Inflight::Idle
    }

    pub(super) fn clear_pilot(&mut self) {
        self.pilot.saved = None;
        self.pilot.message.clear();
        self.pilot.generation = self.pilot.generation.wrapping_add(1);
    }
    pub(super) fn clear_pilot_if_session_changed(&mut self, signed_in: bool) {
        if self.account.signed_in != signed_in {
            self.clear_pilot();
        }
    }
    pub(super) fn accept_pilot(
        &mut self,
        state: PilotState,
        message: String,
        next: Option<&Command>,
    ) {
        // La salida puede llegar durante el IPC: esa respuesta no restaura datos.
        if matches!(self.active, Area::Pilot) && !matches!(next, Some(Command::Logout)) {
            self.pilot.saved = Some(state);
            self.pilot.result = PilotResult::Loaded;
            self.pilot.message = message;
            self.pilot.generation = self.pilot.generation.wrapping_add(1);
        }
    }
    pub(super) fn failed_pilot_reply(&mut self, message: String) {
        self.pilot.result = PilotResult::Failed;
        self.pilot.message = message;
        self.pilot.generation = self.pilot.generation.wrapping_add(1);
    }
    pub(super) fn failed_pilot_dispatch(&mut self, requested: bool) {
        if requested && matches!(self.active, Area::Pilot) {
            self.failed_pilot_reply(
                "No se pudo iniciar la operación. Tus cambios se conservan; vuelve a intentarlo."
                    .into(),
            );
        }
    }
}
