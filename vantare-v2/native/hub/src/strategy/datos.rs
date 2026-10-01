//! Revisión de observaciones usando los contratos exactos de Analysis.
use gpui::{Context, Div, ParentElement, Styled, div, prelude::*, px, rgba};

use super::{Strategy, orbit};
use vantare_strategy::application::{
    self, AnalysisRevisionRef, CorrectionFamily, CorrectionSource, FamilyCorrectionRequest,
    FamilyCorrectionTarget, FamilyUse, PreparedFamilyCorrection, ValidityLap,
};

const PAGE_SIZE: usize = 5;
const FAMILIES: [CorrectionFamily; 5] = [
    CorrectionFamily::FuelConsumption,
    CorrectionFamily::VirtualEnergyConsumption,
    CorrectionFamily::CombinedStintPaceCurve,
    CorrectionFamily::TyreDegradation,
    CorrectionFamily::SavingCost,
];

#[derive(Clone, Debug)]
pub(super) struct State {
    label: Option<String>,
    source: Option<CorrectionSource>,
    selected_revisions: Vec<AnalysisRevisionRef>,
    corrections: Vec<PreparedFamilyCorrection>,
    family: CorrectionFamily,
    page: usize,
    selected_lap: Option<usize>,
    advanced: bool,
    sources_open: bool,
    error: Option<String>,
}

impl Default for State {
    fn default() -> Self {
        Self {
            label: None,
            source: None,
            selected_revisions: Vec::new(),
            corrections: Vec::new(),
            family: CorrectionFamily::CombinedStintPaceCurve,
            page: 0,
            selected_lap: None,
            advanced: false,
            sources_open: false,
            error: None,
        }
    }
}

impl State {
    pub(super) fn load(
        &mut self,
        label: String,
        source: CorrectionSource,
        selected_revisions: Vec<AnalysisRevisionRef>,
        corrections: &[PreparedFamilyCorrection],
    ) -> Result<(), String> {
        if label.trim().is_empty() {
            return Err("analysis_session_label_required".into());
        }
        application::continue_with_analysis_revision(&source.revision, &selected_revisions)?;
        let requests = corrections
            .iter()
            .map(|correction| correction.request.clone())
            .collect::<Vec<_>>();
        let checked =
            application::prepare_family_corrections(&source, &selected_revisions, &requests)?;
        if checked != corrections {
            return Err("invalid_correction_set".into());
        }
        application::apply_family_corrections(
            &source,
            &selected_revisions,
            &source.validity.laps,
            &checked,
        )?;

        self.label = Some(label);
        self.source = Some(source);
        self.selected_revisions = selected_revisions;
        self.corrections = checked;
        self.page = 0;
        self.selected_lap = None;
        self.error = None;
        Ok(())
    }

    pub(super) fn set_capture_view(
        &mut self,
        page: usize,
        selected_lap: Option<usize>,
        advanced: bool,
        sources_open: bool,
    ) {
        self.page = page.min(self.page_count().saturating_sub(1));
        self.selected_lap = selected_lap.filter(|index| *index < self.visible_lap_count());
        self.advanced = advanced;
        self.sources_open = sources_open;
    }

    fn effective_laps(&self) -> Result<Vec<ValidityLap>, String> {
        let source = self.source.as_ref().ok_or("analysis_source_unavailable")?;
        application::apply_family_corrections(
            source,
            &self.selected_revisions,
            &source.validity.laps,
            &self.corrections,
        )
    }

    fn correction_for(&self, lap: &ValidityLap) -> Option<&PreparedFamilyCorrection> {
        self.corrections.iter().find(|correction| {
            let target = &correction.request.target;
            correction.request.family == self.family
                && target.number == lap.number
                && target.start == lap.start
                && target.end == lap.end
        })
    }

