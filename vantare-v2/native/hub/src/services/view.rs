//! UI sin red ni tokens. Un worker cancelable posee la conexión IPC y el I/O bloqueante.
#[path = "participation.rs"]
mod participation;
use super::{
    client::{Client, REQUEST_POLL, default_binary},
    protocol::{Command, Reply},
};
use crate::orbit;
use crate::shell::navigation::Access;
use base64::{Engine, engine::general_purpose::STANDARD};
use gpui::{Context, div, prelude::*, px, rgb};
use std::sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
    mpsc::{self, Receiver, SyncSender},
};
use vantare_ipc::transport::Event;

fn text(
    content: impl Into<gpui::SharedString>,
    size: f32,
    weight: u16,
    color: u32,
    cx: &gpui::App,
) -> gpui::Div {
    orbit::text(content, size, weight, color, cx).font_weight(orbit::face_weight(weight, cx))
}

#[path = "access.rs"]
mod access;
#[path = "view/account.rs"]
mod account;
mod founders;
#[path = "login.rs"]
mod login;
#[path = "view/roadmap.rs"]
mod roadmap;

enum Area {
    Account,
    Pilot,
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
    Roadmap,
    User,
}
impl Inflight {
    fn background(self) -> bool {
        matches!(
            self,
            Self::Background
                | Self::Profile
                | Self::PurchaseRenew
                | Self::PurchaseSession
                | Self::Roadmap
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
                BillingProduct::Founders => access.catalog == CatalogAccess::Founders,
                BillingProduct::ProMonthly | BillingProduct::ProAnnual => {
                    matches!(access.catalog, CatalogAccess::Pro | CatalogAccess::Founders)
                }
                BillingProduct::LaunchLifetime => {
                    matches!(
                        access.catalog,
                        CatalogAccess::LaunchV1 | CatalogAccess::Pro | CatalogAccess::Founders
                    )
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
pub(crate) mod pilot;
pub struct Remote {
    founders_language: founders::Language,
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
    email: Option<login::Form>,
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
    pub(crate) triage: crate::testing::TriageEditor,
    recovery: Result<crate::testing::recovery::Recovery, String>,
    publication: Option<super::protocol::roadmap_document::Publication>,
    roadmap_message: String,
    roadmap_requested: bool,
    roadmap_polled_at: Option<std::time::Instant>,
    pub(crate) manual_roadmap: crate::roadmap::State,
    stale: bool,
    pub(crate) pilot: pilot::Projection,
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
            editor.set_screenshots(vec![preview]);
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
            founders_language: founders::Language::default(),
            pilot: pilot::Projection::default(),
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
            email: None,
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
            triage: crate::testing::TriageEditor::new(cx),
            recovery,
            publication: None,
            roadmap_message: "No hay una publicación válida guardada".into(),
            roadmap_requested: false,
            roadmap_polled_at: None,
            manual_roadmap: crate::roadmap::State::load(),
            stale: true,
        };
        #[cfg(feature = "parity-capture")]
        if let Ok(scene) = std::env::var("VANTARE_CAPTURE_EMAIL") {
            remote.capture_email(&scene, cx);
            return remote;
        }
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
        self.email_tick(cx);
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
                calendar.complete_refresh(reply, cx);
                cx.notify();
            });
        }
    }
    pub(crate) fn calendar_busy(&self) -> bool {
        self.working()
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
        let pilot_request = pilot::is_command(&command);
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
                Command::PilotLoad | Command::PilotSave { .. } | Command::PilotSync => Area::Pilot,
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
            self.failed_pilot_dispatch(pilot_request);
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
            self.failed_pilot_dispatch(pilot_request);
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
    fn request_with_kind(
        &mut self,
        command: Command,
        kind: Option<Inflight>,
        cx: &mut Context<Self>,
    ) {
        let email_command = matches!(command, Command::AccountEmail { .. });
        self.prepare_account_command(&command, cx);
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
                if matches!(command, Command::AccountEmail { .. }) {
                    self.email_discarded(message, cx);
                }
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
            if email_command {
                let message = self.message.clone();
                self.email_discarded(&message, cx);
            }
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
            self.editor.set_screenshots(screenshots);
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
        // Una acción de email en vuelo deshabilita el formulario; un error de
        // transporte no debe dejarlo así hasta pulsar «Volver».
        let email_waiting = self.email.is_some() && self.inflight == Inflight::User;
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
        let roadmap_background = self.inflight == Inflight::Roadmap;
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
        if roadmap_background && let Reply::Error { message } = &reply {
            self.roadmap_message.clone_from(message);
            self.stale = true;
        }
        if background && failed && purchase_background {
            self.purchase_message = Some("No se pudo comprobar la compra. Reintentamos durante la espera; también puedes comprobar el acceso manualmente.".into());
        }
        if !background && matches!(self.active, Area::Calendar) {
            self.calendar_reply(reply.clone(), cx);
        }
        match reply {
            Reply::Pilot { state, message } => self.accept_pilot(state, message, next.as_ref()),
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
                } else if matches!(self.active, Area::Pilot) {
                    self.failed_pilot_reply(message);
                } else if matches!(self.active, Area::Report) {
                    self.editor.clear_approval(cx);
                    self.editor.error = failed;
                    self.editor.message = message;
                    self.editor.preview = None;
                } else {
                    if failed && email_waiting {
                        self.email_failed(&message, cx);
                    }
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
            Reply::Testing { data } => self.complete_participation(data),
            Reply::TriagePreview { preview } => self.complete_triage(preview),
            Reply::Roadmap {
                publication,
                stale,
                message,
                ..
            } => self.roadmap_reply(publication, stale, message),
            Reply::Email { .. } => self.email_reply(reply, cx),
            Reply::Account {
                signed_in,
                profile,
                pending,
                message,
                ..
            } => {
                if signed_in && !pending {
                    self.email = None;
                }
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
                        self.clear_participation(cx);
                    }
                    self.clear_pilot_if_session_changed(signed_in);
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
                    account::account_plan_label(self.navigation_access().verified)
                );
            }
            Reply::Closed => self.message = "Servicios cerrado".into(),
            Reply::Draft { draft, message } => self.report_draft(draft, message, cx),
            Reply::ReportPreview { preview } => {
                if self.report_revision == Some(self.editor.revision) {
                    self.editor.clear_approval(cx);
                    self.editor.error = false;
                    self.editor.set_screenshots(preview.screenshots.clone());
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
            || roadmap_background
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
pub(crate) mod purchase_tests;
#[cfg(test)]
#[path = "view/receipt_tests.rs"]
mod receipt_tests;
