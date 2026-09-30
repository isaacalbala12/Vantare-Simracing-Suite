//! Borrador de texto y revisión explícita. Persistencia/I/O pertenece al helper.
#[path = "../launcher/input.rs"]
#[allow(clippy::duplicate_mod)] // Input privado de otro worker: misma fuente,
// sin copia ni cambios. Opus debe exportarlo y sustituir este mod por use.
mod input;
use crate::{
    orbit,
    services::{
        protocol::{
            Command,
            report_document::{Fields, Preview},
        },
        view::Remote,
    },
};
use gpui::{Context, Entity, prelude::*};

pub struct Editor {
    inputs: [Entity<input::Input>; 5],
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
            "Contexto opcional",
            "Módulo",
        ];
        let inputs = std::array::from_fn(|index| {
            cx.new(|cx| input::Input::new(values[index].clone(), labels[index], cx))
        });
        for field in &inputs {
            cx.observe(field, |this, _, cx| {
                this.editor.preview = None;
                this.editor.dirty = true;
                this.editor.revision = this.editor.revision.saturating_add(1);
                cx.notify();
            })
            .detach();
        }
        Self {
            inputs,
            preview: None,
            message: "Borrador local: revise el texto antes de enviar".into(),
            revision: 0,
            dirty: false,
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

    pub fn render(&self, cx: &mut Context<Remote>) -> gpui::Div {
        let mut body = orbit::card_body().child(orbit::callout(self.message.clone()));
        for field in &self.inputs {
            body = body.child(field.clone());
        }
        body=body.child(orbit::text("Texto únicamente. No se adjuntan logs, capturas ni diagnósticos. Módulo: hub, launcher, settings, overlay_runtime, engineer, strategy o unknown.",12.0,400,orbit::INK_3))
            .child(orbit::button("report-load","Cargar borrador").on_click(cx.listener(|this,_,_,cx|this.report_action(Command::DraftLoad,cx))))
            .child(orbit::button("report-save","Guardar borrador").on_click(cx.listener(|this,_,_,cx| { let fields=this.editor.fields(cx); this.report_action(Command::DraftSave { fields },cx); })))
            .child(orbit::button("report-discard","Descartar borrador").on_click(cx.listener(|this,_,_,cx|this.report_action(Command::DraftDiscard,cx))))
            .child(orbit::button("report-preview","Revisar envío").on_click(cx.listener(|this,_,_,cx|this.report_action(Command::ReportPrepare,cx))))
            .child(orbit::button("report-retry","Revisar intento pendiente o recibo").on_click(cx.listener(|this,_,_,cx|this.report_action(Command::ReportRetryPrepare,cx))));
        if let Some(preview) = &self.preview {
            body = body
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
                    13.5,
                    700,
                    orbit::INK,
                ))
                .child(orbit::text(
                    preview.payload.clone(),
                    12.0,
                    400,
                    orbit::INK_2,
                ))
                .child(
                    orbit::button("report-consent", "Consiento y envío este contenido").on_click(
                        cx.listener(|this, _, _, cx| {
                            if let Some(preview) = &this.editor.preview {
                                this.report_action(
                                    Command::ReportSend {
                                        preview_id: preview.id.clone(),
                                    },
                                    cx,
                                );
                            }
                        }),
                    ),
                );
        } else {
            body = body.child(orbit::text(
                format!(
                    "Vista local — acción: {} · esperado: {} · observado: {}",
                    self.inputs[0].read(cx).value,
                    self.inputs[1].read(cx).value,
                    self.inputs[2].read(cx).value
                ),
                12.0,
                400,
                orbit::INK_2,
            ));
        }
        orbit::card("Informe del Testing Center").child(body)
    }
}

pub fn empty_fields() -> Fields {
    Fields {
        module: "unknown".into(),
        ..Fields::default()
    }
}
