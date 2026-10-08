//! Shell GPUI independiente: flanco IPC y EOF opcional para desarrollo.
use std::io::Read;
use std::path::PathBuf;
use std::sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
};
use std::time::{Duration, Instant};

use gpui::{
    App, Context, Entity, FocusHandle, IntoElement, Render, Window, WindowOptions, div, prelude::*,
    px,
};
use vantare_ipc::Subscriber;

use crate::{
    Section,
    analysis::Analysis,
    calendar::Calendar,
    engineer::Engineer,
    launcher::{Store as LauncherStore, view::Launcher},
    notifications::Notifications,
    orbit,
    strategy::Strategy,
    studio::{Prepared as PreparedStudio, Studio},
    workshop::{Prepared, Workshop},
};

use crate::testing::{self, Testing, diagnostic::Module as TestingModule};
mod assets;
mod chrome;
mod foundations;
mod input;
pub mod navigation;
#[path = "settings/mod.rs"]
mod settings;
mod sidebar;

pub struct Options {
    pub controlled: bool,
    pub data_dir: PathBuf,
    pub scene: Option<PathBuf>,
    pub layout: PathBuf,
    pub engineer: PathBuf,
    pub section: Section,
    pub pipe: Option<String>,
    pub recordings: Option<PathBuf>,
    pub launcher_file: PathBuf,
    pub demo: Option<crate::demo::DemoData>,
    pub capture: Option<crate::demo::CaptureState>,
    pub capture_output: Option<PathBuf>,
    pub capture_appearance: Option<orbit::theme::AppearanceSettings>,
    pub capture_size: Option<(u32, u32)>,
    pub capture_zoom: Option<u16>,
}

struct Hub {
    section: Section,
    shell: chrome::State,
    demo: Option<crate::demo::DemoData>,
    capture: Option<crate::demo::CaptureState>,
    focus: FocusHandle,
    workshop: Entity<Workshop>,
    studio: Entity<Studio>,
    calendar: Entity<Calendar>,
    analysis: Entity<Analysis>,
    launcher: Entity<Launcher>,
    engineer: Entity<Engineer>,
    notifications: Entity<Notifications>,
    strategy: Entity<Strategy>,
    remote: Entity<crate::services::view::Remote>,
    testing: Entity<Testing>,
    settings: settings::State,
    home_previews: foundations::Previews,
    home_profile: Entity<orbit::Choice>,
    status: Option<String>,
    subscriber: Subscriber,
    previous_source: Option<bool>,
    close_requested: bool,
}

impl Hub {
    fn save(&mut self, cx: &mut Context<Self>) -> Result<(), String> {
        // Studio confirma cada edición; guarda también los borradores locales pendientes.
        self.remote.update(cx, |remote, cx| remote.persist(cx))?;
        self.strategy.update(cx, |strategy, _| strategy.persist())?;
        self.testing.update(cx, |testing, _| testing.persist())?;
        self.workshop.update(cx, |workshop, _| workshop.persist())
    }

    fn poll_source(&mut self, cx: &mut Context<Self>) {
        self.poll_beta_update(cx);
        if self.capture.is_none() {
            let access = self.remote.update(cx, |remote, cx| {
                remote.refresh_license(cx);
                remote.navigation_access()
            });
            if self.shell.access != access {
                self.shell.access = access;
                cx.notify();
            }
        }
        self.notifications.update(cx, |notifications, cx| {
            notifications.set_tester(self.shell.access.beta_visible(Section::Testing), cx);
        });
        if self
            .launcher
            .update(cx, |launcher, _| launcher.take_exit_cancelled())
        {
            self.close_requested = false;
            self.cancel_beta_restart();
        }
        if !self.shell.access.beta_visible(self.section) {
            self.section = Section::Home;
        }
        if self.close_requested && self.can_close(cx) {
            cx.quit();
            return;
        }
        if let Some(snapshot) = self.subscriber.next(Duration::ZERO) {
            self.home_previews.ingest(&snapshot, cx);
            self.testing
                .update(cx, |testing, _| testing.observed.snapshot(&snapshot));
            let signing_in = self.remote.read(cx).holds_hub_in_game();
            let close = crate::lifecycle::should_close(self.previous_source, &snapshot, signing_in);
            let observed = Some(crate::lifecycle::is_live(&snapshot));
            let changed = self.previous_source != observed;
            self.previous_source = observed;
            if self.section == Section::Home || changed {
                cx.notify();
            }
            if close {
                // Live solicita el mismo cierre protegido que el botón y la ventana.
                self.close(cx);
            }
        }
        let activity = self.subscriber.activity();
        let errors = [
            (TestingModule::Hub, self.status.as_deref()),
            (
                TestingModule::Workshop,
                self.workshop.read(cx).scene.error.as_deref(),
            ),
            (
                TestingModule::Launcher,
                self.launcher.read(cx).error.as_deref(),
            ),
            (
                TestingModule::Calendar,
                self.calendar.read(cx).error.as_deref(),
            ),
            (
                TestingModule::Strategy,
                self.strategy.read(cx).error.as_deref(),
            ),
            (
                TestingModule::Engineer,
                self.engineer.read(cx).error.as_deref(),
            ),
            (
                TestingModule::Notifications,
                self.notifications.read(cx).error.as_deref(),
            ),
        ]
        .map(|(module, error)| (module, error.map(testing::diagnostic::error_code)));
        self.testing.update(cx, |testing, _| {
            testing.observed.activity(activity, Instant::now());
            for (module, error) in errors {
                if let Some(error) = error {
                    testing.observed.section_error(module, error);
                }
            }
        });
    }

