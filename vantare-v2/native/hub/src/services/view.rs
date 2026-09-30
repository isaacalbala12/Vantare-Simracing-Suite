//! UI sin red ni tokens. Un worker posee el hijo y todo el I/O bloqueante.
use super::{
    client::{Client, REQUEST_POLL, default_binary},
    protocol::{Command, Reply},
};
use crate::orbit;
use gpui::{Context, prelude::*};
use std::sync::{
    Arc, Mutex,
    atomic::{AtomicBool, Ordering},
    mpsc::{self, Receiver, SyncSender},
};
use vantare_ipc::transport::Event;

type Cancellation = Arc<Mutex<Option<Arc<Event>>>>;

#[path = "access.rs"]
mod access;

enum Area {
    Account,
    Licenses,
    Roadmap,
    Report,
}

#[derive(Default)]
struct AccountState {
    pending: bool,
    signed_in: bool,
    cancel_login: bool,
}

pub struct Remote {
    pipe: String,
    send: Option<SyncSender<Command>>,
    receive: Option<Receiver<Reply>>,
    stop: Arc<AtomicBool>,
    cancellation: Cancellation,
    busy: bool,
    account: AccountState,
    access: access::State,
    message: String,
    active: Area,
    report_revision: Option<u64>,
    pub(crate) editor: crate::testing::Editor,
    publication: Option<super::protocol::roadmap_document::Publication>,
    roadmap_message: String,
    stale: bool,
}

impl Remote {
    pub fn new(pipe: String, cx: &mut Context<Self>) -> Self {
        cx.on_app_quit(|this, _| {
            this.cancel();
            async {}
        })
        .detach();
        let mut remote = Self {
            pipe,
            send: None,
            receive: None,
            stop: Arc::new(AtomicBool::new(false)),
            cancellation: Arc::new(Mutex::new(None)),
            busy: false,
            account: AccountState::default(),
            access: access::State::from_build(),
            message: "servicio no configurado".into(),
            active: Area::Account,
            report_revision: None,
            editor: crate::testing::Editor::new(crate::testing::empty_fields(), cx),
            publication: None,
            roadmap_message: "No hay una publicación válida guardada".into(),
            stale: true,
        };
        remote.request(Command::Status, cx);
        remote
    }

    pub fn cancel(&mut self) {
        self.stop.store(true, Ordering::Release);
        if let Ok(cancellation) = self.cancellation.lock()
            && let Some(event) = &*cancellation
        {
            event.set();
        }
        self.send = None;
    }

    fn start(&mut self) {
        if self.send.is_some() {
            return;
        }
        let (send, commands) = mpsc::sync_channel(2);
        let (responses, receive) = mpsc::sync_channel(2);
        let pipe = self.pipe.clone();
        let stop = Arc::clone(&self.stop);
        let cancellation = Arc::clone(&self.cancellation);
        std::thread::spawn(move || {
            let mut client = None;
            while !stop.load(Ordering::Acquire) {
                let command = match commands.recv_timeout(REQUEST_POLL) {
                    Ok(command) => command,
                    Err(mpsc::RecvTimeoutError::Timeout) => continue,
                    Err(mpsc::RecvTimeoutError::Disconnected) => break,
                };
                let result = (|| {
                    if client
                        .as_mut()
                        .is_some_and(|client: &mut Client| !client.is_running())
                    {
                        client = None;
                    }
                    if client.is_none() {
                        let started = Client::start(&default_binary()?, &pipe)?;
                        *cancellation.lock().map_err(|_| "servicios cancelado")? =
                            Some(started.cancellation());
                        if stop.load(Ordering::Acquire) {
                            return Err("servicios cancelado");
                        }
                        client = Some(started);
                    }
                    client
                        .as_mut()
                        .ok_or("servicios desconectado")?
                        .request(command)
                })();
                let reply = match result {
                    Ok(reply) => reply,
                    Err(message) => {
                        client = None;
                        Reply::Error {
                            message: message.into(),
                        }
                    }
                };
                if responses.try_send(reply).is_err() {
                    break;
                }
            }
        });
        self.send = Some(send);
        self.receive = Some(receive);
    }

