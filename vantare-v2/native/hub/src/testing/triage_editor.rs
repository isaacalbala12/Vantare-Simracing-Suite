//! Consent is tied to an immutable preparation; edits invalidate the preview.
use crate::{
    orbit::{self, Checkbox, Input},
    services::{
        protocol::{
            Command,
            triage_document::{Item, Preview, Selection},
        },
        view::Remote,
    },
};
use gpui::{Context, Div, Entity, div, prelude::*, px};

pub struct Editor {
    inputs: [Entity<Input>; 2],
    values: [String; 2],
    choices: [Entity<Checkbox>; 5],
    consent: Entity<Checkbox>,
    pub(crate) preview: Option<Preview>,
    revision: u64,
    preparing: Option<u64>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::protocol::triage_document::Packet;
    #[test]
    fn editing_private_report_revokes_preview_and_consent_before_send() {
        use std::sync::{
            Arc,
            atomic::{AtomicU8, Ordering},
        };
        let observed = Arc::new(AtomicU8::new(0));
        let result = Arc::clone(&observed);
        gpui_platform::headless().run(move |cx| {
            let file = crate::document::tests::File::new();
            let (send, _requests) = std::sync::mpsc::sync_channel(8);
            let remote = cx.new(|cx| {
                crate::services::view::purchase_tests::fixture(
                    cx,
                    send,
                    file.path.parent().expect("root"),
                )
            });
            remote.update(cx, |r, cx| {
                r.triage.preparing = Some(r.triage.revision);
                r.triage.receive(Preview {
                    id: "a".repeat(64),
                    channel: "testers".into(),
                    packet: Packet {
                        id: "15940000-0000-0000-0000-000000000001".into(),
                        title: "QA".into(),
                        body: "Private fixture".into(),
                        context: serde_json::json!({}),
                        attachments: vec![],
                    },
                });
                r.triage.consent.update(cx, |c, cx| {
                    c.checked = true;
                    cx.notify();
                });
                assert!(r.triage.preview.is_some());
                r.triage.inputs[0]
                    .update(cx, |input, cx| input.set_value("Changed report".into(), cx));
            });
            // Foreground task runs after queued notifications. Always quit;
            // assert outside the UI loop so an assertion cannot strand it.
            cx.spawn(async move |cx| {
                cx.update(|cx| {
                    let flags = remote.update(cx, |r, cx| {
                        u8::from(r.triage.preview.is_none())
                            | (u8::from(!r.triage.consent.read(cx).checked) << 1)
                            | (u8::from(r.triage.values[0] == "Changed report") << 2)
                    });
                    result.store(flags, Ordering::Release);
                    cx.quit();
                });
            })
            .detach();
        });
        assert_eq!(
            observed.load(Ordering::Acquire),
            7,
            "edit must revoke preview/consent and update the text"
        );
    }
}
impl Editor {
    pub(crate) fn new(cx: &mut Context<Remote>) -> Self {
        let inputs = [
            cx.new(|cx| Input::new(String::new(), "Título del informe", cx)),
            cx.new(|cx| {
                Input::multiline(
                    String::new(),
                    "Pasos, resultado esperado y lo que ocurrió (hasta 1.000 caracteres)",
                    cx,
                )
                .with_height(px(96.0))
            }),
        ];
        let labels = [
            "Info del PC",
            "Errores y rendimiento de esta sesión",
            "Log de la app",
            "Fragmento de telemetría",
            "Enlazar sesión de analítica",
        ];
        let choices = std::array::from_fn(|i| cx.new(|cx| Checkbox::new(labels[i], true, cx)));
        let consent=cx.new(|cx|Checkbox::new("Un asistente de IA externo (DeepSeek vía OpenCode) preclasifica el informe con estos datos; la decisión la toma una persona. Se borran a los 90 días.",false,cx));
        for (i, input) in inputs.iter().enumerate() {
            cx.observe(input, move |this, entity, cx| {
                if entity.entity_id() != this.triage.inputs[i].entity_id()
                    || entity.read(cx).value == this.triage.values[i]
                {
                    return;
                }
                this.triage.values[i].clone_from(&entity.read(cx).value);
                this.triage.invalidate(cx);
                cx.notify();
            })
            .detach();
        }
        for choice in &choices {
            cx.subscribe(choice, |this, entity, _: &orbit::Checked, cx| {
                if this
                    .triage
                    .choices
                    .iter()
                    .any(|c| c.entity_id() == entity.entity_id())
                {
                    this.triage.invalidate(cx);
                    cx.notify();
                }
            })
            .detach();
        }
        cx.subscribe(&consent, |this, entity, event: &orbit::Checked, cx| {
            if entity.entity_id() == this.triage.consent.entity_id() {
                if !event.0 {
                    this.triage.invalidate(cx);
                }
                cx.notify();
            }
        })
        .detach();
        Self {
            inputs,
            values: [String::new(), String::new()],
            choices,
            consent,
            preview: None,
            revision: 0,
            preparing: None,
        }
    }
    fn invalidate(&mut self, cx: &mut Context<Remote>) {
        self.preview = None;
        self.revision = self.revision.wrapping_add(1);
        self.preparing = None;
        self.consent.update(cx, |control, cx| {
            control.checked = false;
            cx.notify();
        });
    }
    pub(crate) fn clear(&mut self, cx: &mut Context<Remote>) {
        self.invalidate(cx);
        self.values = [String::new(), String::new()];
        for input in &self.inputs {
            input.update(cx, |input, cx| {
                input.set_value(String::new(), cx);
            });
        }
        self.consent.update(cx, |control, cx| {
            control.checked = false;
            cx.notify();
        });
    }
    pub(crate) fn receive(&mut self, preview: Preview) {
        if self.preparing == Some(self.revision) {
            self.preview = Some(preview);
        }
        self.preparing = None;
    }
    fn selection(&self, cx: &gpui::App) -> Selection {
        let v = self.choices.each_ref().map(|c| c.read(cx).checked);
        Selection {
            items: Item::ALL
                .into_iter()
                .zip(v)
                .filter_map(|(item, checked)| checked.then_some(item))
                .collect(),
        }
    }
    pub(crate) fn render(&self, ready: bool, cx: &mut Context<Remote>) -> Div {
        let consent = self.consent.read(cx).checked;
        let valid = ready
            && consent
            && !self.values[0].trim().is_empty()
            && !self.values[1].trim().is_empty()
            && self.values[0].chars().count() <= 120
            && self.values[1].chars().count() <= 1000;
        let mut form = orbit::neo_card(cx)
            .gap(px(10.0))
            .flex_none()
            .child(orbit::neo_header("Informe para revisión", "v-testing", cx))
            .child(self.inputs[0].clone())
            .child(self.inputs[1].clone());
        for checkbox in &self.choices {
            form = form.child(checkbox.clone());
        }
        form=form.child(orbit::text("Analítica y fragmento quedan vacíos si no hay datos disponibles. El log incluye solo actividad real reciente de servicios; las capturas se envían desde Informe con capturas.",12.0,400,orbit::ink_3(cx),cx))
            .child(self.consent.clone())
            .child(orbit::small_button("triage-preview","Ver lo que se envía",cx).tab_stop(valid)
                .when(!valid,|b|orbit::disabled(b,"Revisa el texto, acepta el consentimiento e inicia sesión"))
                .on_click(cx.listener(|this,_,_,cx|{
                    if !this.triage.consent.read(cx).checked || !this.participation_ready() {return;}
                    let command=Command::TriagePrepare {title:this.triage.values[0].clone(),body:this.triage.values[1].clone(),selection:this.triage.selection(cx),consent:true};
                    this.triage.preparing=Some(this.triage.revision);
                    this.participation_request(command,cx);
                })));
        if let Some(preview) = &self.preview {
            let payload =
                serde_json::to_string_pretty(&preview.packet.rpc_payload(&preview.channel))
                    .unwrap_or_default();
            let id = preview.id.clone();
            form = form
                .child(
                    div()
                        .id("triage-exact-preview")
                        .max_h(px(240.0))
                        .overflow_y_scroll()
                        .child(orbit::text(payload, 12.0, 400, orbit::ink_2(cx), cx)),
                )
                .child(
                    orbit::primary_button("triage-send", "Enviar este informe", cx)
                        .tab_stop(valid)
                        .when(!valid, |b| {
                            orbit::disabled(b, "Servicio ocupado o consentimiento pendiente")
                        })
                        .on_click(cx.listener(move |this, _, _, cx| {
                            if this.triage.consent.read(cx).checked
                                && this.triage.preview.as_ref().is_some_and(|p| p.id == id)
                            {
                                this.participation_request(
                                    Command::TriageSend {
                                        preview_id: id.clone(),
                                    },
                                    cx,
                                );
                            }
                        })),
                );
        }
        form
    }
}
