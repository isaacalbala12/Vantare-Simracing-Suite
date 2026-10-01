//! Chrome Orbit. Las entidades de sección conservan contenido y persistencia.
use super::{
    Hub,
    input::Input,
    navigation::{self, Access, Command},
};
use crate::{Section, orbit};
use gpui::{
    Context, Entity, FocusHandle, KeyDownEvent, ScrollHandle, Window, div, prelude::*, px, rgb,
    rgba,
};

pub(super) struct State {
    pub access: Access,
    pub column_open: bool,
    pub palette_open: bool,
    pub navigation_notice: Option<String>,
    notification_subscription: Option<gpui::Subscription>,
    query: Entity<Input>,
    context_query: Entity<Input>,
    last_query: String,
    cursor: usize,
    palette_focus: FocusHandle,
    close_focus: FocusHandle,
    return_focus: Option<FocusHandle>,
    scroll: ScrollHandle,
    rail_scroll: ScrollHandle,
    rail_focus: Vec<FocusHandle>,
}

impl State {
    pub fn new(
        access: Access,
        capture: Option<&crate::demo::CaptureState>,
        cx: &mut Context<Hub>,
    ) -> Self {
        let query_text = capture
            .and_then(|capture| capture.palette_query.clone())
            .unwrap_or_default();
        let query = cx.new(|cx| Input::new(query_text.clone(), "Buscar secciones y acciones", cx));
        let context_query = cx.new(|cx| Input::new(String::new(), "Buscar en el contexto", cx));
        for input in [&query, &context_query] {
            cx.observe(input, |_, _, cx| cx.notify()).detach();
        }
        Self {
            access,
            column_open: capture.is_none_or(|capture| capture.column_open),
            palette_open: capture.is_some_and(|capture| capture.palette_query.is_some()),
            navigation_notice: None,
            notification_subscription: None,
            query,
            context_query,
            last_query: query_text,
            cursor: 0,
            palette_focus: cx.focus_handle(),
            close_focus: cx.focus_handle(),
            return_focus: None,
            scroll: ScrollHandle::new(),
            rail_scroll: ScrollHandle::new(),
            rail_focus: navigation::RAIL.iter().map(|_| cx.focus_handle()).collect(),
        }
    }
}

impl Hub {
    pub(super) fn navigate(&mut self, section: Section, cx: &mut Context<Self>) {
        if let Err(reason) = self.shell.access.navigate(&mut self.section, section) {
            self.shell.navigation_notice = Some(format!("{} · {reason}", section.label()));
        } else {
            self.shell.navigation_notice = None;
            self.shell.context_query.update(cx, Input::clear);
        }
        cx.notify();
    }

    fn toggle_palette(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if self.shell.palette_open {
            self.close_palette(window, cx);
            return;
        }
        self.shell.return_focus = window.focused(cx);
        self.shell.query =
            cx.new(|cx| Input::new(String::new(), "Buscar secciones y acciones", cx));
        cx.observe(&self.shell.query, |_, _, cx| cx.notify())
            .detach();
        self.shell.last_query.clear();
        self.shell.cursor = 0;
        self.shell.scroll = ScrollHandle::new();
        self.shell.palette_open = true;
        let focus = self.shell.query.read(cx).focus.clone();
        focus.focus(window, cx);
        cx.notify();
    }

    fn close_palette(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        self.shell.palette_open = false;
        if let Some(focus) = self.shell.return_focus.take() {
            focus.focus(window, cx);
        } else {
            self.focus.focus(window, cx);
        }
        cx.notify();
    }

    fn palette_commands(&self, cx: &Context<Self>) -> Vec<navigation::Item> {
        let mut items = navigation::commands(self.shell.access, &self.shell.last_query);
        items.extend(navigation::launch_commands(
            self.shell.access,
            &self.shell.last_query,
            self.launcher.read(cx).saved_profiles(),
        ));
        items
    }

    pub(super) fn launch_profile(&mut self, id: &str, cx: &mut Context<Self>) {
        if let Some(reason) = self.shell.access.lock(Section::Launcher) {
            self.shell.navigation_notice = Some(reason.into());
            cx.notify();
            return;
        }
        self.launcher
            .update(cx, |launcher, cx| launcher.launch_id(id, cx));
        self.navigate(Section::Launcher, cx);
    }

    pub(super) fn refresh_query(&mut self, cx: &mut Context<Self>) {
        let query = &self.shell.query.read(cx).value;
        if *query != self.shell.last_query {
            self.shell.last_query.clone_from(query);
            self.shell.cursor = 0;
            self.shell.scroll.scroll_to_item(0);
        }
    }

