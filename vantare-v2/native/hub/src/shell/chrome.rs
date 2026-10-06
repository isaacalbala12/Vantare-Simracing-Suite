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
    pub sidebar_open: bool,
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
    pub(super) rail_scroll: ScrollHandle,
    pub(super) rail_focus: Vec<FocusHandle>,
    pub(super) rail_sections: Vec<Section>,
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
        let query =
            cx.new(|cx| Input::new(query_text.clone(), "Busca una sección o una acción…", cx));
        let context_query = cx.new(|cx| Input::new(String::new(), "Buscar en el contexto", cx));
        for input in [&query, &context_query] {
            cx.observe(input, |_, _, cx| cx.notify()).detach();
        }
        let rail_sections = navigation::BETA_RAIL.to_vec();
        let rail_focus = rail_sections.iter().map(|_| cx.focus_handle()).collect();
        Self {
            access,
            sidebar_open: true,
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
            rail_focus,
            rail_sections,
        }
    }
}

impl Hub {
    pub(super) fn launch_favorite(&mut self, cx: &mut Context<Self>) {
        if self.launcher.read(cx).launch_progress().is_some() {
            return;
        }
        if let Some(id) = self.launcher.read(cx).default_profile_id() {
            self.launch_profile(&id, cx);
        } else {
            self.navigate(Section::Launcher, cx);
        }
    }
    pub(super) fn navigate(&mut self, section: Section, cx: &mut Context<Self>) {
        if let Err(reason) = self.shell.access.beta_navigate(&mut self.section, section) {
            self.shell.navigation_notice = Some(format!("{} · {reason}", section.label()));
        } else {
            self.shell.navigation_notice = None;
            self.shell.context_query.update(cx, Input::clear);
        }
        cx.notify();
    }

    pub(super) fn toggle_palette(&mut self, window: &mut Window, cx: &mut Context<Self>) {
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
        let mut items = navigation::beta_commands(self.shell.access, &self.shell.last_query);
        items.retain(|item| {
            item.command != Command::Navigate(Section::Testing)
                || self.shell.rail_sections.contains(&Section::Testing)
        });
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
        if key.modifiers.control && key.key.eq_ignore_ascii_case("b") {
            self.shell.sidebar_open = !self.shell.sidebar_open;
            cx.notify();
            cx.stop_propagation();
            return;
        }
        if key.modifiers.control && key.key.eq_ignore_ascii_case("l") {
            self.launch_favorite(cx);
            cx.stop_propagation();
            return;
        }
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
            let visible: Vec<_> = self
                .shell
                .rail_sections
                .iter()
                .enumerate()
                .filter(|(_, section)| self.shell.access.beta_visible(**section))
                .map(|(index, _)| index)
                .collect();
            if let Some(position) = visible.iter().position(|visible| *visible == index) {
                let next = navigation::move_cursor(position, key.key == "down", visible.len());
                self.shell.rail_focus[visible[next]].focus(window, cx);
            }
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
        self.redesign_rail(cx)
    }
    pub(super) fn avatar_initial(&self) -> String {
        self.demo.as_ref().map_or_else(
            || "·".into(),
            |demo| {
                demo.user
                    .full_name
                    .split_whitespace()
                    .take(2)
                    .filter_map(|name| name.chars().next())
                    .flat_map(char::to_uppercase)
                    .collect()
            },
        )
    }

    pub(super) fn context_column(
        &self,
        window: &Window,
        cx: &mut Context<Self>,
    ) -> gpui::Stateful<gpui::Div> {
        let width = (f32::from(window.viewport_size().width) - self.sidebar_width(cx)) / 3.0;
        let version = crate::version_label();
        self.context_column_with_content("Centro operativo", version, width, None, cx)
    }

    pub(super) fn strategy_context_column(
        &self,
        cx: &mut Context<Self>,
    ) -> gpui::Stateful<gpui::Div> {
        let content = self
            .strategy
            .update(cx, |strategy, cx| strategy.context_sidebar(cx));
        self.context_column_with_content("Estrategia", "", 255.0, Some(content), cx)
    }

