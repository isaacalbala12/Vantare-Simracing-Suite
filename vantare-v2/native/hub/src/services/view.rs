//! UI sin red ni tokens. Un worker posee el hijo y todo el I/O bloqueante.
use super::{
    client::{Client, REQUEST_POLL, default_binary},
    protocol::{Command, Reply},
};
use crate::orbit;
use gpui::{Context, div, linear_color_stop, linear_gradient, prelude::*, px, rgb, rgba};
use std::sync::{
    Arc, Mutex,
    atomic::{AtomicBool, Ordering},
    mpsc::{self, Receiver, SyncSender},
};
use vantare_ipc::transport::Event;

type Cancellation = Arc<Mutex<Option<Arc<Event>>>>;

fn account_surface(title: &str, meta: &str, body: gpui::Div) -> gpui::Div {
    div()
        .flex()
        .flex_col()
        .min_w_0()
        .overflow_hidden()
        .rounded(px(orbit::RADIUS))
        .border_1()
        .border_color(rgba(orbit::LINE))
        .bg(rgb(orbit::SURFACE_1))
        .child(
            div()
                .min_h(px(60.0))
                .px(px(20.0))
                .py(px(13.0))
                .flex()
                .items_center()
                .gap(px(12.0))
                .border_b_1()
                .border_color(rgba(0xffff_ff0d))
                .child(orbit::text(title, 15.0, 700, orbit::INK))
                .child(div().flex_1())
                .child(orbit::text(meta, 12.0, 500, orbit::INK_3)),
        )
        .child(body)
}

fn account_body() -> gpui::Div {
    div().flex().flex_col().px(px(21.0)).py(px(21.0))
}

fn account_value(label: &str, value: &str, active: bool) -> gpui::Div {
    div()
        .min_h(px(42.0))
        .flex()
        .items_center()
        .gap(px(10.0))
        .border_b_1()
        .border_color(rgba(orbit::LINE_ROW))
        .child(
            div()
                .w(px(150.0))
                .flex_none()
                .child(orbit::text(label, 12.5, 500, orbit::INK_3)),
        )
        .child(
            div()
                .flex()
                .min_w_0()
                .items_center()
                .gap(px(7.0))
                .child(div().size(px(6.0)).rounded_full().bg(rgb(if active {
                    orbit::GREEN
                } else {
                    orbit::INK_MUTED
                })))
                .child(orbit::text(value, 12.5, 500, orbit::INK_2)),
        )
}