    fn execute(&mut self, command: Command, window: &mut Window, cx: &mut Context<Self>) {
        self.close_palette(window, cx);
        // El comando puede ocultar la columna o la sección que tenía el foco.
        // Escape conserva el foco previo; al ejecutar se vuelve a la shell estable.
        self.focus.focus(window, cx);
        match command {
            Command::Navigate(section) => self.navigate(section, cx),
            Command::LaunchProfile(id) => self.launch_profile(&id, cx),
            Command::Save => match self.save(cx) {
                Ok(()) => self.status = Some("Borradores locales guardados".into()),
                Err(error) => {
                    self.notifications.update(cx, |center, cx| {
                        center.report("hub.save", error.clone(), cx);
                    });
                    self.status = Some(error);
                }
            },
            Command::ToggleColumn => self.shell.column_open = !self.shell.column_open,
            Command::Close => self.close(cx),
        }
        cx.notify();
    }

    pub(super) fn shell_key(
        &mut self,
        event: &KeyDownEvent,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        // La capa de la campana gestiona Tab/Esc y devuelve el foco al cerrarse.
        if self.notifications.read(cx).popover_open(cx) {
            return;
        }
        let key = &event.keystroke;
        if (key.modifiers.control || key.modifiers.platform) && key.key.eq_ignore_ascii_case("k") {
            self.toggle_palette(window, cx);
            cx.stop_propagation();
            return;
        }
        if self.shell.palette_open {
            self.refresh_query(cx);
            let items = self.palette_commands(cx);
            match key.key.as_str() {
                "escape" => self.close_palette(window, cx),
                "up" | "down" => {
                    self.shell.cursor =
                        navigation::move_cursor(self.shell.cursor, key.key == "down", items.len());
                    let headers = usize::from(
                        self.shell.cursor
                            >= items
                                .iter()
                                .take_while(|item| matches!(item.command, Command::Navigate(_)))
                                .count(),
                    ) + 1;
                    self.shell
                        .scroll
                        .scroll_to_item(self.shell.cursor + headers);
                    cx.notify();
                }
                "enter" => {
                    if self.shell.close_focus.is_focused(window) {
                        self.close_palette(window, cx);
                    } else if let Some(item) = items.get(self.shell.cursor) {
                        self.execute(item.command.clone(), window, cx);
                    }
                }
                // Dos tab stops; los resultados se recorren con ↑/↓ y Enter.
                "tab" => {
                    if self.shell.close_focus.is_focused(window) {
                        let focus = self.shell.query.read(cx).focus.clone();
                        focus.focus(window, cx);
                    } else {
                        self.shell.close_focus.focus(window, cx);
                    }
                }
                _ => return,
            }
            cx.stop_propagation();
        } else if key.key == "tab" {
            if key.modifiers.shift {
                window.focus_prev(cx);
            } else {
                window.focus_next(cx);
            }
            self.reveal_rail_focus(window, cx);
            cx.stop_propagation();
        } else if matches!(key.key.as_str(), "up" | "down")
            && let Some(index) = self
                .shell
                .rail_focus
                .iter()
                .position(|focus| focus.is_focused(window))
        {
            let next =
                navigation::move_cursor(index, key.key == "down", self.shell.rail_focus.len());
            self.shell.rail_focus[next].focus(window, cx);
            self.reveal_rail_focus(window, cx);
            cx.stop_propagation();
        }
    }

    fn reveal_rail_focus(&self, window: &Window, cx: &mut Context<Self>) {
        if let Some(index) = self
            .shell
            .rail_focus
            .iter()
            .position(|focus| focus.is_focused(window))
        {
            self.shell.rail_scroll.scroll_to_item(index);
            cx.notify();
        }
    }

