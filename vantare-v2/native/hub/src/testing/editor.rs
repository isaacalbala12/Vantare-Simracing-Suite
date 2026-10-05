use super::model::{Consent, MODULES, can_send, field_errors};
use crate::orbit::typography;
use crate::{
    orbit::{self, Checkbox, ChoiceState, Input, OptionItem},
    services::{
        protocol::{
            Command,
            report_document::{Fields, Preview, ScreenshotPreview},
        },
        view::Remote,
    },
};
use base64::{Engine, engine::general_purpose::STANDARD};
use gpui::{Context, Entity, div, prelude::*, px, rgb, rgba};

pub struct Editor {
    inputs: [Entity<Input>; 5],
    values: [String; 5],
    module_choice: ChoiceState,
    consent: Entity<Checkbox>,
    approved: Option<Consent>,
    show_errors: bool,
    pub preview: Option<Preview>,
    pub message: String,
    pub error: bool,
    pub revision: u64,
    pub dirty: bool,
    pub screenshots: Vec<ScreenshotPreview>,
}
impl Editor {
    fn field_label(label: &str, cx: &gpui::App) -> gpui::Div {
        Self::tracked_label(label, orbit::ink_4(cx), 0.1)
    }

    fn tracked_label(label: &str, color: u32, tracking: f32) -> gpui::Div {
        let label = label.to_uppercase();
        // La cara estática W800 ya contiene el peso; modelar conserva el kerning.
        div().h(px(16.5)).child(
            gpui::canvas(
                |_, _, _| (),
                move |bounds, (), window, cx| {
                    let ink = typography::ink(11.0, 800.0, tracking, rgb(color).into());
                    typography::draw(
                        window,
                        cx,
                        &label,
                        bounds.origin.x.into(),
                        typography::baseline(bounds.origin.y.into(), 16.5, 11.0),
                        &ink,
                    );
                },
            )
            .w_full()
            .h_full(),
        )
    }

    pub(super) fn clear_approval(&mut self) {
        self.approved = None;
    }

