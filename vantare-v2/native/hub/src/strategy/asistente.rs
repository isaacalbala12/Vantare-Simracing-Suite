//! Asistente de cinco pasos; prepara datos desde el documento y la API nativa.
use super::*;
use gpui::{div, px, rgb, rgba};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum AssistantStep {
    Inicio,
    Combinacion,
    Reglas,
    Pilotos,
    Sesiones,
}

impl AssistantStep {
    pub(super) const ALL: [Self; 5] = [
        Self::Inicio,
        Self::Combinacion,
        Self::Reglas,
        Self::Pilotos,
        Self::Sesiones,
    ];

    pub(super) fn index(self) -> usize {
        match self {
            Self::Inicio => 0,
            Self::Combinacion => 1,
            Self::Reglas => 2,
            Self::Pilotos => 3,
            Self::Sesiones => 4,
        }
    }

    pub(super) fn label(self) -> &'static str {
        match self {
            Self::Inicio => "Inicio",
            Self::Combinacion => "Combinación",
            Self::Reglas => "Reglas",
            Self::Pilotos => "Pilotos",
            Self::Sesiones => "Sesiones",
        }
    }

    pub(super) fn previous(self) -> Option<Self> {
        self.index().checked_sub(1).map(|index| Self::ALL[index])
    }

    pub(super) fn next(self) -> Option<Self> {
        Self::ALL.get(self.index() + 1).copied()
    }

    fn shows_navigation_footer(self) -> bool {
        matches!(self, Self::Inicio | Self::Combinacion | Self::Sesiones)
    }
}

