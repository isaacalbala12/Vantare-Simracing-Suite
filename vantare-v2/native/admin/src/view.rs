use crate::{
    client::{Action, Module, Status},
    session::{Command, Reply, Worker},
    state::{Screen, State},
};
use gpui::{
    App, Context, Div, Entity, Image, ImageFormat, ImageSource, IntoElement, ParentElement, Render,
    Stateful, Styled, Window, div, img, prelude::*, px, rgb,
};
use std::{
    sync::Arc,
    time::{Duration, Instant},
};
use vantare_hub::orbit::{self, Input};
use vantare_services::Error;

#[derive(Clone)]
enum Event {
    Screen(Screen),
    Search,
    Filter(Option<Status>),
    Next,
    NextUsers,
    SelectUser(usize),
    SelectReport(usize),
    Propose(Action),
    Confirm,
    Cancel,
    Login,
    Logout,
    Reload,
    CloseImage,
}
pub struct Admin {
    state: State,
    search: Entity<Input>,
    worker: Option<Worker>,
    images: Vec<Arc<Image>>,
    image_error: Option<Error>,
    zoomed: Option<usize>,
    request_started: Option<Instant>,
    render_pending: Option<Instant>,
    cache: crate::cache::ReadCache,
    prefetch_pending: bool,
    search_due: bool,
    last_query: String,
    search_subscription: Option<gpui::Subscription>,
    debounce: Option<gpui::Task<()>>,
    displayed_read: Option<Action>,
}
impl Admin {
    pub fn new(demo: bool, screen: Screen, cx: &mut Context<Self>) -> Self {
        let mut this = Self {
            state: State::new(demo, screen),
            search: cx.new(|cx| Input::new(String::new(), "Buscar por correo o nombre", cx)),
            worker: None,
            images: vec![],
            image_error: None,
            zoomed: None,
            request_started: None,
            render_pending: None,
            cache: crate::cache::ReadCache::default(),
            prefetch_pending: false,
            search_due: false,
            last_query: String::new(),
            search_subscription: None,
            debounce: None,
            displayed_read: None,
        };
        if demo {
            this.demo_images();
        } else {
            match vantare_services::app::default_root().and_then(Worker::start) {
                Ok(worker) => {
                    this.worker = Some(worker);
                    this.send(Command::Restore);
                }
                Err(error) => this.state.failed(error),
            }
        }
        if this.state.busy {
            Self::poll_replies(cx);
        }
        this.search_subscription = Some(cx.observe(&this.search, |this, input, cx| {
            let query = input.read(cx).value.trim().to_owned();
            if query == this.last_query || this.state.demo || !this.state.signed_in {
                return;
            }
            this.last_query = query;
            cx.notify();
            this.debounce = Some(cx.spawn(async move |entity, cx| {
                cx.background_executor()
                    .timer(Duration::from_millis(300))
                    .await;
                let _ = entity.update(cx, |this, cx| {
                    this.search_due = true;
                    if !this.state.busy && this.state.screen == Screen::Users {
                        this.search_due = false;
                        this.event(Event::Search, cx);
                    }
                });
            }));
        }));
        this
    }
    fn poll_replies(cx: &mut Context<Self>) {
        cx.spawn(async move |entity, cx| {
            loop {
                cx.background_executor()
                    .timer(Duration::from_millis(100))
                    .await;
                if !matches!(
                    entity.update(cx, |this, cx| {
                        this.poll(cx);
                        this.state.busy || this.prefetch_pending
                    }),
                    Ok(true)
                ) {
                    break;
                }
            }
        })
        .detach();
    }
    fn demo_images(&mut self) {
        self.images.clear();
        self.image_error = None;
        self.zoomed = None;
        if self
            .state
            .report
            .as_ref()
            .is_some_and(|r| r.has_screenshots)
        {
            self.images.push(Arc::new(Image::from_bytes(
                ImageFormat::Png,
                include_bytes!("../fixtures/demo-report.png").to_vec(),
            )));
        }
    }
    fn send(&mut self, command: Command) {
        if let Command::Call(action) = &command {
            self.displayed_read = if action.mutation() {
                None
            } else {
                Some(action.clone())
            };
        }
        self.request_started = Some(Instant::now());
        self.state.busy = true;
        self.state.message = match &command {
            Command::Call(Action::SearchAccounts { .. }) => "Buscando cuentas…",
            Command::Call(Action::GetAccount { .. }) => "Cargando usuario…",
            Command::Call(Action::GetRollout) => "Cargando módulos…",
            Command::Call(Action::ListReports { .. }) => "Cargando reportes…",
            Command::Call(Action::GetReport { .. }) => "Cargando reporte y capturas…",
            _ => "Operación en curso…",
        }
        .into();
        if self
            .worker
            .as_ref()
            .is_none_or(|w| w.send.send(command).is_err())
        {
            self.state.failed(Error::Offline);
        }
    }
    fn reports_action(&self, cursor: Option<String>) -> Action {
        Action::ListReports {
            status: self.state.filter,
            limit: 100,
            cursor,
        }
    }
    fn load(&mut self, cx: &Context<Self>) {
        let query = self.search.read(cx).value.trim().to_owned();
        let action = match self.state.screen {
            Screen::Users => Action::SearchAccounts {
                query,
                limit: 50,
                cursor: None,
            },
            Screen::Rollout => Action::GetRollout,
            Screen::Reports => self.reports_action(None),
        };
        self.read(action);
    }
    fn read(&mut self, action: Action) {
        self.displayed_read = Some(action.clone());
        if let Some(value) = self.cache.get(&action, Instant::now()) {
            self.render_pending = Some(Instant::now());
            if let Err(error) = self.state.accept(&action, &value) {
                self.state.failed(error);
            } else {
                self.state.message =
                    "Datos guardados hace menos de 30 s · Actualizar consulta el servidor".into();
            }
            self.prefetch_read(action);
        } else {
            self.send(Command::Call(action));
        }
    }
    fn prefetch(&mut self) {
        let action = match self.state.screen {
            Screen::Users | Screen::Reports => Action::GetRollout,
            Screen::Rollout => self.reports_action(None),
        };
        if self.cache.get(&action, Instant::now()).is_none() {
            self.prefetch_read(action);
        }
    }
    fn prefetch_read(&mut self, action: Action) {
        if !self.prefetch_pending
            && let Some(worker) = &self.worker
        {
            self.prefetch_pending = worker.send.send(Command::Prefetch(action)).is_ok();
        }
    }
    fn poll(&mut self, cx: &mut Context<Self>) {
        let reply = self.worker.as_ref().and_then(|w| w.receive.try_recv().ok());
        let Some(reply) = reply else {
            return;
        };
        if !matches!(reply, Reply::Prefetched(..)) {
            self.render_pending = self.request_started.take();
            self.state.busy = false;
        }
        match reply {
            Reply::Ready => {
                self.state.signed_in = true;
                self.load(cx);
                self.prefetch();
            }
            Reply::LoggedOut => {
                self.cache.clear();
                self.state.clear_private();
                self.images.clear();
                self.state.message = "Inicia sesión con la cuenta owner".into();
            }
            Reply::OpenBrowser(url) => {
                cx.open_url(&url);
                self.state.busy = true;
                self.state.message = "Esperando inicio de sesión en el navegador…".into();
            }
            Reply::Failed(error) => {
                self.cache.clear();
                self.state.failed(error);
                if !self.state.signed_in {
                    self.images.clear();
                }
            }
            Reply::Prefetched(action, result) => {
                self.accept_prefetch(action, result);
            }
            Reply::Data(..) if !self.state.signed_in => {}
            Reply::Data(action, value, images) => match self.state.accept(&action, &value) {
                Ok(Some(reload)) => {
                    self.cache.clear();
                    self.state.message = "Cambio aceptado; releyendo datos…".into();
                    self.send(Command::Call(reload));
                }
                Ok(None) => {
                    self.cache
                        .put(action.clone(), value.clone(), Instant::now());
                    if matches!(action, Action::SearchAccounts { .. }) {
                        for user in &self.state.users {
                            self.cache.put(
                                Action::GetAccount {
                                    account_id: user.account_id.clone(),
                                },
                                serde_json::json!({"account":user}),
                                Instant::now(),
                            );
                        }
                    }
                    if matches!(action, Action::GetReport { .. }) {
                        self.zoomed = None;
                        self.image_error = None;
                        self.images = images
                            .into_iter()
                            .filter_map(|result| {
                                let bytes = match result {
                                    Ok(bytes) => bytes,
                                    Err(error) => {
                                        self.image_error = Some(error);
                                        return None;
                                    }
                                };
                                let format = if bytes.starts_with(b"\x89PNG") {
                                    ImageFormat::Png
                                } else {
                                    ImageFormat::Jpeg
                                };
                                Some(Arc::new(Image::from_bytes(format, bytes)))
                            })
                            .collect();
                    }
                }
                Err(error) => self.state.failed(error),
            },
        }
        if self.search_due
            && self.state.signed_in
            && !self.state.busy
            && self.state.screen == Screen::Users
        {
            self.search_due = false;
            self.load(cx);
        }
        cx.notify();
    }
    fn accept_prefetch(&mut self, action: Action, result: Result<serde_json::Value, Error>) {
        self.prefetch_pending = false;
        if !self.state.signed_in {
            return;
        }
        match result {
            Ok(value) => {
                let mut validation = State::new(false, self.state.screen);
                if validation.accept(&action, &value).is_ok() {
                    if !self.state.busy
                        && self.state.signed_in
                        && self.displayed_read.as_ref() == Some(&action)
                        && let Err(error) = self.state.accept(&action, &value)
                    {
                        self.state.failed(error);
                    }
                    self.cache.put(action, value, Instant::now());
                    self.prefetch();
                }
            }
            Err(error @ (Error::Authentication | Error::Denied | Error::Expired)) => {
                let awaiting_command = self.state.busy;
                self.cache.clear();
                self.images.clear();
                self.state.failed(error);
                // Drain the active command's reply too; otherwise a late failure
                // could be mistaken for the next login/command's response.
                self.state.busy = awaiting_command;
            }
            Err(_) => {}
        }
    }
    fn select_user(&mut self, index: usize) {
        if let Some(user) = self.state.users.get(index).cloned() {
            if self.state.demo {
                self.state.user = Some(user);
            } else {
                self.state.user = None;
                self.read(Action::GetAccount {
                    account_id: user.account_id,
                });
            }
        }
    }
    fn select_report(&mut self, index: usize) {
        if let Some(report) = self.state.reports.get(index).cloned() {
            self.images.clear();
            if self.state.demo {
                self.state.report = Some(report);
                self.demo_images();
            } else {
                self.state.report = None;
                self.send(Command::Call(Action::GetReport {
                    report_id: report.report_id,
                }));
            }
        }
    }
    fn event(&mut self, event: Event, cx: &mut Context<Self>) {
        let was_polling = self.state.busy || self.prefetch_pending;
        if self.state.busy && !matches!(event, Event::Cancel | Event::CloseImage) {
            return;
        }
        if self.state.confirmation.is_some()
            && !matches!(event, Event::Cancel | Event::Confirm | Event::CloseImage)
        {
            return;
        }
        match event {
            Event::Screen(screen) => {
                self.zoomed = None;
                self.state.screen = screen;
                if self.state.signed_in && !self.state.demo {
                    self.images.clear();
                    self.load(cx);
                    self.prefetch();
                }
            }
            Event::Search => {
                self.search_due = false;
                self.debounce = None;
                if !self.state.demo {
                    self.load(cx);
                }
            }
            Event::Filter(status) => {
                self.state.filter = status;
                if !self.state.demo {
                    self.images.clear();
                    self.send(Command::Call(self.reports_action(None)));
                }
            }
            Event::Next => {
                if !self.state.demo {
                    self.images.clear();
                    self.send(Command::Call(
                        self.reports_action(self.state.cursor.clone()),
                    ));
                }
            }
            Event::NextUsers => {
                if !self.state.demo && self.search.read(cx).value.trim().is_empty() {
                    self.read(Action::SearchAccounts {
                        query: String::new(),
                        limit: 50,
                        cursor: self.state.users_cursor.clone(),
                    });
                }
            }
            Event::SelectUser(index) => {
                self.select_user(index);
            }
            Event::SelectReport(index) => {
                self.select_report(index);
            }
            Event::Propose(action) => {
                if let Err(error) = self.state.propose(action) {
                    self.state.failed(error);
                }
            }
            Event::Confirm => match self.state.confirm() {
                Ok(action) if self.state.demo => self.state.demo_action(&action),
                Ok(action) => {
                    self.cache.clear();
                    self.send(Command::Call(action));
                }
                Err(error) => self.state.failed(error),
            },
            Event::Cancel => self.state.confirmation = None,
            Event::Login => {
                if !self.state.demo {
                    self.send(Command::Login);
                }
            }
            Event::Logout => {
                self.cache.clear();
                if !self.state.demo {
                    self.state.clear_private();
                    self.images.clear();
                    self.send(Command::Logout);
                }
            }
            Event::Reload => {
                self.cache.clear();
                if !self.state.demo {
                    self.images.clear();
                    self.state.user = None;
                    self.state.report = None;
                    self.load(cx);
                    self.prefetch();
                }
            }
            Event::CloseImage => self.zoomed = None,
        }
        if !was_polling && (self.state.busy || self.prefetch_pending) {
            Self::poll_replies(cx);
        }
        cx.notify();
    }
    fn button(
        &self,
        id: &'static str,
        label: &str,
        event: Event,
        cx: &mut Context<Self>,
    ) -> Stateful<Div> {
        let key_event = event.clone();
        orbit::button(id, label, cx)
            .when(self.state.busy, |b| b.opacity(0.45))
            .on_click(cx.listener(move |this, _, _, cx| this.event(event.clone(), cx)))
            .on_key_down(cx.listener(move |this, key: &gpui::KeyDownEvent, _, cx| {
                if matches!(key.keystroke.key.as_str(), "enter" | "space") {
                    this.event(key_event.clone(), cx);
                    cx.stop_propagation();
                }
            }))
    }
    fn confirmation_panel(&self, action: &Action, cx: &mut Context<Self>) -> Div {
        let description = confirmation(action);
        panel(cx)
            .gap(px(12.0))
            .border_color(rgb(orbit::coral(cx)))
            .child(heading("Confirmar cambio", cx))
            .child(description)
            .child(
                div()
                    .flex()
                    .gap(px(10.0))
                    .child(self.button("confirm", "Confirmar y guardar", Event::Confirm, cx))
                    .child(self.button("cancel", "Cancelar", Event::Cancel, cx)),
            )
    }
    fn record_render(&mut self, started: Instant, window: &Window) {
        if let Some(worker) = &self.worker {
            if let Some(request) = self.render_pending.take() {
                // Timings go to the services thread; no file I/O during render.
                let _ = worker.send.send(Command::Timing(
                    "request_to_render",
                    request.elapsed().as_micros(),
                ));
            }
            if crate::diagnostics::render_enabled() {
                let _ = worker.send.send(Command::Timing(
                    "render_tree",
                    started.elapsed().as_micros(),
                ));
                let send = worker.send.clone();
                window.on_next_frame(move |_, _| {
                    let _ = send.send(Command::Timing(
                        "render_to_frame",
                        started.elapsed().as_micros(),
                    ));
                });
            }
        }
    }
    fn frame_timing(&self, label: &'static str, window: &Window) {
        if crate::diagnostics::render_enabled()
            && let Some(worker) = &self.worker
        {
            let started = Instant::now();
            let send = worker.send.clone();
            window.on_next_frame(move |_, _| {
                let _ = send.send(Command::Timing(label, started.elapsed().as_micros()));
            });
        }
    }
    fn switch(
        &self,
        id: &'static str,
        label: &str,
        on: bool,
        action: Action,
        cx: &mut Context<Self>,
    ) -> Div {
        let key_action = action.clone();
        div()
            .flex()
            .items_center()
            .justify_between()
            .py(px(12.0))
            .border_b_1()
            .border_color(rgb(orbit::surface_3(cx)))
            .child(label.to_owned())
            .child(
                orbit::toggle(id, label, on, !self.state.busy, cx)
                    .on_click(cx.listener(move |this, _, _, cx| {
                        this.event(Event::Propose(action.clone()), cx);
                    }))
                    .on_key_down(cx.listener(move |this, key: &gpui::KeyDownEvent, _, cx| {
                        if matches!(key.keystroke.key.as_str(), "enter" | "space") {
                            this.event(Event::Propose(key_action.clone()), cx);
                            cx.stop_propagation();
                        }
                    })),
            )
    }
    fn user_row(
        &self,
        index: usize,
        user: &crate::client::User,
        cx: &mut Context<Self>,
    ) -> gpui::Stateful<Div> {
        div()
            .id(("user", index))
            .flex()
            .items_center()
            .gap(px(12.0))
            .py(px(12.0))
            .border_b_1()
            .border_color(rgb(orbit::surface_3(cx)))
            .child(
                div()
                    .w(px(220.0))
                    .flex_shrink_0()
                    .flex()
                    .flex_col()
                    .gap(px(4.0))
                    .child(
                        self.button(
                            "user-select",
                            user.name
                                .as_deref()
                                .or(user.email.as_deref())
                                .unwrap_or("Sin nombre"),
                            Event::SelectUser(index),
                            cx,
                        )
                        .id(("select-user", index)),
                    )
                    .child(muted(
                        user.email.as_deref().unwrap_or("Sin correo disponible"),
                        cx,
                    )),
            )
            .child(
                div()
                    .w(px(70.0))
                    .flex_shrink_0()
                    .child(if user.roles.is_empty() {
                        "sin rol".into()
                    } else {
                        user.roles.join(", ")
                    }),
            )
            .child(
                div()
                    .w(px(125.0))
                    .flex_shrink_0()
                    .child(if user.modules.is_empty() {
                        "sin módulos".into()
                    } else {
                        user.modules
                            .iter()
                            .map(|m| m.label())
                            .collect::<Vec<_>>()
                            .join(", ")
                    }),
            )
            .child(
                div()
                    .w(px(65.0))
                    .flex_shrink_0()
                    .child(user.reports_count.to_string()),
            )
            .child(div().w(px(145.0)).flex_shrink_0().child(
                user.last_seen_at.as_deref().map_or_else(
                    || "Sin datos".into(),
                    |date| date.chars().take(16).collect::<String>().replace('T', " "),
                ),
            ))
    }
    fn users(&self, cx: &mut Context<Self>) -> Div {
        let query = self.search.read(cx).value.trim().to_lowercase();
        let mut visible = 0;
        let mut rows = div().flex().flex_col().min_w(px(700.0)).gap(px(8.0)).child(
            div()
                .flex()
                .gap(px(12.0))
                .child(div().w(px(220.0)).child(muted("NOMBRE / CORREO", cx)))
                .child(div().w(px(70.0)).child(muted("ROL", cx)))
                .child(div().w(px(125.0)).child(muted("MÓDULOS", cx)))
                .child(div().w(px(65.0)).child(muted("REPORTES", cx)))
                .child(div().w(px(145.0)).child(muted("ÚLTIMA VISITA", cx))),
        );
        for (index, user) in self.state.users.iter().enumerate() {
            if !format!(
                "{} {}",
                user.email.as_deref().unwrap_or(""),
                user.name.as_deref().unwrap_or("")
            )
            .to_lowercase()
            .contains(&query)
            {
                continue;
            }
            visible += 1;
            rows = rows.child(self.user_row(index, user, cx));
        }
        if visible == 0 {
            rows = rows.child(muted(
                if query.is_empty() && self.state.busy {
                    "Cargando la lista de cuentas…"
                } else if query.is_empty() {
                    "No hay cuentas registradas en esta instancia."
                } else {
                    "Sin cuentas que coincidan con el filtro."
                },
                cx,
            ));
        }
        let mut list = panel(cx)
            .flex_1()
            .min_w_0()
            .gap(px(12.0))
            .child(
                div()
                    .flex()
                    .gap(px(10.0))
                    .child(div().flex_1().child(self.search.clone()))
                    .child(self.button("search", "Buscar", Event::Search, cx)),
            )
            .child(muted(
                "Cuentas Vantare · alta más reciente primero · filtro por correo o nombre",
                cx,
            ))
            .child(div().id("accounts-table").overflow_x_scroll().child(rows));
        if self.state.users_cursor.is_some() && query.trim().is_empty() {
            list = list.child(self.button("next-users", "Siguiente página", Event::NextUsers, cx));
        }
        div().flex().gap(px(20.0)).child(list).child(
            div()
                .w(px(320.0))
                .flex_shrink_0()
                .child(self.user_detail(cx)),
        )
    }
    fn user_detail(&self, cx: &mut Context<Self>) -> Div {
        let mut detail = panel(cx)
            .flex_1()
            .gap(px(8.0))
            .child(heading("Detalle de usuario", cx));
        if let Some(user) = &self.state.user {
            detail = detail
                .child(
                    user.name
                        .clone()
                        .unwrap_or_else(|| "Sin nombre disponible".into()),
                )
                .child(muted(
                    user.email.as_deref().unwrap_or("Sin correo disponible"),
                    cx,
                ))
                .child(muted(&format!("Alta: {}", user.created_at), cx))
                .child(muted(
                    &format!(
                        "Última visita: {}",
                        user.last_seen_at.as_deref().unwrap_or("sin datos")
                    ),
                    cx,
                ))
                .child(self.switch(
                    "tester",
                    "Tester · permite enviar reportes",
                    user.roles.iter().any(|r| r == "tester"),
                    Action::SetTester {
                        account_id: user.account_id.clone(),
                        enabled: !user.roles.iter().any(|r| r == "tester"),
                    },
                    cx,
                ))
                .child(muted("El rol owner no se modifica desde esta app.", cx));
            for (index, module) in Module::ALL.into_iter().enumerate() {
                let label = muted(
                    &format!(
                        "{} · acceso {}",
                        module.label(),
                        if user.modules.contains(&module) {
                            "activo"
                        } else {
                            "inactivo"
                        }
                    ),
                    cx,
                );
                let mut buttons = div().flex().items_center().gap(px(8.0));
                for (enabled, label) in [(true, "Conceder"), (false, "Revocar")] {
                    buttons = buttons.child(
                        self.button(
                            "module-grant",
                            label,
                            Event::Propose(Action::SetModule {
                                account_id: user.account_id.clone(),
                                module,
                                enabled,
                            }),
                            cx,
                        )
                        .id(("module-grant", index * 2 + usize::from(enabled))),
                    );
                }
                detail = detail.child(
                    div()
                        .flex()
                        .flex_col()
                        .gap(px(4.0))
                        .child(label)
                        .child(buttons),
                );
            }
            detail = detail.child(muted(
                "Conceder/revocar cambia solo la concesión individual. El acceso también puede venir del rol, licencia o rollout global.",
                cx,
            ));
        } else {
            detail = detail.child(muted(
                "Selecciona un usuario para consultar sus permisos.",
                cx,
            ));
        }
        detail
    }
    fn rollout(&self, cx: &mut Context<Self>) -> Div {
        let mut card = panel(cx).w_full().gap(px(12.0)).child(heading("Módulos para todos", cx))
            .child(div().p(px(16.0)).rounded(px(8.0)).bg(rgb(orbit::surface_3(cx))).child("AVISO · afecta a todos los usuarios"))
            .child(muted("Activar un módulo da acceso global. Desactivarlo conserva las concesiones individuales.", cx));
        for row in &self.state.rollout {
            card = card.child(self.switch(
                row.module.key(),
                row.module.label(),
                row.enabled_for_all,
                Action::SetRollout {
                    module: row.module,
                    enabled_for_all: !row.enabled_for_all,
                },
                cx,
            ));
        }
        card.child(muted(
            "Cada cambio requiere confirmación. El servidor registra al actor y el antes/después.",
            cx,
        ))
    }
    fn reports(&self, cx: &mut Context<Self>) -> Div {
        let mut filters = div().flex().flex_wrap().gap(px(6.0)).child(self.button(
            "all-status",
            "Todos",
            Event::Filter(None),
            cx,
        ));
        for (index, status) in Status::ALL.into_iter().enumerate() {
            filters = filters.child(
                self.button("filter", status.label(), Event::Filter(Some(status)), cx)
                    .id(("filter", index))
                    .when(self.state.filter == Some(status), |b| {
                        b.border_color(rgb(orbit::coral(cx)))
                    }),
            );
        }
        let mut list = panel(cx).w(px(430.0)).gap(px(12.0)).child(filters);
        for (index, report) in self.state.visible_reports() {
            list = list.child(
                div()
                    .p(px(12.0))
                    .rounded(px(8.0))
                    .bg(rgb(orbit::surface_2(cx)))
                    .child(
                        self.button(
                            "report-select",
                            &format!("{} · {}", report.module, report.status.label()),
                            Event::SelectReport(index),
                            cx,
                        )
                        .id(("report-select", index)),
                    )
                    .child(muted(&report.author, cx))
                    .child(muted(
                        &format!(
                            "{} · {}",
                            report.created_at,
                            if report.has_screenshots {
                                "con capturas"
                            } else {
                                "sin capturas"
                            }
                        ),
                        cx,
                    )),
            );
        }
        if self.state.visible_reports().next().is_none() {
            list = list.child(muted("Sin reportes en este estado.", cx));
        }
        if self.state.cursor.is_some() {
            list = list.child(self.button("next", "Página siguiente", Event::Next, cx));
        }
        div()
            .flex()
            .gap(px(20.0))
            .child(list)
            .child(self.report_detail(cx))
    }
    fn report_detail(&self, cx: &mut Context<Self>) -> Div {
        let mut detail = panel(cx)
            .flex_1()
            .gap(px(8.0))
            .child(heading("Detalle del reporte", cx));
        if let Some(report) = &self.state.report {
            detail = detail
                .child(muted(
                    &format!(
                        "{} · {} · {}",
                        report.author, report.module, report.app_version
                    ),
                    cx,
                ))
                .child(muted(
                    &format!("{} · {}", report.created_at, report.status.label()),
                    cx,
                ))
                .child(
                    div()
                        .p(px(14.0))
                        .rounded(px(8.0))
                        .bg(rgb(orbit::surface_2(cx)))
                        .child(report.text.clone()),
                );
            let mut statuses = div().flex().flex_wrap().gap(px(6.0));
            for (index, status) in Status::ALL.into_iter().enumerate() {
                statuses = statuses.child(
                    self.button(
                        "set-status",
                        status.label(),
                        Event::Propose(Action::SetReportStatus {
                            report_id: report.report_id.clone(),
                            status,
                        }),
                        cx,
                    )
                    .id(("set-status", index)),
                );
            }
            detail = detail
                .child(muted("CAMBIAR ESTADO (requiere confirmación)", cx))
                .child(statuses)
                .child(muted(
                    "CAPTURAS · URL firmada, solo en memoria · pulsa para ampliar",
                    cx,
                ));
            for (index, image) in self.images.iter().enumerate() {
                detail = detail.child(
                    div()
                        .id(("image", index))
                        .w_full()
                        .h(px(190.0))
                        .flex()
                        .justify_center()
                        .overflow_hidden()
                        .role(gpui::Role::Button)
                        .aria_label("Ampliar captura")
                        .tab_index(0)
                        .cursor_pointer()
                        .child(
                            img(ImageSource::Image(image.clone()))
                                .h(px(190.0))
                                .max_w_full()
                                .object_fit(gpui::ObjectFit::Contain),
                        )
                        .on_click(cx.listener(move |this, _, _, cx| {
                            this.zoomed = Some(index);
                            cx.notify();
                        }))
                        .on_key_down(cx.listener(move |this, key: &gpui::KeyDownEvent, _, cx| {
                            if matches!(key.keystroke.key.as_str(), "enter" | "space") {
                                this.zoomed = Some(index);
                                cx.notify();
                                cx.stop_propagation();
                            }
                        })),
                );
            }
            if let Some(error) = self.image_error {
                detail = detail.child(muted(&format!("Captura no disponible: {error}. Selecciona el reporte otra vez para renovar sus URLs."), cx));
            } else if self.images.is_empty() {
                detail = detail.child(muted(
                    if report.has_screenshots {
                        "Capturas no disponibles. Vuelve a consultar el reporte."
                    } else {
                        "Sin capturas adjuntas."
                    },
                    cx,
                ));
            }
        } else {
            detail = detail.child(muted(
                "Selecciona un reporte para ver su texto y capturas.",
                cx,
            ));
        }
        detail
    }
    fn navigation(&self, cx: &mut Context<Self>) -> Div {
        let mut tabs = div().flex().gap(px(10.0));
        for screen in Screen::ALL {
            tabs = tabs.child(
                self.button(screen.label(), screen.label(), Event::Screen(screen), cx)
                    .when(screen == self.state.screen, |b| {
                        b.border_color(rgb(orbit::coral(cx)))
                    }),
            );
        }
        tabs
    }
    fn image_viewer(&self, image: Arc<Image>, cx: &mut Context<Self>) -> Div {
        div()
            .absolute()
            .inset_0()
            .size_full()
            .p(px(24.0))
            .bg(rgb(orbit::canvas(cx)))
            .flex()
            .flex_col()
            .gap(px(16.0))
            .child(
                div()
                    .flex()
                    .justify_between()
                    .items_center()
                    .child(heading("Captura del reporte", cx))
                    .child(self.button("close-image", "Volver al reporte", Event::CloseImage, cx)),
            )
            .child(
                div().flex_1().min_h_0().child(
                    img(ImageSource::Image(image))
                        .size_full()
                        .object_fit(gpui::ObjectFit::Contain),
                ),
            )
    }
}
impl Render for Admin {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let started = Instant::now();
        let body = if self.state.signed_in {
            match self.state.screen {
                Screen::Users => self.users(cx),
                Screen::Rollout => self.rollout(cx),
                Screen::Reports => self.reports(cx),
            }
        } else {
            panel(cx).gap(px(14.0)).child(heading("Administración privada · solo owner", cx)).child("Inicia sesión con tu cuenta Vantare. El servidor comprueba el rol owner en cada acción.").child(self.button("login", "Iniciar sesión en el navegador", Event::Login, cx))
        };
        let mut root = div()
            .relative()
            .on_mouse_move(
                cx.listener(|this, _, window, _| this.frame_timing("hover_to_frame", window)),
            )
            .on_scroll_wheel(
                cx.listener(|this, _, window, _| this.frame_timing("scroll_to_frame", window)),
            )
            .size_full()
            .flex()
            .flex_col()
            .gap(px(18.0))
            .p(px(28.0))
            .bg(rgb(orbit::canvas(cx)))
            .text_color(rgb(orbit::ink(cx)))
            .font_family("Inter W400")
            .text_size(px(14.0))
            .child(
                div()
                    .flex()
                    .justify_between()
                    .items_center()
                    .child(heading("Vantare Admin", cx))
                    .child(muted(
                        if self.state.demo {
                            "DEMO · DATOS FALSOS · SIN RED"
                        } else {
                            "BETA · ADMINISTRACIÓN OWNER"
                        },
                        cx,
                    )),
            )
            .child(
                div()
                    .flex()
                    .justify_between()
                    .child(self.navigation(cx))
                    .when(self.state.signed_in && !self.state.demo, |d| {
                        d.child(
                            div()
                                .flex()
                                .gap(px(10.0))
                                .child(self.button("reload", "Actualizar", Event::Reload, cx))
                                .child(self.button("logout", "Cerrar sesión", Event::Logout, cx)),
                        )
                    }),
            )
            .child(
                div()
                    .p(px(10.0))
                    .rounded(px(8.0))
                    .bg(rgb(orbit::surface_2(cx)))
                    .child(if self.state.busy {
                        format!("{} · operación en curso…", self.state.message)
                    } else {
                        self.state.message.clone()
                    }),
            )
            .child(
                div()
                    .id("content")
                    .flex_1()
                    .min_h_0()
                    .overflow_y_scroll()
                    .child(body),
            );
        if let Some(action) = &self.state.confirmation {
            root = root.child(self.confirmation_panel(action, cx));
        }
        if let Some(image) = self.zoomed.and_then(|index| self.images.get(index)) {
            root = root.child(self.image_viewer(image.clone(), cx));
        }
        self.record_render(started, window);
        root
    }
}
fn panel(cx: &App) -> Div {
    div()
        .flex()
        .flex_col()
        .p(px(20.0))
        .rounded(px(14.0))
        .border_1()
        .border_color(rgb(orbit::surface_3(cx)))
        .bg(rgb(orbit::surface_1(cx)))
}
fn heading(text: &str, cx: &App) -> Div {
    div()
        .text_size(px(22.0))
        .text_color(rgb(orbit::ink(cx)))
        .font_weight(gpui::FontWeight::BOLD)
        .child(text.to_owned())
}
fn muted(text: &str, cx: &App) -> Div {
    div()
        .text_size(px(12.0))
        .text_color(rgb(orbit::ink_3(cx)))
        .child(text.to_owned())
}
fn confirmation(action: &Action) -> String {
    match action {
        Action::SetTester {
            account_id,
            enabled,
        } => format!(
            "{} rol Tester a {account_id}. Esto cambia el permiso de enviar reportes.",
            if *enabled { "Conceder" } else { "Revocar" }
        ),
        Action::SetModule {
            account_id,
            module,
            enabled,
        } => format!(
            "{} concesión individual de {} para {account_id}. Revocarla no retira el acceso que venga de un rol, licencia o rollout global.",
            if *enabled { "Conceder" } else { "Revocar" },
            module.label()
        ),
        Action::SetRollout {
            module,
            enabled_for_all,
        } => format!(
            "{} {}: AFECTA A TODOS LOS USUARIOS.",
            if *enabled_for_all {
                "Activar"
            } else {
                "Desactivar"
            },
            module.label()
        ),
        Action::SetReportStatus { report_id, status } => {
            format!("Cambiar {report_id} a {}.", status.label())
        }
        _ => "Acción inválida".into(),
    }
}