    pub fn new(fields: Fields, cx: &mut Context<Remote>) -> Self {
        let values = [
            fields.action_text,
            fields.expected_text,
            fields.observed_text,
            fields.context_text,
            fields.module,
        ];
        let module_choice = ChoiceState::new(
            MODULES
                .iter()
                .map(|(_, label)| OptionItem::new(*label))
                .collect(),
            MODULES
                .iter()
                .position(|(key, _)| *key == values[4].as_str()),
        );
        let labels = [
            "Qué hiciste",
            "Qué esperabas",
            "Qué ocurrió",
            "Contexto adicional · opcional",
            "Módulo",
        ];
        let inputs = std::array::from_fn(|index| {
            cx.new(|cx| {
                if index < 4 {
                    Input::multiline(values[index].clone(), labels[index], cx)
                } else {
                    Input::new(values[index].clone(), labels[index], cx)
                }
            })
        });
        let consent = cx.new(|cx| Checkbox::new("Consiento enviar este contenido", false, cx));
        cx.subscribe(&consent, |this, control, event: &orbit::Checked, cx| {
            if control.entity_id() != this.editor.consent.entity_id() {
                return;
            }
            this.editor.approved = if event.0 {
                this.editor.preview.as_ref().map(Consent::from)
            } else {
                None
            };
            cx.notify();
        })
        .detach();
        for (index, field) in inputs.iter().enumerate() {
            cx.observe(field, move |this, input, cx| {
                if input.entity_id() != this.editor.inputs[index].entity_id() {
                    return;
                }
                // Foco, cursor y selección también notifican: no son una edición.
                let value = &input.read(cx).value;
                if this.editor.values[index] == *value {
                    return;
                }
                this.editor.values[index].clone_from(value);
                this.editor.preview = None;
                this.editor.approved = None;
                this.editor.consent.update(cx, |control, cx| {
                    control.checked = false;
                    control.enabled = false;
                    cx.notify();
                });
                this.editor.dirty = true;
                this.editor.revision = this.editor.revision.saturating_add(1);
                cx.notify();
            })
            .detach();
        }
        Self {
            inputs,
            values,
            module_choice,
            consent,
            approved: None,
            show_errors: false,
            preview: None,
            message: "Borrador local: revise el texto antes de enviar".into(),
            error: false,
            revision: 0,
            dirty: false,
            screenshots: Vec::new(),
        }
    }
    fn sync_module_value(&mut self, cx: &mut Context<Remote>) {
        if let Some((key, _)) = self
            .module_choice
            .selected
            .and_then(|index| MODULES.get(index))
        {
            self.inputs[4].update(cx, |input, cx| input.set_value((*key).into(), cx));
        }
    }
    pub fn fields(&self, cx: &Context<Remote>) -> Fields {
        Fields {
            action_text: self.inputs[0].read(cx).value.clone(),
            expected_text: self.inputs[1].read(cx).value.clone(),
            observed_text: self.inputs[2].read(cx).value.clone(),
            context_text: self.inputs[3].read(cx).value.clone(),
            module: self.inputs[4].read(cx).value.clone(),
        }
    }
    fn field(&self, index: usize, label: &str, cx: &Context<Remote>) -> gpui::Div {
        div()
            .flex_1()
            .min_w_0()
            .flex()
            .flex_col()
            .gap(px(8.0))
            // La línea de 16,5 px ocupa 17 px en los campos de Wails.
            .child(Self::field_label(label, cx).h(px(17.0)))
            .child(
                div()
                    .h(px(78.0))
                    .relative()
                    .min_h(px(0.0))
                    .flex()
                    .flex_col()
                    .overflow_hidden()
                    .child(self.inputs[index].clone())
                    // El kit fija la altura del Input. El trazo conserva el detalle
                    // visual de Wails; redimensionar requiere soporte del kit común.
                    .child(
                        div()
                            .absolute()
                            .bottom_0()
                            .right_0()
                            .size(px(13.0))
                            .children((0_u8..3).flat_map(|line| {
                                (0..=line).map(move |offset| {
                                    div()
                                        .absolute()
                                        .right(px(2.0 + f32::from(offset) * 3.0))
                                        .bottom(px(2.0 + f32::from(line - offset) * 3.0))
                                        .size(px(1.0))
                                        .bg(rgb(orbit::ink_3(cx)))
                                })
                            })),
                    ),
            )
            .when(self.show_errors, |view| {
                view.when_some(field_errors(&self.fields(cx))[index], |view, error| {
                    view.child(orbit::text(
                        error,
                        orbit::SECONDARY,
                        400,
                        orbit::red(cx),
                        cx,
                    ))
                })
            })
    }
    fn module_control(&self, cx: &mut Context<Remote>) -> gpui::Div {
        let selected = self
            .module_choice
            .selected
            .and_then(|index| MODULES.get(index))
            .map_or("Sin determinar", |(_, label)| *label);
        let mut control = div()
            .w_full()
            .flex()
            .flex_col()
            .gap(px(2.0))
            .child(self.module_trigger(selected, cx));
        if self.module_choice.open {
            control = control.child(self.module_options(cx));
        }
        control
    }

