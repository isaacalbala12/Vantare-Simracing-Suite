use super::model::{Consent, MODULES, can_send, field_errors};
use crate::{
    orbit::{self, Checkbox, Choice, ChoiceChanged, ChoiceKind, Input, OptionItem},
    services::{
        protocol::{
            Command,
            report_document::{Fields, Preview},
        },
        view::Remote,
    },
};
use gpui::{Context, Entity, Window, div, prelude::*, px};

pub struct Editor {
    inputs: [Entity<Input>; 5],
    values: [String; 5],
    module: Option<Entity<Choice>>,
    consent: Entity<Checkbox>,
    attachments: [Entity<Checkbox>; 3],
    approved: Option<Consent>,
    show_errors: bool,
    pub preview: Option<Preview>,
    pub message: String,
    pub revision: u64,
    pub dirty: bool,
}
impl Editor {
    pub fn new(fields: Fields, cx: &mut Context<Remote>) -> Self {
        let values = [
            fields.action_text,
            fields.expected_text,
            fields.observed_text,
            fields.context_text,
            fields.module,
        ];
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
        let attachments = [
            "Diagnóstico preparado",
            "Replay de telemetría",
            "Logs de producto",
        ]
        .map(|label| {
            cx.new(|cx| {
                let mut checkbox = Checkbox::new(label, false, cx);
                checkbox.enabled = false;
                checkbox
            })
        });
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
            module: None,
            consent,
            attachments,
            approved: None,
            show_errors: false,
            preview: None,
            message: "Borrador local: revise el texto antes de enviar".into(),
            revision: 0,
            dirty: false,
        }
    }
    pub(super) fn controls(&mut self, window: &mut Window, cx: &mut Context<Remote>) {
        if self.module.is_none() {
            let value = &self.inputs[4].read(cx).value;
            let selected = MODULES.iter().position(|(key, _)| key == value);
            let module = cx.new(|cx| {
                Choice::new(
                    "Módulo",
                    ChoiceKind::Dropdown,
                    MODULES
                        .iter()
                        .map(|(_, label)| OptionItem::new(*label))
                        .collect(),
                    selected,
                    window,
                    cx,
                )
            });
            cx.subscribe(&module, |this, control, event: &ChoiceChanged, cx| {
                if this
                    .editor
                    .module
                    .as_ref()
                    .is_none_or(|module| module.entity_id() != control.entity_id())
                {
                    return;
                }
                if let Some((key, _)) = MODULES.get(event.0) {
                    this.editor.inputs[4]
                        .update(cx, |input, cx| input.set_value((*key).into(), cx));
                }
            })
            .detach();
            self.module = Some(module);
        }
        let enabled = self.preview.is_some();
        let checked = can_send(self.preview.as_ref(), self.approved.as_ref(), self.dirty);
        self.consent.update(cx, |control, cx| {
            if control.enabled != enabled || control.checked != checked {
                control.enabled = enabled;
                control.checked = checked;
                cx.notify();
            }
        });
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
            .gap(px(orbit::RADIUS_CHIP))
            .child(orbit::eyebrow(label.to_owned()))
            .child(self.inputs[index].clone())
            .when(self.show_errors, |view| {
                view.when_some(field_errors(&self.fields(cx))[index], |view, error| {
                    view.child(orbit::text(error, orbit::SECONDARY, 400, orbit::RED))
                })
            })
    }
    fn form(&self, cx: &mut Context<Remote>) -> gpui::Div {
        let mut controls = div()
            .flex()
            .items_center()
            .justify_between()
            .gap(px(orbit::RADIUS_CHIP));
        if let Some(module) = &self.module {
            controls = controls.child(module.clone());
        }
        controls = controls.child(
            div()
                .flex()
                .gap(px(orbit::RADIUS_CHIP))
                .child(
                    orbit::button("report-save", "Guardar borrador").on_click(cx.listener(
                        |this, _, _, cx| {
                            let fields = this.editor.fields(cx);
                            this.report_action(Command::DraftSave { fields }, cx);
                        },
                    )),
                )
                .child(
                    orbit::button("report-preview", "Previsualizar envío").on_click(cx.listener(
                        |this, _, _, cx| {
                            this.editor.show_errors = true;
                            this.editor.approved = None;
                            if field_errors(&this.editor.fields(cx))
                                .iter()
                                .all(Option::is_none)
                            {
                                this.report_action(Command::ReportPrepare, cx);
                            } else {
                                cx.notify();
                            }
                        },
                    )),
                ),
        );
        orbit::card_body()
            .gap(px(orbit::GUTTER / 2.0))
            .child(orbit::eyebrow("Módulo"))
            .child(controls)
            .child(
                div()
                    .flex()
                    .gap(px(orbit::GUTTER / 2.0))
                    .child(self.field(0, "Qué hiciste", cx))
                    .child(self.field(1, "Qué esperabas", cx)),
            )
            .child(self.field(2, "Qué ocurrió", cx))
            .child(self.field(3, "Contexto adicional · opcional", cx))
    }
    fn consent_card(&self, cx: &mut Context<Remote>) -> gpui::Div {
        let ready = can_send(self.preview.as_ref(), self.approved.as_ref(), self.dirty);
        let mut consent = orbit::card_body()
            .gap(px(orbit::RADIUS_CONTROL))
            .child(orbit::eyebrow("Consentimiento"))
            .child(orbit::text("Datos adjuntos", 15.0, 700, orbit::INK))
            .child(orbit::text(
                "Nada se adjunta sin selección explícita y vista previa.",
                orbit::SECONDARY,
                400,
                orbit::INK_3,
            ));
        for (index, help) in [
            "Pendiente: el envío nativo solo admite texto. Diagnóstico disponible como JSON local.",
            "No disponible en este flujo · pendiente.",
            "No hay búfer de logs disponible · pendiente.",
        ]
        .into_iter()
        .enumerate()
        {
            consent = consent
                .child(self.attachments[index].clone())
                .child(orbit::text(help, orbit::SECONDARY, 400, orbit::INK_3));
        }
        consent = consent
            .child(
                // El primario del kit duplica hover y provoca panic al renderizar.
                // Componer el botón existente hasta que el propietario de Orbit lo corrija.
                orbit::button("report-send", "Enviar reporte")
                    .tab_stop(ready)
                    .when(!ready, |s| s.opacity(orbit::DISABLED))
                    .on_click(cx.listener(|this, _, _, cx| {
                        if can_send(
                            this.editor.preview.as_ref(),
                            this.editor.approved.as_ref(),
                            this.editor.dirty,
                        ) && let Some(preview) = &this.editor.preview
                        {
                            let preview_id = preview.id.clone();
                            // Consumo inmediato: doble click no reutiliza consentimiento.
                            this.editor.approved = None;
                            this.report_action(Command::ReportSend { preview_id }, cx);
                            cx.notify();
                        }
                    })),
            )
            .child(
                orbit::button("report-discard", "Descartar borrador").on_click(
                    cx.listener(|this, _, _, cx| this.report_action(Command::DraftDiscard, cx)),
                ),
            );
        consent
    }
    pub fn render(&self, cx: &mut Context<Remote>) -> gpui::Div {
        let form = self.form(cx);
        let consent = self.consent_card(cx);
        let mut page = div().flex().flex_col().gap(px(orbit::GUTTER / 2.0)).child(
            div()
                .flex()
                .items_start()
                .gap(px(orbit::GUTTER / 2.0))
                .child(orbit::card("").flex_1().min_w_0().child(form))
                .child(
                    orbit::card("")
                        .w(px(orbit::COLUMN_W))
                        .flex_none()
                        .child(consent),
                ),
        );
        if let Some(preview) = &self.preview {
            page = page.child(
                orbit::card("Vista previa del envío").child(
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
                            orbit::INK,
                        ))
                        .child(orbit::text(
                            preview.payload.clone(),
                            orbit::SECONDARY,
                            400,
                            orbit::INK_2,
                        ))
                        .child(self.consent.clone()),
                ),
            );
        }
        page.child(orbit::text(
            self.message.clone(),
            orbit::SECONDARY,
            400,
            orbit::INK_2,
        ))
        .child(
            div()
                .flex()
                .gap(px(orbit::RADIUS_CHIP))
                .child(orbit::button("report-load", "Cargar borrador").on_click(
                    cx.listener(|this, _, _, cx| this.report_action(Command::DraftLoad, cx)),
                ))
                .child(
                    orbit::button("report-retry", "Revisar intento pendiente o recibo").on_click(
                        cx.listener(|this, _, _, cx| {
                            this.editor.approved = None;
                            this.report_action(Command::ReportRetryPrepare, cx);
                        }),
                    ),
                ),
        )
    }
}
pub fn empty_fields() -> Fields {
    Fields {
        module: "unknown".into(),
        ..Fields::default()
    }
}