    fn close(&mut self, cx: &mut Context<Self>) {
        if self.can_close(cx) {
            cx.quit();
        }
    }

    fn can_close(&mut self, cx: &mut Context<Self>) -> bool {
        self.close_requested = true;
        if !self.launcher.update(cx, Launcher::can_close) {
            return false;
        }
        match self.save(cx) {
            Ok(()) => {
                if let Some(root) = std::env::var_os("VANTARE_BETA_ROOT") {
                    let state = if self.previous_source == Some(true) {
                        "live"
                    } else {
                        "idle"
                    };
                    if let Err(error) = std::fs::write(PathBuf::from(root).join("hub-exit"), state)
                    {
                        self.status = Some(format!("registrar cierre beta: {error}"));
                        self.close_requested = false;
                        self.cancel_beta_restart();
                        cx.notify();
                        return false;
                    }
                }
                true
            }
            Err(error) => {
                self.notifications.update(cx, |center, cx| {
                    center.report("hub.save", error.clone(), cx);
                });
                self.status = Some(error);
                self.close_requested = false;
                self.cancel_beta_restart();
                cx.notify();
                false
            }
        }
    }

    #[allow(clippy::too_many_lines)] // Composición de las dos páginas de módulos, sin lógica adicional.
    fn upcoming_page(&self, cx: &mut Context<Self>) -> gpui::Div {
        let (description, icon, features) = if self.section == Section::Strategy {
            (
                "Prepara tus decisiones antes de salir a pista.",
                "v-strategy",
                [
                    (
                        "v-launch",
                        "Plan de paradas",
                        "Organiza tus pasos por boxes. Prepara la secuencia de paradas antes de salir a pista.",
                    ),
                    (
                        "v-gauge",
                        "Combustible y desgaste",
                        "Compara lo que necesitas para cada stint. Revisa el consumo y la duración prevista.",
                    ),
                    (
                        "v-sliders",
                        "Ajustes en carrera",
                        "Revisa el plan cuando cambie la carrera. Adapta tus decisiones a lo que ocurre en pista.",
                    ),
                ],
            )
        } else {
            (
                "Una ayuda para concentrarte en la carrera.",
                "v-engineer",
                [
                    (
                        "v-engineer",
                        "Avisos de voz en pista",
                        "La información clave, sin apartar la vista. Escucha los avisos mientras te concentras en conducir.",
                    ),
                    (
                        "v-side",
                        "Spotter",
                        "Una ayuda para situar los coches a tu alrededor. Sigue el tráfico cercano durante la carrera.",
                    ),
                    (
                        "v-testing",
                        "Informes de carrera",
                        "Repasa lo ocurrido al terminar. Consulta los momentos clave de tu sesión.",
                    ),
                ],
            )
        };
        let mut cards = div().flex().flex_none().gap(gpui::px(20.0));
        for (feature_icon, title, description) in features {
            cards = cards.child(
                orbit::neo_card(cx)
                    .flex_1()
                    .items_start()
                    .gap(gpui::px(12.0))
                    .child(orbit::icon(feature_icon, 40.0, orbit::carmine(cx)))
                    .child(orbit::text(title, 18.0, 600, orbit::ink(cx), cx))
                    .child(orbit::text(description, 14.0, 400, orbit::ink_2(cx), cx)),
            );
        }
        div()
            .h_full()
            .min_h_0()
            .flex()
            .flex_col()
            .gap(gpui::px(20.0))
            .child(
                orbit::neo_card(cx)
                    .flex_none()
                    .items_start()
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .gap(gpui::px(16.0))
                            .child(orbit::icon(icon, 44.0, orbit::carmine(cx)))
                            .child(orbit::text(
                                navigation::title(self.section),
                                30.0,
                                600,
                                orbit::ink(cx),
                                cx,
                            ))
                            .child(orbit::pill("Próximamente", orbit::Tone::Neutral, cx)),
                    )
                    .child(orbit::text(description, 16.0, 400, orbit::ink_2(cx), cx)),
            )
            .child(orbit::text(
                "Qué podrás hacer",
                18.0,
                600,
                orbit::ink(cx),
                cx,
            ))
            .child(cards)
            .child(
                orbit::neo_card(cx)
                    .flex_1()
                    .min_h_0()
                    .items_start()
                    .child(orbit::neo_header("Síguelo en el Roadmap", "v-roadmap", cx))
                    .child(
                        div()
                            .flex_1()
                            .min_h_0()
                            .w_full()
                            .flex()
                            .items_center()
                            .justify_center()
                            .gap(gpui::px(32.0))
                            .child(orbit::icon(icon, 100.0, orbit::ink_3(cx)))
                            .child(
                                div()
                                    .flex()
                                    .flex_col()
                                    .gap(gpui::px(12.0))
                                    .child(orbit::text(
                                        navigation::title(self.section),
                                        28.0,
                                        600,
                                        orbit::ink(cx),
                                        cx,
                                    ))
                                    .child(orbit::text(
                                        "Preparar · En pista · Revisar",
                                        14.0,
                                        400,
                                        orbit::ink_2(cx),
                                        cx,
                                    ))
                                    .child(orbit::pill("Próximamente", orbit::Tone::Neutral, cx)),
                            ),
                    )
                    .child(orbit::text(
                        "Consulta los avances y las novedades del módulo.",
                        14.0,
                        400,
                        orbit::ink_2(cx),
                        cx,
                    ))
                    .child(
                        orbit::button("upcoming-roadmap", "Ver Roadmap", cx).on_click(
                            cx.listener(|this, _, _, cx| this.navigate(Section::Roadmap, cx)),
                        ),
                    ),
            )
    }

    /// Contenido de la sección activa; las que aún no existen dicen qué falta.
    fn section_view(&self, window: &Window, cx: &mut Context<Self>) -> gpui::AnyElement {
        if matches!(self.section, Section::Strategy | Section::Engineer) {
            return self.upcoming_page(cx).into_any_element();
        }
        if let Some(reason) = self.shell.access.beta_lock(self.section) {
            return orbit::callout(
                format!(
                    "{} · {reason}. Abre Cuenta para consultar el acceso.",
                    self.section.label()
                ),
                cx,
            )
            .into_any_element();
        }
        match self.section {
            Section::Workshop => self.workshop.clone().into_any_element(),
            Section::Studio => self.studio.clone().into_any_element(),
            Section::Engineer => self.engineer.clone().into_any_element(),
            Section::Calendar => self.calendar.clone().into_any_element(),
            Section::Analysis => self.analysis.clone().into_any_element(),
            Section::Launcher => self.launcher.clone().into_any_element(),
            Section::Strategy => self.strategy.clone().into_any_element(),
            Section::Notifications => self.notifications.clone().into_any_element(),
            Section::Settings => self.settings(window, cx).into_any_element(),
            Section::Testing => self.testing.clone().into_any_element(),
            Section::Home => self.foundation_home(window, cx).0.into_any_element(),
            Section::Account => self
                .remote
                .update(cx, |remote, cx| remote.account(window, cx))
                .into_any_element(),
            Section::Licenses => self
                .remote
                .update(cx, |remote, cx| remote.licenses(window, cx))
                .into_any_element(),
            Section::Roadmap => self
                .remote
                .update(cx, |remote, cx| remote.roadmap(window, cx))
                .into_any_element(),
        }
    }

    fn render_content(
        &mut self,
        window: &Window,
        page: Option<gpui::AnyElement>,
        cx: &mut Context<Self>,
    ) -> gpui::AnyElement {
        let adapt = *cx.global::<orbit::Adapt>();
        let (top, side, bottom) = adapt.padding();
        // Páginas que se reparten el alto sin scroll propio (R9.5).
        let fills = matches!(
            self.section,
            Section::Home
                | Section::Strategy
                | Section::Engineer
                | Section::Roadmap
                | Section::Notifications
                | Section::Studio
                | Section::Launcher
                | Section::Settings
                | Section::Account
                | Section::Licenses
                | Section::Testing
                | Section::Calendar
        );
        let header = match self.section {
            Section::Settings => Some(self.settings_header(cx)),
            Section::Studio => Some(
                div().pt(px(top)).child(
                    self.studio
                        .update(cx, |studio, cx| studio.topbar_actions(cx)),
                ),
            ),
            Section::Testing if self.shell.access.beta_lock(self.section).is_none() => {
                Some(self.testing.update(cx, |_, cx| Testing::page_header(cx)))
            }
            Section::Calendar if self.shell.access.beta_lock(self.section).is_none() => {
                Some(self.calendar.update(cx, |_, cx| Calendar::page_header(cx)))
            }
            _ => None,
        };
        div()
            .when(fills, |content| content.h_full().min_h_0().min_w_0())
            .flex_1()
            .flex()
            .flex_col()
            .when(self.section != Section::Launcher, |content| {
                content
                    .gap(px(adapt.gap()))
                    .pt(px(top))
                    .px(px(side))
                    .pb(px(bottom))
            })
            .when(self.section == Section::Studio, |content| {
                content.pt(px(0.0))
            })
            .when_some(header, gpui::ParentElement::child)
            .when_some(self.status.clone(), |content, status| {
                content.child(orbit::callout(status, cx))
            })
            .when_some(self.shell.navigation_notice.clone(), |content, notice| {
                content.child(orbit::callout(notice, cx))
            })
            .child(match page {
                Some(page) => page,
                None => self.section_view(window, cx),
            })
            .into_any_element()
    }

    fn render_fullscreen(&self, window: &mut Window, cx: &mut Context<Self>) -> gpui::AnyElement {
        if self
            .capture
            .as_ref()
            .is_some_and(|capture| capture.name == "workshop-detalle")
        {
            self.workshop.read(cx).scroll_to_detail();
        }
        div()
            .id("hub")
            .track_focus(&self.focus)
            .tab_group()
            .tab_stop(false)
            .capture_key_down(cx.listener(Self::shell_key))
            .size_full()
            .relative()
            .child(self.section_view(window, cx))
            .when_some(self.status.clone(), |root, status| {
                root.child(
                    orbit::callout(status, cx)
                        .absolute()
                        .top(gpui::px(52.0))
                        .left(gpui::px(280.0)),
                )
            })
            .when(self.shell.palette_open, |root| {
                root.child(self.palette(window, cx))
            })
            .into_any_element()
    }

    /// Controles propios de la sección para la ranura de la barra superior.
    fn section_actions(&mut self, cx: &mut Context<Self>) -> Option<gpui::AnyElement> {
        if matches!(self.section, Section::Strategy | Section::Engineer) {
            return None;
        }

        match self.section {
            Section::Launcher => Some(self.launcher.update(cx, |launcher, cx| {
                launcher.topbar_tabs(cx).into_any_element()
            })),
            Section::Settings => Some(self.settings_tabs(cx).into_any_element()),
            Section::Testing => Some(self.testing.read(cx).topbar_controls().into_any_element()),
            Section::Calendar => Some(
                self.calendar
                    .update(cx, |calendar, cx| calendar.topbar_controls(cx))
                    .into_any_element(),
            ),
            _ => None,
        }
    }

    /// Secciones de la barra derecha acoplada (R10.2) de la página activa. Las
    /// columnas heredadas entran como una sección sin cabecera hasta su ronda.
    fn rail_sections(
        &mut self,
        window: &mut Window,
        strategy_context_visible: bool,
        home: Vec<orbit::RailSection>,
        cx: &mut Context<Self>,
    ) -> Vec<orbit::RailSection> {
        let icon = navigation::icon(self.section);
        let legacy = |body: gpui::AnyElement| {
            vec![orbit::RailSection::new("", icon, body).headless().grow()]
        };
        if matches!(self.section, Section::Testing | Section::Calendar)
            && self.shell.access.beta_lock(self.section).is_some()
        {
            return Vec::new();
        }
        match self.section {
            Section::Home => home,
            Section::Launcher => self
                .launcher
                .update(cx, |launcher, cx| launcher.rail_sections(window, cx)),
            Section::Settings => self.settings_rail(cx),
            Section::Testing => legacy(
                self.testing
                    .update(cx, |testing, cx| testing.context_column(cx))
                    .into_any_element(),
            ),
            Section::Calendar => legacy(
                self.calendar
                    .update(cx, |calendar, cx| calendar.context_column(cx))
                    .into_any_element(),
            ),
            Section::Studio if self.studio.read(cx).inspector_visible() => {
                legacy(self.studio.read(cx).context_column().into_any_element())
            }
            Section::Analysis => {
                legacy(self.analysis_context_column(window, cx).into_any_element())
            }
            Section::Strategy if strategy_context_visible => {
                legacy(self.strategy_context_column(cx).into_any_element())
            }
            Section::Notifications => legacy(self.context_column(window, cx).into_any_element()),
            _ => Vec::new(),
        }
    }

    /// Barra derecha: secciones con cabecera y separador; recogida, franja de 56 con iconos.
    fn right_bar(&self, sections: Vec<orbit::RailSection>, cx: &mut Context<Self>) -> gpui::Div {
        let adapt = *cx.global::<orbit::Adapt>();
        let skin = orbit::skin(cx).clone();
        let frame = div()
            .h_full()
            .min_h_0()
            .flex_none()
            .flex()
            .flex_col()
            .bg(orbit::ramp(skin.sidebar, 180.0))
            .border_l_1()
            .border_color(orbit::alpha(skin.sidebar_line));
        if !adapt.rail_open {
            let mut strip = frame
                .w(px(orbit::adapt::RAIL_STRIP_W))
                .items_center()
                .gap(px(6.0))
                .py(px(8.0))
                .child(
                    orbit::icon_button("rail-open", "v-side", "Abrir panel derecho", 40.0, cx)
                        .on_click(cx.listener(|hub, _, _, cx| {
                            hub.shell.column_open = true;
                            cx.notify();
                        })),
                )
                .child(
                    div()
                        .w(px(24.0))
                        .h(px(1.0))
                        .my(px(4.0))
                        .bg(orbit::alpha(skin.line2)),
                );
            for (index, section) in sections.iter().enumerate() {
                let label = if section.title.is_empty() {
                    navigation::title(self.section).to_owned()
                } else {
                    section.title.to_string()
                };
                strip = strip.child(
                    orbit::icon_button(("rail-strip", index), section.icon, &label, 40.0, cx)
                        .on_click(cx.listener(|hub, _, _, cx| {
                            hub.shell.column_open = true;
                            cx.notify();
                        })),
                );
            }
            return strip;
        }
        let (_, _, bottom) = adapt.padding();
        let count = sections.len();
        let mut bar = frame
            .id("right-bar")
            .w(px(adapt.rail_width()))
            .pt(px(6.0))
            .pb(px(bottom))
            .overflow_hidden();
        for (index, section) in sections.into_iter().enumerate() {
            let last = index + 1 == count;
            let mut block = div()
                .min_w_0()
                .flex()
                .flex_col()
                .when(!last, |block| {
                    block
                        .flex_none()
                        .border_b_1()
                        .border_color(orbit::alpha(skin.line1))
                })
                .when(last || section.grow, |block| {
                    block.flex_1().min_h_0().overflow_hidden()
                });
            if !section.headless {
                block = block.child(div().pt(px(14.0)).px(px(18.0)).pb(px(12.0)).child(
                    orbit::section_header(&section.title, section.icon, section.action, cx),
                ));
            }
            block = block.child(
                div()
                    .min_w_0()
                    .flex()
                    .flex_col()
                    .when(!section.headless, |body| body.px(px(16.0)).pb(px(12.0)))
                    .when(last || section.grow, |body| body.flex_1().min_h_0())
                    .child(section.body),
            );
            bar = bar.child(block);
        }
        div().h_full().flex_none().child(bar)
    }
}