    fn module_trigger(
        &self,
        selected: &str,
        cx: &mut Context<Remote>,
    ) -> gpui::Stateful<gpui::Div> {
        div()
            .id("testing-module-select")
            .role(gpui::Role::ComboBox)
            .w_full()
            .aria_label("Módulo")
            .aria_expanded(self.module_choice.open)
            .tab_stop(true)
            .h(px(orbit::CONTROL_H))
            .px(px(orbit::FIELD_PAD))
            .flex()
            .items_center()
            .justify_between()
            .rounded(px(orbit::RADIUS_CONTROL))
            .border_1()
            .border_color(rgba(crate::orbit::legacy_rgba(0xffff_ff12, cx)))
            .bg(rgba(crate::orbit::legacy_rgba(0xffff_ff07, cx)))
            .cursor_pointer()
            .hover(|style| style.border_color(rgba(orbit::line_strong(cx))))
            .focus_visible(|style| style.border_2().border_color(rgb(orbit::coral(cx))))
            .child(orbit::text(selected, 14.0, 500, orbit::ink_2(cx), cx).line_height(px(14.0)))
            .child(
                orbit::icon("i-chevron", 16.0, orbit::ink_3(cx))
                    .with_transformation(gpui::Transformation::rotate(gpui::radians(
                        std::f32::consts::FRAC_PI_2,
                    )))
                    .relative()
                    .right(px(-5.0))
                    .flex_none(),
            )
            .on_key_down(cx.listener(|this, event: &gpui::KeyDownEvent, _, cx| {
                let key = event.keystroke.key.as_str();
                if !matches!(
                    key,
                    "enter"
                        | "space"
                        | "escape"
                        | "up"
                        | "left"
                        | "down"
                        | "right"
                        | "home"
                        | "end"
                ) {
                    return;
                }
                if this.editor.module_choice.key(key, false) {
                    this.editor.sync_module_value(cx);
                }
                cx.stop_propagation();
                cx.notify();
            }))
            .on_click(cx.listener(|this, _, _, cx| {
                this.editor.module_choice.toggle();
                cx.notify();
            }))
    }

    fn module_options(&self, cx: &mut Context<Remote>) -> gpui::Stateful<gpui::Div> {
        let mut options = div()
            .id("testing-module-options")
            .flex()
            .flex_col()
            .gap(px(2.0))
            .p(px(4.0))
            .max_h(px(240.0))
            .overflow_y_scroll()
            .rounded(px(orbit::RADIUS_CONTROL))
            .border_1()
            .border_color(rgba(orbit::line(cx)))
            .bg(rgba(orbit::surface_2(cx)));
        for (index, (_, label)) in MODULES.iter().enumerate() {
            let selected = self.module_choice.selected == Some(index);
            let active = self.module_choice.active == Some(index);
            options = options.child(
                div()
                    .id(("testing-module-option", index))
                    .role(gpui::Role::ListBoxOption)
                    .aria_label(*label)
                    .aria_selected(selected)
                    .tab_stop(false)
                    .h(px(orbit::OPTION_H))
                    .px(px(orbit::FIELD_PAD))
                    .flex()
                    .items_center()
                    .rounded(px(orbit::RADIUS_CHIP))
                    .when(active, |style| style.bg(rgba(orbit::line_row(cx))))
                    .child(orbit::text(
                        *label,
                        orbit::BODY,
                        if selected { 650 } else { 500 },
                        orbit::ink_2(cx),
                        cx,
                    ))
                    .on_mouse_move(cx.listener(move |this, _, _, cx| {
                        this.editor.module_choice.active = Some(index);
                        cx.notify();
                    }))
                    .on_click(cx.listener(move |this, _, _, cx| {
                        this.editor.module_choice.choose(index);
                        this.editor.sync_module_value(cx);
                        cx.notify();
                    })),
            );
        }
        options
    }
    fn form(&self, cx: &mut Context<Remote>) -> gpui::Div {
        let controls = self.module_control(cx);
        let fields = self.fields(cx);
        let valid = field_errors(&fields).iter().all(Option::is_none);
        let has_text = !fields.action_text.is_empty()
            || !fields.expected_text.is_empty()
            || !fields.observed_text.is_empty();
        let module = div()
            .flex()
            .flex_col()
            .gap(px(8.0))
            .child(Self::field_label("Módulo", cx))
            .child(controls);
        let mut body = orbit::card_body()
            .px(px(21.0))
            .py(px(21.0))
            .gap(px(orbit::GUTTER / 2.0))
            .child(module)
            .child(
                div()
                    .flex()
                    .gap(px(orbit::GUTTER / 2.0))
                    .child(self.field(0, "Qué hiciste", cx))
                    .child(self.field(1, "Qué esperabas", cx)),
            )
            .child(self.field(2, "Qué ocurrió", cx))
            .child(self.field(3, "Contexto adicional · opcional", cx));
        if self.dirty {
            body = body.child(div().flex().justify_end().child(
                orbit::button("report-save", "Guardar borrador", cx).on_click(cx.listener(
                    |this, _, _, cx| {
                        let fields = this.editor.fields(cx);
                        this.report_action(Command::DraftSave { fields }, cx);
                    },
                )),
            ));
        } else if valid && has_text && self.preview.is_none() {
            body = body.child(div().flex().justify_end().child(
                orbit::button("report-preview", "Previsualizar envío", cx).on_click(cx.listener(
                    |this, _, _, cx| {
                        this.editor.show_errors = true;
                        this.editor.approved = None;
                        this.report_action(Command::ReportPrepare, cx);
                    },
                )),
            ));
        }
        body
    }