    fn dispatch(&mut self, command: Command) -> bool {
        self.active = match command {
            Command::RoadmapCached | Command::RoadmapRefresh => Area::Roadmap,
            Command::LicenseStatus | Command::LicenseRenew | Command::DeviceReset => Area::Licenses,
            Command::DraftLoad
            | Command::DraftSave { .. }
            | Command::DraftDiscard
            | Command::ReportPrepare
            | Command::ReportRetryPrepare
            | Command::ReportSend { .. } => Area::Report,
            _ => Area::Account,
        };
        self.report_revision = if matches!(self.active, Area::Report) {
            Some(self.editor.revision)
        } else {
            None
        };
        self.start();
        if self
            .send
            .as_ref()
            .is_some_and(|send| send.try_send(command).is_ok())
        {
            self.busy = true;
            true
        } else {
            self.message = "servicios ocupado".into();
            self.access.observe(
                &Reply::Error {
                    message: self.message.clone(),
                },
                matches!(self.active, Area::Account),
            );
            false
        }
    }

    pub fn request(&mut self, command: Command, cx: &mut Context<Self>) {
        if self.busy
            && (self.account.pending || self.access.login_requested)
            && matches!(command, Command::Logout)
        {
            self.account.cancel_login = true;
            cx.notify();
            return;
        }
        if self.busy || self.stop.load(Ordering::Acquire) || !self.dispatch(command) {
            cx.notify();
            return;
        }
        cx.notify();
        cx.spawn(async move |this, cx| {
            loop {
                let keep = this
                    .update(cx, |this, cx| {
                        let reply = match this.receive.as_ref().map(Receiver::try_recv) {
                            Some(Ok(reply)) => Some(reply),
                            Some(Err(mpsc::TryRecvError::Disconnected)) => Some(Reply::Error {
                                message: "servicios desconectado".into(),
                            }),
                            _ => None,
                        };
                        if let Some(reply) = reply {
                            let check_session = matches!(reply, Reply::Status { account_configured: true, .. });
                            this.access.observe(&reply, matches!(this.active, Area::Account));
                            this.busy = false;
                            this.account.pending = false;
                            match reply {
                                Reply::Status { message, .. } | Reply::Error { message } => {
                                    if matches!(this.active,Area::Roadmap) {
                                        this.roadmap_message = message;
                                        this.stale = true;
                                    } else if matches!(this.active,Area::Report) {
                                        this.editor.message=message;
                                        this.editor.preview=None;
                                    } else {
                                        this.message = message;
                                    }
                                }
                                Reply::Roadmap {
                                    publication,
                                    stale,
                                    message,
                                    ..
                                } => {
                                    this.publication = publication;
                                    this.stale = stale;
                                    this.roadmap_message = message;
                                }
                                Reply::Account {
                                    signed_in,
                                    pending,
                                    message,
                                    ..
                                } => {
                                    this.account.signed_in = signed_in;
                                    this.account.pending = pending;
                                    this.message = message;
                                }
                                Reply::License { policy, message } => {
                                    this.message = format!("{message} · Overlays avanzados: {} · Engineer: {}", if policy.current() && policy.overlays_advanced { "sí" } else { "no" }, if policy.current() && policy.engineer { "sí" } else { "no" });
                                }
                                Reply::Closed => this.message = "Servicios cerrado".into(),
                                Reply::Draft { draft,message }=>{
                                    if this.report_revision==Some(this.editor.revision) {
                                        this.editor=crate::testing::Editor::new(draft.map_or_else(crate::testing::empty_fields,|draft|draft.fields),cx);
                                        this.editor.message=message;
                                    } else { this.editor.message="Texto cambiado durante la operación; guarde el nuevo borrador".into(); }
                                },
                                Reply::ReportPreview { preview }=>{
                                    if this.report_revision==Some(this.editor.revision) { this.editor.preview=Some(preview); this.editor.message="Revise cuenta, canal y contenido; el envío exige su consentimiento".into(); }
                                    else { this.editor.message="Texto cambiado; vuelva a revisar el envío".into(); }
                                },
                                Reply::ReportReceipt { receipt,cleanup_pending }=>{
                                    let changed=this.report_revision!=Some(this.editor.revision);
                                    if !changed && !cleanup_pending { this.editor=crate::testing::Editor::new(crate::testing::empty_fields(),cx); }
                                    this.editor.preview=None;
                                    this.editor.message=format!("Recibo guardado: {} · {}{}",receipt.report_id,receipt.created_at,if cleanup_pending { " · borrador pendiente de limpiar" } else { "" });
                                },
                            }
                            if let Some(command) = access::follow_up(this.account.pending, &mut this.account.cancel_login, check_session) {
                                this.access.login_requested = matches!(command, Command::Logout) || this.access.login_requested;
                                this.dispatch(command);
                            }
                            cx.notify();
                        }
                        this.busy && !this.stop.load(Ordering::Acquire)
                    })
                    .unwrap_or(false);
                if !keep {
                    break;
                }
                cx.background_executor().timer(REQUEST_POLL).await;
            }
        })
        .detach();
    }

