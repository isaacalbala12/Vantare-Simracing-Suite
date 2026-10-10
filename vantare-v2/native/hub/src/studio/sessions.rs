//! Widgets por tipo de sesión (#1564): pestañas de columnas de Standings y
//! «Mostrar en» de cualquier instancia.
use super::{Studio, Tab};
use crate::orbit::{
    self, Checkbox, Checked, Choice, ChoiceChanged, ChoiceKind, NumberChanged, NumberControl,
    NumberKind, NumberRange, OptionItem, button,
};
use gpui::{Context, Window, div, prelude::*, px};
use vantare_ui::standings::options::ColumnSetting;
use vantare_ui::{Settings, layout::Instance, session::Session};

#[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)] // Entrada finita, entera y acotada del Stepper.
fn set_name_chars(column: &mut ColumnSetting, value: f64) {
    if value.is_finite() {
        column.format.max_chars = Some(value.round().clamp(1.0, 64.0) as usize);
    }
}

#[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)] // Entrada finita, entera y acotada del Stepper.
fn set_decimals(column: &mut ColumnSetting, value: f64) {
    if value.is_finite() {
        column.format.decimals = Some(value.round().clamp(0.0, 3.0) as u8);
    }
}

impl Studio {
    pub(super) fn push_session_column_formats(
        &mut self,
        item: &Instance,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let Settings::Standings(_) = &item.settings else {
            return;
        };
        let columns =
            crate::inspector::columns(&item.settings, self.session_tab).unwrap_or_default();
        if columns.is_empty() {
            return;
        }
        let selected = columns
            .iter()
            .position(|column| column.metric_id == self.session_column)
            .unwrap_or(0);
        let column = columns[selected].clone();
        self.session_column.clone_from(&column.metric_id);
        let metrics: Vec<_> = columns
            .iter()
            .map(|column| column.metric_id.clone())
            .collect();
        let control = cx.new(|cx| {
            Choice::new(
                "Formato de columna",
                ChoiceKind::Dropdown,
                columns
                    .iter()
                    .map(|column| {
                        OptionItem::new(crate::inspector::column_label(&column.metric_id))
                    })
                    .collect(),
                Some(selected),
                window,
                cx,
            )
        });
        cx.subscribe(&control, move |this, _, event: &ChoiceChanged, cx| {
            if let Some(metric) = metrics.get(event.0) {
                this.session_column.clone_from(metric);
                this.reset_fields();
                this.rebuild(cx);
            }
        })
        .detach();
        self.fields
            .push((Tab::Content, "Formato de columna", control.into(), true));
        self.session_format_controls(&column, item, window, cx);
    }

    fn session_format_controls(
        &mut self,
        column: &ColumnSetting,
        item: &Instance,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if column.metric_id == "driverName" {
            self.session_format_choice(
                item,
                "Nombre del piloto",
                if column.format.mode.is_empty() {
                    "full"
                } else {
                    &column.format.mode
                },
                &[
                    ("Completo", "full"),
                    ("Inicial", "initial"),
                    ("Apellido", "surname"),
                    ("Recortado", "truncate"),
                ],
                |column, value| column.format.mode = value.into(),
                window,
                cx,
            );
            if column.format.mode == "truncate" {
                self.session_format_number(
                    item,
                    "Máximo de caracteres",
                    f64::from(
                        u32::try_from(column.format.max_chars.unwrap_or(16).min(64)).unwrap_or(64),
                    ),
                    1.0,
                    64.0,
                    set_name_chars,
                    cx,
                );
            }
            self.session_format_choice(
                item,
                "Ancho del piloto",
                &column.width_preset,
                &[
                    ("Automático", "auto"),
                    ("XS", "xs"),
                    ("S", "sm"),
                    ("M", "md"),
                    ("L", "lg"),
                ],
                |column, value| column.width_preset = value.into(),
                window,
                cx,
            );
        } else if ["lastLap", "bestLap"].contains(&column.metric_id.as_str()) {
            self.session_format_choice(
                item,
                "Formato de tiempo",
                column.format.display.as_deref().unwrap_or("normal"),
                &[("Completo", "normal"), ("Compacto", "compact")],
                |column, value| column.format.display = Some(value.into()),
                window,
                cx,
            );
            self.session_format_number(
                item,
                "Decimales",
                f64::from(column.format.decimals.unwrap_or(3)),
                0.0,
                3.0,
                set_decimals,
                cx,
            );
        }
    }