    fn consent_card(&self, cx: &mut Context<Remote>) -> gpui::Div {
        let ready = can_send(self.preview.as_ref(), self.approved.as_ref(), self.dirty);
        let mut consent = orbit::card_body()
            .px(px(21.0))
            .py(px(21.0))
            .pb(px(22.0))
            .child(Self::tracked_label("Consentimiento", orbit::ink_3(cx), 0.09).mt(px(6.0)))
            .child(
                orbit::text("Datos adjuntos", 15.0, 650, orbit::ink(cx), cx)
                    .font_weight(gpui::FontWeight::NORMAL)
                    .mt(px(7.0))
                    .line_height(px(22.5)),
            )
            .child(
                orbit::text(
                    "Nada se adjunta sin selección explícita y vista previa.",
                    orbit::SECONDARY,
                    400,
                    orbit::ink_3(cx),
                    cx,
                )
                .mt(px(8.0))
                .line_height(px(18.0)),
            );
        consent = consent.child(self.screenshot_card(cx)).child(
            orbit::text(
                "Logs y replay: no disponibles.",
                11.0,
                400,
                orbit::ink_3(cx),
                cx,
            )
            .mt(px(8.0)),
        );
        // El primario solo se atenúa: nunca destaca más deshabilitado que activo.
        let send = orbit::primary_button("report-send", "Enviar reporte", cx).w_full();
        let send = if ready {
            send.on_click(cx.listener(|this, _, _, cx| {
                if can_send(
                    this.editor.preview.as_ref(),
                    this.editor.approved.as_ref(),
                    this.editor.dirty,
                ) && let Some(preview) = &this.editor.preview
                {
                    let preview_id = preview.id.clone();
                    // El consentimiento se consume inmediatamente para evitar reusar el clic.
                    this.editor.approved = None;
                    this.report_action(Command::ReportSend { preview_id }, cx);
                    cx.notify();
                }
            }))
        } else {
            orbit::disabled(
                send,
                "Deshabilitado: requiere una vista previa y consentimiento vigentes.",
            )
        };
        let discard = orbit::button("report-discard", "Descartar borrador", cx).w_full();
        let discard = if self.dirty {
            discard.on_click(
                cx.listener(|this, _, _, cx| this.report_action(Command::DraftDiscard, cx)),
            )
        } else {
            orbit::disabled(discard, "Deshabilitado: no hay un borrador que descartar.")
        };
        consent = consent.child(
            div()
                .flex()
                .flex_col()
                .gap(px(10.0))
                .mt(px(17.0))
                .child(send)
                .child(discard),
        );
        consent
    }

