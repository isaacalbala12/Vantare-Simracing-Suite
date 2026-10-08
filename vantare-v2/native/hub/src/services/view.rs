//! UI sin red ni tokens. Un worker cancelable posee la conexión IPC y el I/O bloqueante.
use super::{
    client::{Client, REQUEST_POLL, default_binary},
    protocol::{Command, Reply},
};
use crate::orbit;
use crate::{Section, shell::navigation::Access};
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

fn account_surface(_title: &str, meta: &str, body: gpui::Div, cx: &gpui::App) -> gpui::Div {
    div()
        .flex()
        .flex_col()
        .min_w_0()
        .gap(px(8.0))
        .child(orbit::meta(meta, 10.0, orbit::ink_3(cx), cx))
        .child(body)
}

fn account_body() -> gpui::Div {
    div().flex().flex_col().gap(px(4.0))
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
                .w(px(112.0))
                .flex_none()
                .child(text(label, 12.5, 500, orbit::ink_3(cx), cx)),
        )
        .child(
            div()
                .flex()
                .flex_1()
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

#[path = "access.rs"]
mod access;

enum Area {
    Account,
    Licenses { renew: bool },
    Roadmap,
    Calendar,
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
// La petición del calendario espera al heartbeat sin ocupar ni sobrescribir
// el único hueco reservado a una acción explícita del usuario.
fn next_request(
    next: Option<Command>,
    queued: &mut Option<Command>,
    calendar_pending: bool,
) -> Option<Command> {
    next.or_else(|| queued.take())
        .or_else(|| calendar_pending.then_some(Command::CalendarRefresh))
}

fn remember_receipt(
    receipts: &mut Vec<(
        super::protocol::report_document::Fields,
        super::protocol::report_document::Receipt,
    )>,
    fields: super::protocol::report_document::Fields,
    receipt: super::protocol::report_document::Receipt,
) {
    if let Some((_, saved)) = receipts
        .iter_mut()
        .find(|(_, saved)| saved.report_id == receipt.report_id)
    {
        *saved = receipt;
    } else {
        // La lista necesita título/módulo; no retiene una segunda copia de texto privado ni adjuntos.
        receipts.push((
            super::protocol::report_document::Fields {
                action_text: fields.action_text,
                module: fields.module,
                ..Default::default()
            },
            receipt,
        ));
    }
}
pub struct Remote {
    adapt: orbit::Adapt,
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
    /// El servicio distinguió un límite de dispositivos (`Reply::DeviceLimit`):
    /// la salida es liberar el activo, no reintentar a ciegas.
    device_limit: bool,
    license_polled_at: Option<std::time::Instant>,
    message: String,
    active: Area,
    calendar_target: Option<gpui::WeakEntity<crate::calendar::Calendar>>,
    report_revision: Option<u64>,
    pub(crate) editor: crate::testing::Editor,
    pub(crate) report_receipts: Vec<(
        super::protocol::report_document::Fields,
        super::protocol::report_document::Receipt,
    )>,
    recovery: Result<crate::testing::recovery::Recovery, String>,
    publication: Option<super::protocol::roadmap_document::Publication>,
    roadmap_message: String,
    roadmap_requested: bool,
    pub(crate) manual_roadmap: crate::roadmap::State,
    stale: bool,
}

// Margen para el cache de 1 s del núcleo, el tick de shell y la entrega IPC;
// no amplía la caducidad de 2 s que impone Policy::current_at.
const LICENSE_POLL: std::time::Duration = std::time::Duration::from_millis(500);

const HUB_CONTENT_MIN_HEIGHT: f32 = 830.0;
const SHELL_HEADER_OVERLAP: f32 = 162.0;

const ACCOUNT_MODULES: [(Section, &str); 6] = [
    (Section::Studio, "Editor de overlays"),
    (Section::Launcher, "Lanzador"),
    (Section::Calendar, "Carreras y recordatorios"),
    (Section::Strategy, "Estrategia"),
    (Section::Engineer, "Ingeniero"),
    (Section::Analysis, "Telemetría"),
];

fn account_plan_label(verified: bool) -> &'static str {
    if verified {
        "Beta para testers"
    } else {
        "Acceso sin verificar"
    }
}

fn account_module_access(access: Access, demo: bool) -> [bool; 6] {
    std::array::from_fn(|index| {
        !access.blocked
            && access.verified
            && access.lock(ACCOUNT_MODULES[index].0).is_none()
            // La captura congelada anuncia Telemetría como «próximamente».
            && !(demo && index == 5)
    })
}

fn account_module_status(section: Section, included: bool) -> &'static str {
    if matches!(section, Section::Strategy | Section::Engineer) {
        "Próximamente"
    } else if included {
        "Incluido"
    } else {
        "Sin verificar"
    }
}

