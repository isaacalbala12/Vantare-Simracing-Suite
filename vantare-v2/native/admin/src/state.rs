//! Estado comprobable sin ventana: nunca aplica cambios antes del ACK.
use crate::client::{Action, Module, Report, Rollout, Status, User, field};
use vantare_services::{Error, Result};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Screen {
    Users,
    Rollout,
    Reports,
}
impl Screen {
    pub const ALL: [Self; 3] = [Self::Users, Self::Rollout, Self::Reports];
    pub fn label(self) -> &'static str {
        match self {
            Self::Users => "Usuarios",
            Self::Rollout => "Módulos para todos",
            Self::Reports => "Reportes",
        }
    }
}
pub struct State {
    pub demo: bool,
    pub screen: Screen,
    pub signed_in: bool,
    pub busy: bool,
    pub message: String,
    pub confirmation: Option<Action>,
    pub users: Vec<User>,
    pub user: Option<User>,
    pub rollout: Vec<Rollout>,
    pub reports: Vec<Report>,
    pub report: Option<Report>,
    pub filter: Option<Status>,
    pub cursor: Option<String>,
}
impl State {
    pub fn new(demo: bool, screen: Screen) -> Self {
        let mut state = Self {
            demo,
            screen,
            signed_in: demo,
            busy: false,
            message: String::new(),
            confirmation: None,
            users: vec![],
            user: None,
            rollout: vec![],
            reports: vec![],
            report: None,
            filter: None,
            cursor: None,
        };
        if demo {
            state.users = vec![
                User {
                    account_id: "11111111-1111-4111-8111-111111111111".into(),
                    email: "ana@example.invalid".into(),
                    name: "Ana Martín · DEMO".into(),
                    created_at: "2026-10-01T10:00:00Z".into(),
                    last_seen_at: Some("2026-10-03T09:30:00Z".into()),
                    roles: vec!["tester".into()],
                    modules: vec![Module::Strategy, Module::Analysis],
                    reports_count: 2,
                },
                User {
                    account_id: "22222222-2222-4222-8222-222222222222".into(),
                    email: "pablo@example.invalid".into(),
                    name: "Pablo Ruiz · DEMO".into(),
                    created_at: "2026-10-02T10:00:00Z".into(),
                    last_seen_at: None,
                    roles: vec![],
                    modules: vec![Module::Calendar],
                    reports_count: 0,
                },
            ];
            state.user = state.users.first().cloned();
            state.rollout = Module::ALL
                .into_iter()
                .map(|module| Rollout {
                    module,
                    enabled_for_all: module == Module::Calendar,
                })
                .collect();
            state.reports = vec![Report { report_id: "demo-report-1".into(), author: "ana@example.invalid".into(), module: "strategy".into(), app_version: "0.4.0-beta · DEMO".into(), text: "DATOS FALSOS DE DEMOSTRACIÓN\nAl cambiar de sesión, el plan conserva el combustible anterior.\nEsperaba que se recalculara al cargar la nueva sesión.\nPasos: abrir Strategy, seleccionar carrera y cambiar de sesión.".into(), created_at: "2026-10-03T09:30:00Z".into(), status: Status::Submitted, has_screenshots: true, screenshots: vec![] }, Report { report_id: "demo-report-2".into(), author: "ana@example.invalid".into(), module: "analysis".into(), app_version: "0.4.0-beta · DEMO".into(), text: "DEMO: el gráfico de vueltas no muestra la última vuelta.".into(), created_at: "2026-10-02T15:00:00Z".into(), status: Status::Validated, has_screenshots: false, screenshots: vec![] }];
            state.report = state.reports.first().cloned();
            state.message = "DEMO · datos falsos, cambios solo en memoria".into();
        }
        state
    }
    pub fn propose(&mut self, action: Action) -> Result<()> {
        action.validate()?;
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
        self.message = if error == Error::Denied {
            "Acceso denegado: solo el owner puede administrar la beta".into()
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
        self.signed_in = false;
        self.users.clear();
        self.user = None;
        self.reports.clear();
        self.report = None;
        self.rollout.clear();
        self.cursor = None;
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
        let reload = match action {
            Action::SearchAccounts { .. } => {
                let users: Vec<User> = field(response, "accounts")?;
                if users.len() > 50 {
                    return Err(Error::TooLarge);
                }
                self.users = users;
                self.user = None;
                None
            }
            Action::GetAccount { account_id } => {
                let user: User = field(response, "account")?;
                if &user.account_id != account_id {
                    return Err(Error::Protocol);
                }
                if let Some(row) = self
                    .users
                    .iter_mut()
                    .find(|row| row.account_id == user.account_id)
                {
                    row.clone_from(&user);
                }
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
                self.rollout = rows;
                None
            }
            Action::ListReports { .. } => {
                let reports: Vec<Report> = field(response, "reports")?;
                if reports.len() > 100 {
                    return Err(Error::TooLarge);
                }
                let cursor: Option<String> = field(response, "cursor")?;
                self.reports = reports;
                self.cursor = cursor;
                self.report = None;
                None
            }
            Action::GetReport { report_id } => {
                let report: Report = field(response, "report")?;
                if &report.report_id != report_id || report.screenshots.len() > 3 {
                    return Err(Error::Protocol);
                }
                if let Some(row) = self
                    .reports
                    .iter_mut()
                    .find(|row| row.report_id == report.report_id)
                {
                    row.clone_from(&report);
                }
                self.report = Some(report);
                None
            }
            Action::SetTester { account_id, .. } | Action::SetModule { account_id, .. } => {
                Some(Action::GetAccount {
                    account_id: account_id.clone(),
                })
            }
            Action::SetRollout { .. } => Some(Action::GetRollout),
            Action::SetReportStatus { report_id, .. } => Some(Action::GetReport {
                report_id: report_id.clone(),
            }),
        };
        self.busy = false;
        self.message = "Datos confirmados por el servidor".into();
        Ok(reload)
    }
    pub fn demo_action(&mut self, action: &Action) {
        match action {
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
            }
            Action::SetReportStatus { status, .. } => {
                if let Some(report) = &mut self.report {
                    report.status = *status;
                }
            }
            _ => {}
        }
        if let Some(user) = &self.user
            && let Some(row) = self
                .users
                .iter_mut()
                .find(|u| u.account_id == user.account_id)
        {
            row.clone_from(user);
        }
        if let Some(report) = &self.report
            && let Some(row) = self
                .reports
                .iter_mut()
                .find(|r| r.report_id == report.report_id)
        {
            row.clone_from(report);
        }
        self.busy = false;
        self.message = "DEMO · cambio simulado, no se ha enviado al servidor".into();
    }
}
#[cfg(test)]
mod tests {
    use super::*;
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
                &serde_json::json!({"report":report}),
            )
            .expect("confirmed server read");
        assert_eq!(state.reports[0].status, Status::Closed);
        assert_eq!(
            state.report.as_ref().expect("detail").status,
            Status::Closed
        );
        assert_eq!(state.visible_reports().count(), 0);
        state.filter = Some(Status::Closed);
        assert_eq!(state.visible_reports().count(), 1);
    }
}
