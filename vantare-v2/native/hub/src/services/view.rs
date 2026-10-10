//! UI sin red ni tokens. Un worker cancelable posee la conexión IPC y el I/O bloqueante.
#[path = "participation.rs"]
mod participation;
use super::{
    client::{Client, REQUEST_POLL, default_binary},
    protocol::{Command, Reply},
};
use crate::orbit;
use crate::{Section, shell::navigation::Access};
use base64::{Engine, engine::general_purpose::STANDARD};
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
    profile: Option<super::protocol::AccountProfile>,
    avatar: Option<Arc<gpui::Image>>,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Inflight {
    Idle,
    /// Consulta periódica de política: no bloquea ni se muestra.
    Background,
    Profile,
    PurchaseRenew,
    PurchaseSession,
    User,
}
impl Inflight {
    fn background(self) -> bool {
        matches!(
            self,
            Self::Background | Self::Profile | Self::PurchaseRenew | Self::PurchaseSession
        )
    }
}
struct PurchaseWait {
    product: super::protocol::BillingProduct,
    started: std::time::Instant,
    polled: Option<std::time::Instant>,
}
impl PurchaseWait {
    fn confirmed(&self, access: Access) -> bool {
        use super::protocol::BillingProduct;
        use vantare_ipc::control::CatalogAccess;
        access.verified
            && !access.blocked
            && match self.product {
                BillingProduct::ProMonthly | BillingProduct::ProAnnual => {
                    access.catalog == CatalogAccess::Pro
                }
                BillingProduct::LaunchLifetime => {
                    matches!(access.catalog, CatalogAccess::LaunchV1 | CatalogAccess::Pro)
                }
            }
    }
    fn expired(&self, now: std::time::Instant) -> bool {
        now.duration_since(self.started) >= std::time::Duration::from_mins(10)
    }
    fn due(&self, now: std::time::Instant) -> bool {
        self.polled
            .is_none_or(|last| now.duration_since(last) >= std::time::Duration::from_secs(5))
    }
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
    pub(crate) adapt: orbit::Adapt,
    pipe: String,
    send: Option<SyncSender<Command>>,
    receive: Option<Receiver<Reply>>,
    stop: Arc<AtomicBool>,
    cancellation: Option<Arc<Event>>,
    worker: Option<std::thread::JoinHandle<()>>,
    connection_incompatible: Arc<AtomicBool>,
    rights: Option<vantare_ipc::control::Feed>,
    inflight: Inflight,
    /// Acción del usuario recibida durante la consulta periódica; se envía al acabar.
    queued: Option<Command>,
    account: AccountState,
    access: access::State,
    /// El servicio distinguió un límite de dispositivos (`Reply::DeviceLimit`):
    /// la salida es liberar el activo, no reintentar a ciegas.
    device_limit: bool,
    license_polled_at: Option<std::time::Instant>,
    purchase_product: Option<super::protocol::BillingProduct>,
    purchase_wait: Option<PurchaseWait>,
    purchase_message: Option<String>,
    message: String,
    active: Area,
    calendar_target: Option<gpui::WeakEntity<crate::calendar::Calendar>>,
    report_revision: Option<u64>,
    pub(crate) editor: crate::testing::Editor,
    pub(crate) report_receipts: Vec<(
        super::protocol::report_document::Fields,
        super::protocol::report_document::Receipt,
    )>,
    pub(crate) participation: super::protocol::testing_document::Participation,
    pub(crate) participation_message: String,
    pub(crate) participation_pending: Option<u64>,
    pub(crate) participation_generation: u64,
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

fn core_feed(pipe: &str) -> Option<vantare_ipc::control::Feed> {
    let image = default_binary().ok()?.with_file_name("vantare-core.exe");
    #[cfg(feature = "parity-capture")]
    let image = if std::env::var("VANTARE_CAPTURE_POLICY").as_deref() == Ok("ipc") {
        // Banco ui-quality explícito: el peer QA aloja ambos contratos IPC.
        std::env::current_exe().ok()?
    } else {
        image
    };
    match vantare_ipc::control::Feed::connect(pipe, image) {
        Ok(feed) => Some(feed),
        Err(error) => {
            eprintln!("lector de política no disponible: {error}");
            None
        }
    }
}

const ACCOUNT_MODULES: [(Section, &str); 6] = [
    (Section::Studio, "Editor de overlays"),
    (Section::Launcher, "Lanzador"),
    (Section::Calendar, "Carreras y recordatorios"),
    (Section::Strategy, "Estrategia"),
    (Section::Engineer, "Ingeniero"),
    (Section::Analysis, "Telemetría"),
];

fn purchase_disabled_reason(signed_in: bool, working: bool) -> Option<&'static str> {
    if !signed_in {
        Some("Inicia sesión para comprar")
    } else if working {
        Some("Operación en curso")
    } else {
        None
    }
}