impl Strategy {
    #[allow(clippy::too_many_lines)] // Mantiene unida la composición de un paso del asistente.
    pub(super) fn assistant_page(
        &self,
        step: AssistantStep,
        viewport_height: f32,
        cx: &mut Context<Self>,
    ) -> gpui::Div {
        let main = div()
            .id("strategy-assistant")
            .flex()
            .flex_col()
            .flex_1()
            .h(px((viewport_height - orbit::STRATEGY_TOPBAR_H).max(0.0)))
            .min_w_0()
            .min_h(px(0.0))
            .overflow_hidden();
        let (title, description) = match step {
            AssistantStep::Inicio => (
                "Prepara tu próxima\ncarrera",
                "Configura tu estrategia con los datos manuales de la carrera.",
            ),
            AssistantStep::Combinacion => (
                "Elige tu combinación",
                "Configura tu carrera o parte de un evento del calendario de Vantare.",
            ),
            AssistantStep::Reglas => (
                "Configura tu carrera",
                "Define los parámetros de carrera según el reglamento del evento.",
            ),
            AssistantStep::Pilotos => (
                "Prepara tu equipo",
                "Asigna tu piloto principal y prepara los relevos de resistencia.",
            ),
            AssistantStep::Sesiones => (
                "Revisa los datos",
                "Revisa los datos de la carrera antes de terminar la configuración manual.",
            ),
        };
        let mut progress = gpui::div()
            .relative()
            .flex()
            .items_start()
            .justify_between()
            .gap(px(8.0))
            .ml(px(-32.0))
            .mr(px(-32.0))
            .pl(px(49.0))
            .pr(px(166.0))
            .h(px(93.0))
            .child(
                gpui::div()
                    .absolute()
                    .top(px(17.0))
                    .left(px(36.0))
                    .right(px(36.0))
                    .h(px(1.0))
                    .bg(rgba(orbit::line(cx))),
            );
        for (index, item) in AssistantStep::ALL.into_iter().enumerate() {
            let complete = index < step.index();
            let current = index == step.index();
            let marker = if complete {
                "✓".to_owned()
            } else {
                (index + 1).to_string()
            };
            progress = progress.child(
                gpui::div()
                    .relative()
                    .flex()
                    .w(px(36.0))
                    .flex_none()
                    .flex_col()
                    .items_start()
                    .gap(px(12.0))
                    .child(
                        gpui::div()
                            .flex()
                            .items_center()
                            .justify_center()
                            .size(px(36.0))
                            .rounded_full()
                            .border_1()
                            .border_color(if current || complete {
                                rgb(orbit::carmine(cx))
                            } else {
                                rgba(orbit::line(cx))
                            })
                            .bg(if complete {
                                rgb(orbit::carmine(cx))
                            } else {
                                rgba(crate::orbit::legacy_rgba(0x0809_0bf0, cx))
                            })
                            .child(orbit::text(
                                marker,
                                17.0,
                                400,
                                if current || complete {
                                    orbit::ink(cx)
                                } else {
                                    orbit::ink_3(cx)
                                },
                                cx,
                            )),
                    )
                    .child(
                        div()
                            .w(px(90.0))
                            .ml(px(-27.0))
                            .flex()
                            .justify_center()
                            .child(
                                div()
                                    .pb(px(6.0))
                                    .when(current, |label| {
                                        label.border_b_1().border_color(rgb(orbit::carmine(cx)))
                                    })
                                    .child(orbit::text(
                                        item.label(),
                                        orbit::SECONDARY,
                                        400,
                                        if current {
                                            orbit::ink(cx)
                                        } else {
                                            orbit::ink_2(cx)
                                        },
                                        cx,
                                    )),
                            ),
                    ),
            );
        }

        let footer = gpui::div()
            .flex()
            .items_center()
            .justify_between()
            .h(px(112.0))
            .flex_none()
            .border_t_1()
            .border_color(rgba(orbit::line_strong(cx)))
            .bg(rgb(orbit::canvas(cx)))
            .px(px(32.0))
            .child(
                gpui::div()
                    .flex()
                    .items_center()
                    .gap(px(14.0))
                    .child(
                        gpui::div()
                            .size(px(22.0))
                            .flex()
                            .items_center()
                            .justify_center()
                            .rounded_full()
                            .border_1()
                            .border_color(rgba(orbit::line_strong(cx)))
                            .child(orbit::text("✓", 12.0, 600, orbit::ink_2(cx), cx)),
                    )
                    .child(orbit::text(
                        "Originales intactos",
                        14.0,
                        500,
                        orbit::ink_2(cx),
                        cx,
                    )),
            )
            .child(
                gpui::div()
                    .flex()
                    .gap(px(18.0))
                    .mt(px(-14.0))
                    .child(
                        Self::assistant_footer_button(
                            "strategy-assistant-back",
                            "← Atrás",
                            false,
                            cx,
                        )
                        .on_click(cx.listener(move |this, _, _, cx| {
                            if let Some(previous) = step.previous() {
                                this.page = Page::Assistant(previous);
                            } else {
                                this.load_fields(cx);
                                this.page = Page::Collection;
                            }
                            this.error = None;
                            cx.notify();
                        })),
                    )
                    .child(
                        Self::assistant_footer_button(
                            "strategy-assistant-next",
                            if step == AssistantStep::Sesiones {
                                "Crear carrera →"
                            } else {
                                "Continuar →"
                            },
                            true,
                            cx,
                        )
                        .on_click(cx.listener(move |this, _, _, cx| {
                            if let Some(next) = step.next() {
                                this.page = Page::Assistant(next);
                                this.error = None;
                            } else {
                                this.add_event(cx);
                            }
                            cx.notify();
                        })),
                    ),
            );

        let body = match step {
            AssistantStep::Inicio => Self::start_choices(cx),
            AssistantStep::Combinacion => self.combination_choices(cx),
            AssistantStep::Reglas => self.rules_fields(cx),
            AssistantStep::Pilotos => self.driver_fields(cx),
            AssistantStep::Sesiones => self.session_sources(cx),
        };
        let content = gpui::div()
            .relative()
            .flex()
            .flex_col()
            .flex_1()
            .min_h(px(0.0))
            .gap(px(14.0))
            .px(px(orbit::GUTTER))
            .pt(px(20.0))
            .pb(px(22.0))
            .child(progress.flex_none())
            .child(
                orbit::tracked_text(
                    step.label().to_uppercase(),
                    11.0,
                    400,
                    orbit::ink_2(cx),
                    1.43,
                    cx,
                )
                .ml(px(1.0))
                .relative()
                .top(px(2.0))
                .flex_none(),
            )
            .child(
                super::view::heading(title, 50.0, -2.0, cx)
                    .line_height(px(50.0))
                    .max_w(px(440.0))
                    .mt(px(2.0))
                    .ml(px(1.0))
                    .flex_none(),
            )
            .child(
                orbit::text(description, 16.0, 400, orbit::ink_2(cx), cx)
                    .max_w(px(if step == AssistantStep::Pilotos {
                        600.0
                    } else {
                        460.0
                    }))
                    .ml(px(1.0))
                    .relative()
                    .top(px(-2.0))
                    .flex_none(),
            )
            .child(body.ml(px(1.0)).when(
                matches!(step, AssistantStep::Reglas | AssistantStep::Pilotos),
                |body| {
                    body.mt(px(if step == AssistantStep::Reglas {
                        0.0
                    } else {
                        -2.0
                    }))
                },
            ));
        let main = main.child(
            gpui::div()
                .relative()
                .flex()
                .flex_col()
                .flex_1()
                .min_h(px(0.0))
                .child(content)
                .when(step.shows_navigation_footer(), |main| main.child(footer)),
        );
        div().flex().flex_1().min_w_0().min_h(px(0.0)).child(main)
    }