    fn apply(&mut self, included: bool, reason: String) -> Result<(), String> {
        if reason.trim().is_empty() {
            return Err("correction_reason_required".into());
        }
        let source = self.source.as_ref().ok_or("analysis_source_unavailable")?;
        let index = self.selected_lap.ok_or("analysis_target_unavailable")?;
        let original_lap = source
            .validity
            .laps
            .get(index)
            .ok_or("analysis_target_unavailable")?;
        let expected = original_lap
            .family_use
            .iter()
            .find(|item| item.family == self.family)
            .cloned()
            .ok_or("analysis_family_unavailable")?;
        let request = FamilyCorrectionRequest {
            base: source.base.clone(),
            target: FamilyCorrectionTarget {
                number: original_lap.number,
                start: original_lap.start.clone(),
                end: original_lap.end.clone(),
            },
            family: self.family,
            expected,
            included,
            reason,
        };
        let mut requests = self
            .corrections
            .iter()
            .filter(|correction| {
                correction.request.family != self.family
                    || correction.request.target.number != original_lap.number
                    || correction.request.target.start != original_lap.start
                    || correction.request.target.end != original_lap.end
            })
            .map(|correction| correction.request.clone())
            .collect::<Vec<_>>();
        requests.push(request);
        let next =
            application::prepare_family_corrections(source, &self.selected_revisions, &requests)?;
        application::apply_family_corrections(
            source,
            &self.selected_revisions,
            &source.validity.laps,
            &next,
        )?;
        self.corrections = next;
        self.error = None;
        Ok(())
    }

    fn page_count(&self) -> usize {
        self.source
            .as_ref()
            .map_or(0, |source| source.validity.laps.len().div_ceil(PAGE_SIZE))
    }

    fn visible_range(&self) -> std::ops::Range<usize> {
        let len = self
            .source
            .as_ref()
            .map_or(0, |source| source.validity.laps.len());
        page_range(len, self.page)
    }

    fn visible_lap_count(&self) -> usize {
        self.source
            .as_ref()
            .map_or(0, |source| source.validity.laps.len())
    }

    fn select_family(&mut self, family: CorrectionFamily) {
        self.family = family;
        self.selected_lap = None;
        self.error = None;
    }

    fn change_page(&mut self, page: usize) {
        self.page = page.min(self.page_count().saturating_sub(1));
        self.selected_lap = None;
    }
}

impl Strategy {
    pub(super) fn apply_data_correction(&mut self, included: bool, cx: &mut Context<Self>) {
        let reason = self.correction_reason.read(cx).value.clone();
        self.data.error = self.data.apply(included, reason).err();
        cx.notify();
    }

    pub(super) fn data_page(&mut self, cx: &mut Context<Self>) -> gpui::AnyElement {
        let heading = data_heading();
        let Some(source) = self.data.source.as_ref() else {
            return heading.child(empty_source_card()).into_any_element();
        };
        if self.data.sources_open {
            return heading
                .child(Self::source_panel(source, cx))
                .into_any_element();
        }

        let effective = self.data.effective_laps();
        let (table, pager) = self.lap_table(source, &effective, cx);
        let data_error = self
            .data
            .error
            .clone()
            .or_else(|| effective.as_ref().err().cloned());
        heading
            .child(
                div()
                    .flex()
                    .w_full()
                    .min_w_0()
                    .gap(px(orbit::RADIUS_CONTROL))
                    .child(
                        orbit::card("")
                            .flex_1()
                            .min_w_0()
                            .child(
                                orbit::card_body()
                                    .w_full()
                                    .gap(px(orbit::RADIUS_CONTROL))
                                    .child(orbit::eyebrow("Sesión en revisión"))
                                    .child(
                                        div()
                                            .flex()
                                            .w_full()
                                            .items_center()
                                            .justify_between()
                                            .gap(px(orbit::RADIUS_CONTROL))
                                            .child(orbit::text(
                                                self.data
                                                    .label
                                                    .as_deref()
                                                    .unwrap_or(&source.base.session_id),
                                                13.0,
                                                600,
                                                orbit::INK_2,
                                            ))
                                            .child(self.sources_button(cx)),
                                    )
                                    .child(
                                        div()
                                            .flex()
                                            .w_full()
                                            .items_center()
                                            .justify_between()
                                            .gap(px(orbit::RADIUS_CONTROL))
                                            .child(orbit::text(
                                                "Observaciones de la sesión",
                                                18.0,
                                                600,
                                                orbit::INK,
                                            ))
                                            .child(self.advanced_button(cx)),
                                    )
                                    .child(self.family_tabs(cx))
                                    .child(orbit::text(
                                        "El uso se decide por familia. Una vuelta utilizable puede carecer de señales para calcular una métrica.",
                                        12.0,
                                        400,
                                        orbit::INK_3,
                                    ))
                                    .child(table)
                                    .child(pager)
                                    .child(self.advanced_panel(source))
                                    .when_some(data_error, |body, error| {
                                        body.child(orbit::callout(error))
                                    }),
                            ),
                    )
                    .child(self.observation_panel(source, &effective, cx)),
            )
            .into_any_element()
    }

