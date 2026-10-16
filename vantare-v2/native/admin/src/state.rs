//! Estado comprobable sin ventana: nunca aplica cambios antes del ACK.
use crate::client::{Action, Creator, CreatorLine, Module, Report, Rollout, Status, User, field};
use vantare_services::{Error, Result};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Screen {
    Users,
    Rollout,
    Reports,
    Creators,
    Mail,
    Login,
}
impl Screen {
    pub const ALL: [Self; 5] = [
        Self::Users,
        Self::Creators,
        Self::Reports,
        Self::Rollout,
        Self::Mail,
    ];
    pub fn label(self) -> &'static str {
        match self {
            Self::Users => "Personas",
            Self::Rollout => "Módulos",
            Self::Reports => "Informes",
            Self::Creators => "Creadores",
            Self::Mail => "Correos",
            Self::Login => "Entrar",
        }
    }
}
pub struct State {
    pub mail: crate::mail::MailState,
    pub demo: bool,
    pub screen: Screen,
    pub signed_in: bool,
    pub busy: bool,
    pub message: String,
    pub confirmation: Option<Action>,
    pub users: Vec<User>,
    pub creators: Vec<Creator>,
    pub creator: Option<Creator>,
    pub creator_lines: Vec<CreatorLine>,
    pub demo_creator_lines: Vec<(String, Vec<CreatorLine>)>,
    pub account_counts: std::collections::BTreeMap<String, u32>,
    pub report_counts: std::collections::BTreeMap<String, u32>,
    pub accounts_total: u32,
    pub user: Option<User>,
    pub rollout: Vec<Rollout>,
    pub reports: Vec<Report>,
    pub report: Option<Report>,
    pub filter: Option<Status>,
    pub cursor: Option<String>,
    pub users_cursor: Option<String>,
}
impl State {
    pub fn new(demo: bool, screen: Screen) -> Self {
        let mut state = Self {
            mail: if demo {
                crate::mail::MailState::demo()
            } else {
                crate::mail::MailState::default()
            },
            demo,
            screen,
            signed_in: demo,
            busy: false,
            message: String::new(),
            confirmation: None,
            users: vec![],
            creators: vec![],
            creator: None,
            creator_lines: vec![],
            demo_creator_lines: vec![],
            account_counts: std::collections::BTreeMap::default(),
            report_counts: std::collections::BTreeMap::default(),
            accounts_total: 0,
            user: None,
            rollout: vec![],
            reports: vec![],
            report: None,
            filter: None,
            cursor: None,
            users_cursor: None,
        };
        if demo {
            #[derive(serde::Deserialize)]
            struct DemoCreator {
                #[serde(flatten)]
                creator: Creator,
                lines: Vec<CreatorLine>,
            }
            #[derive(serde::Deserialize)]
            struct Fixture {
                users: Vec<User>,
                creators: Vec<DemoCreator>,
                reports: Vec<Report>,
                rollout: Vec<Rollout>,
            }
            let fixture: Fixture = serde_json::from_str(include_str!("../fixtures/r1.json"))
                .expect("approved demo fixture");
            state.users = fixture.users;
            state.user = state.users.get(1).cloned();
            state.rollout = fixture.rollout;
            state.reports = fixture.reports;
            for report in &state.reports {
                *state
                    .report_counts
                    .entry(report.status.key().to_owned())
                    .or_default() += 1;
            }
            state.report = state.reports.first().cloned();
            for row in fixture.creators {
                state
                    .demo_creator_lines
                    .push((row.creator.creator_id.clone(), row.lines));
                state.creators.push(row.creator);
            }
            state.accounts_total = state.users.len().try_into().expect("bounded fixture");
            state.signed_in = screen != Screen::Login;
            state.message = "DEMO · datos falsos, cambios solo en memoria".into();
        }
        state
    }
    pub fn propose(&mut self, action: Action) -> Result<()> {
        action.validate()?;
        if let Action::SetBlocked { account_id, .. } | Action::DeleteAccount { account_id, .. } =
            &action
            && self.users.iter().chain(self.user.iter()).any(|u| {
                &u.account_id == account_id && (u.owner || u.roles.iter().any(|r| r == "owner"))
            })
        {
            return Err(Error::AccountConflict);
        }
        if self.busy || self.confirmation.is_some() {
            return Err(Error::Busy);
        }
        if !self.signed_in {
            return Err(Error::Authentication);
        }
        if !action.mutation() {
            return Err(Error::Protocol);
        }
        self.confirmation = Some(action);
        Ok(())
    }
    pub fn confirm(&mut self) -> Result<Action> {
        if self.busy {
            return Err(Error::Busy);
        }
        let action = self.confirmation.take().ok_or(Error::Canceled)?;
        self.busy = true;
        self.message = "Guardando…".into();
        Ok(action)
    }
    pub fn failed(&mut self, error: Error) {
        self.busy = false;
        self.confirmation = None;
        self.message = if self.screen == Screen::Mail && error == Error::Unconfigured {
            "Correos todavía no está activado. Revisa la configuración del servidor.".into()
        } else if self.screen == Screen::Mail
            && self.mail.campaign.is_none()
            && error == Error::AccountConflict
        {
            "Esa dirección está asociada a una cuenta. Usa el borrado de cuenta para retirarla."
                .into()
        } else if self.screen == Screen::Mail
            && matches!(error, Error::Conflict | Error::AccountConflict)
        {
            "La campaña ha cambiado. Actualiza y revisa el borrador antes de confirmar.".into()
        } else if error == Error::DeletionUnavailable {
            "El borrado aún no está disponible. Falta revisar y conectar su barrera.".into()
        } else if error == Error::Conflict {
            "La cuenta o el correo ha cambiado. Actualiza sus datos antes de confirmar.".into()
        } else if error == Error::RateLimited {
            "Espera un minuto antes de volver a intentarlo.".into()
        } else if error == Error::AccountChangeIncomplete {
            "El bloqueo quedó incompleto. Consulta la cuenta y vuelve a confirmar para terminar la cancelación.".into()
        } else if error == Error::Uncertain {
            "El resultado no está confirmado. Actualiza los datos antes de repetir el cambio."
                .into()
        } else if error == Error::NotFound {
            "La persona, el creador o el informe ya no existe. Actualiza la lista.".into()
        } else if error == Error::Denied {
            "Esta cuenta no es la del dueño. Entra con la cuenta de Isaac.".into()
        } else {
            format!("Error: {error}. Vuelve a consultar antes de repetir un cambio.")
        };
        if matches!(
            error,
            Error::Authentication | Error::Denied | Error::Expired
        ) {
            self.clear_private();
        }
    }
    pub fn clear_private(&mut self) {
        self.mail = crate::mail::MailState::default();
        self.signed_in = false;
        self.users.clear();
        self.creators.clear();
        self.creator = None;
        self.creator_lines.clear();
        self.demo_creator_lines.clear();
        self.account_counts.clear();
        self.report_counts.clear();
        self.accounts_total = 0;
        self.user = None;
        self.reports.clear();
        self.report = None;
        self.rollout.clear();
        self.cursor = None;
        self.users_cursor = None;
        self.confirmation = None;
    }
    pub fn visible_reports(&self) -> impl Iterator<Item = (usize, &Report)> {
        self.reports
            .iter()
            .enumerate()
            .filter(|(_, report)| self.filter.is_none_or(|status| status == report.status))
    }
    pub fn accept(
        &mut self,
        action: &Action,
        response: &serde_json::Value,
    ) -> Result<Option<Action>> {
        if action.label().starts_with("mail_") {
            self.accept_mail(action, response)?;
            self.busy = false;
            self.message = "Datos de correos confirmados".into();
            return Ok(if matches!(action, Action::MailForgetWaitlist { .. }) {
                Some(Action::MailList)
            } else {
                None
            });
        }
        let reload = match action {
            Action::SearchAccounts { query, .. } => {
                self.accept_accounts(query, response)?;
                None
            }
            Action::GetAccount { account_id } => {
                let user: User = field(response, "account")?;
                if &user.account_id != account_id {
                    return Err(Error::Protocol);
                }
                self.replace_user_row(&user);
                self.user = Some(user);
                None
            }
            Action::GetRollout => {
                let rows: Vec<Rollout> = field(response, "rollout")?;
                if rows.len() != 4
                    || Module::ALL
                        .iter()
                        .any(|m| rows.iter().filter(|r| r.module == *m).count() != 1)
                {
                    return Err(Error::Protocol);
                }
                self.accounts_total = response
                    .get("accounts_total")
                    .map(|v| serde_json::from_value(v.clone()))
                    .transpose()
                    .map_err(|_| Error::Protocol)?
                    .unwrap_or(0);
                self.rollout = rows;
                None
            }
            Action::ListReports { .. } => {
                let reports: Vec<Report> = field(response, "reports")?;
                if reports.len() > 100 {
                    return Err(Error::TooLarge);
                }
                let cursor: Option<String> = field(response, "next_cursor")?;
                self.report_counts = response
                    .get("counts")
                    .map(|v| serde_json::from_value(v.clone()))
                    .transpose()
                    .map_err(|_| Error::Protocol)?
                    .unwrap_or_default();
                self.reports = reports;
                self.cursor = cursor;
                self.report = None;
                None
            }
            Action::GetReport { report_id } => {
                self.accept_report(report_id, response)?;
                None
            }
            Action::ListCreators => {
                self.creators = field(response, "creators")?;
                self.creator = None;
                self.creator_lines.clear();
                None
            }
            Action::GetCreator { creator_id } => {
                self.accept_creator(creator_id, response)?;
                None
            }
            Action::CreateCreator { .. } => Some(Action::ListCreators),
            Action::RecordCreatorPayout { creator_id, .. } => Some(Action::GetCreator {
                creator_id: creator_id.clone(),
            }),
            Action::DeleteAccount { .. } => Some(Action::SearchAccounts {
                query: String::new(),
                limit: 50,
                cursor: None,
            }),
            Action::SetBlocked { account_id, .. }
            | Action::SetTester { account_id, .. }
            | Action::SetModule { account_id, .. } => Some(Action::GetAccount {
                account_id: account_id.clone(),
            }),
            Action::SetRollout { .. } => Some(Action::GetRollout),
            Action::SetReportStatus { report_id, .. } => Some(Action::GetReport {
                report_id: report_id.clone(),
            }),
            _ => return Err(Error::Protocol),
        };
        self.busy = false;
        self.message = "Datos confirmados por el servidor".into();
        Ok(reload)
    }
    fn accept_creator(&mut self, creator_id: &str, response: &serde_json::Value) -> Result<()> {
        let creator: Creator = field(response, "creator")?;
        if creator.creator_id != creator_id {
            return Err(Error::Protocol);
        }
        let lines = field(response, "lines")?;
        if let Some(row) = self
            .creators
            .iter_mut()
            .find(|r| r.creator_id == creator.creator_id)
        {
            row.clone_from(&creator);
        }
        self.creator = Some(creator);
        self.creator_lines = lines;
        Ok(())
    }
    fn accept_report(&mut self, report_id: &str, response: &serde_json::Value) -> Result<()> {
        let report: Report = field(response, "report")?;
        if report.report_id != report_id || report.screenshots.len() > 3 {
            return Err(Error::Protocol);
        }
        self.replace_report_row(&report);
        self.report = Some(report);
        Ok(())
    }
    fn replace_user_row(&mut self, user: &User) {
        if let Some(row) = self
            .users
            .iter_mut()
            .find(|row| row.account_id == user.account_id)
        {
            for (key, before, after) in [
                (
                    "paying",
                    row.plan != crate::client::Plan::Free,
                    user.plan != crate::client::Plan::Free,
                ),
                (
                    "testers",
                    row.roles.iter().any(|r| r == "tester"),
                    user.roles.iter().any(|r| r == "tester"),
                ),
                ("blocked", row.blocked, user.blocked),
            ] {
                if let Some(n) = self.account_counts.get_mut(key) {
                    if before && !after {
                        *n = n.saturating_sub(1);
                    }
                    if !before && after {
                        *n = n.saturating_add(1);
                    }
                }
            }
            row.clone_from(user);
        }
    }
    fn replace_report_row(&mut self, report: &Report) {
        if let Some(row) = self
            .reports
            .iter_mut()
            .find(|row| row.report_id == report.report_id)
        {
            if row.status != report.status && !self.report_counts.is_empty() {
                if let Some(n) = self.report_counts.get_mut(row.status.key()) {
                    *n = n.saturating_sub(1);
                }
                let n = self
                    .report_counts
                    .entry(report.status.key().to_owned())
                    .or_default();
                *n = n.saturating_add(1);
            }
            row.clone_from(report);
        }
    }
    fn accept_accounts(&mut self, query: &str, response: &serde_json::Value) -> Result<()> {
        let users: Vec<User> = field(response, "accounts")?;
        if users.len() > 50 {
            return Err(Error::TooLarge);
        }
        let cursor: Option<String> = if query.is_empty() {
            field(response, "next_cursor")?
        } else {
            None
        };
        if cursor
            .as_ref()
            .is_some_and(|s| !vantare_services::license::uuid(s))
        {
            return Err(Error::Protocol);
        }
        self.account_counts = response
            .get("counts")
            .map(|v| serde_json::from_value(v.clone()))
            .transpose()
            .map_err(|_| Error::Protocol)?
            .unwrap_or_default();
        self.users_cursor = cursor;
        self.users = users;
        self.user = None;
        Ok(())
    }
    pub fn demo_action(&mut self, action: &Action) {
        if action.label().starts_with("mail_") {
            self.demo_mail_action(action);
            self.busy = false;
            self.message = "DEMO · cambio de correo solo en memoria".into();
            return;
        }
        match action {
            Action::SetBlocked { blocked, .. } => {
                if let Some(user) = &mut self.user {
                    user.blocked = *blocked;
                    if *blocked {
                        user.plan = crate::client::Plan::Free;
                        user.billing = None;
                        user.renews_at = None;
                    }
                }
            }
            Action::DeleteAccount { account_id, .. } => {
                self.users.retain(|u| &u.account_id != account_id);
                self.user = None;
            }
            Action::CreateCreator { .. } | Action::RecordCreatorPayout { .. } => {
                self.demo_creator_action(action);
            }
            Action::SetTester { enabled, .. } => {
                if let Some(user) = &mut self.user {
                    user.roles.retain(|r| r != "tester");
                    if *enabled {
                        user.roles.push("tester".into());
                    }
                }
            }
            Action::SetModule {
                module, enabled, ..
            } => {
                if let Some(user) = &mut self.user {
                    if let Some(access) =
                        user.module_access.iter_mut().find(|a| a.module == *module)
                    {
                        access.individual = *enabled;
                    }
                    user.modules.retain(|m| m != module);
                    if *enabled {
                        user.modules.push(*module);
                    }
                }
            }
            Action::SetRollout {
                module,
                enabled_for_all,
            } => {
                if let Some(row) = self.rollout.iter_mut().find(|r| r.module == *module) {
                    row.enabled_for_all = *enabled_for_all;
                }
                for user in self.users.iter_mut().chain(self.user.iter_mut()) {
                    if let Some(access) =
                        user.module_access.iter_mut().find(|a| a.module == *module)
                    {
                        access.rollout = *enabled_for_all;
                    }
                }
            }
            Action::SetReportStatus {
                status,
                fixed_in_version,
                reason,
                ..
            } => {
                if let Some(report) = &mut self.report {
                    report.status = *status;
                    report.fixed_in_version.clone_from(fixed_in_version);
                    report.reject_reason.clone_from(reason);
                }
            }
            _ => {}
        }
        if let Some(user) = self.user.clone() {
            self.replace_user_row(&user);
        }
        if let Some(report) = self.report.clone() {
            self.replace_report_row(&report);
        }
        self.busy = false;
        self.message = "DEMO · cambio simulado, no se ha enviado al servidor".into();
    }
    fn demo_creator_action(&mut self, action: &Action) {
        match action {
            Action::CreateCreator { name, email, code } => {
                self.creators.push(Creator {
                    history_complete: true,
                    creator_id: format!("00000000-0000-4000-8000-{:012}", self.creators.len() + 40),
                    name: name.clone(),
                    email: email.clone(),
                    code: code.clone(),
                    status: "active".into(),
                    clients_count: 0,
                    sales_cents: 0,
                    earned_cents: 0,
                    paid_out_cents: 0,
                    owed_cents: 0,
                    payable_cents: 0,
                    last_payout_at: None,
                });
            }
            Action::RecordCreatorPayout { amount_cents, .. } => {
                if let Some(c) = &mut self.creator {
                    c.paid_out_cents += amount_cents;
                    c.owed_cents -= amount_cents;
                    c.payable_cents -= amount_cents;
                    c.last_payout_at = Some("Hoy".into());
                    if let Some(row) = self
                        .creators
                        .iter_mut()
                        .find(|r| r.creator_id == c.creator_id)
                    {
                        row.clone_from(c);
                    }
                }
            }
            _ => {}
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn empty_search_lists_accounts_and_cursor_does_not_leak_to_filtered_search() {
        let action = Action::SearchAccounts {
            query: String::new(),
            limit: 50,
            cursor: None,
        };
        assert!(action.validate().is_ok());
        let mut state = State::new(false, Screen::Users);
        let next = "11111111-1111-4111-8111-111111111111";
        state
            .accept(
                &action,
                &serde_json::json!({"accounts":[],"next_cursor":next}),
            )
            .expect("page");
        assert_eq!(state.users_cursor.as_deref(), Some(next));
        state
            .accept(
                &Action::SearchAccounts {
                    query: "Ana".into(),
                    limit: 50,
                    cursor: None,
                },
                &serde_json::json!({"accounts":[]}),
            )
            .expect("filter");
        assert!(state.users_cursor.is_none());
        assert!(
            Action::SearchAccounts {
                query: "Ana".into(),
                limit: 50,
                cursor: Some(next.into())
            }
            .validate()
            .is_err()
        );
        state
            .accept(
                &action,
                &serde_json::json!({"accounts":[],"next_cursor":null}),
            )
            .expect("last page");
        assert!(state.users_cursor.is_none());
    }
    #[test]
    fn deployed_next_cursor_advances_and_last_page_clears_it() {
        let mut state = State::new(false, Screen::Reports);
        let action = Action::ListReports {
            status: None,
            limit: 100,
            cursor: None,
        };
        state
            .accept(
                &action,
                &serde_json::json!({"reports":[], "next_cursor":"report-1"}),
            )
            .expect("page");
        assert_eq!(state.cursor.as_deref(), Some("report-1"));
        state
            .accept(
                &action,
                &serde_json::json!({"reports":[], "next_cursor":null}),
            )
            .expect("last page");
        assert_eq!(state.cursor, None);
    }
    #[test]
    fn confirmation_cancel_failure_and_ack_preserve_facts() {
        let mut s = State::new(true, Screen::Users);
        let original = s.user.clone();
        let action = Action::SetTester {
            account_id: s.user.as_ref().expect("demo").account_id.clone(),
            enabled: false,
        };
        s.propose(action.clone()).expect("propose");
        assert_eq!(s.user, original);
        s.confirmation = None;
        assert_eq!(s.confirm(), Err(Error::Canceled));
        s.propose(action.clone()).expect("propose");
        assert_eq!(s.confirm().expect("confirm"), action);
        assert_eq!(s.propose(action.clone()), Err(Error::Busy));
        s.failed(Error::Offline);
        assert_eq!(s.user, original);
        let reload = s.accept(&action, &serde_json::json!({})).expect("ack");
        assert_eq!(
            reload,
            Some(Action::GetAccount {
                account_id: s.user.as_ref().expect("demo").account_id.clone()
            })
        );
        assert_eq!(s.user, original); // Hasta releer, tampoco cambia el interruptor.
        s.failed(Error::Denied);
        assert!(s.user.is_none() && s.users.is_empty() && !s.signed_in);
    }
    #[test]
    fn malformed_read_does_not_replace_previous_facts() {
        let mut s = State::new(true, Screen::Rollout);
        let before = s.rollout.clone();
        assert_eq!(
            s.accept(&Action::GetRollout, &serde_json::json!({"rollout":[]})),
            Err(Error::Protocol)
        );
        assert_eq!(s.rollout, before);
    }
    #[test]
    fn demo_changes_preserve_owner_and_individual_grants() {
        let mut s = State::new(true, Screen::Users);
        s.user
            .as_mut()
            .expect("demo user")
            .roles
            .push("owner".into());
        let id = s.user.as_ref().expect("demo user").account_id.clone();
        s.demo_action(&Action::SetTester {
            account_id: id.clone(),
            enabled: false,
        });
        assert_eq!(s.user.as_ref().expect("demo user").roles, vec!["owner"]);
        s.demo_action(&Action::SetModule {
            account_id: id,
            module: Module::Calendar,
            enabled: true,
        });
        let grants = s.user.as_ref().expect("demo user").modules.clone();
        s.demo_action(&Action::SetRollout {
            module: Module::Calendar,
            enabled_for_all: false,
        });
        assert_eq!(s.user.as_ref().expect("demo user").modules, grants);
        s.clear_private();
        assert!(s.report.is_none() && s.reports.is_empty() && s.rollout.is_empty());
    }
    #[test]
    fn confirmed_status_updates_detail_list_and_live_filter() {
        let mut state = State::new(true, Screen::Reports);
        state.demo = false; // Prueba el mismo estado que consume respuestas remotas.
        state.filter = Some(Status::Submitted);
        assert_eq!(state.visible_reports().count(), 1);
        let mut report = state.reports[0].clone();
        report.status = Status::Closed;
        state
            .accept(
                &Action::GetReport {
                    report_id: report.report_id.clone(),
                },
                &serde_json::json!({"report":crate::client::tests::report_wire(&report.report_id, report.status, true)}),
            )
            .expect("confirmed server read");
        assert_eq!(state.reports[0].status, Status::Closed);
        assert_eq!(
            state.report.as_ref().expect("detail").status,
            Status::Closed
        );
        assert_eq!(state.visible_reports().count(), 0);
        assert_eq!(state.report_counts.get("submitted"), Some(&0));
        state.filter = Some(Status::Closed);
        assert_eq!(state.visible_reports().count(), 1);
    }
    #[test]
    fn owner_is_protected_and_block_ack_requires_fresh_read() {
        let mut state = State::new(true, Screen::Users);
        let owner = state
            .users
            .iter()
            .find(|u| u.owner)
            .expect("owner")
            .account_id
            .clone();
        for action in [
            Action::SetBlocked {
                account_id: owner.clone(),
                blocked: true,
                reason: None,
            },
            Action::DeleteAccount {
                account_id: owner,
                confirm_email: "isaac@demo.invalid".into(),
            },
        ] {
            assert_eq!(state.propose(action), Err(Error::AccountConflict));
        }
        let account = state.user.as_ref().expect("Ana").clone();
        let action = Action::SetBlocked {
            account_id: account.account_id.clone(),
            blocked: true,
            reason: None,
        };
        state.propose(action.clone()).expect("confirmation");
        assert_eq!(state.confirm().expect("confirm"), action);
        assert_eq!(
            state.accept(&action, &serde_json::json!({})).expect("ack"),
            Some(Action::GetAccount {
                account_id: account.account_id.clone()
            })
        );
        assert_eq!(state.user, Some(account.clone()));
        state.account_counts.insert("blocked".into(), 0);
        let mut blocked = account;
        blocked.blocked = true;
        state
            .accept(
                &Action::GetAccount {
                    account_id: blocked.account_id.clone(),
                },
                &serde_json::json!({"account":blocked}),
            )
            .expect("fresh block");
        assert_eq!(state.account_counts.get("blocked"), Some(&1));
    }
    #[test]
    fn merged_person_detail_preserves_plan_payments_accesses_and_promotion() {
        let mut state = State::new(true, Screen::Users);
        let fixture: serde_json::Value =
            serde_json::from_str(include_str!("../fixtures/r1.json")).expect("wire fixture");
        let mut wire = fixture["users"][1].clone();
        let account_id = wire["account_id"].as_str().expect("account").to_owned();
        wire["report_promotion"] = serde_json::json!({
            "accepted":5,"tier":6,"forfeited":false,"active_discount":"DEMO6",
            "last_error":"promotion_checkout_owner_mismatch"
        });
        state
            .accept(
                &Action::GetAccount { account_id },
                &serde_json::json!({"account":wire}),
            )
            .expect("fresh detail");
        let user = state.user.as_ref().expect("detail");
        assert_eq!(user.plan, crate::client::Plan::Pro);
        assert!(!user.owner && !user.blocked);
        assert!(!user.payments.is_empty());
        assert!(!user.module_access.is_empty());
        let promotion = user.report_promotion.as_ref().expect("promotion");
        assert_eq!((promotion.accepted, promotion.tier), (5, 6));
        assert!(promotion.summary().contains("pendiente de revisión"));
        // A paginated summary may omit the optional detail; the old contract remains valid.
        wire.as_object_mut()
            .expect("wire")
            .remove("report_promotion");
        let summary: crate::client::User = serde_json::from_value(wire).expect("summary");
        assert!(summary.report_promotion.is_none());
        assert_eq!(summary.plan, user.plan);
        assert_eq!(summary.payments, user.payments);
    }
    #[test]
    fn approved_creator_example_and_private_cleanup_are_preserved() {
        let mut state = State::new(true, Screen::Creators);
        let carlos = state
            .creators
            .iter()
            .find(|c| c.code == "CARLOSGT")
            .expect("Carlos")
            .clone();
        assert_eq!(
            (
                carlos.earned_cents,
                carlos.paid_out_cents,
                carlos.owed_cents
            ),
            (392, 96, 296)
        );
        assert!(carlos.history_complete);
        state.creator = Some(carlos);
        state.failed(Error::Denied);
        assert!(
            state.creators.is_empty() && state.creator.is_none() && state.creator_lines.is_empty()
        );
        assert!(state.account_counts.is_empty() && state.report_counts.is_empty());
    }
}
