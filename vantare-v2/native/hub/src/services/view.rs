//! UI sin red ni tokens. Un worker cancelable posee la conexión IPC y el I/O bloqueante.
use super::{
    client::{Client, REQUEST_POLL, default_binary},
    protocol::{Command, Reply},
};
use crate::orbit;
use crate::{
    Section,
    shell::navigation::{Access, Plan},
};
use gpui::{Context, div, linear_color_stop, linear_gradient, prelude::*, px, rgb, rgba};
use std::sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
    mpsc::{self, Receiver, SyncSender},
};
use vantare_ipc::transport::Event;

// Solo presentación del banco: no modifica credenciales, permisos ni IPC.
fn account_demo() -> Option<&'static crate::demo::DemoData> {
    #[cfg(feature = "parity-capture")]
    {
        static DEMO: std::sync::OnceLock<Option<crate::demo::DemoData>> =
            std::sync::OnceLock::new();
        DEMO.get_or_init(|| {
            let args: Vec<_> = std::env::args().collect();
            if args.iter().any(|arg| arg == "--capture") && args.iter().any(|arg| arg == "--demo") {
                crate::demo::DemoData::load().ok()
            } else {
                None
            }
        })
        .as_ref()
    }
    #[cfg(not(feature = "parity-capture"))]
    None
}

fn text(
    content: impl Into<gpui::SharedString>,
    size: f32,
    weight: u16,
    color: u32,
    cx: &gpui::App,
) -> gpui::Div {
    orbit::text(content, size, weight, color, cx).font_weight(orbit::face_weight(weight, cx))
}

fn account_note(content: &str, cx: &gpui::App) -> gpui::Div {
    div()
        .px(px(17.0))
        .py(px(13.0))
        .rounded(px(14.0))
        .border_1()
        .border_color(rgba(crate::orbit::legacy_rgba(0xff9b_5721, cx)))
        .bg(linear_gradient(
            110.0,
            linear_color_stop(rgba(crate::orbit::legacy_rgba(0xff9b_570f, cx)), 0.0),
            linear_color_stop(rgba(crate::orbit::legacy_rgba(0xd52f_4905, cx)), 1.0),
        ))
        .child(text(content, 12.0, 400, orbit::ink_3(cx), cx).line_height(px(18.0)))
}

fn account_surface(title: &str, meta: &str, body: gpui::Div, cx: &gpui::App) -> gpui::Div {
    div()
        .flex()
        .flex_col()
        .min_w_0()
        .overflow_hidden()
        .rounded(px(orbit::RADIUS))
        .border_1()
        .border_color(rgba(orbit::line(cx)))
        .bg(rgba(crate::orbit::legacy_rgba(0x1011_14c9, cx)))
        .child(
            div()
                .min_h(px(60.0))
                .px(px(20.0))
                .py(px(13.0))
                .flex()
                .items_center()
                .gap(px(12.0))
                .border_b_1()
                .border_color(rgba(crate::orbit::legacy_rgba(0xffff_ff0d, cx)))
                .child(text(title, 15.0, 700, orbit::ink(cx), cx).line_height(px(18.0)))
                .child(div().flex_1())
                .child(
                    text(meta, 12.0, 500, orbit::ink_3(cx), cx)
                        .font_family(crate::orbit::mono_family(cx)),
                ),
        )
        .child(body)
}

fn account_body() -> gpui::Div {
    div().flex().flex_col().px(px(21.0)).py(px(21.0))
}