    fn family_tabs(&self, cx: &mut Context<Self>) -> gpui::AnyElement {
        let mut tabs = div()
            .flex()
            .w_full()
            .border_b_1()
            .border_color(rgba(orbit::LINE_ROW));
        for (index, family) in FAMILIES.into_iter().enumerate() {
            let selected = self.data.family == family;
            tabs = tabs.child(
                div()
                    .flex_1()
                    .min_w_0()
                    .flex()
                    .justify_center()
                    .border_b_2()
                    .border_color(if selected {
                        orbit::tint(orbit::CARMINE, 1.0)
                    } else {
                        orbit::tint(orbit::INK_3, 0.35)
                    })
                    .child(
                        div()
                            .id(("strategy-data-family", index))
                            .role(gpui::Role::Button)
                            .tab_index(0)
                            .w_full()
                            .h(px(42.0))
                            .flex()
                            .items_center()
                            .justify_center()
                            .cursor_pointer()
                            .child(orbit::text(
                                family_label(family),
                                13.0,
                                if selected { 650 } else { 400 },
                                if selected { orbit::INK } else { orbit::INK_2 },
                            ))
                            .on_click(cx.listener(move |this, _, _, cx| {
                                this.data.select_family(family);
                                cx.notify();
                            })),
                    ),
            );
        }
        tabs.into_any_element()
    }

    fn lap_table(
        &self,
        source: &CorrectionSource,
        effective: &Result<Vec<ValidityLap>, String>,
        cx: &mut Context<Self>,
    ) -> (gpui::AnyElement, gpui::AnyElement) {
        let mut table = div().flex().flex_col().rounded(px(orbit::RADIUS_CONTROL));
        table = table.child(table_row(
            &[
                "Vuelta",
                "Tiempo registrado",
                "Automático",
                "Revisión actual",
                "Propuesta",
            ],
            true,
        ));
        let range = self.data.visible_range();
        if let Ok(laps) = effective {
            for index in range.clone() {
                let Some(original) = source.validity.laps.get(index) else {
                    continue;
                };
                let Some(reviewed) = laps.get(index) else {
                    continue;
                };
                let automatic = use_for(original, self.data.family);
                let current = use_for(reviewed, self.data.family);
                let proposal =
                    self.data
                        .correction_for(original)
                        .map_or("Automático", |correction| {
                            if correction.request.included {
                                "Incluida"
                            } else {
                                "Excluida"
                            }
                        });
                let selected = self.data.selected_lap == Some(index);
                table = table.child(
                    table_row(
                        &[
                            &format!("Vuelta {}", original.number),
                            "Sin dato",
                            use_label(automatic),
                            use_label(current),
                            proposal,
                        ],
                        false,
                    )
                    .id(("strategy-observation", index))
                    .when(selected, |row| row.bg(orbit::tint(orbit::CARMINE, 0.08)))
                    .hover(|row| row.bg(orbit::tint(orbit::CARMINE, 0.05)))
                    .on_click(cx.listener(move |this, _, _, cx| {
                        this.data.selected_lap = Some(index);
                        this.data.error = None;
                        cx.notify();
                    })),
                );
            }
        }

        let total_pages = self.data.page_count();
        let pager = div()
            .flex()
            .items_center()
            .justify_between()
            .child(
                orbit::button("strategy-data-previous", "Anterior")
                    .when(self.data.page == 0, |button| {
                        button.opacity(orbit::DISABLED)
                    })
                    .on_click(cx.listener(|this, _, _, cx| {
                        this.data.change_page(this.data.page.saturating_sub(1));
                        cx.notify();
                    })),
            )
            .child(orbit::text(
                page_label(&range, source.validity.laps.len()),
                12.0,
                400,
                orbit::INK_3,
            ))
            .child(
                orbit::button("strategy-data-next", "Siguiente")
                    .when(self.data.page.saturating_add(1) >= total_pages, |button| {
                        button.opacity(orbit::DISABLED)
                    })
                    .on_click(cx.listener(move |this, _, _, cx| {
                        this.data.change_page(this.data.page.saturating_add(1));
                        cx.notify();
                    })),
            );
        (table.into_any_element(), pager.into_any_element())
    }