impl Render for Hub {
    #[allow(clippy::too_many_lines)] // Compone el marco común en una sola raíz.
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        if self.capture.is_none() && self.remote.read(cx).requires_access() {
            return self
                .remote
                .update(cx, |remote, cx| remote.access_screen(&self.focus, cx))
                .into_any_element();
        }
        let viewport = window.viewport_size();
        let adapt = orbit::Adapt::new(
            f32::from(viewport.width),
            f32::from(viewport.height),
            self.shell.sidebar_pref,
            self.shell.column_open,
        );
        cx.set_global(adapt);
        self.refresh_query(cx);
        if presentation(self.section) == Presentation::Fullscreen {
            return self.render_fullscreen(window, cx);
        }
        let skin = orbit::skin(cx).clone();
        let rail = self.rail(cx);
        let section_actions = self.section_actions(cx);
        let topbar = self.topbar(window, section_actions, cx);
        if self
            .capture
            .as_ref()
            .is_some_and(|capture| capture.notifications_open)
            && self.notifications.read(cx).bell_bounds.is_some()
            && !self.notifications.read(cx).popover_open(cx)
        {
            self.notifications
                .update(cx, |center, cx| center.toggle_popover(window, cx));
        }
        let strategy_context_visible =
            self.section == Section::Strategy && self.strategy.read(cx).context_sidebar_visible();
        let (page, home) = if self.section == Section::Home {
            let (page, rail) = self.foundation_home(window, cx);
            (Some(page.into_any_element()), rail)
        } else {
            (None, Vec::new())
        };
        let sections = self.rail_sections(window, strategy_context_visible, home, cx);
        let content = self.render_content(window, page, cx);
        let right = (!sections.is_empty()).then(|| self.right_bar(sections, cx));
        let below = adapt.rail_below();
        let body = div()
            .id("hub-body")
            .flex_1()
            .min_h_0()
            .flex()
            .when(below, |body| body.flex_col().overflow_y_scroll())
            .child(
                div()
                    .id("hub-content")
                    .min_w_0()
                    .flex_1()
                    .min_h_0()
                    .flex()
                    .flex_col()
                    .when(below, gpui::Styled::flex_none)
                    .child(content),
            )
            .when_some(right, |body, right| {
                body.child(if below {
                    right.w_full().h(px(adapt.height * 0.6))
                } else {
                    right
                })
            });
        let main = div()
            .relative()
            .flex_1()
            .flex()
            .flex_col()
            .min_w_0()
            .min_h_0()
            .child(
                // Lavado superior del área (R9.1): capa de 2 paradas detrás del contenido.
                div()
                    .absolute()
                    .top_0()
                    .left_0()
                    .right_0()
                    .h(px(skin.wash_h))
                    .bg(gpui::linear_gradient(
                        180.0,
                        gpui::linear_color_stop(orbit::alpha(skin.wash), 0.0),
                        gpui::linear_color_stop(orbit::alpha(skin.wash & 0xffff_ff00), 1.0),
                    )),
            )
            .child(topbar)
            .child(body);
        let background = if self.section == Section::Strategy
            && self.shell.access.beta_lock(self.section).is_none()
        {
            self.strategy
                .read(cx)
                .garage_background(f32::from(window.viewport_size().width), cx)
        } else {
            None
        };
        let frame = div()
            .id("hub")
            .track_focus(&self.focus)
            .tab_group()
            .tab_stop(false)
            .capture_key_down(cx.listener(Self::shell_key))
            .size_full()
            .relative()
            .flex()
            .bg(orbit::ramp(skin.window, 155.0))
            .text_color(gpui::rgb(orbit::ink(cx)))
            .font_family(crate::orbit::sans_override("Inter W400", cx))
            .font_features(orbit::tabular_numbers())
            .when_some(background, gpui::ParentElement::child)
            .child(rail)
            .child(main)
            .when(self.section == Section::Launcher, |root| {
                root.when_some(
                    self.launcher
                        .update(cx, |launcher, cx| launcher.form_layer(window, cx)),
                    gpui::ParentElement::child,
                )
            })
            .when(self.shell.palette_open, |root| {
                root.child(self.palette(window, cx))
            })
            .when_some(self.notifications.read(cx).popover(), |root, layer| {
                root.child(div().absolute().inset_0().size_full().child(layer))
            });
        frame.into_any_element()
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Presentation {
    Framed,
    Fullscreen,
}

fn presentation(section: Section) -> Presentation {
    match section {
        Section::Workshop => Presentation::Fullscreen,
        _ => Presentation::Framed,
    }
}

fn watch_stdin(controlled: bool) -> Result<Arc<AtomicBool>, String> {
    let stop = Arc::new(AtomicBool::new(false));
    if controlled {
        let stop = stop.clone();
        std::thread::Builder::new()
            .name("hub-stdin".into())
            .spawn(move || {
                let mut buffer = [0; 256];
                loop {
                    match std::io::stdin().read(&mut buffer) {
                        Ok(0) | Err(_) => {
                            stop.store(true, Ordering::Release);
                            break;
                        }
                        Ok(_) => {}
                    }
                }
            })
            .map_err(|e| format!("supervisar stdin: {e}"))?;
    }
    Ok(stop)
}

fn start_source_poll(cx: &mut Context<Hub>) {
    cx.spawn(async move |this, cx| {
        loop {
            if this.update(cx, Hub::poll_source).is_err() {
                break;
            }
            cx.background_executor()
                .timer(Duration::from_millis(100))
                .await;
        }
    })
    .detach();
}

fn wire_sections(
    calendar: &Entity<Calendar>,
    notifications: &Entity<Notifications>,
    launcher: &Entity<Launcher>,
    cx: &mut Context<Hub>,
) {
    cx.observe(launcher, |this, launcher, cx| {
        if let Some(error) = &launcher.read(cx).error {
            let error = error.clone();
            this.notifications
                .update(cx, |center, cx| center.report("hub.launcher", error, cx));
        }
        // La columna de contexto del Launcher vive en el shell: repinta con él.
        cx.notify();
    })
    .detach();
    cx.observe(calendar, |this, calendar, cx| {
        if let Some(error) = &calendar.read(cx).error {
            let error = error.clone();
            this.notifications
                .update(cx, |center, cx| center.report("hub.calendar", error, cx));
        }
        // Seguimiento y reloj también repintan el carril del calendario.
        cx.notify();
    })
    .detach();
    cx.observe(notifications, |this, center, cx| {
        if let Some(destination) = center.update(cx, |center, _| center.destination.take()) {
            this.navigate(destination, cx);
        }
    })
    .detach();
}

fn wire_studio_workshop(workshop: &Entity<Workshop>, cx: &mut Context<Hub>) {
    cx.observe(workshop, |this, workshop, cx| {
        let snapshot = workshop.read(cx).scene.snapshot().clone();
        this.studio
            .update(cx, |studio, cx| studio.ingest(&snapshot, cx));
    })
    .detach();
}

fn subscribe(pipe: Option<String>) -> Result<Subscriber, String> {
    // Mismo ACL privado del IPC que overlays; no consulta servicios ni credenciales.
    let pipe = match pipe {
        Some(name) => name,
        None => vantare_ipc::default_pipe_name().map_err(|error| format!("pipe Hub: {error}"))?,
    };
    Subscriber::connect(&pipe, |_| true).map_err(|error| format!("suscribir Hub: {error}"))
}

fn create_workshop(prepared: Prepared, cx: &mut App) -> Entity<Workshop> {
    cx.new(|cx| {
        let workshop = Workshop::new(prepared, cx);
        cx.spawn(async move |this, cx| {
            loop {
                let Ok(delay) = this.update(cx, |this, cx| this.tick(Instant::now(), cx)) else {
                    break;
                };
                cx.background_executor().timer(delay).await;
            }
        })
        .detach();
        workshop
    })
}

fn prepare_analysis(options: &Options) -> Result<Analysis, String> {
    let recordings = options
        .recordings
        .clone()
        .unwrap_or_else(|| options.data_dir.join("recordings"));
    let storage_exe = std::env::current_exe()
        .map_err(|error| format!("ruta del Hub: {error}"))?
        .with_file_name(format!("vantare-storage{}", std::env::consts::EXE_SUFFIX));
    Ok(Analysis::new(recordings, storage_exe))
}

/// Sale al cerrar la última ventana o, en desarrollo, al cerrarse stdin.
fn quit_when_done(cx: &mut App, controlled: bool, stop: Arc<AtomicBool>) {
    cx.on_window_closed(|cx, _| {
        if cx.windows().is_empty() {
            cx.quit();
        }
    })
    .detach();
    if controlled {
        cx.spawn(async move |cx| {
            while !stop.load(Ordering::Acquire) {
                cx.background_executor()
                    .timer(Duration::from_millis(100))
                    .await;
            }
            cx.update(|cx| cx.quit());
        })
        .detach();
    }
}

fn create_engineer(engineer: Engineer, cx: &mut App) -> Entity<Engineer> {
    cx.new(|cx| {
        cx.spawn(async move |this, cx| {
            loop {
                if this
                    .update(cx, |this: &mut Engineer, cx| {
                        if this.poll() {
                            cx.notify();
                        }
                    })
                    .is_err()
                {
                    break;
                }
                cx.background_executor()
                    .timer(Duration::from_millis(250))
                    .await;
            }
        })
        .detach();
        engineer
    })
}

/// Entradas ya cargadas y validadas antes de abrir la ventana.
struct Loaded {
    preview_fixtures: Option<[vantare_domain::Snapshot; 5]>,
    appearance: settings::appearance::Store,
    prepared: Prepared,
    studio: PreparedStudio,
    calendar: Calendar,
    notifications: crate::notifications::Center,
    analysis: Analysis,
    launcher: LauncherStore,
    engineer: Engineer,
    strategy_dir: PathBuf,
    testing_dir: PathBuf,
    subscriber: Subscriber,
    service_pipe: String,
    demo: Option<crate::demo::DemoData>,
    capture: Option<crate::demo::CaptureState>,
}

impl Hub {
    #[allow(clippy::too_many_lines)] // Conecta las entidades ya existentes y sus observadores.
    fn build(
        loaded: Loaded,
        section: Section,
        access: navigation::Access,
        failure_on_quit: std::rc::Rc<std::cell::RefCell<Option<String>>>,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> Self {
        let section = if access.beta_visible(section) {
            section
        } else {
            Section::Home
        };
        let Loaded {
            preview_fixtures,
            appearance,
            prepared,
            studio: prepared_studio,
            calendar,
            notifications: notification_center,
            analysis: mut prepared_analysis,
            launcher: launcher_store,
            engineer,
            strategy_dir,
            testing_dir,
            subscriber,
            service_pipe,
            demo,
            capture,
        } = loaded;
        orbit::theme::install(appearance.settings, window, cx);
        start_source_poll(cx);
        let focus = cx.focus_handle();
        focus.focus(window, cx);
        let workshop = create_workshop(prepared, cx);
        let snapshot = workshop.read(cx).scene.snapshot().clone();
        let studio = cx.new(|cx| Studio::new(prepared_studio, snapshot.clone(), cx));
        let prefs = studio.read(cx).preferences();
        // Solo QA explícita usa la escena de autoría; el producto espera fotos IPC reales.
        let home_snapshot = if capture.is_some() || demo.is_some() {
            snapshot.clone()
        } else {
            vantare_domain::Snapshot::default()
        };
        let home_previews =
            foundations::Previews::new(&home_snapshot, prefs, preview_fixtures.as_ref(), cx);
        workshop.update(cx, |workshop, cx| workshop.set_preferences(prefs, cx));
        cx.observe(&studio, |this, studio, cx| {
            if this.section == Section::Studio {
                cx.notify();
            }
            let prefs = studio.read(cx).preferences();
            this.workshop
                .update(cx, |workshop, cx| workshop.set_preferences(prefs, cx));
        })
        .detach();
        let notifications = cx.new(|cx| {
            let mut notifications = Notifications::from_center(notification_center);
            notifications.set_tester(access.beta_visible(Section::Testing), cx);
            #[cfg(feature = "parity-capture")]
            if capture.is_some()
                && let Some(demo) = &demo
                && let Ok(now) = demo.fixed_now()
            {
                notifications.capture_clock(now);
            }
            notifications
        });
        let calendar = cx.new(|_| calendar);
        let analysis = cx.new(|cx| {
            prepared_analysis.refresh(cx);
            prepared_analysis
        });
        let launcher = create_launcher(launcher_store, demo.as_ref(), capture.as_ref(), window, cx);
        let home_profile = foundations::profile_choice(&launcher, window, cx);
        wire_sections(&calendar, &notifications, &launcher, cx);
        let engineer = create_engineer(engineer, cx);
        let remote =
            cx.new(|cx| crate::services::view::Remote::new(service_pipe, &testing_dir, cx));
        calendar.update(cx, |calendar, _| calendar.attach_remote(remote.clone()));
        cx.observe(&remote, |this, remote, cx| {
            if this.capture.is_none() {
                this.shell.access = remote.read(cx).navigation_access();
                this.notifications.update(cx, |notifications, cx| {
                    notifications.set_tester(this.shell.access.beta_visible(Section::Testing), cx);
                });
            }
            cx.notify();
        })
        .detach();
        let strategy = cx.new(|cx| match &demo {
            Some(_) => Strategy::new_demo(
                strategy_dir,
                capture.as_ref().and_then(|capture| capture.strategy_page),
                cx,
            ),
            None => Strategy::new(strategy_dir, cx),
        });
        let mut settings = settings::State::new(prefs, appearance, testing_dir.clone(), window, cx);
        if let Some(page) = capture.as_ref().and_then(|capture| capture.settings_page) {
            settings.select_demo_page(page);
        }
        let testing = cx.new(|cx| Testing::new(testing_dir, remote.clone(), window, cx));
        wire_strategy(&strategy, cx);
        wire_studio_workshop(&workshop, cx);
        cx.on_app_quit(move |this, cx| {
            this.analysis.update(cx, |analysis, _| analysis.cancel());
            if let Err(error) = this.launcher.update(cx, |launcher, _| launcher.shutdown()) {
                eprintln!("cerrar Launcher: {error}");
                *failure_on_quit.borrow_mut() = Some(error);
            }
            if let Err(error) = this.save(cx) {
                eprintln!("guardar antes de salir: {error}");
                *failure_on_quit.borrow_mut() = Some(error);
            }
            async {}
        })
        .detach();
        Hub {
            section,
            shell: chrome::State::new(access, capture.as_ref(), cx),
            demo,
            capture,
            focus,
            workshop,
            studio,
            calendar,
            analysis,
            launcher,
            engineer,
            strategy,
            remote,
            testing,
            settings,
            home_previews,
            home_profile,
            notifications,
            status: None,
            subscriber,
            previous_source: None,
            close_requested: false,
        }
    }
}

fn create_launcher(
    store: LauncherStore,
    demo: Option<&crate::demo::DemoData>,
    capture: Option<&crate::demo::CaptureState>,
    window: &mut Window,
    cx: &mut Context<Hub>,
) -> Entity<Launcher> {
    cx.new(|cx| match demo {
        Some(demo) => {
            let mut launcher = Launcher::new_demo(
                store,
                demo,
                capture
                    .as_ref()
                    .is_some_and(|capture| capture.launcher_new_profile),
                window,
                cx,
            );
            if let Some(capture) = capture.filter(|capture| {
                matches!(
                    capture.name.as_str(),
                    "launcher-reposo"
                        | "launcher-lanzando"
                        | "launcher-aplicaciones"
                        | "launcher-historial"
                        | "launcher-editor"
                        | "launcher-listo"
                        | "launcher-cancelado"
                )
            }) {
                launcher.prepare_capture_view(&capture.name, window, cx);
            }
            launcher
        }
        None => Launcher::new(store, cx),
    })
}

fn wire_strategy(strategy: &Entity<Strategy>, cx: &mut Context<Hub>) {
    cx.observe(strategy, |this, strategy, cx| {
        if let Some(error) = &strategy.read(cx).error {
            let error = error.clone();
            this.notifications
                .update(cx, |center, cx| center.report("hub.strategy", error, cx));
        }
    })
    .detach();
}

pub fn run(options: Options) -> Result<(), String> {
    run_with_access(options, navigation::Access::default())
}

/// La integración de cuenta entrega derechos ya resueltos. Esta shell no
/// autentica el plan; sin integración deja el acceso monetizado sin verificar.
#[allow(clippy::too_many_lines)] // Carga validada y apertura de una única ventana.
pub fn run_with_access(mut options: Options, access: navigation::Access) -> Result<(), String> {
    if let (Some(demo), Some(capture)) = (&mut options.demo, &options.capture) {
        demo.apply_capture(capture)?;
    }
    let mut appearance =
        settings::appearance::Store::load(options.data_dir.join("appearance.json"))?;
    if let Some(settings) = options.capture.as_ref().and(options.capture_appearance) {
        appearance.settings = settings;
    }
    if let Some(zoom) = options.capture.as_ref().and(options.capture_zoom) {
        appearance.zoom_percent = zoom;
    }
    let notifications = match options.demo.as_ref() {
        Some(demo) => crate::notifications::Center::demo(demo, demo.fixed_now()?)?,
        None => crate::notifications::Center::default(),
    };
    #[cfg(feature = "parity-capture")]
    let notifications = notifications.with_capture_scene(
        options
            .capture
            .as_ref()
            .map(|capture| capture.name.as_str()),
    )?;
    let launcher = match options.demo.as_ref() {
        Some(demo) => LauncherStore::demo(options.launcher_file.clone(), demo)?,
        None => {
            if options.launcher_file == crate::launcher::default_path()? {
                LauncherStore::load_production(options.launcher_file.clone())?
            } else {
                LauncherStore::load(options.launcher_file.clone())?
            }
        }
    };
    let loaded = Loaded {
        preview_fixtures: options
            .capture
            .as_ref()
            .map(|_| foundations::capture_photos())
            .transpose()?,
        appearance,
        analysis: prepare_analysis(&options)?,
        prepared: Prepared::load(&options.data_dir, options.scene)?,
        studio: PreparedStudio::load(options.layout)?,
        calendar: match options.demo.as_ref() {
            Some(demo) => Calendar::load_demo(&options.data_dir, demo)?,
            None => Calendar::load(&options.data_dir)?,
        },
        notifications,
        launcher,
        engineer: Engineer::load(options.engineer),
        strategy_dir: options.data_dir.clone(),
        testing_dir: options.data_dir.clone(),
        service_pipe: options
            .pipe
            .clone()
            .map_or_else(vantare_ipc::default_pipe_name, Ok)
            .map_err(|_| "IPC no disponible")?,
        subscriber: subscribe(options.pipe)?,
        demo: options.demo.clone(),
        capture: options.capture.clone(),
    };
    let stop = watch_stdin(options.controlled)?;
    let failure = std::rc::Rc::new(std::cell::RefCell::new(None));
    let result = failure.clone();
    gpui_platform::application()
        .with_assets(assets::Icons)
        .run(move |cx: &mut App| {
            cx.set_global(orbit::theme::Theme::default());
            if let Err(error) = vantare_ui::efficiency::text::register_fonts(cx)
                .and_then(|()| orbit::design::register_fonts(cx))
            {
                *failure.borrow_mut() = Some(error);
                cx.quit();
                return;
            }
            // Los tamaños QA están acotados a 8192 por el parser; evita el límite de tracking del monitor.
            #[allow(clippy::cast_precision_loss)]
            let minimum = options.capture.as_ref().and(options.capture_size).map_or(
                gpui::size(gpui::px(1280.0), gpui::px(800.0)),
                |(width, height)| gpui::size(gpui::px(width as f32), gpui::px(height as f32)),
            );
            let window_options = WindowOptions {
                window_min_size: Some(minimum),
                kind: if options.capture.is_some() {
                    gpui::WindowKind::PopUp
                } else {
                    gpui::WindowKind::Normal
                },
                titlebar: Some(gpui::TitlebarOptions {
                    appears_transparent: true,
                    title: Some("Vantare Hub".into()),
                    ..Default::default()
                }),
                ..Default::default()
            };
            let failure_on_quit = failure.clone();
            let initial_section = options.section;
            if let Err(error) = cx.open_window(window_options, |window, cx| {
                let hub = cx.new(|cx: &mut Context<Hub>| {
                    let mut hub =
                        Hub::build(loaded, initial_section, access, failure_on_quit, window, cx);
                    hub.settings_zoom_restore(window);
                    hub
                });
                let closing = hub.downgrade();
                window.on_window_should_close(cx, move |_, cx| {
                    closing.update(cx, Hub::can_close).unwrap_or(true)
                });
                hub
            }) {
                *failure.borrow_mut() = Some(format!("abrir Hub: {error}"));
                cx.quit();
                return;
            }
            if options.capture.is_none()
                && let Some(root) = std::env::var_os("VANTARE_BETA_ROOT")
                && let Err(error) = std::fs::write(
                    PathBuf::from(root).join("hub-ready"),
                    std::process::id().to_string(),
                )
            {
                *failure.borrow_mut() = Some(format!("confirmar arranque beta: {error}"));
                cx.quit();
                return;
            }
            quit_when_done(cx, options.controlled, stop);
            cx.activate(true);
        });
    match result.borrow_mut().take() {
        Some(error) => Err(error),
        None => Ok(()),
    }
}

#[cfg(test)]
mod presentation_tests {
    use super::*;

    #[test]
    fn only_workshop_occupies_the_whole_window() {
        for section in Section::ALL {
            assert_eq!(
                presentation(*section) == Presentation::Fullscreen,
                *section == Section::Workshop
            );
        }
    }
}
