use super::{App, Command, Error, Reply, Result, now};

impl App {
    pub(super) fn pilot_reply(&mut self, command: Command) -> Result<Reply> {
        let explicit_sync = matches!(command, Command::PilotSync);
        let saving = matches!(command, Command::PilotSave { .. });
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
                Ok(()) if self.pilot.as_ref().is_some_and(|pilot| pilot.state().revision == 0) =>
                    "Aún no tienes un perfil guardado. Completa tus datos y pulsa Guardar perfil.".into(),
                Ok(()) => "Perfil sincronizado con tu cuenta".into(),
                Err(Error::Conflict) => "Perfil local conservado. Hay cambios en tu cuenta que no se han sobrescrito.".into(),
                Err(Error::PilotRejected) => "Perfil local conservado. Revisa los datos y vuelve a guardar para sincronizarlo.".into(),
                Err(Error::Authentication) => "Perfil local conservado. Inicia sesión para sincronizarlo.".into(),
                Err(_) => "Perfil local conservado. La sincronización con tu cuenta no está disponible; se reintentará al guardar o reiniciar la app.".into(),
            }
        } else if self
            .pilot
            .as_ref()
            .is_some_and(|pilot| pilot.state().revision == 0)
        {
            "Aún no tienes un perfil guardado. Completa tus datos y pulsa Guardar perfil.".into()
        } else if saving {
            "Perfil guardado en este equipo; solo tú puedes verlo".into()
        } else {
            "Perfil cargado en este equipo; solo tú puedes verlo".into()
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        config::BuildConfig,
        pilot::{Local, PilotProfile},
        test_http::Server,
    };

    #[test]
    fn pilot_load_recovers_historical_receipt_and_reports_real_http_cas_conflict() {
        for conflict in [false, true] {
            let time = now().expect("clock");
            let profile = PilotProfile {
                description: "A".into(),
                ..Default::default()
            };
            let current = PilotProfile {
                description: "C".into(),
                ..Default::default()
            };
            let server = Server::start(vec![
                (200, serde_json::json!({"access_token":"rotated-local-access","refresh_token":"rotated-local-refresh","token_type":"Bearer","expires_in":3600}).to_string()),
                (200, serde_json::json!({"sub":"user_fixture"}).to_string()),
                (200, serde_json::json!({"version":1,"account_id":"550e8400-e29b-41d4-a716-446655440000","data_access_token":"data-fixture","expires_at":time+120}).to_string()),
                if conflict { (500, r#"{"code":"40001"}"#.into()) }
                else { (200, serde_json::json!({"profile":profile,"revision":1,"photo_hash":null}).to_string()) },
                (200, serde_json::json!({"profile":current,"revision":2,"photo_hash":null}).to_string()),
            ]);
            let (root, store) = crate::test_store("app-pilot-load");
            let account = crate::account::fixture(&server.base, &store);
            let identity = account.identity().expect("signed in").clone();
            let mut local =
                Local::open(&root, Some(&identity.issuer), Some(&identity.subject)).expect("local");
            if conflict {
                local.accept_remote(profile.clone(), 1).expect("R1");
            }
            local
                .save(profile, local.state().revision)
                .expect("pending A");
            drop(local);
            let config = BuildConfig {
                supabase: None,
                anon_key: None,
                license_keys: None,
                channel: None,
                native_oauth: None,
            };
            let mut app = App::new(config, root.clone());
            app.account = Some(account);
            app.store = Some(store);
            // Endpoint loopback de fixture; la configuración productiva exige HTTPS.
            app.bridge = Some(crate::bridge::Config {
                authorize: server
                    .base
                    .join("functions/v1/native-account-authorize")
                    .expect("URL"),
                supabase: server.base.clone(),
                anon_key: "public-fixture".into(),
            });
            let Reply::Pilot { state, message } =
                app.pilot_reply(Command::PilotLoad).expect("one PilotLoad")
            else {
                panic!("pilot reply")
            };
            assert_eq!(state.remote_revision, 2);
            assert_eq!(state.pending, conflict);
            assert_eq!(state.profile.description, if conflict { "A" } else { "C" });
            assert!(message.contains(if conflict {
                "no se han sobrescrito"
            } else {
                "sincronizado"
            }));
            server.finish();
            drop(app);
            let local = Local::open(&root, Some(&identity.issuer), Some(&identity.subject))
                .expect("restart");
            assert_eq!(*local.state(), state);
            drop(local);
            std::fs::remove_dir_all(root).expect("cleanup");
        }
    }
}
