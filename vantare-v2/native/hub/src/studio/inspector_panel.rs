//! Inspector del widget seleccionado: controles, pestañas y su sincronización con `Editor`. Mapa: `README.md`.
use super::*;

impl Studio {
    fn color_settings(&self, tab: Tab, mut panel: gpui::Div, cx: &mut Context<Self>) -> gpui::Div {
        if tab == Tab::Appearance
            && let Some(color) = &self.color
        {
            let selected = self.editor.selected.clone();
            panel = panel
                .child(orbit::eyebrow("Color del texto", cx))
                .child(color.clone())
                .child(
                    button("apply-color", "Aplicar color", cx).on_click(cx.listener(
                        move |this, _, _, cx| {
                            if this.editor.selected != selected {
                                return;
                            }
                            let Some(color) = &this.color else {
                                return;
                            };
                            let value = color.read(cx).value.clone();
                            if !inspector::valid_color(&value) {
                                this.status = Err("Color inválido: usa #RRGGBB".into());
                                cx.notify();
                                return;
                            }
                            this.edit(
                                |editor| {
                                    editor.edit_selected(|item| {
                                        if let Settings::RacingFlags(settings) = &mut item.settings
                                        {
                                            settings.text_color = value.to_ascii_lowercase();
                                        }
                                    })
                                },
                                cx,
                            );
                        },
                    )),
                );
        }
        panel
    }
    fn column_settings(
        item: &Instance,
        tab: Tab,
        session: vantare_ui::session::Session,
        mut panel: gpui::Div,
        cx: &mut Context<Self>,
    ) -> gpui::Div {
        if tab == Tab::Content
            && let Some(columns) = inspector::columns(&item.settings, session)
        {
            panel = panel.child(orbit::eyebrow("Columnas", cx));
            for (index, column) in columns.iter().enumerate() {
                let selected = item.id.clone();
                let required = inspector::appearance(&item.settings).is_some()
                    && (column.metric_id == "driverName"
                        || (matches!(&item.settings, Settings::Standings(_))
                            && column.metric_id == "position"));
                panel = panel.child(orbit::setting_row(
                    inspector::column_label(&column.metric_id),
                    "",
                    orbit::toggle(
                        "column-visible",
                        "Mostrar columna",
                        column.enabled || required,
                        !required,
                        cx,
                    )
                    .id(("column-visible", index))
                    .on_click(cx.listener(move |this, _, _, cx| {
                        if required || this.editor.selected.as_ref() != Some(&selected) {
                            return;
                        }
                        this.reset_fields();
                        this.edit(
                            |editor| {
                                editor.edit_selected(|item| {
                                    if let Some(columns) =
                                        inspector::columns_mut(&mut item.settings, session)
                                        && let Some(column) = columns.get_mut(index)
                                    {
                                        column.enabled = !column.enabled;
                                    }
                                })
                            },
                            cx,
                        );
                    })),
                    cx,
                ));
            }
        }
        panel
    }
    fn anchor_grid(&self, item: &Instance, cx: &mut Context<Self>) -> gpui::Div {
        let size = self.selected_size(cx);
        let mut anchors = div()
            .flex()
            .flex_col()
            .gap(px(4.0))
            .p(px(6.0))
            .rounded(px(orbit::skin(cx).radius.md))
            .bg(rgb(orbit::surface_2(cx)));
        for row in 0..3u8 {
            let mut line = div().flex().gap(px(4.0));
            for column in 0..3u8 {
                let position = size.and_then(|size| self.anchored_position(size, column, row));
                let active = position
                    .is_some_and(|(x, y)| (item.x - x).abs() < 0.01 && (item.y - y).abs() < 0.01);
                let label = format!(
                    "Anclar {} {}",
                    ["arriba", "centro", "abajo"][usize::from(row)],
                    ["izquierda", "centro", "derecha"][usize::from(column)]
                );
                line = line.child(
                    orbit::position_cell(
                        ("studio-anchor", usize::from(row) * 3 + usize::from(column)),
                        "",
                        22.0,
                        16.0,
                        active,
                        cx,
                    )
                    .aria_label(label)
                    .on_click(
                        cx.listener(move |this, _, _, cx| this.position_anchor(column, row, cx)),
                    ),
                );
            }
            anchors = anchors.child(line);
        }
        anchors
    }
    fn nudge_pad(cx: &mut Context<Self>) -> gpui::Div {
        let mut dpad = div().flex().flex_col().gap(px(3.0));
        let cells = [
            [None, Some(("▲", "Mover arriba", (0, -1))), None],
            [
                Some(("◀", "Mover izquierda", (-1, 0))),
                Some(("•", "Centrar widget", (0, 0))),
                Some(("▶", "Mover derecha", (1, 0))),
            ],
            [None, Some(("▼", "Mover abajo", (0, 1))), None],
        ];
        for (row, cells) in cells.into_iter().enumerate() {
            let mut line = div().flex().gap(px(3.0));
            for (column, cell) in cells.into_iter().enumerate() {
                line = match cell {
                    None => line.child(div().size(px(26.0))),
                    Some((glyph, label, direction)) => line.child(
                        orbit::position_cell(
                            ("studio-nudge", row * 3 + column),
                            glyph,
                            26.0,
                            26.0,
                            false,
                            cx,
                        )
                        .aria_label(label)
                        .on_mouse_down(
                            MouseButton::Left,
                            cx.listener(move |this, event: &gpui::MouseDownEvent, _, cx| {
                                if direction != (0, 0) {
                                    this.start_nudge(direction, event.modifiers.shift, cx);
                                }
                            }),
                        )
                        .on_mouse_up(
                            MouseButton::Left,
                            cx.listener(|this, _, _, cx| this.finish_nudge(cx)),
                        )
                        .on_mouse_up_out(
                            MouseButton::Left,
                            cx.listener(|this, _, _, cx| this.finish_nudge(cx)),
                        )
                        .on_click(cx.listener(
                            move |this, event: &gpui::ClickEvent, _, cx| {
                                if direction == (0, 0) {
                                    this.position_anchor(1, 1, cx);
                                } else if !matches!(event, gpui::ClickEvent::Mouse(_)) {
                                    this.position_nudge(direction, event.modifiers().shift, cx);
                                }
                            },
                        )),
                    ),
                };
            }
            dpad = dpad.child(line);
        }
        dpad
    }
    fn position_controls(&self, item: &Instance, cx: &mut Context<Self>) -> gpui::Div {
        div()
            .min_w_0()
            .flex()
            .flex_col()
            .gap(px(10.0))
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(18.0))
                    .child(self.anchor_grid(item, cx))
                    .child(Self::nudge_pad(cx)),
            )
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(8.0))
                    .child(text("Tamaño", 11.0, 500, orbit::ink_3(cx), cx))
                    .child(
                        orbit::position_cell("studio-size-minus", "−", 28.0, 28.0, false, cx)
                            .aria_label("Reducir widget 10 %")
                            .on_click(cx.listener(|this, _, _, cx| this.scale_by(0.9, cx))),
                    )
                    .child(orbit::mono_text("Escala", 11.0, orbit::ink_2(cx), cx))
                    .child(
                        orbit::position_cell("studio-size-plus", "+", 28.0, 28.0, false, cx)
                            .aria_label("Ampliar widget 10 %")
                            .on_click(cx.listener(|this, _, _, cx| this.scale_by(1.1, cx))),
                    ),
            )
            .child(text(
                "Flechas: mover · Alt: tamaño · Mayús: 8 px",
                11.0,
                400,
                orbit::ink_3(cx),
                cx,
            ))
    }
    fn set_widget_frequency(&mut self, hz: Option<u16>, cx: &mut Context<Self>) {
        let Some(item) = self.editor.selected() else {
            return;
        };
        let id = item.id.clone();
        let mut next = self.performance().clone();
        if let Some(hz) = hz {
            next.widgets.insert(id, hz);
        } else {
            next.widgets.remove(&id);
        }
        self.status = self.editor.set_performance(next);
        cx.notify();
    }
    fn performance_settings(&self, cx: &mut Context<Self>) -> gpui::Div {
        if self
            .editor
            .selected()
            .is_some_and(|item| item.settings.kind() == vantare_ui::Kind::RacingFlags)
        {
            return orbit::inspector_section("Rendimiento", "v-gauge", cx).child(text(
                "Las banderas se actualizan con cada foto para conservar los avisos inmediatos.",
                12.0,
                400,
                orbit::ink_2(cx),
                cx,
            ));
        }
        let mut controls = div().flex().flex_wrap().gap(px(6.0));
        for (index, hz) in [
            None,
            Some(1),
            Some(4),
            Some(5),
            Some(10),
            Some(15),
            Some(20),
            Some(30),
            Some(60),
        ]
        .into_iter()
        .enumerate()
        {
            controls = controls.child(
                button(
                    format!("studio-frequency-{index}"),
                    &hz.map_or_else(|| "Usar nivel".to_owned(), |hz| format!("{hz} Hz")),
                    cx,
                )
                .track_focus(&self.frequency_focus[index])
                .when(
                    self.editor
                        .selected()
                        .map(|item| self.performance().widgets.get(&item.id).copied())
                        == Some(hz),
                    |button| button.border_color(rgb(orbit::carmine(cx))),
                )
                .on_key_down(
                    cx.listener(move |studio, event: &gpui::KeyDownEvent, _, cx| {
                        if matches!(event.keystroke.key.as_str(), "enter" | "space") {
                            studio.set_widget_frequency(hz, cx);
                            cx.stop_propagation();
                        }
                    }),
                )
                .on_click(cx.listener(move |studio, _, _, cx| studio.set_widget_frequency(hz, cx))),
            );
        }
        let prefs = self.performance();
        let label = self.editor.selected().map_or_else(
            || "Selecciona un widget".to_owned(),
            |item| {
                format!(
                    "Frecuencia aplicada: {} · {}",
                    match prefs.hz(&item.id, item.settings.kind()) {
                        0 => "cada foto".to_owned(),
                        hz => format!("{hz} Hz"),
                    },
                    prefs.level.label()
                )
            },
        );
        orbit::inspector_section("Rendimiento", "v-gauge", cx)
            .child(text(label, 12.0, 400, orbit::ink_2(cx), cx))
            .child(controls)
    }
    fn tab_settings(
        &self,
        item: &Instance,
        tab: Tab,
        mut panel: gpui::Div,
        cx: &mut Context<Self>,
    ) -> gpui::Div {
        match tab {
            Tab::Layout => {
                panel = panel
                    .child(self.position_controls(item, cx))
                    .child(
                        button("front", "Traer al frente", cx)
                            .on_click(cx.listener(|this, _, _, cx| this.edit(Editor::front, cx))),
                    )
                    .child(
                        button("back", "Enviar al fondo", cx)
                            .on_click(cx.listener(|this, _, _, cx| this.edit(Editor::back, cx))),
                    );
            }
            Tab::Behavior => {
                panel = panel.child(text(
                    "Más condiciones próximamente",
                    12.0,
                    400,
                    orbit::ink_3(cx),
                    cx,
                ));
            }
            Tab::Content | Tab::Appearance => {
                if tab == Tab::Content && matches!(&item.settings, Settings::Delta(_)) {
                    panel = panel.child(text(
                        "La mejor vuelta es la propia. Óptima compara con tus mejores sectores; Líder, con la mejor de quien encabeza tu clase. Última vuelta y mejor absoluta de sesión: próximamente, sin señal independiente del núcleo.",
                        11.0, 400, orbit::ink_3(cx), cx,
                    ));
                }
                if tab == Tab::Appearance && inspector::appearance(&item.settings).is_none() {
                    panel = panel.child(orbit::pending_select(
                        "studio-style",
                        "Estilo del widget",
                        "Estilo · Próximamente",
                        180.0,
                        "Neo, Carmín y Limpio no están disponibles para este documento.",
                        cx,
                    ));
                    if self.color.is_none() {
                        panel = panel.child(orbit::pending_select(
                            "studio-accent",
                            "Acento del widget",
                            "Acento · Próximamente",
                            180.0,
                            "Este widget no admite un acento configurable en el documento actual.",
                            cx,
                        ));
                    }
                }
                panel = self.color_settings(tab, panel, cx);
                panel = Self::column_settings(item, tab, self.session_tab, panel, cx);

                if tab == Tab::Content && !inspector::pending(&item.settings).is_empty() {
                    panel = panel.child(text(
                        "Más opciones próximamente",
                        12.0,
                        400,
                        orbit::ink_3(cx),
                        cx,
                    ));
                }
                if self
                    .fields
                    .iter()
                    .all(|(field_tab, _, _, _)| *field_tab != tab)
                {
                    panel = panel.child(orbit::empty_state(
                        "Sin ajustes disponibles",
                        "El widget conserva sus ajustes.",
                        cx,
                    ));
                }
            }
        }
        panel
    }
    #[allow(clippy::too_many_lines)] // Compone las secciones del inspector con los controles existentes.
    pub(super) fn inspector(&self, cx: &mut Context<Self>) -> gpui::Div {
        let mut panel = div().min_w_0().flex().flex_col();
        if let Some(item) = self.editor.selected() {
            panel = panel.child(
                div()
                    .flex_none()
                    .min_w_0()
                    .flex()
                    .items_center()
                    .gap(px(10.0))
                    .p(px(16.0))
                    .border_b_1()
                    .border_color(orbit::alpha(orbit::skin(cx).line1))
                    .child(widget_icon(item.settings.kind(), 28.0, orbit::carmine(cx)))
                    .child(
                        text(item.settings.kind().label(), 18.0, 600, orbit::ink(cx), cx)
                            .flex_1()
                            .min_w_0()
                            .whitespace_nowrap()
                            .overflow_hidden()
                            .text_ellipsis(),
                    )
                    .child(
                        // Volver al catálogo (#1569): deselecciona, como Esc o clic en lienzo vacío.
                        orbit::ghost_button("studio-clear-selection", "", cx)
                            .h(px(30.0))
                            .pl(px(9.0))
                            .pr(px(12.0))
                            .gap(px(6.0))
                            .flex_none()
                            .aria_label("Deseleccionar y volver al catálogo (Esc)")
                            .child(orbit::icon("plus", 14.0, orbit::skin(cx).accent_bright))
                            .child(text("Añadir", 12.5, 500, orbit::ink_2(cx), cx))
                            .on_click(cx.listener(|this, _, window, cx| {
                                this.focus_catalog_search(window, cx);
                            })),
                    ),
            );
            for tab in Tab::ALL {
                #[cfg(feature = "parity-capture")]
                if capture_session(cx).is_some() {
                    let behavior =
                        std::env::var("VANTARE_CAPTURE_INSPECTOR").as_deref() == Ok("behavior");
                    if tab
                        != if behavior {
                            Tab::Behavior
                        } else {
                            Tab::Content
                        }
                    {
                        continue;
                    }
                }
                if tab == Tab::Layout {
                    panel = panel.child(self.performance_settings(cx));
                }
                let title = tab.label();
                let mut card = orbit::inspector_section(
                    title,
                    match tab {
                        Tab::Layout => "v-studio",
                        Tab::Content => "v-testing",
                        Tab::Behavior => "v-gauge",
                        Tab::Appearance => "v-palette",
                    },
                    cx,
                );
                let mut body = div().flex().flex_col().gap(px(10.0));
                if tab == Tab::Content {
                    body = body.children(Self::session_tabs(item, self.session_tab, cx));
                }
                for (field_tab, label, control, show_label) in &self.fields {
                    if *field_tab == tab {
                        body =
                            body.child(
                                div()
                                    .flex()
                                    .items_center()
                                    .justify_between()
                                    .gap(px(12.0))
                                    .when(*show_label, |row| {
                                        row.child(
                                            text(*label, 12.0, 500, orbit::ink_2(cx), cx)
                                                .flex_1()
                                                .min_w_0(),
                                        )
                                    })
                                    .child(
                                        div()
                                            .min_w_0()
                                            .when(!*show_label, gpui::Styled::flex_1)
                                            .when(*show_label, |control| {
                                                // NumberControl necesita 168 px; la opacidad
                                                // también reserva sitio para el sufijo «%».
                                                control
                                                    .w(px(if *label == "Opacidad" {
                                                        196.0
                                                    } else {
                                                        168.0
                                                    }))
                                                    .flex_none()
                                            })
                                            .child(control.clone())
                                            .when(*label == "Opacidad", |control| {
                                                control.flex().items_center().gap(px(8.0)).child(
                                                    text("%", 12.0, 500, orbit::ink_2(cx), cx),
                                                )
                                            }),
                                    ),
                            );
                    }
                }
                body = self.tab_settings(item, tab, body, cx);
                let content = div()
                    .id(("studio-inspector-card", tab as usize))
                    .child(body);
                card = card.child(content);
                if tab == Tab::Layout {
                    card =
                        card.child(
                            div()
                                .flex()
                                .flex_wrap()
                                .gap(px(8.0))
                                .child(button("duplicate", "Duplicar", cx).on_click(cx.listener(
                                    |this, _, _, cx| {
                                        this.reset_fields();
                                        this.edit(Editor::duplicate, cx);
                                    },
                                )))
                                .child(button("remove-widget", "Eliminar", cx).on_click(
                                    cx.listener(|this, _, _, cx| {
                                        this.reset_fields();
                                        this.edit(Editor::remove, cx);
                                    }),
                                ))
                                .child(button("deselect", "Deseleccionar", cx).on_click(
                                    cx.listener(|this, _, _, cx| {
                                        this.cancel_drag(cx);
                                        this.editor.selected = None;
                                        this.reset_fields();
                                        this.rebuild(cx);
                                    }),
                                )),
                        );
                }
                panel = panel.child(card);
            }
        } else {
            panel = panel.child(div().p(px(16.0)).child(orbit::empty_state(
                "Inspector",
                "Selecciona un widget para editar sus propiedades.",
                cx,
            )));
        }
        panel
    }
    pub(super) fn obs_settings(cx: &mut Context<Self>) -> gpui::Div {
        div()
            .flex()
            .flex_col()
            .gap(px(8.0))
            .child(text(
                "Captura la ventana del overlay en OBS Studio.",
                12.0,
                400,
                orbit::ink_2(cx),
                cx,
            ))
            .child(text(
                "URL de OBS · Próximamente",
                11.0,
                500,
                orbit::ink_3(cx),
                cx,
            ))
    }
    pub(super) fn reset_fields(&mut self) {
        self.inspector_selection = None;
        self.fields.clear();
        self.size_fields.clear();
    }
    pub(super) fn sync_size_fields(&self, cx: &mut Context<Self>) {
        if let Some(size) = self.selected_size(cx) {
            for (title, control) in &self.size_fields {
                control.update(cx, |control, cx| {
                    control.range.value =
                        f64::from(if *title == "Ancho" { size.0 } else { size.1 });
                    cx.notify();
                });
            }
        }
    }
    #[allow(clippy::cast_possible_truncation)] // Entradas acotadas a ±100000 y opacidad 0..1.
    pub(super) fn init_controls(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        self.init_navigation_controls(window, cx);
        let Some(item) = self.editor.selected().cloned() else {
            self.reset_fields();
            return;
        };
        if self.inspector_selection.as_ref() == Some(&item.id) {
            return;
        }
        self.fields.clear();
        self.size_fields.clear();
        self.inspector_selection = Some(item.id.clone());
        self.color = if let Settings::RacingFlags(settings) = &item.settings {
            Some(cx.new(|cx| {
                orbit::Input::new(settings.text_color.clone(), "Color del texto (#RRGGBB)", cx)
            }))
        } else {
            None
        };
        if let Some(size) = self.selected_size(cx) {
            for (title, value, minimum, maximum) in [
                ("Ancho", size.0, 64.0, 3840.0),
                ("Alto", size.1, 32.0, 2160.0),
            ] {
                self.instance_number(
                    title,
                    Tab::Layout,
                    f64::from(value),
                    minimum,
                    maximum,
                    1.0,
                    |_, _| {},
                    cx,
                );
            }
        }
        let aspect =
            cx.new(|cx| Checkbox::switch("Mantener proporción", item.geometry.aspect_locked, cx));
        let id = item.id.clone();
        cx.subscribe(&aspect, move |this, _, event: &Checked, cx| {
            if this.editor.selected.as_ref() == Some(&id) {
                this.edit(
                    |editor| editor.edit_selected(|item| item.geometry.aspect_locked = event.0),
                    cx,
                );
            }
        })
        .detach();
        self.fields
            .push((Tab::Layout, "Mantener proporción", aspect.into(), false));
        self.instance_number(
            "Opacidad",
            Tab::Appearance,
            f64::from(item.opacity) * 100.0,
            0.0,
            100.0,
            5.0,
            |item, v| item.opacity = (v / 100.0) as f32,
            cx,
        );
        let visible = cx.new(|cx| Checkbox::switch("Visible", item.visible, cx));
        let id = item.id.clone();
        cx.subscribe(&visible, move |this, _, event: &Checked, cx| {
            if this.editor.selected.as_ref() == Some(&id) {
                this.edit(
                    |editor| editor.edit_selected(|item| item.visible = event.0),
                    cx,
                );
            }
        })
        .detach();
        self.fields
            .push((Tab::Behavior, "Visible", visible.into(), false));
        self.off_track_control(&item, window, cx);
        self.push_show_in_fields(&item, cx);
        self.push_session_column_formats(&item, window, cx);
        let fields_settings = match &item.settings {
            Settings::Standings(settings) => {
                Settings::Standings(settings.for_session(self.session_tab))
            }
            settings => settings.clone(),
        };
        for field in inspector::fields(&fields_settings) {
            let (tab, title) = (field.tab, field.title);
            let label = !matches!(&field.control, Control::Boolean { .. });
            let view = Self::setting_control(item.id.clone(), field, self.session_tab, window, cx);
            self.fields.push((tab, title, view, label));
        }
    }
    fn off_track_control(&mut self, item: &Instance, window: &mut Window, cx: &mut Context<Self>) {
        let options = [
            vantare_ui::layout::OffTrack::Inherit,
            vantare_ui::layout::OffTrack::AlwaysVisible,
            vantare_ui::layout::OffTrack::Hide,
        ];
        let off_track = cx.new(|cx| {
            Choice::new(
                "Fuera de pista",
                ChoiceKind::Dropdown,
                ["Heredar global", "Siempre visible", "Ocultar"]
                    .into_iter()
                    .map(OptionItem::new)
                    .collect(),
                options.iter().position(|value| *value == item.off_track),
                window,
                cx,
            )
        });
        let id = item.id.clone();
        cx.subscribe(&off_track, move |this, _, event: &ChoiceChanged, cx| {
            if this.editor.selected.as_ref() == Some(&id)
                && let Some(value) = options.get(event.0)
            {
                this.reset_fields();
                this.edit(
                    |editor| editor.edit_selected(|item| item.off_track = *value),
                    cx,
                );
            }
        })
        .detach();
        self.fields
            .push((Tab::Behavior, "Fuera de pista", off_track.into(), true));
    }
    fn setting_control(
        id: String,
        field: inspector::Field,
        session: vantare_ui::session::Session,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> gpui::AnyView {
        match field.control {
            Control::Boolean { value, set } => {
                let control = cx.new(|cx| Checkbox::switch(field.title, value, cx));
                cx.subscribe(&control, move |this, _, event: &Checked, cx| {
                    if this.editor.selected.as_ref() == Some(&id) {
                        this.edit(
                            |editor| editor.edit_selected(|item| set(&mut item.settings, event.0)),
                            cx,
                        );
                    }
                })
                .detach();
                control.into()
            }
            Control::Choice {
                options,
                selected,
                set,
            } => {
                let table_columns = field.title == "Formato de tabla";
                let control = cx.new(|cx| {
                    Choice::new(
                        field.title,
                        ChoiceKind::Dropdown,
                        options
                            .iter()
                            .map(|(label, _)| OptionItem::new(*label))
                            .collect(),
                        selected,
                        window,
                        cx,
                    )
                });
                cx.subscribe(&control, move |this, _, event: &ChoiceChanged, cx| {
                    if this.editor.selected.as_ref() == Some(&id)
                        && let Some((_, key)) = options.get(event.0)
                    {
                        this.reset_fields();
                        this.edit(
                            |editor| {
                                editor.edit_selected(|item| {
                                    if table_columns
                                        && let Settings::Standings(settings) = &mut item.settings
                                    {
                                        *settings.session_columns_mut(session) =
                                            vantare_ui::standings::vantare_template(key);
                                    } else {
                                        set(&mut item.settings, key);
                                    }
                                })
                            },
                            cx,
                        );
                    }
                })
                .detach();
                control.into()
            }
            Control::Number { range, set } => {
                let control =
                    cx.new(|cx| NumberControl::new(field.title, NumberKind::Stepper, range, cx));
                cx.subscribe(&control, move |this, _, event: &NumberChanged, cx| {
                    if this.editor.selected.as_ref() == Some(&id) {
                        this.edit(
                            |editor| editor.edit_selected(|item| set(&mut item.settings, event.0)),
                            cx,
                        );
                    }
                })
                .detach();
                control.into()
            }
        }
    }
    #[allow(clippy::too_many_arguments)]
    pub(super) fn instance_number(
        &mut self,
        title: &'static str,
        tab: Tab,
        value: f64,
        min: f64,
        max: f64,
        step: f64,
        set: impl Fn(&mut Instance, f64) + 'static,
        cx: &mut Context<Self>,
    ) {
        let control = cx.new(|cx| {
            let mut control = NumberControl::new(
                title,
                if title == "Opacidad" {
                    NumberKind::Slider
                } else {
                    NumberKind::Stepper
                },
                NumberRange {
                    min,
                    max,
                    step,
                    value,
                },
                cx,
            );
            if matches!(title, "Ancho" | "Alto") {
                control.decimal_places = Some(2);
            }
            control
        });
        let id = self.editor.selected.clone();
        cx.subscribe(&control, move |this, _, event: &NumberChanged, cx| {
            if this.editor.selected == id {
                if title == "Opacidad" {
                    #[allow(clippy::cast_possible_truncation)]
                    if let Some(id) = id.as_deref() {
                        this.preview_opacity(id, (event.0 / 100.0) as f32, cx);
                    }
                } else if matches!(title, "Ancho" | "Alto") {
                    let Some(size) = this.selected_size(cx) else {
                        return;
                    };
                    let axis = if title == "Ancho" {
                        vantare_ui::geometry::Handle(1, 0)
                    } else {
                        vantare_ui::geometry::Handle(0, 1)
                    };
                    #[allow(clippy::cast_possible_truncation)]
                    // NumberRange acotado a límites de Geometry.
                    let value = event.0 as f32;
                    let delta = if title == "Ancho" {
                        (value - size.0, 0.0)
                    } else {
                        (0.0, value - size.1)
                    };
                    this.edit(
                        |editor| {
                            editor.edit_selected(|item| {
                                if let Some((_, next)) = vantare_ui::geometry::resize(
                                    (item.x, item.y),
                                    vantare_ui::geometry::Size {
                                        width: size.0,
                                        height: size.1,
                                    },
                                    axis,
                                    delta,
                                    item.geometry.aspect_locked,
                                ) {
                                    item.geometry.size = Some(next);
                                }
                            })
                        },
                        cx,
                    );
                } else {
                    this.edit(|editor| editor.edit_selected(|item| set(item, event.0)), cx);
                }
            }
        })
        .detach();
        if title == "Opacidad" {
            cx.subscribe(&control, |this, _, _: &NumberFinished, cx| {
                this.finish_opacity(cx);
            })
            .detach();
        }
        if matches!(title, "Ancho" | "Alto") {
            self.size_fields.push((title, control.clone()));
        }
        self.fields.push((tab, title, control.into(), true));
    }
}