    pub(super) fn rail(&self, cx: &mut Context<Self>) -> gpui::Div {
        let mut items = div()
            .id("rail-sections")
            .flex_1()
            .min_h_0()
            .overflow_y_scroll()
            .track_scroll(&self.shell.rail_scroll)
            .flex()
            .flex_col()
            .items_center()
            .gap(px(8.0));
        for (index, &section) in navigation::RAIL.iter().enumerate() {
            items = items.child(
                orbit::rail_button(
                    section.label(),
                    navigation::icon(section),
                    section.label(),
                    self.section == section,
                    self.shell.access.lock(section),
                )
                .track_focus(&self.shell.rail_focus[index])
                .on_click(cx.listener(move |this, _, _, cx| this.navigate(section, cx))),
            );
        }
        div()
            .w(px(orbit::RAIL_W))
            .h_full()
            .flex_none()
            .flex()
            .flex_col()
            .items_center()
            .pt(px(9.0))
            .pb(px(16.0))
            .gap(px(8.0))
            .bg(rgb(orbit::RAIL_BG))
            .border_r_1()
            .border_color(rgba(orbit::LINE))
            .child(items)
            .child(
                div()
                    .flex_none()
                    .flex()
                    .flex_col()
                    .items_center()
                    .gap(px(9.0))
                    .child(
                        orbit::rail_button(
                            "toggle-column",
                            "i-panel",
                            if self.shell.column_open {
                                "Ocultar contexto"
                            } else {
                                "Mostrar contexto"
                            },
                            false,
                            None,
                        )
                        .aria_expanded(self.shell.column_open)
                        .on_click(cx.listener(|this, _, _, cx| {
                            this.shell.column_open = !this.shell.column_open;
                            cx.notify();
                        })),
                    )
                    .child(
                        orbit::rail_button(
                            "palette",
                            "i-comando",
                            "Comandos · Ctrl+K",
                            false,
                            None,
                        )
                        .aria_keyshortcuts("Control+K")
                        .on_click(
                            cx.listener(|this, _, window, cx| this.toggle_palette(window, cx)),
                        ),
                    )
                    .child(
                        orbit::rail_button(
                            "settings",
                            "i-ajustes",
                            "Ajustes",
                            self.section == Section::Settings,
                            None,
                        )
                        .on_click(
                            cx.listener(|this, _, _, cx| this.navigate(Section::Settings, cx)),
                        ),
                    )
                    .child(orbit::avatar(self.section == Section::Account).on_click(
                        cx.listener(|this, _, _, cx| this.navigate(Section::Account, cx)),
                    )),
            )
    }

    pub(super) fn context_column(&self, window: &Window, cx: &mut Context<Self>) -> gpui::Div {
        let query = self
            .shell
            .context_query
            .read(cx)
            .value
            .trim()
            .to_lowercase();
        let mut rows = div()
            .id("context-rows")
            .flex_1()
            .min_h_0()
            .overflow_y_scroll()
            .flex()
            .flex_col()
            .gap(px(8.0))
            .py(px(16.0));
        let destinations = navigation::context(self.section);
        for &section in destinations {
            let label = if section == Section::Settings {
                "Aplicación"
            } else {
                section.label()
            };
            if format!("{} {}", label, section.subtitle())
                .to_lowercase()
                .contains(&query)
            {
                rows = rows.child(
                    orbit::nav_item(
                        section.label(),
                        label,
                        section.subtitle(),
                        self.section == section,
                    )
                    .on_click(cx.listener(move |this, _, _, cx| this.navigate(section, cx))),
                );
            }
        }
        // Bloques persistentes de ContextColumn; solo enlaces a datos locales.
        // No publica carreras, perfiles activos ni cadenas que no estén expuestos.
        if !matches!(
            self.section,
            Section::Settings
                | Section::Account
                | Section::Licenses
                | Section::Studio
                | Section::Workshop
        ) {
            for (section, label) in [
                (Section::Calendar, "Próximas carreras"),
                (Section::Workshop, "Perfil de overlays"),
                (Section::Launcher, "Launcher"),
            ] {
                if section == self.section {
                    continue;
                }
                if !format!("{label} {}", section.subtitle())
                    .to_lowercase()
                    .contains(&query)
                {
                    continue;
                }
                rows = rows.child(div().mx(px(24.0)).mt(px(16.0)).child(orbit::eyebrow(label)));
                rows = rows.child(
                    orbit::nav_item(label, section.label(), "Abrir", false)
                        .on_click(cx.listener(move |this, _, _, cx| this.navigate(section, cx))),
                );
            }
        }
        rows = self.with_launcher_profiles(rows, &query, cx);
        orbit::column("Vantare", env!("CARGO_PKG_VERSION"))
            .w(px(orbit::column_width(f32::from(
                window.viewport_size().width,
            ))))
            .child(
                div()
                    .px(px(24.0))
                    .pt(px(20.0))
                    .child(orbit::eyebrow(self.section.label())),
            )
            .child(div().px(px(24.0)).py(px(8.0)).child(orbit::text(
                match self.previous_source {
                    Some(true) => "Fuente conectada",
                    Some(false) => "Sin fuente live",
                    None => "Sin conexión",
                },
                11.5,
                400,
                orbit::INK_3,
            )))
            .child(
                div()
                    .px(px(24.0))
                    .pt(px(12.0))
                    .child(orbit::text("Buscar contexto", 12.0, 500, orbit::INK_3))
                    .child(self.shell.context_query.clone()),
            )
            .child(rows)
    }

