//! Simple r10h cards/forms backed by the existing services entity.
use super::view::Testing;
use crate::{
    orbit::{self, Input},
    services::protocol::Command,
};
use gpui::{Context, Div, Entity, div, prelude::*, px};

pub(super) struct Form {
    pub(super) questionnaire_id: Option<String>,
    pub(super) score: u8,
    pub(super) answer_note: Entity<Input>,
    pub(super) contribution_title: Entity<Input>,
    pub(super) contribution_body: Entity<Input>,
    pub(super) contribution_attempt: Option<(String, String, String)>,
    pub(super) generation: u64,
}
impl Form {
    pub(super) fn new(questionnaire_id: Option<String>, cx: &mut Context<Testing>) -> Self {
        Self {
            questionnaire_id,
            score: 3,
            generation: 0,
            contribution_attempt: None,
            answer_note: cx.new(|cx| Input::multiline(String::new(), "Comentario opcional", cx)),
            contribution_title: cx
                .new(|cx| Input::new(String::new(), "Título de la contribución", cx)),
            contribution_body: cx
                .new(|cx| Input::multiline(String::new(), "Propuesta o contribución", cx)),
        }
    }
}
impl Testing {
    fn participation_header(&self, title: &str, cx: &mut Context<Self>) -> Div {
        let remote = self.remote.read(cx);
        let ready = remote.participation_ready();
        orbit::neo_card(cx)
            .flex_none()
            .gap(px(10.0))
            .child(orbit::neo_header(title, "v-testing", cx))
            .child(orbit::text(
                remote.participation_message.clone(),
                13.0,
                400,
                orbit::ink_2(cx),
                cx,
            ))
            .child(
                orbit::small_button("testing-participation-refresh", "Recargar", cx)
                    .tab_stop(ready)
                    .when(!ready, |b| {
                        orbit::disabled(b, "Inicia sesión o espera la operación actual")
                    })
                    .on_click(cx.listener(|this, _, _, cx| {
                        this.remote.update(cx, |remote, cx| {
                            remote.participation_request(Command::TestingRefresh, cx);
                        });
                    })),
            )
    }
    pub(super) fn questionnaires(&self, cx: &mut Context<Self>) -> Div {
        let mut page = div()
            .flex_1()
            .min_h_0()
            .flex()
            .flex_col()
            .gap(px(self.adapt.gap()))
            .child(self.participation_header("Cuestionarios por versión", cx));
        let data = self.remote.read(cx).participation.questionnaires.clone();
        let ready = self.remote.read(cx).participation_ready();
        let mut list = orbit::neo_card(cx)
            .id("testing-questionnaires-list")
            .flex_1()
            .min_h_0()
            .overflow_y_scroll()
            .gap(px(10.0));
        if data.is_empty() {
            list = list.child(orbit::text(
                "No hay cuestionarios cargados. Recarga para consultar las versiones disponibles.",
                14.0,
                400,
                orbit::ink_3(cx),
                cx,
            ));
        }
        for q in &data {
            let q = q.clone();
            list = list.child(
                orbit::small_button(
                    "testing-questionnaire",
                    &format!(
                        "{} · {} · {}",
                        q.version,
                        q.title,
                        if q.score.is_some() {
                            "Respondido"
                        } else {
                            "Sin responder"
                        }
                    ),
                    cx,
                )
                .id(format!("questionnaire-{}", q.id))
                .on_click(cx.listener(move |this, _, _, cx| {
                    this.participation_form.questionnaire_id = Some(q.id.clone());
                    this.participation_form.score = q.score.unwrap_or(3);
                    this.participation_form.answer_note =
                        cx.new(|cx| Input::multiline(q.note.clone(), "Comentario opcional", cx));
                    cx.notify();
                })),
            );
        }
        page = page.child(list);
        if let Some(q) = data
            .iter()
            .find(|q| Some(&q.id) == self.participation_form.questionnaire_id.as_ref())
        {
            page = page.child(self.questionnaire_form(q, ready, cx));
        }
        page
    }
    fn questionnaire_form(
        &self,
        q: &crate::services::protocol::testing_document::Questionnaire,
        ready: bool,
        cx: &mut Context<Self>,
    ) -> Div {
        let mut form = orbit::neo_card(cx)
            .flex_none()
            .gap(px(10.0))
            .child(orbit::text(
                q.question.clone(),
                16.0,
                600,
                orbit::ink(cx),
                cx,
            ));
        let mut scores = div().flex().gap(px(8.0));
        for score in 1..=5 {
            scores = scores.child(
                orbit::small_button(
                    "testing-score",
                    &format!(
                        "{score}{}",
                        if self.participation_form.score == score {
                            " ✓"
                        } else {
                            ""
                        }
                    ),
                    cx,
                )
                .id(format!("testing-score-{score}"))
                .on_click(cx.listener(move |this, _, _, cx| {
                    this.participation_form.score = score;
                    cx.notify();
                })),
            );
        }
        let id = q.id.clone();
        form = form.child(orbit::text("1 · Muy mala     5 · Muy buena", 12.0, 400, orbit::ink_3(cx), cx))
                .child(scores).child(self.participation_form.answer_note.clone())
                .child(orbit::primary_button("testing-answer-save", "Guardar respuesta", cx).tab_stop(ready)
                    .when(!ready, |b| orbit::disabled(b, "Servicio ocupado o sesión requerida"))
                    .on_click(cx.listener(move |this, _, _, cx| {
                        let note = this.participation_form.answer_note.read(cx).value.clone();
                        this.remote.update(cx, |remote, cx| remote.participation_request(Command::TestingAnswer { id: id.clone(), score: this.participation_form.score, note }, cx));
                    })))
                .child(orbit::text("Respuesta privada ligada a tu cuenta. Solo se envía al pulsar Guardar respuesta; puedes actualizarla.", 12.0, 400, orbit::ink_3(cx), cx));
        form
    }
    pub(super) fn community(&self, cx: &mut Context<Self>) -> Div {
        let ready = self.remote.read(cx).participation_ready();
        let mut list = orbit::neo_card(cx)
            .id("testing-contributions-list")
            .flex_1()
            .min_h_0()
            .overflow_y_scroll()
            .gap(px(10.0))
            .child(orbit::neo_header("Mis contribuciones", "pulse", cx));
        let data = &self.remote.read(cx).participation.contributions;
        if data.is_empty() {
            list = list.child(orbit::text(
                "Sin contribuciones cargadas",
                14.0,
                400,
                orbit::ink_3(cx),
                cx,
            ));
        }
        for c in data {
            let state = match c.state.as_str() {
                "received" => "Recibida",
                "reviewing" => "En revisión",
                "accepted" => "Aceptada",
                _ => "No aceptada",
            };
            list = list
                .child(orbit::text(
                    format!("{} · {state}", c.title),
                    14.0,
                    600,
                    orbit::ink(cx),
                    cx,
                ))
                .child(orbit::text(c.body.clone(), 12.0, 400, orbit::ink_2(cx), cx));
        }
        div().flex_1().min_h_0().flex().flex_col().gap(px(self.adapt.gap()))
            .child(self.participation_header("Ayúdanos a mejorar Vantare", cx))
            .child(orbit::neo_card(cx).flex_none().gap(px(10.0))
                .child(self.participation_form.contribution_title.clone()).child(self.participation_form.contribution_body.clone())
                .child(orbit::primary_button("testing-contribution-send", "Enviar contribución", cx).tab_stop(ready)
                    .when(!ready, |b| orbit::disabled(b, "Servicio ocupado o sesión requerida"))
                    .on_click(cx.listener(|this, _, _, cx| {
                        let title = this.participation_form.contribution_title.read(cx).value.clone();
                        let body = this.participation_form.contribution_body.read(cx).value.clone();
                        if title.trim().is_empty() || body.trim().is_empty() { return; }
                        let attempt = match this.participation_form.contribution_attempt.as_ref() {
                            Some((id, old_title, old_body)) if *old_title == title && *old_body == body => Some(id.clone()),
                            _ => new_uuid(),
                        };
                        if let Some(id) = attempt {
                            this.participation_form.contribution_attempt = Some((id.clone(), title.clone(), body.clone()));
                            this.remote.update(cx, |remote, cx| remote.participation_request(Command::TestingContribute { id, title, body }, cx));
                        }
                    })))
                .child(orbit::text("Propuestas, documentación y pruebas. Tu texto se envía al equipo; evita datos personales. No se publica tu identidad ni se asignan niveles o insignias.", 12.0, 400, orbit::ink_3(cx), cx)))
            .child(list)
    }
}

fn new_uuid() -> Option<String> {
    let id = vantare_services::random_id().ok()?;
    (id.len() == 64).then(|| {
        format!(
            "{}-{}-{}-{}-{}",
            &id[..8],
            &id[8..12],
            &id[12..16],
            &id[16..20],
            &id[20..32]
        )
    })
}