fn account_value(label: &str, value: &str, active: bool, cx: &gpui::App) -> gpui::Div {
    div()
        .min_h(px(42.0))
        .flex()
        .items_center()
        .gap(px(10.0))
        .border_b_1()
        .border_color(rgba(orbit::line_row(cx)))
        .child(
            div()
                .w(px(150.0))
                .flex_none()
                .child(text(label, 12.5, 500, orbit::ink_3(cx), cx)),
        )
        .child(
            div()
                .flex()
                .min_w_0()
                .items_center()
                .gap(px(7.0))
                .when(label == "Estado", |value| {
                    value.child(if orbit::is_mono(cx) {
                        orbit::status_dot(
                            if active {
                                orbit::Tone::Success
                            } else {
                                orbit::Tone::Neutral
                            },
                            6.0,
                            cx,
                        )
                    } else {
                        div().size(px(6.0)).rounded_full().bg(rgb(if active {
                            orbit::green(cx)
                        } else {
                            orbit::ink_muted(cx)
                        }))
                    })
                })
                .child(
                    text(
                        value,
                        12.5,
                        400,
                        crate::orbit::legacy_rgb(0x00d9_d5d5, cx),
                        cx,
                    )
                    .line_height(px(15.0)),
                ),
        )
}

fn account_button(id: &'static str, label: &str, cx: &gpui::App) -> gpui::Stateful<gpui::Div> {
    div()
        .id(id)
        .role(gpui::Role::Button)
        .aria_label(label)
        .flex_none()
        .h(px(34.0))
        .px(px(12.0))
        .rounded(px(10.0))
        .border_1()
        .border_color(rgba(orbit::line(cx)))
        .bg(rgba(crate::orbit::legacy_rgba(0xffff_ff04, cx)))
        .flex()
        .items_center()
        .justify_center()
        .child(text(label, 12.0, 650, orbit::ink_3(cx), cx).line_height(px(18.0)))
}

#[path = "access.rs"]
mod access;

enum Area {
    Account,
    Licenses { renew: bool },
    Roadmap,
    Report,
}

#[derive(Default)]
struct AccountState {
    pending: bool,
    signed_in: bool,
    cancel_login: bool,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Inflight {
    Idle,
    /// Consulta periódica de política: no bloquea ni se muestra.
    Background,
    User,
}
pub struct Remote {
    pipe: String,
    send: Option<SyncSender<Command>>,
    receive: Option<Receiver<Reply>>,
    stop: Arc<AtomicBool>,
    cancellation: Option<Arc<Event>>,
    worker: Option<std::thread::JoinHandle<()>>,
    inflight: Inflight,
    /// Acción del usuario recibida durante la consulta periódica; se envía al acabar.
    queued: Option<Command>,
    account: AccountState,
    access: access::State,
    license_polled_at: Option<std::time::Instant>,
    message: String,
    active: Area,
    report_revision: Option<u64>,
    pub(crate) editor: crate::testing::Editor,
    recovery: Result<crate::testing::recovery::Recovery, String>,
    publication: Option<super::protocol::roadmap_document::Publication>,
    roadmap_message: String,
    roadmap_requested: bool,
    stale: bool,
}

const HUB_CONTENT_MIN_HEIGHT: f32 = 830.0;
const SHELL_HEADER_OVERLAP: f32 = 162.0;

const ACCOUNT_MODULES: [(Section, &str); 6] = [
    (Section::Studio, "Overlays Studio"),
    (Section::Launcher, "Launcher"),
    (Section::Calendar, "Carreras y recordatorios"),
    (Section::Strategy, "Estrategia"),
    (Section::Engineer, "Ingeniero"),
    (Section::Analysis, "Telemetría"),
];

fn account_plan_label(plan: Plan) -> &'static str {
    match plan {
        Plan::Overlays => "Overlays",
        Plan::Engineer => "Engineer",
        Plan::Suite => "Overlays + Engineer",
        Plan::Unknown | Plan::Free => "Acceso sin verificar",
    }
}

fn account_module_access(access: Access, demo: bool) -> [bool; 6] {
    std::array::from_fn(|index| {
        !access.blocked
            && matches!(access.plan, Plan::Overlays | Plan::Engineer | Plan::Suite)
            && access.lock(ACCOUNT_MODULES[index].0).is_none()
            // La captura congelada anuncia Telemetría como «próximamente».
            && !(demo && index == 5)
    })
}

