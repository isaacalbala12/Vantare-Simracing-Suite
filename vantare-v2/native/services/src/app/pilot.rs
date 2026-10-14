use super::{App, Command, Error, Reply, Result, now};

impl App {
    pub(super) fn pilot_reply(&mut self, command: Command) -> Result<Reply> {
        let explicit_sync = matches!(command, Command::PilotSync);
        if self.config.native_account_configured() {
            self.ensure_account()?;
        }
        let identity = self
            .account
            .as_ref()
            .and_then(crate::account::Account::identity)
            .cloned();
        if self.pilot.is_none() || self.pilot_identity != identity {
            // Libera el escritor anterior antes de abrir otro namespace.
            self.pilot = None;
            self.pilot = Some(crate::pilot::Local::open(
                &self.root,
                identity.as_ref().map(|value| value.issuer.as_str()),
                identity.as_ref().map(|value| value.subject.as_str()),
            )?);
            self.pilot_identity = identity;
        }
        if let Command::PilotSave {
            profile,
            expected_revision,
        } = command
        {
            self.pilot
                .as_mut()
                .ok_or(Error::Storage)?
                .save(profile, expected_revision)?;
        }
        let message = if explicit_sync || self.pilot_identity.is_some() {
            let outcome = self.sync_pilot();
            match outcome {
                Ok(()) => "Perfil sincronizado con tu cuenta".into(),
                Err(error) => format!("Perfil local conservado. No se pudo sincronizar: {error}"),
            }
        } else {
            "Perfil guardado en este equipo; solo tú puedes verlo".into()
        };
        Ok(Reply::Pilot {
            state: self.pilot.as_ref().ok_or(Error::Storage)?.state().clone(),
            message,
        })
    }
    fn sync_pilot(&mut self) -> Result<()> {
        let time = now()?;
        self.ensure_data(time)?;
        let account = self.account.as_ref().ok_or(Error::Authentication)?;
        if account.identity() != self.pilot_identity.as_ref() {
            return Err(Error::Authentication);
        }
        let request = self
            .data_session
            .as_ref()
            .ok_or(Error::Authentication)?
            .request(
                &self.http,
                self.bridge.as_ref().ok_or(Error::BridgeUnconfigured)?,
                account,
                time,
            );
        let outcome =
            crate::pilot::sync::synchronize(self.pilot.as_mut().ok_or(Error::Storage)?, &request);
        if outcome == Err(Error::Authentication) {
            self.data_session = None;
        }
        outcome
    }
}