    fn observation_panel(
        &self,
        source: &CorrectionSource,
        effective: &Result<Vec<ValidityLap>, String>,
        cx: &mut Context<Self>,
    ) -> gpui::AnyElement {
        let mut rows = div().flex().flex_col().gap(px(orbit::RADIUS_CONTROL));
        if let Some(index) = self.data.selected_lap {
            if let (Some(original), Ok(laps)) = (source.validity.laps.get(index), effective) {
                let automatic = use_for(original, self.data.family);
                let current = laps
                    .get(index)
                    .and_then(|lap| use_for(lap, self.data.family));
                let reason = self
                    .data
                    .correction_for(original)
                    .map_or("Sin corrección activa", |correction| {
                        correction.request.reason.as_str()
                    });
                rows = rows
                    .child(orbit::text(
                        format!(
                            "Vuelta {} · {}",
                            original.number,
                            family_label(self.data.family)
                        ),
                        14.0,
                        700,
                        orbit::INK,
                    ))
                    .child(orbit::setting_row(
                        "Uso automático",
                        "Decisión original de Analysis",
                        orbit::text(use_label(automatic), 13.0, 600, orbit::INK_2),
                    ))
                    .child(orbit::setting_row(
                        "Revisión actual",
                        "Corrección validada para esta sesión",
                        orbit::text(use_label(current), 13.0, 600, orbit::INK_2),
                    ))
                    .child(orbit::setting_row(
                        "Motivo actual",
                        "Razón asociada a la corrección preparada",
                        orbit::text(reason, 12.0, 400, orbit::INK_2),
                    ))
                    .child(self.correction_controls(automatic, cx));
            }
        } else {
            rows = rows
                .h(px(280.0))
                .justify_center()
                .items_center()
                .child(orbit::text(
                    "Selecciona una vuelta para revisar su uso en esta familia.",
                    13.0,
                    400,
                    orbit::INK_2,
                ));
        }
        orbit::card("Revisar observación")
            .w(px(290.0))
            .flex_none()
            .child(
                orbit::card_body()
                    .gap(px(orbit::RADIUS_CONTROL))
                    .child(rows),
            )
            .into_any_element()
    }