    fn with_launcher_profiles(
        &self,
        rows: gpui::Stateful<gpui::Div>,
        query: &str,
        cx: &mut Context<Self>,
    ) -> gpui::Stateful<gpui::Div> {
        if matches!(
            self.section,
            Section::Settings
                | Section::Account
                | Section::Licenses
                | Section::Studio
                | Section::Workshop
        ) {
            return rows;
        }
        rows.child(
            self.launcher
                .update(cx, |launcher, cx| launcher.quick_profiles(query, cx)),
        )
    }

    fn notification_bell(&mut self, cx: &mut Context<Self>) -> gpui::Div {
        if self.shell.notification_subscription.is_none() {
            self.shell.notification_subscription =
                Some(cx.observe(&self.notifications, |_, _, cx| cx.notify()));
        }
        div()
            .flex()
            .items_center()
            .gap(px(orbit::MENU_PAD))
            .child(
                orbit::rail_button(
                    "notifications",
                    "i-campana",
                    "Notificaciones",
                    self.notifications.read(cx).popover_open(cx),
                    None,
                )
                .size(px(orbit::CONTROL_H))
                .when(self.notifications.read(cx).unread() > 0, |bell| {
                    bell.child(
                        orbit::badge(self.notifications.read(cx).unread(), orbit::Tone::Danger)
                            .absolute()
                            .top_0()
                            .right_0(),
                    )
                })
                .child({
                    let notifications = self.notifications.clone();
                    // Mismo seguimiento de ancla que el dropdown Orbit.
                    gpui::canvas(
                        move |bounds, _, cx| {
                            notifications.update(cx, |center, cx| {
                                if center.bell_bounds.is_none() {
                                    center.bell_bounds = Some(bounds);
                                    cx.notify();
                                }
                            });
                        },
                        |_, (), _, _| {},
                    )
                    .absolute()
                    .size_full()
                })
                .aria_expanded(self.notifications.read(cx).popover_open(cx))
                .aria_label(format!(
                    "Notificaciones · {} sin leer",
                    self.notifications.read(cx).unread()
                ))
                .capture_any_mouse_down(cx.listener(|this, event: &gpui::MouseDownEvent, _, cx| {
                    if event.button == gpui::MouseButton::Left {
                        let open = this.notifications.read(cx).popover_open(cx);
                        this.notifications
                            .update(cx, |center, _| center.bell_was_open = open);
                    }
                }))
                .on_click(cx.listener(|this, event, window, cx| {
                    this.notifications
                        .update(cx, |center, cx| center.click_bell(event, window, cx));
                    cx.notify();
                })),
            )
            .when_some(self.notifications.read(cx).popover(), |bell, layer| {
                bell.child(layer)
            })
    }

    pub(super) fn topbar(&mut self, window: &Window, cx: &mut Context<Self>) -> gpui::Div {
        let bell = self.notification_bell(cx);
        let narrow = f32::from(window.viewport_size().width) <= orbit::COLUMN_BREAKPOINT;
        orbit::topbar(
            "Vantare",
            self.section.label(),
            div()
                .flex()
                .items_center()
                .gap(px(8.0))
                .child(bell)
                // El actualizador no está integrado: hueco local sin avisos ficticios.
                .when(!narrow, |row| {
                    row.child(
                        div()
                            .id("local-update-state")
                            .aria_label("Actualizaciones: sin estado local disponible")
                            .child(orbit::text("", 11.5, 500, orbit::INK_3)),
                    )
                })
                .child(
                    orbit::button(
                        "close-hub",
                        if narrow { "Cerrar" } else { "Guardar y cerrar" },
                    )
                    .on_click(cx.listener(|this, _, _, cx| this.close(cx))),
                ),
        )
        .px(px(if narrow { 16.0 } else { orbit::GUTTER }))
    }

