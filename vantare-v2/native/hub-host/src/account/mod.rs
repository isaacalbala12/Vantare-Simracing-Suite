//! Host-owned presentation state. Services owns authentication; Feed alone owns rights.
pub mod clipboard;
mod email;
mod identity;
mod navigation;
pub mod platform;
mod reducer;
mod safety;
mod types;
use crate::protocol::{AccessView, HostError};
pub use email::{
    CODE_LENGTH, EMAIL_MAX, PASSWORD_MAX, PURCHASE_WAIT_SECONDS, RETRY_AFTER_MAX_SECONDS,
};
use reducer::{State as Reducer, Transition};
pub use safety::{NAME_MAX, PHOTO_BASE64_MAX, TEXT_MAX, clean};
use std::{
    collections::BTreeSet,
    time::{Duration, Instant},
};
pub use types::*;
use vantare_ipc::{
    control,
    services_protocol::{Command, Reply as CoreReply, Session},
};
pub(crate) const BACKGROUND_ID: u32 = u32::MAX;
pub const LOGIN_POLL_MS: u64 = 250;
pub const LICENSE_POLL_MS: u64 = 5000;
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum Operation {
    Begin,
    Cancel,
    Copy,
    Email,
    Logout,
    Check,
    Profile,
    Purchase,
    Reset,
    Status,
    Poll,
    LicenseStatus,
}
#[allow(
    clippy::struct_excessive_bools,
    reason = "independent polling, profile, device and logout observations"
)]
pub struct State {
    reducer: Reducer,
    form: Option<email::Form>,
    pub pending: BTreeSet<Operation>,
    pub background: Option<Operation>,
    status_done: bool,
    need_poll: bool,
    profile_requested: bool,
    due: Instant,
    name: String,
    photo: Option<String>,
    notice: Option<String>,
    device_limit: bool,
    purchase_until: Option<Instant>,
    purchase_message: Option<String>,
    logout_uncertain: bool,
}
impl Default for State {
    fn default() -> Self {
        Self::new()
    }
}
impl State {
    pub fn new() -> Self {
        Self {
            reducer: Reducer::from_build(),
            form: None,
            pending: BTreeSet::new(),
            background: None,
            status_done: false,
            need_poll: false,
            profile_requested: false,
            due: Instant::now(),
            name: String::new(),
            photo: None,
            notice: None,
            device_limit: false,
            purchase_until: None,
            purchase_message: None,
            logout_uncertain: false,
        }
    }
    pub fn view(&self, access: &AccessView, now: Instant, wall: u64) -> AccountView {
        let verified = access.verified && !access.blocked;
        let gate = if self.form.is_some() {
            Gate::Email
        } else if !self.reducer.required() {
            Gate::None
        } else if self.reducer.transition == Transition::Cancel {
            Gate::Canceling
        } else if self.reducer.logout_failed() {
            Gate::LogoutFailed
        } else if self.reducer.logout_requested() {
            Gate::LoggingOut
        } else if self.reducer.transition == Transition::Choose {
            Gate::Choose
        } else if self.reducer.login_requested {
            Gate::WaitingBrowser
        } else if !self.reducer.session_checked && self.reducer.error.is_none() {
            Gate::Checking
        } else {
            Gate::Choose
        };
        let plan = if verified
            && self
                .reducer
                .policy
                .as_ref()
                .is_some_and(|p| p.catalog == control::CatalogAccess::LaunchV1)
        {
            PlanView::Founders
        } else if verified {
            PlanView::Verified
        } else if let Some(text) = self.reducer.policy_denial(wall).filter(|_| access.blocked) {
            PlanView::Denied { text: clean(&text) }
        } else {
            PlanView::Unverified
        };
        let modules = [
            ModuleKind::Studio,
            ModuleKind::Launcher,
            ModuleKind::Calendar,
            ModuleKind::Strategy,
            ModuleKind::Engineer,
        ]
        .map(|id| ModuleView {
            id,
            status: match id {
                ModuleKind::Strategy | ModuleKind::Engineer => ModuleStatus::Soon,
                ModuleKind::Calendar if verified && access.calendar => ModuleStatus::Included,
                ModuleKind::Studio | ModuleKind::Launcher if verified => ModuleStatus::Included,
                _ => ModuleStatus::Unverified,
            },
        });
        AccountView {
            configured: self.reducer.configured,
            gate,
            session: self.reducer.session.current().into(),
            working: !self.pending.is_empty(),
            name: self.name.clone(),
            photo: self.photo.clone(),
            plan,
            verified,
            blocked: access.blocked,
            modules,
            email: self.form.as_ref().map(|f| f.view(now)),
            copy_link: CopyLinkView {
                available: self.can_copy(),
                copied: self.reducer.manual.copied,
            },
            error: self.reducer.error.as_deref().map(clean),
            notice: self.notice.clone(),
            session_notice: self.reducer.session.current() == Session::NeedsSignIn,
            can_return_after_logout: verified && self.reducer.can_return_after_logout(wall),
            device_limit: self.device_limit,
            purchase: PurchaseView {
                waiting: self.purchase_until.is_some_and(|until| now < until),
                message: self.purchase_message.clone(),
            },
            portal: platform::portal().is_some(),
            channel: vantare_ipc::product::CHANNEL.into(),
        }
    }
    pub fn observe_policy(&mut self, policy: control::Policy, now: Instant) {
        self.reducer.observe_core_policy(policy);
        if self.purchase_until.is_some_and(|until| now >= until) {
            self.stop_purchase(
                "No se han confirmado los derechos. Usa Comprobar acceso para reintentarlo.",
            );
        }
    }
    pub fn next_background(&self, now: Instant) -> Option<Operation> {
        if self.background.is_some() || now < self.due {
            return None;
        }
        if !self.status_done {
            return Some(Operation::Status);
        }
        if self.need_poll || self.reducer.pending() {
            return Some(Operation::Poll);
        }
        if self.reducer.session_known() && !self.profile_requested && self.name.is_empty() {
            return Some(Operation::Profile);
        }
        self.reducer
            .session_known()
            .then_some(Operation::LicenseStatus)
    }
    pub fn background_accepted(&mut self, op: Operation, now: Instant) {
        self.background = Some(op);
        if op == Operation::Profile {
            self.profile_requested = true;
        }
        self.due = now
            + Duration::from_millis(if op == Operation::Poll {
                LOGIN_POLL_MS
            } else {
                LICENSE_POLL_MS
            });
    }
    pub fn command(op: Operation) -> Command {
        match op {
            Operation::Begin => Command::AccountBegin,
            Operation::Cancel => Command::AccountCancel,
            Operation::Copy => Command::AccountCopyLink,
            Operation::Logout => Command::Logout,
            Operation::Check => Command::LicenseRenew,
            Operation::Profile => Command::AccountProfileRefresh,
            Operation::Reset => Command::DeviceReset,
            Operation::Status => Command::Status,
            Operation::Poll => Command::AccountPoll,
            Operation::LicenseStatus => Command::LicenseStatus,
            Operation::Email | Operation::Purchase => unreachable!("payload command required"),
        }
    }
    pub fn signed_in(&self) -> bool {
        self.reducer.signed_in()
    }
    pub fn configured(&self) -> bool {
        self.reducer.configured
    }
    pub fn canceling(&self) -> bool {
        self.reducer.transition == Transition::Cancel
    }
    pub fn logging_out(&self) -> bool {
        self.reducer.logout_requested() || self.pending.contains(&Operation::Logout)
    }
    pub fn can_copy(&self) -> bool {
        self.reducer.manual.available
            && self.reducer.login_requested
            && !self.canceling()
            && !self.logging_out()
    }
    pub fn can_start(&self, op: Operation) -> Result<(), HostError> {
        if !self.configured() {
            return Err(HostError::Denied);
        }
        if self.pending.contains(&op) {
            return Err(HostError::Busy);
        }
        if matches!(op, Operation::Logout | Operation::Cancel) {
            return Ok(());
        }
        if !self.pending.is_empty() || self.canceling() || self.logging_out() {
            return Err(HostError::Busy);
        }
        if op == Operation::Copy && !self.can_copy() {
            return Err(HostError::Denied);
        }
        if matches!(
            op,
            Operation::Purchase | Operation::Profile | Operation::Reset
        ) && !self.signed_in()
        {
            return Err(HostError::Denied);
        }
        Ok(())
    }
    pub fn accepted(&mut self, op: Operation, command: &Command) {
        self.reducer.requested(command);
        self.pending.insert(op);
        self.notice = None;
        if matches!(op, Operation::Begin | Operation::Logout) {
            self.name.clear();
            self.photo = None;
            self.form = None;
            self.profile_requested = false;
            self.purchase_until = None;
            self.logout_uncertain = false;
        }
        if op == Operation::Cancel {
            self.form = None;
        }
    }
    pub fn open_email(&mut self, mode: EmailMode, now: Instant) -> Result<(), HostError> {
        self.can_start(Operation::Email)?;
        self.form = Some(email::Form::new(mode, now));
        Ok(())
    }
    pub fn email_command(&self, intent: &EmailIntent, now: Instant) -> Result<Command, HostError> {
        self.can_start(Operation::Email)?;
        let action = self
            .form
            .as_ref()
            .ok_or(HostError::AccountInvalid)?
            .command(intent, now)?;
        Ok(Command::AccountEmail { action })
    }
    pub fn hide_email(&mut self) {
        self.form = None;
    }
    pub fn choose(&mut self) -> Result<(), HostError> {
        self.can_start(Operation::Begin)?;
        self.reducer.transition = Transition::Choose;
        self.reducer.error = None;
        Ok(())
    }
    pub fn back(&mut self, access: &AccessView) -> Result<(), HostError> {
        if !self.pending.is_empty() {
            return Err(HostError::Busy);
        }
        if self.reducer.transition == Transition::Choose
            || (self.reducer.logout_failed() && access.verified && !access.blocked)
        {
            self.reducer.transition = Transition::Idle;
            self.reducer.error = None;
            self.logout_uncertain = false;
            Ok(())
        } else {
            Err(HostError::Denied)
        }
    }
    pub fn retry_operation(&self) -> Operation {
        if self.reducer.logout_requested() {
            Operation::Logout
        } else if self.reducer.session_checked {
            Operation::Begin
        } else {
            Operation::Status
        }
    }
    pub fn stop_purchase(&mut self, message: &str) {
        self.purchase_until = None;
        self.purchase_message = Some(message.into());
    }
    pub fn checkout_opened(&mut self, now: Instant) {
        self.purchase_until = Some(now + Duration::from_secs(PURCHASE_WAIT_SECONDS));
        self.purchase_message =
            Some("Compra abierta. Los derechos se comprobarán automáticamente.".into());
    }
    pub fn copied(&mut self, copied: bool) {
        if self.can_copy() {
            self.reducer.manual.copied = copied;
        }
    }
    pub fn failed(&mut self, op: Operation, error: &HostError, background: bool, now: Instant) {
        let current = self.accepts_completion(op);
        self.retire(op, background);
        if !current {
            return;
        }
        if background && *error == HostError::Busy {
            return;
        }
        let message = if *error == HostError::Busy {
            "Inténtalo de nuevo."
        } else if op == Operation::Logout {
            "El cierre de sesión no se ha confirmado. Comprobando la sesión real."
        } else {
            "No se pudo completar el acceso. Inténtalo de nuevo."
        };
        self.reducer.reduce(
            &CoreReply::Error {
                message: message.into(),
            },
            true,
            false,
        );
        if op == Operation::Logout {
            self.logout_uncertain = true;
            self.need_poll = true;
            self.due = now;
        }
    }
    fn accepts_completion(&self, op: Operation) -> bool {
        if self.pending.contains(&Operation::Logout) {
            return op == Operation::Logout;
        }
        !self.pending.contains(&Operation::Cancel) || op == Operation::Cancel
    }
    fn retire(&mut self, op: Operation, background: bool) {
        if background {
            self.background = None;
        } else {
            self.pending.remove(&op);
        }
    }
    pub fn complete(
        &mut self,
        op: Operation,
        reply: &CoreReply,
        background: bool,
        now: Instant,
    ) -> Result<(), HostError> {
        if !self.accepts_completion(op) {
            self.retire(op, background);
            return Err(HostError::Denied);
        }
        let unconfirmed_logout = op == Operation::Logout
            && matches!(reply,CoreReply::Account {session,error:None,..} if *session != Session::SignedOut);
        if !expected(op, reply) || unconfirmed_logout {
            self.failed(op, &HostError::Denied, background, now);
            return Err(HostError::Denied);
        }
        self.retire(op, background);
        if self.logout_uncertain
            && background
            && op == Operation::Poll
            && let CoreReply::Account {
                session: session @ (Session::SignedIn | Session::NeedsSignIn),
                ..
            } = reply
        {
            self.reducer.session.observe(*session, false);
            self.reducer.session_checked = true;
            self.need_poll = false;
            return Ok(());
        }
        let sanitized = sanitize_reply(reply);
        let accepted = self
            .reducer
            .reduce(&sanitized, true, op == Operation::Profile);
        match &sanitized {
            CoreReply::Status { message, .. } => {
                self.status_done = true;
                self.need_poll = self.reducer.configured;
                self.notice = (!message.is_empty()).then(|| message.clone());
            }
            CoreReply::Account {
                session,
                profile,
                message,
                ..
            } if accepted => {
                self.need_poll = *session == Session::Pending;
                if *session == Session::SignedOut {
                    self.name.clear();
                    self.photo = None;
                    self.logout_uncertain = false;
                }
                if matches!(session, Session::SignedIn | Session::NeedsSignIn)
                    && let Some(profile) = profile
                {
                    self.name = safety::name(&profile.name);
                    self.photo = safety::photo(profile.image_jpeg.as_deref());
                }
                self.notice = (!message.is_empty()).then(|| message.clone());
            }
            CoreReply::Email {
                stage,
                retry_after_seconds,
                message,
                error,
            } => {
                if let Some(form) = &mut self.form {
                    form.accept(
                        (*stage).into(),
                        *retry_after_seconds,
                        message,
                        error.is_some(),
                        now,
                    );
                }
                self.need_poll = *stage == vantare_ipc::services_protocol::EmailStage::Authorizing;
            }
            CoreReply::License { message, .. } => {
                self.device_limit = false;
                self.need_poll = self.reducer.renewal_acknowledged(&sanitized).is_some();
                self.notice = (!message.is_empty()).then(|| message.clone());
            }
            CoreReply::DeviceLimit { message } => {
                self.device_limit = true;
                self.notice = Some(message.clone());
            }
            CoreReply::LicenseFailure { message, .. } | CoreReply::Error { message } => {
                self.notice = Some(message.clone());
                self.need_poll = matches!(sanitized, CoreReply::LicenseFailure { .. });
            }
            _ => {}
        }
        let next = self.reducer.next_command(&sanitized, &mut None);
        self.need_poll |= matches!(next, Some(Command::AccountPoll));
        self.reducer.finish_reply();
        if self.need_poll {
            self.due = now + Duration::from_millis(LOGIN_POLL_MS);
        }
        Ok(())
    }
}
fn expected(op: Operation, reply: &CoreReply) -> bool {
    match reply {
        CoreReply::Error { .. } => true,
        CoreReply::Status { .. } => matches!(op, Operation::Status | Operation::Check),
        CoreReply::Account { .. } => matches!(
            op,
            Operation::Begin
                | Operation::Cancel
                | Operation::Logout
                | Operation::Poll
                | Operation::Profile
                | Operation::Reset
                | Operation::Email
        ),
        CoreReply::Email { .. } => matches!(op, Operation::Email | Operation::Poll),
        CoreReply::AccountLink { .. } => op == Operation::Copy,
        CoreReply::Checkout { .. } => op == Operation::Purchase,
        CoreReply::License { .. }
        | CoreReply::LicenseFailure { .. }
        | CoreReply::DeviceLimit { .. } => matches!(op, Operation::Check | Operation::Reset),
        CoreReply::LicenseStatus { .. } => op == Operation::LicenseStatus,
        CoreReply::Closed => op == Operation::Email,
        _ => false,
    }
}
fn sanitize_reply(reply: &CoreReply) -> CoreReply {
    let mut reply = reply.clone();
    match &mut reply {
        CoreReply::Status { message, .. }
        | CoreReply::License { message, .. }
        | CoreReply::LicenseFailure { message, .. }
        | CoreReply::Error { message }
        | CoreReply::DeviceLimit { message } => *message = clean(message),
        CoreReply::Account {
            message,
            error,
            profile,
            ..
        } => {
            *message = clean(message);
            *error = error.as_deref().map(clean);
            if let Some(profile) = profile {
                profile.name = safety::name(&profile.name);
                profile.image_url = None;
            }
        }
        CoreReply::Email { message, error, .. } => {
            *message = clean(message);
            *error = error.as_deref().map(clean);
        }
        _ => {}
    }
    reply
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum ResponseKind {
    Get,
    Begin,
    Cancel,
    CopyLink,
    Email,
    Logout,
    Check,
    PhotoRefresh,
    Portal,
    Purchase,
    PurchaseStop,
    DeviceReset,
    Retry,
    Back,
    Choose,
}

#[cfg(test)]
mod tests;
