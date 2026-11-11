use super::{
    Event, HostError, HostToUi, Pipe, RemoteKind, Reply, Request, Session, Topic, frame, io,
};
use crate::account::{AccountView, EmailIntent, Operation, ResponseKind};
use std::time::Instant;
use vantare_ipc::services_protocol::{Command, Reply as CoreReply};
fn reply(kind: ResponseKind, value: AccountView) -> Reply {
    match kind {
        ResponseKind::Get => Reply::AccountGet { value },
        ResponseKind::Begin => Reply::AccountBegin { value },
        ResponseKind::Cancel => Reply::AccountCancel { value },
        ResponseKind::CopyLink => Reply::AccountCopyLink { value },
        ResponseKind::Email => Reply::AccountEmail { value },
        ResponseKind::Logout => Reply::AccountLogout { value },
        ResponseKind::Check => Reply::AccountCheck { value },
        ResponseKind::PhotoRefresh => Reply::AccountPhotoRefresh { value },
        ResponseKind::Portal => Reply::AccountPortal { value },
        ResponseKind::Purchase => Reply::AccountPurchase { value },
        ResponseKind::PurchaseStop => Reply::AccountPurchaseStop { value },
        ResponseKind::DeviceReset => Reply::AccountDeviceReset { value },
        ResponseKind::Retry => Reply::AccountRetry { value },
        ResponseKind::Back => Reply::AccountBack { value },
        ResponseKind::Choose => Reply::AccountChoose { value },
    }
}
impl Session {
    pub(super) fn account_view(&self) -> AccountView {
        self.account.view(
            &self.current.access,
            Instant::now(),
            vantare_ipc::control::wall_ms().unwrap_or_default(),
        )
    }
    fn account_enqueue(
        &mut self,
        id: u32,
        operation: Operation,
        kind: ResponseKind,
        command: Command,
    ) -> Result<(), HostError> {
        self.account.can_start(operation)?;
        let observation = crate::account::RequestObservation::from(&command);
        self.request_remote(id, RemoteKind::Account(operation, kind), command)?;
        self.account.accepted_observation(operation, observation);
        if matches!(operation, Operation::Begin | Operation::Logout) {
            self.pilot = None;
        }
        Ok(())
    }
    fn account_request(&mut self, id: u32, request: &Request) -> Result<Option<Reply>, HostError> {
        let now = Instant::now();
        let (operation, kind) = match request {
            Request::AccountGet {} => {
                return Ok(Some(reply(ResponseKind::Get, self.account_view())));
            }
            Request::AccountChoose {} => {
                self.account.choose()?;
                return Ok(Some(reply(ResponseKind::Choose, self.account_view())));
            }
            Request::AccountBack {} => {
                self.account.back(&self.current.access)?;
                return Ok(Some(reply(ResponseKind::Back, self.account_view())));
            }
            Request::AccountPurchaseStop {} => {
                self.account
                    .stop_purchase("Espera detenida. Puedes comprobar el acceso manualmente.");
                return Ok(Some(reply(ResponseKind::PurchaseStop, self.account_view())));
            }
            Request::AccountPortal {
                page: crate::account::PortalPage::Profile,
            } => {
                self.account.can_start(Operation::Profile)?;
                self.account.reserve_browser(now, false)?;
                crate::account::platform::open_portal()?;
                return Ok(Some(reply(ResponseKind::Portal, self.account_view())));
            }
            Request::AccountEmail {
                action: EmailIntent::Open { mode },
            } => {
                self.account.open_email(*mode, now)?;
                return Ok(Some(reply(ResponseKind::Email, self.account_view())));
            }
            Request::AccountEmail {
                action: EmailIntent::Cancel {},
            } => {
                if self.account.logging_out() {
                    return Ok(Some(reply(ResponseKind::Email, self.account_view())));
                }
                self.account_enqueue(
                    id,
                    Operation::Cancel,
                    ResponseKind::Email,
                    Command::AccountCancel,
                )?;
                self.account.hide_email();
                return Ok(None);
            }
            Request::AccountEmail { action } => {
                let command = self.account.email_command(action, now)?;
                self.account_enqueue(id, Operation::Email, ResponseKind::Email, command)?;
                return Ok(None);
            }
            Request::AccountPurchase { product } => {
                self.account.can_start(Operation::Purchase)?;
                self.account.reserve_browser(now, true)?;
                let product = match product {
                    crate::account::Product::ProMonthly => {
                        vantare_ipc::services_protocol::BillingProduct::ProMonthly
                    }
                    crate::account::Product::ProAnnual => {
                        vantare_ipc::services_protocol::BillingProduct::ProAnnual
                    }
                    crate::account::Product::Founders => {
                        vantare_ipc::services_protocol::BillingProduct::Founders
                    }
                };
                self.account_enqueue(
                    id,
                    Operation::Purchase,
                    ResponseKind::Purchase,
                    Command::Purchase { product },
                )?;
                return Ok(None);
            }
            Request::AccountBegin {} => (Operation::Begin, ResponseKind::Begin),
            Request::AccountCancel {} if self.account.logging_out() => {
                return Ok(Some(reply(ResponseKind::Cancel, self.account_view())));
            }
            Request::AccountCancel {} => (Operation::Cancel, ResponseKind::Cancel),
            Request::AccountCopyLink {} => (Operation::Copy, ResponseKind::CopyLink),
            Request::AccountLogout {} => (Operation::Logout, ResponseKind::Logout),
            Request::AccountCheck {} => (
                if self.account.signed_in() {
                    Operation::Check
                } else {
                    Operation::Status
                },
                ResponseKind::Check,
            ),
            Request::AccountPhotoRefresh {} => (Operation::Profile, ResponseKind::PhotoRefresh),
            Request::AccountDeviceReset {} => (Operation::Reset, ResponseKind::DeviceReset),
            Request::AccountRetry {} => (self.account.retry_operation(), ResponseKind::Retry),
            _ => return Err(HostError::Unsupported),
        };
        self.account_enqueue(
            id,
            operation,
            kind,
            crate::account::State::command(operation),
        )?;
        Ok(None)
    }
}
pub(super) fn dispatch(
    session: &mut Session,
    pipe: &mut Pipe,
    id: u32,
    request: &Request,
) -> io::Result<()> {
    match request {
        Request::AccountGet { .. }
        | Request::AccountBegin { .. }
        | Request::AccountCancel { .. }
        | Request::AccountCopyLink { .. }
        | Request::AccountEmail { .. }
        | Request::AccountLogout { .. }
        | Request::AccountCheck { .. }
        | Request::AccountPhotoRefresh { .. }
        | Request::AccountPortal { .. }
        | Request::AccountPurchase { .. }
        | Request::AccountPurchaseStop { .. }
        | Request::AccountDeviceReset { .. }
        | Request::AccountRetry { .. }
        | Request::AccountBack { .. }
        | Request::AccountChoose { .. } => match session.account_request(id, request) {
            Ok(None) => Ok(()),
            Ok(Some(value)) => session.respond(
                pipe,
                id,
                Ok(value),
                crate::diagnostics::DiagnosticSection::Services,
            ),
            Err(error) => session.respond(
                pipe,
                id,
                Err(error),
                crate::diagnostics::DiagnosticSection::Services,
            ),
        },
        _ => Err(io::ErrorKind::InvalidInput.into()),
    }
}
pub(super) fn complete(
    session: &mut Session,
    remote: Option<(u32, RemoteKind)>,
    id: u32,
    result: Result<CoreReply, HostError>,
) -> Result<Reply, HostError> {
    let (operation, kind, background) = match remote {
        Some((expected, RemoteKind::Account(operation, kind))) if expected == id => {
            (operation, kind, false)
        }
        Some((expected, RemoteKind::AccountBackground(operation))) if expected == id => {
            (operation, ResponseKind::Get, true)
        }
        _ => return Err(HostError::Denied),
    };
    let now = Instant::now();
    let value = match result {
        Ok(value) => value,
        Err(error) => {
            session.account.failed(operation, &error, background, now);
            return Err(error);
        }
    };
    session
        .account
        .complete(operation, &value, background, now)?;
    // Late manual links are never copied after cancel/logout or when no longer available.
    if let CoreReply::AccountLink { url } = &value {
        if !session.account.can_copy() {
            return Err(HostError::Denied);
        }
        crate::account::clipboard::copy(&url.0)?;
        session.account.copied(true);
    }
    if let CoreReply::Checkout { url, .. } = &value {
        crate::account::platform::open_checkout(url)?;
        session.account.checkout_opened(now);
    }
    Ok(reply(kind, session.account_view()))
}
pub(super) fn subscribe(session: &mut Session, pipe: &mut Pipe, _topic: Topic) -> io::Result<()> {
    let value = session.account_view();
    session.last_account = Some(value.clone());
    frame::write(
        pipe,
        &HostToUi::Event {
            event: Event::Account { value },
        },
    )
}