    pub(super) fn analysis_context_column(
        &self,
        window: &Window,
        cx: &mut Context<Self>,
    ) -> gpui::Stateful<gpui::Div> {
        let content = crate::analysis::Analysis::context_sidebar(
            self.demo.as_ref(),
            self.capture.as_ref().map(|capture| capture.name.as_str()),
            f32::from(window.viewport_size().width) <= 1360.0,
            cx,
        );
        let version = crate::version_label();
        let width = (f32::from(window.viewport_size().width) - self.sidebar_width(cx)) / 3.0;
        self.context_column_with_content("Telemetría", version, width, Some(content), cx)
    }

    fn context_column_with_content(
        &self,
        title: &str,
        version: &str,
        width: f32,
        section_content: Option<gpui::Div>,
        cx: &mut Context<Self>,
    ) -> gpui::Stateful<gpui::Div> {
        let collapse = div()
            .id("collapse-context")
            .role(gpui::Role::Button)
            .aria_label("Ocultar columna")
            .tab_index(0)
            .size(px(26.0))
            .flex()
            .items_center()
            .justify_center()
            .cursor_pointer()
            .child(orbit::text("‹", 20.0, 400, orbit::ink_3(cx), cx))
            .on_click(cx.listener(|this, _, _, cx| {
                this.shell.column_open = false;
                cx.notify();
            }));
        let column = if self.section == Section::Strategy {
            div()
                .h_full()
                .flex_none()
                .flex()
                .flex_col()
                .px(px(10.0))
                .bg(rgb(orbit::column_bg(cx)))
                .border_r_1()
                .border_color(rgba(orbit::line(cx)))
                .child(
                    div()
                        .h(px(60.0))
                        .flex_none()
                        .flex()
                        .items_center()
                        .border_b_1()
                        .border_color(rgba(orbit::line_row(cx)))
                        .child(
                            orbit::text(title.to_owned(), 12.0, 700, orbit::ink(cx), cx).flex_1(),
                        )
                        .child(collapse),
                )
        } else {
            orbit::column_with_collapse(title, version, collapse, cx)
        }
        .w(px(width))
        .id("hub-context-column");
        self.context_blocks(column, section_content, cx)
            .w(px(width))
    }

    fn context_blocks(
        &self,
        column: gpui::Stateful<gpui::Div>,
        section_content: Option<gpui::Div>,
        cx: &mut Context<Self>,
    ) -> gpui::Stateful<gpui::Div> {
        let strategy = self.section == Section::Strategy;
        let races = div()
            .flex()
            .flex_col()
            .child(
                Self::context_heading("PRÓXIMAS CARRERAS", "Ver todas", strategy, cx)
                    .when(strategy, |heading| heading.pb(px(9.0))),
            )
            .child(
                Self::context_row("Sin salidas próximas", "", None, cx)
                    .when(strategy, |row| row.relative().left(px(1.0)).top(px(-2.0))),
            );
        let overlay = self.overlay_context(cx);
        let launcher = self.launcher_context(cx);
        let mut blocks = div()
            .id("context-blocks")
            .flex_1()
            .min_h_0()
            .flex()
            .flex_col()
            .gap(px(6.0))
            .pt(px(if strategy { 10.0 } else { 6.0 }))
            .overflow_y_scroll();
        if let Some(content) = section_content {
            blocks = blocks.child(content);
        }
        column.child(
            blocks
                // Sin Calendario (beta) no se anuncian carreras que no existen.
                .when(
                    self.shell.access.beta_visible(Section::Calendar),
                    |blocks| {
                        blocks.child(
                            Self::context_block("races", races, cx)
                                .when(strategy, |block| block.h(px(70.0)).pt(px(12.0)).pb(px(0.0))),
                        )
                    },
                )
                .child(
                    Self::context_block("overlay", overlay, cx)
                        .when(strategy, |block| block.h(px(82.0)).pt(px(15.0)).pb(px(0.0))),
                )
                .when(
                    !matches!(
                        self.section,
                        Section::Settings
                            | Section::Account
                            | Section::Licenses
                            | Section::Studio
                            | Section::Workshop
                    ),
                    |blocks| blocks.child(Self::context_block("launcher", launcher, cx)),
                ),
        )
    }