impl Remote {
    pub fn new(pipe: String, data: &std::path::Path, cx: &mut Context<Self>) -> Self {
        let recovery = crate::testing::recovery::Recovery::load(data);
        let mut editor = crate::testing::Editor::new(
            recovery.as_ref().map_or_else(
                |_| crate::testing::empty_fields(),
                |store| store.fields.clone(),
            ),
            cx,
        );
        match &recovery {
            Ok(store) => editor.dirty = store.fields != crate::testing::empty_fields(),
            Err(error) => editor.message.clone_from(error),
        }
        cx.on_app_quit(|this, cx| {
            this.cancel();
            let worker = this.worker.take();
            let executor = cx.background_executor().clone();
            async move {
                if let Some(worker) = worker {
                    executor
                        .spawn(async move {
                            if worker.join().is_err() {
                                eprintln!("worker de servicios terminó con error");
                            }
                        })
                        .await;
                }
            }
        })
        .detach();
        let mut remote = Self {
            pipe,
            send: None,
            receive: None,
            stop: Arc::new(AtomicBool::new(false)),
            cancellation: None,
            worker: None,
            inflight: Inflight::Idle,
            queued: None,
            account: AccountState::default(),
            access: access::State::from_build(),
            license_polled_at: None,
            message: "servicio no configurado".into(),
            active: Area::Account,
            report_revision: None,
            editor,
            recovery,
            publication: None,
            roadmap_message: "No hay una publicación válida guardada".into(),
            roadmap_requested: false,
            stale: true,
        };
        remote.request(Command::Status, cx);
        remote
    }

    pub(crate) fn navigation_access(&self) -> crate::shell::navigation::Access {
        vantare_ipc::control::wall_ms().map_or_else(
            |_| crate::shell::navigation::Access::default(),
            |now| self.access.navigation(self.account.signed_in, now),
        )
    }

    /// `LicenseStatus` solo lee el núcleo por IPC. Su política caduca a los 2 s.
    pub(crate) fn refresh_license(&mut self, cx: &mut Context<Self>) {
        if !self.busy()
            && self.account.signed_in
            && self.access.session_known()
            && self
                .license_polled_at
                .is_none_or(|last| last.elapsed() >= std::time::Duration::from_secs(1))
        {
            self.license_polled_at = Some(std::time::Instant::now());
            self.request(Command::LicenseStatus, cx);
            if self.busy() {
                self.inflight = Inflight::Background;
            }
        }
    }

    fn busy(&self) -> bool {
        self.inflight != Inflight::Idle
    }

    /// Ocupado a ojos del usuario: excluye la consulta periódica de política.
    fn working(&self) -> bool {
        self.inflight == Inflight::User
    }

    /// Solo recuperación privada: guardar aquí no confirma el borrador remoto ni el envío.
    pub(crate) fn persist(&mut self, cx: &Context<Self>) -> Result<(), String> {
        let fields = self.editor.fields(cx);
        match &mut self.recovery {
            Ok(store) => store.save(fields),
            Err(error) if self.editor.dirty => Err(error.clone()),
            Err(_) => Ok(()), // Un archivo inválido sin nuevas ediciones se conserva intacto.
        }
    }

    pub fn cancel(&mut self) {
        self.stop.store(true, Ordering::Release);
        if let Some(event) = &self.cancellation {
            event.set();
        }
        self.send = None;
    }

    fn start(&mut self) -> bool {
        if self.send.is_some() {
            return true;
        }
        let Ok(event) = Event::new() else {
            self.message = "IPC no disponible".into();
            return false;
        };
        let cancellation = Arc::new(event);
        // Publicado ANTES del spawn, connect_ready y lectura del saludo.
        self.cancellation = Some(Arc::clone(&cancellation));
        let (send, commands) = mpsc::sync_channel(2);
        let (responses, receive) = mpsc::sync_channel(2);
        let pipe = self.pipe.clone();
        let stop = Arc::clone(&self.stop);
        self.worker = Some(std::thread::spawn(move || {
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
                        let started =
                            Client::start(&default_binary()?, &pipe, Arc::clone(&cancellation))?;
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
        }));
        self.send = Some(send);
        self.receive = Some(receive);
        true
    }