    fn assistant_footer_button(
        id: &'static str,
        label: &str,
        primary: bool,
        cx: &gpui::App,
    ) -> gpui::Stateful<gpui::Div> {
        gpui::div()
            .id(id)
            .role(gpui::Role::Button)
            .aria_label(label.to_owned())
            .tab_index(0)
            .flex()
            .items_center()
            .justify_center()
            .h(px(56.0))
            .w(px(150.0))
            .rounded(px(12.0))
            .bg(rgb(if primary {
                orbit::primary_bg(cx)
            } else {
                orbit::canvas(cx)
            }))
            .border_1()
            .border_color(if primary {
                rgb(orbit::primary_bg(cx))
            } else {
                rgba(orbit::line_strong(cx))
            })
            .cursor_pointer()
            .hover(|style| style.bg(rgb(orbit::surface_3(cx))))
            .focus_visible(|style| style.border_color(rgb(orbit::carmine(cx))))
            .child(orbit::text(
                label.to_owned(),
                16.0,
                500,
                if primary {
                    cx.global::<crate::orbit::theme::Theme>().primary_ink
                } else {
                    orbit::ink_3(cx)
                },
                cx,
            ))
    }

    fn start_choices(cx: &mut Context<Self>) -> gpui::Div {
        div().max_w(px(520.0)).child(Self::manual_info_card(
            "strategy-mode-manual",
            "Manual",
            "Configura el evento, el coche y el circuito. Después revisa tus datos.",
            "i-estrategia",
            true,
            cx,
        ))
    }

    fn combination_option_card(
        id: &'static str,
        title: &'static str,
        description: &'static str,
        icon: &'static str,
        selected: bool,
        cx: &gpui::App,
    ) -> gpui::Stateful<gpui::Div> {
        div()
            .id(id)
            .flex()
            .items_center()
            .gap(px(14.0))
            .w(px(354.0))
            .flex_none()
            .h(px(70.0))
            .px(px(18.0))
            .rounded(px(12.0))
            .border_1()
            .border_color(if selected {
                rgb(orbit::carmine(cx))
            } else {
                rgba(orbit::line(cx))
            })
            .bg(if selected {
                rgb(crate::orbit::legacy_rgb(0x001c_1216, cx))
            } else {
                rgb(crate::orbit::legacy_rgb(0x000b_0d0f, cx))
            })
            .child(orbit::icon(icon, 20.0, orbit::ink_2(cx)))
            .child(
                div()
                    .flex()
                    .flex_col()
                    .gap(px(4.0))
                    .child(orbit::text(title, 14.0, 600, orbit::ink(cx), cx))
                    .child(orbit::text(description, 12.0, 400, orbit::ink_2(cx), cx)),
            )
    }

    fn combination_event_options(&self, selected: bool, cx: &gpui::App) -> gpui::Div {
        div()
            .flex()
            .gap(px(12.0))
            .child(Self::combination_option_card(
                "strategy-custom-event",
                "Carrera personalizada",
                capture!(
                    "Elige coche, circuito y reglamento",
                    Some(self.view_data.custom_description)
                ),
                "i-ajustes",
                selected,
                cx,
            ))
            .child(Self::combination_option_card(
                "strategy-calendar-event",
                "Calendario de Vantare",
                capture!(
                    "Selección de eventos no disponible",
                    Some(self.view_data.calendar_description)
                ),
                "i-carreras",
                false,
                cx,
            ))
    }

