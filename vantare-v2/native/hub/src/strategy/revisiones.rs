//! Lectura de borradores y revisiones desde el repositorio nativo de Strategy.
use super::{Strategy, Value, application, orbit};
use gpui::{
    div,
    prelude::{FluentBuilder, InteractiveElement, ParentElement, Styled},
    px,
};

impl Strategy {
    pub(super) fn save_application_draft(&self) -> Result<(), String> {
        let document = self
            .editor
            .document
            .as_ref()
            .ok_or("Crea o abre una carrera antes de guardar el borrador")?;
        let bytes = std::str::from_utf8(document.bytes())
            .map_err(|error| format!("documento Strategy no UTF-8: {error}"))?;
        let active_event = document.value()["activeEventId"].as_str();
        let repository = application::repository::LocalRepository::open(&self.directory)?;
        let snapshot = repository.load()?;
        let mut drafts = snapshot.drafts;
        let matching_draft = active_event.and_then(|active_event| {
            drafts.iter().rposition(|draft| {
                serde_json::from_str::<Value>(draft)
                    .ok()
                    .and_then(|value| value["activeEventId"].as_str().map(str::to_owned))
                    .is_some_and(|id| id == active_event)
            })
        });
        if let Some(index) = matching_draft {
            bytes.clone_into(&mut drafts[index]);
        } else {
            drafts.push(bytes.to_owned());
        }
        repository
            .save_documents(snapshot.generation, &drafts, &snapshot.revisions)
            .map(|_| ())
    }