    fn palette_rows(
        &self,
        items: &[navigation::Item],
        window: &Window,
        cx: &mut Context<Self>,
    ) -> gpui::Stateful<gpui::Div> {
        let mut rows = div()
            .id("palette-results")
            .role(gpui::Role::ListBox)
            .aria_label("Resultados de comandos")
            .max_h(px(f32::from(window.viewport_size().height) * 0.46))
            .overflow_y_scroll()
            .track_scroll(&self.shell.scroll)
            .py(px(8.0));
        let mut previous_group = None;
        for (index, item) in items.iter().enumerate() {
            let destination = matches!(item.command, Command::Navigate(_));
            if previous_group != Some(destination) {
                rows = rows.child(div().px(px(20.0)).py(px(8.0)).child(orbit::eyebrow(
                    if destination { "Ir a" } else { "Acciones" },
                )));
                previous_group = Some(destination);
            }
            let command = item.command.clone();
            rows = rows.child(
                orbit::palette_item(index, index == self.shell.cursor)
                    .aria_label(format!(
                        "{} · {}",
                        item.label,
                        item.locked.unwrap_or(item.meta)
                    ))
                    .child(orbit::icon(
                        item.icon,
                        16.0,
                        if item.locked.is_some() {
                            orbit::INK_MUTED
                        } else {
                            orbit::INK_2
                        },
                    ))
                    .child(
                        orbit::text(item.label.clone(), 13.5, 600, orbit::INK)
                            .flex_1()
                            .min_w_0(),
                    )
                    .child(orbit::text(
                        item.locked.unwrap_or(item.meta),
                        11.5,
                        400,
                        orbit::INK_3,
                    ))
                    .when(item.locked.is_some(), |row| {
                        row.child(orbit::icon("i-lock", 13.0, orbit::INK_MUTED))
                    })
                    .on_hover(cx.listener(move |this, hovered, _, cx| {
                        if *hovered {
                            this.shell.cursor = index;
                            cx.notify();
                        }
                    }))
                    .on_click(cx.listener(move |this, _, window, cx| {
                        this.execute(command.clone(), window, cx);
                    })),
            );
        }
        if items.is_empty() {
            rows = rows.child(div().p(px(20.0)).child(orbit::text(
                "Sin resultados",
                13.5,
                400,
                orbit::INK_3,
            )));
        }
        rows
    }

    pub(super) fn palette(
        &self,
        window: &Window,
        cx: &mut Context<Self>,
    ) -> gpui::Stateful<gpui::Div> {
        let items = self.palette_commands(cx);
        let rows = self.palette_rows(&items, window, cx);
        let width = (f32::from(window.viewport_size().width) - 80.0).clamp(240.0, orbit::PALETTE_W);
        div()
            .id("palette-backdrop")
            .absolute()
            .inset_0()
            .occlude()
            .bg(rgba(orbit::PALETTE_BACKDROP))
            .flex()
            .justify_center()
            .items_start()
            .pt(px(f32::from(window.viewport_size().height) * 0.14))
            .child(
                div()
                    .id("command-palette")
                    .role(gpui::Role::Dialog)
                    .aria_label("Paleta de comandos")
                    .track_focus(&self.shell.palette_focus)
                    .tab_group()
                    .tab_stop(false)
                    .occlude()
                    .w(px(width))
                    .h_auto()
                    .max_h(px(
                        (f32::from(window.viewport_size().height) - 110.0).max(160.0)
                    ))
                    .flex()
                    .flex_col()
                    .bg(rgb(orbit::SURFACE_1))
                    .border_1()
                    .border_color(rgba(orbit::LINE_STRONG))
                    .rounded(px(orbit::FEATURED_RADIUS))
                    .overflow_hidden()
                    .on_mouse_down_out(cx.listener(
                        |this, event: &gpui::MouseDownEvent, window, cx| {
                            if event.button == gpui::MouseButton::Left {
                                this.close_palette(window, cx);
                            }
                        },
                    ))
                    .child(
                        div()
                            .p(px(20.0))
                            .flex_none()
                            .border_b_1()
                            .border_color(rgba(orbit::LINE))
                            .child(
                                div()
                                    .flex()
                                    .items_center()
                                    .justify_between()
                                    .child(orbit::text(
                                        "Buscar secciones y acciones",
                                        15.0,
                                        700,
                                        orbit::INK,
                                    ))
                                    .child(
                                        orbit::button("palette-close", "Esc")
                                            .track_focus(&self.shell.close_focus)
                                            .aria_label("Cerrar paleta")
                                            .on_click(cx.listener(|this, _, window, cx| {
                                                this.close_palette(window, cx);
                                            })),
                                    ),
                            )
                            .child(
                                div()
                                    .mt(px(12.0))
                                    .flex()
                                    .items_center()
                                    .gap(px(12.0))
                                    .child(orbit::icon("i-comando", 20.0, orbit::INK_3))
                                    .child(self.shell.query.clone()),
                            ),
                    )
                    .child(rows.flex_1().min_h_0())
                    .child(
                        div()
                            .px(px(20.0))
                            .py(px(12.0))
                            .flex_none()
                            .border_t_1()
                            .border_color(rgba(orbit::LINE))
                            .child(orbit::text(
                                "↑ ↓ Navegar · Enter Ejecutar · Esc Cerrar",
                                11.5,
                                400,
                                orbit::INK_3,
                            )),
                    ),
            )
    }
}