fn account_plan_label(verified: bool) -> &'static str {
    if verified {
        "Acceso verificado"
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
            let rights = this.rights.take();
            let executor = cx.background_executor().clone();
            async move {
                executor
                    .spawn(async move {
                        // Feed cancela y une su lector; nunca espera a HTTP.
                        drop(rights);
                        if let Some(worker) = worker
                            && worker.join().is_err()
                        {
                            eprintln!("worker de servicios terminó con error");
                        }
                    })
                    .await;
            }
        })
        .detach();
        let rights = core_feed(&pipe);
        let mut remote = Self {
            adapt: orbit::Adapt::default(),
            pipe,
            send: None,
            receive: None,
            stop: Arc::new(AtomicBool::new(false)),
            cancellation: None,
            worker: None,
            connection_incompatible: Arc::new(AtomicBool::new(false)),
            rights,
            inflight: Inflight::Idle,
            queued: None,
            account: AccountState::default(),
            access: access::State::from_build(),
            device_limit: false,
            license_polled_at: None,
            purchase_product: None,
            purchase_wait: None,
            purchase_message: None,
            message: "Cuenta no disponible".into(),
            active: Area::Account,
            calendar_target: None,
            report_revision: None,
            editor,
            report_receipts: Vec::new(),
            participation: crate::services::protocol::testing_document::Participation::default(),
            participation_message: "Recarga para consultar cuestionarios y contribuciones".into(),
            participation_pending: None,
            participation_generation: 0,
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

    pub(crate) fn profile_name(&self) -> &str {
        self.account
            .profile
            .as_ref()
            .map_or("", |profile| profile.name.as_str())
    }

    pub(crate) fn profile_avatar(&self, size: f32, radius: f32, cx: &gpui::App) -> gpui::Div {
        let initials = orbit::initials(self.profile_name());
        div()
            .relative()
            .size(px(size))
            .flex_none()
            .rounded(px(radius))
            .overflow_hidden()
            .bg(rgb(orbit::surface_2(cx)))
            .flex()
            .items_center()
            .justify_center()
            .child(text(initials.clone(), size * 0.4, 650, orbit::ink(cx), cx))
            .when_some(self.account.avatar.as_ref(), |body, image| {
                body.child(
                    gpui::img(image.clone())
                        .absolute()
                        .size_full()
                        .object_fit(gpui::ObjectFit::Cover)
                        .rounded(px(radius))
                        .with_fallback(move || div().child(initials.clone()).into_any_element()),
                )
            })
    }

    fn observe_core_policy(
        &mut self,
        policy: vantare_ipc::control::Policy,
        now_ms: u64,
        cx: &mut Context<Self>,
    ) {
        let before = self.access.navigation(self.account.signed_in, now_ms);
        let current = policy.current_at(now_ms);
        self.access.observe_core_policy(policy);
        let access = self.access.navigation(self.account.signed_in, now_ms);
        let confirmed = current
            && self
                .purchase_wait
                .as_ref()
                .is_some_and(|wait| wait.confirmed(access));
        if confirmed {
            self.purchase_wait = None;
            self.purchase_message = Some("Acceso solicitado verificado por el servicio.".into());
        }
        if before != access || confirmed {
            cx.notify();
        }
    }

    /// Feed autenticado independiente de la cola HTTP; TTL y autoridad del núcleo intactos.
    pub(crate) fn refresh_license(&mut self, cx: &mut Context<Self>) {
        let now = std::time::Instant::now();
        if self
            .license_polled_at
            .is_none_or(|last| now.duration_since(last) >= LICENSE_POLL)
        {
            self.license_polled_at = Some(now);
            if let Some(rights) = &self.rights {
                let policy = rights.policy();
                self.observe_core_policy(
                    policy,
                    vantare_ipc::control::wall_ms().unwrap_or(u64::MAX),
                    cx,
                );
            }
        }
        if self
            .purchase_wait
            .as_ref()
            .is_some_and(|wait| wait.expired(now))
        {
            self.purchase_wait = None;
            self.purchase_message = Some(
                "No se han confirmado los derechos. Usa Comprobar acceso para reintentarlo.".into(),
            );
            cx.notify();
        }
        if !self.busy()
            && self.account.signed_in
            && self
                .purchase_wait
                .as_ref()
                .is_some_and(|wait| wait.due(now))
        {
            if let Some(wait) = &mut self.purchase_wait {
                wait.polled = Some(now);
            }
            self.request_with_kind(Command::LicenseRenew, Some(Inflight::PurchaseRenew), cx);
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
        if self.inflight.background() {
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
        self.purchase_wait = None;
        self.purchase_product = None;
        self.stop.store(true, Ordering::Release);
        if let Some(event) = &self.cancellation {
            event.set();
        }
        self.send = None;
    }

    pub(crate) fn connection_incompatible(&self) -> bool {
        self.connection_incompatible.load(Ordering::Acquire)
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
        let connection = Arc::clone(&self.connection_incompatible);
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
                    Ok(reply) => {
                        match &reply {
                            Reply::Error { message }
                                if message == vantare_ipc::INCOMPATIBLE_COMPONENTS =>
                            {
                                connection.store(true, Ordering::Release);
                            }
                            Reply::Error { .. } => {}
                            _ => connection.store(false, Ordering::Release),
                        }
                        reply
                    }
                    Err(message) => {
                        if message == vantare_ipc::INCOMPATIBLE_COMPONENTS {
                            connection.store(true, Ordering::Release);
                        }
                        client = None;
                        Reply::Error {
                            message: message.into(),
                        }
                    }
                };
                // El aviso accionable pertenece al estado de conexión del Hub.
                // Las páginas conservan un error contextual sin duplicar ese aviso.
                let reply = match reply {
                    Reply::Error { message } if message == vantare_ipc::INCOMPATIBLE_COMPONENTS => {
                        Reply::Error {
                            message: "Servicios no disponibles por incompatibilidad".into(),
                        }
                    }
                    reply => reply,
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

    fn dispatch_with_kind(&mut self, command: Command, kind: Option<Inflight>) -> bool {
        let inflight = kind.unwrap_or(if matches!(command, Command::LicenseStatus) {
            Inflight::Background
        } else {
            Inflight::User
        });
        if let Command::Purchase { product } = &command {
            self.purchase_product = Some(*product);
        }
        let background = inflight.background();
        // Otra acción de licencia del usuario releva al límite anterior; la
        // consulta periódica de política no lo hace.
        if matches!(command, Command::LicenseRenew | Command::DeviceReset) {
            self.device_limit = false;
        }
        if !background {
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
        }
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
            self.inflight = inflight;
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
    pub fn request(&mut self, command: Command, cx: &mut Context<Self>) {
        self.request_with_kind(command, None, cx);
    }
    /// Aviso cuando una acción se descarta porque el refresco automático ocupa
    /// el hueco reservado: antes se perdía sin mensaje con `queued` ocupado.
    fn background_discard_message(
        queued: Option<&Command>,
        command: &Command,
    ) -> Option<&'static str> {
        (queued.is_some() && !matches!(command, Command::Logout)).then_some("Operación en curso")
    }
    fn request_with_kind(
        &mut self,
        command: Command,
        kind: Option<Inflight>,
        cx: &mut Context<Self>,
    ) {
        self.access.requested(&command);
        if matches!(command, Command::Logout | Command::AccountBegin) {
            self.clear_participation();
        }
        if matches!(command, Command::Logout) {
            self.purchase_wait = None;
            self.purchase_product = None;
            self.purchase_message = None;
        }
        if self.inflight.background() {
            if self.queued.is_none() || matches!(command, Command::Logout) {
                self.queued = Some(command);
            } else if let Some(message) =
                Self::background_discard_message(self.queued.as_ref(), &command)
            {
                self.message = message.into();
                self.access.observe(
                    &Reply::Error {
                        message: self.message.clone(),
                    },
                    matches!(self.active, Area::Account),
                );
            }
            return cx.notify();
        }
        if self.busy() && matches!(command, Command::Logout) {
            self.account.cancel_login = true;
            cx.notify();
            return;
        }
        if self.busy()
            || self.stop.load(Ordering::Acquire)
            || !self.dispatch_with_kind(command, kind)
        {
            cx.notify();
            return;
        }
        if !self.inflight.background() {
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
                            this.complete(reply, cx);
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
        self.editor.clear_approval(cx);
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

    #[allow(clippy::too_many_lines)]
    fn complete(&mut self, reply: Reply, cx: &mut Context<Self>) {
        let access_before = self.navigation_access();
        let mut profile_changed = false;
        let mut missing_profile = false;
        let failed = matches!(&reply, Reply::Error { .. });
        if let Reply::Error { message } = &reply
            && self.participation_pending.is_some()
        {
            self.participation_message = message.clone();
            self.participation_pending = None;
        }
        let purchase_background = matches!(
            self.inflight,
            Inflight::PurchaseRenew | Inflight::PurchaseSession
        );
        let renewing = self.inflight == Inflight::PurchaseRenew
            || (self.inflight == Inflight::User
                && matches!(self.active, Area::Licenses { renew: true }));
        let after_renew = if renewing {
            self.access.renewal_acknowledged(&reply)
        } else {
            None
        };
        // La renovación puede devolver una foto anterior al último heartbeat.
        // Solo Feed alimenta derechos; el reply conserva feedback y seguimiento OAuth.
        if !matches!(&reply, Reply::License { .. }) && self.inflight != Inflight::Profile {
            self.access.observe(
                &reply,
                !self.inflight.background() && matches!(self.active, Area::Account),
            );
        }
        let next = self
            .access
            .next_command(&reply, &mut self.account.cancel_login)
            .or(after_renew);
        let background = self.inflight.background();
        self.inflight = Inflight::Idle;
        self.account.pending = false;
        let purchase_message_before = self.purchase_message.clone();
        if renewing
            && matches!(&reply, Reply::License { policy, .. } if policy.current_at(vantare_ipc::control::wall_ms().unwrap_or(u64::MAX)))
            && self
                .purchase_wait
                .as_ref()
                .is_some_and(|wait| wait.confirmed(self.navigation_access()))
        {
            self.purchase_wait = None;
            self.purchase_message = Some("Acceso solicitado verificado por el servicio.".into());
        }
        let quiet = background;
        if background && failed && purchase_background {
            self.purchase_message = Some("No se pudo comprobar la compra. Reintentamos durante la espera; también puedes comprobar el acceso manualmente.".into());
        }
        if !background && matches!(self.active, Area::Calendar) {
            self.calendar_reply(reply.clone(), cx);
        }
        match reply {
            Reply::Checkout { url } => {
                if let Some(product) = self.purchase_product.take() {
                    self.purchase_wait = Some(PurchaseWait {
                        product,
                        started: std::time::Instant::now(),
                        polled: None,
                    });
                    cx.open_url(&url);
                    self.purchase_message =
                        Some("Compra abierta. Los derechos se comprobarán automáticamente.".into());
                }
            }
            // La consulta periódica no pisa el resultado de una acción del usuario.
            Reply::Error { .. } | Reply::License { .. } if background => {}
            Reply::Status { message, .. } | Reply::Error { message } => {
                if matches!(self.active, Area::Calendar) {
                    // El Calendario recibe su error sin alterar Cuenta.
                } else if matches!(self.active, Area::Roadmap) {
                    self.roadmap_message = message;
                    self.stale = true;
                } else if matches!(self.active, Area::Report) {
                    self.editor.clear_approval(cx);
                    self.editor.error = failed;
                    self.editor.message = message;
                    self.editor.preview = None;
                } else {
                    self.message = message;
                }
            }
            // El límite de dispositivos ya llega distinguido del
            // resto de fallos: habilita la salida concreta.
            Reply::DeviceLimit { message } => {
                self.device_limit = true;
                if purchase_background {
                    self.purchase_message = Some(message);
                } else if !background {
                    self.message = message;
                }
            }
            Reply::Calendar { .. } => {}
            Reply::Testing { data } => {
                if self.participation_pending == Some(self.participation_generation)
                    && self.account.signed_in
                    && !self.account.cancel_login
                {
                    self.participation = data;
                    self.participation_message = "Datos confirmados por el servicio".into();
                }
                self.participation_pending = None;
            }
            Reply::Roadmap {
                publication,
                stale,
                message,
                ..
            } => {
                self.publication = publication;
                self.stale = stale;
                self.roadmap_message = message;
            }
            Reply::Account {
                signed_in,
                profile,
                pending,
                message,
                ..
            } => {
                if !pending {
                    missing_profile =
                        signed_in && profile.is_none() && self.account.profile.is_none();
                    // Un perfil vacío recuerda la lectura inicial, incluso si no
                    // hay foto o la red falla. No se sondea HTTP continuamente.
                    let profile = signed_in.then(|| profile.unwrap_or_default());
                    if self.account.profile != profile {
                        profile_changed = true;
                        self.account.profile = profile;
                        self.account.avatar = self
                            .account
                            .profile
                            .as_ref()
                            .and_then(|profile| profile.image_jpeg.as_ref())
                            .filter(|jpeg| jpeg.len() <= 32 * 1024)
                            .and_then(|jpeg| STANDARD.decode(jpeg).ok())
                            .map(|bytes| {
                                Arc::new(gpui::Image::from_bytes(gpui::ImageFormat::Jpeg, bytes))
                            });
                    }
                    if !signed_in {
                        self.purchase_wait = None;
                        self.purchase_product = None;
                        self.purchase_message = None;
                        self.report_receipts.clear();
                        self.clear_participation();
                    }
                    self.account.signed_in = signed_in;
                }
                self.account.pending = pending;
                if !background {
                    self.message = message;
                }
            }
            Reply::License { message, .. } => {
                self.message = format!(
                    "{message} · Acceso: {}",
                    account_plan_label(self.navigation_access().verified)
                );
            }
            Reply::Closed => self.message = "Servicios cerrado".into(),
            Reply::Draft { draft, message } => self.report_draft(draft, message, cx),
            Reply::ReportPreview { preview } => {
                if self.report_revision == Some(self.editor.revision) {
                    self.editor.clear_approval(cx);
                    self.editor.error = false;
                    self.editor.screenshots.clone_from(&preview.screenshots);
                    self.editor.preview = Some(preview);
                    self.editor.message =
                        "Revise cuenta, canal y contenido; el envío exige su consentimiento".into();
                } else {
                    self.editor.message = "Texto cambiado; vuelva a revisar el envío".into();
                }
            }
            Reply::ReportReceipt {
                receipt,
                draft_state,
            } => self.report_receipt(&receipt, draft_state, cx),
        }
        let next = next_request(next, &mut self.queued, self.calendar_target.is_some())
            .or_else(|| missing_profile.then_some(Command::AccountProfileRefresh));
        let notify = !quiet
            || profile_changed
            || access_before != self.navigation_access()
            || next.is_some()
            || purchase_message_before != self.purchase_message;
        if let Some(command) = next {
            self.access.login_requested =
                matches!(command, Command::Logout) || self.access.login_requested;
            let kind = if missing_profile && matches!(command, Command::AccountProfileRefresh) {
                Some(Inflight::Profile)
            } else {
                (purchase_background && matches!(command, Command::AccountPoll))
                    .then_some(Inflight::PurchaseSession)
            };
            if !self.dispatch_with_kind(command, kind) && matches!(self.active, Area::Calendar) {
                self.calendar_reply(
                    Reply::Error {
                        message: self.message.clone(),
                    },
                    cx,
                );
            }
        }
        if notify {
            cx.notify();
        }
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
                    if self.working() && matches!(self.active, Area::Licenses { .. }) {
                        "Comprobando…"
                    } else {
                        "Comprobar acceso"
                    },
                    cx,
                )
                .tab_stop(!self.working())
                .when(self.working(), |button| button.opacity(orbit::DISABLED))
                .on_click(cx.listener(|this, _, _, cx| {
                    if !this.working() {
                        this.request(Command::LicenseRenew, cx);
                    }
                })),
            )
            .children(
                [
                    super::protocol::BillingProduct::ProMonthly,
                    super::protocol::BillingProduct::ProAnnual,
                    super::protocol::BillingProduct::LaunchLifetime,
                ]
                .into_iter()
                .enumerate()
                .map(|(index, product)| {
                    orbit::small_button(
                        ["purchase-monthly", "purchase-annual", "purchase-launch"][index],
                        ["Pro · 5,99 €/mes", "Pro · 59,90 €/año", "Launch · 30 €"][index],
                        cx,
                    )
                    .tab_stop(signed_in && !self.working())
                    .when_some(
                        purchase_disabled_reason(signed_in, self.working()),
                        orbit::disabled,
                    )
                    .on_click(cx.listener(move |this, _, _, cx| {
                        if this.account.signed_in && !this.working() {
                            this.request(Command::Purchase { product }, cx);
                        }
                    }))
                }),
            )
            .child(if signed_in {
                orbit::small_button("services-sign-out", "Cerrar sesión", cx)
                    .tab_stop(!self.working())
                    .when(self.working(), |button| button.opacity(orbit::DISABLED))
                    .on_click(cx.listener(|this, _, _, cx| {
                        if !this.working() {
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
                    if this.requires_access() && !this.working() {
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
                "Acceso verificado · activo"
            } else {
                self.account_access_label()
            },
            if verified {
                orbit::Tone::Success
            } else {
                orbit::Tone::Neutral
            },
            cx,
        ))
    }
    fn account_access_label(&self) -> &'static str {
        if account_demo().is_some() {
            account_plan_label(self.account_access().verified)
        } else {
            self.access
                .policy_denial(vantare_ipc::control::wall_ms().unwrap_or(u64::MAX))
                .unwrap_or_else(|| account_plan_label(self.account_access().verified))
        }
    }
    fn purchase_status(&self, cx: &mut Context<Self>) -> gpui::Div {
        div().when_some(self.purchase_message.as_ref(), |body, message| {
            body.child(account_note(message, cx))
                .when(self.purchase_wait.is_some(), |body| {
                    body.child(
                        orbit::small_button("purchase-stop-wait", "Dejar de comprobar", cx)
                            .on_click(cx.listener(|this, _, _, cx| {
                                this.purchase_wait = None;
                                this.purchase_message = Some(
                                    "Espera detenida. Puedes comprobar el acceso manualmente."
                                        .into(),
                                );
                                cx.notify();
                            })),
                    )
                })
        })
    }
    fn profile_actions(&self, cx: &mut Context<Self>) -> gpui::Div {
        let signed_in = self.account.signed_in && account_demo().is_none();
        div().flex().gap(px(6.0)).when(signed_in, |body| {
            body.when_some(access::profile_portal(), |body, url| {
                body.child(
                    orbit::small_button("services-profile-edit", "Cambiar foto", cx)
                        .on_click(cx.listener(move |_, _, _, cx| cx.open_url(&url))),
                )
            })
            .child(
                orbit::small_button("services-profile-refresh", "Actualizar foto", cx)
                    .tab_stop(!self.working())
                    .when(self.working(), |button| {
                        orbit::disabled(button, "Operación en curso")
                    })
                    .on_click(cx.listener(|this, _, _, cx| {
                        if !this.working() && this.account.signed_in {
                            this.request(Command::AccountProfileRefresh, cx);
                        }
                    })),
            )
        })
    }

    fn account_identity(&self, cx: &mut Context<Self>) -> gpui::Div {
        let demo = account_demo();
        let signed_in = self.account.signed_in;
        let identity_actions = self.account_identity_actions(cx);
        orbit::hero_surface(cx)
            .flex_row()
            .flex_1()
            .flex_basis(gpui::relative(1.3 / 2.3))
            .min_w_0()
            .min_h(px(if self.adapt.show_notes() {
                124.0
            } else {
                100.0
            }))
            .px(px(22.0))
            .py(px(16.0))
            .flex()
            .items_center()
            .gap(px(16.0))
            .child(if let Some(demo) = demo {
                div()
                    .size(px(64.0))
                    .flex_none()
                    .flex()
                    .items_center()
                    .justify_center()
                    .rounded_full()
                    .bg(linear_gradient(
                        160.0,
                        linear_color_stop(rgb(crate::orbit::legacy_rgb(0x002a_2a30, cx)), 0.0),
                        linear_color_stop(rgb(crate::orbit::legacy_rgb(0x0017_171b, cx)), 1.0),
                    ))
                    .child(text(
                        orbit::initials(&demo.user.full_name),
                        26.0,
                        750,
                        orbit::ink(cx),
                        cx,
                    ))
            } else {
                self.profile_avatar(64.0, 32.0, cx)
            })
            .child(
                div()
                    .flex_1()
                    .min_w_0()
                    .flex()
                    .flex_col()
                    .gap(px(2.0))
                    .child(
                        orbit::display(
                            if let Some(demo) = demo {
                                &demo.user.full_name
                            } else if signed_in && !self.profile_name().is_empty() {
                                self.profile_name()
                            } else if signed_in {
                                "Cuenta conectada"
                            } else {
                                "Sin sesión"
                            },
                            if self.adapt.show_optional() {
                                32.0
                            } else {
                                26.0
                            },
                            orbit::ink(cx),
                            cx,
                        )
                        .line_height(px(if self.adapt.show_optional() {
                            36.0
                        } else {
                            30.0
                        })),
                    )
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
                    .child(self.account_badges(cx))
                    .child(self.profile_actions(cx)),
            )
            .child(identity_actions)
    }
    fn account_modules(included: [bool; 6], compact: bool, cx: &gpui::App) -> gpui::Div {
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
                    .flex_none()
                    .items_center()
                    .justify_between()
                    .gap(px(12.0))
                    .border_b_1()
                    .border_color(rgba(orbit::line_row(cx)))
                    .when(compact, |row| {
                        row.h(px(32.0)).child(
                            div()
                                .id(label)
                                .role(gpui::Role::Group)
                                .aria_label(label)
                                .flex()
                                .flex_1()
                                .items_center()
                                .gap(px(12.0))
                                .child(orbit::icon(icon, 18.0, orbit::ink_3(cx)))
                                .child(text(label, 13.0, 500, orbit::ink(cx), cx)),
                        )
                    })
                    .when(!compact, |row| {
                        row.child(
                            orbit::summary_row(label, description, icon, cx)
                                .border_0()
                                .flex_1(),
                        )
                    })
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
        let compact = self.adapt.density >= orbit::adapt::Density::B;
        orbit::neo_card(cx)
            .when(compact, |card| card.p(px(16.0)).gap(px(8.0)))
            .child(orbit::neo_header("Módulos", "v-studio", cx))
            .when(!compact, |card| card.child(text("Acceso gratuito durante la beta. Estrategia e Ingeniero estarán disponibles próximamente.", 13.0, 400, orbit::ink_2(cx), cx)))
            .child(Self::account_modules(account_module_access(access, account_demo().is_some()), compact, cx).id("account-modules-scroll")
                .when(compact, |list| list.flex_none().h_auto())
                .when(!compact, |list| list.flex_none().min_h_0())
                .overflow_y_scroll())
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
                        if !this.working() && account_demo().is_none() {
                            this.request(Command::DeviceReset, cx);
                        }
                    })),
                ),
         cx)
        .flex_1()
    }
    pub fn account(&self, _window: &gpui::Window, cx: &mut Context<Self>) -> gpui::Div {
        let access = orbit::neo_card(cx).p(px(16.0)).flex_1().min_w_0()
            .child(text("Acceso beta", 16.0, 600, orbit::ink(cx), cx))
            .child(text("Acceso gratuito durante la beta para testers. La sesión valida tu acceso; no muestra ni copia claves privadas.", 13.0, 400, orbit::ink_2(cx), cx))
            .child(orbit::pill(self.account_access_label(), orbit::Tone::Neutral, cx).self_start());
        let contribution = orbit::neo_card(cx)
            .p(px(16.0))
            .flex_1()
            .min_w_0()
            .child(text("Tu aporte a la beta", 16.0, 600, orbit::ink(cx), cx))
            .child(text(
                "Los informes y cuestionarios viven en Testing Center.",
                13.0,
                400,
                orbit::ink_2(cx),
                cx,
            ))
            .child(text(
                "Totales de tu cuenta · Próximamente",
                12.0,
                400,
                orbit::ink_3(cx),
                cx,
            ));
        div()
            .flex_1()
            .min_h_0()
            .w_full()
            .flex()
            .flex_col()
            .gap(px(self.adapt.gap()))
            .when(
                account_demo().is_none() && !self.message.is_empty(),
                |page| page.child(orbit::callout(self.message.clone(), cx)),
            )
            .child(self.account_identity(cx).flex_none().w_full())
            .child(self.purchase_status(cx))
            .child(
                div()
                    .flex()
                    .flex_none()
                    .gap(px(self.adapt.gap()))
                    .child(access)
                    .when(self.adapt.show_optional(), |row| row.child(contribution)),
            )
            .child(self.account_plan(cx).flex_none().min_h_0())
            .child(Self::account_news(cx))
    }

    fn account_news(cx: &gpui::App) -> gpui::Div {
        let mut list = div()
            .id("account-news")
            .flex_1()
            .min_h_0()
            .overflow_y_scroll();
        match crate::shell::news_for_channel(crate::product::CHANNEL) {
            Ok(news) if news.is_empty() => {
                list = list.child(text(
                    "Sin notas publicadas para este canal",
                    13.0,
                    400,
                    orbit::ink_3(cx),
                    cx,
                ));
            }
            Ok(news) => {
                for release in news {
                    list = list.child(orbit::summary_row(
                        release.title,
                        release.summary,
                        "v-download",
                        cx,
                    ));
                }
            }
            Err(error) => list = list.child(text(error, 13.0, 400, orbit::ink_3(cx), cx)),
        }
        orbit::neo_card(cx)
            .flex_1()
            .min_h_0()
            .child(orbit::neo_header("Novedades de la beta", "v-download", cx))
            .child(list)
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

    pub fn testing(&self, compact: bool, cx: &mut Context<Self>) -> gpui::Div {
        div()
            .flex()
            .flex_col()
            .gap(px(8.0))
            .flex_none()
            .when(self.working(), |page| {
                page.child(orbit::callout(
                    "Procesando el informe… Conservamos tu borrador.",
                    cx,
                ))
            })
            .child(self.editor.render(compact, cx))
    }

    /// R6: todas las vistas leen la misma publicación real y su estado de caché.
    pub(crate) fn roadmap_publication(
        &self,
    ) -> Option<&super::protocol::roadmap_document::Publication> {
        self.manual_roadmap.publication(self.publication.as_ref())
    }
    pub(crate) fn roadmap_status(&self) -> &str {
        if self.working() {
            "Cargando roadmap…"
        } else {
            &self.roadmap_message
        }
    }
    pub(crate) fn ensure_roadmap(&mut self, cx: &mut Context<Self>) {
        if !self.roadmap_requested && !self.working() && self.queued.is_none() {
            self.roadmap_requested = true;
            self.request(Command::RoadmapCached, cx);
        }
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
#[path = "view/account_tests.rs"]
mod account_tests;
#[cfg(test)]
#[path = "view/purchase_tests.rs"]
mod purchase_tests;
#[cfg(test)]
#[path = "view/receipt_tests.rs"]
mod receipt_tests;