    #[allow(clippy::too_many_lines)] // Mantiene juntas las dos columnas de la pestaña.
    pub(super) fn revisions_page(&self, cx: &gpui::App) -> gpui::Div {
        let repository = application::repository::LocalRepository::open(&self.directory)
            .and_then(|repository| repository.load());
        match repository {
            Ok(snapshot) => {
                let mut revision_rows = div().flex().flex_col().gap(px(8.0));
                for (index, document) in snapshot.revisions.iter().enumerate() {
                    revision_rows = revision_rows.child(
                        orbit::list_row(
                            "strategy-revision",
                            &revision_title(document, index),
                            &revision_description(document),
                            false,
                            false,
                            cx,
                        )
                        .id(("strategy-revision", index)),
                    );
                }
                let history = if self.capture_demo().is_some() {
                    Self::demo_revision_history(cx)
                } else if snapshot.revisions.is_empty() {
                    div()
                        .flex()
                        .items_start()
                        .gap(px(14.0))
                        .h(px(145.0))
                        .flex_none()
                        .mt(px(19.0))
                        .p(px(16.0))
                        .rounded(px(10.0))
                        .border_1()
                        .border_color(gpui::rgba(orbit::line(cx)))
                        .bg(gpui::rgba(crate::orbit::legacy_rgba(0x1010_12e8, cx)))
                        .child(orbit::icon("i-lock", 19.0, orbit::carmine(cx)))
                        .child(
                            div()
                                .flex()
                                .flex_col()
                                .gap(px(8.0))
                                .child(orbit::text(
                                    "Sin revisiones guardadas",
                                    16.0,
                                    600,
                                    orbit::ink(cx),
                                 cx))
                                .child(orbit::text(
                                    "El repositorio local todavía no contiene una revisión de esta carrera.",
                                    orbit::SECONDARY,
                                    400,
                                    orbit::ink_2(cx),
                                 cx)),
                        )
                } else {
                    revision_rows.mt(px(19.0))
                };
                let exact_summary = match self.exact_projection_revisions() {
                    Ok(Some(revisions)) => format!(
                        "{} referencias exactas de sesión vinculadas a esta carrera.",
                        revisions.len()
                    ),
                    Ok(None) if self.capture_demo().is_some() => "Se muestran todas las correcciones activas de esta revisión. Consultarla no cambia la carrera.".to_owned(),
                    Ok(None) => {
                        "No hay referencias exactas de sesión vinculadas a esta carrera.".to_owned()
                    }
                    Err(error) => error,
                };
                let plan_state = if self.result.is_some() {
                    "El resultado del solver se conserva en memoria para esta sesión.".to_owned()
                } else if self.capture_demo().is_some() {
                    "Guardar la configuración o corregir datos no equivale a aceptar un resultado de carrera.".to_owned()
                } else {
                    "Sin calcular. Guardar la configuración no acepta un resultado.".to_owned()
                };
                let information_card = |icon: &'static str,
                                        title: &str,
                                        description: &str,
                                        height: f32| {
                    div()
                        .flex()
                        .items_center()
                        .gap(px(24.0))
                        .min_h(px(height))
                        .px(px(19.0))
                        .rounded(px(10.0))
                        .border_1()
                        .border_color(gpui::rgba(orbit::line(cx)))
                        .bg(gpui::rgba(crate::orbit::legacy_rgba(0x1012_14e8, cx)))
                        .child(orbit::icon(icon, 29.0, orbit::ink_2(cx)))
                        .child(
                            div()
                                .flex()
                                .flex_col()
                                .min_w_0()
                                .flex_1()
                                .gap(px(9.0))
                                .child(
                                    orbit::text(title.to_owned(), 16.0, 700, orbit::ink(cx), cx)
                                        .line_height(px(24.0)),
                                )
                                .child(
                                    orbit::text(
                                        description.to_owned(),
                                        13.0,
                                        400,
                                        orbit::ink_2(cx),
                                        cx,
                                    )
                                    .line_height(px(19.5)),
                                ),
                        )
                };
                let source_control = div()
                    .flex()
                    .items_center()
                    .justify_between()
                    .flex_1()
                    .min_w_0()
                    .h(px(40.0))
                    .px(px(16.0))
                    .rounded(px(8.0))
                    .border_1()
                    .border_color(gpui::rgba(orbit::line_strong(cx)))
                    .bg(gpui::rgba(crate::orbit::legacy_rgba(0x0809_0bf0, cx)))
                    .child(orbit::text(
                        self.capture_demo()
                            .map_or("Sin fuentes de datos conectadas", |demo| demo.session_name),
                        13.0,
                        400,
                        orbit::ink(cx),
                        cx,
                    ))
                    .child(orbit::text("⌄", 16.0, 500, orbit::ink_3(cx), cx));
                let source_actions = div()
                    .flex()
                    .items_center()
                    .gap(px(9.0))
                    .mt(px(21.0))
                    .children(
                        [
                            "Revisión anterior",
                            "Revisar última revisión",
                            "Ver datos de la carrera",
                        ]
                        .into_iter()
                        .enumerate()
                        .map(|(index, label)| {
                            super::editor_view::secondary_button(
                                match index {
                                    0 => "strategy-revision-previous",
                                    1 => "strategy-revision-latest",
                                    _ => "strategy-revision-career-data",
                                },
                                label,
                                13.0,
                                cx,
                            )
                            .tab_stop(false)
                            .opacity(orbit::DISABLED)
                            .cursor(gpui::CursorStyle::Arrow)
                            .h(px(40.0))
                            .w(px([129.0, 163.0, 164.0][index]))
                        }),
                    );
                div()
                    .flex()
                    .flex_col()
                    .gap(px(0.0))
                    .child(super::view::heading("Revisiones", 68.0, -1.15, cx).mt(px(2.0)).ml(px(12.0)))
                    .child(
                        orbit::text(
                            "Consulta los cambios y decide qué revisión usa tu carrera.",
                            13.0,
                            400,
                            orbit::ink_2(cx),
                         cx)
                        .line_height(px(22.4)).ml(px(11.0)),
                    )
                    .child(
                        div()
                            .flex()
                            .items_start()
                            .gap(px(16.0))
                            .mt(px(20.0))
                            .child(
                                div()
                                    .flex_1()
                                    .min_w_0()
                                    .h(px(466.0))
                                    .p(px(22.0))
                                    .pt(px(33.0))
                                    .rounded(px(orbit::RADIUS))
                                    .border_1()
                                    .border_color(gpui::rgba(orbit::line(cx)))
                                    .bg(gpui::rgb(crate::orbit::legacy_rgb(0x000c_1012, cx)))
                                    .child(orbit::text(
                                        "Fuente del historial",
                                        13.0,
                                        400,
                                        orbit::ink_2(cx),
                                     cx))
                                    .child(
                                        div()
                                            .flex()
                                            .items_center()
                                            .gap(px(12.0))
                                            .mt(px(7.0))
                                            .child(source_control)
                                            .child(
                                                orbit::button(
                                                    "strategy-manage-sources",
                                                    "Gestionar fuentes",
                                                 cx)
                                                .tab_stop(false)
                                                .opacity(if self.capture_demo().is_some() { 1.0 } else { orbit::DISABLED })
                                                .when(self.capture_demo().is_some(), |button| button.border_color(gpui::rgb(orbit::carmine(cx))).bg(gpui::rgba(crate::orbit::legacy_rgba(0xc52e_4214, cx))))
                                                .cursor(gpui::CursorStyle::Arrow)
                                                .w(px(136.0))
                                                .h(px(40.0)).relative().top(px(1.0)),
                                            ),
                                    )
                                    .child(
                                        orbit::text("Historial de datos",20.0,400,orbit::ink(cx), cx).line_height(px(30.0))
                                            .mt(px(18.0)),
                                    )
                                    .child(source_actions)
                                    .child(history)
                                    .child(
                                        orbit::text(exact_summary,13.0,400,orbit::ink_2(cx), cx).line_height(px(19.5))
                                            .mt(px(13.0)),
                                    )
                                    .child(
                                        orbit::text(
                                            if self.capture_demo().is_some() {
                                                "Esta revisión utiliza los valores originales.".to_owned()
                                            } else { format!(
                                                "{} borradores · {} revisiones · generación {}",
                                                snapshot.drafts.len(),
                                                snapshot.revisions.len(),
                                                snapshot.generation
                                            ) },
                                            13.0,
                                            400,
                                            orbit::ink_2(cx),
                                         cx)
                                        .mt(px(15.0)),
                                    ),
                            )
                            .child(
                                div()
                                    .w(px(668.0))
                                    .h(px(520.0))
                                    .flex_none()
                                    .p(px(22.0))
                                    .pt(px(26.0))
                                    .rounded(px(orbit::RADIUS))
                                    .border_1()
                                    .border_color(gpui::rgba(orbit::line(cx)))
                                    .bg(gpui::rgb(crate::orbit::legacy_rgb(0x000c_1012, cx)))
                                    .child(orbit::text(
                                        "Qué conserva tu carrera",
                                        20.0,
                                        400,
                                        orbit::ink(cx),
                                     cx))
                                    .child(
                                        information_card(
                                            "i-ajustes",
                                            "Configuración guardada",
                                            if self.capture_demo().is_some() { "Combinación, reglas, pilotos y referencias exactas de los datos seleccionados." } else { "Combinación, reglas, pilotos y referencias exactas del documento." },
                                            98.0,
                                        )
                                        .mt(px(20.0)),
                                    )
                                    .child(
                                        information_card(
                                            "i-estrategia",
                                            if self.result.is_some() {
                                                "Calculado"
                                            } else {
                                                "Sin calcular"
                                            },
                                            &plan_state,
                                            118.0,
                                        )
                                        .mt(px(18.0)),
                                    )
                                    .child(
                                        div()
                                            .h(px(1.0))
                                            .bg(gpui::rgba(orbit::line(cx)))
                                            .mt(px(20.0)),
                                    )
                                    .child(
                                        orbit::text("Recuperar esta revisión",16.0,500,orbit::ink(cx), cx)
                                            .mt(px(29.0)),
                                    )
                                    .child(
                                        orbit::text(
                                            if self.capture_demo().is_some() { "Se guardará una revisión nueva con estas correcciones. Los originales y las revisiones anteriores permanecen intactos. Después podrás elegirla para la carrera.
Consulta una revisión anterior para recuperar sus correcciones." } else { "Una revisión local válida puede restaurarse sin modificar los datos de origen." },
                                            13.0,
                                            400,
                                            orbit::ink_2(cx),
                                         cx)
                                        .line_height(px(20.2)).mt(px(10.0)),
                                    )
                                    .child(
                                        super::editor_view::secondary_button(
                                            "strategy-restore-revision",
                                            "Preparar revisión",
                                            13.0,
                                         cx)
                                        .tab_stop(false)
                                        .opacity(orbit::DISABLED)
                                        .cursor(gpui::CursorStyle::Arrow)
                                        .w(px(132.0))
                                        .h(px(40.0))
                                        .mt(px(0.0)),
                                    ),
                            ),
                    )
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .gap(px(10.0))
                            .mt(px(20.0))
                            .ml(px(4.0))
                            .child(orbit::icon("i-lock", 16.0, orbit::ink_3(cx)))
                            .child(orbit::text(
                                "Originales intactos",
                                orbit::SECONDARY,
                                500,
                                orbit::ink_2(cx),
                             cx)),
                    )
            }
            Err(error) => orbit::card("Revisiones locales", cx)
                .child(orbit::card_body().child(orbit::callout(error, cx))),
        }
    }