    fn combination_summary(&self, circuit: String, category: String, cx: &gpui::App) -> gpui::Div {
        div()
            .flex()
            .flex_col()
            .gap(px(10.0))
            .mt(px(7.0))
            .w(px(720.0))
            .h(px(92.0))
            .flex_none()
            .p(px(22.0))
            .rounded(px(12.0))
            .border_1()
            .border_color(rgba(orbit::line(cx)))
            .bg(rgb(crate::orbit::legacy_rgb(0x000b_0d0f, cx)))
            .child(orbit::tracked_text(
                "TU COMBINACIÓN",
                11.0,
                400,
                orbit::ink_2(cx),
                1.43,
                cx,
            ))
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(18.0))
                    .flex_1()
                    .child(orbit::text(circuit, 22.0, 500, orbit::ink(cx), cx).w(px(175.0)))
                    .when_some(
                        capture!(None::<&str>, Some(self.view_data.layout)),
                        |row, layout| {
                            row.child(
                                orbit::text(layout, 13.0, 400, orbit::ink_2(cx), cx).w(px(113.0)),
                            )
                        },
                    )
                    .child(orbit::text(category, 13.0, 400, orbit::ink_2(cx), cx).flex_1()),
            )
    }

    fn combination_choices(&self, cx: &gpui::App) -> gpui::Div {
        let event_available = self.current_event().is_some();
        let simulator = if event_available {
            capture!("Sin simulador seleccionado", self.view_data.simulator)
        } else {
            "Sin simulador seleccionado"
        };
        let category = if self.fields[Field::Class].trim().is_empty() {
            "Sin categoría seleccionada".to_owned()
        } else {
            capture!(
                self.fields[Field::Class].clone(),
                self.view_data
                    .car
                    .as_ref()
                    .map(|car| format!("{} · {car}", self.fields[Field::Class]))
            )
        };
        let circuit = if self.fields[Field::Track].trim().is_empty() {
            "Sin circuito seleccionado".to_owned()
        } else {
            self.fields[Field::Track].clone()
        };
        let row = |label: &str, control: gpui::Div| {
            div()
                .flex()
                .items_center()
                .gap(px(16.0))
                .h(px(50.0))
                .child(orbit::text(label.to_owned(), 13.0, 400, orbit::ink_2(cx), cx).w(px(124.0)))
                .child(control)
        };
        let surface = || {
            div()
                .flex()
                .items_center()
                .w(px(580.0))
                .h(px(50.0))
                .px(px(16.0))
                .rounded(px(10.0))
                .border_1()
                .border_color(rgba(orbit::line(cx)))
                .bg(rgb(crate::orbit::legacy_rgb(0x000b_0d0f, cx)))
        };
        let simulator_row = row(
            "Simulador",
            surface()
                .gap(px(12.0))
                .child(orbit::text("LMU", 14.0, 800, orbit::carmine(cx), cx))
                .child(orbit::text(simulator, 13.0, 600, orbit::ink(cx), cx)),
        );
        let category_control = surface()
            .child(capture!(
                {
                    div()
                        .flex_1()
                        .child(self.inputs[Field::Class as usize].clone())
                },
                self.view_data
                    .car
                    .as_ref()
                    .map(|_car| { orbit::text(category.clone(), 13.0, 500, orbit::ink(cx), cx) })
            ))
            .child(orbit::text("⌄", 16.0, 500, orbit::ink_2(cx), cx).ml_auto());
        let circuit_control = surface()
            .child(capture!(
                {
                    div()
                        .flex_1()
                        .child(self.inputs[Field::Track as usize].clone())
                },
                self.view_data.layout.map(|layout| {
                    orbit::text(
                        format!("{circuit} · {layout}"),
                        13.0,
                        500,
                        orbit::ink(cx),
                        cx,
                    )
                    .flex_1()
                })
            ))
            .child(orbit::text("⌄", 16.0, 500, orbit::ink_2(cx), cx));
        gpui::div()
            .flex()
            .flex_col()
            .gap(px(12.0))
            .max_w(px(720.0))
            .child(orbit::eyebrow("EVENTO", cx))
            .child(self.combination_event_options(event_available, cx))
            .child(
                div()
                    .flex()
                    .flex_col()
                    .gap(px(8.0))
                    .mt(px(4.0))
                    .w(px(720.0))
                    .flex_none()
                    .child(simulator_row)
                    .child(row("Categoría / coche", category_control))
                    .child(row("Circuito / trazado", circuit_control)),
            )
            .child(self.combination_summary(circuit, category, cx))
    }

    #[allow(clippy::too_many_lines)] // Mantiene juntos los campos de un único paso del asistente.
    fn rules_fields(&self, cx: &mut Context<Self>) -> gpui::Div {
        let laps_selected = !self.fields[Field::RaceLaps].trim().is_empty();
        let distance_field = if laps_selected {
            Field::RaceLaps
        } else {
            Field::DurationMinutes
        };
        let distance_unit = if laps_selected { "vueltas" } else { "minutos" };
        let distance_label = if laps_selected {
            "Distancia · vueltas"
        } else {
            "Duración · minutos"
        };
        let advanced = div()
            .flex()
            .gap(px(12.0))
            .p(px(18.0))
            .child(self.field(Field::PitTransitSeconds, cx).flex_1())
            .child(self.field(Field::RefuelRate, cx).flex_1())
            .child(self.field(Field::StartAt, cx).flex_1());
        let advanced_section = div()
            .flex()
            .flex_col()
            .rounded(px(12.0))
            .border_1()
            .border_color(rgba(orbit::line(cx)))
            .bg(rgb(crate::orbit::legacy_rgb(0x000b_0d0f, cx)))
            .child(
                button(
                    "strategy-rules-advanced",
                    if self.rules_details_open {
                        "▾  Neumáticos y paradas"
                    } else {
                        "›  Neumáticos y paradas"
                    },
                    cx,
                )
                .w_full()
                .bg(rgb(crate::orbit::legacy_rgb(0x000b_0d0f, cx)))
                .h(px(58.0))
                .justify_start()
                .px(px(18.0))
                .on_click(cx.listener(|this, _, _, cx| {
                    this.rules_details_open = !this.rules_details_open;
                    cx.notify();
                })),
            )
            .when(self.rules_details_open, |section| section.child(advanced));

        div()
            .flex()
            .flex_col()
            .gap(px(12.0))
            .max_w(px(980.0))
            .child(
                orbit::text(
                    "Configuración de carrera · los campos vacíos siguen pendientes.",
                    12.0,
                    400,
                    orbit::ink_2(cx),
                    cx,
                )
                .line_height(px(18.0)),
            )
            .child(capture!(
                { self.labeled_input("Nombre de la carrera", Field::Name, 220.0, cx) },
                self.view_data.text_control.map(|render| {
                    div()
                        .flex()
                        .items_center()
                        .gap(px(14.0))
                        .h(px(42.0))
                        .child(
                            orbit::text("Nombre de la carrera", 13.0, 400, orbit::ink_2(cx), cx)
                                .w(px(220.0)),
                        )
                        .child(render(&self.fields[Field::Name], cx))
                })
            ))
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(12.0))
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .flex_1()
                            .h(px(64.0))
                            .gap(px(12.0))
                            .p(px(12.0))
                            .rounded(px(10.0))
                            .border_1()
                            .border_color(rgba(orbit::line(cx)))
                            .bg(rgba(crate::orbit::legacy_rgba(0x0b0d_0fe8, cx)))
                            .child(
                                orbit::text("Formato", 14.0, 500, orbit::ink_2(cx), cx)
                                    .w(px(205.0)),
                            )
                            .child(
                                div()
                                    .flex()
                                    .items_center()
                                    .justify_between()
                                    .flex_1()
                                    .h(px(44.0))
                                    .px(px(14.0))
                                    .rounded(px(10.0))
                                    .border_1()
                                    .border_color(rgba(orbit::line(cx)))
                                    .bg(rgb(crate::orbit::legacy_rgb(0x000b_0d0f, cx)))
                                    .child(orbit::text(
                                        distance_unit,
                                        14.0,
                                        500,
                                        orbit::ink(cx),
                                        cx,
                                    ))
                                    .child(orbit::text("⌄", 16.0, 500, orbit::ink_2(cx), cx)),
                            ),
                    )
                    .child(
                        (capture!(
                            { self.labeled_input(distance_label, distance_field, 205.0, cx) },
                            self.view_data.rule_row.map(|render| {
                                render(distance_label, &self.fields[distance_field], cx)
                            })
                        ))
                        .flex_1()
                        .h(px(64.0))
                        .p(px(12.0))
                        .rounded(px(10.0))
                        .border_1()
                        .border_color(rgba(orbit::line(cx)))
                        .bg(rgba(crate::orbit::legacy_rgba(0x0b0d_0fe8, cx))),
                    ),
            )
            .child(
                div()
                    .flex()
                    .flex_col()
                    .justify_between()
                    .h(px(305.0))
                    .p(px(18.0))
                    .pb(px(14.0))
                    .rounded(px(12.0))
                    .border_1()
                    .border_color(rgba(orbit::line(cx)))
                    .bg(rgb(crate::orbit::legacy_rgb(0x000b_0d0f, cx)))
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .gap(px(8.0))
                            .child(orbit::text("▾", 14.0, 600, orbit::ink(cx), cx))
                            .child(orbit::text(
                                "Combustible y energía virtual",
                                14.0,
                                400,
                                orbit::ink(cx),
                                cx,
                            )),
                    )
                    .child(capture!(
                        {
                            div()
                                .flex()
                                .gap(px(18.0))
                                .child(
                                    div()
                                        .flex()
                                        .flex_col()
                                        .flex_1()
                                        .justify_between()
                                        .h(px(234.0))
                                        .child(self.labeled_input(
                                            "Capacidad de combustible · L",
                                            Field::FuelCapacityLiters,
                                            205.0,
                                            cx,
                                        ))
                                        .child(self.labeled_input(
                                            "Consumo Fuel · L/v",
                                            Field::FuelPerLapLiters,
                                            205.0,
                                            cx,
                                        ))
                                        .child(self.labeled_input(
                                            "Reserva final · vueltas",
                                            Field::ReserveLaps,
                                            205.0,
                                            cx,
                                        ))
                                        .child(div().h(px(44.0))),
                                )
                                .child(
                                    div()
                                        .flex()
                                        .flex_col()
                                        .flex_1()
                                        .justify_between()
                                        .h(px(234.0))
                                        .child(self.labeled_input(
                                            "Modo de variante",
                                            Field::VariantMode,
                                            205.0,
                                            cx,
                                        ))
                                        .child(self.labeled_input(
                                            "Capacidad VE · %",
                                            Field::VeCapacityPercent,
                                            205.0,
                                            cx,
                                        ))
                                        .child(self.labeled_input(
                                            "Consumo VE · %/v",
                                            Field::VePerLapPercent,
                                            205.0,
                                            cx,
                                        ))
                                        .child(div().h(px(44.0))),
                                )
                        },
                        self.view_data.resources.map(|render| { render(self, cx) })
                    )),
            )
            .child(advanced_section)
    }

    fn labeled_input(
        &self,
        label: &str,
        index: Field,
        label_width: f32,
        cx: &gpui::App,
    ) -> gpui::Div {
        div()
            .flex()
            .items_center()
            .gap(px(12.0))
            .h(px(44.0))
            .child(
                orbit::text(label.to_owned(), 14.0, 500, orbit::ink_2(cx), cx).w(px(label_width)),
            )
            .child(div().flex_1().child(self.inputs[index as usize].clone()))
    }

    #[allow(clippy::too_many_lines)] // Mantiene el orden y las tarjetas del equipo en una vista.
    fn driver_fields(&self, cx: &gpui::App) -> gpui::Div {
        capture!({
            if let Some(render) = self.view_data.drivers {
                return render(self, cx);
            }
        });
        let drivers = self
            .current_event()
            .and_then(|event| event["drivers"].as_array())
            .map_or_else(Vec::new, |drivers| {
                drivers
                    .iter()
                    .filter_map(|driver| {
                        let name = display(&driver["name"]["value"]);
                        (!name.is_empty()).then(|| (name, display(&driver["cls"]["value"])))
                    })
                    .collect::<Vec<_>>()
            });
        if drivers.is_empty() {
            return div().max_w(px(980.0)).child(orbit::empty_state(
                "Sin pilotos guardados",
                "Añade el piloto principal con los datos que tengas.",
                cx,
            ));
        }

        let mut order = div().flex().gap(px(8.0));
        for (index, (name, _)) in drivers.iter().enumerate() {
            order = order.child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(10.0))
                    .flex_1()
                    .min_w_0()
                    .h(px(48.0))
                    .px(px(12.0))
                    .rounded(px(12.0))
                    .border_1()
                    .border_color(rgba(orbit::line(cx)))
                    .bg(rgba(crate::orbit::legacy_rgba(0x0809_0be8, cx)))
                    .child(orbit::text(
                        format!("{}", index + 1),
                        14.0,
                        600,
                        orbit::ink_3(cx),
                        cx,
                    ))
                    .child(orbit::text(name.clone(), 15.0, 600, orbit::ink(cx), cx)),
            );
        }

        let mut cards = div().flex().gap(px(12.0));
        for (index, (name, class)) in drivers.iter().enumerate() {
            let role = if index == 0 {
                "PILOTO PRINCIPAL".to_owned()
            } else {
                format!("RELEVO {index}")
            };
            let mut card = div()
                .flex()
                .flex_col()
                .flex_1()
                .min_w_0()
                .min_h(px(390.0))
                .gap(px(14.0))
                .p(px(18.0))
                .rounded(px(12.0))
                .border_1()
                .border_color(rgba(orbit::line(cx)))
                .bg(rgba(crate::orbit::legacy_rgba(0x0809_0be8, cx)))
                .child(orbit::eyebrow(role, cx));
            if index == 0 {
                card = card
                    .child(self.field(Field::DriverName, cx))
                    .child(self.field(Field::DriverInitials, cx));
            } else {
                card = card
                    .child(orbit::eyebrow("NOMBRE DEL PILOTO", cx))
                    .child(orbit::text(name.clone(), 16.0, 600, orbit::ink(cx), cx));
            }
            if !class.is_empty() {
                card = card
                    .child(orbit::eyebrow("CLASE / ACREDITACIÓN", cx))
                    .child(orbit::text(class.clone(), 14.0, 500, orbit::ink_2(cx), cx));
            }
            cards = cards.child(card.child(orbit::empty_state(
                "Límites de stint sin configurar",
                "El documento no contiene límites para este piloto.",
                cx,
            )));
        }

        div()
            .flex()
            .flex_col()
            .gap(px(12.0))
            .max_w(px(980.0))
            .child(
                div()
                    .flex()
                    .flex_col()
                    .min_h(px(155.0))
                    .gap(px(14.0))
                    .p(px(18.0))
                    .rounded(px(12.0))
                    .border_1()
                    .border_color(rgba(orbit::line(cx)))
                    .bg(rgba(crate::orbit::legacy_rgba(0x0809_0be8, cx)))
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .justify_between()
                            .child(orbit::text(
                                "Orden de pilotos",
                                17.0,
                                600,
                                orbit::ink(cx),
                                cx,
                            ))
                            .child(orbit::text(
                                "Orden guardado",
                                13.0,
                                500,
                                orbit::ink_2(cx),
                                cx,
                            )),
                    )
                    .child(orbit::text(
                        "La carrera conserva la secuencia del documento.",
                        13.0,
                        400,
                        orbit::ink_2(cx),
                        cx,
                    ))
                    .child(order),
            )
            .child(cards)
    }

    pub(super) fn session_sources(&self, cx: &mut Context<Self>) -> gpui::Div {
        let session_count = self
            .current_event()
            .and_then(|event| event["combination"]["sessions"].as_array())
            .map_or(0, |sessions| {
                sessions
                    .iter()
                    .filter(|session| session["included"] == true)
                    .count()
            });
        div()
            .flex()
            .flex_col()
            .gap(px(13.0))
            .mt(px(-3.0))
            .max_w(px(520.0))
            .p(px(22.0))
            .rounded(px(14.0))
            .border_1()
            .border_color(rgba(orbit::line(cx)))
            .bg(rgb(crate::orbit::legacy_rgb(0x000b_0d0f, cx)))
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(10.0))
                    .child(orbit::text("Sesiones guardadas en el documento", 17.0, 600, orbit::ink(cx), cx))
                    .child(
                        div()
                            .px(px(8.0))
                            .py(px(3.0))
                            .rounded(px(7.0))
                            .bg(rgb(orbit::surface_2(cx)))
                            .child(orbit::text(
                                format!("{session_count}/4"),
                                11.0,
                                500,
                                orbit::ink_3(cx),
                             cx)),
                    ),
            )
            .child(orbit::text(
                "Configura los valores de la carrera a mano. La conexión con las sesiones de Análisis estará disponible más adelante.",
                15.0,
                400,
                orbit::ink_2(cx),
             cx))
            .child(orbit::text("Modo manual · no requiere telemetría", 13.0, 500, orbit::ink_3(cx), cx))
    }

    fn manual_info_card(
        id: &'static str,
        title: &str,
        help: &str,
        icon: &'static str,
        selected: bool,
        cx: &gpui::App,
    ) -> gpui::Stateful<gpui::Div> {
        gpui::div()
            .id(id)
            .aria_label(format!("{title}. {help}"))
            .flex()
            .items_center()
            .gap(px(24.0))
            .w(px(520.0))
            .h(px(144.0))
            .px(px(22.0))
            .border_1()
            .border_color(if selected {
                rgb(orbit::carmine(cx))
            } else {
                rgba(orbit::line(cx))
            })
            .rounded(px(12.0))
            .bg(if selected {
                rgb(crate::orbit::legacy_rgb(0x0010_0d0f, cx))
            } else {
                rgb(crate::orbit::legacy_rgb(0x000b_0d0f, cx))
            })
            .child(
                gpui::div()
                    .size(px(24.0))
                    .flex_none()
                    .flex()
                    .items_center()
                    .justify_center()
                    .child(
                        gpui::div()
                            .size(px(if selected { 24.0 } else { 10.0 }))
                            .flex()
                            .items_center()
                            .justify_center()
                            .rounded_full()
                            .border_1()
                            .border_color(if selected {
                                rgb(orbit::carmine(cx))
                            } else {
                                rgba(orbit::line_strong(cx))
                            })
                            .when(selected, |radio| radio.bg(rgb(orbit::carmine(cx))))
                            .when(selected, |radio| {
                                radio.child(orbit::text("✓", 13.0, 700, orbit::white(cx), cx))
                            }),
                    ),
            )
            .child(
                gpui::div()
                    .size(px(32.0))
                    .flex_none()
                    .flex()
                    .items_center()
                    .justify_center()
                    .child(orbit::icon(icon, 36.0, orbit::ink_2(cx))),
            )
            .child(
                gpui::div()
                    .flex()
                    .flex_col()
                    .flex_1()
                    .min_w(px(0.0))
                    .gap(px(10.0))
                    .child(orbit::text(title.to_owned(), 20.0, 600, orbit::ink(cx), cx))
                    .child(orbit::text(
                        help.to_owned(),
                        14.0,
                        400,
                        orbit::ink_2(cx),
                        cx,
                    )),
            )
    }
}

#[cfg(test)]
mod tests {
    use super::AssistantStep;

    #[test]
    fn assistant_steps_are_five_and_navigate_in_order() {
        assert_eq!(AssistantStep::ALL.len(), 5);
        assert_eq!(AssistantStep::Inicio.previous(), None);
        assert_eq!(
            AssistantStep::Inicio.next(),
            Some(AssistantStep::Combinacion)
        );
        assert_eq!(
            AssistantStep::Combinacion.previous(),
            Some(AssistantStep::Inicio)
        );
        assert_eq!(AssistantStep::Reglas.index(), 2);
        assert_eq!(AssistantStep::Pilotos.next(), Some(AssistantStep::Sesiones));
        assert_eq!(AssistantStep::Sesiones.next(), None);
    }

    #[test]
    fn navigation_footer_matches_the_reference_screens() {
        assert!(AssistantStep::Inicio.shows_navigation_footer());
        assert!(AssistantStep::Combinacion.shows_navigation_footer());
        assert!(!AssistantStep::Reglas.shows_navigation_footer());
        assert!(!AssistantStep::Pilotos.shows_navigation_footer());
        assert!(AssistantStep::Sesiones.shows_navigation_footer());
    }
}
