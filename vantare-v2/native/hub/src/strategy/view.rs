//! Strategy composes Orbit controls; persistence and calculation stay in its owner.
use super::*;
use gpui::{AnyElement, px};
use orbit::{Choice, ChoiceChanged, ChoiceKind, OptionItem, Tone};

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub(super) enum Page {
    #[default]
    Collection,
    Origin,
    Team,
    Start,
    Create,
    Continue,
    Workspace,
    Data,
}
impl Page {
    fn back(self) -> Self {
        match self {
            Self::Team => Self::Origin,
            Self::Start => Self::Team,
            Self::Create => Self::Start,
            _ => Self::Collection,
        }
    }
    fn step(self) -> Option<usize> {
        match self {
            Self::Origin => Some(0),
            Self::Team => Some(1),
            Self::Start => Some(2),
            _ => None,
        }
    }
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
    fn navigate(&mut self, page: Page, cx: &mut Context<Self>) {
        if let Err(error) = self.ensure_clean_form() {
            self.outcome(Err(error), cx);
            return;
        }
        self.page = page;
        self.error = None;
        cx.notify();
    }
    pub(super) fn start_form(&mut self, cx: &mut Context<Self>) {
        self.fields.fill(String::new());
        self.form_dirty = false;
        self.scalar_dirty = false;
        self.duration = None;
        self.invalidate();
        self.sync_inputs(cx);
        self.page = Page::Create;
        cx.notify();
    }
    fn cancel_form(&mut self, cx: &mut Context<Self>) {
        self.load_fields(cx);
        self.page = Page::Start;
        self.error = None;
        cx.notify();
    }
    fn collection(&self, cx: &mut Context<Self>) -> gpui::Div {
        let continue_action = if let Some(event) = self.current_event() {
            option(
                &display(&event["name"]["value"]),
                &summary(event),
                button("strategy-continue", "Continuar")
                    .on_click(cx.listener(|this, _, _, cx| this.navigate(Page::Continue, cx))),
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
                            this.page = Page::Continue;
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
            .child(orbit::card("Estrategia").child(orbit::card_body().gap(px(orbit::RADIUS_CONTROL))
                .child(orbit::text("Retoma la estrategia que tenías entre manos o arranca una nueva con el asistente. Todo lo que guardas se queda en este equipo.", orbit::BODY, 400, orbit::INK_2))
                .child(row().child(column().child(continue_action)).child(column().child(option(
                    "Nueva estrategia", "Tres pasos: de dónde salen los datos, si corres solo o con equipo y de qué partes.",
                    button("strategy-new", "Nueva estrategia")
                        .on_click(cx.listener(|this, _, _, cx| this.navigate(Page::Origin, cx)))))))))
            .child(orbit::card("Carreras de Le Mans Ultimate").child(orbit::card_body()
                .child(orbit::empty_state("Calendario · pendiente", "La selección de carreras todavía no tiene contrato nativo en Strategy."))
                .child(pending("strategy-calendar", "Ver carreras"))))
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
    fn wizard(&self, cx: &mut Context<Self>) -> gpui::Div {
        let step = self.page.step().unwrap_or(0);
        let mut steps = row();
        for (index, label) in ["1 DATOS", "2 PILOTOS", "3 PUNTO DE PARTIDA"]
            .iter()
            .enumerate()
        {
            steps = steps.child(orbit::chip(
                label,
                if index == step {
                    Tone::Accent
                } else {
                    Tone::Neutral
                },
            ));
        }
        let (lead, choices) = self.wizard_choices(cx);
        orbit::card("Nueva estrategia").child(
            orbit::card_body()
                .gap(px(orbit::RADIUS_CONTROL))
                .child(orbit::text(
                    format!("paso {} de 3", step + 1),
                    orbit::SECONDARY,
                    400,
                    orbit::INK_3,
                ))
                .child(steps)
                .child(orbit::text(lead, orbit::BODY, 400, orbit::INK_2))
                .child(choices)
                .when(self.page == Page::Start, |body| {
                    body.child(orbit::eyebrow("Del calendario"))
                        .child(orbit::callout(
                            "Calendario · pendiente. Crea tu propio evento arriba.",
                        ))
                })
                .child(
                    button(
                        "strategy-back",
                        if step == 0 { "Cancelar" } else { "Atrás" },
                    )
                    .on_click(cx.listener(|this, _, _, cx| this.navigate(this.page.back(), cx))),
                ),
        )
    }
    fn wizard_choices(&self, cx: &mut Context<Self>) -> (&'static str, gpui::Div) {
        let (lead, paths) = match self.page {
            Page::Origin => (
                "¿De dónde salen los ritmos y los consumos de esta estrategia?",
                [
                    (
                        "strategy-manual",
                        "Manual",
                        "Tú escribes ritmo, consumo, depósito y parada. Es lo que hay hoy y funciona.",
                        Some(Page::Team),
                    ),
                    (
                        "strategy-automatic",
                        "Automática con telemetría",
                        "Usa ritmos y consumos reales de tus sesiones grabadas, sin escribir un número.",
                        None,
                    ),
                ],
            ),
            Page::Team => (
                "¿Corres esta carrera tú solo o repartiendo turnos?",
                [
                    (
                        "strategy-solo",
                        "Solo",
                        "Un único piloto: sin reparto de turnos ni tablero de disponibilidad.",
                        Some(Page::Start),
                    ),
                    (
                        "strategy-team",
                        "Con equipo",
                        "Varios pilotos, con su orden de relevos y su disponibilidad.",
                        None,
                    ),
                ],
            ),
            _ => (
                "Y por último, ¿de qué partimos?",
                [
                    (
                        "strategy-own",
                        "Crear mi estrategia",
                        "Tú pones el circuito, la duración, el depósito y los pilotos.",
                        Some(Page::Create),
                    ),
                    (
                        "strategy-from-calendar",
                        "Desde un evento",
                        "Elige una serie del calendario y la salida, la duración y la clase ya vienen puestas.",
                        None,
                    ),
                ],
            ),
        };
        let choices = row().children(paths.map(|(id, title, help, destination)| {
            let detail = if destination.is_some() {
                help.to_owned()
            } else {
                format!("{help} · pendiente")
            };
            column().child(orbit::card("").child(orbit::card_body().child(
                orbit::list_row(id, title, &detail, false, destination.is_some()).when_some(
                    destination,
                    |control, page| {
                        control.on_click(cx.listener(move |this, _, _, cx| {
                            if page == Page::Create {
                                this.start_form(cx);
                            } else {
                                this.navigate(page, cx);
                            }
                        }))
                    },
                ),
            )))
        }));
        (lead, choices)
    }
    fn field(&self, index: usize) -> gpui::Div {
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
    fn continuation(cx: &mut Context<Self>) -> gpui::Div {
        orbit::card("¿De qué combinación es este evento?").child(orbit::card_body().gap(px(orbit::RADIUS_CONTROL))
            .child(orbit::text("opcional · puedes seguir en manual", orbit::SECONDARY, 400, orbit::INK_3))
            .child(orbit::text("Conecta una combinación detectada para usar sus sesiones. Saltar mantiene el modo manual puro.", orbit::BODY, 400, orbit::INK_2))
            .child(orbit::empty_state("Combinaciones · pendiente", "La conexión de sesiones grabadas con Strategy aún no tiene contrato nativo."))
            .child(button("strategy-continue-manual", "Seguir en manual").on_click(cx.listener(|this, _, _, cx| this.navigate(Page::Workspace, cx)))))
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
    fn workspace(&self, cx: &mut Context<Self>) -> gpui::Div {
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
    pub(super) fn render_page(
        &mut self,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> AnyElement {
        let content = match self.page {
            Page::Collection => self.collection(cx).into_any_element(),
            Page::Origin | Page::Team | Page::Start => self.wizard(cx).into_any_element(),
            Page::Create => self.event_form(window, cx).into_any_element(),
            Page::Continue => Self::continuation(cx).into_any_element(),
            Page::Workspace => self.workspace(cx).into_any_element(),
            Page::Data => self.data_page(cx),
        };
        let tabs = matches!(self.page, Page::Workspace | Page::Data).then(|| self.section_tabs(cx));
        column()
            .id("strategy")
            .when(self.page != Page::Collection, |page| {
                page.child(
                    button(
                        "strategy-collection",
                        if self.page == Page::Data {
                            "← Volver al asistente"
                        } else {
                            "← Mis estrategias"
                        },
                    )
                    .on_click(cx.listener(|this, _, _, cx| {
                        if this.page == Page::Data {
                            this.page = Page::Start;
                            cx.notify();
                        } else {
                            if this.page == Page::Create {
                                this.cancel_form(cx);
                            }
                            this.navigate(Page::Collection, cx);
                        }
                    })),
                )
            })
            .when_some(tabs, gpui::ParentElement::child)
            .child(content)
            .when_some(self.error.clone(), |page, error| {
                page.child(orbit::callout(error))
            })
            .when(
                matches!(self.page, Page::Collection | Page::Workspace | Page::Data),
                |page| {
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
                },
            )
            .into_any_element()
    }

    fn section_tabs(&self, cx: &mut Context<Self>) -> gpui::Div {
        let selected = self.page == Page::Data;
        row()
            .child(
                button("strategy-tab-race", "Carrera")
                    .when(!selected, |tab| {
                        tab.border_color(orbit::tint(orbit::CARMINE, 1.0))
                    })
                    .on_click(cx.listener(|this, _, _, cx| {
                        this.page = Page::Workspace;
                        cx.notify();
                    })),
            )
            .child(
                button("strategy-tab-data", "Datos")
                    .when(selected, |tab| {
                        tab.border_color(orbit::tint(orbit::CARMINE, 1.0))
                    })
                    .on_click(cx.listener(|this, _, _, cx| {
                        this.page = Page::Data;
                        cx.notify();
                    })),
            )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn wizard_back_preserves_the_three_steps_and_cancel_returns_to_collection() {
        assert_eq!(Page::Origin.step(), Some(0));
        assert_eq!(Page::Team.back(), Page::Origin);
        assert_eq!(Page::Start.back(), Page::Team);
        assert_eq!(Page::Create.back(), Page::Start);
        assert_eq!(Page::Origin.back(), Page::Collection);
    }
}