    fn demo_revision_history(cx: &gpui::App) -> gpui::Div {
        let badge = |label: &'static str| {
            div()
                .px(px(8.0))
                .py(px(3.0))
                .rounded(px(5.0))
                .border_1()
                .border_color(gpui::rgba(orbit::line(cx)))
                .child(orbit::text(label, 11.0, 400, orbit::ink(cx), cx).line_height(px(16.0)))
        };
        div()
            .flex()
            .items_start()
            .gap(px(22.0))
            .h(px(146.0))
            .flex_none()
            .mt(px(19.0))
            .px(px(20.0))
            .py(px(18.0))
            .rounded(px(7.0))
            .border_1()
            .overflow_hidden()
            .border_color(gpui::rgba(orbit::line_strong(cx)))
            .bg(gpui::rgb(crate::orbit::legacy_rgb(0x0015_1113, cx)))
            .child(orbit::icon("i-roadmap", 20.0, orbit::carmine(cx)))
            .child(
                div()
                    .flex()
                    .flex_col()
                    .gap(px(8.0))
                    .child(
                        div()
                            .flex()
                            .gap(px(8.0))
                            .child(badge("Usada por esta carrera"))
                            .child(badge("Última guardada")),
                    )
                    .child(orbit::text(
                        "Datos originales",
                        16.0,
                        600,
                        orbit::ink(cx),
                        cx,
                    ))
                    .child(
                        orbit::text(
                            "Punto de partida sin correcciones.\nCorrecciones activas: 0",
                            13.0,
                            400,
                            orbit::ink_2(cx),
                            cx,
                        )
                        .line_height(px(19.5))
                        .mt(px(3.0)),
                    ),
            )
            .child(
                div()
                    .absolute()
                    .left(px(0.0))
                    .top(px(0.0))
                    .bottom(px(0.0))
                    .w(px(3.0))
                    .bg(gpui::rgb(orbit::carmine(cx))),
            )
            .relative()
    }

    fn exact_projection_revisions(
        &self,
    ) -> Result<Option<Vec<application::AnalysisRevisionRef>>, String> {
        let Some(event) = self.current_event() else {
            return Ok(None);
        };
        let projection = &event["planningInputs"]["projection"];
        if projection.is_null() {
            return Ok(None);
        }
        let sessions = serde_json::from_value::<Vec<String>>(projection["sourceSessions"].clone())
            .map_err(|_| "La proyección no contiene una lista de sesiones válida".to_owned())?;
        let revisions = serde_json::from_value::<Vec<application::AnalysisRevisionRef>>(
            projection["sourceRevisions"].clone(),
        )
        .map_err(|_| "La proyección no contiene revisiones exactas".to_owned())?;
        application::validate_analysis_revisions(&sessions, &revisions)?;
        Ok(Some(revisions))
    }
}