    #[allow(clippy::too_many_arguments)] // A single existing Choice bound to a column in the active tab.
    fn session_format_choice(
        &mut self,
        item: &Instance,
        title: &'static str,
        value: &str,
        options: &'static [(&str, &str)],
        set: fn(&mut vantare_ui::standings::options::ColumnSetting, &str),
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let control = cx.new(|cx| {
            Choice::new(
                title,
                ChoiceKind::Dropdown,
                options
                    .iter()
                    .map(|(label, _)| OptionItem::new(*label))
                    .collect(),
                options.iter().position(|(_, key)| *key == value),
                window,
                cx,
            )
        });
        let id = item.id.clone();
        let metric = self.session_column.clone();
        let session = self.session_tab;
        cx.subscribe(&control, move |this, _, event: &ChoiceChanged, cx| {
            if this.editor.selected.as_ref() == Some(&id)
                && let Some((_, key)) = options.get(event.0)
            {
                this.reset_fields();
                this.edit(
                    |editor| {
                        editor.edit_selected(|item| {
                            if let Settings::Standings(settings) = &mut item.settings
                                && let Some(column) = settings
                                    .session_columns_mut(session)
                                    .iter_mut()
                                    .find(|column| column.metric_id == metric)
                            {
                                set(column, key);
                            }
                        })
                    },
                    cx,
                );
            }
        })
        .detach();
        self.fields
            .push((Tab::Content, title, control.into(), true));
    }

    #[allow(clippy::too_many_arguments)] // Same durable edit path as the inspector's other numeric fields.
    fn session_format_number(
        &mut self,
        item: &Instance,
        title: &'static str,
        value: f64,
        min: f64,
        max: f64,
        set: fn(&mut vantare_ui::standings::options::ColumnSetting, f64),
        cx: &mut Context<Self>,
    ) {
        let control = cx.new(|cx| {
            NumberControl::new(
                title,
                NumberKind::Stepper,
                NumberRange {
                    value,
                    min,
                    max,
                    step: 1.0,
                },
                cx,
            )
        });
        let id = item.id.clone();
        let metric = self.session_column.clone();
        let session = self.session_tab;
        cx.subscribe(&control, move |this, _, event: &NumberChanged, cx| {
            if this.editor.selected.as_ref() == Some(&id) {
                this.edit(
                    |editor| {
                        editor.edit_selected(|item| {
                            if let Settings::Standings(settings) = &mut item.settings
                                && let Some(column) = settings
                                    .session_columns_mut(session)
                                    .iter_mut()
                                    .find(|column| column.metric_id == metric)
                            {
                                set(column, event.0);
                            }
                        })
                    },
                    cx,
                );
            }
        })
        .detach();
        self.fields
            .push((Tab::Content, title, control.into(), true));
    }
    /// Tres interruptores en Comportamiento, todos activos de serie.
    pub(super) fn push_show_in_fields(&mut self, item: &Instance, cx: &mut Context<Self>) {
        for (session, title) in [
            (Session::Practice, "Mostrar en práctica"),
            (Session::Qualifying, "Mostrar en qualy"),
            (Session::Race, "Mostrar en carrera"),
        ] {
            let control = cx.new(|cx| Checkbox::switch(title, *item.show_in.get(session), cx));
            let id = item.id.clone();
            cx.subscribe(&control, move |this, _, event: &Checked, cx| {
                if this.editor.selected.as_ref() == Some(&id) {
                    this.edit(
                        |editor| {
                            editor.edit_selected(|item| *item.show_in.get_mut(session) = event.0)
                        },
                        cx,
                    );
                }
            })
            .detach();
            self.fields
                .push((Tab::Behavior, title, control.into(), false));
        }
    }

    /// Pestañas Práctica / Qualy / Carrera y «Restablecer preset» de Standings.
    pub(super) fn session_tabs(
        item: &Instance,
        session: Session,
        cx: &mut Context<Self>,
    ) -> Option<gpui::Div> {
        if !matches!(item.settings, Settings::Standings(_)) {
            return None;
        }
        let mut tabs = div().flex().items_center().gap(px(6.0));
        for (index, tab) in Session::ALL.into_iter().enumerate() {
            let active = tab == session;
            tabs = tabs.child(
                orbit::ghost_button(("studio-session", index), tab.label(), cx)
                    .h(px(30.0))
                    .px(px(8.0))
                    .flex_none()
                    .aria_selected(active)
                    .when(active, |b| orbit::nav_active(b, cx))
                    .on_click(cx.listener(move |this, _, _, cx| {
                        this.select_session(tab, cx);
                    })),
            );
        }
        let selected = item.id.clone();
        let reset = button("studio-session-reset", "Restablecer preset", cx).on_click(cx.listener(
            move |this, _, _, cx| {
                if this.editor.selected.as_ref() != Some(&selected) {
                    return;
                }
                this.reset_fields();
                this.edit(
                    |editor| {
                        editor.edit_selected(|item| {
                            if let Settings::Standings(settings) = &mut item.settings {
                                *settings.session_columns_mut(session) =
                                    vantare_ui::standings::session_preset(session);
                            }
                        })
                    },
                    cx,
                );
            },
        ));
        Some(
            div()
                .flex()
                .flex_col()
                .gap(px(8.0))
                .child(orbit::eyebrow("Columnas por sesión", cx))
                .child(tabs)
                .child(reset),
        )
    }

    pub(super) fn select_session(&mut self, session: Session, cx: &mut Context<Self>) {
        if self.session_tab != session {
            self.cancel_drag(cx);
            self.reset_fields();
            self.session_tab = session;
            self.rebuild(cx);
        }
    }
}
