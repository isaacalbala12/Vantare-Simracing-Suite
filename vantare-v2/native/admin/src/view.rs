mod creators;
mod layout;
mod people;
mod reports;
use crate::{
    client::{Action, Module, Plan, Status},
    session::{Command, Reply, Worker},
    state::{Screen, State},
};
use gpui::{
    Context, Div, Entity, Image, ImageFormat, ImageSource, IntoElement, ParentElement, Render,
    Stateful, Styled, Window, div, img, prelude::*, px, rgb,
};
use std::{
    sync::Arc,
    time::{Duration, Instant},
};
use vantare_hub::orbit::{self, Input};
use vantare_services::Error;

#[derive(Clone, Copy)]
enum Dialog {
    Block(bool),
    Delete,
    Creator,
    Payout,
    Report(Status),
}
#[derive(Clone)]
enum Event {
    Screen(Screen),
    Search,
    Filter(Option<Status>),
    Next,
    NextUsers,
    SelectUser(usize),
    SelectReport(usize),
    SelectCreator(usize),
    Back,
    AccountFilter(&'static str),
    OpenDialog(Dialog),
    DemoState(&'static str),
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
    dialog: Option<Dialog>,
    form_a: Entity<Input>,
    form_b: Entity<Input>,
    form_c: Entity<Input>,
    account_filter: &'static str,
    demo_state: &'static str,
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
    form_subscriptions: Vec<gpui::Subscription>,
    debounce: Option<gpui::Task<()>>,
    displayed_read: Option<Action>,
}
impl Admin {
    pub fn new(demo: bool, screen: Screen, cx: &mut Context<Self>) -> Self {
        let mut this = Self {
            state: State::new(demo, screen),
            dialog: None,
            account_filter: "all",
            demo_state: "normal",
            form_a: cx.new(|cx| Input::new(String::new(), "Nombre", cx).with_height(px(44.))),
            form_b: cx.new(|cx| Input::new(String::new(), "Correo", cx).with_height(px(44.))),
            form_c: cx.new(|cx| Input::new(String::new(), "Código", cx).with_height(px(44.))),
            search: cx.new(|cx| {
                Input::new(String::new(), "Buscar por correo o nombre", cx).with_height(px(46.))
            }),
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
            form_subscriptions: vec![],
            debounce: None,
            displayed_read: None,
        };
        if demo {
            this.state.user = None;
            this.state.report = None;
            this.demo_images();
        } else {
            match crate::session::data_root().and_then(Worker::start) {
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
        this.watch_forms(cx);
        this
    }
    fn watch_forms(&mut self, cx: &mut Context<Self>) {
        for input in [&self.form_a, &self.form_b, &self.form_c] {
            self.form_subscriptions
                .push(cx.observe(input, |this, _, cx| {
                    if this.dialog.is_some() {
                        if this.state.message.starts_with("Revisa")
                            || this.state.message.starts_with("Escribe")
                        {
                            this.state.message.clear();
                        }
                        cx.notify();
                    }
                }));
        }
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
            Screen::Creators => Action::ListCreators,
            Screen::Login => return,
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
            Screen::Users | Screen::Reports | Screen::Creators => Action::GetRollout,
            Screen::Login => return,
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
        if self.state.busy
            && !matches!(
                event,
                Event::Cancel | Event::CloseImage | Event::DemoState(_)
            )
        {
            return;
        }
        if (self.state.confirmation.is_some() || self.dialog.is_some())
            && !matches!(event, Event::Cancel | Event::Confirm | Event::CloseImage)
        {
            return;
        }
        match event {
            event @ (Event::Back
            | Event::AccountFilter(_)
            | Event::DemoState(_)
            | Event::SelectCreator(_)
            | Event::OpenDialog(_)
            | Event::Screen(_)) => self.interface_event(&event, cx),
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
            Event::Confirm => self.confirm_change(cx),
            Event::Cancel => {
                self.state.confirmation = None;
                self.dialog = None;
            }
            Event::Login => {
                if self.state.demo {
                    self.state.signed_in = true;
                    self.state.screen = Screen::Users;
                } else {
                    self.send(Command::Login);
                }
            }
            Event::Logout => {
                self.cache.clear();
                if self.state.demo {
                    self.state.signed_in = false;
                } else {
                    self.state.clear_private();
                    self.images.clear();
                    self.send(Command::Logout);
                }
            }
            Event::Reload => self.reload(cx),
            Event::CloseImage => self.zoomed = None,
        }
        if !was_polling && (self.state.busy || self.prefetch_pending) {
            Self::poll_replies(cx);
        }
        cx.notify();
    }
    fn reload(&mut self, cx: &Context<Self>) {
        self.demo_state = "normal";
        self.cache.clear();
        if !self.state.demo {
            self.images.clear();
            self.state.user = None;
            self.state.report = None;
            self.load(cx);
            self.prefetch();
        }
    }
    fn interface_event(&mut self, event: &Event, cx: &mut Context<Self>) {
        match *event {
            Event::Back => {
                self.state.user = None;
                self.state.creator = None;
                self.state.report = None;
            }
            Event::AccountFilter(filter) => self.account_filter = filter,
            Event::DemoState(state) if self.state.demo => {
                self.demo_state = state;
                self.state.busy = false;
            }
            Event::SelectCreator(index) => {
                if let Some(creator) = self.state.creators.get(index).cloned() {
                    if self.state.demo {
                        self.state.creator_lines = self
                            .state
                            .demo_creator_lines
                            .iter()
                            .find(|(id, _)| id == &creator.creator_id)
                            .map(|(_, lines)| lines.clone())
                            .unwrap_or_default();
                        self.state.creator = Some(creator);
                    } else {
                        self.read(Action::GetCreator {
                            creator_id: creator.creator_id,
                        });
                    }
                }
            }
            Event::OpenDialog(dialog) => self.open_dialog(dialog, cx),
            Event::Screen(screen) => {
                self.zoomed = None;
                self.state.screen = screen;
                self.state.user = None;
                self.state.creator = None;
                self.state.report = None;
                self.demo_state = "normal";
                if self.state.signed_in && !self.state.demo {
                    self.images.clear();
                    self.load(cx);
                    self.prefetch();
                }
            }
            _ => {}
        }
    }
    fn open_dialog(&mut self, dialog: Dialog, cx: &mut Context<Self>) {
        let label = match dialog {
            Dialog::Creator => "Nombre del creador",
            Dialog::Delete => "Correo de la cuenta",
            Dialog::Block(_) => "Motivo del bloqueo",
            Dialog::Report(Status::Fixed) => "Versión de la corrección",
            Dialog::Report(_) => "Motivo",
            Dialog::Payout => "Pago",
        };
        self.form_subscriptions.clear();
        self.form_a = cx.new(|cx| Input::new(String::new(), label, cx).with_height(px(44.)));
        self.form_b
            .update(cx, |input, cx| input.set_value(String::new(), cx));
        self.form_c
            .update(cx, |input, cx| input.set_value(String::new(), cx));
        self.watch_forms(cx);
        self.dialog = Some(dialog);
    }
    fn focus_dialog(&self, window: &mut Window, cx: &mut Context<Self>) {
        if matches!(
            self.dialog,
            Some(
                Dialog::Creator
                    | Dialog::Delete
                    | Dialog::Block(true)
                    | Dialog::Report(Status::Fixed | Status::Rejected)
            )
        ) {
            self.form_a.read(cx).focus_handle().focus(window, cx);
        }
    }
    fn confirm_change(&mut self, cx: &mut Context<Self>) {
        if let Some(dialog) = self.dialog {
            match self.dialog_action(dialog, cx) {
                Ok(action) => {
                    if let Err(error) = self.state.propose(action) {
                        self.state.message = format!("Revisa los datos: {error}");
                        cx.notify();
                        return;
                    }
                    self.dialog = None;
                }
                Err(error) => {
                    self.state.message = error;
                    cx.notify();
                    return;
                }
            }
        }
        match self.state.confirm() {
            Ok(action) if self.state.demo => self.state.demo_action(&action),
            Ok(action) => {
                self.cache.clear();
                self.send(Command::Call(action));
            }
            Err(error) => self.state.failed(error),
        }
    }
    fn button(
        &self,
        id: &'static str,
        label: &str,
        event: Event,
        cx: &mut Context<Self>,
    ) -> Stateful<Div> {
        let icon = if id == "nav" {
            match &event {
                Event::Screen(Screen::Users) => Some("people.svg"),
                Event::Screen(Screen::Creators) => Some("star.svg"),
                Event::Screen(Screen::Reports) => Some("flag.svg"),
                Event::Screen(Screen::Rollout) => Some("grid.svg"),
                _ => None,
            }
        } else {
            None
        };
        let key_event = event.clone();
        let accessible_event = event.clone();
        let entity = cx.entity().downgrade();
        orbit::button(id, "", cx)
            .aria_label(label.to_owned())
            .when_some(icon, |b, icon| {
                b.child(gpui::svg().path(icon).size(px(19.)).text_color(rgb(INK3)))
            })
            .child(label.to_owned())
            .text_size(px(13.5))
            .text_color(rgb(INK1))
            .font_weight(gpui::FontWeight::SEMIBOLD)
            .rounded(px(12.))
            .when(self.state.busy, |b| b.opacity(0.45))
            .on_a11y_action(gpui::AccessibleAction::Click, move |_, window, cx| {
                let _ = entity.update(cx, |this, cx| {
                    this.event(accessible_event.clone(), cx);
                    this.focus_dialog(window, cx);
                });
                window.refresh();
            })
            .on_click(cx.listener(move |this, _, window, cx| {
                this.event(event.clone(), cx);
                this.focus_dialog(window, cx);
            }))
            .on_key_down(
                cx.listener(move |this, key: &gpui::KeyDownEvent, window, cx| {
                    if matches!(key.keystroke.key.as_str(), "enter" | "space") {
                        this.event(key_event.clone(), cx);
                        this.focus_dialog(window, cx);
                        cx.stop_propagation();
                    }
                }),
            )
    }
    fn dialog_action(&self, dialog: Dialog, cx: &Context<Self>) -> Result<Action, String> {
        let a = self.form_a.read(cx).value.trim().to_owned();
        let b = self.form_b.read(cx).value.trim().to_owned();
        let c = self.form_c.read(cx).value.trim().to_uppercase();
        let user = self.state.user.as_ref();
        let action = match dialog {
            Dialog::Block(blocked) => Action::SetBlocked {
                account_id: user.ok_or("Selecciona una persona")?.account_id.clone(),
                blocked,
                reason: (!a.is_empty()).then_some(a),
            },
            Dialog::Delete => {
                let user = user.ok_or("Selecciona una persona")?;
                if user
                    .email
                    .as_deref()
                    // After a partial deletion Clerk may no longer return the email.
                    // The server requires the original confirmation hash on retry.
                    .is_some_and(|email| !email.eq_ignore_ascii_case(&a))
                {
                    return Err("Escribe exactamente el correo de esta persona.".into());
                }
                Action::DeleteAccount {
                    account_id: user.account_id.clone(),
                    confirm_email: a,
                }
            }
            Dialog::Creator => Action::CreateCreator {
                name: a,
                email: b,
                code: c,
            },
            Dialog::Payout => {
                let creator = self.state.creator.as_ref().ok_or("Selecciona un creador")?;
                Action::RecordCreatorPayout {
                    creator_id: creator.creator_id.clone(),
                    amount_cents: creator.payable_cents,
                }
            }
            Dialog::Report(status) => {
                let report = self.state.report.as_ref().ok_or("Selecciona un informe")?;
                Action::SetReportStatus {
                    report_id: report.report_id.clone(),
                    status,
                    fixed_in_version: (status == Status::Fixed).then_some(a.clone()),
                    reason: (status != Status::Fixed && !a.is_empty()).then_some(a),
                }
            }
        };
        action
            .validate()
            .map_err(|_| "Revisa los datos antes de confirmar.".to_owned())?;
        Ok(action)
    }

    fn record_render(&mut self, started: Instant, window: &Window) {
        if let Some(worker) = &self.worker
            && crate::diagnostics::render_enabled()
        {
            let _ = worker.send.send(Command::Timing(
                "render_tree",
                started.elapsed().as_micros(),
            ));
            if let Some(request) = self.render_pending.take() {
                let _ = worker.send.send(Command::Timing(
                    "request_to_render",
                    request.elapsed().as_micros(),
                ));
            }
            let send = worker.send.clone();
            window.on_next_frame(move |_, _| {
                let _ = send.send(Command::Timing(
                    "render_to_frame",
                    started.elapsed().as_micros(),
                ));
            });
        }
    }
    fn frame_timing(&self, label: &'static str, window: &Window) {
        if crate::diagnostics::render_enabled()
            && let Some(worker) = &self.worker
        {
            let send = worker.send.clone();
            let started = Instant::now();
            window.on_next_frame(move |_, _| {
                let _ = send.send(Command::Timing(label, started.elapsed().as_micros()));
            });
        }
    }
    fn switch(
        &self,
        id: &'static str,
        on: bool,
        action: Action,
        cx: &mut Context<Self>,
    ) -> Stateful<Div> {
        self.button(id, "", Event::Propose(action), cx)
            .aria_label(format!(
                "{id}: {}",
                if on { "Activado" } else { "Desactivado" }
            ))
            .px(px(3.))
            .when(on, gpui::Styled::justify_end)
            .when(!on, gpui::Styled::justify_start)
            .child(
                div()
                    .size(px(18.))
                    .rounded_full()
                    .bg(rgb(if on { INK1 } else { INK3 })),
            )
            .w(px(44.))
            .h(px(26.))
            .rounded(px(20.))
            .bg(rgb(if on { 0x00d5_2f49 } else { 0x0020_2127 }))
            .text_color(rgb(INK1))
    }
    fn page_head(&self, title: &str, subtitle: &str, cx: &mut Context<Self>) -> Div {
        div()
            .flex()
            .items_end()
            .justify_between()
            .mb(px(4.))
            .child(
                div()
                    .flex()
                    .flex_col()
                    .gap(px(6.))
                    .child(heading(title, 30.))
                    .child(text(subtitle, 14., INK3)),
            )
            .child(self.button("refresh", "Actualizar", Event::Reload, cx))
    }
    fn list_state(&self, empty: &str, cx: &mut Context<Self>) -> Option<Div> {
        let loading = self.state.busy || self.demo_state == "cargando";
        let error = self.demo_state == "error" || self.state.message.starts_with("Error:");
        if loading {
            let mut d = panel().gap(px(14.)).child(muted("Cargando…"));
            for i in 0usize..6 {
                d = d.child(
                    div()
                        .id(("skeleton", i))
                        .h(px(44.))
                        .rounded(px(10.))
                        .bg(rgb(S2)),
                );
            }
            Some(d)
        } else if error {
            Some(
                panel()
                    .items_center()
                    .py(px(55.))
                    .gap(px(12.))
                    .child(heading("No se pudo conectar con el servidor", 17.))
                    .child(muted("Revisa tu conexión y vuelve a intentarlo."))
                    .child(self.button("retry", "Reintentar", Event::Reload, cx)),
            )
        } else if self.demo_state == "vacio" {
            Some(empty_card(empty))
        } else {
            None
        }
    }

    fn rollout(&self, cx: &mut Context<Self>) -> Div {
        let mut body = column().child(self.page_head(
            "Módulos para todos",
            "Enciende un módulo para todo el mundo. Para una sola persona, hazlo desde su ficha.",
            cx,
        ));
        if let Some(state) = self.list_state("No se pudieron cargar los módulos", cx) {
            return body.child(state);
        }
        let mut cards = div().flex().flex_wrap().gap(px(16.));
        for row in &self.state.rollout {
            cards = cards.child(self.module_card(row, cx));
        }
        body = body.child(cards).child(note("Al desactivar un módulo para todos, quienes tienen acceso propio, por su plan o por su rol lo conservan. Cada cambio pide confirmación.",INK3));
        body
    }

    fn module_card(&self, row: &crate::client::Rollout, cx: &mut Context<Self>) -> Div {
        panel()
            .w(gpui::relative(0.49))
            .gap(px(12.))
            .child(
                div()
                    .flex()
                    .gap(px(12.))
                    .items_center()
                    .child(
                        div()
                            .size(px(42.))
                            .flex_shrink_0()
                            .rounded(px(12.))
                            .bg(rgb(S2))
                            .flex()
                            .items_center()
                            .justify_center()
                            .child(
                                gpui::svg()
                                    .path(format!("{}.svg", row.module.key()))
                                    .size(px(20.))
                                    .text_color(rgb(if row.enabled_for_all { RED } else { INK2 })),
                            ),
                    )
                    .child(
                        column()
                            .gap(px(3.))
                            .child(heading(row.module.label(), 17.))
                            .child(muted(module_description(row.module))),
                    ),
            )
            .child(
                div()
                    .flex()
                    .items_center()
                    .justify_between()
                    .pt(px(12.))
                    .border_t_1()
                    .border_color(gpui::rgba(0xffff_ff0c))
                    .child(
                        column()
                            .gap(px(4.))
                            .child(tag(
                                if row.enabled_for_all {
                                    "Activado para todos"
                                } else {
                                    "Solo algunas personas"
                                },
                                if row.enabled_for_all { GREEN } else { INK3 },
                            ))
                            .when(!row.enabled_for_all, |d| {
                                d.child(muted(&format!(
                                    "{} con acceso propio",
                                    row.individual_count
                                )))
                            }),
                    )
                    .child(
                        self.button(
                            row.module.key(),
                            if row.enabled_for_all {
                                "Desactivar para todos"
                            } else {
                                "Activar para todos"
                            },
                            Event::Propose(Action::SetRollout {
                                module: row.module,
                                enabled_for_all: !row.enabled_for_all,
                            }),
                            cx,
                        )
                        .text_size(px(12.5))
                        .px(px(12.))
                        .h(px(32.))
                        .bg(rgb(if row.enabled_for_all { S2 } else { 0x00f3_eeee }))
                        .text_color(rgb(if row.enabled_for_all {
                            INK1
                        } else {
                            0x001c_1719
                        })),
                    ),
            )
    }

    fn breadcrumb(&self) -> String {
        if let Some(user) = &self.state.user {
            return format!("Personas › {}", user.name.as_deref().unwrap_or("Persona"));
        }
        if let Some(creator) = &self.state.creator {
            return format!("Creadores › {}", creator.name);
        }
        self.state.screen.label().to_owned()
    }
    fn image_viewer(&self, image: Arc<Image>, cx: &mut Context<Self>) -> Div {
        div()
            .absolute()
            .inset_0()
            .size_full()
            .p(px(24.))
            .bg(rgb(CANVAS))
            .flex()
            .flex_col()
            .gap(px(16.))
            .child(
                div()
                    .flex()
                    .justify_between()
                    .child(heading("Captura del informe", 22.))
                    .child(self.button("close-image", "Volver al informe", Event::CloseImage, cx)),
            )
            .child(
                div().flex_1().min_h_0().child(
                    img(ImageSource::Image(image))
                        .size_full()
                        .object_fit(gpui::ObjectFit::Contain),
                ),
            )
    }
    pub fn demo_scene(&mut self, scene: &str, cx: &mut Context<Self>) -> Result<(), String> {
        if !self.state.demo {
            return Err("Las escenas solo están disponibles con --demo".into());
        }
        match scene {
            "normal" => {}
            "cargando" => self.demo_state = "cargando",
            "vacio" => self.demo_state = "vacio",
            "error" => self.demo_state = "error",
            "ana" | "owner" | "bloquear" | "borrar" | "eva" => {
                self.state.screen = Screen::Users;
                let i = if scene == "owner" {
                    0
                } else if scene == "eva" {
                    5
                } else {
                    1
                };
                self.select_user(i);
                if scene == "bloquear" {
                    self.open_dialog(Dialog::Block(true), cx);
                }
                if scene == "borrar" {
                    self.open_dialog(Dialog::Delete, cx);
                }
            }
            "carlos" => self.event(Event::SelectCreator(0), cx),
            "pablo" => self.event(Event::SelectCreator(2), cx),
            "nuevo" => self.open_dialog(Dialog::Creator, cx),
            "informe" => self.select_report(0),
            "arreglado" => self.select_report(4),
            "rechazado" => self.select_report(3),
            _ => return Err("Escena demo desconocida".into()),
        }
        Ok(())
    }
}
impl Render for Admin {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let started = Instant::now();
        let mut root = div()
            .relative()
            .size_full()
            .flex()
            .bg(rgb(CANVAS))
            .text_color(rgb(INK1))
            .font_family("Inter W400")
            .text_size(px(14.))
            .on_mouse_move(
                cx.listener(|this, _, window, _| this.frame_timing("hover_to_frame", window)),
            )
            .on_scroll_wheel(
                cx.listener(|this, _, window, _| this.frame_timing("scroll_to_frame", window)),
            )
            .on_key_down(cx.listener(|this, key: &gpui::KeyDownEvent, window, cx| {
                if key.keystroke.key == "tab" {
                    if key.keystroke.modifiers.shift {
                        window.focus_prev(cx);
                    } else {
                        window.focus_next(cx);
                    }
                    cx.stop_propagation();
                }
                if key.keystroke.key == "escape" {
                    this.dialog = None;
                    this.state.confirmation = None;
                    this.zoomed = None;
                    cx.notify();
                }
            }));
        if self.state.signed_in {
            let body = match self.state.screen {
                Screen::Users => self.users(cx),
                Screen::Creators => self.creators(cx),
                Screen::Reports => self.reports(cx),
                Screen::Rollout => self.rollout(cx),
                Screen::Login => self.login(cx),
            };
            let mut content = column()
                .id("content")
                .flex_1()
                .min_h_0()
                .overflow_y_scroll()
                .px(px(32.))
                .pt(px(28.))
                .pb(px(40.))
                .gap(px(16.));
            if !self.state.demo
                && !self.state.message.is_empty()
                && !self.state.busy
                && !self.state.message.starts_with("Datos")
            {
                content = content.child(note(&self.state.message, EMBER));
            }
            root = root.child(self.sidebar(cx)).child(
                column()
                    .flex_1()
                    .min_w_0()
                    .h_full()
                    .gap_0()
                    .child(
                        div()
                            .h(px(58.))
                            .flex_shrink_0()
                            .px(px(32.))
                            .flex()
                            .items_center()
                            .justify_between()
                            .border_b_1()
                            .border_color(gpui::rgba(0xffff_ff13))
                            .child(text(&self.breadcrumb(), 13.5, INK3))
                            .when(self.state.demo, |d| {
                                d.child(tag("DEMO · DATOS FALSOS", EMBER))
                            }),
                    )
                    .child(content.child(body)),
            );
        } else {
            root = root.items_center().justify_center().child(self.login(cx));
        }
        if self.dialog.is_some() || self.state.confirmation.is_some() {
            root = root.child(self.confirmation_panel(self.state.confirmation.as_ref(), cx));
        }
        if let Some(image) = self.zoomed.and_then(|i| self.images.get(i)) {
            root = root.child(self.image_viewer(image.clone(), cx));
        }
        self.record_render(started, window);
        root
    }
}
const CANVAS: u32 = 0x0008_090b;
const S1: u32 = 0x0012_1316;
const S2: u32 = 0x0018_191e;
const INK1: u32 = 0x00f5_f3f2;
const INK2: u32 = 0x00b7_b2b2;
const INK3: u32 = 0x008a_858b;
const RED: u32 = 0x00f0_4755;
const GREEN: u32 = 0x0078_d68b;
const EMBER: u32 = 0x00ff_9b57;
const CYAN: u32 = 0x005c_cbd5;
fn column() -> Div {
    div().flex().flex_col().gap(px(18.))
}
fn panel() -> Div {
    column()
        .p(px(20.))
        .rounded(px(18.))
        .border_1()
        .border_color(gpui::rgba(0xffff_ff13))
        .bg(rgb(S1))
}
fn text(value: &str, size: f32, color: u32) -> Div {
    div()
        .text_size(px(size))
        .line_height(px(size * 1.45))
        .text_color(rgb(color))
        .child(value.to_owned())
}
fn heading(value: &str, size: f32) -> Div {
    text(value, size, INK1)
        .font_weight(gpui::FontWeight::BOLD)
        .line_height(px(size * 1.1))
}
fn muted(value: &str) -> Div {
    text(value, 12.5, INK3)
}
fn eyebrow(value: &str) -> Div {
    text(value, 11., 0x0078_7379).font_weight(gpui::FontWeight::SEMIBOLD)
}
fn avatar(name: &str, size: f32) -> Div {
    div()
        .w(px(size))
        .h(px(size))
        .flex_shrink_0()
        .rounded(px(size / 2.))
        .bg(rgb(0x0020_2127))
        .border_1()
        .border_color(gpui::rgba(0xffff_ff21))
        .flex()
        .items_center()
        .justify_center()
        .font_weight(gpui::FontWeight::BOLD)
        .text_size(px(size * 0.36))
        .child(
            name.split_whitespace()
                .filter_map(|s| s.chars().next())
                .take(2)
                .collect::<String>(),
        )
}
fn tag(value: &str, color: u32) -> Div {
    text(value, 12., color)
        .flex_none()
        .w(gpui::auto())
        .px(px(9.))
        .py(px(4.))
        .rounded(px(8.))
        .bg(rgb(S2))
        .font_weight(gpui::FontWeight::SEMIBOLD)
}
fn note(value: &str, color: u32) -> Div {
    text(value, 12.5, color)
        .p(px(12.))
        .rounded(px(12.))
        .border_1()
        .border_color(gpui::rgba(0xffff_ff13))
        .bg(rgb(0x000d_0e11))
}
fn empty_card(value: &str) -> Div {
    panel()
        .items_center()
        .py(px(56.))
        .gap(px(8.))
        .child(heading(value, 17.))
        .child(muted("Prueba otro filtro o vuelve a actualizar."))
}
fn kpi(label: &str, value: &str, featured: bool) -> Div {
    panel()
        .flex_1()
        .gap(px(8.))
        .child(eyebrow(label))
        .child(
            text(value, 28., if featured { 0x00ff_8f98 } else { INK1 })
                .font_weight(gpui::FontWeight::BOLD),
        )
        .when(featured, |d| d.border_color(gpui::rgba(0xf047_5550)))
}
fn money_amount(cents: i64) -> String {
    format!(
        "{}{},{}",
        if cents < 0 { "−" } else { "" },
        cents.unsigned_abs() / 100,
        format_args!("{:02}", cents.unsigned_abs() % 100)
    )
}
fn money(cents: i64) -> String {
    format!("{} €", money_amount(cents))
}
fn date(value: &str) -> String {
    let Some(prefix) = value.get(..10) else {
        return value.to_owned();
    };
    let parts: Vec<_> = prefix.split('-').collect();
    if parts.len() == 3
        && parts[0].len() == 4
        && let (Ok(month), Ok(day)) = (parts[1].parse::<usize>(), parts[2].parse::<u8>())
        && (1..=12).contains(&month)
        && (1..=31).contains(&day)
    {
        let months = [
            "ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic",
        ];
        return format!("{day} {}", months[month - 1]);
    }
    value.to_owned()
}
fn plan_label(user: &crate::client::User) -> String {
    format!(
        "{}{}",
        user.plan.label(),
        if user.billing.as_deref() == Some("yearly") {
            " · anual"
        } else {
            ""
        }
    )
}
fn account_matches(user: &crate::client::User, filter: &str) -> bool {
    match filter {
        "paying" => user.plan != Plan::Free,
        "testers" => user.roles.iter().any(|r| r == "tester"),
        "blocked" => user.blocked,
        _ => true,
    }
}
fn status_color(status: Status) -> u32 {
    match status {
        Status::InReview => EMBER,
        Status::Validated => CYAN,
        Status::Rejected | Status::Spam | Status::Incomplete | Status::DuplicateLinked => RED,
        Status::Fixed => GREEN,
        _ => INK3,
    }
}
fn module_description(module: Module) -> &'static str {
    match module {
        Module::Strategy => "Prepara tu carrera y tu estrategia.",
        Module::Engineer => "Tu ingeniero en pista, con voz y avisos.",
        Module::Analysis => "Revisa tus vueltas y tu telemetría.",
        Module::Calendar => "Organiza tus carreras y campeonatos.",
    }
}

#[cfg(test)]
mod presentation_tests {
    use super::*;

    #[test]
    fn dates_follow_the_approved_short_spanish_format() {
        assert_eq!(date("2026-09-02T14:00:00Z"), "2 sep");
        assert_eq!(date("2026-10-01"), "1 oct");
        assert_eq!(date("Sin datos"), "Sin datos");
        assert_eq!(date("2026-99-01"), "2026-99-01");
    }
}