fn revision_title(document: &str, index: usize) -> String {
    serde_json::from_str::<Value>(document)
        .ok()
        .and_then(|value| {
            value["revisionId"]
                .as_str()
                .or_else(|| value["id"].as_str())
                .map(str::to_owned)
        })
        .unwrap_or_else(|| format!("Registro {}", index + 1))
}

fn revision_description(document: &str) -> String {
    serde_json::from_str::<Value>(document).map_or_else(
        |_| "Documento de revisión no legible".to_owned(),
        |value| {
            let session = value["sessionId"].as_str().unwrap_or("");
            let snapshot = value["snapshotId"].as_str().unwrap_or("");
            match (session.is_empty(), snapshot.is_empty()) {
                (false, false) => format!("Sesión {session} · snapshot {snapshot}"),
                (false, true) => format!("Sesión {session}"),
                (true, false) => format!("Snapshot {snapshot}"),
                (true, true) => "Registro del repositorio local".to_owned(),
            }
        },
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exact_projection_revision_validation_rejects_missing_or_mismatched_refs() {
        let digest = "a".repeat(64);
        let revision = application::AnalysisRevisionRef {
            session_id: "session-1".into(),
            base_digest: digest.clone(),
            revision_id: "b".repeat(64),
            snapshot_id: "c".repeat(64),
        };
        assert!(
            application::validate_analysis_revisions(
                &["session-1".into()],
                std::slice::from_ref(&revision)
            )
            .is_ok()
        );
        assert!(
            application::validate_analysis_revisions(&["session-2".into()], &[revision]).is_err()
        );
    }

    #[test]
    fn revision_rows_never_reveal_unparsed_document_bytes() {
        assert_eq!(revision_title("{", 0), "Registro 1");
        assert_eq!(
            revision_description("{"),
            "Documento de revisión no legible"
        );
    }
}