impl Remote {
    pub(crate) fn set_adapt(&mut self, adapt: orbit::Adapt, cx: &mut Context<Self>) {
        if self.adapt != adapt {
            self.adapt = adapt;
            cx.notify();
        }
    }

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
        #[cfg(feature = "parity-capture")]
        if let Some(path) = std::env::var_os("VANTARE_TESTING_CAPTURE_PREVIEW")
            && let Ok(bytes) = crate::files::read(std::path::Path::new(&path), 32 * 1024)
            && let Ok(preview) = serde_json::from_slice::<
                super::protocol::report_document::ScreenshotPreview,
            >(&bytes)
        {
            editor.screenshots = vec![preview];
            editor.message = "Vista previa de captura · ejemplo local; no se enviará".into();
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
            adapt: orbit::Adapt::default(),
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
            device_limit: false,
            license_polled_at: None,
            message: "Cuenta no disponible".into(),
            active: Area::Account,
            calendar_target: None,
            report_revision: None,
            editor,
            report_receipts: Vec::new(),
            recovery,
            publication: None,
            roadmap_message: "No hay una publicación válida guardada".into(),
            roadmap_requested: false,
            manual_roadmap: crate::roadmap::State::load(),
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
                .is_none_or(|last| last.elapsed() >= LICENSE_POLL)
        {
            self.license_polled_at = Some(std::time::Instant::now());
            self.request(Command::LicenseStatus, cx);
        }
    }

    pub(crate) fn refresh_calendar(
        &mut self,
        target: gpui::WeakEntity<crate::calendar::Calendar>,
        cx: &mut Context<Self>,
    ) -> bool {
        if self.working() || self.stop.load(Ordering::Acquire) {
            return false;
        }
        self.calendar_target = Some(target);
        // El heartbeat ya tiene un worker: entregar el horario justo después,
        // sin reemplazar la acción del usuario que pudiera estar en queued.
        if self.inflight == Inflight::Background {
            return true;
        }
        self.request(Command::CalendarRefresh, cx);
        if !self.busy() {
            self.calendar_target = None;
            return false;
        }
        true
    }
    fn calendar_reply(&mut self, reply: Reply, cx: &mut Context<Self>) {
        if let Some(target) = self.calendar_target.take() {
            // La sección puede haber desaparecido al cerrar el Hub.
            let _ = target.update(cx, |calendar, cx| {
                calendar.complete_refresh(reply);
                cx.notify();
            });
        }
    }
    pub(crate) fn calendar_busy(&self) -> bool {
        self.working()
    }

    fn busy(&self) -> bool {
        self.inflight != Inflight::Idle
    }

    /// Ocupado a ojos del usuario: excluye la consulta periódica de política.
    fn working(&self) -> bool {
        self.inflight == Inflight::User
    }