    fn overlay_context(&self, cx: &mut Context<Self>) -> gpui::Div {
        let heading = Self::context_heading(
            "PERFIL DE OVERLAY",
            "DETENIDO",
            self.section == Section::Strategy,
            cx,
        )
        .when(self.section == Section::Strategy, |heading| {
            heading.pb(px(13.0))
        });
        let Some(profile) = self.demo.as_ref().and_then(|demo| demo.overlay_profile()) else {
            return div().flex().flex_col().child(heading).child(
                Self::context_row("Sin perfiles todavía", "", None, cx)
                    .when(self.section == Section::Strategy, |row| {
                        row.relative().left(px(1.0))
                    }),
            );
        };
        let row = div()
            .id("context-overlay-profile")
            .role(gpui::Role::Button)
            .aria_label(format!("Abrir Studio con {}", profile.name))
            .aria_selected(profile.active)
            .tab_index(0)
            .min_h(px(46.0))
            .px(px(8.0))
            .py(px(6.0))
            .rounded(px(11.0))
            .flex()
            .items_center()
            .gap(px(10.0))
            .cursor_pointer()
            .when(profile.active, |row| {
                row.bg(orbit::tint(orbit::carmine(cx), 0.11))
            })
            .focus_visible(|row| row.border_1().border_color(rgb(orbit::coral(cx))))
            .child(
                div()
                    .flex_1()
                    .min_w_0()
                    .flex()
                    .flex_col()
                    .child(orbit::text(
                        profile.name.clone(),
                        13.0,
                        650,
                        orbit::ink(cx),
                        cx,
                    ))
                    .child(orbit::text(
                        profile.context_subtitle(),
                        11.0,
                        400,
                        orbit::ink_3(cx),
                        cx,
                    )),
            )
            .child(
                div()
                    .size(px(26.0))
                    .flex_none()
                    .rounded(px(8.0))
                    .bg(rgba(crate::orbit::legacy_rgba(0xffff_ff0a, cx)))
                    .flex()
                    .items_center()
                    .justify_center()
                    .child(orbit::text("▶", 9.0, 400, orbit::ink_3(cx), cx)),
            )
            .on_click(cx.listener(|this, _, _, cx| this.navigate(Section::Studio, cx)));
        div().flex().flex_col().child(heading).child(row)
    }