    fn correction_controls(
        &self,
        automatic: Option<&FamilyUse>,
        cx: &mut Context<Self>,
    ) -> gpui::AnyElement {
        if automatic.is_none() {
            return orbit::callout(
                "Analysis no ofrece un registro para esta familia en esta vuelta.",
            )
            .into_any_element();
        }
        div()
            .flex()
            .flex_col()
            .gap(px(orbit::RADIUS_CONTROL))
            .child(orbit::text(
                "Motivo de la corrección",
                12.0,
                650,
                orbit::INK_2,
            ))
            .child(self.correction_reason.clone())
            .child(
                div()
                    .flex()
                    .gap(px(orbit::RADIUS_CONTROL))
                    .child(orbit::button("strategy-data-exclude", "Excluir").on_click(
                        cx.listener(|this, _, _, cx| this.apply_data_correction(false, cx)),
                    ))
                    .child(orbit::button("strategy-data-include", "Incluir").on_click(
                        cx.listener(|this, _, _, cx| this.apply_data_correction(true, cx)),
                    )),
            )
            .into_any_element()
    }

    fn advanced_panel(&self, source: &CorrectionSource) -> gpui::AnyElement {
        if !self.data.advanced {
            return orbit::card_body().into_any_element();
        }
        let revisions = self
            .data
            .selected_revisions
            .iter()
            .map(|revision| {
                orbit::setting_row(
                    &revision.session_id,
                    &format!(
                        "base {} · snapshot {}",
                        short_digest(&revision.base_digest),
                        short_digest(&revision.snapshot_id)
                    ),
                    orbit::mono_text(short_digest(&revision.revision_id), 11.0, orbit::INK_2),
                )
            })
            .collect::<Vec<_>>();
        let temporal = source
            .validity
            .temporal
            .segments
            .as_ref()
            .map_or(0, Vec::len);
        orbit::card("Modo avanzado")
            .child(
                orbit::card_body()
                    .gap(px(orbit::RADIUS_CONTROL))
                    .child(orbit::setting_row(
                        "Fuente",
                        &format!(
                            "{} · sha256 {} · {} bytes",
                            source.base.session_id,
                            short_digest(&source.base.content_sha256),
                            source.base.size_bytes,
                        ),
                        orbit::text(source.base.parser_id.clone(), 12.0, 600, orbit::INK_2),
                    ))
                    .child(orbit::setting_row(
                        "Parser y esquema",
                        &format!(
                            "{} · schema {}",
                            source.base.parser_version,
                            short_digest(&source.base.schema_fingerprint)
                        ),
                        orbit::text(
                            source.base.analysis_version.clone(),
                            12.0,
                            600,
                            orbit::INK_2,
                        ),
                    ))
                    .child(orbit::setting_row(
                        "Interpretación",
                        &format!(
                            "{} · {} segmentos temporales",
                            source.validity.computation_version, temporal
                        ),
                        orbit::mono_text(
                            short_digest(&source.base.segmentation_digest),
                            11.0,
                            orbit::INK_2,
                        ),
                    ))
                    .children(revisions),
            )
            .into_any_element()
    }

    fn source_panel(source: &CorrectionSource, cx: &mut Context<Strategy>) -> gpui::AnyElement {
        orbit::card("Fuente validada")
            .w_full()
            .min_w_0()
            .child(
                orbit::card_body()
                    .gap(px(orbit::RADIUS_CONTROL))
                    .child(orbit::setting_row(
                        "Sesión de Analysis",
                        &source.base.session_id,
                        orbit::mono_text(
                            short_digest(&source.base.segmentation_digest),
                            11.0,
                            orbit::INK_2,
                        ),
                    ))
                    .child(orbit::setting_row(
                        "Revisión exacta",
                        "Identidad usada para validar la fuente",
                        orbit::mono_text(
                            short_digest(&source.revision.revision_id),
                            11.0,
                            orbit::INK_2,
                        ),
                    ))
                    .child(orbit::setting_row(
                        "Contenido",
                        &format!(
                            "SHA-256 {} · {} bytes",
                            short_digest(&source.base.content_sha256),
                            source.base.size_bytes
                        ),
                        orbit::text("Íntegro", 12.0, 600, orbit::INK_2),
                    ))
                    .child(orbit::setting_row(
                        "Parser",
                        &format!(
                            "{} · versión {}",
                            source.base.parser_id, source.base.parser_version
                        ),
                        orbit::text(
                            source.base.analysis_version.clone(),
                            12.0,
                            600,
                            orbit::INK_2,
                        ),
                    ))
                    .child(
                        orbit::button("strategy-data-source-back", "Volver a observaciones")
                            .on_click(cx.listener(|this, _, _, cx| {
                                this.data.sources_open = false;
                                cx.notify();
                            })),
                    ),
            )
            .into_any_element()
    }