    /// Pantalla de acceso o acción del usuario en vuelo (login, renovación):
    /// entrar en pista no cierra el Hub (#1464).
    pub fn holds_hub_in_game(&self) -> bool {
        self.requires_access() || self.working()
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
                        .ok_or("Conexión interrumpida")?
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
        // Otra acción de licencia del usuario releva al límite anterior; la
        // consulta periódica de política no lo hace.
        if matches!(command, Command::LicenseRenew | Command::DeviceReset) {
            self.device_limit = false;
        }
        self.active = match command {
            Command::CalendarRefresh => Area::Calendar,
            Command::RoadmapCached | Command::RoadmapRefresh => Area::Roadmap,
            Command::LicenseRenew => Area::Licenses { renew: true },
            Command::LicenseStatus | Command::DeviceReset => Area::Licenses { renew: false },
            Command::DraftLoad
            | Command::DraftSave { .. }
            | Command::DraftDiscard
            | Command::ReportCapture { .. }
            | Command::ReportRemoveScreenshot { .. }
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
        let background = matches!(command, Command::LicenseStatus);
        if self
            .send
            .as_ref()
            .is_some_and(|send| send.try_send(command).is_ok())
        {
            self.inflight = if background {
                Inflight::Background
            } else {
                Inflight::User
            };
            true
        } else {
            self.message = "Operación en curso".into();
            self.access.observe(
                &Reply::Error {
                    message: self.message.clone(),
                },
                matches!(self.active, Area::Account),
            );
            false
        }
    }

    // Ramifica por área y por variante del protocolo; ya se extrajo a `Reply` y
    // a `access` todo lo que no era reparto de mensajes.
    #[allow(clippy::too_many_lines)]
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
        if self.inflight != Inflight::Background {
            cx.notify();
        }
        cx.spawn(async move |this, cx| {
            loop {
                let keep = this
                    .update(cx, |this, cx| {
                        let reply = match this.receive.as_ref().map(Receiver::try_recv) {
                            Some(Ok(reply)) => Some(reply),
                            Some(Err(mpsc::TryRecvError::Disconnected)) => Some(Reply::Error {
                                message: "Conexión interrumpida".into(),
                            }),
                            _ => None,
                        };
                        if let Some(reply) = reply {
                            let access_before = this.navigation_access();
                            let failed = matches!(&reply, Reply::Error { .. });
                            let after_renew = if matches!(this.active, Area::Licenses { renew: true }) {
                                this.access.renewal_acknowledged(&reply)
                            } else { None };
                            this.access.observe(&reply, matches!(this.active, Area::Account));
                            let next = this.access.next_command(&reply, &mut this.account.cancel_login).or(after_renew);
                            let background = this.inflight == Inflight::Background;
                            this.inflight = Inflight::Idle;
                            this.account.pending = false;
                            let quiet = background && matches!(reply, Reply::License { .. } | Reply::Error { .. });
                            if matches!(this.active, Area::Calendar) {
                                this.calendar_reply(reply.clone(), cx);
                            }
                            match reply {
                                // La consulta periódica no pisa el resultado de una acción del usuario.
                                Reply::Error { .. } | Reply::License { .. } if background => {}
                                Reply::Status { message, .. } | Reply::Error { message } => {
                                    if matches!(this.active,Area::Calendar) {
                                        // El Calendario recibe su error sin alterar Cuenta.
                                    } else if matches!(this.active,Area::Roadmap) {
                                        this.roadmap_message = message;
                                        this.stale = true;
                                    } else if matches!(this.active,Area::Report) {
                                        this.editor.error=failed;
                                        this.editor.message=message;
                                        this.editor.preview=None;
                                    } else {
                                        this.message = message;
                                    }
                                }
                                // El límite de dispositivos ya llega distinguido del
                                // resto de fallos: habilita la salida concreta.
                                Reply::DeviceLimit { message } => {
                                    this.device_limit = true;
                                    this.message = message;
                                }
                                Reply::Calendar { .. } => {}
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
                                    if !pending {
                                        if !signed_in {
                                            this.report_receipts.clear();
                                        }
                                        this.account.signed_in = signed_in;
                                    }
                                    this.account.pending = pending;
                                    this.message = message;
                                }
                                Reply::License { message, .. } => {
                                    this.message = format!("{message} · Acceso: {}", account_plan_label(this.navigation_access().verified));
                                }
                                Reply::Closed => this.message = "Servicios cerrado".into(),
                                Reply::Draft { draft,message }=> this.report_draft(draft,message,cx),
                                Reply::ReportPreview { preview }=>{
                                    if this.report_revision==Some(this.editor.revision) { this.editor.error=false; this.editor.screenshots.clone_from(&preview.screenshots); this.editor.preview=Some(preview); this.editor.message="Revise cuenta, canal y contenido; el envío exige su consentimiento".into(); }
                                    else { this.editor.message="Texto cambiado; vuelva a revisar el envío".into(); }
                                },
                                Reply::ReportReceipt { receipt,draft_state }=> this.report_receipt(&receipt,draft_state,cx),
                            }
                            let next = next_request(next, &mut this.queued, this.calendar_target.is_some());
                            let notify = !quiet || access_before != this.navigation_access() || next.is_some();
                            if let Some(command) = next {
                                this.access.login_requested = matches!(command, Command::Logout) || this.access.login_requested;
                                if !this.dispatch(command) && matches!(this.active, Area::Calendar) {
                                    this.calendar_reply(Reply::Error { message: this.message.clone() }, cx);
                                }
                            }
                            if notify {
                                cx.notify();
                            }
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

    fn report_draft(
        &mut self,
        draft: Option<super::protocol::report_document::Draft>,
        message: String,
        cx: &mut Context<Self>,
    ) {
        if self.report_revision == Some(self.editor.revision) {
            let (fields, screenshots) = draft.map_or_else(
                || (crate::testing::empty_fields(), Vec::new()),
                |draft| (draft.fields, draft.screenshots),
            );
            self.editor = crate::testing::Editor::new(fields, cx);
            self.editor.screenshots = screenshots;
            self.editor.message = message;
        } else {
            self.editor.message =
                "Texto cambiado durante la operación; guarde el nuevo borrador".into();
        }
    }

    fn report_receipt(
        &mut self,
        receipt: &super::protocol::report_document::Receipt,
        draft_state: super::protocol::DraftState,
        cx: &mut Context<Self>,
    ) {
        use super::protocol::DraftState;
        let changed = self.report_revision != Some(self.editor.revision);
        let fields = if changed {
            super::protocol::report_document::Fields {
                action_text: "Título no disponible".into(),
                ..Default::default()
            }
        } else {
            self.editor.fields(cx)
        };
        remember_receipt(&mut self.report_receipts, fields, receipt.clone());
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
            "Informe enviado · {}{}",
            orbit::activity_time(&receipt.created_at, chrono::Local::now().fixed_offset()),
            draft_message
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
                    orbit::small_button("services-account-check", "Comprobar acceso", cx)
                        .tab_stop(false),
                )
                .child(
                    orbit::small_button("services-sign-out", "Cerrar sesión", cx)
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
                orbit::small_button(
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
                orbit::small_button("services-sign-out", "Cerrar sesión", cx)
                    .tab_stop(!self.working())
                    .when(self.working(), |button| button.opacity(orbit::DISABLED))
                    .on_click(cx.listener(|this, _, _, cx| {
                        if !this.busy() {
                            this.request(Command::Logout, cx);
                        }
                    }))
            } else {
                orbit::small_button(
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
                verified: true,
                calendar: true,
                strategy: true,
                ..Access::default()
            }
        } else {
            self.navigation_access()
        }
    }

    fn account_badges(&self, cx: &gpui::App) -> gpui::Div {
        let access = self.account_access();
        let verified = access.verified && !access.blocked;
        div().mt(px(8.0)).flex().child(orbit::pill(
            if verified {
                "Beta para testers · activa"
            } else {
                "Acceso sin verificar"
            },
            if verified {
                orbit::Tone::Success
            } else {
                orbit::Tone::Neutral
            },
            cx,
        ))
    }
    fn account_identity(&self, cx: &mut Context<Self>) -> gpui::Div {
        let demo = account_demo();
        let signed_in = self.account.signed_in;
        let identity_actions = self.account_identity_actions(cx);
        div()
            .flex_1()
            .flex_basis(gpui::relative(1.3 / 2.3))
            .min_w_0()
            .min_h(px(100.0))
            .px(px(22.0))
            .py(px(16.0))
            .flex()
            .items_center()
            .gap(px(16.0))
            .rounded(px(orbit::skin(cx).radius.lg))
            .border_1()
            .border_color(rgba(orbit::line(cx)))
            .bg(orbit::gradient(
                cx.global::<orbit::design::Tokens>().gradients.hero,
                120.0,
            ))
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
                        demo.map_or_else(
                            || "·".to_owned(),
                            |demo| {
                                demo.user
                                    .full_name
                                    .split_whitespace()
                                    .take(2)
                                    .filter_map(|name| name.chars().next())
                                    .flat_map(char::to_uppercase)
                                    .collect()
                            },
                        ),
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
                    .child(orbit::caps(
                        if let Some(demo) = demo {
                            &demo.user.full_name
                        } else if signed_in {
                            "Cuenta conectada"
                        } else {
                            "Sin sesión"
                        },
                        26.0,
                        orbit::ink(cx),
                        cx,
                    ))
                    .child(text(
                        if demo.is_some() {
                            "Correo oculto por privacidad"
                        } else {
                            "Tu sesión de Vantare"
                        },
                        12.5,
                        400,
                        orbit::ink_3(cx),
                        cx,
                    ))
                    .child(self.account_badges(cx)),
            )
            .child(identity_actions)
    }
    fn account_modules(included: [bool; 6], cx: &gpui::App) -> gpui::Div {
        let mut modules = div().flex().flex_col().w_full().gap(px(4.0));
        for (index, (section, label)) in ACCOUNT_MODULES.into_iter().enumerate() {
            if section == Section::Analysis {
                continue;
            }
            let soon = matches!(section, Section::Strategy | Section::Engineer);
            let (icon, description) = match section {
                Section::Studio => ("v-studio", "Editor de diseños y widgets"),
                Section::Launcher => ("v-launch", "Perfiles y aplicaciones"),
                Section::Calendar => ("v-calendar", "Horario y recordatorios para testers"),
                Section::Strategy => ("v-strategy", "Plan de paradas y combustible"),
                _ => ("v-engineer", "Ingeniero de radio con voz"),
            };
            modules = modules.child(
                div()
                    .flex()
                    .items_center()
                    .justify_between()
                    .gap(px(12.0))
                    .border_b_1()
                    .border_color(rgba(orbit::line_row(cx)))
                    .child(
                        orbit::summary_row(label, description, icon, cx)
                            .border_0()
                            .flex_1(),
                    )
                    .child(orbit::pill(
                        account_module_status(section, included[index]),
                        if !soon && included[index] {
                            orbit::Tone::Success
                        } else {
                            orbit::Tone::Neutral
                        },
                        cx,
                    )),
            );
        }
        modules
    }
    fn account_plan(&self, cx: &gpui::App) -> gpui::Div {
        let access = self.account_access();
        orbit::neo_card(cx)
            .child(orbit::neo_header("Módulos", "v-studio", cx))
            .child(text("Acceso gratuito durante la beta. Estrategia e Ingeniero estarán disponibles próximamente.", 13.0, 400, orbit::ink_2(cx), cx))
            .child(Self::account_modules(account_module_access(access, account_demo().is_some()), cx).id("account-modules-scroll").flex_grow(1.0).min_h_0().overflow_y_scroll())
    }
    fn account_session(&self, cx: &gpui::App) -> gpui::Div {
        let demo = account_demo().is_some();
        let signed_in = self.account.signed_in;
        account_surface(
            "Estado de la cuenta",
            "Tu sesión",
            account_body()
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
                .child(account_value("Último acceso", "—", false, cx))
                .child(account_value(
                    "Durante la beta",
                    "Acceso gratuito para testers",
                    false,
                    cx,
                ))
                .child(account_value("Canal", crate::product::CHANNEL, false, cx).border_b_0()),
            cx,
        )
        .flex_1()
    }
    fn account_devices(&self, cx: &mut Context<Self>) -> gpui::Div {
        let demo = account_demo().is_some();
        let access = self.account_access();
        let verified = access.verified && !access.blocked;
        let device = div()
            .flex()
            .items_center()
            .gap(px(12.0))
            .w_full()
            .px(px(12.0))
            .py(px(10.0))
            .rounded(px(12.0))
            .border_1()
            .border_color(rgba(if verified { 0x78d6_8b33 } else { 0xffff_ff0d }))
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
                        if verified {
                            "Acceso verificado en este equipo"
                        } else {
                            "Acceso sin verificar"
                        },
                        11.5,
                        400,
                        orbit::ink_3(cx),
                        cx,
                    )),
            )
            .child(div().size(px(6.0)).rounded_full().bg(rgb(if verified {
                orbit::green(cx)
            } else {
                orbit::ink_muted(cx)
            })));
        account_surface(
            "Dispositivos",
            "Este equipo",
            account_body()
                .items_start().gap(px(10.0))
                .child(device)
                .when(self.adapt.show_notes(), |body| body.child(account_note(
                    "Restablecer libera la activación de este equipo (una vez cada 24 h). La lista de otros dispositivos no está disponible aquí.", cx)))
                .child(
                    // Con el límite alcanzado, liberar el activo es la salida: se
                    // reutiliza el botón principal de Orbit, sin texto nuevo.
                    (if self.device_limit {
                        orbit::carmine_button("services-device-reset", "Restablecer dispositivo", cx)
                    } else {
                        orbit::small_button("services-device-reset", "Restablecer dispositivo", cx)
                    })
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
    pub fn account(&self, _window: &gpui::Window, cx: &mut Context<Self>) -> gpui::Div {
        div().flex_1().min_h_0().w_full().flex().flex_col().gap(px(self.adapt.gap()))
            .when(account_demo().is_none() && !self.message.is_empty(), |page| page.child(orbit::callout(self.message.clone(), cx)))
            .child(self.account_identity(cx).flex_none().w_full())
            .child(orbit::neo_card(cx).p(px(16.0))
                .child(orbit::neo_header("Acceso beta", "key", cx))
                .child(orbit::caps(account_plan_label(self.account_access().verified && !self.account_access().blocked), 24.0, orbit::ink(cx), cx))
                .child(text("Acceso gratuito durante la beta para testers. La sesión valida tu acceso; no muestra ni copia claves privadas.", 13.0, 400, orbit::ink_2(cx), cx)))
            .child(self.account_plan(cx).flex_1().min_h_0())
            .when(self.adapt.show_notes(), |page| page.child(orbit::neo_card(cx).p(px(12.0))
                .child(orbit::neo_header("Tu aporte", "v-testing", cx))
                .child(text("Los informes y cuestionarios de la beta viven en Testing Center.", 13.0, 400, orbit::ink_2(cx), cx))))
    }

    pub fn account_rail(&self, cx: &mut Context<Self>) -> Vec<orbit::RailSection> {
        vec![
            orbit::RailSection::new("Estado de la cuenta", "key", self.account_session(cx)),
            orbit::RailSection::new("Dispositivos", "v-monitor", self.account_devices(cx)),
            orbit::RailSection::new(
                "Avisos por email",
                "v-bell",
                text(
                    "Preferencias de email · Próximamente",
                    13.0,
                    400,
                    orbit::ink_2(cx),
                    cx,
                ),
            ),
            orbit::RailSection::new(
                "Tus datos",
                "v-shield",
                text(
                    "Perfiles y ajustes locales. Exportación y borrado de cuenta · Próximamente",
                    13.0,
                    400,
                    orbit::ink_2(cx),
                    cx,
                ),
            ),
        ]
    }

    pub fn report_action(&mut self, command: Command, cx: &mut Context<Self>) {
        if self.editor.dirty && matches!(command, Command::ReportPrepare) {
            self.editor.preview = None;
            self.editor.message = "Guarde los cambios antes de revisar el envío".into();
            self.editor.error = true;
            cx.notify();
            return;
        }
        self.request(command, cx);
    }

    pub fn testing(&self, window: &gpui::Window, cx: &mut Context<Self>) -> gpui::Div {
        self.editor
            .render(f32::from(window.viewport_size().width) <= 1360.0, cx)
    }

    #[allow(clippy::too_many_lines)] // Composición visual; crece al migrar a accesores de tema (#1430).
    pub fn published_roadmap(&mut self, cx: &mut Context<Self>) -> gpui::Stateful<gpui::Div> {
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
                "Novedades",
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

    pub fn licenses(&self, window: &gpui::Window, cx: &mut Context<Self>) -> gpui::Div {
        self.account(window, cx)
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
    fn calendar_waits_for_heartbeat_without_losing_queued_user_actions() {
        let mut queued = Some(Command::Logout);
        assert!(matches!(
            next_request(Some(Command::AccountPoll), &mut queued, true),
            Some(Command::AccountPoll)
        ));
        assert!(matches!(queued, Some(Command::Logout)));
        assert!(matches!(
            next_request(None, &mut queued, true),
            Some(Command::Logout)
        ));
        assert!(queued.is_none());
        assert!(matches!(
            next_request(None, &mut queued, true),
            Some(Command::CalendarRefresh)
        ));
        // Entregar la respuesta retira el destino pendiente: no repite la red.
        assert!(next_request(None, &mut queued, false).is_none());
    }

    #[test]
    fn heartbeat_cadence_keeps_cached_core_policy_current_until_delivery() {
        // Núcleo cachea 1 s, shell sondea cada 100 ms y entrega IPC cada 250 ms.
        // Simula todas las fases del cache; no modifica el TTL de Policy.
        let interval = u64::try_from(LICENSE_POLL.as_millis()).expect("interval");
        for cache_age in 0..1000 {
            let policy = vantare_ipc::control::Policy {
                version: vantare_ipc::control::VERSION,
                revision: 1,
                checked_at_ms: 1000,
                overlays_advanced: true,
                ..Default::default()
            };
            assert!(
                policy.current_at(1000 + cache_age + interval + 100 + 250),
                "el heartbeat caduca antes de la entrega: cache={cache_age}"
            );
        }
    }

    #[test]
    fn beta_modules_remain_upcoming_even_with_verified_module_rights() {
        for section in [Section::Strategy, Section::Engineer] {
            for included in [false, true] {
                assert_eq!(account_module_status(section, included), "Próximamente");
            }
        }
        assert_eq!(account_module_status(Section::Studio, true), "Incluido");
        assert_eq!(
            account_module_status(Section::Launcher, false),
            "Sin verificar"
        );
    }

    #[test]
    fn account_modules_follow_navigation_permissions() {
        for (access, expected) in [
            (Access::default(), [false; 6]),
            (
                Access {
                    verified: true,
                    ..Access::default()
                },
                [true, true, false, false, false, false],
            ),
            (
                Access {
                    verified: true,
                    engineer: true,
                    strategy: true,
                    calendar: true,
                    analysis: true,
                    ..Access::default()
                },
                [true; 6],
            ),
        ] {
            assert_eq!(account_module_access(access, false), expected);
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
        assert_eq!(account_plan_label(true), "Beta para testers");
        assert_eq!(account_plan_label(false), "Acceso sin verificar");
    }
}

#[cfg(test)]
mod receipt_tests {
    use super::remember_receipt;
    use crate::services::protocol::report_document::{Fields, Receipt};
    #[test]
    fn server_receipts_keep_identity_state_and_date_without_duplicating_retries() {
        let mut receipts = vec![];
        let fields = Fields {
            action_text: "Título enviado".into(),
            observed_text: "Texto privado".into(),
            module: "hub".into(),
            ..Default::default()
        };
        let receipt = Receipt {
            report_id: "report_0123456789abcdef".into(),
            report_state: "submitted".into(),
            idempotent: false,
            created_at: "2026-10-05T20:00:00Z".into(),
        };
        remember_receipt(&mut receipts, fields, receipt.clone());
        let mut retry = receipt.clone();
        retry.idempotent = true;
        remember_receipt(&mut receipts, Fields::default(), retry);
        assert_eq!(receipts.len(), 1);
        assert_eq!(receipts[0].0.action_text, "Título enviado");
        assert_eq!(receipts[0].0.module, "hub");
        assert!(receipts[0].0.observed_text.is_empty());
        assert_eq!(receipts[0].1.report_state, receipt.report_state);
        assert_eq!(receipts[0].1.created_at, receipt.created_at);
        assert!(receipts[0].1.idempotent);
    }
}