fn account_button(id: &'static str, label: &str) -> gpui::Stateful<gpui::Div> {
    orbit::button(id, label)
        .h(px(30.0))
        .px(px(12.0))
        .rounded(px(10.0))
}

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

    fn account_identity_actions(&self, cx: &mut Context<Self>) -> gpui::Div {
        let signed_in = self.account.signed_in;
        let can_start = self.requires_access();
        div()
            .flex()
            .flex_none()
            .flex_col()
            .gap(px(6.0))
            .child(
                account_button(
                    "services-account-check",
                    if self.busy {
                        "Comprobando…"
                    } else {
                        "Comprobar acceso"
                    },
                )
                .tab_stop(!self.busy)
                .when(self.busy, |button| button.opacity(orbit::DISABLED))
                .on_click(cx.listener(|this, _, _, cx| {
                    if !this.busy {
                        this.request(Command::LicenseStatus, cx);
                    }
                })),
            )
            .child(if signed_in {
                account_button("services-sign-out", "Cerrar sesión")
                    .tab_stop(!self.busy)
                    .when(self.busy, |button| button.opacity(orbit::DISABLED))
                    .on_click(cx.listener(|this, _, _, cx| {
                        if !this.busy {
                            this.request(Command::Logout, cx);
                        }
                    }))
            } else {
                account_button(
                    "services-login",
                    if self.account.pending {
                        "Esperando…"
                    } else {
                        "Iniciar sesión"
                    },
                )
                .tab_stop(can_start && !self.busy)
                .when(!can_start || self.busy, |button| {
                    button
                        .opacity(orbit::DISABLED)
                        .aria_description("El servicio de cuenta no está configurado")
                })
                .on_click(cx.listener(|this, _, _, cx| {
                    if this.requires_access() && !this.busy {
                        this.request(Command::AccountBegin, cx);
                    }
                }))
            })
    }
    fn account_identity(&self, cx: &mut Context<Self>) -> gpui::Div {
        let signed_in = self.account.signed_in;
        let identity_actions = self.account_identity_actions(cx);
        div()
            .flex_1()
            .flex_basis(gpui::relative(1.3 / 2.3))
            .min_w_0()
            .min_h(px(144.0))
            .p(px(20.0))
            .flex()
            .items_center()
            .gap(px(16.0))
            .rounded(px(orbit::RADIUS))
            .border_1()
            .border_color(rgba(orbit::LINE))
            .bg(rgb(orbit::SURFACE_1))
            .child(
                div()
                    .size(px(64.0))
                    .flex_none()
                    .flex()
                    .items_center()
                    .justify_center()
                    .rounded(px(18.0))
                    .bg(linear_gradient(
                        160.0,
                        linear_color_stop(rgb(orbit::SURFACE_3), 0.0),
                        linear_color_stop(rgb(orbit::SURFACE_1), 1.0),
                    ))
                    .child(orbit::text("·", 26.0, 750, orbit::INK)),
            )
            .child(
                div()
                    .flex_1()
                    .min_w_0()
                    .flex()
                    .flex_col()
                    .gap(px(2.0))
                    .child(orbit::text(
                        if signed_in {
                            "Cuenta conectada"
                        } else {
                            "Sin sesión"
                        },
                        18.0,
                        700,
                        orbit::INK,
                    ))
                    .child(orbit::text(
                        "Sin correo en la credencial local",
                        12.5,
                        400,
                        orbit::INK_3,
                    ))
                    .child(
                        div()
                            .mt(px(8.0))
                            .flex()
                            .flex_wrap()
                            .gap(px(6.0))
                            .child(orbit::chip("Plan no disponible", orbit::Tone::Neutral))
                            .child(orbit::chip("Canal no disponible", orbit::Tone::Neutral))
                            .child(orbit::chip(
                                "Dispositivo sin verificar",
                                orbit::Tone::Neutral,
                            )),
                    ),
            )
            .child(identity_actions)
    }
    fn account_plan() -> gpui::Div {
        let module_names = [
            ("i-studio", "Overlays Studio", false),
            ("i-launcher", "Launcher", false),
            ("i-carreras", "Carreras y recordatorios", false),
            ("i-estrategia", "Estrategia", false),
            ("i-ingeniero", "Ingeniero", false),
            ("i-telemetria", "Telemetría", true),
        ];
        let mut modules = div()
            .relative()
            .mt(px(14.0))
            .flex()
            .flex_wrap()
            .gap(px(6.0));
        for (icon, label, soon) in module_names {
            modules = modules.child(
                div()
                    .w(px(184.0))
                    .flex()
                    .items_center()
                    .gap(px(8.0))
                    .opacity(orbit::DISABLED)
                    .child(orbit::icon(icon, 15.0, orbit::INK_3))
                    .child(orbit::text(label, 12.0, 500, orbit::INK_2))
                    .when(soon, |module| {
                        module.child(orbit::text("· próximamente", 10.5, 500, orbit::INK_3))
                    }),
            );
        }
        div()
            .relative()
            .flex_1()
            .flex_basis(gpui::relative(1.0 / 2.3))
            .min_w_0()
            .min_h(px(144.0))
            .overflow_hidden()
            .p(px(20.0))
            .rounded(px(orbit::RADIUS))
            .border_1()
            .border_color(rgba(0xf047_5533))
            .bg(linear_gradient(
                135.0,
                linear_color_stop(rgba(0xd52f_4924), 0.0),
                linear_color_stop(rgba(0xff9b_570a), 1.0),
            ))
            .child(orbit::eyebrow("Plan activo"))
            .child(orbit::text("No disponible", 26.0, 750, orbit::INK).mt(px(4.0)))
            .child(orbit::text("— de 6 módulos incluidos", 12.0, 400, orbit::INK_2).mt(px(3.0)))
            .child(modules)
    }
    fn account_session(&self) -> gpui::Div {
        let signed_in = self.account.signed_in;
        account_surface(
            "Sesión",
            "credencial local",
            account_body()
                .child(account_value(
                    "Estado",
                    if signed_in {
                        "Conectada"
                    } else {
                        "Sin sesión"
                    },
                    signed_in,
                ))
                .child(account_value(
                    "Último acceso",
                    "La credencial no lo declara",
                    false,
                ))
                .child(account_value(
                    "Caducidad offline",
                    "La credencial no lo declara",
                    false,
                ))
                .child(account_value("Canales disponibles", "—", false).border_b_0()),
        )
        .flex_1()
    }
    fn account_devices(&self, cx: &mut Context<Self>) -> gpui::Div {
        let device = div()
            .flex()
            .items_center()
            .gap(px(12.0))
            .child(
                div()
                    .size(px(34.0))
                    .flex_none()
                    .flex()
                    .items_center()
                    .justify_center()
                    .rounded(px(9.0))
                    .bg(rgb(orbit::SURFACE_2))
                    .border_1()
                    .border_color(rgba(orbit::LINE))
                    .child(orbit::text("PC", 10.5, 700, orbit::INK_3)),
            )
            .child(
                div()
                    .flex_1()
                    .min_w_0()
                    .flex()
                    .flex_col()
                    .gap(px(3.0))
                    .child(orbit::text("Este dispositivo", 13.0, 650, orbit::INK))
                    .child(orbit::text(
                        "estado no disponible en esta sesión",
                        12.0,
                        400,
                        orbit::INK_3,
                    )),
            )
            .child(div().size(px(6.0)).rounded_full().bg(rgb(orbit::INK_MUTED)));
        account_surface(
            "Dispositivos",
            "—",
            account_body()
                .gap(px(14.0))
                .child(device)
                .child(orbit::callout(
                    "El servicio de licencias solo declara si este equipo está verificado; no publica la lista de dispositivos, así que aquí no se inventa ninguno. «Restablecer dispositivo» libera el equipo activo (1 vez cada 24 h).",
                ))
                .child(
                    account_button("services-device-reset", "Restablecer dispositivo")
                        .tab_stop(!self.busy)
                        .when(self.busy, |button| button.opacity(orbit::DISABLED))
                        .on_click(cx.listener(|this, _, _, cx| {
                            if !this.busy {
                                this.request(Command::DeviceReset, cx);
                            }
                        })),
                ),
        )
        .flex_1()
    }
    fn account_page(&self, cx: &mut Context<Self>) -> gpui::Div {
        let hero = div()
            .flex()
            .w_full()
            .gap(px(21.0))
            .items_stretch()
            .child(self.account_identity(cx))
            .child(Self::account_plan());
        let details = div()
            .flex()
            .w_full()
            .gap(px(21.0))
            .items_start()
            .child(self.account_session())
            .child(self.account_devices(cx));
        div()
            .flex()
            .flex_col()
            .w_full()
            .min_w_0()
            .gap(px(21.0))
            .child(hero)
            .child(details)
            .child(orbit::callout(self.message.clone()))
    }

    pub fn account(&self, cx: &mut Context<Self>) -> gpui::Div {
        self.account_page(cx)
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
        self.account_page(cx)
    }
}

impl Drop for Remote {
    fn drop(&mut self) {
        self.cancel();
    }
}
