//! Lectura de borradores y revisiones desde el repositorio nativo de Strategy.
use super::{Strategy, Value, application, orbit};
use gpui::{
    div,
    prelude::{InteractiveElement, ParentElement, Styled},
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

    #[allow(clippy::too_many_lines)] // Mantiene juntas las dos fuentes de revisión de la pestaña.
    pub(super) fn revisions_page(&self) -> gpui::Div {
        let repository = application::repository::LocalRepository::open(&self.directory)
            .and_then(|repository| repository.load());
        match repository {
            Ok(snapshot) => {
                let mut rows = orbit::card_body().gap(px(8.0));
                for (index, document) in snapshot.revisions.iter().enumerate() {
                    rows = rows.child(
                        orbit::list_row(
                            "strategy-revision",
                            &revision_title(document, index),
                            &revision_description(document),
                            false,
                            false,
                        )
                        .id(("strategy-revision", index)),
                    );
                }
                if snapshot.revisions.is_empty() {
                    rows = rows.child(orbit::empty_state(
                        "Sin revisiones guardadas",
                        "Las revisiones solo aparecen cuando el repositorio nativo las contiene.",
                    ));
                }
                let exact = self.exact_projection_revisions();
                let exact_rows = match exact {
                    Ok(Some(revisions)) => {
                        let mut exact_rows = orbit::card_body().gap(px(8.0));
                        for revision in revisions {
                            exact_rows = exact_rows.child(orbit::setting_row(
                                &revision.session_id,
                                &format!("Snapshot {}", revision.snapshot_id),
                                orbit::text(
                                    format!("Revisión {}", revision.revision_id),
                                    orbit::SECONDARY,
                                    400,
                                    orbit::INK_2,
                                ),
                            ));
                        }
                        exact_rows
                    }
                    Ok(None) => orbit::card_body().child(orbit::empty_state(
                        "Sin proyección vinculada",
                        "No hay revisiones de sesión para validar en la carrera seleccionada.",
                    )),
                    Err(error) => orbit::card_body().child(orbit::callout(error)),
                };
                let plan_state = if self.result.is_some() {
                    "El resultado del solver se conserva en memoria para esta sesión.".to_owned()
                } else {
                    "Sin calcular. Guardar la configuración no acepta un resultado.".to_owned()
                };
                div()
                    .flex()
                    .flex_col()
                    .gap(px(14.0))
                    .child(orbit::text("Revisiones", 32.0, 700, orbit::INK))
                    .child(orbit::text(
                        "Consulta los cambios y confirma qué revisión respalda la carrera.",
                        orbit::BODY,
                        400,
                        orbit::INK_2,
                    ))
                    .child(
                        div()
                            .flex()
                            .items_start()
                            .gap(px(14.0))
                            .child(
                                orbit::card("Fuente del historial")
                                    .flex_1()
                                    .min_w_0()
                                    .child(
                                        orbit::card_body()
                                            .gap(px(12.0))
                                            .child(orbit::text(
                                                format!(
                                                    "{} borradores · {} revisiones · generación {}",
                                                    snapshot.drafts.len(),
                                                    snapshot.revisions.len(),
                                                    snapshot.generation
                                                ),
                                                orbit::SECONDARY,
                                                400,
                                                orbit::INK_3,
                                            ))
                                            .child(orbit::text(
                                                "Historial local de Strategy",
                                                orbit::BODY,
                                                600,
                                                orbit::INK,
                                            ))
                                            .child(rows)
                                            .child(orbit::text(
                                                "Revisiones exactas de las sesiones seleccionadas",
                                                orbit::BODY,
                                                600,
                                                orbit::INK,
                                            ))
                                            .child(exact_rows),
                                    ),
                            )
                            .child(
                                orbit::card("Qué conserva tu carrera")
                                    .w(px(430.0))
                                    .flex_none()
                                    .child(
                                        orbit::card_body()
                                            .gap(px(12.0))
                                            .child(orbit::card("Configuración guardada").child(
                                                orbit::card_body().child(orbit::text(
                                                    "Combinación, reglas, pilotos y referencias exactas del documento.",
                                                    orbit::SECONDARY,
                                                    400,
                                                    orbit::INK_2,
                                                )),
                                            ))
                                            .child(orbit::card("Estado del plan").child(
                                                orbit::card_body().child(orbit::text(
                                                    plan_state,
                                                    orbit::SECONDARY,
                                                    400,
                                                    orbit::INK_2,
                                                )),
                                            ))
                                            .child(orbit::text(
                                                "Consultar el historial no cambia la carrera ni los datos originales.",
                                                orbit::SECONDARY,
                                                400,
                                                orbit::INK_3,
                                            )),
                                    ),
                            ),
                    )
            }
            Err(error) => orbit::card("Revisiones locales")
                .child(orbit::card_body().child(orbit::callout(error))),
        }
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
