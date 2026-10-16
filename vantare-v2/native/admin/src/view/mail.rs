use super::*;
use crate::mail::{Campaign, Content, Copy, GROUPS, LOCALES, TEMPLATES};
#[derive(Clone, Copy)]
pub(super) enum MailEvent {
    Select(usize),
    Locale(usize),
    Template(usize),
    Group(usize),
    Save,
    Draft,
    Back,
}
pub(super) struct MailEditor {
    pub(super) name: Entity<Input>,
    subject: Entity<Input>,
    body: Entity<Input>,
    brief: Entity<Input>,
    content: Content,
    locale: usize,
    template: usize,
    group: usize,
    subscriptions: Vec<gpui::Subscription>,
}
impl MailEditor {
    pub(super) fn new(cx: &mut Context<Admin>) -> Self {
        Self {
            name: cx.new(|cx| Input::new(String::new(), "Nombre de la campaña", cx)),
            subject: cx.new(|cx| Input::new(String::new(), "Asunto", cx)),
            body: cx.new(|cx| {
                Input::multiline(String::new(), "Texto del correo", cx).with_height(px(210.))
            }),
            brief: cx.new(|cx| {
                Input::multiline(
                    String::new(),
                    "Qué quieres contar · sin datos personales",
                    cx,
                )
                .with_height(px(90.))
            }),
            content: Content::default(),
            locale: 0,
            template: 0,
            group: 0,
            subscriptions: vec![],
        }
    }
    pub(super) fn watch(&mut self, cx: &mut Context<Admin>) {
        for input in [&self.name, &self.subject, &self.body, &self.brief] {
            self.subscriptions
                .push(cx.observe(input, |_, _, cx| cx.notify()));
        }
    }
    fn stash(&mut self, cx: &Context<Admin>) {
        self.content.insert(
            LOCALES[self.locale].into(),
            Copy {
                subject: self.subject.read(cx).value.clone(),
                body: self.body.read(cx).value.clone(),
            },
        );
    }
    fn show_copy(&self, cx: &mut Context<Admin>) {
        let c = self
            .content
            .get(LOCALES[self.locale])
            .cloned()
            .unwrap_or_default();
        self.subject.update(cx, |i, cx| i.set_value(c.subject, cx));
        self.body.update(cx, |i, cx| i.set_value(c.body, cx));
    }
    fn content(&self, cx: &Context<Admin>) -> Content {
        let mut c = self.content.clone();
        c.insert(
            LOCALES[self.locale].into(),
            Copy {
                subject: self.subject.read(cx).value.clone(),
                body: self.body.read(cx).value.clone(),
            },
        );
        c
    }
    fn dirty(&self, c: &Campaign, cx: &Context<Admin>) -> bool {
        self.name.read(cx).value != c.name
            || TEMPLATES[self.template].0 != c.template
            || GROUPS[self.group].0 != c.target_group
            || self.content(cx) != c.content
    }
}
impl Admin {
    pub(super) fn mail_loaded(&mut self, action: &Action, cx: &mut Context<Self>) {
        if matches!(action, Action::MailDraft { .. }) {
            if let Some(content) = self.state.mail.generated.take() {
                self.mail_editor.content = content;
                self.mail_editor.show_copy(cx);
                self.state.message =
                    "Borrador de IA · revisa los cuatro idiomas y guarda antes de enviar".into();
            }
        } else if matches!(
            action,
            Action::MailGet { .. }
                | Action::MailNew
                | Action::MailSave { .. }
                | Action::MailApprove { .. }
                | Action::MailSendBatch { .. }
        ) && let Some(c) = &self.state.mail.campaign
        {
            self.mail_editor.content = c.content.clone();
            self.mail_editor.template = TEMPLATES
                .iter()
                .position(|(k, _)| *k == c.template)
                .unwrap_or_default();
            self.mail_editor.group = GROUPS
                .iter()
                .position(|(k, _)| *k == c.target_group)
                .unwrap_or_default();
            self.mail_editor
                .name
                .update(cx, |i, cx| i.set_value(c.name.clone(), cx));
            self.mail_editor.show_copy(cx);
            let editable = c.state == "draft";
            for input in [
                &self.mail_editor.name,
                &self.mail_editor.subject,
                &self.mail_editor.body,
                &self.mail_editor.brief,
            ] {
                input.update(cx, |i, cx| i.set_enabled(editable, cx));
            }
        }
    }
    pub(super) fn mail_event(&mut self, event: MailEvent, cx: &mut Context<Self>) {
        match event {
            MailEvent::Back => {
                self.state.mail.campaign = None;
                if !self.state.demo {
                    self.load(cx);
                }
            }
            MailEvent::Select(index) => {
                if let Some(c) = self.state.mail.campaigns.get(index).cloned() {
                    let action = Action::MailGet {
                        campaign_id: c.id.clone(),
                    };
                    if self.state.demo {
                        self.state.mail.campaign = Some(c);
                        self.mail_loaded(&action, cx);
                    } else {
                        self.send(Command::Call(action));
                    }
                }
            }
            MailEvent::Locale(i) => {
                self.mail_editor.stash(cx);
                self.mail_editor.locale = i;
                self.mail_editor.show_copy(cx);
            }
            MailEvent::Template(i) => {
                if self
                    .state
                    .mail
                    .campaign
                    .as_ref()
                    .is_some_and(|c| c.state == "draft")
                {
                    self.mail_editor.template = i;
                    self.mail_editor.content = crate::mail::template_content(i);
                    self.mail_editor.show_copy(cx);
                }
            }
            MailEvent::Group(i) => {
                if self
                    .state
                    .mail
                    .campaign
                    .as_ref()
                    .is_some_and(|c| c.state == "draft")
                {
                    self.mail_editor.group = i;
                }
            }
            MailEvent::Save | MailEvent::Draft => {
                if let Some(c) = &self.state.mail.campaign {
                    let action = if matches!(event, MailEvent::Save) {
                        Action::MailSave {
                            campaign_id: c.id.clone(),
                            revision: c.revision,
                            name: self.mail_editor.name.read(cx).value.clone(),
                            template: TEMPLATES[self.mail_editor.template].0.into(),
                            target_group: GROUPS[self.mail_editor.group].0.into(),
                            content: self.mail_editor.content(cx),
                        }
                    } else {
                        Action::MailDraft {
                            campaign_id: c.id.clone(),
                            revision: c.revision,
                            brief: self.mail_editor.brief.read(cx).value.clone(),
                            template: TEMPLATES[self.mail_editor.template].0.into(),
                        }
                    };
                    if let Err(e) = self.state.propose(action) {
                        self.state.failed(e);
                    }
                }
            }
        }
    }
    pub(super) fn mail_input_access(&self, cx: &mut Context<Self>) {
        let editable = self.state.signed_in
            && !self.state.busy
            && self.state.confirmation.is_none()
            && self
                .state
                .mail
                .campaign
                .as_ref()
                .is_some_and(|c| c.state == "draft");
        for input in [
            &self.mail_editor.name,
            &self.mail_editor.subject,
            &self.mail_editor.body,
            &self.mail_editor.brief,
        ] {
            input.update(cx, |input, cx| input.set_enabled(editable, cx));
        }
    }
    pub(super) fn mail_ready(&self, cx: &Context<Self>) -> bool {
        self.state.mail.campaign.as_ref().is_some_and(|c| {
            c.state == "draft"
                && !self.mail_editor.dirty(c, cx)
                && c.content.values().all(|t| {
                    !t.subject.trim().is_empty()
                        && !t.body.trim().is_empty()
                        && !t.body.contains("{{contenido}}")
                })
        })
    }
    pub(super) fn mails(&self, cx: &mut Context<Self>) -> Div {
        let mut root = column().child(self.page_head(
            "Correos",
            "Novedades y ofertas · solo para personas que lo han aceptado.",
            cx,
        ));
        if let Some(v) = self.list_state("Todavía no hay campañas", cx) {
            return root.child(v);
        }
        if let Some(c) = &self.state.mail.campaign {
            return root.child(self.mail_detail(c, cx));
        }
        root = root.child(self.mail_toolbar(cx));
        if self.state.mail.sync_cursor.is_some() {
            root = root.child(muted(
                "Quedan contactos por sincronizar. Pulsa de nuevo para continuar.",
            ));
        }
        root=root.child(note(&format!("{} envíos disponibles en las últimas 24 h. Las campañas grandes continúan en tandas.",self.state.mail.quota),EMBER));
        let mut counts = div().flex().flex_wrap().gap(px(8.));
        for (key, label) in GROUPS {
            counts = counts.child(tag(
                &format!(
                    "{label} · {}",
                    self.state.mail.counts.get(key).copied().unwrap_or_default()
                ),
                INK2,
            ));
        }
        root = root.child(counts);
        for (i, c) in self.state.mail.campaigns.iter().enumerate() {
            root = root.child(
                panel()
                    .gap(px(10.))
                    .child(
                        div()
                            .flex()
                            .justify_between()
                            .child(heading(&c.name, 18.))
                            .child(tag(
                                mail_status(&c.state),
                                if c.state == "draft" { EMBER } else { GREEN },
                            )),
                    )
                    .child(muted(&format!(
                        "{} · revisión {}",
                        GROUPS
                            .iter()
                            .find(|(k, _)| *k == c.target_group)
                            .map_or("", |(_, l)| *l),
                        c.revision
                    )))
                    .child(
                        self.button(
                            "mail-open",
                            "Abrir campaña",
                            Event::Mail(MailEvent::Select(i)),
                            cx,
                        )
                        .id(("mail-open", i)),
                    ),
            );
        }
        if self.state.mail.campaigns.is_empty() {
            root = root.child(empty_card("Todavía no hay campañas"));
        }
        root
    }
    fn mail_toolbar(&self, cx: &mut Context<Self>) -> Div {
        let mut toolbar = column();
        toolbar = toolbar.child(
            div()
                .flex()
                .gap(px(10.))
                .child(self.button(
                    "mail-new",
                    "Nueva campaña",
                    Event::Propose(Action::MailNew),
                    cx,
                ))
                .child(self.button(
                    "mail-sync",
                    "Sincronizar contactos",
                    Event::Propose(Action::MailSync {
                        cursor: self.state.mail.sync_cursor.clone(),
                    }),
                    cx,
                )),
        );
        toolbar = toolbar.child(
            div()
                .flex()
                .gap(px(10.))
                .child(self.button(
                    "mail-forget",
                    "Borrar de lista de espera",
                    Event::OpenDialog(Dialog::ForgetWaitlist),
                    cx,
                ))
                .child(self.button(
                    "mail-cleanup",
                    "Reintentar borrados de Brevo",
                    Event::Propose(Action::MailCleanup),
                    cx,
                )),
        );
        toolbar = toolbar.child(muted(&format!(
            "Borrados pendientes en Brevo: {}",
            self.state.mail.cleanup_pending
        )));
        if self.state.mail.cleanup_failed > 0 {
            toolbar = toolbar.child(tag(
                &format!(
                    "Atención: {} borrados fallidos en Brevo. Requieren revisión manual.",
                    self.state.mail.cleanup_failed
                ),
                EMBER,
            ));
            for failure in &self.state.mail.cleanup_failures {
                let reason = if failure.reason == "attempt_limit" {
                    "8 intentos agotados"
                } else {
                    "retención de 24 h agotada"
                };
                toolbar = toolbar.child(muted(&format!(
                    "Recibo {} · {} · intentos {} · HTTP {}",
                    failure.id,
                    reason,
                    failure.attempts,
                    failure
                        .last_http_status
                        .map_or_else(|| "sin respuesta".into(), |s| s.to_string())
                )));
            }
        }
        toolbar
    }
    fn mail_detail(&self, c: &Campaign, cx: &mut Context<Self>) -> Div {
        let editable = c.state == "draft";
        let dirty = self.mail_editor.dirty(c, cx);
        let mut top = div()
            .flex()
            .gap(px(10.))
            .items_center()
            .child(self.button("mail-back", "Campañas", Event::Mail(MailEvent::Back), cx))
            .child(tag(mail_status(&c.state), EMBER));
        if editable {
            top = top.child(self.button(
                "mail-save",
                "Guardar borrador",
                Event::Mail(MailEvent::Save),
                cx,
            ));
            let ready = !dirty
                && c.content.values().all(|t| {
                    !t.subject.trim().is_empty()
                        && !t.body.trim().is_empty()
                        && !t.body.contains("{{contenido}}")
                });
            top = top.child(
                self.button(
                    "mail-approve",
                    "Enviar…",
                    Event::Propose(Action::MailApprove {
                        campaign_id: c.id.clone(),
                        revision: c.revision,
                        confirm: true,
                    }),
                    cx,
                )
                .when(!ready, |d| {
                    orbit::disabled(d, "Guarda y revisa los cuatro idiomas antes de enviar")
                }),
            );
        } else if c.state == "sending" {
            top = top.child(self.button(
                "mail-batch",
                "Enviar siguiente tanda",
                Event::Propose(Action::MailSendBatch {
                    campaign_id: c.id.clone(),
                    revision: c.revision,
                }),
                cx,
            ));
        }
        let editor = self.mail_edit_fields(editable, cx);
        let preview = self.mail_preview(cx);
        let mut result = column()
            .child(top)
            .when(dirty, |d| {
                d.child(note(
                    "Cambios sin guardar. Revisa los cuatro idiomas antes de enviar.",
                    EMBER,
                ))
            })
            .child(
                div()
                    .flex()
                    .gap(px(24.))
                    .items_start()
                    .child(editor)
                    .child(preview),
            );
        if !editable {
            result = result.child(muted(&format!(
                "Cuota disponible: {} / 300",
                self.state.mail.quota
            )));
            result=result.child(heading("Historial de envíos",18.)).child(muted(&format!("Aceptados por Brevo: {} · inciertos: {} · pendientes: {} · omitidos: {}",self.state.mail.totals.get("accepted").copied().unwrap_or_default(),self.state.mail.totals.get("uncertain").copied().unwrap_or_default()+self.state.mail.totals.get("dispatching").copied().unwrap_or_default(),self.state.mail.totals.get("pending").copied().unwrap_or_default(),self.state.mail.totals.get("skipped").copied().unwrap_or_default()))).child(note("Brevo aceptado no acredita entrega. Un envío incierto requiere revisión y nunca se repite automáticamente. Máximo tres por tanda; vuelve otro día si se agota la cuota.",EMBER));
            for (i, h) in self.state.mail.history.iter().enumerate() {
                result = result.child(muted(&format!(
                    "{} · {} · {}",
                    i + 1,
                    h.get("locale").and_then(|v| v.as_str()).unwrap_or(""),
                    h.get("status").and_then(|v| v.as_str()).unwrap_or("")
                )));
            }
        }
        result
    }
    fn mail_edit_fields(&self, editable: bool, cx: &mut Context<Self>) -> Div {
        let mut editor = column()
            .flex_1()
            .min_w_0()
            .child(muted("NOMBRE DE CAMPAÑA"))
            .child(self.mail_editor.name.clone());
        let mut template = div().flex().flex_wrap().gap(px(5.));
        for (i, (_, label)) in TEMPLATES.iter().enumerate() {
            template = template.child(
                self.button(
                    "mail-template",
                    label,
                    Event::Mail(MailEvent::Template(i)),
                    cx,
                )
                .when(self.mail_editor.template == i, |d| d.bg(rgb(0x003b_1721)))
                .when(!editable, |d| orbit::disabled(d, "Campaña confirmada"))
                .id(("mail-template", i)),
            );
        }
        editor = editor
            .child(muted(
                "PLANTILLA · sustituye el texto de los cuatro idiomas",
            ))
            .child(template);
        let mut langs = div().flex().gap(px(5.));
        for (i, l) in LOCALES.iter().enumerate() {
            langs = langs.child(
                self.button("mail-locale", l, Event::Mail(MailEvent::Locale(i)), cx)
                    .id(("mail-locale", i))
                    .when(self.mail_editor.locale == i, |d| d.bg(rgb(0x003b_1721))),
            );
        }
        editor = editor
            .child(langs)
            .child(muted("ASUNTO"))
            .child(self.mail_editor.subject.clone())
            .child(muted("MENSAJE"))
            .child(self.mail_editor.body.clone());
        let mut targets = div().flex().flex_wrap().gap(px(5.));
        for (i, (key, label)) in GROUPS.iter().enumerate() {
            targets = targets.child(
                self.button(
                    "mail-group",
                    &format!(
                        "{label} · {}",
                        self.state
                            .mail
                            .counts
                            .get(*key)
                            .copied()
                            .unwrap_or_default()
                    ),
                    Event::Mail(MailEvent::Group(i)),
                    cx,
                )
                .when(self.mail_editor.group == i, |d| d.bg(rgb(0x003b_1721)))
                .when(!editable, |d| orbit::disabled(d, "Campaña confirmada"))
                .id(("mail-group", i)),
            );
        }
        editor = editor
            .child(muted("DESTINATARIOS CON CONSENTIMIENTO"))
            .child(targets);
        if editable {
            editor = editor
                .child(muted("AYUDA PARA REDACTAR · CLAUDE OPUS 5.5 HIGH"))
                .child(self.mail_editor.brief.clone())
                .child(self.button(
                    "mail-ai",
                    "Redactar en los cuatro idiomas",
                    Event::Mail(MailEvent::Draft),
                    cx,
                ));
        }
        editor
    }
    fn mail_preview(&self, cx: &Context<Self>) -> Div {
        let copy = self
            .mail_editor
            .content(cx)
            .get(LOCALES[self.mail_editor.locale])
            .cloned()
            .unwrap_or_default();
        panel()
            .flex_1()
            .min_w_0()
            .child(eyebrow("VISTA PREVIA"))
            .child(muted(&format!(
                "{} · {}",
                LOCALES[self.mail_editor.locale], TEMPLATES[self.mail_editor.template].1
            )))
            .child(heading(&copy.subject, 20.))
            .child(
                div()
                    .p(px(22.))
                    .rounded(px(12.))
                    .bg(rgb(0x00f5_f3f2))
                    .child(text("Vantare", 22., 0x0012_1316))
                    .child(text(&copy.body, 14., 0x0028_292e))
                    .child(div().mt(px(28.)).child(text(
                        crate::mail::unsubscribe_label(LOCALES[self.mail_editor.locale]),
                        12.,
                        0x0066_6670,
                    ))),
            )
            .child(muted(
                "Texto seguro · el enlace personal de baja se añade al enviar.",
            ))
    }
}
fn mail_status(state: &str) -> &str {
    match state {
        "draft" => "Borrador",
        "sending" => "Confirmada · en tandas",
        "completed" => "Tandas terminadas",
        _ => "Desconocido",
    }
}