    fn dispatch(&mut self, command: Command) -> bool {
        self.active = match command {
            Command::RoadmapCached | Command::RoadmapRefresh => Area::Roadmap,
            Command::LicenseRenew => Area::Licenses { renew: true },
            Command::LicenseStatus | Command::DeviceReset => Area::Licenses { renew: false },
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
        if !self.start() {
            self.access.observe(
                &Reply::Error {
                    message: self.message.clone(),
                },
                matches!(self.active, Area::Account),
            );
            return false;
        }
        if self
            .send
            .as_ref()
            .is_some_and(|send| send.try_send(command).is_ok())
        {
            self.inflight = Inflight::User;
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
        self.access.requested(&command);
        if self.inflight == Inflight::Background {
            self.queued = Some(command);
            return cx.notify();
        }
        if self.busy() && matches!(command, Command::Logout) {
            self.account.cancel_login = true;
            cx.notify();
            return;
        }
        if self.busy() || self.stop.load(Ordering::Acquire) || !self.dispatch(command) {
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
                            let after_renew = if matches!(this.active, Area::Licenses { renew: true }) {
                                this.access.renewal_acknowledged(&reply)
                            } else { None };
                            this.access.observe(&reply, matches!(this.active, Area::Account));
                            let next = this.access.next_command(&reply, &mut this.account.cancel_login).or(after_renew);
                            let background = this.inflight == Inflight::Background;
                            this.inflight = Inflight::Idle;
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
                                // La consulta periódica no pisa el resultado de una acción del usuario.
                                Reply::License { .. } if background => {}
                                Reply::License { message, .. } => {
                                    this.message = format!("{message} · Acceso: {}", account_plan_label(this.navigation_access().plan));
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
                                Reply::ReportReceipt { receipt,draft_state }=> this.report_receipt(&receipt,draft_state,cx),
                            }
                            if let Some(command) = next.or_else(|| this.queued.take()) {
                                this.access.login_requested = matches!(command, Command::Logout) || this.access.login_requested;
                                this.dispatch(command);
                            }
                            cx.notify();
                        }
                        this.busy() && !this.stop.load(Ordering::Acquire)
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

    fn report_receipt(
        &mut self,
        receipt: &super::protocol::report_document::Receipt,
        draft_state: super::protocol::DraftState,
        cx: &mut Context<Self>,
    ) {
        use super::protocol::DraftState;
        let changed = self.report_revision != Some(self.editor.revision);
        if !changed && draft_state == DraftState::Cleared {
            self.editor = crate::testing::Editor::new(crate::testing::empty_fields(), cx);
        }
        self.editor.preview = None;
        let draft_message = match draft_state {
            DraftState::Cleared => "",
            DraftState::Preserved => " · borrador posterior conservado",
            DraftState::CleanupPending => " · borrador pendiente de limpiar",
        };
        self.editor.message = format!(
            "Recibo guardado: {} · {}{}",
            receipt.report_id, receipt.created_at, draft_message
        );
    }

    fn account_identity_actions(&self, cx: &mut Context<Self>) -> gpui::Div {
        if account_demo().is_some() {
            return div()
                .flex()
                .flex_none()
                .flex_col()
                .gap(px(6.0))
                .child(
                    account_button("services-account-check", "Comprobar acceso", cx)
                        .tab_stop(false),
                )
                .child(
                    account_button("services-sign-out", "Cerrar sesión", cx)
                        .tab_stop(false)
                        .aria_description("Datos de demostración; acciones deshabilitadas"),
                );
        }
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
                    if self.working() {
                        "Comprobando…"
                    } else {
                        "Comprobar acceso"
                    },
                    cx,
                )
                .tab_stop(!self.working())
                .when(self.working(), |button| button.opacity(orbit::DISABLED))
                .on_click(cx.listener(|this, _, _, cx| {
                    if !this.busy() {
                        this.request(Command::LicenseRenew, cx);
                    }
                })),
            )
            .child(if signed_in {
                account_button("services-sign-out", "Cerrar sesión", cx)
                    .tab_stop(!self.working())
                    .when(self.working(), |button| button.opacity(orbit::DISABLED))
                    .on_click(cx.listener(|this, _, _, cx| {
                        if !this.busy() {
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
                    cx,
                )
                .tab_stop(can_start && !self.working())
                .when(!can_start || self.working(), |button| {
                    button
                        .opacity(orbit::DISABLED)
                        .aria_description("El servicio de cuenta no está configurado")
                })
                .on_click(cx.listener(|this, _, _, cx| {
                    if this.requires_access() && !this.busy() {
                        this.request(Command::AccountBegin, cx);
                    }
                }))
            })
    }
    fn account_access(&self) -> Access {
        if account_demo().is_some() {
            // Fixture visual explícita; no alcanza la navegación ni el núcleo.
            Access {
                plan: Plan::Overlays,
                ..Access::default()
            }
        } else {
            self.navigation_access()
        }
    }

    fn account_badges(&self, demo: bool, cx: &gpui::App) -> gpui::Div {
        let plan = self.account_access().plan;
        div()
            .mt(px(8.0))
            .flex()
            .flex_wrap()
            .gap(px(6.0))
            .child(orbit::chip(
                if demo {
                    "● Overlays"
                } else {
                    account_plan_label(plan)
                },
                if plan == Plan::Unknown {
                    orbit::Tone::Neutral
                } else {
                    orbit::Tone::Gold
                },
                cx,
            ))
            .child(orbit::chip(
                if demo {
                    "Stable"
                } else {
                    "Canal no disponible"
                },
                orbit::Tone::Neutral,
                cx,
            ))
            .child(div().w_full().flex().items_start().child(orbit::chip(
                if demo {
                    "Este dispositivo"
                } else {
                    "Dispositivo sin verificar"
                },
                orbit::Tone::Neutral,
                cx,
            )))
    }
    fn account_identity(&self, cx: &mut Context<Self>) -> gpui::Div {
        let demo = account_demo();
        let signed_in = self.account.signed_in;
        let identity_actions = self.account_identity_actions(cx);
        div()
            .flex_1()
            .flex_basis(gpui::relative(1.3 / 2.3))
            .min_w_0()
            .min_h(px(212.0))
            .px(px(22.0))
            .py(px(20.0))
            .flex()
            .items_center()
            .gap(px(16.0))
            .rounded(px(orbit::RADIUS))
            .border_1()
            .border_color(rgba(orbit::line(cx)))
            .bg(rgba(crate::orbit::legacy_rgba(0x1011_14c9, cx)))
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
                        linear_color_stop(rgb(crate::orbit::legacy_rgb(0x002a_2a30, cx)), 0.0),
                        linear_color_stop(rgb(crate::orbit::legacy_rgb(0x0017_171b, cx)), 1.0),
                    ))
                    .child(text(
                        if demo.is_some() { "T" } else { "·" },
                        26.0,
                        750,
                        orbit::ink(cx),
                        cx,
                    )),
            )
            .child(
                div()
                    .flex_1()
                    .min_w_0()
                    .flex()
                    .flex_col()
                    .gap(px(2.0))
                    .child(text(
                        if let Some(demo) = demo {
                            &demo.user.name
                        } else if signed_in {
                            "Cuenta conectada"
                        } else {
                            "Sin sesión"
                        },
                        18.0,
                        700,
                        orbit::ink(cx),
                        cx,
                    ))
                    .child(text(
                        if demo.is_some() {
                            "tes•••@example.com"
                        } else {
                            "Sin correo en la credencial local"
                        },
                        12.5,
                        400,
                        orbit::ink_3(cx),
                        cx,
                    ))
                    .child(self.account_badges(demo.is_some(), cx)),
            )
            .child(identity_actions)
    }
    fn account_modules(included: [bool; 6], demo: bool, cx: &gpui::App) -> gpui::Div {
        let mut modules = div()
            .relative()
            .mt(px(14.0))
            .flex()
            .flex_wrap()
            .gap(px(6.0));
        for ((section, label), included) in ACCOUNT_MODULES.into_iter().zip(included) {
            let soon = demo && section == Section::Analysis;
            modules = modules.child(
                div()
                    .w(px(184.0))
                    .flex_none()
                    .flex()
                    .items_center()
                    .gap(px(8.0))
                    .child(
                        div()
                            .size(px(16.0))
                            .rounded_full()
                            .bg(rgba(if soon {
                                0xff9b_5724
                            } else if included {
                                0x78d6_8b2e
                            } else {
                                0xffff_ff0f
                            }))
                            .when(soon, |dot| {
                                dot.border_1()
                                    .border_color(rgba(crate::orbit::legacy_rgba(0xff9b_5780, cx)))
                            })
                            .when(included, |dot| {
                                dot.flex().items_center().justify_center().child(text(
                                    "✓",
                                    11.0,
                                    700,
                                    orbit::green(cx),
                                    cx,
                                ))
                            }),
                    )
                    .child(
                        text(
                            label,
                            12.5,
                            400,
                            if !included && !soon {
                                orbit::ink_muted(cx)
                            } else {
                                crate::orbit::legacy_rgb(0x00d9_d5d5, cx)
                            },
                            cx,
                        )
                        .line_height(px(15.0)),
                    )
                    .when(soon, |module| {
                        module.child(
                            text("· próximamente", 10.5, 500, orbit::ink_3(cx), cx)
                                .whitespace_nowrap(),
                        )
                    }),
            );
        }
        modules
    }
    fn account_plan(&self, cx: &gpui::App) -> gpui::Div {
        let demo = account_demo().is_some();
        let access = self.account_access();
        let included = account_module_access(access, demo);
        let modules = Self::account_modules(included, demo, cx);
        div()
            .relative()
            .flex_1()
            .flex_basis(gpui::relative(1.0 / 2.3))
            .min_w_0()
            .min_h(px(212.0))
            .overflow_hidden()
            .px(px(22.0))
            .py(px(20.0))
            .rounded(px(orbit::RADIUS))
            .border_1()
            .border_color(rgba(crate::orbit::legacy_rgba(0xf047_5533, cx)))
            .bg(linear_gradient(
                135.0,
                linear_color_stop(rgba(crate::orbit::legacy_rgba(0xd52f_4924, cx)), 0.0),
                linear_color_stop(rgba(crate::orbit::legacy_rgba(0xff9b_570a, cx)), 1.0),
            ))
            .child(
                div()
                    .absolute()
                    .top(px(-70.0))
                    .right(px(-60.0))
                    .size(px(150.0))
                    .rounded_full()
                    .border(px(22.0))
                    .border_color(rgba(crate::orbit::legacy_rgba(0xffff_ff0d, cx))),
            )
            .child(orbit::eyebrow("Plan activo", cx).line_height(px(18.0)))
            .child(
                text(
                    account_plan_label(access.plan),
                    26.0,
                    750,
                    orbit::ink(cx),
                    cx,
                )
                .line_height(px(39.0))
                .mt(px(4.0)),
            )
            .child(
                text(
                    if access.plan == Plan::Unknown {
                        "Módulos sin verificar".into()
                    } else {
                        format!(
                            "{} de 6 módulos incluidos",
                            included.iter().filter(|included| **included).count()
                        )
                    },
                    12.0,
                    400,
                    0x00c9_c4c6,
                    cx,
                )
                .line_height(px(18.0))
                .mt(px(3.0)),
            )
            .child(modules)
    }
    fn account_session(&self, cx: &gpui::App) -> gpui::Div {
        let demo = account_demo().is_some();
        let signed_in = self.account.signed_in;
        account_surface(
            "Sesión",
            "credencial local",
            account_body()
                .px(px(23.0))
                .pt(px(23.0))
                .pb(px(25.0))
                .child(account_value(
                    "Estado",
                    if demo {
                        "Activo"
                    } else if signed_in {
                        "Conectada"
                    } else {
                        "Sin sesión"
                    },
                    signed_in || demo,
                    cx,
                ))
                .child(account_value(
                    "Último acceso",
                    if demo {
                        "30/9/2026, 16:00:32"
                    } else {
                        "La credencial no lo declara"
                    },
                    false,
                    cx,
                ))
                .child(account_value(
                    "Caducidad offline",
                    "La credencial no lo declara",
                    false,
                    cx,
                ))
                .child(
                    account_value(
                        "Canales disponibles",
                        if demo { "Stable" } else { "—" },
                        false,
                        cx,
                    )
                    .border_b_0(),
                ),
            cx,
        )
        .flex_1()
    }
    fn account_devices(&self, cx: &mut Context<Self>) -> gpui::Div {
        let demo = account_demo().is_some();
        let device = div()
            .flex()
            .items_center()
            .gap(px(12.0))
            .w_full()
            .px(px(12.0))
            .py(px(10.0))
            .rounded(px(12.0))
            .border_1()
            .border_color(rgba(if demo { 0x78d6_8b33 } else { 0xffff_ff0d }))
            .bg(rgba(crate::orbit::legacy_rgba(0xffff_ff04, cx)))
            .child(
                div()
                    .size(px(34.0))
                    .flex_none()
                    .flex()
                    .items_center()
                    .justify_center()
                    .rounded(px(9.0))
                    .bg(rgb(orbit::surface_2(cx)))
                    .border_1()
                    .border_color(rgba(orbit::line(cx)))
                    .child(text("PC", 10.5, 700, orbit::ink_3(cx), cx)),
            )
            .child(
                div()
                    .flex_1()
                    .min_w_0()
                    .flex()
                    .flex_col()
                    .gap(px(3.0))
                    .child(text("Este dispositivo", 13.0, 650, orbit::ink(cx), cx))
                    .child(text(
                        if demo {
                            "verificado por el servicio de licencias"
                        } else {
                            "estado no disponible en esta sesión"
                        },
                        11.5,
                        400,
                        orbit::ink_3(cx),
                        cx,
                    )),
            )
            .child(div().size(px(6.0)).rounded_full().bg(rgb(if demo {
                orbit::green(cx)
            } else {
                orbit::ink_muted(cx)
            })));
        account_surface(
            "Dispositivos",
            if demo { "1" } else { "—" },
            account_body()
                .items_start().gap(px(10.0))
                .child(device)
                .child(account_note(
                    "El servicio de licencias solo declara si este equipo está verificado; no publica la lista de dispositivos, así que aquí no se inventa ninguno. «Restablecer dispositivo» libera el equipo activo (1 vez cada 24 h).",
                 cx))
                .child(
                    account_button("services-device-reset", "Restablecer dispositivo", cx)
                        .tab_stop(!self.working() && !demo)
                        .when(self.working(), |button| button.opacity(orbit::DISABLED))
                        .on_click(cx.listener(|this, _, _, cx| {
                            if !this.busy() && account_demo().is_none() {
                                this.request(Command::DeviceReset, cx);
                            }
                        })),
                ),
         cx)
        .flex_1()
    }
    fn account_page(&self, cx: &mut Context<Self>) -> gpui::Div {
        let hero = div()
            .flex()
            .w_full()
            .gap(px(21.0))
            .items_stretch()
            .child(self.account_identity(cx))
            .child(self.account_plan(cx));
        let details = div()
            .flex()
            .w_full()
            .gap(px(21.0))
            .items_start()
            .child(self.account_session(cx))
            .child(self.account_devices(cx));
        div()
            .flex()
            .flex_col()
            .w_full()
            .min_w_0()
            .mt(px(0.0))
            .line_height(gpui::relative(1.5))
            .gap(px(21.0))
            .child(hero)
            .child(details)
            .when(account_demo().is_none(), |page| {
                page.child(orbit::callout(self.message.clone(), cx))
            })
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

    #[allow(clippy::too_many_lines)] // Composición visual; crece al migrar a accesores de tema (#1430).
    pub fn roadmap(&mut self, cx: &mut Context<Self>) -> gpui::Stateful<gpui::Div> {
        if !self.roadmap_requested && !self.busy() {
            self.roadmap_requested = true;
            self.request(Command::RoadmapCached, cx);
        }
        let mut body = div().flex().flex_col().flex_1().min_h_0().gap(px(16.0));
        if let Some(publication) = &self.publication {
            body = body.child(orbit::text(
                format!(
                    "Publicada: {}{}",
                    publication.published_at,
                    if self.stale { " · guardada" } else { "" }
                ),
                12.0,
                400,
                orbit::ink_3(cx),
                cx,
            ));
            if publication.document.items.is_empty() {
                body = body.child(orbit::text(
                    "Esta publicación no contiene entradas",
                    13.5,
                    400,
                    orbit::ink_2(cx),
                    cx,
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
                        .child(orbit::eyebrow(
                            match section {
                                "now" => "Ahora",
                                "next" => "Después",
                                _ => "Completado",
                            },
                            cx,
                        ))
                        .child(orbit::text(
                            item.title.es.clone(),
                            15.0,
                            700,
                            orbit::ink(cx),
                            cx,
                        ))
                        .child(orbit::text(
                            item.body.es.clone(),
                            13.5,
                            400,
                            orbit::ink_2(cx),
                            cx,
                        ));
                }
            }
        } else if self.working() {
            body = body.child(orbit::text(
                "Cargando roadmap...",
                13.5,
                400,
                orbit::ink_3(cx),
                cx,
            ));
        } else {
            body = body.child(orbit::text(
                &self.roadmap_message,
                13.5,
                400,
                orbit::ink_3(cx),
                cx,
            ));
        }
        div()
            .id("roadmap")
            .w_full()
            .min_h(px(HUB_CONTENT_MIN_HEIGHT))
            .mt(px(-SHELL_HEADER_OVERLAP))
            .flex_1()
            .min_w_0()
            .flex()
            .flex_col()
            .gap(px(15.0))
            .pt(px(24.0))
            .pb(px(20.0))
            .bg(rgb(orbit::canvas(cx)))
            .child(orbit::page_header(
                "Dirección del producto",
                "Roadmap",
                "Explora los hitos en una línea temporal, por estado o como gráfico de distribución.",
             cx))
            .child(
                div()
                    .flex()
                    .flex_col()
                    .flex_1()
                    .min_h_0()
                    .px(px(20.0))
                    .py(px(24.0))
                    .bg(rgb(orbit::surface_1(cx)))
                    .border_1()
                    .border_color(rgba(orbit::line(cx)))
                    .rounded(px(orbit::RADIUS))
                    .child(body),
            )
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

#[cfg(test)]
mod account_tests {
    use super::*;

    #[test]
    fn plan_labels_and_module_counts_follow_the_same_policy_as_navigation() {
        for (plan, label, included) in [
            (Plan::Unknown, "Acceso sin verificar", [false; 6]),
            (
                Plan::Overlays,
                "Overlays",
                [true, true, true, true, false, true],
            ),
            (
                Plan::Engineer,
                "Engineer",
                [false, true, true, true, true, true],
            ),
            (Plan::Suite, "Overlays + Engineer", [true; 6]),
        ] {
            let access = Access {
                plan,
                ..Access::default()
            };
            assert_eq!(account_plan_label(plan), label);
            assert_eq!(account_module_access(access, false), included);
            assert_eq!(
                account_module_access(
                    Access {
                        blocked: true,
                        ..access
                    },
                    false
                ),
                [false; 6]
            );
        }
        assert_eq!(
            account_module_access(
                Access {
                    plan: Plan::Overlays,
                    ..Access::default()
                },
                true
            ),
            [true, true, true, true, false, false],
            "the frozen demo is not a real policy"
        );
    }
}