    fn advanced_button(&self, cx: &mut Context<Self>) -> gpui::AnyElement {
        orbit::button(
            "strategy-data-advanced",
            if self.data.advanced {
                "Ocultar modo avanzado"
            } else {
                "Modo avanzado"
            },
        )
        .on_click(cx.listener(|this, _, _, cx| {
            this.data.advanced = !this.data.advanced;
            cx.notify();
        }))
        .into_any_element()
    }

    fn sources_button(&self, cx: &mut Context<Self>) -> gpui::AnyElement {
        orbit::button(
            "strategy-data-sources",
            if self.data.sources_open {
                "Volver a observaciones"
            } else {
                "Revisar fuentes"
            },
        )
        .on_click(cx.listener(|this, _, _, cx| {
            this.data.sources_open = !this.data.sources_open;
            cx.notify();
        }))
        .into_any_element()
    }
}

fn data_heading() -> gpui::Stateful<gpui::Div> {
    div()
        .id("strategy-data")
        .flex()
        .flex_col()
        .w_full()
        .min_w_0()
        .gap(px(orbit::RADIUS_CONTROL))
        .child(orbit::eyebrow("Datos"))
        .child(orbit::text(
            "Revisa tus datos de telemetría",
            34.0,
            600,
            orbit::INK,
        ))
        .child(orbit::text(
            "Comprueba las observaciones registradas y registra el motivo de cada corrección.",
            14.0,
            400,
            orbit::INK_2,
        ))
}

fn empty_source_card() -> gpui::AnyElement {
    orbit::card("")
        .w_full()
        .child(
            orbit::card_body()
                .w_full()
                .gap(px(orbit::RADIUS_CONTROL))
                .child(orbit::eyebrow("Sesión en revisión"))
                .child(
                    div()
                        .flex()
                        .w_full()
                        .items_center()
                        .justify_between()
                        .gap(px(orbit::RADIUS_CONTROL))
                        .child(orbit::text("Seleccionar…", 13.0, 500, orbit::INK_3))
                        .child(
                            orbit::button("strategy-data-sources-empty", "Revisar fuentes")
                                .opacity(orbit::DISABLED),
                        ),
                )
                .child(orbit::text(
                    "Observaciones de la sesión",
                    18.0,
                    600,
                    orbit::INK,
                ))
                .child(
                    div()
                        .w_full()
                        .h(px(300.0))
                        .flex()
                        .flex_col()
                        .justify_center()
                        .items_center()
                        .gap(px(orbit::RADIUS_CONTROL))
                        .child(orbit::text("⌁", 28.0, 700, orbit::INK_3))
                        .child(orbit::text(
                            "Elige una sesión para revisar",
                            16.0,
                            700,
                            orbit::INK,
                        ))
                        .child(orbit::text(
                            "Abre y selecciona tus archivos en la biblioteca. No se leen automáticamente al entrar aquí.",
                            13.0,
                            400,
                            orbit::INK_2,
                        )),
                ),
        )
        .into_any_element()
}

fn table_row(cells: &[&str], header: bool) -> Div {
    let mut row = div()
        .flex()
        .items_center()
        .min_h(px(if header { 42.0 } else { 44.0 }))
        .px(px(12.0))
        .border_b_1()
        .border_color(rgba(orbit::LINE_ROW));
    for (index, cell) in cells.iter().enumerate() {
        row = row.child(
            orbit::text(
                (*cell).to_owned(),
                if header { 11.5 } else { 12.0 },
                if header { 500 } else { 600 },
                if header { orbit::INK_3 } else { orbit::INK_2 },
            )
            .flex_1()
            .min_w_0()
            .when(index == 0, gpui::Styled::flex_1),
        );
    }
    row
}

