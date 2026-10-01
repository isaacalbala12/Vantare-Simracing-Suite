//! Strategy composes Orbit controls; persistence and calculation stay in its owner.
use super::assistant::AssistantStep;
use super::editor_view::EditorTab;
use super::*;
use gpui::{AnyElement, ObjectFit, img, px, rgb, rgba};
use orbit::{Choice, ChoiceChanged, ChoiceKind, OptionItem, Tone};

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub(super) enum Page {
    #[default]
    Collection,
    Assistant(AssistantStep),
    Create,
    Editor(EditorTab),
}

fn pending(id: &'static str, label: &str) -> gpui::Stateful<gpui::Div> {
    button(id, &format!("{label} · pendiente"))
        .tab_stop(false)
        .opacity(orbit::DISABLED)
        .cursor(gpui::CursorStyle::Arrow)
}
fn column() -> gpui::Div {
    div()
        .flex()
        .flex_col()
        .min_w_0()
        .flex_1()
        .gap(px(orbit::RADIUS_CONTROL))
}
fn row() -> gpui::Div {
    div().flex().min_w_0().gap(px(orbit::RADIUS_CONTROL))
}
fn option(title: &str, help: &str, action: impl IntoElement) -> gpui::Div {
    orbit::card("").child(
        orbit::card_body()
            .gap(px(orbit::RADIUS_CONTROL))
            .child(orbit::text(title.to_owned(), orbit::BODY, 700, orbit::INK))
            .child(orbit::text(help.to_owned(), orbit::BODY, 400, orbit::INK_2))
            .child(action),
    )
}
fn context_new_selected(page: Page) -> bool {
    !matches!(page, Page::Collection)
}
fn context_sidebar_visible(page: Page) -> bool {
    matches!(page, Page::Assistant(_))
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum GarageBackground {
    Standard,
    Career,
    Detail,
}
fn garage_background_kind(page: Page) -> Option<GarageBackground> {
    match page {
        Page::Editor(EditorTab::Revisiones) => Some(GarageBackground::Detail),
        Page::Editor(EditorTab::Carrera) => Some(GarageBackground::Career),
        Page::Assistant(_) | Page::Editor(EditorTab::Datos | EditorTab::Plan) => {
            Some(GarageBackground::Standard)
        }
        _ => None,
    }
}
fn summary(event: &Value) -> String {
    [
        display(&event["cls"]["value"]),
        display(&event["track"]["value"]),
        format!(
            "{} pilotos",
            event["drivers"].as_array().map_or(0, Vec::len)
        ),
        format!(
            "{} estrategias",
            event["strategies"].as_array().map_or(0, Vec::len)
        ),
    ]
    .into_iter()
    .filter(|part| !part.is_empty())
    .collect::<Vec<_>>()
    .join(" · ")
}

impl Strategy {
    pub(crate) fn context_sidebar_visible(&self) -> bool {
        context_sidebar_visible(self.page)
    }

    pub(crate) fn garage_background(&self, viewport_width: f32) -> Option<AnyElement> {
        match garage_background_kind(self.page)? {
            GarageBackground::Detail => {
                let image = self.garage_detail.clone()?;
                let scale = viewport_width / 1672.0;
                let width = 1056.0 * scale;
                let image_height = width * 762.0 / 2064.0;
                Some(
                    div()
                        .absolute()
                        .top(px(0.0))
                        .right(px(0.0))
                        .w(px(width))
                        .h(px(272.0 * scale))
                        .overflow_hidden()
                        .child(
                            img(image)
                                .absolute()
                                .left(px(0.0))
                                .top(px(-10.0 * scale))
                                .w(px(width))
                                .h(px(image_height))
                                .object_fit(ObjectFit::Cover),
                        )
                        .into_any_element(),
                )
            }
            GarageBackground::Standard => {
                let image = self.garage.clone()?;
                let width = (viewport_width - 74.0).max(0.0);
                Some(
                    div()
                        .absolute()
                        .left(px(74.0))
                        .top(px(0.0))
                        .w(px(width))
                        .h(px(width * 941.0 / 1672.0))
                        .child(
                            img(image)
                                .absolute()
                                .inset_0()
                                .size_full()
                                .object_fit(ObjectFit::Cover),
                        )
                        .child(div().absolute().inset_0().bg(rgba(0x0809_0b04)))
                        .into_any_element(),
                )
            }
            GarageBackground::Career => {
                let image = self.garage.clone()?;
                let scale = viewport_width / 1672.0 * 0.88;
                let width = 1672.0 * scale;
                let image_height = 941.0 * scale;
                Some(
                    div()
                        .absolute()
                        .top(px(0.0))
                        .right(px(0.0))
                        .w(px(width))
                        .h(px(image_height - 14.0 * scale))
                        .overflow_hidden()
                        .child(
                            img(image)
                                .absolute()
                                .left(px(0.0))
                                .top(px(-14.0 * scale))
                                .w(px(width))
                                .h(px(image_height))
                                .object_fit(ObjectFit::Cover),
                        )
                        .into_any_element(),
                )
            }
        }
    }

    pub(super) fn navigate(&mut self, page: Page, cx: &mut Context<Self>) {
        if let Err(error) = self.ensure_clean_form() {
            self.outcome(Err(error), cx);
            return;
        }
        self.page = page;
        self.error = None;
        cx.notify();
    }
    fn cancel_form(&mut self, cx: &mut Context<Self>) {
        self.load_fields(cx);
        self.page = Page::Assistant(AssistantStep::Reglas);
        self.error = None;
        cx.notify();
    }
    fn collection(&self, cx: &mut Context<Self>) -> gpui::Div {
        let continue_action = if let Some(event) = self.current_event() {
            option(
                &display(&event["name"]["value"]),
                &summary(event),
                button("strategy-continue", "Continuar").on_click(cx.listener(|this, _, _, cx| {
                    this.navigate(Page::Editor(EditorTab::Carrera), cx);
                })),
            )
        } else {
            option(
                "Continuar",
                "Abre un documento V2 guardado en este equipo.",
                button("strategy-open", "Abrir documento")
                    .on_click(cx.listener(|this, _, _, cx| this.open(cx))),
            )
        };
        let mut saved = orbit::card_body().gap(px(orbit::RADIUS_CONTROL));
        let events = self
            .editor
            .document
            .as_ref()
            .and_then(|doc| doc.value()["events"].as_array());
        if let Some(events) = events.filter(|events| !events.is_empty()) {
            for (index, event) in events.iter().enumerate() {
                let variant = event["strategies"]
                    .as_array()
                    .and_then(|variants| {
                        variants
                            .iter()
                            .position(|variant| variant["id"] == event["activeStrategyId"])
                    })
                    .unwrap_or(0);
                saved = saved.child(
                    orbit::list_row(
                        "strategy-saved",
                        &display(&event["name"]["value"]),
                        &summary(event),
                        index == self.event,
                        true,
                    )
                    .id(("strategy-saved", index))
                    .on_click(cx.listener(move |this, _, _, cx| {
                        this.choose(index, variant, cx);
                        if this.error.is_none() {
                            this.page = Page::Editor(EditorTab::Carrera);
                        }
                    })),
                );
            }
        } else {
            saved = saved.child(orbit::empty_state(
                "Sin estrategias guardadas",
                "Crea tu estrategia o abre un documento V2 de este equipo.",
            ));
        }
        column()
            .child(orbit::card("Estrategia").child(
                orbit::card_body()
                    .gap(px(orbit::RADIUS_CONTROL))
                    .child(orbit::text(
                        "Retoma la estrategia que tenías entre manos o arranca una nueva con el asistente.",
                        orbit::BODY,
                        400,
                        orbit::INK_2,
                    ))
                    .child(
                        row()
                            .child(column().child(continue_action))
                            .child(column().child(option(
                                "Nueva estrategia",
                                "Prepara la carrera con el asistente de cinco pasos.",
                                button("strategy-new", "Nueva estrategia").on_click(cx.listener(
                                    |this, _, _, cx| {
                                        this.automatic = false;
                                        this.navigate(
                                            Page::Assistant(AssistantStep::Inicio),
                                            cx,
                                        );
                                    },
                                )),
                            ))),
                    ),
            ))
            .child(orbit::card("Carreras de Le Mans Ultimate").child(
                orbit::card_body()
                    .child(orbit::empty_state(
                        "Calendario · pendiente",
                        "La selección de carreras todavía no tiene contrato nativo en Strategy.",
                    ))
                    .child(pending("strategy-calendar", "Ver carreras")),
            ))
            .child(orbit::card("Guardadas").child(saved))
            .child(Self::document_actions(cx))
    }
    fn document_actions(cx: &mut Context<Self>) -> gpui::Div {
        row()
            .flex_wrap()
            .child(
                button("strategy-open-document", "Abrir documento V2")
                    .on_click(cx.listener(|this, _, _, cx| this.open(cx))),
            )
            .child(
                button("strategy-save", "Guardar")
                    .on_click(cx.listener(|this, _, _, cx| this.save(cx))),
            )
            .child(
                button("strategy-save-as", "Guardar como")
                    .on_click(cx.listener(|this, _, _, cx| this.save_as(cx))),
            )
            .child(
                button("strategy-discard", "Descartar cambios")
                    .on_click(cx.listener(|this, _, _, cx| this.discard(cx))),
            )
            .child(pending("strategy-migrate", "Migrar datos antiguos"))
    }
    pub(super) fn field(&self, index: usize) -> gpui::Div {
        column()
            .child(orbit::eyebrow(FIELDS[index].0))
            .child(self.inputs[index].clone())
    }
    fn event_form(&mut self, window: &mut Window, cx: &mut Context<Self>) -> gpui::Div {
        if self.duration.is_none() {
            let duration = cx.new(|cx| {
                Choice::new(
                    "Duración",
                    ChoiceKind::Segmented,
                    ["1 h", "2 h", "4 h", "6 h", "Personalizada"]
                        .into_iter()
                        .map(OptionItem::new)
                        .collect(),
                    None,
                    window,
                    cx,
                )
            });
            cx.subscribe(&duration, |this, _, event: &ChoiceChanged, cx| {
                if let Some(minutes) = DURATIONS.get(event.0) {
                    this.fields[1] = minutes.to_string();
                    this.form_dirty = true;
                    this.sync_inputs(cx);
                }
                cx.notify();
            })
            .detach();
            self.duration = Some(duration);
        }
        orbit::card("Crear mi estrategia").child(
            orbit::card_body()
                .gap(px(orbit::RADIUS_CONTROL))
                .child(orbit::text(
                    "todo se puede cambiar después",
                    orbit::SECONDARY,
                    400,
                    orbit::INK_3,
                ))
                .child(row().child(self.field(0)).child(self.field(4)))
                .child(row().child(self.field(5)).child(self.field(24)))
                .child(
                    row()
                        .child(
                            column()
                                .child(orbit::eyebrow("Duración"))
                                .children(self.duration.clone())
                                .child(self.inputs[1].clone())
                                .child(orbit::chip("Manual", Tone::Neutral)),
                        )
                        .child(
                            column()
                                .child(self.field(2))
                                .child(orbit::chip("Manual", Tone::Neutral)),
                        ),
                )
                .child(
                    row()
                        .child(
                            column()
                                .child(self.field(3))
                                .child(orbit::chip("Manual", Tone::Neutral)),
                        )
                        .child(
                            column()
                                .child(orbit::eyebrow("Equipo"))
                                .child(pending("strategy-team-name", "Equipo")),
                        ),
                )
                .child(orbit::eyebrow("Pilotos"))
                .child(
                    row()
                        .child(self.field(26))
                        .child(self.field(27))
                        .child(self.field(10))
                        .child(self.field(11)),
                )
                .child(pending("strategy-add-driver", "Añadir piloto"))
                .child(
                    row()
                        .child(
                            button("strategy-create-plan", "Crear y planificar")
                                .on_click(cx.listener(|this, _, _, cx| this.add_event(cx))),
                        )
                        .child(
                            button("strategy-cancel-form", "Cancelar")
                                .on_click(cx.listener(|this, _, _, cx| this.cancel_form(cx))),
                        ),
                ),
        )
    }
    fn variants(&self, cx: &mut Context<Self>) -> gpui::Div {
        let mut body = orbit::card_body();
        if let Some(event) = self.current_event() {
            for (index, variant) in event["strategies"]
                .as_array()
                .map_or(&[][..], Vec::as_slice)
                .iter()
                .enumerate()
            {
                let event = self.event;
                body = body.child(
                    orbit::list_row(
                        "strategy-variant",
                        &display(&variant["name"]["value"]),
                        &display(&variant["note"]["value"]),
                        index == self.variant,
                        true,
                    )
                    .id(("strategy-variant", index))
                    .on_click(cx.listener(move |this, _, _, cx| this.choose(event, index, cx))),
                );
            }
        }
        orbit::card("Estrategias").child(body)
    }
    fn field_group(&self, title: &str, range: std::ops::Range<usize>) -> gpui::Div {
        orbit::card(title).child(
            orbit::card_body()
                .gap(px(orbit::RADIUS_CONTROL))
                .children(range.map(|index| self.field(index))),
        )
    }
    pub(super) fn workspace(&self, cx: &mut Context<Self>) -> gpui::Div {
        column().child(self.variants(cx))
            .child(orbit::callout("Cálculo manual escalar. Telemetría, forecast, pilotos múltiples, inventario, ahorro e incertidumbre · pendiente. Escribe todos los números; 0 desactiva VE/vida/reserva."))
            .child(row().child(column().child(self.field_group("Evento", 0..6)).child(self.field_group("Variante", 6..9)))
                .child(column().child(self.field_group("Ritmo y recursos", 9..16)).child(self.field_group("Boxes y reservas", 16..24))))
            .child(row().flex_wrap()
                .child(button("strategy-confirm-event", "Confirmar evento y variante").on_click(cx.listener(|this, _, _, cx| this.confirm_event(cx))))
                .child(button("strategy-calculate", if self.running { "Calculando…" } else { "Confirmar entradas y calcular" })
                    .on_click(cx.listener(|this, _, _, cx| this.calculate(cx))))
                .child(button("strategy-cancel", "Cancelar cálculo").on_click(cx.listener(|this, _, _, cx| {
                    this.invalidate();
                    this.status = "Cálculo cancelado; no se conserva resultado parcial".into();
                    cx.notify();
                }))))
            .child(self.result_card()).child(Self::document_actions(cx))
    }
    pub(crate) fn context_sidebar(&self, cx: &mut Context<Self>) -> gpui::Div {
        let simulator = if self.current_event().is_some() && self.demo_car.is_some() {
            "Le Mans Ultimate"
        } else {
            "Sin simulador seleccionado"
        };
        let (car, circuit) = self.current_event().map_or_else(
            || {
                (
                    "Sin carrera seleccionada".to_owned(),
                    "Sin circuito seleccionado".to_owned(),
                )
            },
            |event| {
                (
                    self.demo_car
                        .clone()
                        .unwrap_or_else(|| display(&event["cls"]["value"])),
                    display(&event["track"]["value"]),
                )
            },
        );
        let selected_new = context_new_selected(self.page);
        let new_strategy = div()
            .id("strategy-context-new")
            .role(gpui::Role::Button)
            .aria_label("Nueva estrategia")
            .aria_selected(selected_new)
            .tab_index(0)
            .w_full()
            .h(px(46.0))
            .px(px(14.0))
            .flex()
            .items_center()
            .rounded(px(orbit::RADIUS_CONTROL))
            .cursor_pointer()
            .when(selected_new, |row| {
                row.bg(rgb(orbit::SURFACE_2))
                    .border_l_2()
                    .border_color(rgb(orbit::CARMINE))
            })
            .child(orbit::text("Nueva estrategia", 15.0, 500, orbit::INK))
            .on_click(cx.listener(|this, _, _, cx| {
                if let Err(error) = this.ensure_clean_form() {
                    this.error = Some(error);
                } else {
                    this.automatic = false;
                    this.automatic_preparation = None;
                    this.page = Page::Assistant(AssistantStep::Inicio);
                    this.error = None;
                }
                cx.notify();
            }));
        let saved = div()
            .id("strategy-context-saved")
            .role(gpui::Role::Button)
            .aria_label("Guardadas")
            .aria_selected(!selected_new)
            .tab_index(0)
            .w_full()
            .h(px(46.0))
            .px(px(14.0))
            .flex()
            .items_center()
            .rounded(px(orbit::RADIUS_CONTROL))
            .cursor_pointer()
            .child(orbit::text("Guardadas", 15.0, 400, orbit::INK_2))
            .on_click(cx.listener(|this, _, _, cx| this.navigate(Page::Collection, cx)));
        div()
            .flex()
            .flex_col()
            .w_full()
            .gap(px(0.0))
            .mb(px(32.0))
            .child(orbit::eyebrow("ESTRATEGIA").px(px(9.0)).py(px(4.0)))
            .child(new_strategy)
            .child(saved)
            .child(
                div()
                    .mt(px(15.0))
                    .pt(px(12.0))
                    .border_t_1()
                    .border_color(rgba(orbit::LINE_ROW))
                    .child(orbit::eyebrow("TU CARRERA").px(px(9.0)).pb(px(23.0)))
                    .child(Self::context_info_row(
                        "i-telemetria",
                        "Simulador",
                        simulator,
                    ))
                    .child(Self::context_info_row(
                        "i-estrategia",
                        "Categoría / coche",
                        &car,
                    ))
                    .child(Self::context_info_row(
                        "i-carreras",
                        "Circuito / trazado",
                        &circuit,
                    )),
            )
    }

    fn context_info_row(icon: &'static str, label: &str, value: &str) -> gpui::Div {
        div()
            .h(px(70.0))
            .px(px(9.0))
            .flex()
            .items_center()
            .gap(px(15.0))
            .border_b_1()
            .border_color(rgba(orbit::LINE_ROW))
            .child(orbit::icon(icon, 19.0, orbit::INK_2))
            .child(
                div()
                    .flex()
                    .flex_col()
                    .gap(px(4.0))
                    .child(orbit::text(label, 11.5, 400, orbit::INK_3))
                    .child(orbit::text(value.to_owned(), 12.5, 600, orbit::INK)),
            )
    }

    pub(super) fn render_page(
        &mut self,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> AnyElement {
        let content = match self.page {
            Page::Collection => self.collection(cx),
            Page::Assistant(step) => {
                self.assistant_page(step, f32::from(window.viewport_size().height), cx)
            }
            Page::Create => self.event_form(window, cx),
            Page::Editor(tab) => {
                self.editor_page(tab, f32::from(window.viewport_size().height), cx)
            }
        };
        column()
            .id("strategy")
            .when(
                matches!(self.page, Page::Assistant(_) | Page::Editor(_)),
                |page| page.h_full().min_h(px(0.0)),
            )
            .child(content)
            .when_some(self.error.clone(), |page, error| {
                page.child(orbit::callout(error))
            })
            .when(matches!(self.page, Page::Collection), |page| {
                page.child(orbit::text(
                    self.status.clone(),
                    orbit::SECONDARY,
                    400,
                    orbit::INK_3,
                ))
                .child(orbit::text(
                    if self.editor.dirty() || self.form_dirty {
                        "Cambios pendientes"
                    } else {
                        "Sin cambios pendientes"
                    },
                    orbit::SECONDARY,
                    400,
                    orbit::INK_3,
                ))
            })
            .into_any_element()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn assistant_and_editor_routes_have_explicit_tabs() {
        assert_eq!(AssistantStep::ALL.len(), 5);
        assert_eq!(EditorTab::ALL.len(), 4);
        assert_eq!(
            Page::Assistant(AssistantStep::Pilotos),
            Page::Assistant(AssistantStep::Pilotos)
        );
        assert_ne!(
            Page::Editor(EditorTab::Carrera),
            Page::Editor(EditorTab::Revisiones)
        );
    }

    #[test]
    fn context_navigation_tracks_the_strategy_and_saved_pages() {
        assert!(!context_new_selected(Page::Collection));
        assert!(context_new_selected(Page::Assistant(AssistantStep::Inicio)));
        assert!(context_new_selected(Page::Editor(EditorTab::Carrera)));
    }

    #[test]
    fn strategy_context_column_only_belongs_to_the_assistant() {
        assert!(context_sidebar_visible(Page::Assistant(
            AssistantStep::Inicio
        )));
        assert!(!context_sidebar_visible(Page::Editor(EditorTab::Carrera)));
    }

    #[test]
    fn strategy_garage_background_only_covers_assistant_and_editor() {
        assert_eq!(
            garage_background_kind(Page::Assistant(AssistantStep::Inicio)),
            Some(GarageBackground::Standard)
        );
        assert_eq!(
            garage_background_kind(Page::Editor(EditorTab::Carrera)),
            Some(GarageBackground::Career)
        );
        assert_eq!(
            garage_background_kind(Page::Editor(EditorTab::Revisiones)),
            Some(GarageBackground::Detail)
        );
        assert_eq!(garage_background_kind(Page::Collection), None);
    }
}