    pub fn account(&self, cx: &mut Context<Self>) -> gpui::Div {
        orbit::card("Cuenta Clerk").child(
            orbit::card_body()
                .child(orbit::callout(self.message.clone()))
                .child(orbit::setting_row(
                    "Sesión",
                    if self.account.signed_in {
                        "Conectada en este dispositivo"
                    } else {
                        "Inicie sesión en su navegador"
                    },
                    orbit::button("services-login", "Iniciar sesión").on_click(
                        cx.listener(|this, _, _, cx| this.request(Command::AccountBegin, cx)),
                    ),
                ))
                .child(
                    orbit::button("services-refresh", "Renovar sesión").on_click(
                        cx.listener(|this, _, _, cx| this.request(Command::AccountRenew, cx)),
                    ),
                )
                .child(
                    orbit::button("services-logout", "Cerrar sesión")
                        .on_click(cx.listener(|this, _, _, cx| this.request(Command::Logout, cx))),
                )
                .child(orbit::text(
                    if self.busy {
                        "Esperando respuesta…"
                    } else {
                        "La aplicación conserva la sesión protegida en este dispositivo."
                    },
                    12.0,
                    400,
                    orbit::INK_3,
                )),
        )
    }

    pub fn report_action(&mut self, command: Command, cx: &mut Context<Self>) {
        if self.editor.dirty && matches!(command, Command::ReportPrepare) {
            self.editor.preview = None;
            self.editor.message = "Guarde los cambios antes de revisar el envío".into();
            cx.notify();
            return;
        }
        self.request(command, cx);
    }

    pub fn testing(&self, cx: &mut Context<Self>) -> gpui::Div {
        self.editor.render(cx)
    }

    pub fn roadmap(&self, cx: &mut Context<Self>) -> gpui::Div {
        let mut body = orbit::card_body()
            .child(orbit::callout(self.roadmap_message.clone()))
            .child(
                orbit::button("services-roadmap-cache", "Ver publicación guardada").on_click(
                    cx.listener(|this, _, _, cx| this.request(Command::RoadmapCached, cx)),
                ),
            )
            .child(
                orbit::button("services-roadmap-refresh", "Actualizar roadmap").on_click(
                    cx.listener(|this, _, _, cx| this.request(Command::RoadmapRefresh, cx)),
                ),
            );
        if let Some(publication) = &self.publication {
            body = body.child(orbit::text(
                format!(
                    "Publicada: {}{}",
                    publication.published_at,
                    if self.stale { " · guardada" } else { "" }
                ),
                12.0,
                400,
                orbit::INK_3,
            ));
            if publication.document.items.is_empty() {
                body = body.child(orbit::text(
                    "Esta publicación no contiene entradas",
                    13.5,
                    400,
                    orbit::INK_2,
                ));
            }
            for section in ["now", "next", "done"] {
                for item in publication
                    .document
                    .items
                    .iter()
                    .filter(|item| item.section == section)
                {
                    body = body
                        .child(orbit::eyebrow(match section {
                            "now" => "Ahora",
                            "next" => "Después",
                            _ => "Completado",
                        }))
                        .child(orbit::text(item.title.es.clone(), 15.0, 700, orbit::INK))
                        .child(orbit::text(item.body.es.clone(), 13.5, 400, orbit::INK_2));
                }
            }
        }
        orbit::card("Roadmap público").child(body)
    }

    pub fn licenses(&self, cx: &mut Context<Self>) -> gpui::Div {
        orbit::card("Licencias y dispositivos").child(orbit::card_body()
            .child(orbit::callout(self.message.clone()))
            .child(orbit::text("El núcleo determina los derechos y mantiene la hora de margen si la licencia caduca durante el juego.",13.5,400,orbit::INK_2))
            .child(orbit::button("services-policy","Consultar derechos").on_click(cx.listener(|this,_,_,cx| this.request(Command::LicenseStatus,cx))))
            .child(orbit::button("services-license","Renovar licencia").on_click(cx.listener(|this,_,_,cx| this.request(Command::LicenseRenew,cx))))
            .child(orbit::text("La credencial local y el reset de dispositivo estarán disponibles al conectar el puente y la autoridad del núcleo.",12.0,400,orbit::INK_3)))
    }
}

impl Drop for Remote {
    fn drop(&mut self) {
        self.cancel();
    }
}
