//! UI sin red ni tokens. Un worker posee el hijo y todo el I/O bloqueante.
use super::{
    client::{Client, REQUEST_POLL, default_binary},
    protocol::{Command, Reply},
};
use crate::orbit;
use gpui::{Context, prelude::*};
use std::path::{Path, PathBuf};
use std::sync::{
    Arc, Mutex,
    atomic::{AtomicBool, Ordering},
    mpsc::{self, Receiver, SyncSender},
};
use vantare_ipc::transport::Event;

type Cancellation = Arc<Mutex<Option<Arc<Event>>>>;

#[derive(Default)]
struct AccountState {
    pending: bool,
    signed_in: bool,
    cancel_login: bool,
}

pub struct Remote {
    root: PathBuf,
    send: Option<SyncSender<Command>>,
    receive: Option<Receiver<Reply>>,
    stop: Arc<AtomicBool>,
    cancellation: Cancellation,
    busy: bool,
    account: AccountState,
    message: String,
    roadmap_active: bool,
    publication: Option<super::protocol::roadmap_document::Publication>,
    roadmap_message: String,
    stale: bool,
}

impl Remote {
    pub fn new(root: &Path, cx: &mut Context<Self>) -> Self {
        cx.on_app_quit(|this, _| {
            this.cancel();
            async {}
        })
        .detach();
        Self {
            root: root.join("services"),
            send: None,
            receive: None,
            stop: Arc::new(AtomicBool::new(false)),
            cancellation: Arc::new(Mutex::new(None)),
            busy: false,
            account: AccountState::default(),
            message: "servicio no configurado".into(),
            roadmap_active: false,
            publication: None,
            roadmap_message: "No hay una publicación válida guardada".into(),
            stale: true,
        }
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
        let root = self.root.clone();
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
                        let started = Client::start_in(&default_binary()?, Some(&root))?;
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
        self.roadmap_active = matches!(command, Command::RoadmapCached | Command::RoadmapRefresh);
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
            false
        }
    }

    pub fn request(&mut self, command: Command, cx: &mut Context<Self>) {
        if self.busy && self.account.pending && matches!(command, Command::Logout) {
            self.account.cancel_login = true;
            return;
        }
        if self.busy || self.stop.load(Ordering::Acquire) || !self.dispatch(command) {
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
                            this.busy = false;
                            this.account.pending = false;
                            match reply {
                                Reply::Status { message, .. } | Reply::Error { message } => {
                                    if this.roadmap_active {
                                        this.roadmap_message = message;
                                        this.stale = true;
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
                                Reply::Closed => this.message = "Servicios cerrado".into(),
                            }
                            if this.account.pending {
                                let command = if this.account.cancel_login {
                                    this.account.cancel_login = false;
                                    Command::Logout
                                } else {
                                    Command::AccountPoll
                                };
                                this.dispatch(command);
                                cx.notify();
                            } else {
                                cx.notify();
                            }
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
            .child(orbit::button("services-license","Renovar licencia").on_click(cx.listener(|this,_,_,cx| this.request(Command::LicenseRenew,cx))))
            .child(orbit::text("La credencial local y el reset de dispositivo estarán disponibles al conectar el puente y la autoridad del núcleo.",12.0,400,orbit::INK_3)))
    }
}

impl Drop for Remote {
    fn drop(&mut self) {
        self.cancel();
    }
}