    fn screenshot_card(&self, cx: &mut Context<Remote>) -> gpui::Div {
        let mut block = div()
            .flex()
            .flex_col()
            .gap(px(6.0))
            .mt(px(12.0))
            .child(orbit::text(
                format!("Capturas · {}/3", self.screenshots.len()),
                14.0,
                650,
                orbit::ink(cx),
                cx,
            ));
        for (index, preview) in self.screenshots.iter().enumerate() {
            if let Ok(bytes) = STANDARD.decode(&preview.jpeg) {
                let image = gpui::Image::from_bytes(gpui::ImageFormat::Jpeg, bytes);
                block = block.child(
                    gpui::img(std::sync::Arc::new(image))
                        .w_full()
                        .h(px(130.0))
                        .object_fit(gpui::ObjectFit::Contain),
                );
            }
            let id = preview.id.clone();
            block = block
                .child(orbit::text(
                    format!(
                        "{} × {} · {} KiB",
                        preview.width,
                        preview.height,
                        preview.byte_size.div_ceil(1024)
                    ),
                    11.0,
                    400,
                    orbit::ink_3(cx),
                    cx,
                ))
                .child(
                    orbit::button(
                        match index {
                            0 => "report-remove-image-1",
                            1 => "report-remove-image-2",
                            _ => "report-remove-image-3",
                        },
                        "Quitar captura",
                        cx,
                    )
                    .on_click(cx.listener(move |this, _, _, cx| {
                        this.editor.clear_approval();
                        let fields = this.editor.fields(cx);
                        this.report_action(
                            Command::ReportRemoveScreenshot {
                                id: id.clone(),
                                fields,
                            },
                            cx,
                        );
                    })),
                );
        }
        if self.screenshots.len() < 3 {
            block = block.child(
                orbit::button("report-capture", "Capturar pantalla", cx).on_click(cx.listener(
                    |this, _, _, cx| {
                        this.editor.clear_approval();
                        let fields = this.editor.fields(cx);
                        this.report_action(Command::ReportCapture { fields }, cx);
                    },
                )),
            );
        }
        block.child(orbit::text(
            "Monitor principal. Revisa la captura y quítala si contiene datos personales.",
            11.0,
            400,
            orbit::ink_3(cx),
            cx,
        ))
    }
    pub fn render(&self, compact: bool, cx: &mut Context<Remote>) -> gpui::Div {
        let form = self.form(cx);
        let consent = self.consent_card(cx);
        let mut page = div()
            .w_full()
            .flex()
            .flex_col()
            .gap(px(orbit::GUTTER / 2.0))
            .when(self.error, |page| {
                page.child(orbit::callout(self.message.clone(), cx))
            })
            .child(
                div()
                    .flex()
                    .items_start()
                    .gap(px(21.0))
                    .when(compact, |element| element.flex_col().items_stretch())
                    .child(
                        orbit::card("", cx)
                            .bg(orbit::tint(0x0010_1114, 0.79))
                            .flex_1()
                            .when(compact, gpui::Styled::flex_none)
                            .min_w_0()
                            .child(form),
                    )
                    .child(
                        orbit::card("", cx)
                            .bg(orbit::tint(0x0010_1114, 0.79))
                            .w(px(280.0))
                            .when(compact, gpui::Styled::w_full)
                            .flex_none()
                            .child(consent),
                    ),
            );
        if let Some(preview) = &self.preview {
            page = page.child(
                orbit::card("Vista previa del envío", cx).child(
                    orbit::card_body()
                        .gap(px(orbit::RADIUS_CONTROL))
                        .child(orbit::text(
                            format!(
                                "Cuenta {} · canal {}{}",
                                preview.account_id,
                                preview.channel,
                                if preview.retry {
                                    " · reintento con contenido original"
                                } else {
                                    ""
                                }
                            ),
                            orbit::BODY,
                            700,
                            orbit::ink(cx),
                            cx,
                        ))
                        .child(orbit::text(
                            preview.payload.clone(),
                            orbit::SECONDARY,
                            400,
                            orbit::ink_2(cx),
                            cx,
                        ))
                        .child(self.consent.clone()),
                ),
            );
        }
        if !self.error && self.message != "Borrador local: revise el texto antes de enviar" {
            page = page.child(orbit::callout(self.message.clone(), cx));
        }
        page
    }
}
pub fn empty_fields() -> Fields {
    Fields {
        module: "unknown".into(),
        ..Fields::default()
    }
}