fn use_for(lap: &ValidityLap, family: CorrectionFamily) -> Option<&FamilyUse> {
    lap.family_use.iter().find(|item| item.family == family)
}

fn use_label(value: Option<&FamilyUse>) -> &'static str {
    match value {
        Some(item) if item.included => "Incluida",
        Some(_) => "Excluida",
        None => "Sin dato",
    }
}

fn family_label(family: CorrectionFamily) -> &'static str {
    match family {
        CorrectionFamily::FuelConsumption => "Combustible",
        CorrectionFamily::VirtualEnergyConsumption => "Energía virtual",
        CorrectionFamily::CombinedStintPaceCurve => "Ritmo",
        CorrectionFamily::TyreDegradation => "Neumáticos",
        CorrectionFamily::SavingCost => "Ahorro",
    }
}

fn short_digest(value: &str) -> &str {
    value.get(..12).unwrap_or(value)
}

fn page_range(len: usize, page: usize) -> std::ops::Range<usize> {
    let start = page.saturating_mul(PAGE_SIZE).min(len);
    start..start.saturating_add(PAGE_SIZE).min(len)
}

fn page_label(range: &std::ops::Range<usize>, total: usize) -> String {
    if range.is_empty() {
        return format!("0 / {total}");
    }
    format!("{}–{} / {total}", range.start + 1, range.end)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lap_pages_are_bounded_and_empty_sources_have_no_pages() {
        let mut state = State::default();
        assert_eq!(state.page_count(), 0);
        assert_eq!(state.visible_range(), 0..0);
        state.page = 8;
        state.change_page(9);
        assert_eq!(state.page, 0);
        assert_eq!(page_range(12, 0), 0..5);
        assert_eq!(page_range(12, 2), 10..12);
        assert_eq!(page_range(12, 20), 12..12);
        assert_eq!(page_label(&(0..0), 0), "0 / 0");
        assert_eq!(page_label(&(5..10), 12), "6–10 / 12");
        assert_eq!(page_label(&(12..12), 12), "0 / 12");
    }

    #[test]
    fn demo_source_passes_native_revision_and_correction_validation() {
        let demo = crate::demo::strategy_review_demo().expect("fuente demo válida");
        let selected = vec![demo.source.revision.clone()];
        let mut state = State::default();
        state
            .load(demo.label, demo.source, selected, &[])
            .expect("fuente y revisión exactas");
        assert_eq!(state.page_count(), 5);
        state.set_capture_view(0, Some(0), true, false);
        assert_eq!(state.visible_range(), 0..5);
        assert_eq!(state.selected_lap, Some(0));
        assert!(state.advanced);
        assert!(!state.sources_open);
    }

    #[test]
    fn sources_panel_uses_a_loaded_and_validated_source() {
        let demo = crate::demo::strategy_review_demo().expect("fuente demo válida");
        let selected = vec![demo.source.revision.clone()];
        let mut state = State::default();
        state
            .load(demo.label, demo.source, selected, &[])
            .expect("fuente y revisión exactas");
        state.set_capture_view(0, None, false, true);
        assert!(state.sources_open);
        assert_eq!(state.page_count(), 5);
    }

    #[test]
    fn observation_families_keep_the_product_labels() {
        assert_eq!(
            FAMILIES.map(family_label),
            [
                "Combustible",
                "Energía virtual",
                "Ritmo",
                "Neumáticos",
                "Ahorro"
            ]
        );
    }

    #[test]
    fn empty_reason_cannot_create_a_family_correction() {
        let mut state = State::default();
        assert_eq!(
            state
                .apply(true, "  ".into())
                .expect_err("reason is required"),
            "correction_reason_required"
        );
    }
}