    fn launcher_context(&self, cx: &mut Context<Self>) -> gpui::Div {
        let heading = Self::context_heading(
            "LAUNCHER",
            "Gestionar",
            self.section == Section::Strategy,
            cx,
        );
        let mut profiles = div()
            .flex()
            .flex_col()
            .px(px(2.0))
            .gap(px(2.0))
            .when(self.section == Section::Strategy, |profiles| {
                profiles.relative().top(px(-2.0))
            });
        if let Some(demo) = &self.demo {
            for (index, profile) in demo.launcher.profiles.iter().enumerate() {
                let profile = profile.clone();
                let row = div()
                    .flex()
                    .items_center()
                    .gap(px(10.0))
                    .px(px(8.0))
                    .py(px(6.0))
                    .child(
                        div()
                            .size(px(32.0))
                            .rounded(px(8.0))
                            .bg(rgb(orbit::surface_3(cx)))
                            .flex()
                            .items_center()
                            .justify_center()
                            .child(orbit::text(
                                if profile.id == "creator" { "CC" } else { "PRO" },
                                10.0,
                                800,
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
                            .gap(px(if self.section == Section::Strategy {
                                0.0
                            } else {
                                2.0
                            }))
                            .child(
                                orbit::text(profile.name.as_str(), 13.0, 650, orbit::ink(cx), cx)
                                    .font_weight(gpui::FontWeight::NORMAL)
                                    .line_height(px(if self.section == Section::Strategy {
                                        18.0
                                    } else {
                                        19.5
                                    })),
                            )
                            .child(
                                orbit::text(
                                    format!("{} pasos", profile.steps.len()),
                                    11.0,
                                    400,
                                    orbit::ink_3(cx),
                                    cx,
                                )
                                .line_height(px(16.5)),
                            ),
                    )
                    .child(
                        div()
                            .id(("launch-profile", index))
                            .role(gpui::Role::Button)
                            .tab_index(0)
                            .size(px(26.0))
                            .rounded(px(8.0))
                            .bg(rgb(orbit::surface_2(cx)))
                            .flex()
                            .items_center()
                            .justify_center()
                            .aria_label(format!("Lanzar {}", profile.name))
                            .child(orbit::text("▶", 9.0, 700, orbit::ink_3(cx), cx))
                            .on_click(
                                cx.listener(|this, _, _, cx| this.navigate(Section::Launcher, cx)),
                            ),
                    );
                profiles = profiles.child(row);
            }
        } else {
            // Perfiles reales: se lanzan desde la columna (isa-1430 launcher-usabilidad).
            profiles = profiles.child(
                self.launcher
                    .update(cx, |launcher, cx| launcher.quick_profiles("", cx)),
            );
        }
        div().flex().flex_col().child(heading).child(profiles)
    }

    fn context_heading(title: &str, action: &str, strategy: bool, cx: &gpui::App) -> gpui::Div {
        div()
            .flex()
            .flex_wrap()
            .items_center()
            .justify_between()
            .gap(px(10.0))
            .px(px(9.0))
            .pt(px(2.5))
            .pb(px(if title == "LAUNCHER" { 11.0 } else { 7.0 }))
            .child(if strategy {
                orbit::tracked_text(title, 10.0, 750, orbit::ink_3(cx), 0.8, cx)
            } else {
                orbit::eyebrow(title, cx)
            })
            .child(if action == "DETENIDO" {
                div()
                    .px(px(8.0))
                    .py(px(3.0))
                    .rounded_full()
                    .bg(rgba(crate::orbit::legacy_rgba(0xffff_ff0a, cx)))
                    .child(
                        div()
                            .flex()
                            .gap(px(0.63))
                            .children(action.chars().map(|letter| {
                                orbit::mono_text(letter.to_string(), 10.5, orbit::ink_3(cx), cx)
                                    .font_weight(gpui::FontWeight(750.0))
                                    .line_height(px(15.75))
                            })),
                    )
            } else {
                orbit::text(action, 11.5, 400, orbit::ink_3(cx), cx)
            })
    }

    fn context_row(title: &str, subtitle: &str, badge: Option<&str>, cx: &gpui::App) -> gpui::Div {
        div()
            .flex()
            .items_center()
            .justify_between()
            .gap(px(8.0))
            .px(px(9.0))
            .pb(px(4.0))
            .child(orbit::text(title, 12.5, 400, orbit::ink_3(cx), cx))
            .when(!subtitle.is_empty(), |row| {
                row.child(orbit::text(subtitle, 11.0, 400, orbit::ink_3(cx), cx))
            })
            .when_some(badge, |row, label| {
                row.child(orbit::text(label, 10.0, 700, orbit::ink_3(cx), cx))
            })
    }

    fn context_block(
        id: &'static str,
        content: gpui::Div,
        cx: &gpui::App,
    ) -> gpui::Stateful<gpui::Div> {
        div()
            .id(id)
            .w_full()
            .min_w_0()
            .flex()
            .flex_col()
            .pt(px(10.0))
            .pb(px(4.0))
            .border_t_1()
            .border_color(rgba(orbit::line_row(cx)))
            .child(content)
    }

    fn update_bell_anchor(
        notifications: &gpui::Entity<crate::notifications::Notifications>,
        bounds: gpui::Bounds<gpui::Pixels>,
        cx: &mut gpui::App,
    ) {
        let notifications = notifications.clone();
        cx.defer(move |cx| {
            notifications.update(cx, |center, cx| {
                let changed = center.bell_bounds != Some(bounds);
                center.bell_bounds = Some(bounds);
                if let Some(layer) = center.popover() {
                    let position = gpui::point(
                        bounds.origin.x + bounds.size.width - px(crate::notifications::PANEL_WIDTH),
                        bounds.origin.y + bounds.size.height + px(8.0),
                    );
                    layer.update(cx, |layer, cx| layer.set_popover_position(position, cx));
                }
                if changed {
                    cx.notify();
                }
            });
        });
    }

    fn notification_bell(&mut self, cx: &mut Context<Self>) -> gpui::Div {
        if self.shell.notification_subscription.is_none() {
            self.shell.notification_subscription =
                Some(cx.observe(&self.notifications, |_, _, cx| cx.notify()));
        }
        div().flex().items_center().gap(px(orbit::MENU_PAD)).child(
            orbit::rail_button(
                "notifications",
                "i-campana",
                "Notificaciones",
                false,
                None,
                cx,
            )
            .size(px(28.0))
            .bg(rgba(0x0000_0000))
            .when(self.notifications.read(cx).popover_open(cx), |bell| {
                bell.bg(rgba(crate::orbit::legacy_rgba(0xffff_ff0a, cx)))
            })
            .when(self.notifications.read(cx).unread() > 0, |bell| {
                bell.child(
                    div()
                        .absolute()
                        .top(gpui::px(-4.0))
                        .right(gpui::px(-4.0))
                        .min_w(gpui::px(18.0))
                        .h(gpui::px(18.0))
                        .px(gpui::px(3.0))
                        .rounded_full()
                        .border_2()
                        .border_color(rgb(orbit::canvas(cx)))
                        .bg(orbit::gradient(
                            cx.global::<orbit::design::Tokens>().gradients.button,
                            135.0,
                        ))
                        .flex()
                        .items_center()
                        .justify_center()
                        .child(orbit::text(
                            self.notifications.read(cx).unread().to_string(),
                            10.0,
                            600,
                            0x00ff_ffff,
                            cx,
                        )),
                )
            })
            .child({
                let notifications = self.notifications.clone();
                // Mismo seguimiento de ancla que el dropdown Orbit.
                gpui::canvas(
                    move |bounds, _, cx| {
                        Self::update_bell_anchor(&notifications, bounds, cx);
                    },
                    |_, (), _, _| {},
                )
                .absolute()
                .inset_0()
                .size(px(28.0))
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
    }

    /// `section_actions` pertenece a la sección; la campana y la versión son comunes.
    pub(super) fn topbar(
        &mut self,
        window: &Window,
        section_actions: Option<gpui::AnyElement>,
        cx: &mut Context<Self>,
    ) -> gpui::Div {
        let narrow = f32::from(window.viewport_size().width) <= orbit::COLUMN_BREAKPOINT;
        let breadcrumb = if matches!(self.section, Section::Account | Section::Licenses) {
            Section::Account
        } else {
            self.section
        };
        let action = {
            let bell = self.notification_bell(cx);
            div()
                .flex()
                .items_center()
                .gap(px(10.0))
                .child(orbit::pill(
                    if self.previous_source == Some(true) {
                        "LMU conectado"
                    } else {
                        "Esperando simulador"
                    },
                    if self.previous_source == Some(true) {
                        orbit::Tone::Success
                    } else {
                        orbit::Tone::Neutral
                    },
                    cx,
                ))
                .child(bell)
                .child(orbit::pill(
                    crate::version_label(),
                    orbit::Tone::Neutral,
                    cx,
                ))
                .into_any_element()
        };
        orbit::topbar_with_actions(
            if matches!(
                self.section,
                Section::Settings | Section::Strategy | Section::Engineer
            ) {
                ""
            } else {
                navigation::trail(breadcrumb)
            },
            navigation::title(breadcrumb),
            section_actions,
            action,
            self.section == Section::Studio && f32::from(window.viewport_size().width) <= 1360.0,
            cx,
        )
        .px(px(if narrow { 16.0 } else { orbit::TOPBAR_GUTTER }))
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
            .aria_label(if items.is_empty() {
                "Sin resultados"
            } else {
                "Resultados de comandos"
            })
            .max_h(px(f32::from(window.viewport_size().height) * 0.46))
            .overflow_y_scroll()
            .track_scroll(&self.shell.scroll)
            .p(px(10.0));
        let mut previous_group = None;
        for (index, item) in items.iter().enumerate() {
            let destination = matches!(item.command, Command::Navigate(_));
            if previous_group != Some(destination) {
                let heading = if destination { "IR A" } else { "ACCIONES" };
                rows = rows.child(div().px(px(12.0)).py(px(9.0)).child(orbit::tracked_text(
                    heading,
                    10.5,
                    850,
                    orbit::ink_muted(cx),
                    1.365,
                    cx,
                )));
                previous_group = Some(destination);
            }
            let command = item.command.clone();
            rows = rows.child(
                orbit::palette_item(index, index == self.shell.cursor, cx)
                    .aria_label(format!(
                        "{} · {}",
                        item.label,
                        item.locked.unwrap_or(item.meta)
                    ))
                    .child(
                        div()
                            .size(px(36.0))
                            .flex_none()
                            .rounded(px(10.0))
                            .bg(orbit::tint(orbit::carmine(cx), 0.09))
                            .flex()
                            .items_center()
                            .justify_center()
                            .child(orbit::icon(item.icon, 14.0, orbit::coral(cx))),
                    )
                    .child(
                        orbit::text(
                            item.label.clone(),
                            16.0,
                            400,
                            if index == self.shell.cursor {
                                orbit::ink(cx)
                            } else {
                                orbit::ink_2(cx)
                            },
                            cx,
                        )
                        .flex_1()
                        .min_w_0(),
                    )
                    .child(orbit::text(
                        item.locked.unwrap_or(item.meta),
                        10.5,
                        400,
                        orbit::ink_4(cx),
                        cx,
                    ))
                    .when(item.locked.is_some(), |row| {
                        row.child(orbit::icon("i-lock", 13.0, orbit::ink_muted(cx)))
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
            .bg(rgba(orbit::palette_backdrop(cx)))
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
                    .bg(rgb(orbit::surface_1(cx)))
                    .border_1()
                    .border_color(rgba(orbit::line_strong(cx)))
                    .rounded(px(orbit::FEATURED_RADIUS))
                    .shadow(orbit::layer_shadow(true, cx))
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
                            .h(px(75.0))
                            .flex_none()
                            .px(px(21.0))
                            .flex()
                            .items_center()
                            .gap(px(16.0))
                            .border_b_1()
                            .border_color(rgba(orbit::line(cx)))
                            .child(orbit::icon("i-comando", 20.0, orbit::ink_4(cx)))
                            .child(self.shell.query.clone()),
                    )
                    .child(rows.flex_1().min_h_0())
                    .child(
                        div()
                            .h(px(44.0))
                            .px(px(17.0))
                            .flex_none()
                            .flex()
                            .items_center()
                            .gap(px(16.0))
                            .border_t_1()
                            .border_color(rgba(orbit::line(cx)))
                            .child(orbit::text(
                                "↑↓ navegar",
                                10.5,
                                400,
                                orbit::ink_muted(cx),
                                cx,
                            ))
                            .child(orbit::text(
                                "↵ ejecutar",
                                10.5,
                                400,
                                orbit::ink_muted(cx),
                                cx,
                            ))
                            .child(orbit::text(
                                "Los destinos bloqueados muestran el motivo",
                                10.5,
                                400,
                                orbit::ink_muted(cx),
                                cx,
                            )),
                    ),
            )
    }
}
